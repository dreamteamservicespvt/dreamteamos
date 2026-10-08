/**
 * Invoices — the Invoice Builder (2026-10-08).
 *
 * ── Why the line items are embedded, not a subcollection ──────────────────────────────────────
 * Every line belongs to exactly one invoice and is never read on its own: an invoice is opened,
 * edited, numbered, printed and duplicated as one thing. Embedded with a stable `id` per line, the
 * whole invoice is one read and one atomic write — a numbered invoice can never be half-saved with
 * last week's lines — and it costs a free-tier project one read per open instead of one per line.
 * The `id` is what keeps a line's identity through reorders, duplicates and React keys.
 *
 * ── What is a snapshot ────────────────────────────────────────────────────────────────────────
 * `seller`, `payment`, `terms` and `notes` are copied INTO the invoice when it is created (from
 * `company_settings/main` and `invoice_settings/defaults`). An invoice must print the address and
 * bank account it was issued with, years later, whatever Settings says by then.
 *
 * ── Money ─────────────────────────────────────────────────────────────────────────────────────
 * Stored as the user typed it (rupees, `rate` per unit). Every figure that is DERIVED — line
 * amounts, tax, totals — comes from one engine, `utils/invoiceMath`, in integer paise; `totals` on
 * the document is a copy written at save time for the list, never an input.
 */

/** `draft` has no number yet. `issued` is generated and unpaid; `paid` / `cancelled` follow it. */
export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export type InvoiceDiscountKind = "percent" | "amount";

/** `gst` prints a TAX INVOICE with CGST/SGST or IGST; `none` prints a plain INVOICE, no tax lines. */
export type InvoiceTaxMode = "gst" | "none";

export interface InvoiceItem {
  /** Stable within the invoice — survives reorder and duplicate. */
  id: string;
  name: string;
  /** Optional second line under the name. */
  description: string;
  /** HSN / SAC code. Printed only when at least one line has one. */
  sac: string;
  quantity: number;
  /** Rupees per unit — INCLUSIVE of GST when `tax.pricesIncludeTax`, otherwise before GST. */
  rate: number;
  discountKind: InvoiceDiscountKind;
  /** Percent (0–100) or rupees, per `discountKind`. 0 = no discount. */
  discountValue: number;
  /** GST % for this line (0, 5, 12, 18, 28 …). Ignored when `tax.mode` is "none". */
  taxRate: number;
}

export interface InvoiceSeller {
  name: string;
  gstin: string;
  /** Multi-line postal address, one line per line. */
  address: string;
  website: string;
  email: string;
  phone: string;
  /** Uploaded logo for this invoice; empty = the company logo from Settings. */
  logoUrl: string;
}

export interface InvoiceCustomer {
  name: string;
  email: string;
  phone: string;
  gstin: string;
  billingAddress: string;
  /** When false the invoice prints no separate "Ship to" block. */
  shipToDifferent: boolean;
  shippingAddress: string;
}

export interface InvoiceTaxSettings {
  mode: InvoiceTaxMode;
  /** True when the rates typed on the lines already include GST (the price the client pays). */
  pricesIncludeTax: boolean;
  /**
   * Two-digit GST state code of the place of supply. Same state as the seller → CGST + SGST;
   * any other state → IGST. "" means the seller's own state.
   */
  placeOfSupply: string;
  /** The rate a NEW line starts with. Each line keeps its own `taxRate`. */
  defaultRate: number;
}

export interface InvoicePayment {
  bankName: string;
  branch: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  swift: string;
  upiId: string;
  /** Print a UPI QR (generated locally, with the invoice total in it) beside the bank details. */
  showQr: boolean;
}

/** The figures the list needs without re-running the engine. Written from `invoiceMath` at save. */
export interface InvoiceTotalsSnapshot {
  /** Paise. */
  taxable: number;
  /** Paise. */
  tax: number;
  /** Paise — what the client pays. */
  grandTotal: number;
  itemCount: number;
}

export type InvoiceEventAction =
  | "created" | "generated" | "edited" | "paid" | "unpaid" | "cancelled" | "duplicated";

/** A short audit trail. `at` is epoch ms (serverTimestamp() is not allowed inside arrays). */
export interface InvoiceEvent {
  at: number;
  action: InvoiceEventAction;
  byUid: string;
  byName: string;
  note?: string;
}

/** Everything the editor edits — the part of an invoice a person types. */
export interface InvoiceContent {
  /** `yyyy-MM-dd`. */
  issueDate: string;
  /** `yyyy-MM-dd`. */
  dueDate: string;
  seller: InvoiceSeller;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  tax: InvoiceTaxSettings;
  /** Round the grand total to the nearest rupee, printing the difference as "Round off". */
  roundOff: boolean;
  payment: InvoicePayment;
  terms: string;
  notes: string;
}

/** `invoices/{invoiceId}`. */
export interface Invoice extends InvoiceContent {
  id: string;
  /** `DTS/26-27/0001` once generated; null while a draft. Never changes after it is set. */
  number: string | null;
  /** The serial inside its financial year (1 for `…/0001`). */
  sequence: number | null;
  /** `2026-27` — the series the number was taken from. */
  financialYear: string | null;
  status: InvoiceStatus;
  totals: InvoiceTotalsSnapshot;
  /** Who made it. Members see their own invoices; the four admins see every invoice. */
  ownerId: string;
  ownerName: string;
  ownerRole: string;
  /** Edits saved after the invoice was generated (it keeps its number — owner, 2026-10-08). */
  revision: number;
  history: InvoiceEvent[];
  /** The invoice this one was duplicated from. */
  duplicatedFrom?: string | null;
  /** The sale order it was filled from (`orders/{id}`), when a salesperson used "Fill from a sale". */
  sourceOrderId?: string | null;
  createdAt?: any;
  updatedAt?: any;
  issuedAt?: any;
  issuedByUid?: string | null;
  issuedByName?: string | null;
  paidAt?: any;
  cancelledAt?: any;
}

/** `invoice_settings/access` — the one switch for team leaders (owner, 2026-10-08). */
export interface InvoiceAccessSettings {
  teamLeadersEnabled?: boolean;
  updatedAt?: any;
  updatedByUid?: string;
  updatedByName?: string;
}

/** `invoice_settings/defaults` — what a new invoice starts with, set by an admin. */
export interface InvoiceDefaults {
  payment?: Partial<InvoicePayment>;
  terms?: string;
  notes?: string;
  /** GST % new lines start with. */
  taxRate?: number;
  pricesIncludeTax?: boolean;
  /** Days from the invoice date to the due date. */
  dueDays?: number;
  updatedAt?: any;
  updatedByName?: string;
}
