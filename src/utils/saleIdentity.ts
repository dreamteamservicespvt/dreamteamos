/**
 * Every sale's one permanent identity — the `saleId` (2026-10-08).
 *
 * ── Why a sale needs an id of its own ─────────────────────────────────────────────────────────
 * A sale lives inside its lead, as one entry of `leads.saleItems[]`, and until now nothing in the
 * entry said WHICH sale it was. Everything found a sale by its position in that list — the edit form
 * ("save over entry 2"), the delete button ("remove entry 2"), the approvals screen, the penalty
 * mirror (`order.saleItemIndex`) — and the order the tech side works from was keyed on the moment it
 * was recorded. Positions move: delete the first of three sales and the other two shift down, so a
 * form opened on "entry 2" saves over a different sale, a penalty lands on the wrong line, and the
 * sale the edit was meant for keeps its old values on one side while the tech side sees the new ones.
 *
 * The owner's rule (2026-10-08): every sale has ONE immutable id, set when it is created, and every
 * create, edit, delete and tech-side sync goes through it. Editing updates that id; it never makes a
 * second sale. Deleting removes that id everywhere.
 *
 * ── The id, and why it is the one orders were already using ──────────────────────────────────────
 * `saleId` = `<leadId>_<the ms the sale was recorded>`, and the sale's order is `o_<saleId>`. That is
 * exactly the id `orders.orderDocId` has always given an order (`o_<leadId>_<submittedAtMs>`), so
 * every order already in the database is the order of the sale it came from, under the same id — no
 * migration. A sale recorded before `submittedAt` existed keeps the position-based id its order was
 * created with (`<leadId>__<index>`), and is stamped with it the next time its lead is written, after
 * which a later delete cannot move it.
 *
 * Pure: no Firestore, no React. Tested in `src/test/saleIdentity.test.ts`.
 */
import type { Lead, SaleDetail } from "@/types";

/**
 * Epoch milliseconds of any timestamp shape this data has carried, exactly.
 *
 * A Firestore `Timestamp` answers `toMillis()`. A plain `{ seconds, nanoseconds }` (a timestamp that
 * went through JSON) used to be read as `seconds * 1000` — dropping the milliseconds, which made the
 * same sale produce a DIFFERENT order id from the one it was created under. Read exactly here.
 */
export function timestampMs(value: unknown): number {
  const ts = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number } | null | undefined;
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") {
    const nanos = typeof ts.nanoseconds === "number" ? ts.nanoseconds : 0;
    return ts.seconds * 1000 + Math.floor(nanos / 1e6);
  }
  return 0;
}

/** The id a NEW sale is given: its lead and the millisecond it was recorded. */
export function newSaleId(leadId: string, submittedMs: number): string {
  return `${leadId}_${submittedMs}`;
}

/**
 * A sale's permanent id. The stored `saleId` when it has one; otherwise the id its order was created
 * under — from `submittedAt`, or, for the oldest sales, the position it had.
 */
export function saleIdOf(leadId: string, item: Pick<SaleDetail, "saleId" | "submittedAt">, index: number): string {
  if (item?.saleId) return item.saleId;
  const ms = timestampMs(item?.submittedAt);
  return ms ? newSaleId(leadId, ms) : `${leadId}__${index}`;
}

/** The order (tech side) of a sale. One sale, one order, one id. */
export function orderIdOfSaleId(saleId: string): string {
  return `o_${saleId}`;
}

/** The order id of a sale entry. The same id `orders.orderDocId` has always produced. */
export function orderIdOfSale(leadId: string, item: Pick<SaleDetail, "saleId" | "submittedAt">, index: number): string {
  return orderIdOfSaleId(saleIdOf(leadId, item, index));
}

/** The sale id behind an order id, read back (`o_<saleId>`). Empty for an id of another shape. */
export function saleIdOfOrderId(orderId: string): string {
  return orderId.startsWith("o_") ? orderId.slice(2) : "";
}

/** Every sale on a lead, whichever shape the record uses (legacy single `saleDetails` too). */
export function leadSaleItems(lead: Pick<Lead, "saleItems" | "saleDetails"> | null | undefined): SaleDetail[] {
  if (!lead) return [];
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

/** Where the sale with this id is in the lead's list right now, or -1 when it is not there. */
export function findSaleIndex(leadId: string, items: SaleDetail[], saleId: string): number {
  return items.findIndex((it, i) => saleIdOf(leadId, it, i) === saleId);
}

/**
 * The list with every entry carrying its `saleId`.
 *
 * Called on every write that goes through `services/sales`, BEFORE anything is added or removed, so
 * an older entry is stamped with the id it has right now — the id its order already has — and a
 * delete further up the list can never change it again.
 */
export function withSaleIds(leadId: string, items: SaleDetail[]): SaleDetail[] {
  return items.map((it, i) => (it.saleId ? it : { ...it, saleId: saleIdOf(leadId, it, i) }));
}

/**
 * Does this lead still hold the sale an order was made for?
 *
 * The order's own id is checked first (the stored or derived sale id). An order made from a sale
 * whose `submittedAt` came back in another shape is matched on the recorded millisecond — or, for a
 * timestamp read without its milliseconds, the second. An order from the oldest sales (keyed on a
 * position, no recorded time) is never declared orphaned while the lead has any sale without a time:
 * its position may simply have moved.
 */
export function leadHoldsSaleOf(
  order: { id: string; leadId?: string; saleId?: string | null; saleSubmittedAtMs?: number | null },
  lead: Pick<Lead, "saleItems" | "saleDetails"> | null | undefined,
): boolean {
  if (!lead) return false;
  const leadId = order.leadId || "";
  const items = leadSaleItems(lead);
  if (items.length === 0) return false;
  const wanted = order.saleId || saleIdOfOrderId(order.id);
  if (items.some((it, i) => saleIdOf(leadId, it, i) === wanted)) return true;
  const ms = order.saleSubmittedAtMs || 0;
  if (ms > 0) {
    const second = Math.floor(ms / 1000);
    return items.some((it) => {
      const itemMs = timestampMs(it.submittedAt);
      return itemMs === ms || (itemMs > 0 && Math.floor(itemMs / 1000) === second);
    });
  }
  // A position-keyed order: only certain when no undated sale is left that it could be.
  return items.some((it) => !timestampMs(it.submittedAt) && !it.saleId);
}
