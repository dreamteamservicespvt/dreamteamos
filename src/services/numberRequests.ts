/**
 * Number requests — asking a colleague for a number they hold (owner, 2026-10-19).
 *
 * ── Why ──────────────────────────────────────────────────────────────────────────────────────────
 * A member typing a number she knows — her own custom lead, a client who called her — was told it was
 * "with another member", with no name and nothing she could do. Now the screen names the member holding it
 * and she can ask for it. The holder gives it, or the sales admin; a SOLD number only the sales admin (see
 * utils/numberRequest). Approving moves the number in ONE transaction — the requester's hidden lead reopens
 * (notes and history intact) or a new lead is made, the holder's lead is closed ("transferred", its sales
 * kept on it), and the number's lock moves — so the two members can never both hold it, nor neither.
 *
 * ── Read quota ───────────────────────────────────────────────────────────────────────────────────
 * The holder lookup is one `leads where phone ==` query plus one `users` read, on demand (a search hit, a
 * blocked add), cached a minute. The lists are scoped listeners: the requester's own requests, the
 * requests made TO a holder (pending), and a sales admin's team (pending).
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where,
} from "firebase/firestore";
import type { Transaction } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { buildLeadData } from "@/services/numberLock";
import { normalizePhone, phoneLockId } from "@/utils/phone";
import { leadHasSale, mayDecideNumberRequest, numberRequestId } from "@/utils/numberRequest";
import type { Lead, NumberLock, NumberLockTimelineEntry, NumberRequest, UserRole } from "@/types";

const RESERVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface NumberHolder {
  leadId: string;
  uid: string;
  name: string;
  hasSale: boolean;
  salesAdminId: string | null;
  displayName: string;
}

export interface NumberHolding {
  /** The ACTIVE colleague holding the number, or null. */
  holder: NumberHolder | null;
  /**
   * Live leads on the number whose member has LEFT — their `users` document deleted, or switched off
   * (`isActive === false`). Such a lead still blocked the number, and nobody could give it: no name, no
   * sales admin to ask (found live 2026-10-19 — Kusuma's 9885719740 sat with a deleted member's lead "C39").
   * They hold nothing: the number goes to whoever asks, and these leads are closed.
   */
  leftLeadIds: string[];
}

const holderCache = new Map<string, { at: number; holding: NumberHolding }>();
export function __resetNumberHolderCacheForTests() { holderCache.clear(); }

/**
 * Who holds this number now — the live (not frozen) leads on it that are not `excludeUid`'s, split into the
 * active colleague to ask (a sold lead first: the seller is the person to ask; else the earliest) and leads
 * of members who have left. A failed `users` read counts as active (never free a number on a network error).
 */
export async function findNumberHolding(
  phone: string,
  excludeUid: string,
  opts: { fresh?: boolean } = {},
): Promise<NumberHolding> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { holder: null, leftLeadIds: [] };
  const key = `${normalized}|${excludeUid}`;
  const cached = holderCache.get(key);
  if (!opts.fresh && cached && Date.now() - cached.at < 60_000) return cached.holding;

  const snap = await getDocs(query(collection(db, "leads"), where("phone", "==", normalized)));
  const live = snap.docs
    .map((d) => ({ ...(d.data() as Lead), id: d.id }))
    .filter((l) => l.assignedTo && l.assignedTo !== excludeUid && !l.frozen);
  live.sort((a, b) =>
    (Number(leadHasSale(b)) - Number(leadHasSale(a))) || ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));

  const holding: NumberHolding = { holder: null, leftLeadIds: [] };
  const members = new Map<string, { gone: boolean; name: string; salesAdminId: string | null }>();
  for (const lead of live) {
    let m = members.get(lead.assignedTo);
    if (!m) {
      m = { gone: false, name: "another member", salesAdminId: null };
      try {
        const u = await getDoc(doc(db, "users", lead.assignedTo));
        if (!u.exists()) m.gone = true;
        else {
          const data = u.data() as { name?: string; createdBy?: string; isActive?: boolean };
          m.gone = data.isActive === false;
          m.name = data.name || m.name;
          m.salesAdminId = data.createdBy || null;
        }
      } catch { /* unreadable → treated as active, named generically */ }
      members.set(lead.assignedTo, m);
    }
    if (m.gone) { holding.leftLeadIds.push(lead.id); continue; }
    if (!holding.holder) {
      holding.holder = {
        leadId: lead.id, uid: lead.assignedTo, name: m.name, hasSale: leadHasSale(lead),
        salesAdminId: m.salesAdminId, displayName: lead.displayName || "",
      };
    }
  }
  holderCache.set(key, { at: Date.now(), holding });
  return holding;
}

/** The ACTIVE colleague holding this number (see findNumberHolding), or null. */
export async function findNumberHolder(phone: string, excludeUid: string, opts: { fresh?: boolean } = {}): Promise<NumberHolder | null> {
  return (await findNumberHolding(phone, excludeUid, opts)).holder;
}

/** The lock + leads writes that give a number to `to`, inside a transaction whose reads are done. */
function giveNumberInTx(tx: Transaction, p: {
  phone: string;
  to: { uid: string; name: string };
  /** The receiver's own lead to reopen; null / not theirs → a new lead. */
  toLead: { id: string; data: Lead | null } | null;
  /** The lead to close, if somebody holds it. */
  fromLead: { id: string } | null;
  fromName: string | null;
  lock: NumberLock | null;
  by: { uid: string; name: string };
  displayName?: string;
  note: string;
}): string {
  const nowTs = Timestamp.now();
  const now = Date.now();
  if (p.fromLead) {
    tx.update(doc(db, "leads", p.fromLead.id), {
      frozen: true,
      frozenAt: nowTs,
      frozenReason: "transferred",
      takenOverBy: p.to.name,
      lastUpdated: serverTimestamp(),
    });
  }
  let leadId: string;
  if (p.toLead?.data && p.toLead.data.assignedTo === p.to.uid) {
    leadId = p.toLead.id;
    tx.update(doc(db, "leads", leadId), {
      frozen: false,
      frozenAt: null,
      frozenReason: null,
      takenOverBy: null,
      lastUpdated: serverTimestamp(),
    });
  } else {
    const ref = doc(collection(db, "leads"));
    leadId = ref.id;
    tx.set(ref, buildLeadData(p.to, p.phone, p.displayName));
  }
  const entry: NumberLockTimelineEntry = { action: "transferred", byId: p.by.uid, byName: p.by.name, at: nowTs, note: p.note };
  tx.set(doc(db, "numberLocks", phoneLockId(p.phone)), {
    phone: p.phone,
    ownerId: p.to.uid,
    ownerName: p.to.name,
    ownerLeadId: leadId,
    claimedAt: nowTs,
    reserveExpiresAt: Timestamp.fromMillis(now + RESERVE_WINDOW_MS),
    saleFrozen: false,
    saleFrozenUntil: null,
    saleById: null,
    saleByName: null,
    timeline: [...(p.lock?.timeline || []), entry],
    updatedAt: nowTs,
  } as NumberLock);
  return leadId;
}

export type RequestNumberResult =
  | { kind: "requested"; holder: NumberHolder }
  | { kind: "already_pending"; holderName: string }
  /**
   * Nobody ACTIVE holds it: the number is the requester's at once — her hidden lead reopened (or a new lead
   * when only a departed member's lead stood in the way), departed members' leads closed, her own waiting
   * request on it closed.
   */
  | { kind: "reopened"; fromLeftMember: boolean }
  /** Nobody holds it and the requester has no lead on it: they can simply add it. */
  | { kind: "nobody" };

/** Ask for a number a colleague holds. Tells the holder, their sales admin and the requester's sales admin. */
export async function requestNumber(p: {
  requester: { uid: string; name: string; createdBy?: string | null };
  phone: string;
  /** The requester's own hidden (frozen) lead on this number, if any. */
  requesterLeadId: string | null;
}): Promise<RequestNumberResult> {
  const phone = normalizePhone(p.phone);
  const { holder, leftLeadIds } = await findNumberHolding(phone, p.requester.uid, { fresh: true });

  if (!holder) {
    if (!p.requesterLeadId && leftLeadIds.length === 0) return { kind: "nobody" };
    // Nobody to ask — the colleague's lead is closed or its member has left. The number comes to her by itself.
    const lockRef = doc(db, "numberLocks", phoneLockId(phone));
    const reqRef = doc(db, "number_requests", numberRequestId(phone, p.requester.uid));
    await runTransaction(db, async (tx) => {
      const leadSnap = p.requesterLeadId ? await tx.get(doc(db, "leads", p.requesterLeadId)) : null;
      const lockSnap = await tx.get(lockRef);
      const reqSnap = await tx.get(reqRef);
      const leftSnaps = [];
      for (const id of leftLeadIds) leftSnaps.push({ id, snap: await tx.get(doc(db, "leads", id)) });
      const lock = lockSnap.exists() ? (lockSnap.data() as NumberLock) : null;
      const lockByLeft = !!lock && leftSnaps.some((s) => (s.snap.data() as Lead | undefined)?.assignedTo === lock.ownerId);
      if (lock && lock.ownerId !== p.requester.uid && !lockByLeft && toMs(lock.reserveExpiresAt) > Date.now()) {
        throw new Error("Another member has just added this number.");
      }
      const stillLive = leftSnaps.filter((s) => s.snap.exists() && !(s.snap.data() as Lead).frozen);
      for (const s of stillLive.slice(1)) {
        tx.update(doc(db, "leads", s.id), {
          frozen: true, frozenAt: Timestamp.now(), frozenReason: "member_left", takenOverBy: p.requester.name, lastUpdated: serverTimestamp(),
        });
      }
      giveNumberInTx(tx, {
        phone, to: p.requester,
        toLead: p.requesterLeadId ? { id: p.requesterLeadId, data: leadSnap?.exists() ? (leadSnap.data() as Lead) : null } : null,
        fromLead: stillLive[0] ? { id: stillLive[0].id } : null,
        fromName: null, lock, by: p.requester,
        note: stillLive.length ? "Taken back — the member holding it has left" : "Reopened — nobody else held the number",
      });
      if (stillLive[0]) {
        // giveNumberInTx marks it "transferred"; this one was a departed member's.
        tx.update(doc(db, "leads", stillLive[0].id), { frozenReason: "member_left" });
      }
      if (reqSnap.exists() && (reqSnap.data() as NumberRequest).status === "pending") {
        tx.update(reqRef, {
          status: "approved", decidedAt: serverTimestamp(), decidedById: p.requester.uid,
          decidedByName: "Nobody active held it",
        });
      }
    });
    holderCache.clear();
    return { kind: "reopened", fromLeftMember: leftLeadIds.length > 0 };
  }

  const id = numberRequestId(phone, p.requester.uid);
  const ref = doc(db, "number_requests", id);
  const created = await runTransaction(db, async (tx) => {
    const prev = await tx.get(ref);
    if (prev.exists() && (prev.data() as NumberRequest).status === "pending") return false;
    tx.set(ref, {
      phone,
      requesterId: p.requester.uid,
      requesterName: p.requester.name,
      requesterLeadId: p.requesterLeadId,
      holderId: holder.uid,
      holderName: holder.name,
      holderLeadId: holder.leadId,
      holderHasSale: holder.hasSale,
      displayName: holder.displayName,
      salesAdminId: holder.salesAdminId,
      requesterAdminId: p.requester.createdBy || null,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    return true;
  });
  if (!created) return { kind: "already_pending", holderName: holder.name };

  const stamp = Date.now();
  const what = holder.displayName && holder.displayName !== phone ? `${phone} (${holder.displayName})` : phone;
  const tasks: Promise<void>[] = [
    sendNotification({
      userId: holder.uid,
      type: "number_request",
      title: "A number is requested",
      message: holder.hasSale
        ? `${p.requester.name} asks for ${what}. It has your sale on it, so the sales admin decides.`
        : `${p.requester.name} asks for ${what}. Give it or decline in My Leads.`,
      link: "/sales/leads",
      dedupeKey: `number_request_${id}_${stamp}_${holder.uid}`,
    }),
  ];
  // Both teams' sales admins (usually one person): the request is on their Leads Management either way.
  for (const adminId of new Set([holder.salesAdminId, p.requester.createdBy].filter((x): x is string => !!x))) {
    tasks.push(sendNotification({
      userId: adminId,
      type: "number_request",
      title: "Number request",
      message: `${p.requester.name} asks ${holder.name} for ${what}${holder.hasSale ? " — sold, your decision" : ""}.`,
      link: "/sales-admin/leads",
      dedupeKey: `number_request_${id}_${stamp}_${adminId}`,
    }));
  }
  await Promise.allSettled(tasks);
  return { kind: "requested", holder };
}

class RequestRefused extends Error {}

/** Give the number (approve) or decline. The holder, or the sales / main admin; a sold number: admins only. */
export async function decideNumberRequest(p: {
  requestId: string;
  actor: { uid: string; name: string; role: UserRole | string };
  approve: boolean;
}): Promise<{ ok: boolean; message: string }> {
  const reqRef = doc(db, "number_requests", p.requestId);
  let req: NumberRequest | null = null;
  try {
    const outcome = await runTransaction(db, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new RequestRefused("This request no longer exists.");
      req = { ...(reqSnap.data() as NumberRequest), id: reqSnap.id };
      const r = req;
      const holderSnap = await tx.get(doc(db, "leads", r.holderLeadId));
      const holderLead = holderSnap.exists() ? (holderSnap.data() as Lead) : null;
      const toSnap = r.requesterLeadId ? await tx.get(doc(db, "leads", r.requesterLeadId)) : null;
      const lockRef = doc(db, "numberLocks", phoneLockId(r.phone));
      const lockSnap = await tx.get(lockRef);

      const check = mayDecideNumberRequest(r, p.actor, leadHasSale(holderLead));
      if (!check.ok) throw new RequestRefused(check.reason);
      const decided = { decidedAt: serverTimestamp(), decidedById: p.actor.uid, decidedByName: p.actor.name };

      if (!p.approve) {
        tx.update(reqRef, { status: "declined", ...decided });
        return "declined" as const;
      }
      // The number moved since she asked (given elsewhere, closed, deleted): nothing to give from here.
      if (!holderLead || holderLead.frozen || holderLead.assignedTo !== r.holderId) {
        tx.update(reqRef, { status: "declined", ...decided, decidedByName: "No longer with the member" });
        return "moved" as const;
      }
      giveNumberInTx(tx, {
        phone: r.phone,
        to: { uid: r.requesterId, name: r.requesterName },
        toLead: r.requesterLeadId ? { id: r.requesterLeadId, data: toSnap?.exists() ? (toSnap.data() as Lead) : null } : null,
        fromLead: { id: r.holderLeadId },
        fromName: r.holderName,
        lock: lockSnap.exists() ? (lockSnap.data() as NumberLock) : null,
        by: { uid: p.actor.uid, name: p.actor.name },
        displayName: r.displayName,
        note: `Given by ${p.actor.name}: ${r.holderName} → ${r.requesterName}`,
      });
      tx.update(reqRef, { status: "approved", ...decided });
      return "approved" as const;
    });

    const r = req as NumberRequest | null;
    if (!r) return { ok: false, message: "Could not decide this request." };
    holderCache.clear();
    const stamp = Date.now();
    if (outcome === "moved") {
      return { ok: false, message: `${r.holderName} no longer holds this number — the request is closed.` };
    }
    const tasks: Promise<void>[] = [sendNotification({
      userId: r.requesterId,
      type: "number_request",
      title: outcome === "approved" ? "Number given to you" : "Number request declined",
      message: outcome === "approved"
        ? `${p.actor.name} gave you ${r.phone}. It is in My Leads now.`
        : `${p.actor.name} declined your request for ${r.phone}.`,
      link: "/sales/leads",
      dedupeKey: `number_request_${r.id}_${outcome}_${stamp}_${r.requesterId}`,
    })];
    if (outcome === "approved" && p.actor.uid !== r.holderId) {
      tasks.push(sendNotification({
        userId: r.holderId,
        type: "number_request",
        title: "Number given to a colleague",
        message: `${p.actor.name} gave ${r.phone} to ${r.requesterName}. Your lead on it is closed; its sales stay yours.`,
        link: "/sales/leads",
        dedupeKey: `number_request_${r.id}_given_${stamp}_${r.holderId}`,
      }));
    }
    await Promise.allSettled(tasks);
    return {
      ok: true,
      message: outcome === "approved" ? `${r.phone} is now with ${r.requesterName}.` : "Request declined.",
    };
  } catch (err) {
    if (err instanceof RequestRefused) return { ok: false, message: err.message };
    console.error("[numberRequests] decide failed:", err);
    return { ok: false, message: "Could not save — check the connection and try again." };
  }
}

function toMs(ts: unknown): number {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

const asRequests = (snap: { docs: { id: string; data: () => unknown }[] }): NumberRequest[] =>
  snap.docs.map((d) => ({ ...(d.data() as NumberRequest), id: d.id }));

/** The requests this member has made (every status — a handful). */
export function subscribeMyNumberRequests(uid: string, cb: (rows: NumberRequest[]) => void): () => void {
  return onSnapshot(query(collection(db, "number_requests"), where("requesterId", "==", uid)), (s) => cb(asRequests(s)), () => cb([]));
}

/** Requests waiting on this member, as the holder. */
export function subscribeRequestsToHolder(uid: string, cb: (rows: NumberRequest[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "number_requests"), where("holderId", "==", uid), where("status", "==", "pending")),
    (s) => cb(asRequests(s)), () => cb([]));
}

/**
 * Requests waiting in a sales admin's team — where the HOLDER is theirs, or the REQUESTER is (2026-10-19: a
 * request whose holder's team could not be read reached no admin at all). Two scoped listeners, merged.
 */
export function subscribeAdminNumberRequests(adminUid: string, cb: (rows: NumberRequest[]) => void): () => void {
  let byHolder: NumberRequest[] = [];
  let byRequester: NumberRequest[] = [];
  const emit = () => {
    const m = new Map<string, NumberRequest>();
    for (const r of [...byHolder, ...byRequester]) m.set(r.id, r);
    cb([...m.values()]);
  };
  const a = onSnapshot(
    query(collection(db, "number_requests"), where("salesAdminId", "==", adminUid), where("status", "==", "pending")),
    (s) => { byHolder = asRequests(s); emit(); }, () => { byHolder = []; emit(); });
  const b = onSnapshot(
    query(collection(db, "number_requests"), where("requesterAdminId", "==", adminUid), where("status", "==", "pending")),
    (s) => { byRequester = asRequests(s); emit(); }, () => { byRequester = []; emit(); });
  return () => { a(); b(); };
}
