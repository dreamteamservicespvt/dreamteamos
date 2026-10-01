/**
 * AI Accounts — the Firestore operations behind the Flow and paid accounts (see types/aiAccounts).
 *
 * Every write that touches two documents is one transaction or one batch: an account and its password
 * are created together (and the email cannot be added twice), and a credit entry and the account's
 * running total move together, so the number a member sees can never drift from the entries behind it.
 * Notifications are best-effort and never fail the write they follow.
 */
import {
  arrayUnion, collection, doc, FieldPath, getDoc, getDocs, increment, query, runTransaction, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import type { AppUser, UserRole, WorkAssignment } from "@/types";
import type {
  AccountEvent, AccountSecret, FlowAccount, FlowClipRow, FlowSettings, FlowUsageEntry, PaidAccount, PaidProvider,
} from "@/types/aiAccounts";
import {
  creditsFor, cycleStartOf, expiryOf, hasRecordedCredits, normaliseEmail, normalisePhone, teamAdminIdOf, todayStr, visibilityOf,
  type FlowAccountInput,
} from "@/utils/flowCredits";

export const FLOW_ACCOUNTS = "flow_accounts";
export const FLOW_SECRETS = "flow_account_secrets";
export const FLOW_USAGE = "flow_usage";
export const PAID_ACCOUNTS = "paid_accounts";
export const PAID_SECRETS = "paid_account_secrets";
/** app_settings/flow_accounts — the credit rates, monthly credits, validity and target. */
export const FLOW_SETTINGS_DOC = ["app_settings", "flow_accounts"] as const;

export type Actor = Pick<AppUser, "uid" | "name" | "role" | "createdBy">;
export type Person = { uid: string; name: string; role?: UserRole };

const event = (actor: Actor, action: AccountEvent["action"], extra: Partial<AccountEvent> = {}): AccountEvent => ({
  at: Date.now(), action, byId: actor.uid, byName: actor.name || "", ...extra,
});

/** Where a person opens their AI Accounts — a notification link has to be a route their role can open. */
export function aiAccountsRouteFor(role?: UserRole | null): string {
  if (role === "tech_admin") return "/tech-admin/ai-accounts";
  if (role === "tech_team_leader") return "/team-leader/ai-accounts";
  return "/tech/ai-accounts";
}

const notify = (to: Person, title: string, message: string, dedupeKey?: string) =>
  sendNotification({ userId: to.uid, type: "ai_account", title, message, link: aiAccountsRouteFor(to.role), dedupeKey })
    .catch((err) => console.warn("AI account notification failed (the change itself is saved):", err));

// ── Flow accounts ─────────────────────────────────────────────────────────────────────────────────

/**
 * Adds a Flow account and its password. The email is the id, so the same account can never be added
 * twice — the second attempt is told who already added it. A member adds their own (owner = them); a
 * manager may add a backup of their own or one owned by a member.
 */
export async function addFlowAccount(
  input: FlowAccountInput & { notes?: string; owner?: Person },
  actor: Actor,
  settings: FlowSettings,
): Promise<string> {
  const id = normaliseEmail(input.email);
  const owner: Person = input.owner || { uid: actor.uid, name: actor.name, role: actor.role };
  const account: Omit<FlowAccount, "createdAt" | "updatedAt"> = {
    id,
    email: id,
    phone: normalisePhone(input.phone),
    createdOn: input.createdOn,
    expiresOn: expiryOf(input.createdOn, settings.validityMonths),
    monthlyCredits: settings.monthlyCredits,
    addedBy: actor.uid,
    addedByName: actor.name || "",
    addedByRole: actor.role,
    ownerId: owner.uid,
    ownerName: owner.name,
    holderId: owner.uid,
    holderName: owner.name,
    visibleTo: [],
    teamAdminId: teamAdminIdOf(actor),
    status: "active",
    usedByCycle: {},
    notes: (input.notes || "").trim(),
    history: [event(actor, "added", owner.uid !== actor.uid ? { toId: owner.uid, toName: owner.name } : {})],
  };
  account.visibleTo = visibilityOf(account);

  await runTransaction(db, async (tx) => {
    const ref = doc(db, FLOW_ACCOUNTS, id);
    const existing = await tx.get(ref);
    if (existing.exists()) {
      const by = (existing.data() as FlowAccount).addedByName || "someone";
      throw new Error(`${id} is already in the list — added by ${by}.`);
    }
    tx.set(ref, { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(doc(db, FLOW_SECRETS, id), { password: input.password, updatedAt: serverTimestamp(), updatedById: actor.uid } satisfies AccountSecret);
  });
  return id;
}

export interface FlowAccountPatch {
  phone?: string;
  createdOn?: string;
  notes?: string;
  monthlyCredits?: number;
  status?: FlowAccount["status"];
  password?: string;
}

/** Edits an account. A new creation date moves its expiry; a new password replaces the old one. */
export async function updateFlowAccount(account: FlowAccount, patch: FlowAccountPatch, actor: Actor, settings: FlowSettings): Promise<void> {
  const changes: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const events: AccountEvent[] = [];
  if (patch.phone !== undefined) changes.phone = normalisePhone(patch.phone);
  if (patch.notes !== undefined) changes.notes = patch.notes.trim();
  if (patch.monthlyCredits !== undefined && patch.monthlyCredits > 0) changes.monthlyCredits = Math.round(patch.monthlyCredits);
  if (patch.createdOn && patch.createdOn !== account.createdOn) {
    if (hasRecordedCredits(account)) throw new Error("Credits are already recorded on this account, so its creation date can't change.");
    changes.createdOn = patch.createdOn;
    changes.expiresOn = expiryOf(patch.createdOn, settings.validityMonths);
  }
  if (Object.keys(changes).length > 1) events.push(event(actor, "edited"));
  if (patch.status && patch.status !== account.status) {
    changes.status = patch.status;
    events.push(event(actor, patch.status === "disabled" ? "disabled" : "enabled"));
  }
  if (patch.password?.trim()) events.push(event(actor, "password_changed"));
  if (events.length === 0) return;
  // Appended, not rewritten: the dialog's copy of the account may be minutes old, and writing the
  // whole array back would drop an event someone else added since.
  changes.history = arrayUnion(...events);

  const batch = writeBatch(db);
  batch.update(doc(db, FLOW_ACCOUNTS, account.id), changes);
  if (patch.password?.trim()) {
    batch.set(doc(db, FLOW_SECRETS, account.id), { password: patch.password, updatedAt: serverTimestamp(), updatedById: actor.uid } satisfies AccountSecret);
  }
  await batch.commit();
}

/**
 * Hands an account to someone else to use. It stays in its owner's target count; the new holder sees
 * it from now on and it says who moved it ("assigned to Ravi by Kiran"). Both are told.
 */
export async function assignFlowAccount(account: FlowAccount, to: Person, actor: Actor): Promise<void> {
  if (to.uid === account.holderId) return;
  const from: Person = { uid: account.holderId, name: account.holderName };
  const next = { ...account, holderId: to.uid, holderName: to.name };
  await updateDoc(doc(db, FLOW_ACCOUNTS, account.id), {
    holderId: to.uid,
    holderName: to.name,
    visibleTo: visibilityOf(next),
    history: arrayUnion(event(actor, "assigned", { fromId: from.uid, fromName: from.name, toId: to.uid, toName: to.name })),
    updatedAt: serverTimestamp(),
  });
  await notify(to, "Flow account assigned to you", `${actor.name || "Your admin"} assigned the Flow account ${account.email} to you.`,
    `flow_assigned_${account.id}_${to.uid}`);
  if (from.uid && from.uid !== actor.uid && from.uid !== to.uid) {
    await notify({ uid: from.uid, name: from.name }, "Flow account moved", `${actor.name || "Your admin"} moved the Flow account ${account.email} to ${to.name}.`);
  }
}

/** Removes an account and its password. Its usage entries stay, as history. */
export async function deleteFlowAccount(account: FlowAccount): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, FLOW_ACCOUNTS, account.id));
  batch.delete(doc(db, FLOW_SECRETS, account.id));
  await batch.commit();
}

/** The account a member is "using now" — what their next credit entry is charged to. */
export async function setActiveFlowAccount(uid: string, accountId: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), { activeFlowAccountId: accountId || null });
}

/** A password, read only when someone asks to see or copy it. */
export async function getAccountSecret(kind: "flow" | "paid", id: string): Promise<string> {
  const snap = await getDoc(doc(db, kind === "flow" ? FLOW_SECRETS : PAID_SECRETS, id));
  return snap.exists() ? (snap.data() as AccountSecret).password || "" : "";
}

// ── Credit usage ──────────────────────────────────────────────────────────────────────────────────

export interface UsageDraft {
  account: FlowAccount;
  rows: FlowClipRow[];
}

/**
 * Records the credits an ad used — one ledger entry per account (an ad may run across two when the
 * first runs out) — and adds them to each account's running total for its current cycle, in one batch.
 */
export async function recordFlowUsage(
  drafts: UsageDraft[],
  actor: Actor,
  settings: FlowSettings,
  meta: {
    /** The job the credits were for — its id always, its number and business when it has them. */
    assignment?: (Pick<WorkAssignment, "id"> & Partial<Pick<WorkAssignment, "uniqueId" | "businessName">>) | null;
    note?: string;
    source?: FlowUsageEntry["source"];
  } = {},
  today = todayStr(),
): Promise<number> {
  const batch = writeBatch(db);
  let total = 0;
  for (const { account, rows } of drafts) {
    const kept = rows.filter((r) => r.count > 0);
    const credits = creditsFor(kept, settings);
    if (credits <= 0) continue;
    total += credits;
    const cycleStart = cycleStartOf(account.createdOn, today);
    const entry: Omit<FlowUsageEntry, "id"> = {
      accountId: account.id,
      accountEmail: account.email,
      userId: actor.uid,
      userName: actor.name || "",
      teamAdminId: account.teamAdminId || teamAdminIdOf(actor),
      ...(meta.assignment?.id ? { assignmentId: meta.assignment.id } : {}),
      ...(meta.assignment?.uniqueId ? { uniqueId: meta.assignment.uniqueId } : {}),
      ...(meta.assignment?.businessName ? { businessName: meta.assignment.businessName } : {}),
      rows: kept,
      credits,
      cycleStart,
      date: today,
      month: today.slice(0, 7),
      source: meta.source || (meta.assignment ? "completion" : "manual"),
      ...(meta.note?.trim() ? { note: meta.note.trim() } : {}),
    };
    batch.set(doc(collection(db, FLOW_USAGE)), { ...entry, createdAt: serverTimestamp() });
    batch.update(doc(db, FLOW_ACCOUNTS, account.id),
      new FieldPath("usedByCycle", cycleStart), increment(credits),
      "lastUsedAt", Date.now(),
      "lastUsedByName", actor.name || "",
      "updatedAt", serverTimestamp());
  }
  if (total > 0) await batch.commit();
  return total;
}

/**
 * The credits this person already entered for a job. A job handed in again — after it came back for
 * edits, or after "Undo completion" — asks again, and this is what lets the dialog say so instead of
 * offering the whole ad's clips a second time. Two equality filters: no composite index.
 */
export async function usageForAssignment(uid: string, assignmentId: string): Promise<FlowUsageEntry[]> {
  const snap = await getDocs(query(collection(db, FLOW_USAGE), where("userId", "==", uid), where("assignmentId", "==", assignmentId)));
  return snap.docs.map((d) => ({ ...(d.data() as FlowUsageEntry), id: d.id }));
}

/**
 * Corrects an entry — its clips, or the account it was charged to. The old amount comes off the old
 * account's cycle and the new amount goes on the new one's, with the entry, in one batch.
 */
export async function editFlowUsage(
  entry: FlowUsageEntry,
  next: { account: FlowAccount; rows: FlowClipRow[] },
  actor: Actor,
  settings: FlowSettings,
): Promise<void> {
  const kept = next.rows.filter((r) => r.count > 0);
  const credits = creditsFor(kept, settings);
  const sameAccount = next.account.id === entry.accountId;
  const cycleStart = sameAccount ? entry.cycleStart : cycleStartOf(next.account.createdOn, entry.date);
  const batch = writeBatch(db);
  batch.update(doc(db, FLOW_ACCOUNTS, entry.accountId), new FieldPath("usedByCycle", entry.cycleStart), increment(-entry.credits), "updatedAt", serverTimestamp());
  batch.update(doc(db, FLOW_ACCOUNTS, next.account.id), new FieldPath("usedByCycle", cycleStart), increment(credits), "updatedAt", serverTimestamp());
  batch.update(doc(db, FLOW_USAGE, entry.id), {
    accountId: next.account.id,
    accountEmail: next.account.email,
    rows: kept,
    credits,
    cycleStart,
    updatedAt: serverTimestamp(),
    editedById: actor.uid,
    editedByName: actor.name || "",
  });
  await batch.commit();
}

/** Removes an entry and gives its credits back to the account's cycle. */
export async function deleteFlowUsage(entry: FlowUsageEntry): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, FLOW_ACCOUNTS, entry.accountId), new FieldPath("usedByCycle", entry.cycleStart), increment(-entry.credits), "updatedAt", serverTimestamp());
  batch.delete(doc(db, FLOW_USAGE, entry.id));
  await batch.commit();
}

export async function saveFlowSettings(settings: FlowSettings): Promise<void> {
  await setDoc(doc(db, ...FLOW_SETTINGS_DOC), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ── Paid accounts (ChatGPT, Grok …) ───────────────────────────────────────────────────────────────

export interface PaidAccountInput {
  provider: PaidProvider;
  label: string;
  email: string;
  password: string;
  plan?: string;
  notes?: string;
  renewsOn?: string;
}

export async function addPaidAccount(input: PaidAccountInput, actor: Actor): Promise<string> {
  const ref = doc(collection(db, PAID_ACCOUNTS));
  const account: Omit<PaidAccount, "id" | "createdAt" | "updatedAt"> = {
    provider: input.provider,
    label: input.label.trim() || input.email.trim(),
    email: input.email.trim(),
    plan: (input.plan || "").trim(),
    notes: (input.notes || "").trim(),
    ...(input.renewsOn ? { renewsOn: input.renewsOn } : {}),
    assignedTo: [],
    assignedNames: {},
    teamAdminId: teamAdminIdOf(actor),
    addedBy: actor.uid,
    addedByName: actor.name || "",
    history: [event(actor, "added")],
  };
  const batch = writeBatch(db);
  batch.set(ref, { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(db, PAID_SECRETS, ref.id), { password: input.password, updatedAt: serverTimestamp(), updatedById: actor.uid } satisfies AccountSecret);
  await batch.commit();
  return ref.id;
}

export async function updatePaidAccount(account: PaidAccount, patch: Partial<PaidAccountInput>, actor: Actor): Promise<void> {
  const changes: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.provider) changes.provider = patch.provider;
  if (patch.label !== undefined) changes.label = patch.label.trim() || account.email;
  if (patch.email !== undefined && patch.email.trim()) changes.email = patch.email.trim();
  if (patch.plan !== undefined) changes.plan = patch.plan.trim();
  if (patch.notes !== undefined) changes.notes = patch.notes.trim();
  if (patch.renewsOn !== undefined) changes.renewsOn = patch.renewsOn;
  const events = [event(actor, "edited")];
  if (patch.password?.trim()) events.push(event(actor, "password_changed"));
  changes.history = arrayUnion(...events);
  const batch = writeBatch(db);
  batch.update(doc(db, PAID_ACCOUNTS, account.id), changes);
  if (patch.password?.trim()) {
    batch.set(doc(db, PAID_SECRETS, account.id), { password: patch.password, updatedAt: serverTimestamp(), updatedById: actor.uid } satisfies AccountSecret);
  }
  await batch.commit();
}

/** Sets who a paid account is assigned to; everyone newly given it is told. */
export async function assignPaidAccount(account: PaidAccount, people: Person[], actor: Actor): Promise<void> {
  const before = new Set(account.assignedTo || []);
  const assignedNames = Object.fromEntries(people.map((p) => [p.uid, p.name]));
  const added = people.filter((p) => !before.has(p.uid));
  const removed = [...before].filter((uid) => !people.some((p) => p.uid === uid));
  const events = [
    ...added.map((p) => event(actor, "assigned", { toId: p.uid, toName: p.name })),
    ...removed.map((uid) => event(actor, "assigned", { fromId: uid, fromName: account.assignedNames?.[uid] || "" })),
  ];
  await updateDoc(doc(db, PAID_ACCOUNTS, account.id), {
    assignedTo: people.map((p) => p.uid),
    assignedNames,
    ...(events.length ? { history: arrayUnion(...events) } : {}),
    updatedAt: serverTimestamp(),
  });
  for (const person of added) {
    await notify(person, `${providerLabel(account.provider)} account assigned to you`,
      `${actor.name || "Your admin"} gave you access to ${account.label}.`, `paid_assigned_${account.id}_${person.uid}`);
  }
}

export async function deletePaidAccount(account: PaidAccount): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, PAID_ACCOUNTS, account.id));
  batch.delete(doc(db, PAID_SECRETS, account.id));
  await batch.commit();
}

export function providerLabel(provider: PaidProvider): string {
  return provider === "chatgpt" ? "ChatGPT" : provider === "grok" ? "Grok" : "Paid";
}
