/**
 * SMM Delivery Control — the STARTING LINE's moment for a month (2026-10-15, phase 6; the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why a baseline at all ───────────────────────────────────────────────────────────────────────
 * Lateness that already existed when a month was switched on never escalates (the plan's pre-mortem): a piece
 * whose deadline passed before the month's baseline goes to the Starting line (plan a catch-up, or keep it as
 * that month's pending work) instead of red full screens and admin escalations on day one. `smmMonitor`
 * reads one moment per month for that.
 *
 * ── The rule (one place, because the server checker and the in-app host must agree) ─────────────
 *   1. The month's own `delivery.baselineAt` — set when the month was switched on (phase 3).
 *   2. Otherwise the moment Delivery Control last went LIVE: the newest `history[]` entry with mode "live".
 *      A month nobody switched on one by one still has a fair starting line: whatever was already late when
 *      the company went live is the Starting line, not an alert.
 *   3. Otherwise now — nothing already late escalates.
 * Only while the switch IS live does (2) apply. In Preview the screens show what switching on NOW would do
 * (the plan: "In Preview a month has no delivery.baselineAt, so the monitor uses now"), so an old "live" entry
 * from before a step back to Preview must not leak into it. A live moment in the future (a wrong clock on the
 * device that switched it) reads as now.
 *
 * `monitorSmm` takes ONE `baselineAt` for every month that lacks its own, so callers pass `liveSinceAt(...)`
 * there (months with `delivery.baselineAt` already use theirs); `monthBaselineAt` is the same rule for one
 * month, for the screens that show a single month's Starting line.
 *
 * Pure and alias-free (the server loads it as Node ESM — hence the `.js` on the runtime import).
 */
import type { SmmDeliverySettings } from "../types/smmDelivery";
import { toMs } from "./smmCadence.js";

/**
 * When Delivery Control last went live (ms), or null: not live now, or no "live" change on record. The NEWEST
 * live entry by its time (not its position), never later than `now`.
 */
export function liveSinceAt(
  settings: Pick<SmmDeliverySettings, "mode" | "history"> | null | undefined,
  now: number,
): number | null {
  if (!settings || settings.mode !== "live") return null;
  let newest: number | null = null;
  for (const h of settings.history || []) {
    if (h?.mode !== "live" || typeof h.at !== "number" || !Number.isFinite(h.at)) continue;
    if (newest == null || h.at > newest) newest = h.at;
  }
  return newest == null ? null : Math.min(newest, now);
}

/** A month's starting line (ms): its own `delivery.baselineAt`, else when Delivery Control went live, else now. */
export function monthBaselineAt(
  month: { delivery?: { baselineAt?: unknown } | null } | null | undefined,
  settings: Pick<SmmDeliverySettings, "mode" | "history"> | null | undefined,
  now: number,
): number {
  return toMs(month?.delivery?.baselineAt) ?? liveSinceAt(settings, now) ?? now;
}
