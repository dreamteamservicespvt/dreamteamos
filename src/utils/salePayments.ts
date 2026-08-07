/**
 * What a sale is worth, versus what has actually been collected for it.
 *
 * ── The problem this exists for ───────────────────────────────────────────────────────────────
 * A sale used to be one number, `amount`, and the system assumed the money arrived with it. Real
 * sales do not work that way. A social-media month is sold at 50% up front, with the rest due once
 * the first post is made, posted and the campaign is running. Ads are meant to be paid in full,
 * but in practice a member sometimes takes part of it — and there was nowhere to say so, which
 * left two bad options: record the full amount and show revenue and commission on money nobody
 * had, or not record the sale at all and lose the client from the pipeline entirely.
 *
 * ── The model ─────────────────────────────────────────────────────────────────────────────────
 * A sale has a PRICE (`amount` — what the client agreed to) and a list of PAYMENTS (what actually
 * came in, each with the day it came in). Everything else is derived:
 *
 *   collected = sum of payments        pending = price − collected
 *
 * Revenue and commission are counted per PAYMENT, on the day of that payment. That one decision is
 * what makes the rest fall out for free: the leaderboard shows money in hand, a balance collected
 * three weeks later lands on the day it was collected rather than backdating to the sale, and
 * commission is never paid on an invoice nobody honoured.
 *
 * ── Why nothing has to be migrated ────────────────────────────────────────────────────────────
 * A sale with no `payments` list is one that was paid in full when it was made — which is every
 * sale ever recorded before this, and most since. `paymentEvents` synthesises the single payment
 * for those, so every existing reader keeps returning exactly what it returned before, and no
 * backfill has to run over live data to keep the numbers right.
 */
import { format } from "date-fns";
import type { Lead, SaleDetail, SalePayment } from "@/types";

/** A payment, reduced to the two things every money reader needs. */
export interface PaymentEvent {
  amount: number;
  /** `yyyy-MM-dd` — the day this money counts on. */
  day: string | null;
  note?: string | null;
  /** False for the synthesised full payment of an ordinary sale. */
  recorded: boolean;
}

const tsDay = (ts: unknown): string | null => {
  const seconds = (ts as { seconds?: number } | undefined)?.seconds;
  return seconds ? format(new Date(seconds * 1000), "yyyy-MM-dd") : null;
};

/** The day a sale was MADE — when the member recorded it, falling back to the lead's own date. */
export function saleDay(item: SaleDetail, lead?: Lead | null): string | null {
  return tsDay(item.submittedAt) ?? (lead ? tsDay(lead.createdAt) : null);
}

/** Every sale on a lead, whichever shape the record uses. */
export function saleItemsOf(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

/**
 * The payments for a sale, as days and amounts.
 *
 * A sale that was never marked partial is one payment of the whole price on the day of the sale.
 * That is not a special case bolted on — it is the honest reading of a sale nobody said was
 * partial, and expressing it this way is what lets every caller treat all sales identically.
 */
export function paymentEvents(item: SaleDetail, lead?: Lead | null): PaymentEvent[] {
  /**
   * Only a sale nobody marked partial gets the synthesised full payment.
   *
   * The flag is the whole question. Treating an EMPTY payment list as "paid in full" as well was
   * exactly backwards: a sale someone had explicitly marked partial, with nothing collected yet,
   * would have reported its entire price as money in hand — inflating the member's revenue and
   * paying commission on a sale that had not been paid at all. With no record of any money, the
   * honest answer is that none has been received.
   */
  if (!item.partialPayment) {
    return [{ amount: item.amount || 0, day: saleDay(item, lead), recorded: false }];
  }
  const list = Array.isArray(item.payments) ? item.payments : [];
  return list.map((p: SalePayment) => ({
    amount: Number(p.amount) || 0,
    // A payment with no stamp is one being written right now; it belongs to the sale's own day
    // rather than to nowhere, which would silently drop it out of every total.
    day: tsDay(p.collectedAt) ?? saleDay(item, lead),
    note: p.note ?? null,
    recorded: true,
  }));
}

/** Money actually in hand for this sale. */
export function collectedOf(item: SaleDetail, lead?: Lead | null): number {
  return paymentEvents(item, lead).reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Money still owed. Never below zero.
 *
 * Clamped because an over-collection is a data-entry slip, not a negative debt, and letting it go
 * negative would quietly cancel out another sale's genuine pending balance in any total.
 */
export function pendingOf(item: SaleDetail, lead?: Lead | null): number {
  return Math.max(0, (item.amount || 0) - collectedOf(item, lead));
}

/**
 * Is there money still to collect on this sale?
 *
 * Rejected sales are excluded: the sale did not happen, so there is nothing to chase. Pending
 * VERIFICATION is deliberately not excluded — whether the paperwork has caught up has nothing to
 * do with whether the client still owes money, and a member should be chasing it either way.
 */
export function hasPendingPayment(item: SaleDetail, lead?: Lead | null): boolean {
  if (item.verificationStatus === "rejected") return false;
  return pendingOf(item, lead) > 0;
}

/** What was collected within `days` — or across all time when `days` is null. */
export function collectedInDays(
  item: SaleDetail,
  lead: Lead | null | undefined,
  days: ReadonlySet<string> | null,
): number {
  return paymentEvents(item, lead)
    .filter((p) => !days || (p.day && days.has(p.day)))
    .reduce((sum, p) => sum + p.amount, 0);
}

/** What was collected between two `yyyy-MM-dd` dates, inclusive. */
export function collectedInRange(item: SaleDetail, lead: Lead | null | undefined, from: string, to: string): number {
  return paymentEvents(item, lead)
    .filter((p) => !!p.day && p.day >= from && p.day <= to)
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * A payment recorded now.
 *
 * The id is derived from the time so two instalments can never collide, and so a double-tap that
 * writes the same second is caught as the duplicate it is rather than counted twice.
 */
export function newPayment(input: {
  amount: number;
  note?: string | null;
  screenshotUrl?: string | null;
  by?: { uid: string; name: string } | null;
  /** Firestore rejects serverTimestamp() inside an array element, so the caller passes a real one. */
  collectedAt: unknown;
}): SalePayment {
  return {
    id: `pay_${Date.now()}`,
    amount: Math.max(0, Math.round(Number(input.amount) || 0)),
    collectedAt: input.collectedAt,
    note: input.note?.trim() || null,
    screenshotUrl: input.screenshotUrl || null,
    ...(input.by ? { byId: input.by.uid, byName: input.by.name } : {}),
  };
}

/**
 * The payment list a sale should carry once an instalment is added.
 *
 * A sale that was full until now has no list, so the money already taken has to be written down
 * before the new instalment can join it — otherwise adding a ₹499 balance to a ₹999 sale that was
 * marked paid-in-full would silently reduce its collected total from 999 to 499.
 */
export function withPayment(item: SaleDetail, payment: SalePayment, lead?: Lead | null): SalePayment[] {
  const existing = item.partialPayment && Array.isArray(item.payments) ? item.payments : [];
  if (existing.length === 0 && !item.partialPayment) {
    // Nothing owed in the first place — the "existing" payment is the whole price already taken.
    const opening = paymentEvents(item, lead)[0];
    if (opening.amount > 0) {
      return [
        { id: "pay_opening", amount: opening.amount, collectedAt: item.submittedAt, note: "Paid at sale" },
        payment,
      ];
    }
  }
  return [...existing, payment];
}

// ── Reading a whole lead list ────────────────────────────────────────────────────────────────

/** One sale that still owes money, with everything the chase list needs to show it. */
export interface PendingSale {
  lead: Lead;
  item: SaleDetail;
  /** Index within the lead's sale items — how a sale is addressed for an update. */
  index: number;
  price: number;
  collected: number;
  pending: number;
  soldOn: string | null;
}

/** Every sale across these leads that still has money outstanding, largest balance first. */
export function pendingSales(leads: Lead[]): PendingSale[] {
  const rows: PendingSale[] = [];
  for (const lead of leads) {
    saleItemsOf(lead).forEach((item, index) => {
      if (!hasPendingPayment(item, lead)) return;
      rows.push({
        lead,
        item,
        index,
        price: item.amount || 0,
        collected: collectedOf(item, lead),
        pending: pendingOf(item, lead),
        soldOn: saleDay(item, lead),
      });
    });
  }
  return rows.sort((a, b) => b.pending - a.pending);
}

/** Total still owed across a set of leads — the figure the chase section leads with. */
export function totalPending(leads: Lead[]): number {
  return pendingSales(leads).reduce((sum, r) => sum + r.pending, 0);
}
