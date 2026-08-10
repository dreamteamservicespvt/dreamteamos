/**
 * What a tech member produced in a pay period, and what we paid them for it.
 *
 * ── The question this answers ─────────────────────────────────────────────────────────────────
 * "Is this person worth what they cost?" — which nobody could answer from the payroll page,
 * because it showed only the cost. The ratio puts the two halves side by side: the client value of
 * the ads they delivered, and the salary that produced it. At the target of 5%, a member on
 * ₹10,000 has delivered ₹200,000 of work. At 12% they are being paid nearly an eighth of what they
 * made, which is past the margin the business is built on and is a decision someone has to take.
 *
 * ── Why the work has two sources ──────────────────────────────────────────────────────────────
 * Counting work assignments alone would be badly wrong, and quietly so. A bulk order is NOT
 * assigned as work assignments — its videos live as a list of slots on the order itself, each with
 * its own owner (see utils/bulkVideos). A member who spent the month on bulk videos would show as
 * having delivered nothing, and their ratio would read as infinitely bad. So delivered assignments
 * and completed bulk slots are both counted, and they cannot overlap: a bulk order never produces
 * an assignment, and an assignment never carries bulk slots.
 *
 * ── Why a social-media month is counted by its ads ────────────────────────────────────────────
 * It is one assignment covering a month of work. Counting it as "1 video" would under-report the
 * member holding the ad-creation track by an order of magnitude. A track has exactly one owner, so
 * the ads counter can be attributed to that person without ambiguity — and only to them, which is
 * what stops the same ads being counted again for whoever holds the uploading track.
 *
 * Pure and Firestore-free: this decides whether somebody keeps their job, so it is testable.
 */
import { withinPeriod, type PeriodFilter } from "./periodFilter";
import { deliveryDate } from "./workDates";
import { isBulkVideoOrder, bulkVideosOf } from "./bulkVideos";
import type { Order, WorkAssignment } from "@/types";

/** The band a pay-to-work ratio falls in. */
export type RatioBand = "on_target" | "watch" | "over";

/**
 * Where the bands sit.
 *
 * 5% is the target the business is priced around. Up to 10% is worth watching but is not yet a
 * problem — a new member still learning, or a quiet month, lands here. Past 10% we are paying out
 * more than a tenth of what the person produced, which is beyond the estimated margin.
 */
export const RATIO_TARGET = 5;
export const RATIO_LIMIT = 10;

export interface MemberProductivity {
  /** Ads actually delivered — bulk videos counted individually, a monthly job by its ads. */
  videos: number;
  /** Client value of that work, in rupees. */
  workValue: number;
  /** The salary the ratio is measured against — see `payToDate`. */
  pay: number;
  /**
   * Pay as a percentage of the value produced. Null when there is no work to divide by — an
   * undefined ratio, which must never be drawn as 0% (the best possible score) for someone who
   * delivered nothing.
   */
  ratioPercent: number | null;
  /** True while the pay period is still running, so the figures are "so far" rather than final. */
  inProgress: boolean;
}

/**
 * The salary to weigh the work against.
 *
 * ── The trap this exists to avoid ─────────────────────────────────────────────────────────────
 * A pay period is labelled by the month it starts in and starts on the 10th, so the period the
 * payroll page opens on is usually one that is still running — on payday itself it is one day old.
 * Measuring a WHOLE month's salary against one day's output makes every member look ruinous, and
 * the number this feature exists to provide would be red for everybody for most of every month.
 * Nobody would trust it twice.
 *
 * So while a period is in flight the cost is taken to date: a third of the way through, a third of
 * the salary. Both halves of the ratio then describe the same elapsed time, the figure is stable
 * from the first week, and it converges on the true one as the period closes.
 */
export function payToDate(
  monthlyPay: number,
  period: { start: string; end: string },
  today = new Date(),
): { pay: number; inProgress: boolean } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (iso > period.end) return { pay: monthlyPay, inProgress: false };
  if (iso < period.start) return { pay: 0, inProgress: true };

  const day = 86400000;
  const total = Math.round((Date.parse(period.end) - Date.parse(period.start)) / day) + 1;
  const elapsed = Math.round((Date.parse(iso) - Date.parse(period.start)) / day) + 1;
  if (total <= 0) return { pay: monthlyPay, inProgress: false };

  return { pay: (monthlyPay * Math.min(elapsed, total)) / total, inProgress: true };
}

/** How many videos a delivered assignment represents, and to whom. */
function videosForAssignment(assignment: WorkAssignment, order: Order | undefined, uid: string): number {
  const progress = order?.progress;
  // A social-media month: only the holder of the ad-creation track earns its ads.
  if (progress?.kind === "smm") {
    return progress.tracks?.ad_creation?.uid === uid ? (progress.done?.ads || 0) : 1;
  }
  return 1;
}

export interface ProductivityInput {
  uid: string;
  /** Salary for the period — already reduced to date by `payToDate` when it is still running. */
  pay: number;
  /** Passed straight through, so the UI can say "so far" rather than presenting a part-month as final. */
  inProgress?: boolean;
  /** Every assignment; filtered here by assignee, delivery and period. */
  assignments: WorkAssignment[];
  /**
   * Orders, for the two things assignments cannot say: whether a job is a social-media month, and
   * the bulk videos that never became assignments at all. Safe to pass an empty list — the result
   * then covers ordinary ad work only.
   */
  orders?: Order[];
  filter: PeriodFilter;
}

/** Seconds → `yyyy-MM-dd`, for the completion stamps on bulk video slots. */
function dayOf(ts: unknown): string | undefined {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return undefined;
  const ms = typeof t.toMillis === "function" ? t.toMillis()
    : typeof t.seconds === "number" ? t.seconds * 1000
    : NaN;
  if (!Number.isFinite(ms)) return undefined;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function memberProductivity(input: ProductivityInput): MemberProductivity {
  const { uid, pay, assignments, filter } = input;
  const orders = input.orders ?? [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  let videos = 0;
  let workValue = 0;

  for (const a of assignments) {
    if (a.assignedTo !== uid) continue;
    if (a.status !== "completed" && a.status !== "verified") continue;
    if (!withinPeriod(deliveryDate(a) ?? undefined, filter)) continue;
    videos += videosForAssignment(a, a.orderId ? orderById.get(a.orderId) : undefined, uid);
    workValue += a.totalPrice || 0;
  }

  /**
   * Bulk videos, which exist only on the order.
   *
   * Valued at the order's per-video price rather than its total: a member who did three of ten
   * videos produced three videos' worth of value, and charging them the whole order would make one
   * person's ratio look extraordinary and everyone else's look poor.
   */
  for (const order of orders) {
    if (!isBulkVideoOrder(order)) continue;
    const slots = bulkVideosOf(order);
    const unit = order.unitAmount
      || (slots.length ? Math.round((order.amount || 0) / slots.length) : 0);

    for (const slot of slots) {
      if (slot.assignedTo !== uid || slot.status !== "completed") continue;
      if (!withinPeriod(dayOf(slot.completedAt), filter)) continue;
      videos += 1;
      workValue += unit;
    }
  }

  return {
    videos,
    workValue,
    pay,
    ratioPercent: workValue > 0 ? (pay / workValue) * 100 : null,
    inProgress: input.inProgress ?? false,
  };
}

/** Which band a ratio sits in. An undefined ratio is treated as over — nothing was produced. */
export function ratioBand(ratioPercent: number | null): RatioBand {
  if (ratioPercent === null) return "over";
  if (ratioPercent <= RATIO_TARGET) return "on_target";
  if (ratioPercent <= RATIO_LIMIT) return "watch";
  return "over";
}

export const RATIO_BAND_STYLE: Record<RatioBand, { className: string; label: string }> = {
  on_target: {
    className: "bg-success/15 text-success",
    label: `On target (≤${RATIO_TARGET}%)`,
  },
  watch: {
    className: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    label: `Above the ${RATIO_TARGET}% target`,
  },
  over: {
    className: "bg-destructive/15 text-destructive",
    label: `Beyond the ${RATIO_LIMIT}% margin`,
  },
};

/** The ratio as it should be printed. Says so plainly when there is nothing to divide by. */
export function formatRatio(ratioPercent: number | null): string {
  return ratioPercent === null ? "No work delivered" : `${ratioPercent.toFixed(1)}%`;
}
