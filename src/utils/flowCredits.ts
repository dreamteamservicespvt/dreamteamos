/**
 * The arithmetic of the Flow accounts — cycles, expiry, credits, the target — in one pure place.
 *
 * Pure — no React, no Firestore — so every number on the AI Accounts screens is unit-tested, and the
 * member's page, the admin's overview and the credit dialog can never disagree about what is left.
 *
 * Dates are plain yyyy-MM-dd strings handled as calendar dates (no time zone): an account created on
 * the 31st resets on the last day of a shorter month, and expires 18 calendar months on.
 */
import type { AppUser } from "@/types";
import type { FlowAccount, FlowClipRow, FlowClipSeconds, FlowSettings } from "@/types/aiAccounts";
import { FLOW_CLIP_SECONDS } from "@/types/aiAccounts";

/** The numbers as the team set them on 2026-10-01 — editable from the AI Accounts settings. */
export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  clipCredits: { 4: 7, 6: 10, 8: 12, 10: 15 },
  monthlyCredits: 1000,
  validityMonths: 18,
  targetPerMember: 30,
  campaignStart: "2026-09-30",
  deadline: "2026-10-29",
  dailyTarget: 2,
};

/** Saved settings over the defaults — a field nobody has saved yet keeps its default. */
export function withFlowDefaults(saved?: Partial<FlowSettings> | null): FlowSettings {
  const s = saved || {};
  const positive = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
  const date = (v: unknown, fallback: string) => (typeof v === "string" && isDate(v) ? v : fallback);
  const clipCredits = { ...DEFAULT_FLOW_SETTINGS.clipCredits };
  for (const sec of FLOW_CLIP_SECONDS) clipCredits[sec] = positive(s.clipCredits?.[sec], clipCredits[sec]);
  return {
    clipCredits,
    monthlyCredits: positive(s.monthlyCredits, DEFAULT_FLOW_SETTINGS.monthlyCredits),
    validityMonths: positive(s.validityMonths, DEFAULT_FLOW_SETTINGS.validityMonths),
    targetPerMember: positive(s.targetPerMember, DEFAULT_FLOW_SETTINGS.targetPerMember),
    campaignStart: date(s.campaignStart, DEFAULT_FLOW_SETTINGS.campaignStart),
    deadline: date(s.deadline, DEFAULT_FLOW_SETTINGS.deadline),
    dailyTarget: positive(s.dailyTarget, DEFAULT_FLOW_SETTINGS.dailyTarget),
  };
}

// ── Dates ─────────────────────────────────────────────────────────────────────────────────────────

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(value: string): boolean {
  const m = DATE.exec(value || "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Today as yyyy-MM-dd, in the device's own calendar. */
export function todayStr(now = new Date()): string {
  return fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** A date plus whole calendar months, the day clamped to the target month's length (Jan 31 + 1 → Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysIn(ny, nm)));
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** When an account stops working: its creation date plus the plan's validity. */
export function expiryOf(createdOn: string, validityMonths = DEFAULT_FLOW_SETTINGS.validityMonths): string {
  return addMonths(createdOn, validityMonths);
}

/**
 * The start of the account's current credit cycle: the latest monthly anniversary of its creation
 * date that is not after today. Credits refresh on that day each month (the subscription's own cycle).
 */
export function cycleStartOf(createdOn: string, today: string): string {
  if (!isDate(createdOn) || today <= createdOn) return createdOn;
  const [cy, cm] = parts(createdOn);
  const [ty, tm] = parts(today);
  let months = (ty - cy) * 12 + (tm - cm);
  let start = addMonths(createdOn, months);
  while (start > today) start = addMonths(createdOn, --months);
  return start;
}

/** The day the credits next refresh. */
export function nextResetOf(createdOn: string, today: string): string {
  const start = cycleStartOf(createdOn, today);
  const [cy, cm] = parts(createdOn);
  const [sy, sm] = parts(start);
  return addMonths(createdOn, (sy - cy) * 12 + (sm - cm) + 1);
}

// ── Credits ───────────────────────────────────────────────────────────────────────────────────────

/** What a set of clips costs. */
export function creditsFor(rows: FlowClipRow[], settings: FlowSettings = DEFAULT_FLOW_SETTINGS): number {
  return rows.reduce((sum, row) => {
    const count = Math.max(0, Math.floor(Number(row.count) || 0));
    return sum + count * (settings.clipCredits[row.seconds] ?? 0);
  }, 0);
}

/** A job's starting entry: its clip count, every clip 8 seconds — the generator's own plan. */
export function defaultRowsFor(clipCount: number): FlowClipRow[] {
  return [{ seconds: 8, count: Math.max(1, Math.floor(clipCount) || 1) }];
}

export interface AccountState {
  cycleStart: string;
  nextReset: string;
  monthly: number;
  used: number;
  remaining: number;
  expired: boolean;
  /** Days until expiry (negative once expired). */
  daysToExpiry: number;
  /** Usable for new work: active, not expired, credits left. */
  usable: boolean;
}

/**
 * Whether any credits are recorded on the account. Its cycles start on its creation day and its totals
 * are kept per cycle (`usedByCycle`, and each ledger entry's `cycleStart`), so once credits exist the
 * creation date can no longer move — "this cycle" would move away from what was recorded in it.
 */
export function hasRecordedCredits(account: Pick<FlowAccount, "usedByCycle"> | null | undefined): boolean {
  return Object.values(account?.usedByCycle || {}).some((n) => Number(n) > 0);
}

/** Where an account stands today. */
export function accountState(account: Pick<FlowAccount, "createdOn" | "expiresOn" | "monthlyCredits" | "usedByCycle" | "status">, today: string): AccountState {
  const cycleStart = cycleStartOf(account.createdOn, today);
  const monthly = account.monthlyCredits || DEFAULT_FLOW_SETTINGS.monthlyCredits;
  const used = Math.max(0, account.usedByCycle?.[cycleStart] || 0);
  const expired = !!account.expiresOn && today >= account.expiresOn;
  const remaining = Math.max(0, monthly - used);
  return {
    cycleStart,
    nextReset: nextResetOf(account.createdOn, today),
    monthly,
    used,
    remaining,
    expired,
    daysToExpiry: account.expiresOn ? daysBetween(today, account.expiresOn) : Infinity,
    usable: account.status !== "disabled" && !expired && remaining > 0,
  };
}

/** How many clips of each length a number of credits buys — the credit calculator. */
export function clipsAffordable(credits: number, settings: FlowSettings = DEFAULT_FLOW_SETTINGS): Record<FlowClipSeconds, number> {
  const out = {} as Record<FlowClipSeconds, number>;
  for (const sec of FLOW_CLIP_SECONDS) out[sec] = Math.floor(Math.max(0, credits) / (settings.clipCredits[sec] || Infinity));
  return out;
}

// ── The target ────────────────────────────────────────────────────────────────────────────────────

export interface TargetProgress {
  target: number;
  added: number;
  remaining: number;
  /** Days left to the deadline, today included (0 once it has passed). */
  daysLeft: number;
  /** How many should have been added by today at the daily pace. */
  expectedByNow: number;
  /** Accounts a day needed from today to make the target. */
  perDayNeeded: number;
  status: "done" | "ahead" | "on_track" | "behind" | "missed";
}

/** Where a member stands against the account target, today. */
export function targetProgress(added: number, settings: FlowSettings, today: string): TargetProgress {
  const target = settings.targetPerMember;
  const remaining = Math.max(0, target - added);
  const daysLeft = Math.max(0, daysBetween(today, settings.deadline) + 1);
  const elapsed = Math.max(0, daysBetween(settings.campaignStart, today) + 1);
  const expectedByNow = Math.min(target, elapsed * settings.dailyTarget);
  const perDayNeeded = remaining === 0 ? 0 : daysLeft === 0 ? remaining : Math.ceil(remaining / daysLeft);
  const status: TargetProgress["status"] = remaining === 0
    ? "done"
    : daysLeft === 0
      ? "missed"
      : added > expectedByNow ? "ahead" : added === expectedByNow ? "on_track" : "behind";
  return { target, added, remaining, daysLeft, expectedByNow, perDayNeeded, status };
}

// ── Input ─────────────────────────────────────────────────────────────────────────────────────────

export function normaliseEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(normaliseEmail(email));
}

/** The login phone as ten digits — "+91 98765-43210" → "9876543210" — or "" when it is not one. */
export function normalisePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : "";
}

export interface FlowAccountInput {
  email: string;
  password: string;
  phone: string;
  createdOn: string;
}

/** What is wrong with a new account, field by field — {} when it can be saved. */
export function validateFlowAccountInput(input: FlowAccountInput, today: string, options: { passwordRequired?: boolean } = {}): Partial<Record<keyof FlowAccountInput, string>> {
  const errors: Partial<Record<keyof FlowAccountInput, string>> = {};
  if (!isValidEmail(input.email)) errors.email = "Enter the account's full email address.";
  if ((options.passwordRequired ?? true) && !input.password.trim()) errors.password = "Enter the account's password.";
  if (!normalisePhone(input.phone)) errors.phone = "Enter the 10-digit mobile number the account logs in with.";
  if (!isDate(input.createdOn)) errors.createdOn = "Pick the day the account was created.";
  else if (input.createdOn > today) errors.createdOn = "The creation date cannot be in the future.";
  return errors;
}

// ── Who sees and manages what ─────────────────────────────────────────────────────────────────────

/** The tech admin whose team someone belongs to — every account is filed under it. */
export function teamAdminIdOf(user: Pick<AppUser, "uid" | "role" | "createdBy"> | null | undefined): string {
  if (!user) return "";
  return user.role === "tech_admin" || user.role === "main_admin" ? user.uid : user.createdBy || user.uid;
}

/** The tech admin and team leaders manage every account of their team — Flow and paid. */
export function canManageAiAccounts(user: Pick<AppUser, "role"> | null | undefined): boolean {
  return user?.role === "tech_admin" || user?.role === "tech_team_leader" || user?.role === "main_admin";
}

/** A member sees what they added, own, or hold; a manager sees everything. */
export function canSeeFlowAccount(user: Pick<AppUser, "uid" | "role"> | null | undefined, account: Pick<FlowAccount, "visibleTo">): boolean {
  if (!user) return false;
  return canManageAiAccounts(user) || (account.visibleTo || []).includes(user.uid);
}

/** The visibility list an account needs: whoever added it, owns it and holds it. */
export function visibilityOf(account: Pick<FlowAccount, "addedBy" | "ownerId" | "holderId">): string[] {
  return [...new Set([account.addedBy, account.ownerId, account.holderId].filter(Boolean))];
}

/**
 * The account a credit entry starts on: the member's "using now" account when it still has credits,
 * else the one with the most credits left that they hold — "" when none is usable.
 */
export function pickDefaultAccount(accounts: FlowAccount[], activeId: string | undefined, uid: string, today: string): string {
  const held = accounts.filter((a) => a.holderId === uid);
  const active = held.find((a) => a.id === activeId);
  if (active && accountState(active, today).usable) return active.id;
  const usable = held
    .map((a) => ({ a, s: accountState(a, today) }))
    .filter(({ s }) => s.usable)
    .sort((x, y) => y.s.remaining - x.s.remaining);
  return usable[0]?.a.id || "";
}

/** One member's line on the overview. */
export interface MemberAccountSummary {
  uid: string;
  name: string;
  /** Accounts they opened (counted toward the target). */
  added: number;
  /** Accounts they hold now. */
  holding: number;
  /** Credits left this cycle across the accounts they hold (usable ones). */
  remaining: number;
  /** Credits used this cycle on the accounts they hold. */
  used: number;
  /** Accounts they opened that carry a Gemini API key Google has not refused (2026-10-10). */
  apiKeys: number;
  progress: TargetProgress;
}

export function memberSummaries(
  accounts: FlowAccount[],
  members: Pick<AppUser, "uid" | "name">[],
  settings: FlowSettings,
  today: string,
): MemberAccountSummary[] {
  return members.map((m) => {
    const owned = accounts.filter((a) => a.ownerId === m.uid);
    const held = accounts.filter((a) => a.holderId === m.uid);
    const states = held.map((a) => accountState(a, today));
    return {
      uid: m.uid,
      name: m.name,
      added: owned.length,
      holding: held.length,
      remaining: states.filter((s) => s.usable).reduce((sum, s) => sum + s.remaining, 0),
      used: states.reduce((sum, s) => sum + s.used, 0),
      apiKeys: owned.filter((a) => a.apiKey && a.apiKey.status !== "failed").length,
      progress: targetProgress(owned.length, settings, today),
    };
  });
}

/** The team's totals for the overview cards. */
export function teamTotals(accounts: FlowAccount[], today: string) {
  const live = accounts.filter((a) => a.status !== "disabled");
  const states = live.map((a) => accountState(a, today)).filter((s) => !s.expired);
  return {
    accounts: accounts.length,
    live: states.length,
    capacity: states.reduce((sum, s) => sum + s.monthly, 0),
    used: states.reduce((sum, s) => sum + s.used, 0),
    remaining: states.reduce((sum, s) => sum + s.remaining, 0),
    expiringSoon: states.filter((s) => s.daysToExpiry <= 30).length,
  };
}
