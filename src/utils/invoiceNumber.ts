/**
 * Invoice numbers — `DTS/26-27/0001` (owner's choice, 2026-10-08).
 *
 * ── Why a financial-year series ───────────────────────────────────────────────────────────────
 * GST asks for invoice numbers that are consecutive, unique within a FINANCIAL year (April to
 * March) and at most 16 characters of letters, digits, "-" and "/". So the series restarts every
 * April and carries the year it belongs to: `DTS/26-27/0001` is 14 characters, leaving room for a
 * five-digit serial in a very good year. (The HR letters' calendar-year style, `DTS/INV/2026/0001`,
 * is 17 — one too many.)
 *
 * The year comes from the INVOICE DATE, not from the day someone pressed Generate: an invoice dated
 * 31 March belongs to the year that ends that day.
 *
 * ── Why the prefix is fixed ───────────────────────────────────────────────────────────────────
 * The HR series derives its prefix from the company name (`companyInitials`). An invoice series must
 * not change shape half-way through a financial year because somebody tidied the name in Settings,
 * so the prefix is a constant.
 *
 * ── Who hands numbers out ─────────────────────────────────────────────────────────────────────
 * Only `services/invoices.generateInvoice`, in one transaction: the year's counter goes up by one,
 * the number is registered in `invoice_numbers/{key}` (a document that can be created once and never
 * again), and the invoice takes it. A draft never holds a number, so a discarded draft never leaves a
 * gap in the series.
 *
 * Pure.
 */

export const INVOICE_NUMBER_PREFIX = "DTS";

/** The year an Indian financial year STARTS in: April 2026 → 2026, March 2026 → 2025. */
export function financialYearStart(iso: string | null | undefined, now: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso || "").trim());
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  return month >= 4 ? year : year - 1;
}

/** `2026` → `2026-27` — the counter document's id and the label people read. */
export function financialYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** `2026` → `26-27` — the form printed inside the number. */
export function financialYearShort(startYear: number): string {
  return `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** The printed number. `seq` is 1-based and padded to four digits so a year sorts as text. */
export function formatInvoiceNumber(startYear: number, seq: number): string {
  return `${INVOICE_NUMBER_PREFIX}/${financialYearShort(startYear)}/${String(Math.max(1, Math.floor(seq))).padStart(4, "0")}`;
}

/** A document id for the number register: `/` is not allowed in an id, so `DTS-26-27-0001`. */
export function invoiceNumberKey(number: string): string {
  return number.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-");
}

/** GST's own limit, checked by the tests for every number the series can produce this century. */
export const GST_INVOICE_NUMBER_MAX = 16;

/** File-name-safe: `DTS/26-27/0001` → `DTS-26-27-0001`. */
export const invoiceNumberForFile = (number: string): string => number.replace(/\//g, "-");
