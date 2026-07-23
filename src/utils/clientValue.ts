/**
 * What a client is worth to us.
 *
 * A client's stored `totalSaleAmount` is only populated for order-sourced work; every client
 * created from work assigned directly in Work Assign (which is most of them, via the backfill)
 * has `totalSaleAmount: 0` and carries its value in `totalDeliveredAmount` instead. Reading the
 * sale total alone is why the Clients list showed ₹0 for those customers. These helpers total a
 * client from their actual jobs, so the figure is right however the client was created.
 */
import type { Client, ClientWorkItem } from "@/types";

/** One job's value: the client's sale price, or the delivered price when there was no sale record. */
export function workAmount(w: ClientWorkItem): number {
  return w.saleAmount || w.deliveredAmount || 0;
}

/** A client's total value, summed from their jobs, with the stored totals as a last-resort fallback. */
export function clientTotal(c: Client): number {
  const fromWorks = (c.works || []).reduce((sum, w) => sum + workAmount(w), 0);
  return fromWorks || c.totalSaleAmount || c.totalDeliveredAmount || 0;
}
