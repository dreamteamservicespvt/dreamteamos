/**
 * Everything about an invoice that is not arithmetic: what a new one starts with, what must be
 * filled in before it can be generated, its status as people read it, its UPI link, its words.
 *
 * Arithmetic lives in `invoiceMath` and nowhere else; this file only ever asks it.
 *
 * Pure — no React, no Firestore.
 */
import type {
  Invoice, InvoiceContent, InvoiceCustomer, InvoiceDefaults, InvoiceItem, InvoicePayment,
  InvoiceSeller, InvoiceStatus, InvoiceTotalsSnapshot,
} from "@/types/invoice";
import type { Order } from "@/types";
import type { ResolvedCompany } from "@/utils/company";
import { numberInIndianWords } from "@/utils/company";
import { categoryLabel } from "@/utils/serviceCatalog";
import { GSTIN_PROBLEM_TEXT, HOME_STATE_CODE, gstinProblem, isValidIfsc, isValidUpiId, normalizeGstin, stateCodeOfGstin } from "@/utils/gst";
import { computeInvoice, formatPaise, safeAmount, type InvoiceTotals, type Paise } from "@/utils/invoiceMath";
import { invoiceNumberForFile } from "@/utils/invoiceNumber";

// ─── Starting values ────────────────────────────────────────────────────────────────────────────

/**
 * What a brand-new invoice starts with before an admin has saved defaults of their own — taken
 * from the company's own last invoice (Inv. 4232, 31-08-2025), so the first invoice anyone makes is
 * already right. Overridden field by field by `invoice_settings/defaults`. These are the details
 * printed on every invoice the company sends; they are not secrets.
 */
export const INVOICE_FALLBACK_DEFAULTS: Required<Pick<InvoiceDefaults, "terms" | "notes" | "taxRate" | "pricesIncludeTax" | "dueDays">> & { payment: InvoicePayment } = {
  payment: {
    bankName: "Bank of Baroda",
    branch: "Ghati, Kakinada, Andhra Pradesh",
    accountName: "",
    accountNumber: "85260200000035",
    ifsc: "BARB0GHATIX",
    swift: "BARBINBBKKD",
    upiId: "9849834102-3@ybl",
    showQr: true,
  },
  terms: "Full payment must be completed before any work begins for Dream Team Services.",
  notes: "Thank you for choosing Dream Team Services. We are committed to delivering high-quality services. Please feel free to reach out for any clarifications during the project.",
  taxRate: 18,
  // The company quotes all-in prices — ₹17,400 on its own invoice is the price with GST in it.
  pricesIncludeTax: true,
  dueDays: 5,
};

/** Admin defaults over the fallbacks, field by field — a half-saved defaults document blanks nothing. */
export function resolveInvoiceDefaults(stored?: InvoiceDefaults | null) {
  const d = stored || {};
  const f = INVOICE_FALLBACK_DEFAULTS;
  const text = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const p = d.payment || {};
  return {
    payment: {
      bankName: text(p.bankName, f.payment.bankName),
      branch: text(p.branch, f.payment.branch),
      accountName: text(p.accountName, f.payment.accountName),
      accountNumber: text(p.accountNumber, f.payment.accountNumber),
      ifsc: text(p.ifsc, f.payment.ifsc),
      swift: text(p.swift, f.payment.swift),
      upiId: text(p.upiId, f.payment.upiId),
      showQr: typeof p.showQr === "boolean" ? p.showQr : f.payment.showQr,
    } as InvoicePayment,
    terms: text(d.terms, f.terms),
    notes: text(d.notes, f.notes),
    taxRate: Number.isFinite(d.taxRate) ? Math.max(0, Math.min(100, Number(d.taxRate))) : f.taxRate,
    pricesIncludeTax: typeof d.pricesIncludeTax === "boolean" ? d.pricesIncludeTax : f.pricesIncludeTax,
    dueDays: Number.isFinite(d.dueDays) ? Math.max(0, Math.min(365, Math.floor(Number(d.dueDays)))) : f.dueDays,
  };
}

export type ResolvedInvoiceDefaults = ReturnType<typeof resolveInvoiceDefaults>;

/** A line id that is unique enough inside one invoice and safe as a React key. */
export function newItemId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `it_${c.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  return `it_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function blankItem(taxRate: number): InvoiceItem {
  return { id: newItemId(), name: "", description: "", sac: "", quantity: 1, rate: 0, discountKind: "percent", discountValue: 0, taxRate };
}

/** `yyyy-MM-dd` in the browser's own day, not UTC — an invoice made at 1 AM IST is dated today. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isValidIsoDate(iso: string | null | undefined): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

export function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  const base = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  base.setDate(base.getDate() + days);
  return isoDate(base);
}

/** Whole days from `fromIso` to `toIso` (negative when `to` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const parse = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const diff = (parse(toIso) - parse(fromIso)) / 86_400_000;
  return Number.isFinite(diff) ? Math.round(diff) : 0;
}

/** The company as an invoice's "From" block. The logo stays "" — empty means the company logo. */
export function sellerFromCompany(company: ResolvedCompany): InvoiceSeller {
  return {
    name: company.name,
    gstin: company.gstin,
    address: company.address.join("\n"),
    website: company.website,
    email: company.email,
    phone: company.phone,
    logoUrl: "",
  };
}

export const EMPTY_CUSTOMER: InvoiceCustomer = {
  name: "", email: "", phone: "", gstin: "", billingAddress: "", shipToDifferent: false, shippingAddress: "",
};

/** A new invoice: today's date, the company's details, the admin's defaults, one empty line. */
export function buildNewInvoiceContent(
  company: ResolvedCompany,
  stored: InvoiceDefaults | null | undefined,
  now: Date = new Date(),
): InvoiceContent {
  const d = resolveInvoiceDefaults(stored);
  const issueDate = isoDate(now);
  const seller = sellerFromCompany(company);
  return {
    issueDate,
    dueDate: addDaysIso(issueDate, d.dueDays),
    seller,
    customer: { ...EMPTY_CUSTOMER },
    items: [blankItem(d.taxRate)],
    tax: {
      mode: "gst",
      pricesIncludeTax: d.pricesIncludeTax,
      placeOfSupply: stateCodeOfGstin(seller.gstin) || HOME_STATE_CODE,
      defaultRate: d.taxRate,
    },
    roundOff: false,
    payment: { ...d.payment },
    terms: d.terms,
    notes: d.notes,
  };
}

/**
 * Any stored invoice — including one written by an older version, or half-written — as complete
 * content the editor and the engine can trust. Missing means "as a new invoice would have it".
 */
export function contentOf(invoice: Partial<InvoiceContent> | null | undefined): InvoiceContent {
  const i = invoice || {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const s = (i.seller || {}) as Partial<InvoiceSeller>;
  const c = (i.customer || {}) as Partial<InvoiceCustomer>;
  const p = (i.payment || {}) as Partial<InvoicePayment>;
  const t = (i.tax || {}) as Partial<InvoiceContent["tax"]>;
  const defaultRate = num(t.defaultRate, INVOICE_FALLBACK_DEFAULTS.taxRate);
  return {
    issueDate: str(i.issueDate),
    dueDate: str(i.dueDate),
    seller: {
      name: str(s.name), gstin: str(s.gstin), address: str(s.address), website: str(s.website),
      email: str(s.email), phone: str(s.phone), logoUrl: str(s.logoUrl),
    },
    customer: {
      name: str(c.name), email: str(c.email), phone: str(c.phone), gstin: str(c.gstin),
      billingAddress: str(c.billingAddress), shipToDifferent: c.shipToDifferent === true,
      shippingAddress: str(c.shippingAddress),
    },
    items: (Array.isArray(i.items) ? i.items : []).map((it) => ({
      id: str(it?.id) || newItemId(),
      name: str(it?.name),
      description: str(it?.description),
      sac: str(it?.sac),
      quantity: num(it?.quantity, 1),
      rate: num(it?.rate),
      discountKind: it?.discountKind === "amount" ? "amount" : "percent",
      discountValue: num(it?.discountValue),
      taxRate: num(it?.taxRate, defaultRate),
    })),
    tax: {
      mode: t.mode === "none" ? "none" : "gst",
      pricesIncludeTax: t.pricesIncludeTax === true,
      placeOfSupply: str(t.placeOfSupply),
      defaultRate,
    },
    roundOff: i.roundOff === true,
    payment: {
      bankName: str(p.bankName), branch: str(p.branch), accountName: str(p.accountName),
      accountNumber: str(p.accountNumber), ifsc: str(p.ifsc), swift: str(p.swift), upiId: str(p.upiId),
      showQr: p.showQr !== false,
    },
    terms: str(i.terms),
    notes: str(i.notes),
  };
}

/**
 * A stable fingerprint of what a person typed — two contents with the same fingerprint print the
 * same invoice. Used for "unsaved changes", so a re-render that changed nothing never shows as dirty.
 */
export function contentFingerprint(content: InvoiceContent): string {
  return JSON.stringify(contentOf(content));
}

/** The figures written onto the invoice document for the list. */
export function totalsSnapshot(totals: InvoiceTotals): InvoiceTotalsSnapshot {
  return { taxable: totals.taxable, tax: totals.tax, grandTotal: totals.grandTotal, itemCount: totals.printedCount };
}

/**
 * A copy for a new invoice: today's date, the same gap to the due date, fresh line ids. Everything
 * about the old invoice's number and status stays behind.
 */
export function duplicateContent(content: InvoiceContent, now: Date = new Date()): InvoiceContent {
  const c = contentOf(content);
  const gap = Math.max(0, daysBetween(c.issueDate, c.dueDate));
  const issueDate = isoDate(now);
  return {
    ...c,
    issueDate,
    dueDate: addDaysIso(issueDate, gap),
    items: c.items.map((it) => ({ ...it, id: newItemId() })),
  };
}

/**
 * The customer and the line a salesperson's sale already knows — "Fill from a sale".
 * The sale's amount is what the client agreed to pay, so it goes in as the line's rate; whether that
 * includes GST is the invoice's own setting (all-in by default, as the company quotes).
 */
export function fillFromOrder(order: Pick<Order, "businessName" | "clientName" | "clientPhone" | "category" | "packageKey" | "amount">, taxRate: number): {
  customer: Partial<InvoiceCustomer>;
  item: InvoiceItem;
} {
  const name = (order.businessName || order.clientName || "").trim();
  const label = categoryLabel(order.category) || order.category || "Service";
  const pkg = (order.packageKey || "").trim();
  return {
    customer: { name, phone: (order.clientPhone || "").trim() },
    item: {
      ...blankItem(taxRate),
      name: label.replace(/\s*\((Monthly|Single Campaign)\)\s*$/i, "").trim() || label,
      description: pkg && pkg.toLowerCase() !== "custom quote" ? pkg : "",
      quantity: 1,
      rate: safeAmount(order.amount),
    },
  };
}

// ─── Before it can be generated ─────────────────────────────────────────────────────────────────

export interface InvoiceIssue {
  /** Where the problem is: `customer.name`, `seller.gstin`, `items.<id>.name`, `items`, … */
  field: string;
  message: string;
  /** Errors block Generate; warnings are shown and allowed. */
  level: "error" | "warning";
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * What stands between this content and a numbered invoice, in the order the editor shows its
 * sections — so "fix the first problem" scrolls to the top-most one.
 */
export function validateInvoice(content: InvoiceContent, totals: InvoiceTotals = computeInvoice(content)): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message, level: "error" });
  const warn = (field: string, message: string) => issues.push({ field, message, level: "warning" });

  if (!isValidIsoDate(content.issueDate)) err("issueDate", "Choose the invoice date.");
  if (content.dueDate && !isValidIsoDate(content.dueDate)) err("dueDate", "Choose a valid due date.");
  else if (isValidIsoDate(content.issueDate) && content.dueDate && content.dueDate < content.issueDate) {
    err("dueDate", "The due date is before the invoice date.");
  }

  if (!content.seller.name.trim()) err("seller.name", "Your business name is missing.");
  const sellerGst = gstinProblem(content.seller.gstin);
  if (sellerGst) err("seller.gstin", GSTIN_PROBLEM_TEXT[sellerGst]);
  else if (content.tax.mode === "gst" && !normalizeGstin(content.seller.gstin)) {
    err("seller.gstin", "A tax invoice needs your GSTIN — add it, or choose No GST.");
  }
  if (content.seller.email && !looksLikeEmail(content.seller.email)) warn("seller.email", "This email address doesn't look right.");

  if (!content.customer.name.trim()) err("customer.name", "Who is this invoice for?");
  const customerGst = gstinProblem(content.customer.gstin);
  if (customerGst) err("customer.gstin", GSTIN_PROBLEM_TEXT[customerGst]);
  if (content.customer.email && !looksLikeEmail(content.customer.email)) warn("customer.email", "This email address doesn't look right.");
  if (content.customer.shipToDifferent && !content.customer.shippingAddress.trim()) {
    warn("customer.shippingAddress", "Add the shipping address, or untick “Ship to a different address”.");
  }

  content.items.forEach((item, i) => {
    const line = totals.lines[i];
    if (!line || line.isBlank) return;
    if (!item.name.trim()) err(`items.${item.id}.name`, "Give this item a name.");
    if (line.quantity <= 0) err(`items.${item.id}.quantity`, "Quantity must be more than 0.");
    if (safeAmount(item.rate) <= 0) warn(`items.${item.id}.rate`, "This item has no price.");
    if (item.discountKind === "percent" && item.discountValue > 100) warn(`items.${item.id}.discount`, "A discount can't be more than 100%.");
    if (line.discount > 0 && line.discount >= line.gross) warn(`items.${item.id}.discount`, "The discount takes this item to ₹0.");
  });
  if (totals.printedCount === 0) err("items", "Add at least one item.");
  else if (totals.grandTotal <= 0) err("items", "The invoice total is ₹0.");

  if (content.payment.ifsc && !isValidIfsc(content.payment.ifsc)) warn("payment.ifsc", "An IFSC is 11 characters, like BARB0GHATIX.");
  if (content.payment.upiId && !isValidUpiId(content.payment.upiId)) warn("payment.upiId", "A UPI ID looks like name@bank. The QR code is hidden until it's right.");

  return issues;
}

export const blockingIssues = (issues: InvoiceIssue[]) => issues.filter((i) => i.level === "error");

// ─── How it reads ───────────────────────────────────────────────────────────────────────────────

export type InvoiceDisplayStatus = "draft" | "unpaid" | "overdue" | "paid" | "cancelled";

/** Overdue is not stored — it is "issued, unpaid, and the due date has passed", worked out on read. */
export function displayStatusOf(invoice: Pick<Invoice, "status" | "dueDate">, todayIso: string = isoDate()): InvoiceDisplayStatus {
  switch (invoice.status) {
    case "paid": return "paid";
    case "cancelled": return "cancelled";
    case "issued": return invoice.dueDate && invoice.dueDate < todayIso ? "overdue" : "unpaid";
    default: return "draft";
  }
}

export const DISPLAY_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft", unpaid: "Unpaid", overdue: "Overdue", paid: "Paid", cancelled: "Cancelled",
};

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft", issued: "Unpaid", paid: "Paid", cancelled: "Cancelled",
};

/** `2025-08-31` → `31 Aug 2025`. */
export function formatInvoiceDate(iso: string | null | undefined): string {
  if (!isValidIsoDate(iso)) return "—";
  const [y, m, d] = (iso as string).split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${String(d).padStart(2, "0")} ${month} ${y}`;
}

/** "Seventeen Thousand Four Hundred Rupees Only" / "… Rupees and Fifty Paise Only". */
export function rupeesInWords(paise: Paise): string {
  const value = Math.max(0, Math.round(Number.isFinite(paise) ? paise : 0));
  const rupees = Math.floor(value / 100);
  const p = value % 100;
  const r = numberInIndianWords(rupees) || "Zero";
  const paiseWords = p ? ` and ${numberInIndianWords(p)} Paise` : "";
  return `${r} Rupee${rupees === 1 ? "" : "s"}${paiseWords} Only`;
}

/**
 * The UPI payment link a QR code carries. The amount is the invoice total, so the client's app
 * opens with the right figure already in it; the note names the invoice, so the payment can be
 * matched to it in the bank statement.
 */
export function upiPaymentLink(input: { upiId: string; payeeName: string; amount: Paise; note: string }): string {
  if (!isValidUpiId(input.upiId)) return "";
  const params = [
    `pa=${encodeURIComponent(input.upiId.trim())}`,
    input.payeeName.trim() ? `pn=${encodeURIComponent(input.payeeName.trim())}` : "",
    input.amount > 0 ? `am=${(input.amount / 100).toFixed(2)}` : "",
    "cu=INR",
    input.note.trim() ? `tn=${encodeURIComponent(input.note.trim().slice(0, 50))}` : "",
  ].filter(Boolean);
  return `upi://pay?${params.join("&")}`;
}

/** `Invoice DTS-26-27-0001 - Samas Sarees.pdf`, or `Draft invoice - Samas Sarees.pdf`. */
export function invoiceFileName(invoice: Pick<Invoice, "number"> & { customer?: Pick<InvoiceCustomer, "name"> }): string {
  const who = (invoice.customer?.name || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const head = invoice.number ? `Invoice ${invoiceNumberForFile(invoice.number)}` : "Draft invoice";
  return `${head}${who ? ` - ${who}` : ""}.pdf`;
}

/** Customers this person has invoiced before, newest first, one per name — the name field's suggestions. */
export function recentCustomers(invoices: Pick<Invoice, "customer" | "updatedAt">[], max = 8): InvoiceCustomer[] {
  const seen = new Set<string>();
  const out: InvoiceCustomer[] = [];
  for (const inv of invoices) {
    const c = inv.customer;
    const key = (c?.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...EMPTY_CUSTOMER, ...c });
    if (out.length >= max) break;
  }
  return out;
}

/** A one-line summary for a collapsed section, e.g. "Bank of Baroda · ••••0035 · UPI". */
export function paymentSummary(p: InvoicePayment): string {
  const parts = [
    p.bankName.trim(),
    p.accountNumber.trim() ? `A/c ••••${p.accountNumber.trim().slice(-4)}` : "",
    p.upiId.trim() ? "UPI" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No payment details yet";
}

export { formatPaise };
