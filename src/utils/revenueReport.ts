import { workCountsOn } from "./workDates";
import { isStaffMember } from "./roleHelpers";
import { lastCalendarDays, revenueByDay, revenueByOwner, revenueTotals, type RevenueTotals } from "./salesRevenue";
import type { AppUser, Lead, WorkAssignment } from "@/types";

/**
 * The revenue report behind the main admin's Revenue Overview and the accounts admin's Revenue Summary — one pure
 * builder, because the two pages were copies of each other and drifted the same way (2026-10-18).
 *
 * ── What it fixed (whole-app audit, D-05 — owner-delegated decision 2026-10-18) ──
 * Both pages added PENDING sales at full value into "Total Revenue", added the tech side's delivered value on top
 * (the same work a second time), showed ALL-TIME cards whatever range was picked, and drew the "7 days" chart from
 * the last 7 dates that HAD data. Now everything on the page follows the range:
 * - revenue = APPROVED sales on the day each was made (`utils/salesRevenue`, the one rule);
 * - sales awaiting approval are their own figure, never inside revenue;
 * - the tech side's delivered value (verified work, on the day the work counts — `workDates.workCountsOn`, the
 *   P&L's rule) is reported beside it, labelled as work value, never added to revenue;
 * - 7 / 30 days are CALENDAR days ending today (a quiet day is a 0); "All" charts every day that had revenue.
 */

export type RevenueRange = "7" | "30" | "all";

export interface RevenueReportRow {
  member: AppUser;
  /** Their approved sales in the range. */
  salesRevenue: number;
  /** The value of their verified work in the range — productivity, not revenue. */
  techDelivered: number;
}

export interface RevenueReport {
  /** Approved revenue and what awaits approval, in the range. */
  totals: RevenueTotals;
  /** Value of verified tech work in the range (not revenue). */
  techDelivered: number;
  /** One point per day: every calendar day of 7 / 30, or every day with revenue for "All". */
  chart: { date: string; revenue: number }[];
  rows: RevenueReportRow[];
}

/** Roles listed per member — the two departments and their admins, as both pages always listed. */
const LISTED_ROLES = new Set(["tech_member", "sales_member", "tech_admin", "sales_admin"]);

export function revenueReport(input: {
  leads: Lead[];
  assignments: WorkAssignment[];
  users: AppUser[];
  range: RevenueRange;
  /** Today, `yyyy-MM-dd` (local, India day). */
  today: string;
}): RevenueReport {
  const { leads, assignments, users, range, today } = input;
  const days = range === "all" ? null : lastCalendarDays(today, Number(range));
  const daySet = days ? new Set(days) : null;
  const inDay = daySet ? (day: string) => daySet.has(day) : null;

  const totals = revenueTotals(leads, { inDay });

  const work = assignments.filter((a) => {
    if (a.status !== "verified") return false;
    if (!inDay) return true;
    const day = workCountsOn(a);
    return !!day && inDay(day);
  });
  const techDelivered = work.reduce((s, a) => s + (a.totalPrice || 0), 0);

  const byDay = revenueByDay(leads);
  const chart = days
    ? days.map((date) => ({ date, revenue: byDay.get(date) ?? 0 }))
    : [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, revenue]) => ({ date, revenue }));

  const byOwner = revenueByOwner(leads, inDay);
  const rows = users
    .filter((u) => isStaffMember(u) && LISTED_ROLES.has(u.role))
    .map((member) => ({
      member,
      salesRevenue: byOwner.get(member.uid) ?? 0,
      techDelivered: work.filter((a) => a.assignedTo === member.uid).reduce((s, a) => s + (a.totalPrice || 0), 0),
    }))
    .filter((r) => r.salesRevenue > 0 || r.techDelivered > 0)
    .sort((a, b) => (b.salesRevenue - a.salesRevenue) || (b.techDelivered - a.techDelivered));

  return { totals, techDelivered, chart, rows };
}

/** "last 7 days" / "last 30 days" / "every day with revenue" — the chart's caption. */
export function rangeCaption(range: RevenueRange): string {
  return range === "all" ? "every day with revenue" : `last ${range} days`;
}
