/**
 * A month's link to the month that renewed it — kept true when the renewal sale goes away (2026-10-05).
 *
 * ── The bug this closes ───────────────────────────────────────────────────────────────────────
 * A renewal is a sale. Recording it opens Month N+1 and marks Month N `renewal: { state: "won",
 * nextCampaignId }` (`smm.linkRenewal`). Deleting that sale took Month N+1 away (`cancelOrderForSale`
 * → removed, or erased while nobody was on it) — but nothing ever told Month N. So the tech side's
 * month page kept saying "Renewed by Govardhan — the next month is set." with a Next month link to a
 * month that no longer existed, the card said Renewed, the salesperson lost the Renew button, and the
 * month was filed as `renewed` when its last day passed.
 *
 * The rule: **"renewed" follows the renewal sale.** When the sale is withdrawn — deleted by the
 * salesperson, rejected or taken back by the sales admin (`cancelOrderForSale`) — its month goes and the
 * month before it goes back to "no decision" (and back on the board if it had been filed as renewed);
 * when the sale comes back (re-approved) the link comes back with it. The tech side removing the renewal
 * month's order from the queue, purging it or deleting the month does NOT un-renew: the client did renew
 * (the sale and its commission stand), and putting the month back to "no decision" would invite a second
 * renewal sale for the same month. The month page then only drops the dead "Next month" link.
 *
 * Pure — no Firestore — so the rule is unit-tested; `services/smm` applies it inside a transaction.
 */
import { cyclePhase } from "@/utils/smmPackage";
import type { SmmCampaign, SmmRenewal } from "@/types/smm";

/** A month that no longer counts: taken off the board with its order, or deleted. */
export function isGoneMonth(c: Pick<SmmCampaign, "status"> | null | undefined): boolean {
  return !c || c.status === "removed" || c.status === "deleted";
}

/**
 * The lead a sold month's order id names — `o_<leadId>_<ms>`, or the legacy `o_<leadId>__<index>`
 * (`orders.orderDocId`; Firestore's own ids never contain "_"). "" for an id of another shape (a month
 * with no sale has an auto id). Used to find out whether a renewal's sale still stands once its order
 * and month are gone.
 */
export function leadIdOfOrderId(orderId: string): string {
  const m = /^o_([^_]+)_/.exec(orderId || "");
  return m ? m[1] : "";
}

/**
 * What the month before has to become when the month that renewed it (`goneId`) goes away — or null
 * when it does not point at that month (already unlinked, or renewed again since by another sale).
 *
 * "No decision" rather than "lost": nobody said the client is not renewing — a sale was deleted.
 * A month already filed as renewed goes back to running, so it shows under Renewals as ended
 * without a decision until the salesperson renews it again or marks it lost. A history month (filled
 * in after the fact) filed because this month followed it comes back too (2026-10-05): with nothing
 * after it, it is on hold (`smmPackage.isOnHold`) — it used to go back to completed, out of sight.
 */
export function renewalUnlinkPatch(
  prev: Pick<SmmCampaign, "renewal" | "status" | "history">,
  goneId: string,
): { renewal: SmmRenewal; status?: SmmCampaign["status"] } | null {
  if (!goneId || prev.renewal?.nextCampaignId !== goneId) return null;
  const filed = prev.status === "renewed" || (prev.history && prev.status === "completed");
  return {
    renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null },
    ...(filed ? { status: "active" as const } : {}),
  };
}

/**
 * What the month before becomes when the month that renewed it comes back — or null when there is
 * nothing to do: the month before is itself gone, it already points here, or it now points at a
 * different month (renewed again by another sale while this one was away — that link wins).
 *
 * `at` is left to the caller (a Firestore timestamp), so this stays pure.
 */
export function renewalRelinkPatch(
  prev: Pick<SmmCampaign, "renewal" | "status" | "history" | "cycle">,
  next: Pick<SmmCampaign, "id" | "soldByName">,
  today: string,
): { renewal: SmmRenewal; status?: SmmCampaign["status"] } | null {
  if (isGoneMonth(prev)) return null;
  const linked = prev.renewal?.nextCampaignId;
  if (linked && linked !== next.id) return null;
  if (linked === next.id && prev.renewal?.state === "won") return null;
  return {
    renewal: {
      ...(prev.renewal || { state: "none" }),
      state: "won",
      byName: next.soldByName || prev.renewal?.byName || null,
      nextCampaignId: next.id,
    },
    // A history month on hold is filed with it, like any month that ended (2026-10-05).
    ...(prev.status === "active" && prev.cycle && cyclePhase(prev.cycle, today) === "ended"
      ? { status: "renewed" as const } : {}),
  };
}

/**
 * The months in `list` whose forward link must be checked against the database: they point at a
 * month that is not among `alive` (the months the caller already holds, none of them gone). The
 * caller reads only those — normally none, because a renewal month is live while the month before it
 * still shows.
 */
export function renewalLinksToCheck(list: SmmCampaign[], alive: Set<string>): { monthId: string; nextId: string }[] {
  const out: { monthId: string; nextId: string }[] = [];
  for (const c of list) {
    const nextId = c.renewal?.nextCampaignId;
    if (!nextId || isGoneMonth(c) || alive.has(nextId)) continue;
    out.push({ monthId: c.id, nextId });
  }
  return out;
}
