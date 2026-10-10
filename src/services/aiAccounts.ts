/**
 * AI Accounts — the Firestore operations behind the Flow and paid accounts (see types/aiAccounts).
 *
 * Every write that touches two documents is one transaction or one batch: an account and its password
 * are created together (and the email cannot be added twice), and a credit entry and the account's
 * running total move together, so the number a member sees can never drift from the entries behind it.
 * Notifications are best-effort and never fail the write they follow.
 */
import {
  arrayUnion, collection, deleteField, doc, FieldPath, getDoc, getDocs, increment, query, runTransaction, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import type { AppUser, UserRole, WorkAssignment } from "@/types";
import type {
  AccountEvent, AccountSecret, ApiKeySummary, FlowAccount, FlowClipRow, FlowSettings, FlowUsageEntry, GeminiApiKey, PaidAccount, PaidProvider,
} from "@/types/aiAccounts";
import {
  creditsFor, cycleStartOf, expiryOf, hasRecordedCredits, normaliseEmail, normalisePhone, teamAdminIdOf, todayStr, visibilityOf,
  type FlowAccountInput,
} from "@/utils/flowCredits";
import { apiKeyFingerprint, keyCheckFrom, normaliseApiKey, type KeyCheck } from "@/utils/geminiKeys";

export const FLOW_ACCOUNTS = "flow_accounts";
export const FLOW_SECRETS = "flow_account_secrets";
export const FLOW_USAGE = "flow_usage";
export const PAID_ACCOUNTS = "paid_accounts";
export const PAID_SECRETS = "paid_account_secrets";
/** gemini_api_keys/{flow account id} — the Gemini API key made in that account (2026-10-10). */
export const GEMINI_KEYS = "gemini_api_keys";
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
 * Adds a Flow account and its password — and its Gemini API key, when the form was given one (2026-10-10:
 * the "Add a Flow account" form asks for it). The email is the id, so the same account can never be added
 * twice — the second attempt is told who already added it. A member adds their own (owner = them); a
 * manager may add a backup of their own or one owned by a member. All of it is one transaction: there is
 * never an account whose key was lost, or a key without its account.
 */
export async function addFlowAccount(
  input: FlowAccountInput & { notes?: string; owner?: Person; apiKey?: { key: string; check: KeyCheck } },
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
  const keyed = input.apiKey?.key.trim() ? apiKeyRecords(account, input.apiKey.key, input.apiKey.check, actor) : null;
  if (keyed) {
    account.apiKey = keyed.summary;
    account.history = [...(account.history || []), event(actor, "api_key_added")];
  }

  await runTransaction(db, async (tx) => {
    const ref = doc(db, FLOW_ACCOUNTS, id);
    const existing = await tx.get(ref);
    if (existing.exists()) {
      const by = (existing.data() as FlowAccount).addedByName || "someone";
      throw new Error(`${id} is already in the list — added by ${by}.`);
    }
    tx.set(ref, { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(doc(db, FLOW_SECRETS, id), { password: input.password, updatedAt: serverTimestamp(), updatedById: actor.uid } satisfies AccountSecret);
    if (keyed) tx.set(doc(db, GEMINI_KEYS, id), { ...keyed.record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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

/** Removes an account, its password and its Gemini API key. Its usage entries stay, as history. */
export async function deleteFlowAccount(account: FlowAccount): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, FLOW_ACCOUNTS, account.id));
  batch.delete(doc(db, FLOW_SECRETS, account.id));
  batch.delete(doc(db, GEMINI_KEYS, account.id));
  await batch.commit();
}

/** The account a member is "using now" — what their next credit entry is charged to. */
export async function setActiveFlowAccount(uid: string, accountId: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), { activeFlowAccountId: accountId || null });
}

/** A password — or a Flow account's Gemini API key — read only when someone asks to see or copy it. */
export async function getAccountSecret(kind: "flow" | "paid" | "apiKey", id: string): Promise<string> {
  if (kind === "apiKey") {
    const snap = await getDoc(doc(db, GEMINI_KEYS, id));
    return snap.exists() ? (snap.data() as GeminiApiKey).key || "" : "";
  }
  const snap = await getDoc(doc(db, kind === "flow" ? FLOW_SECRETS : PAID_SECRETS, id));
  return snap.exists() ? (snap.data() as AccountSecret).password || "" : "";
}

// ── Gemini API keys (2026-10-10, utils/geminiKeys) ───────────────────────────────────────────────

const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";

/**
 * Asks Google whether a key works. A models.list call: free — none of the key's generation quota is
 * spent — and it answers an invalid or leaked key exactly as a generation call does (keyCheckFrom).
 * Never throws: Google out of reach (or slower than 12 s) is "unchecked".
 */
export async function checkGeminiApiKey(key: string, fetcher: typeof fetch = fetch): Promise<KeyCheck> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 12_000) : null;
  try {
    const res = await fetcher(MODELS_URL, { headers: { "x-goog-api-key": key }, signal: controller?.signal });
    return keyCheckFrom(res.status, await res.text().catch(() => ""));
  } catch {
    return { status: "unchecked", message: "Google could not be reached to check this key." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The key's own document and the summary its account carries, for a key made in this account. A new key
 * is never "in use": the one the admin deployed was the old key, and this one is not in Vercel yet.
 */
function apiKeyRecords(account: Pick<FlowAccount, "id" | "email" | "ownerId" | "ownerName" | "teamAdminId">, rawKey: string, check: KeyCheck, actor: Actor) {
  const key = normaliseApiKey(rawKey);
  if (!key) throw new Error("Paste the API key.");
  const fingerprint = apiKeyFingerprint(key);
  const now = Date.now();
  const record: Omit<GeminiApiKey, "createdAt" | "updatedAt"> = {
    id: account.id,
    accountId: account.id,
    accountEmail: account.email,
    key,
    fingerprint,
    ownerId: account.ownerId,
    ownerName: account.ownerName,
    addedById: actor.uid,
    addedByName: actor.name || "",
    addedAt: now,
    teamAdminId: account.teamAdminId || teamAdminIdOf(actor),
    status: check.status,
    ...(check.message ? { statusMessage: check.message } : {}),
    checkedAt: now,
    inUse: false,
  };
  const summary: ApiKeySummary = {
    fingerprint,
    status: check.status,
    ...(check.message ? { message: check.message } : {}),
    addedAt: now,
    addedByName: actor.name || "",
    checkedAt: now,
  };
  return { record, summary };
}

/**
 * Saves the key made in this Flow account (a new one, or a replacement), with what Google said about it.
 * The key goes to its own document and the account gets only its summary — one batch, so a card can
 * never say "key added" for a key that is not there.
 */
export async function saveFlowApiKey(account: FlowAccount, rawKey: string, check: KeyCheck, actor: Actor): Promise<void> {
  const { record, summary } = apiKeyRecords(account, rawKey, check, actor);
  const batch = writeBatch(db);
  batch.set(doc(db, GEMINI_KEYS, account.id), { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.update(doc(db, FLOW_ACCOUNTS, account.id), {
    apiKey: summary,
    history: arrayUnion(event(actor, account.apiKey ? "api_key_replaced" : "api_key_added")),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/**
 * Takes a key off its account (the tech admin's "Remove"). The account goes back to "no key", so its
 * owner's card asks for a new one — and the owner is told, when it was someone else who removed it.
 */
export async function removeFlowApiKey(
  key: Pick<GeminiApiKey, "id" | "accountEmail" | "ownerId" | "ownerName">,
  actor: Actor,
  owner?: Person,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, GEMINI_KEYS, key.id));
  batch.update(doc(db, FLOW_ACCOUNTS, key.id), {
    apiKey: deleteField(),
    history: arrayUnion(event(actor, "api_key_removed")),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  if (key.ownerId && key.ownerId !== actor.uid) {
    await notify(owner || { uid: key.ownerId, name: key.ownerName }, "Add a new Gemini API key",
      `${actor.name || "Your admin"} removed the API key on ${key.accountEmail}. Please make a new one in AI Studio and add it on the account.`);
  }
}

/** Batches stay well under Firestore's 500 writes. */
const chunks = <T,>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/** The tech admin's label — these keys are (or are no longer) deployed to AdGen. */
export async function setApiKeysInUse(keys: Pick<GeminiApiKey, "id">[], inUse: boolean, actor: Actor): Promise<void> {
  const now = Date.now();
  for (const part of chunks(keys, 400)) {
    const batch = writeBatch(db);
    for (const k of part) {
      batch.update(doc(db, GEMINI_KEYS, k.id), { inUse, inUseAt: now, inUseByName: actor.name || "", updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

/**
 * Saves what Google said about each key — on the key and on its account's summary, together — and tells
 * an owner whose key has just stopped working that it needs replacing (once per key: the dedupe key
 * carries its fingerprint, so checking again does not ring again, but a new key that dies does).
 */
export async function saveApiKeyChecks(
  results: { key: GeminiApiKey; check: KeyCheck }[],
  owners: Record<string, Person> = {},
): Promise<void> {
  const now = Date.now();
  for (const part of chunks(results, 200)) {
    const batch = writeBatch(db);
    for (const { key, check } of part) {
      const message = check.message ? check.message : deleteField();
      batch.update(doc(db, GEMINI_KEYS, key.id), { status: check.status, statusMessage: message, checkedAt: now, updatedAt: serverTimestamp() });
      batch.update(doc(db, FLOW_ACCOUNTS, key.id), { "apiKey.status": check.status, "apiKey.message": message, "apiKey.checkedAt": now });
    }
    await batch.commit();
  }
  for (const { key, check } of results) {
    if (check.status !== "failed" || key.status === "failed" || !key.ownerId) continue;
    await notify(owners[key.ownerId] || { uid: key.ownerId, name: key.ownerName }, "Your Gemini API key stopped working",
      `The key on ${key.accountEmail}: ${check.message || "Google refused it."} Please add a new key on the account.`,
      `api_key_failed_${key.id}_${key.fingerprint}`);
  }
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
