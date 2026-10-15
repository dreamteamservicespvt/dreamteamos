/**
 * What a person was paid on in a given pay period — their salary, their daily sales target and their
 * earnings plan — and from when (owner, 2026-10-15).
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 * `users.salary`, `dailyTarget` and `earningsOption` were each ONE value, read for every period. A raise
 * saved on 1 October therefore re-priced the still-unpaid September in full, and the August payment —
 * which was right — was flagged "Now ₹18,000 … undo this payment and pay again". A new target or plan did
 * the same to the 75% gate and the incentive rate of every earlier period.
 *
 * Every change now says which pay period it applies from (`AppUser.payHistory`), and every screen that
 * prices a period asks `payTermsFor(user, period)`. Paid periods stay frozen in their payment record
 * (`payroll_lines.computation`); the "Now ₹X" check compares them with what applied IN that period.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────────────────────
 * For period P: of the changes that apply from P or earlier, the most recently SAVED one decides. With
 * none (P is before every recorded change) the terms in force before the first change apply — the
 * `previous` it recorded. With no history at all, today's fields apply to every period: exactly the old
 * behaviour, so nothing has to be migrated.
 *
 * "Most recently saved" rather than "latest `from`": a change applies from its period ONWARDS, so a later
 * decision ("16,000 from September") also covers the periods after it. It is also what keeps the stored
 * fields — always the latest change — equal to what the resolver says for any period after it.
 *
 * Pure: no Firestore, no clock.
 */
import { dailyTargetOf } from "@/utils/salesTargets";
import { commissionRate } from "@/utils/salesIncentive";
import { payPeriodForDate, payPeriodLabel, shiftPayMonth } from "@/utils/payrollEngine";
import type { AppUser, PayTermsChange, PayTermsSnapshot } from "@/types";

/** The terms that applied in one period. */
export interface PayTerms {
  salary: number;
  /** 0 = no target (nothing withheld). */
  dailyTarget: number;
  earningsOption?: "stipend_plus_5" | "incentive_10";
}

export type PayTermsBearer = Partial<Pick<AppUser, "salary" | "dailyTarget" | "monthlyTarget" | "earningsOption" | "payHistory">>;

const PERIOD = /^\d{4}-\d{2}$/;

/** The person's stored fields — the latest terms. */
function storedTerms(user: PayTermsBearer | null | undefined): PayTerms {
  return {
    salary: Number(user?.salary) || 0,
    dailyTarget: dailyTargetOf(user as Pick<AppUser, "dailyTarget" | "monthlyTarget"> | undefined),
    earningsOption: user?.earningsOption || undefined,
  };
}

function snapshotTerms(s: PayTermsSnapshot): PayTerms {
  return {
    salary: Number(s.salary) || 0,
    dailyTarget: typeof s.dailyTarget === "number" && s.dailyTarget > 0 ? Math.round(s.dailyTarget) : 0,
    earningsOption: s.earningsOption || undefined,
  };
}

/** The recorded changes worth reading, oldest saved first. A malformed entry is ignored, never guessed at. */
export function payHistoryOf(user: PayTermsBearer | null | undefined): PayTermsChange[] {
  const list = Array.isArray(user?.payHistory) ? user!.payHistory! : [];
  return list
    .filter(c => c && PERIOD.test(String(c.from)) && typeof c.salary === "number")
    .slice()
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}

/** What applied in pay period `period` (`yyyy-MM`). */
export function payTermsFor(user: PayTermsBearer | null | undefined, period: string): PayTerms {
  const history = payHistoryOf(user);
  if (history.length === 0) return storedTerms(user);
  let applied: PayTermsChange | null = null;
  for (const change of history) if (change.from <= period) applied = change; // oldest saved first → the last wins
  if (applied) return snapshotTerms(applied);
  // Before every recorded change: the terms in force before the first one was made.
  const first = history[0];
  return first.previous ? snapshotTerms(first.previous) : storedTerms(user);
}

/** The monthly salary that applied in `period`. */
export function salaryFor(user: PayTermsBearer | null | undefined, period: string): number {
  return payTermsFor(user, period).salary;
}

/**
 * The pay period whose terms price something dated `day` (`yyyy-MM-dd`): the period that day falls in,
 * never later than the period running today. No day (or a day still to come) → the running period.
 *
 * ── Why (2026-10-15) ──────────────────────────────────────────────────────────────────────────
 * Screens that only DISPLAY pay read today's `users.salary` / `earningsOption` for any date. A raise saved
 * today made every earlier cycle look worse, and a change agreed for NEXT period (the stored fields are
 * the latest change, whatever period it applies from) re-priced the one running now.
 * - Work Done / Member History (revenue against salary): pass the LAST day shown — one period shown →
 *   that period's salary; a range over several → the latest one in it (the ratio stays "revenue against
 *   a monthly salary", as before); an open-ended range ("All time", "All") → the running period.
 * - The renewals card (commission a renewal is worth): pass the day the money is (or would be)
 *   collected — a renewal still to come is priced at the running period's terms, the only ones known now.
 */
export function termsPeriodOn(
  day: string | null | undefined,
  todayStr: string,
  cycleStartDay?: number,
): string {
  const priced = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= todayStr ? day : todayStr;
  const [y, m, d] = priced.split("-").map(Number);
  return payPeriodForDate(new Date(y, m - 1, d), cycleStartDay).month;
}

/** The incentive rate (percent) and daily target that applied in `period` — what the commission rule reads. */
export function commissionTermsFor(user: PayTermsBearer | null | undefined, period: string): { rate: number; dailyTarget: number } {
  const terms = payTermsFor(user, period);
  return { rate: commissionRate(terms.earningsOption), dailyTarget: terms.dailyTarget };
}

/**
 * The terms an edit would leave in force, as a change to record — or null when the edit changes none of
 * them (a name or a phone edited on the same form records nothing).
 */
export function payTermsChange(input: {
  /** The person as stored right now. */
  current: PayTermsBearer;
  /** What the form saves. A field left out keeps its stored value. */
  next: Partial<PayTermsSnapshot>;
  /** The pay period the new terms apply from. */
  from: string;
  at: number;
  by?: { uid?: string | null; name?: string | null } | null;
}): PayTermsChange | null {
  if (!PERIOD.test(input.from)) throw new Error(`"${input.from}" is not a pay period (yyyy-MM).`);
  const before = storedTerms(input.current);
  const previous: PayTermsSnapshot = {
    salary: before.salary,
    dailyTarget: before.dailyTarget || null,
    earningsOption: before.earningsOption ?? null,
  };
  const after: PayTermsSnapshot = {
    salary: input.next.salary !== undefined ? Math.max(0, Math.round(Number(input.next.salary) || 0)) : previous.salary,
    dailyTarget: input.next.dailyTarget !== undefined
      ? (Number(input.next.dailyTarget) > 0 ? Math.round(Number(input.next.dailyTarget)) : null)
      : previous.dailyTarget,
    earningsOption: input.next.earningsOption !== undefined ? (input.next.earningsOption || null) : previous.earningsOption,
  };
  const same = after.salary === previous.salary
    && (after.dailyTarget || 0) === (previous.dailyTarget || 0)
    && (after.earningsOption || null) === (previous.earningsOption || null);
  if (same) return null;
  return {
    ...after,
    from: input.from,
    previous,
    at: input.at,
    byUid: input.by?.uid ?? null,
    byName: input.by?.name ?? null,
  };
}

/**
 * The pay periods an "Applies from" picker offers: two back (a correction to a period still being paid)
 * to three ahead (a raise agreed in advance), around the period running now — the default.
 */
export function applyFromChoices(runningPeriod: string): { value: string; label: string }[] {
  return [-2, -1, 0, 1, 2, 3].map(delta => {
    const value = shiftPayMonth(runningPeriod, delta);
    const label = payPeriodLabel(value);
    return { value, label: delta === 0 ? `${label} — running now` : label };
  });
}
