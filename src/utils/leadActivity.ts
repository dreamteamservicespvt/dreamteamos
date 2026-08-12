/**
 * When a lead was last *worked*, as opposed to when it was first handed out.
 *
 * ── The problem this fixes ────────────────────────────────────────────────────────────────────
 * My Leads groups leads into days and opens on Today. It grouped them by `createdAt`, so a number
 * claimed three weeks ago sat in the three-week-old bucket for ever — including the moment somebody
 * sold to it this morning. The seller finished the call, went to look at the lead, and it was not
 * there: they had to switch the day filter to "All days" and search the number by hand, every time.
 * On an upsell round, where every sale is against an old number, that is the whole workflow.
 *
 * So "which day does this lead belong to" now means the last day something happened on it. A lead
 * sold to today is in today, at the top, which is where the person who just sold it expects it.
 *
 * ── Why creation still counts ─────────────────────────────────────────────────────────────────
 * A fresh lead nobody has touched has no other activity, and it must still appear on the day it
 * arrived — that is the list of numbers to call. So this is the LATEST of everything known, never
 * only the newest sale.
 */
import type { Lead, SaleDetail } from "@/types";

function ms(ts: unknown): number {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

/** Sale lines on a lead, across the current and legacy shapes. */
function saleItemsOf(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

/**
 * Epoch ms of the most recent thing that happened to this lead.
 *
 * Deliberately NOT `updatedAt`: that moves for changes nobody would call activity — a freeze
 * expiring, a backfill touching the row — and it would shuffle the day list for reasons the seller
 * cannot see. Only the two things a person actually did count: the lead arriving, and a sale on it.
 */
export function leadActivityMs(lead: Lead): number {
  let latest = ms(lead.createdAt);
  for (const item of saleItemsOf(lead)) {
    const at = ms(item.submittedAt);
    if (at > latest) latest = at;
  }
  return latest;
}

/** The `yyyy-MM-dd` a lead belongs to in the day list. Empty when it has no usable stamp. */
export function leadActivityDay(lead: Lead): string {
  const at = leadActivityMs(lead);
  if (!at) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
