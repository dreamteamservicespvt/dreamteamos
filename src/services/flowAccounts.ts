/**
 * Flow Accounts — every Firestore read and write of the section (see types/flowAccounts).
 *
 * ── Why the credit totals live on the account ───────────────────────────────────────────────────
 * Each spend is a `flow_credit_logs` document (who, which ad, which clips, how many credits), and the
 * account carries the running total for each of its credit months (`used`). A page showing thirty
 * accounts then reads thirty documents, not every log ever written — the free-tier read quota is what
 * this app is built around. The two are only ever changed together, in one transaction, so a total
 * can never drift from its logs: adding a spend adds to its month, editing one moves the difference
 * (to another account, if it was the wrong one), deleting one takes it back.
 *
 * ── Who sees what ───────────────────────────────────────────────────────────────────────────────
 * A member's list is `memberIds array-contains uid` — the accounts they added and the ones assigned to
 * them. The tech admin and team leaders read `teamAdminId ==` their team. Both are single-field queries,
 * so no composite index is needed. These documents hold readable passwords: the protection is the
 * Firestore rules in docs/firestore-rules.md, which must be published.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import type { AppUser, WorkAssignment } from "@/types";
import type {
  FlowAccount, FlowAccountEvent, FlowClipCounts, FlowCreditLog, FlowSettings, PaidAccount, WorkFlowCredits,
} from "@/types/flowAccounts";
import {
  DEFAULT_FLOW_SETTINGS, NO_CLIPS, creditCycleStart, creditsForClips, expiryFor, flowAccountDocId, indianMobileDigits,
  isoToday, normaliseEmail, withFlowDefaults, type FlowAccountInput,
} from "@/utils/flowAccounts";

export const FLOW_ACCOUNTS = "flow_accounts";
export const FLOW_CREDIT_LOGS = "flow_credit_logs";
export const PAID_ACCOUNTS = "paid_accounts";
const SETTINGS_DOC = ["app_settings", "flow_accounts"] as const;
/** How many events an account keeps — enough to answer "who had it and when", small enough to carry. */
const HISTORY_LIMIT = 30;

/** Where Flow Accounts lives for this role — a notification must link to a route its recipient can open. */
export function flowAccountsPath(role?: string | null): string {
  return role === "tech_admin" ? "/tech-admin/flow-accounts"
    : role === "tech_team_leader" ? "/team-leader/flow-accounts"
      : "/tech/flow-accounts";
}

/** Who is acting — the signed-in user, as much of them as the records need. */
export type FlowActor = Pick<AppUser, "uid" | "name" | "role" | "createdBy">;

/** True for the people who manage the section: the tech admin and the tech team leaders. */
export function isFlowManager(user?: Pick<AppUser, "role"> | null): boolean {
  return user?.role === "tech_admin" || user?.role === "tech_team_leader";
}

/** The tech admin whose team this person belongs to — the key every manager query is scoped by. */
export function teamAdminIdOf(user: Pick<AppUser, "uid" | "role" | "createdBy">): string {
  return user.role === "tech_admin" ? user.uid : user.createdBy || user.uid;
}

const event = (actor: FlowActor, kind: FlowAccountEvent["kind"], to?: { uid: string; name: string } | null): FlowAccountEvent => ({
  at: Date.now(),
  by: actor.uid,
  byName: actor.name || "",
  kind,
  ...(to ? { to: to.uid, toName: to.name } : {}),
});

const withEvent = (history: FlowAccountEvent[] | undefined, e: FlowAccountEvent) => [...(history || []), e].slice(-HISTORY_LIMIT);

const accountOf = (id: string, data: Record<string, unknown>): FlowAccount => ({
  id,
  used: {},
  history: [],
  memberIds: [],
  inUseBy: null,
  assignedTo: null,
  status: "active",
  ...(data as Partial<FlowAccount>),
} as FlowAccount);

// ── Reading ─────────────────────────────────────────────────────────────────────────────────

/** A member's accounts: the ones they added and the ones assigned to them. Live. */
export function subscribeMemberFlowAccounts(uid: string, onData: (accounts: FlowAccount[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, FLOW_ACCOUNTS), where("memberIds", "array-contains", uid)),
    (snap) => onData(snap.docs.map((d) => accountOf(d.id, d.data()))),
    (err) => { console.error("[flowAccounts] member listener:", err); onError?.(err); },
  );
}

/** Every account of a tech admin's team — the managers' view. Live. */
export function subscribeTeamFlowAccounts(teamAdminId: string, onData: (accounts: FlowAccount[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, FLOW_ACCOUNTS), where("teamAdminId", "==", teamAdminId)),
    (snap) => onData(snap.docs.map((d) => accountOf(d.id, d.data()))),
    (err) => { console.error("[flowAccounts] team listener:", err); onError?.(err); },
  );
}

/** One calendar month of spending — a member's own, or the whole team's. Two equality filters, no index. */
export function subscribeFlowCreditLogs(
  scope: { userId: string } | { teamAdminId: string },
  month: string,
  onData: (logs: FlowCreditLog[]) => void,
) {
  const field = "userId" in scope ? where("userId", "==", scope.userId) : where("teamAdminId", "==", scope.teamAdminId);
  return onSnapshot(
    query(collection(db, FLOW_CREDIT_LOGS), field, where("month", "==", month)),
    (snap) => onData(snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FlowCreditLog))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || millis(b.createdAt) - millis(a.createdAt))),
    (err) => console.error("[flowAccounts] log listener:", err),
  );
}

const millis = (t: unknown): number => {
  if (!t) return 0;
  if (typeof t === "number") return t;
  const anyT = t as { toMillis?: () => number; seconds?: number };
  return anyT.toMillis ? anyT.toMillis() : (anyT.seconds || 0) * 1000;
};

/** The drive's target and the price list, live — defaults until a manager saves their own. */
export function subscribeFlowSettings(onData: (settings: FlowSettings) => void) {
  return onSnapshot(
    doc(db, ...SETTINGS_DOC),
    (snap) => onData(withFlowDefaults(snap.exists() ? (snap.data() as Partial<FlowSettings>) : null)),
    () => onData(DEFAULT_FLOW_SETTINGS),
  );
}

export async function saveFlowSettings(settings: FlowSettings, actor: FlowActor): Promise<void> {
  await setDoc(doc(db, ...SETTINGS_DOC), { ...withFlowDefaults(settings), updatedBy: actor.uid, updatedAt: serverTimestamp() });
}

// ── Accounts ────────────────────────────────────────────────────────────────────────────────

/**
 * Records a new account. The email is the document id, so the same Google account can only ever be
 * recorded once — by anyone. Throws `DUPLICATE` when it already is.
 */
export async function addFlowAccount(
  input: FlowAccountInput & { notes?: string },
  actor: FlowActor,
  settings: FlowSettings = DEFAULT_FLOW_SETTINGS,
): Promise<string> {
  const email = normaliseEmail(input.email);
  const id = flowAccountDocId(email);
  const teamAdminId = teamAdminIdOf(actor);
  const ref = doc(db, FLOW_ACCOUNTS, id);
  await runTransaction(db, async (tx) => {
    let exists = false;
    try {
      exists = (await tx.get(ref)).exists();
    } catch {
      // Not allowed to read it: someone else's account already holds this email.
      exists = true;
    }
    if (exists) throw new Error("DUPLICATE");
    const account: Omit<FlowAccount, "id"> = {
      email,
      password: input.password,
      authPhone: `+91${indianMobileDigits(input.authPhone)}`,
      createdOn: input.createdOn,
      expiresOn: expiryFor(input.createdOn, settings.validityMonths),
      monthlyCredits: settings.monthlyCredits,
      status: "active",
      addedBy: actor.uid,
      addedByName: actor.name || "",
      addedByRole: actor.role,
      assignedTo: null,
      memberIds: [actor.uid],
      teamAdminId,
      inUseBy: null,
      used: {},
      history: [event(actor, "added")],
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };
    tx.set(ref, { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  return id;
}

/** Corrects an account's details. The email is its identity and is not edited — delete and re-add. */
export async function updateFlowAccount(
  account: FlowAccount,
  patch: Partial<Pick<FlowAccount, "password" | "authPhone" | "createdOn" | "notes" | "status" | "monthlyCredits">>,
  actor: FlowActor,
  settings: FlowSettings = DEFAULT_FLOW_SETTINGS,
): Promise<void> {
  const next: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.password !== undefined) next.password = patch.password;
  if (patch.authPhone !== undefined) next.authPhone = `+91${indianMobileDigits(patch.authPhone)}`;
  if (patch.createdOn !== undefined && patch.createdOn !== account.createdOn) {
    next.createdOn = patch.createdOn;
    next.expiresOn = expiryFor(patch.createdOn, settings.validityMonths);
  }
  if (patch.notes !== undefined) next.notes = patch.notes.trim();
  if (patch.monthlyCredits !== undefined) next.monthlyCredits = Math.max(0, Math.round(patch.monthlyCredits));
  let kind: FlowAccountEvent["kind"] = "edited";
  if (patch.status && patch.status !== account.status) {
    next.status = patch.status;
    kind = patch.status === "blocked" ? "blocked" : "unblocked";
    // A blocked account cannot be the one anybody is using.
    if (patch.status === "blocked") { next.inUseBy = null; next.inUseByName = ""; }
  }
  next.history = withEvent(account.history, event(actor, kind));
  await updateDoc(doc(db, FLOW_ACCOUNTS, account.id), next);
}

/** Removes an account. Its spend logs stay — they record ads that were really made. */
export async function deleteFlowAccount(accountId: string): Promise<void> {
  await deleteDoc(doc(db, FLOW_ACCOUNTS, accountId));
}

/**
 * Hands an account to a member (or takes it back, with `to` null). It stays visible to whoever added
 * it, with who holds it now and who moved it there; the new holder is told.
 */
export async function assignFlowAccount(
  account: FlowAccount,
  to: { uid: string; name: string; role?: string } | null,
  actor: FlowActor,
): Promise<void> {
  const holder = to && to.uid !== account.addedBy ? to : null;
  await updateDoc(doc(db, FLOW_ACCOUNTS, account.id), {
    assignedTo: holder?.uid ?? null,
    assignedToName: holder?.name ?? "",
    assignedBy: holder ? actor.uid : "",
    assignedByName: holder ? actor.name || "" : "",
    assignedAt: holder ? Date.now() : 0,
    memberIds: [...new Set([account.addedBy, ...(holder ? [holder.uid] : [])])],
    // Whoever was using it no longer holds it.
    ...(account.inUseBy && account.inUseBy !== (holder?.uid ?? account.addedBy) ? { inUseBy: null, inUseByName: "" } : {}),
    history: withEvent(account.history, event(actor, holder ? "assigned" : "unassigned", holder)),
    updatedAt: serverTimestamp(),
  });
  if (holder && holder.uid !== actor.uid) {
    await sendNotification({
      userId: holder.uid,
      type: "flow_account_assigned",
      title: "Flow account assigned to you",
      message: `${actor.name || "Your admin"} gave you the Flow account ${account.email}. It is in Flow Accounts.`,
      link: flowAccountsPath(holder.role),
      dedupeKey: `flow_assigned_${account.id}_${holder.uid}`,
    }).catch(() => { /* the assignment stands either way */ });
  }
}

/**
 * "I'm using this account now." One account per member: whichever they were on before is released in
 * the same write.
 */
export async function setFlowAccountInUse(
  member: { uid: string; name: string },
  accountId: string | null,
  myAccounts: FlowAccount[],
): Promise<void> {
  const batch = writeBatch(db);
  for (const a of myAccounts) {
    if (a.inUseBy === member.uid && a.id !== accountId) {
      batch.update(doc(db, FLOW_ACCOUNTS, a.id), { inUseBy: null, inUseByName: "", updatedAt: serverTimestamp() });
    }
  }
  if (accountId) {
    batch.update(doc(db, FLOW_ACCOUNTS, accountId), {
      inUseBy: member.uid, inUseByName: member.name || "", inUseSince: Date.now(), updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

// ── Credits ─────────────────────────────────────────────────────────────────────────────────

/** One account's share of an ad's credits, as the completion form records it. */
export interface FlowCreditEntry {
  accountId: string;
  clips: FlowClipCounts;
  /** What was actually spent; defaults to the price-list total of `clips`. */
  credits?: number;
  note?: string;
}

/**
 * Records an ad's credits — one log per account it was made on — and adds each to its account's
 * month, in one transaction. When `assignment` is given the job records the total too, which is how
 * Mark Complete knows the credits are in.
 */
export async function logFlowCredits(params: {
  entries: FlowCreditEntry[];
  user: FlowActor;
  assignment?: Pick<WorkAssignment, "id" | "uniqueId" | "businessName" | "displayTitle" | "category"> | null;
  settings?: FlowSettings;
  date?: string;
}): Promise<{ logIds: string[]; total: number }> {
  const { entries, user, assignment, settings = DEFAULT_FLOW_SETTINGS } = params;
  const date = params.date || isoToday();
  const month = date.slice(0, 7);
  const usable = entries.filter((e) => e.accountId);
  if (usable.length === 0) throw new Error("NO_ACCOUNT");
  const teamAdminId = teamAdminIdOf(user);

  return runTransaction(db, async (tx) => {
    // Reads first — a transaction may not read after it writes.
    const refs = usable.map((e) => doc(db, FLOW_ACCOUNTS, e.accountId));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const assignmentRef = assignment ? doc(db, "work_assignments", assignment.id) : null;
    const assignmentSnap = assignmentRef ? await tx.get(assignmentRef) : null;

    const logIds: string[] = [];
    let total = 0;
    // The same account twice in one ad is added up, not overwritten.
    const usedByAccount = new Map<string, Record<string, number>>();
    usable.forEach((entry, i) => {
      const snap = snaps[i];
      if (!snap.exists()) throw new Error("ACCOUNT_GONE");
      const account = accountOf(snap.id, snap.data());
      const calculated = creditsForClips(entry.clips, settings.clipCosts);
      const credits = Math.max(0, Math.round(entry.credits ?? calculated));
      const cycle = creditCycleStart(account.createdOn, date);
      const used = usedByAccount.get(account.id) || { ...(account.used || {}) };
      used[cycle] = (used[cycle] || 0) + credits;
      usedByAccount.set(account.id, used);
      const logRef = doc(collection(db, FLOW_CREDIT_LOGS));
      const log: Omit<FlowCreditLog, "id"> = {
        accountId: account.id,
        accountEmail: account.email,
        userId: user.uid,
        userName: user.name || "",
        teamAdminId: account.teamAdminId || teamAdminId,
        ...(assignment ? {
          assignmentId: assignment.id,
          uniqueId: assignment.uniqueId || "",
          businessName: assignment.businessName || assignment.displayTitle || "",
          category: assignment.category || "",
        } : {}),
        clips: { ...NO_CLIPS, ...entry.clips },
        calculated,
        credits,
        manual: credits !== calculated,
        ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
        cycle,
        date,
        month,
      };
      tx.set(logRef, { ...log, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      logIds.push(logRef.id);
      total += credits;
    });
    for (const [id, used] of usedByAccount) tx.update(doc(db, FLOW_ACCOUNTS, id), { used, updatedAt: serverTimestamp() });

    if (assignmentRef && assignmentSnap?.exists()) {
      const before = (assignmentSnap.data().flowCredits as WorkFlowCredits | undefined);
      const record: WorkFlowCredits = {
        total: (before && !before.none ? before.total : 0) + total,
        logIds: [...(before && !before.none ? before.logIds || [] : []), ...logIds],
        recordedAt: Date.now(),
        recordedBy: user.uid,
      };
      tx.update(assignmentRef, { flowCredits: record });
    }
    return { logIds, total };
  });
}

/** The ad was made without Flow — said explicitly, so the job still shows its credits were accounted for. */
export async function recordNoFlowCredits(assignmentId: string, reason: string, user: FlowActor): Promise<void> {
  const record: WorkFlowCredits = { total: 0, logIds: [], recordedAt: Date.now(), recordedBy: user.uid, none: true, noneReason: reason.trim() };
  await updateDoc(doc(db, "work_assignments", assignmentId), { flowCredits: record });
}

/**
 * Corrects a spend: different clips, a different credit figure, or the right account. The difference
 * moves in the same transaction — off the old account's month, onto the new one's.
 */
export async function updateFlowCreditLog(
  log: FlowCreditLog,
  patch: { clips?: FlowClipCounts; credits?: number; note?: string; accountId?: string },
  actor: FlowActor,
  settings: FlowSettings = DEFAULT_FLOW_SETTINGS,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const logRef = doc(db, FLOW_CREDIT_LOGS, log.id);
    const oldRef = doc(db, FLOW_ACCOUNTS, log.accountId);
    const newAccountId = patch.accountId || log.accountId;
    const newRef = doc(db, FLOW_ACCOUNTS, newAccountId);
    const [logSnap, oldSnap, newSnap] = await Promise.all([
      tx.get(logRef), tx.get(oldRef), newAccountId === log.accountId ? Promise.resolve(null) : tx.get(newRef),
    ]);
    const assignmentRef = log.assignmentId ? doc(db, "work_assignments", log.assignmentId) : null;
    const assignmentSnap = assignmentRef ? await tx.get(assignmentRef) : null;
    if (!logSnap.exists()) throw new Error("LOG_GONE");
    const current = { id: logSnap.id, ...logSnap.data() } as FlowCreditLog;

    const clips = patch.clips ? { ...NO_CLIPS, ...patch.clips } : current.clips;
    const calculated = creditsForClips(clips, settings.clipCosts);
    const credits = Math.max(0, Math.round(patch.credits ?? (patch.clips ? calculated : current.credits)));

    // Take the old spend back off the account it was on.
    if (oldSnap.exists()) {
      const used = { ...(oldSnap.data().used || {}) } as Record<string, number>;
      used[current.cycle] = Math.max(0, (used[current.cycle] || 0) - (current.credits || 0));
      if (newAccountId === log.accountId) used[current.cycle] += credits;
      tx.update(oldRef, { used, updatedAt: serverTimestamp() });
    }
    // …and put the corrected spend on the right one.
    let cycle = current.cycle;
    let accountEmail = current.accountEmail;
    if (newAccountId !== log.accountId) {
      if (!newSnap?.exists()) throw new Error("ACCOUNT_GONE");
      const account = accountOf(newSnap.id, newSnap.data());
      cycle = creditCycleStart(account.createdOn, current.date);
      accountEmail = account.email;
      const used = { ...(account.used || {}) };
      used[cycle] = (used[cycle] || 0) + credits;
      tx.update(newRef, { used, updatedAt: serverTimestamp() });
    }
    tx.update(logRef, {
      accountId: newAccountId, accountEmail, cycle, clips, calculated, credits, manual: credits !== calculated,
      ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
      editedBy: actor.uid, editedByName: actor.name || "", updatedAt: serverTimestamp(),
    });
    if (assignmentRef && assignmentSnap?.exists()) {
      const before = assignmentSnap.data().flowCredits as WorkFlowCredits | undefined;
      if (before && !before.none) {
        tx.update(assignmentRef, { flowCredits: { ...before, total: Math.max(0, before.total - (current.credits || 0) + credits) } });
      }
    }
  });
}

/** Removes a spend that should never have been recorded, and gives its credits back to the account. */
export async function deleteFlowCreditLog(log: FlowCreditLog): Promise<void> {
  await runTransaction(db, async (tx) => {
    const logRef = doc(db, FLOW_CREDIT_LOGS, log.id);
    const accountRef = doc(db, FLOW_ACCOUNTS, log.accountId);
    const [logSnap, accountSnap] = await Promise.all([tx.get(logRef), tx.get(accountRef)]);
    const assignmentRef = log.assignmentId ? doc(db, "work_assignments", log.assignmentId) : null;
    const assignmentSnap = assignmentRef ? await tx.get(assignmentRef) : null;
    if (!logSnap.exists()) return;
    const current = logSnap.data() as FlowCreditLog;
    if (accountSnap.exists()) {
      const used = { ...(accountSnap.data().used || {}) } as Record<string, number>;
      used[current.cycle] = Math.max(0, (used[current.cycle] || 0) - (current.credits || 0));
      tx.update(accountRef, { used, updatedAt: serverTimestamp() });
    }
    tx.delete(logRef);
    if (assignmentRef && assignmentSnap?.exists()) {
      const before = assignmentSnap.data().flowCredits as WorkFlowCredits | undefined;
      if (before && !before.none) {
        const logIds = (before.logIds || []).filter((id) => id !== log.id);
        tx.update(assignmentRef, {
          flowCredits: logIds.length ? { ...before, logIds, total: Math.max(0, before.total - (current.credits || 0)) } : null,
        });
      }
    }
  });
}

/** The job's own record of its credits, read fresh — Mark Complete asks before it lets an ad through. */
export async function fetchAssignmentFlowCredits(assignmentId: string): Promise<WorkFlowCredits | null> {
  try {
    const snap = await getDoc(doc(db, "work_assignments", assignmentId));
    return (snap.data()?.flowCredits as WorkFlowCredits | undefined) || null;
  } catch {
    return null;
  }
}

// ── Paid accounts (ChatGPT, Grok) — stored and shared, no credits ─────────────────────────────

/** Every paid account of the team — the managers' view. Live. */
export function subscribeTeamPaidAccounts(teamAdminId: string, onData: (accounts: PaidAccount[]) => void) {
  return onSnapshot(
    query(collection(db, PAID_ACCOUNTS), where("teamAdminId", "==", teamAdminId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, assignees: [], assigneeIds: [], ...d.data() } as PaidAccount))),
    (err) => console.error("[flowAccounts] paid listener:", err),
  );
}

/** The paid accounts shared with one member. Live. */
export function subscribeMemberPaidAccounts(uid: string, onData: (accounts: PaidAccount[]) => void) {
  return onSnapshot(
    query(collection(db, PAID_ACCOUNTS), where("assigneeIds", "array-contains", uid)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, assignees: [], assigneeIds: [], ...d.data() } as PaidAccount))),
    (err) => console.error("[flowAccounts] paid member listener:", err),
  );
}

export type PaidAccountInput = Pick<PaidAccount, "platform" | "label" | "email" | "password" | "plan" | "renewsOn" | "notes">;

/** Adds a paid account, or saves changes to one. Returns its id. */
export async function savePaidAccount(input: PaidAccountInput, actor: FlowActor, existing?: PaidAccount | null): Promise<string> {
  const fields = {
    platform: input.platform,
    label: input.label.trim(),
    email: input.email.trim(),
    password: input.password,
    plan: input.plan?.trim() || "",
    renewsOn: input.renewsOn || "",
    notes: input.notes?.trim() || "",
    updatedAt: serverTimestamp(),
  };
  if (existing) {
    await updateDoc(doc(db, PAID_ACCOUNTS, existing.id), fields);
    return existing.id;
  }
  const ref = await addDoc(collection(db, PAID_ACCOUNTS), {
    ...fields,
    assignees: [],
    assigneeIds: [],
    teamAdminId: teamAdminIdOf(actor),
    addedBy: actor.uid,
    addedByName: actor.name || "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePaidAccount(id: string): Promise<void> {
  await deleteDoc(doc(db, PAID_ACCOUNTS, id));
}

/** Who a paid account is shared with. Anyone newly added is told where to find it. */
export async function setPaidAccountAssignees(account: PaidAccount, assignees: { uid: string; name: string; role?: string }[], actor: FlowActor): Promise<void> {
  const unique = [...new Map(assignees.map((a) => [a.uid, a])).values()];
  await updateDoc(doc(db, PAID_ACCOUNTS, account.id), {
    assignees: unique.map(({ uid, name }) => ({ uid, name })),
    assigneeIds: unique.map((a) => a.uid),
    updatedAt: serverTimestamp(),
  });
  const before = new Set(account.assigneeIds || []);
  await Promise.all(unique.filter((a) => !before.has(a.uid) && a.uid !== actor.uid).map((a) => sendNotification({
    userId: a.uid,
    type: "paid_account_assigned",
    title: `${account.label} shared with you`,
    message: `${actor.name || "Your admin"} shared the ${platformName(account.platform)} account "${account.label}" with you. It is in Flow Accounts.`,
    link: flowAccountsPath(a.role),
    dedupeKey: `paid_assigned_${account.id}_${a.uid}`,
  }).catch(() => { /* sharing stands either way */ })));
}

export function platformName(platform: PaidAccount["platform"]): string {
  return platform === "chatgpt" ? "ChatGPT" : platform === "grok" ? "Grok" : "paid";
}
