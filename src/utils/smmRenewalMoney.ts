/**
 * Social-media renewals in numbers — for the salesperson's card and the admins' Money tab (2026-10-05).
 *
 * ── What the owner asked for ──────────────────────────────────────────────────────────────────
 * A salesperson must see, without working anything out, how many social-media clients they have, how
 * many renewed, how many are still waiting, and how much money the renewals bring them — "a UI that
 * 100% motivates the salesperson to convert their clients to the next month". The tech admin and the
 * sales admin need the same numbers across the company, per salesperson.
 *
 * ── The rules, in one place ───────────────────────────────────────────────────────────────────
 * - A month is **due** for renewal in the calendar month its last day falls in (its renewal date is
 *   its end date — `smmPackage.daysToRenewal`).
 * - Its outcome: **renewed** when a next month is linked (`renewal.nextCampaignId`) or it was marked
 *   won; **lost** when the salesperson said the client is not renewing (or it lapsed); otherwise
 *   **waiting** — still to come, or ended with no decision.
 * - A month's **renewal value** is what the next month is worth: the next month's amount when it
 *   exists, else this month's amount, else the package's list price (a month with no sale is ₹0).
 * - The salesperson's money is their commission rate (5% or 10%, `salesIncentive.commissionRate`) of
 *   that value — paid, like every sale, once it is verified and collected.
 * - Months that are removed, deleted, or history (filled in after the fact, never run in the app) do
 *   not count: nobody could renew them here.
 * - **Running** clients are counted once each (a client renewed early has two active months), from
 *   the month covering today.
 *
 * Pure: no React, no Firestore. Tested in src/test/smmRenewalMoney.test.ts.
 */
import { findPackage } from "@/utils/serviceCatalog";
import { cyclePhase } from "@/utils/smmPackage";
import { daysBetween } from "@/utils/smmPlan";
import type { SmmCampaign } from "@/types/smm";

export type RenewalOutcome = "renewed" | "waiting" | "lost";

export interface RenewalRow {
  month: SmmCampaign;
  outcome: RenewalOutcome;
  /** Days from today to the month's last day: 2 = two days left, 0 = last day, -3 = ended 3 days ago. */
  daysLeft: number;
  /** What the next month is worth, in rupees. */
  value: number;
  /** The month that renewed it, when there is one. */
  nextId: string | null;
}

export interface RenewalTotals {
  due: number;
  renewed: number;
  waiting: number;
  lost: number;
  renewedValue: number;
  waitingValue: number;
  lostValue: number;
  /** renewed ÷ due, 0 to 1; 0 when nothing is due. */
  rate: number;
}

export interface SellerRenewals extends RenewalTotals {
  sellerId: string;
  sellerName: string;
  /** Clients of theirs running today. */
  running: number;
}

/* ── Calendar months ("yyyy-MM") ───────────────────────────────────────────────────────────── */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" for any "2026-10-05". */
export function monthKeyOf(day: string): string {
  return (day || "").slice(0, 7);
}

/** The calendar month `n` months after `ym` (negative goes back). */
export function shiftMonthKey(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function monthKeyTitle(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

/** "Oct" — for the arrows beside the title. */
export function monthKeyShort(ym: string): string {
  return monthKeyTitle(ym).slice(0, 3);
}

/* ── One month ─────────────────────────────────────────────────────────────────────────────── */

/** Can this month be renewed here at all? */
export function countsForRenewals(c: SmmCampaign): boolean {
  return !!c.cycle?.endDate && !c.history && c.status !== "removed" && c.status !== "deleted";
}

export function renewalOutcome(c: SmmCampaign): RenewalOutcome {
  if (c.renewal?.nextCampaignId || c.renewal?.state === "won" || c.status === "renewed") return "renewed";
  if (c.renewal?.state === "lost" || c.status === "lapsed") return "lost";
  return "waiting";
}

/** The month's own price, or its package's list price when the month carries none (no sale). */
export function monthValue(c: Pick<SmmCampaign, "amount" | "packageKey">): number {
  if (c.amount && c.amount > 0) return c.amount;
  return findPackage("social_media_management", c.packageKey || "")?.amount || 0;
}

/** Commission on `value` at `ratePercent`, in whole rupees. */
export function commissionOn(value: number, ratePercent: number): number {
  return Math.round((Math.max(0, value) * Math.max(0, ratePercent)) / 100);
}

function rowOf(c: SmmCampaign, today: string, byId: Map<string, SmmCampaign>): RenewalRow {
  const outcome = renewalOutcome(c);
  const nextId = c.renewal?.nextCampaignId || null;
  const next = nextId ? byId.get(nextId) : undefined;
  return {
    month: c,
    outcome,
    daysLeft: daysBetween(today, c.cycle.endDate),
    value: outcome === "renewed" && next && next.amount > 0 ? next.amount : monthValue(c),
    nextId,
  };
}

/** Oldest decision first: the longest-ended waiting month, then the ones ending soonest. */
function byUrgency(a: RenewalRow, b: RenewalRow): number {
  return a.daysLeft - b.daysLeft || (a.month.businessName || "").localeCompare(b.month.businessName || "");
}

function unique(months: SmmCampaign[]): SmmCampaign[] {
  const seen = new Map<string, SmmCampaign>();
  for (const c of months) if (c?.id) seen.set(c.id, c);
  return Array.from(seen.values());
}

/* ── A calendar month's renewals ───────────────────────────────────────────────────────────── */

/**
 * Every month whose last day falls in `ym`, with its outcome — worst first within each outcome.
 * `sellerId` narrows it to one salesperson's months.
 */
export function renewalsInMonth(months: SmmCampaign[], ym: string, today: string, sellerId?: string): RenewalRow[] {
  const all = unique(months);
  const byId = new Map(all.map((c) => [c.id, c]));
  return all
    .filter((c) => countsForRenewals(c) && monthKeyOf(c.cycle.endDate) === ym && (!sellerId || c.soldBy === sellerId))
    .map((c) => rowOf(c, today, byId))
    .sort(byUrgency);
}

/**
 * Months that ended BEFORE `ym` and still have no decision — the renewals the salesperson can still
 * save. Shown with the current month's list, never counted in its totals (they belong to the month
 * they ended in).
 */
export function openRenewalsBefore(months: SmmCampaign[], ym: string, today: string, sellerId?: string): RenewalRow[] {
  const all = unique(months);
  const byId = new Map(all.map((c) => [c.id, c]));
  return all
    .filter((c) => countsForRenewals(c) && c.status === "active" && monthKeyOf(c.cycle.endDate) < ym
      && (!sellerId || c.soldBy === sellerId))
    .map((c) => rowOf(c, today, byId))
    .filter((r) => r.outcome === "waiting")
    .sort(byUrgency);
}

export function renewalTotals(rows: RenewalRow[]): RenewalTotals {
  const t: RenewalTotals = { due: rows.length, renewed: 0, waiting: 0, lost: 0, renewedValue: 0, waitingValue: 0, lostValue: 0, rate: 0 };
  for (const r of rows) {
    t[r.outcome] += 1;
    if (r.outcome === "renewed") t.renewedValue += r.value;
    else if (r.outcome === "waiting") t.waitingValue += r.value;
    else t.lostValue += r.value;
  }
  t.rate = t.due > 0 ? t.renewed / t.due : 0;
  return t;
}

/* ── Running now ───────────────────────────────────────────────────────────────────────────── */

/**
 * The clients being served today — one month each (the one covering today), with what those months
 * are worth. `sellerId` narrows it to one salesperson.
 */
export function runningClients(months: SmmCampaign[], today: string, sellerId?: string): { count: number; value: number; months: SmmCampaign[] } {
  const byClient = new Map<string, SmmCampaign>();
  for (const c of unique(months)) {
    if (!countsForRenewals(c) || c.status !== "active" || cyclePhase(c.cycle, today) !== "running") continue;
    if (sellerId && c.soldBy !== sellerId) continue;
    const key = c.clientPhoneId || c.id;
    const held = byClient.get(key);
    // Two running months for one client cannot both cover today; keep the later start if they do.
    if (!held || (c.cycle.startDate > held.cycle.startDate)) byClient.set(key, c);
  }
  const list = Array.from(byClient.values());
  return { count: list.length, value: list.reduce((s, c) => s + (c.amount || 0), 0), months: list };
}

/* ── Per salesperson (admins) ──────────────────────────────────────────────────────────────── */

/**
 * One row per salesperson with anything running today or due in `ym`: their running clients and the
 * month's renewals. Best renewal rate first, then most money kept.
 */
export function renewalsBySeller(months: SmmCampaign[], ym: string, today: string): SellerRenewals[] {
  const rows = renewalsInMonth(months, ym, today);
  const running = runningClients(months, today).months;
  const names = new Map<string, string>();
  for (const c of unique(months)) if (c.soldBy) names.set(c.soldBy, c.soldByName || names.get(c.soldBy) || "Salesperson");

  const ids = new Set<string>([...rows.map((r) => r.month.soldBy), ...running.map((c) => c.soldBy)].filter(Boolean));
  return Array.from(ids)
    .map((sellerId) => ({
      sellerId,
      sellerName: names.get(sellerId) || "Salesperson",
      running: running.filter((c) => c.soldBy === sellerId).length,
      ...renewalTotals(rows.filter((r) => r.month.soldBy === sellerId)),
    }))
    .sort((a, b) => b.rate - a.rate || b.renewedValue - a.renewedValue || a.sellerName.localeCompare(b.sellerName));
}

/* ── Words ─────────────────────────────────────────────────────────────────────────────────── */

/** "Ends in 2 days", "Last day today", "Ends tomorrow", "Ended 3 days ago". */
export function renewalWhen(daysLeft: number): string {
  if (daysLeft > 1) return `Ends in ${daysLeft} days`;
  if (daysLeft === 1) return "Ends tomorrow";
  if (daysLeft === 0) return "Last day today";
  if (daysLeft === -1) return "Ended yesterday";
  return `Ended ${-daysLeft} days ago`;
}
