import {
  doc,
  collection,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { normalizePhone, phoneLockId } from "@/utils/phone";
import type { LeadStatus, NumberLock, NumberLockTimelineEntry } from "@/types";

/**
 * Global per-number lock / reservation system.
 *
 * One doc per real phone number lives in the `numberLocks` collection (doc id = digits-only phone).
 * It reserves a number to whoever added it for 24h, allows takeover afterwards (freezing the
 * previous owner's lead), and freezes a sold client for 1–7 days so no other member can poach it.
 *
 * All claim/freeze writes go through Firestore transactions so two members can never grab the
 * same number at the same instant.
 */

const RESERVE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const DAY_MS = 24 * 60 * 60 * 1000;

interface LockActor {
  uid: string;
  name: string;
}

/** Clamp a requested freeze length to the allowed 1–7 day range. */
export function clampFreezeDays(days: number): number {
  return Math.min(7, Math.max(1, Math.round(days || 1)));
}

/**
 * Fields mirrored onto the seller's lead doc when a sale-freeze is applied. The canonical lock
 * still lives in `numberLocks` (and is what blocks other members), but mirroring lets the member's
 * own list and the admin Frozen Numbers tab render a live countdown straight from `leads`.
 */
export function buildLeadFreezeFields(days: number, byName: string) {
  const clampedDays = clampFreezeDays(days);
  const nowTs = Timestamp.now();
  return {
    saleFrozen: true,
    saleFrozenAt: nowTs,
    saleFrozenUntil: Timestamp.fromMillis(Date.now() + clampedDays * DAY_MS),
    saleFrozenDays: clampedDays,
    saleFrozenByName: byName,
  };
}

/** Fields to write on a lead when a sale-freeze is cleared / released. */
export function clearedLeadFreezeFields() {
  return {
    saleFrozen: false,
    saleFrozenUntil: null,
    saleFrozenDays: null,
    saleFrozenByName: null,
  };
}

export type ClaimResult =
  | { kind: "created"; leadId: string }
  | { kind: "takeover"; leadId: string; previousOwnerName: string }
  | { kind: "reserved"; ownerName: string; until: Date }
  | { kind: "sale_frozen"; saleByName: string; until: Date }
  | { kind: "already_yours" };

type TimestampLike = { toMillis?: () => number; seconds?: number } | null | undefined;

function toMillis(ts: TimestampLike): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/** Standard lead document shape for a member-created custom lead. */
function buildLeadData(user: LockActor, normalized: string, displayName?: string) {
  return {
    assignedTo: user.uid,
    assignedBy: user.uid,
    phone: normalized,
    displayName: displayName?.trim() || normalized,
    realName: null,
    status: "answered" as LeadStatus,
    notes: "",
    saleDone: false,
    saleDetails: null,
    saleItems: [],
    isCustomEntry: true,
    frozen: false,
    lastUpdated: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
}

/**
 * Attempt to claim a phone number for `user` and create their lead atomically.
 * Returns a typed result the caller turns into the appropriate toast.
 */
export async function claimNumber({
  user,
  phone,
  displayName,
}: {
  user: LockActor;
  phone: string;
  displayName?: string;
}): Promise<ClaimResult> {
  const normalized = normalizePhone(phone);
  const lockRef = doc(db, "numberLocks", phoneLockId(phone));
  const newLeadRef = doc(collection(db, "leads")); // pre-generate id so we can store it on the lock

  return runTransaction<ClaimResult>(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const now = Date.now();
    const nowTs = Timestamp.now();
    const reserveExpiresAt = Timestamp.fromMillis(now + RESERVE_WINDOW_MS);

    // ── Number is free → create lock + lead ──
    if (!lockSnap.exists()) {
      tx.set(newLeadRef, buildLeadData(user, normalized, displayName));
      tx.set(lockRef, {
        phone: normalized,
        ownerId: user.uid,
        ownerName: user.name,
        ownerLeadId: newLeadRef.id,
        claimedAt: nowTs,
        reserveExpiresAt,
        saleFrozen: false,
        saleFrozenUntil: null,
        saleById: null,
        saleByName: null,
        timeline: [{ action: "claimed", byId: user.uid, byName: user.name, at: nowTs }],
        updatedAt: nowTs,
      } as NumberLock);
      return { kind: "created", leadId: newLeadRef.id };
    }

    const lock = lockSnap.data() as NumberLock;

    // ── Sold & still frozen → blocked for everyone ──
    const frozenUntilMs = toMillis(lock.saleFrozenUntil);
    if (lock.saleFrozen && frozenUntilMs > now) {
      return {
        kind: "sale_frozen",
        saleByName: lock.saleByName || lock.ownerName,
        until: new Date(frozenUntilMs),
      };
    }

    // ── Already owned by the same member ──
    if (lock.ownerId === user.uid) {
      return { kind: "already_yours" };
    }

    // ── Still inside the 24h reservation held by another member ──
    const reserveMs = toMillis(lock.reserveExpiresAt);
    if (reserveMs > now) {
      return { kind: "reserved", ownerName: lock.ownerName, until: new Date(reserveMs) };
    }

    // ── Past 24h (and not frozen) → takeover ──
    // Read the previous owner's lead before any writes so we can freeze it safely.
    let prevLeadExists = false;
    if (lock.ownerLeadId) {
      const prevSnap = await tx.get(doc(db, "leads", lock.ownerLeadId));
      prevLeadExists = prevSnap.exists();
    }

    if (prevLeadExists) {
      tx.update(doc(db, "leads", lock.ownerLeadId), {
        frozen: true,
        frozenAt: nowTs,
        frozenReason: "taken_over",
        takenOverBy: user.name,
        lastUpdated: serverTimestamp(),
      });
    }

    tx.set(newLeadRef, buildLeadData(user, normalized, displayName));
    tx.set(lockRef, {
      phone: normalized,
      ownerId: user.uid,
      ownerName: user.name,
      ownerLeadId: newLeadRef.id,
      claimedAt: nowTs,
      reserveExpiresAt,
      saleFrozen: false,
      saleFrozenUntil: null,
      saleById: null,
      saleByName: null,
      timeline: [
        ...(lock.timeline || []),
        {
          action: "taken_over",
          byId: user.uid,
          byName: user.name,
          at: nowTs,
          note: `Taken over from ${lock.ownerName}`,
        } as NumberLockTimelineEntry,
      ],
      updatedAt: nowTs,
    } as NumberLock);

    return { kind: "takeover", leadId: newLeadRef.id, previousOwnerName: lock.ownerName };
  });
}

export type AdminAssignResult =
  | { kind: "created"; leadId: string }
  | { kind: "takeover"; leadId: string; previousOwnerName: string }
  | { kind: "reserved"; ownerName: string; until: Date }
  | { kind: "sale_frozen"; saleByName: string; until: Date }
  | { kind: "already_with_member" };

/**
 * Admin-side counterpart of claimNumber: assign a number to a member atomically, respecting the
 * same lock rules. If another member holds the number inside its 24h validity (or it's
 * sale-frozen), the assignment is refused — so neither members nor admins can create duplicates.
 * Past the validity window it becomes a takeover, freezing the previous holder's lead.
 */
export async function adminAssignNumber({
  admin,
  member,
  phone,
  displayName,
}: {
  admin: LockActor;
  member: LockActor;
  phone: string;
  displayName: string;
}): Promise<AdminAssignResult> {
  const normalized = normalizePhone(phone);
  const lockRef = doc(db, "numberLocks", phoneLockId(phone));
  const newLeadRef = doc(collection(db, "leads"));

  const adminLeadData = {
    assignedTo: member.uid,
    assignedBy: admin.uid,
    phone: normalized,
    displayName,
    realName: null,
    status: "not_called" as LeadStatus,
    notes: "",
    saleDone: false,
    saleDetails: null,
    saleItems: [],
    isCustomEntry: false,
    frozen: false,
    lastUpdated: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  return runTransaction<AdminAssignResult>(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const now = Date.now();
    const nowTs = Timestamp.now();
    const reserveExpiresAt = Timestamp.fromMillis(now + RESERVE_WINDOW_MS);

    const newLock = (timeline: NumberLockTimelineEntry[]): NumberLock => ({
      phone: normalized,
      ownerId: member.uid,
      ownerName: member.name,
      ownerLeadId: newLeadRef.id,
      claimedAt: nowTs,
      reserveExpiresAt,
      saleFrozen: false,
      saleFrozenUntil: null,
      saleById: null,
      saleByName: null,
      timeline,
      updatedAt: nowTs,
    });

    if (!lockSnap.exists()) {
      tx.set(newLeadRef, adminLeadData);
      tx.set(lockRef, newLock([
        { action: "claimed", byId: member.uid, byName: member.name, at: nowTs, note: `Assigned by ${admin.name}` },
      ]));
      return { kind: "created", leadId: newLeadRef.id };
    }

    const lock = lockSnap.data() as NumberLock;

    const frozenUntilMs = toMillis(lock.saleFrozenUntil);
    if (lock.saleFrozen && frozenUntilMs > now) {
      return { kind: "sale_frozen", saleByName: lock.saleByName || lock.ownerName, until: new Date(frozenUntilMs) };
    }
    if (lock.ownerId === member.uid) {
      return { kind: "already_with_member" };
    }
    const reserveMs = toMillis(lock.reserveExpiresAt);
    if (reserveMs > now) {
      return { kind: "reserved", ownerName: lock.ownerName, until: new Date(reserveMs) };
    }

    // Past validity → takeover (freeze the previous owner's lead first)
    let prevLeadExists = false;
    if (lock.ownerLeadId) {
      const prevSnap = await tx.get(doc(db, "leads", lock.ownerLeadId));
      prevLeadExists = prevSnap.exists();
    }
    if (prevLeadExists) {
      tx.update(doc(db, "leads", lock.ownerLeadId), {
        frozen: true,
        frozenAt: nowTs,
        frozenReason: "taken_over",
        takenOverBy: member.name,
        lastUpdated: serverTimestamp(),
      });
    }
    tx.set(newLeadRef, adminLeadData);
    tx.set(lockRef, newLock([
      ...(lock.timeline || []),
      {
        action: "taken_over",
        byId: member.uid,
        byName: member.name,
        at: nowTs,
        note: `Reassigned by ${admin.name} from ${lock.ownerName}`,
      } as NumberLockTimelineEntry,
    ]));
    return { kind: "takeover", leadId: newLeadRef.id, previousOwnerName: lock.ownerName };
  });
}

/**
 * Move a number-lock's ownership to a new member when an admin reassigns the lead doc itself
 * (the lead id stays the same). Best-effort: a missing lock or one tracking a different lead
 * is left untouched.
 */
export async function transferLockOwnership({
  phone,
  leadId,
  newOwner,
}: {
  phone: string;
  leadId: string;
  newOwner: LockActor;
}): Promise<void> {
  const lockRef = doc(db, "numberLocks", phoneLockId(phone));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists()) return;
    const lock = snap.data() as NumberLock;
    if (lock.ownerLeadId !== leadId) return;
    tx.update(lockRef, { ownerId: newOwner.uid, ownerName: newOwner.name, updatedAt: Timestamp.now() });
  });
}

/**
 * Freeze a number after a sale so no other member can claim it for `days` (1–7) days.
 * Creates the lock if one does not exist yet (e.g. the sold lead was admin-assigned).
 */
export async function applySaleFreeze({
  user,
  phone,
  days,
  leadId,
}: {
  user: LockActor;
  phone: string;
  days: number;
  leadId?: string;
}): Promise<void> {
  const normalized = normalizePhone(phone);
  const lockRef = doc(db, "numberLocks", phoneLockId(phone));
  const clampedDays = clampFreezeDays(days);

  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const now = Date.now();
    const nowTs = Timestamp.now();
    const saleFrozenUntil = Timestamp.fromMillis(now + clampedDays * DAY_MS);
    const soldEntry: NumberLockTimelineEntry = {
      action: "sold",
      byId: user.uid,
      byName: user.name,
      at: nowTs,
      freezeDays: clampedDays,
    };

    if (!lockSnap.exists()) {
      tx.set(lockRef, {
        phone: normalized,
        ownerId: user.uid,
        ownerName: user.name,
        ownerLeadId: leadId || "",
        claimedAt: nowTs,
        reserveExpiresAt: Timestamp.fromMillis(now + RESERVE_WINDOW_MS),
        saleFrozen: true,
        saleFrozenUntil,
        saleById: user.uid,
        saleByName: user.name,
        timeline: [
          { action: "claimed", byId: user.uid, byName: user.name, at: nowTs, note: "Auto-created from sale" },
          soldEntry,
        ],
        updatedAt: nowTs,
      } as NumberLock);
      return;
    }

    const lock = lockSnap.data() as NumberLock;
    tx.update(lockRef, {
      saleFrozen: true,
      saleFrozenUntil,
      saleById: user.uid,
      saleByName: user.name,
      timeline: [...(lock.timeline || []), soldEntry],
      updatedAt: nowTs,
    });
  });
}

/**
 * Release the lock when a member deletes their own custom lead, so the number can be
 * re-added immediately (by them or anyone). Only releases if this member is still the
 * current owner of the lock AND it points to the lead being deleted — so deleting a
 * lead that was already taken over by someone else leaves the new owner's lock intact.
 */
export async function releaseLockForLead({
  user,
  phone,
  leadId,
}: {
  user: LockActor;
  phone: string;
  leadId: string;
}): Promise<void> {
  const lockRef = doc(db, "numberLocks", phoneLockId(phone));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists()) return;
    const lock = snap.data() as NumberLock;
    if (lock.ownerId !== user.uid) return; // taken over by someone else — don't touch
    if (lock.ownerLeadId && leadId && lock.ownerLeadId !== leadId) return; // not this member's active lead
    tx.delete(lockRef);
  });
}

/** One-off read of a number's lock (for the timeline popover). */
export async function fetchNumberLock(phone: string): Promise<NumberLock | null> {
  const snap = await getDoc(doc(db, "numberLocks", phoneLockId(phone)));
  return snap.exists() ? (snap.data() as NumberLock) : null;
}

/**
 * Admin override: clear any active sale-freeze and make the number immediately claimable again.
 * Only sales_admin / main_admin should call this (gated in the UI).
 */
export async function adminReleaseLock({
  admin,
  phone,
}: {
  admin: LockActor;
  phone: string;
}): Promise<void> {
  const lockRef = doc(db, "numberLocks", phoneLockId(phone));
  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (!lockSnap.exists()) return;
    const lock = lockSnap.data() as NumberLock;
    const nowTs = Timestamp.now();
    tx.update(lockRef, {
      saleFrozen: false,
      saleFrozenUntil: null,
      saleById: null,
      saleByName: null,
      reserveExpiresAt: nowTs, // immediately claimable by anyone
      timeline: [
        ...(lock.timeline || []),
        { action: "admin_override", byId: admin.uid, byName: admin.name, at: nowTs, note: "Lock released by admin" },
      ],
      updatedAt: nowTs,
    });
  });
}
