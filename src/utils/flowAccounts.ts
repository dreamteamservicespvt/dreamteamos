/**
 * The rules of the Flow Accounts section — pure, so every one of them is unit-tested.
 *
 * ── The credit month ────────────────────────────────────────────────────────────────────────────
 * A Google AI Pro account gets its 1,000 credits per month on the day of the month the account (its
 * subscription) began — an account made on the 3rd refills on the 3rd. So every account has its own
 * credit month, from that day to the day before the next, and spending is recorded against the month
 * it fell in. A month that does not have the day (the 31st in June) refills on its last day.
 *
 * ── Which account to use next ───────────────────────────────────────────────────────────────────
 * Credits do not carry over: whatever is left when an account refills is lost. So when one account
 * runs out, the next one to use is the one whose month ENDS soonest and still has credits — spend the
 * credits that are about to disappear first. More credits left breaks a tie.
 */
import type {
  FlowAccount, FlowClipCounts, FlowCreditLog, FlowSettings, WorkFlowCredits,
} from "@/types/flowAccounts";

/** The drive as announced: 30 accounts each by 29 October, two a day; Google AI Pro's credits and price list. */
export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  targetPerMember: 30,
  dailyGoal: 2,
  driveStart: "2026-09-29",
  driveDeadline: "2026-10-29",
  monthlyCredits: 1000,
  validityMonths: 18,
  clipCosts: { s10: 15, s8: 12, s6: 10, s4: 7 },
};

/** The clip lengths, longest first, as a form lists them. */
export const CLIP_LENGTHS: { key: keyof FlowClipCounts; seconds: number }[] = [
  { key: "s10", seconds: 10 },
  { key: "s8", seconds: 8 },
  { key: "s6", seconds: 6 },
  { key: "s4", seconds: 4 },
];

export const NO_CLIPS: FlowClipCounts = { s10: 0, s8: 0, s6: 0, s4: 0 };

/** Settings as stored, with every field the code relies on present and sane. */
export function withFlowDefaults(raw?: Partial<FlowSettings> | null): FlowSettings {
  const d = DEFAULT_FLOW_SETTINGS;
  const n = (v: unknown, fallback: number, min = 0) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : fallback);
  const day = (v: unknown, fallback: string) => (typeof v === "string" && ISO_DAY.test(v) ? v : fallback);
  const costs = raw?.clipCosts || ({} as Partial<FlowClipCounts>);
  return {
    targetPerMember: Math.round(n(raw?.targetPerMember, d.targetPerMember, 1)),
    dailyGoal: Math.round(n(raw?.dailyGoal, d.dailyGoal, 1)),
    driveStart: day(raw?.driveStart, d.driveStart),
    driveDeadline: day(raw?.driveDeadline, d.driveDeadline),
    monthlyCredits: Math.round(n(raw?.monthlyCredits, d.monthlyCredits, 1)),
    validityMonths: Math.round(n(raw?.validityMonths, d.validityMonths, 1)),
    clipCosts: {
      s10: n(costs.s10, d.clipCosts.s10, 1),
      s8: n(costs.s8, d.clipCosts.s8, 1),
      s6: n(costs.s6, d.clipCosts.s6, 1),
      s4: n(costs.s4, d.clipCosts.s4, 1),
    },
  };
}

// ── Dates (yyyy-MM-dd strings, calendar arithmetic only — no time zones involved) ─────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};
const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** True for a real calendar day written yyyy-MM-dd. */
export function isIsoDay(value: string | null | undefined): boolean {
  if (!value || !ISO_DAY.test(value)) return false;
  const { y, m, d } = parts(value);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** The local calendar day of a Date, yyyy-MM-dd. */
export function isoToday(now: Date = new Date()): string {
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * `months` calendar months after `iso`, on the same day — or the month's last day when it has fewer
 * (31 Jan + 1 month = 28 or 29 Feb). The day is always taken from the ORIGINAL date, so a chain of
 * months never drifts: 31 Jan → 28 Feb → 31 Mar.
 */
export function addMonths(iso: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parts(iso);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return isoOf(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** The day the offer ends: created on + the validity, 18 months by default. */
export function expiryFor(createdOn: string, validityMonths = DEFAULT_FLOW_SETTINGS.validityMonths): string {
  return addMonths(createdOn, validityMonths);
}

/**
 * The first day of the account's credit month that contains `today` — see the header. Before the
 * account began, its first month is the one it starts in.
 */
export function creditCycleStart(createdOn: string, today: string): string {
  if (daysBetween(createdOn, today) <= 0) return createdOn;
  const anchor = parts(createdOn).d;
  const c = parts(createdOn);
  const t = parts(today);
  let k = (t.y - c.y) * 12 + (t.m - c.m);
  let start = addMonths(createdOn, k, anchor);
  if (daysBetween(start, today) < 0) start = addMonths(createdOn, --k, anchor);
  return start;
}

/** The day the account's credits refill next — the start of its next credit month. */
export function nextRefill(createdOn: string, today: string): string {
  const start = creditCycleStart(createdOn, today);
  const anchor = parts(createdOn).d;
  const months = (parts(start).y - parts(createdOn).y) * 12 + (parts(start).m - parts(createdOn).m);
  return addMonths(createdOn, months + 1, anchor);
}

// ── Credits ──────────────────────────────────────────────────────────────────────────────────

/** What a set of clips costs on the price list. */
export function creditsForClips(clips: Partial<FlowClipCounts>, costs: FlowClipCounts = DEFAULT_FLOW_SETTINGS.clipCosts): number {
  return CLIP_LENGTHS.reduce((sum, { key }) => sum + Math.max(0, Math.floor(Number(clips[key]) || 0)) * costs[key], 0);
}

/** How many clips of each length a number of credits buys. */
export function clipsAffordable(credits: number, costs: FlowClipCounts = DEFAULT_FLOW_SETTINGS.clipCosts): FlowClipCounts {
  const c = Math.max(0, Math.floor(credits || 0));
  return { s10: Math.floor(c / costs.s10), s8: Math.floor(c / costs.s8), s6: Math.floor(c / costs.s6), s4: Math.floor(c / costs.s4) };
}

/** The clips an ad of `clipCount` 8-second clips uses by default — what the form starts from. */
export function defaultClips(clipCount: number): FlowClipCounts {
  return { ...NO_CLIPS, s8: Math.max(0, Math.round(clipCount || 0)) };
}

/** The cheapest clip — below this an account cannot make anything. */
export function cheapestClip(costs: FlowClipCounts = DEFAULT_FLOW_SETTINGS.clipCosts): number {
  return Math.min(costs.s10, costs.s8, costs.s6, costs.s4);
}

export type FlowAccountState = "active" | "low" | "empty" | "expired" | "blocked";

export interface FlowAccountBalance {
  /** First day of the current credit month. */
  cycleStart: string;
  /** The day the credits refill. */
  refillsOn: string;
  used: number;
  remaining: number;
  expired: boolean;
  /** Days until the offer ends (negative once it has). */
  daysToExpiry: number;
  state: FlowAccountState;
}

/** An account's credits and standing today. */
export function accountBalance(account: Pick<FlowAccount, "createdOn" | "expiresOn" | "monthlyCredits" | "status" | "used">, today: string, costs?: FlowClipCounts): FlowAccountBalance {
  const cycleStart = creditCycleStart(account.createdOn, today);
  const used = Math.max(0, Math.round(account.used?.[cycleStart] || 0));
  const remaining = Math.max(0, (account.monthlyCredits || 0) - used);
  const daysToExpiry = daysBetween(today, account.expiresOn);
  const expired = daysToExpiry < 0;
  const state: FlowAccountState = account.status === "blocked" ? "blocked"
    : expired ? "expired"
      : remaining < cheapestClip(costs) ? "empty"
        : remaining < (account.monthlyCredits || 0) * 0.15 ? "low"
          : "active";
  return { cycleStart, refillsOn: nextRefill(account.createdOn, today), used, remaining, expired, daysToExpiry, state };
}

/** Who holds an account: whoever it was assigned to, else whoever added it. */
export function holderOf(account: Pick<FlowAccount, "assignedTo" | "addedBy">): string {
  return account.assignedTo || account.addedBy;
}

/** True when this member may make videos on the account today. */
export function canUseAccount(account: FlowAccount, uid: string, today: string): boolean {
  if (holderOf(account) !== uid) return false;
  const balance = accountBalance(account, today);
  return balance.state !== "expired" && balance.state !== "blocked";
}

/**
 * The account a member should use next — see the header: credits that are about to be lost first.
 * Null when none of their accounts has a clip's worth of credits left.
 */
export function nextAccountToUse(accounts: FlowAccount[], uid: string, today: string, options: { exclude?: string; costs?: FlowClipCounts } = {}): FlowAccount | null {
  const minimum = cheapestClip(options.costs);
  const usable = accounts
    .filter((a) => a.id !== options.exclude && canUseAccount(a, uid, today))
    .map((a) => ({ a, b: accountBalance(a, today, options.costs) }))
    .filter(({ b }) => b.remaining >= minimum)
    .sort((x, y) => daysBetween(today, x.b.refillsOn) - daysBetween(today, y.b.refillsOn) || y.b.remaining - x.b.remaining);
  return usable[0]?.a ?? null;
}

// ── The drive: 30 accounts each, two a day ────────────────────────────────────────────────────

export interface DriveProgress {
  target: number;
  done: number;
  addedToday: number;
  dailyGoal: number;
  /** How many the daily pace would have reached by today. */
  expectedByToday: number;
  /** How far behind that pace (0 when on or ahead of it). */
  behindBy: number;
  /** Days left to the deadline, counting today. */
  daysLeft: number;
  /** Accounts a day still needed to reach the target by the deadline. */
  neededPerDay: number;
  status: "done" | "on_track" | "behind" | "overdue" | "not_started";
}

/**
 * Where a member stands against the drive: the target, the daily pace and the deadline.
 *
 * `createdOnDates` are the days the member's accounts were made (or added) — today's count comes from
 * them. The pace starts the day the drive started: two a day reaches thirty on day fifteen, which
 * leaves the rest of the month as the buffer the team was promised.
 */
export function driveProgress(addedOnDates: string[], settings: FlowSettings, today: string): DriveProgress {
  const target = settings.targetPerMember;
  const done = addedOnDates.length;
  const addedToday = addedOnDates.filter((d) => d === today).length;
  const dayOfDrive = daysBetween(settings.driveStart, today) + 1;
  const expectedByToday = dayOfDrive <= 0 ? 0 : Math.min(target, dayOfDrive * settings.dailyGoal);
  const behindBy = Math.max(0, expectedByToday - done);
  const daysLeft = Math.max(0, daysBetween(today, settings.driveDeadline) + 1);
  const remaining = Math.max(0, target - done);
  const neededPerDay = remaining === 0 ? 0 : daysLeft === 0 ? remaining : Math.ceil(remaining / daysLeft);
  const status: DriveProgress["status"] = done >= target ? "done"
    : daysLeft === 0 ? "overdue"
      : dayOfDrive <= 0 ? "not_started"
        : behindBy > 0 ? "behind"
          : "on_track";
  return { target, done, addedToday, dailyGoal: settings.dailyGoal, expectedByToday, behindBy, daysLeft, neededPerDay, status };
}

// ── Adding an account ─────────────────────────────────────────────────────────────────────────

export interface FlowAccountInput {
  email: string;
  password: string;
  authPhone: string;
  createdOn: string;
}

/** The email as stored: trimmed and lower-cased. */
export function normaliseEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/**
 * The account's document id, from its email — so the same Google account can never be recorded twice,
 * by two members or by one member twice. Firestore ids cannot contain "/", which no email has.
 */
export function flowAccountDocId(email: string): string {
  return normaliseEmail(email).replace(/[^a-z0-9@._+-]/g, "_");
}

/** The digits of an Indian mobile number, or "" when it is not one. */
export function indianMobileDigits(phone: string): string {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

/** What is wrong with a new account's details, field by field — {} when it can be saved. */
export function validateFlowAccountInput(input: FlowAccountInput, today: string): Partial<Record<keyof FlowAccountInput, string>> {
  const errors: Partial<Record<keyof FlowAccountInput, string>> = {};
  const email = normaliseEmail(input.email);
  if (!email) errors.email = "Enter the account's email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That is not a valid email address.";
  if (!input.password?.trim()) errors.password = "Enter the account's password.";
  if (!input.authPhone?.trim()) errors.authPhone = "Enter the phone number used to sign in.";
  else if (!indianMobileDigits(input.authPhone)) errors.authPhone = "Enter a 10-digit Indian mobile number.";
  if (!isIsoDay(input.createdOn)) errors.createdOn = "Pick the day the account was created.";
  else if (daysBetween(today, input.createdOn) > 0) errors.createdOn = "The creation date cannot be in the future.";
  return errors;
}

// ── Asking at hand-in ─────────────────────────────────────────────────────────────────────────

/**
 * Whether handing a job in asks for its Flow credits, and how.
 *
 * "first" — nothing is recorded on the job yet. "again" — credits were recorded in an earlier round:
 * the job was sent back for edits, its completion was undone, or it was reassigned, and the clips made
 * again cost credits too — so it asks again, shows what is already on the job, and "none this round"
 * is one click. null — a poster (made in ChatGPT, not Flow), someone else's job, or a question already
 * answered in this sitting: a hand-in that failed and is being retried must not log the same clips twice.
 */
export function flowCreditsQuestion(
  job: { category?: string; assignedTo?: string; flowCredits?: WorkFlowCredits | null } | null | undefined,
  viewerUid: string | null | undefined,
  answeredThisSitting: boolean,
): "first" | "again" | null {
  if (!job || !viewerUid || job.assignedTo !== viewerUid) return null;
  if (job.category === "poster" || answeredThisSitting) return null;
  return job.flowCredits ? "again" : "first";
}

// ── Reading the spend ─────────────────────────────────────────────────────────────────────────

/** Credits spent in total across a set of logs. */
export function totalCredits(logs: Pick<FlowCreditLog, "credits">[]): number {
  return logs.reduce((sum, l) => sum + Math.max(0, l.credits || 0), 0);
}

/** "8s × 4 · 10s × 1" — a log's clips in a line. */
export function clipsSummary(clips: Partial<FlowClipCounts>): string {
  const bits = CLIP_LENGTHS.filter(({ key }) => (clips[key] || 0) > 0).map(({ key, seconds }) => `${seconds}s × ${clips[key]}`);
  return bits.length ? bits.join(" · ") : "no clips";
}

/** Masks a password for display: the first and last character, dots between. */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 2) return "•".repeat(secret.length);
  return `${secret[0]}${"•".repeat(Math.min(10, secret.length - 2))}${secret[secret.length - 1]}`;
}
