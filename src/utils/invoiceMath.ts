/**
 * THE invoice calculation engine — the only place an invoice figure is worked out.
 *
 * The editor's running total, the live preview, the downloaded PDF, the printed copy and the
 * `totals` saved for the list all call `computeInvoice` on the same content. There is no second
 * formula anywhere to drift out of step with this one; the old invoice tool had three (form,
 * list, PDF), which is how a client could be sent a total that did not match the record.
 *
 * ── Integer paise ─────────────────────────────────────────────────────────────────────────────
 * Every amount is computed in whole paise. Floating-point rupees is how 0.1 + 0.2 ends up on a tax
 * invoice; integers cannot drift, and every rounding happens exactly once, here, on purpose.
 *
 * ── The tax, per rate ─────────────────────────────────────────────────────────────────────────
 * Lines are grouped by GST rate and the tax is computed on each group's taxable value — not line
 * by line — so ten small lines do not pick up ten roundings.
 *
 *   Exclusive prices (tax on top):  taxable = Σ net;  CGST = SGST = round(taxable × rate/2 %),
 *                                    or IGST = round(taxable × rate %).
 *   Inclusive prices (the client's price already has GST in it): the client must pay exactly the
 *   price typed. CGST = SGST = round(gross × rate / (2 × (100 + rate))) (or IGST at the full rate)
 *   and the taxable value is what is LEFT — so CGST always equals SGST to the paisa and the total
 *   is never a paisa off the price the salesperson quoted. The owner's own invoice is the check:
 *   ₹17,400 inclusive of 18% → taxable 14,745.76, CGST 1,327.12, SGST 1,327.12, total 17,400.00.
 *
 * The group's taxable value is then shared back to its lines (the largest line absorbs the last
 * paisa), so the printed line amounts always add up to the printed taxable value.
 *
 * Pure — no React, no Firestore.
 */
import type { InvoiceContent, InvoiceItem } from "@/types/invoice";
import { HOME_STATE_CODE, stateCodeOfGstin, supplyTypeOf, type SupplyType } from "@/utils/gst";

/** An amount in whole paise. */
export type Paise = number;

/**
 * Round half up, tolerant of float noise: 132711.49999999998 is how a float spells 132711.5 after a
 * multiplication, and it rounds up. The tolerance grows with the number (a float's error does), and
 * stays far below any real fraction this engine produces — those have small denominators (/200, /236).
 */
export function roundHalfUp(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  return sign * Math.floor(abs + 0.5 + 1e-9 + abs * 1e-12);
}

/** Whatever was typed → a finite, non-negative number no larger than `max`. */
export function safeAmount(value: unknown, max = 1e11): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export const toPaise = (rupees: unknown): Paise => roundHalfUp(safeAmount(rupees) * 100);

/** One line, as the invoice prints it. */
export interface InvoiceLine {
  id: string;
  /** Position among the PRINTED lines (blank lines are skipped), 1-based; 0 for a blank line. */
  number: number;
  quantity: number;
  /** The GST rate that applies — 0 when the invoice carries no GST. */
  taxRate: number;
  /** Quantity × rate as typed (inclusive of GST when prices include it). */
  gross: Paise;
  /** The discount as typed, on the same basis as `gross`. */
  discount: Paise;
  /** `gross − discount` — what this line charges, on the typed basis. */
  net: Paise;
  /** Rate per unit before GST — the "Rate" column. */
  displayRate: Paise;
  /** Discount before GST — the "Discount" column. */
  displayDiscount: Paise;
  /** Taxable value: after discount, before GST — the "Amount" column. */
  amount: Paise;
  /** This line's share of its rate group's GST. */
  tax: Paise;
  /** `amount + tax`. */
  total: Paise;
  /** No name and nothing charged — kept in the editor, never printed. */
  isBlank: boolean;
}

export interface TaxBucket {
  rate: number;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  tax: Paise;
}

export interface InvoiceTotals {
  lines: InvoiceLine[];
  /** `none` when the invoice carries no GST. */
  supply: SupplyType | "none";
  sellerState: string;
  placeOfSupply: string;
  pricesIncludeTax: boolean;
  /** Before discount and before GST. `subtotal − discount = taxable`, exactly. */
  subtotal: Paise;
  discount: Paise;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  tax: Paise;
  /** One per GST rate that carries a taxable value, lowest rate first. */
  buckets: TaxBucket[];
  /** `taxable + tax`. */
  beforeRoundOff: Paise;
  /** Signed; 0 unless rounding is on. */
  roundOff: Paise;
  /** What the client pays. */
  grandTotal: Paise;
  hasDiscount: boolean;
  /** More than one GST rate among the printed lines — the table then shows a GST column. */
  mixedRates: boolean;
  hasSac: boolean;
  /** Lines that will be printed. */
  printedCount: number;
}

type EngineInput = Pick<InvoiceContent, "items" | "tax" | "roundOff"> & {
  seller?: Pick<InvoiceContent["seller"], "gstin"> | null;
};

/** Share `total` across `weights` in proportion, the largest weight absorbing the remainder. */
function allocate(total: number, weights: number[], initial: number[]): number[] {
  const shares = [...initial];
  const diff = total - shares.reduce((s, v) => s + v, 0);
  if (diff !== 0 && shares.length > 0) {
    let largest = 0;
    weights.forEach((w, i) => { if (w > weights[largest]) largest = i; });
    shares[largest] += diff;
  }
  return shares;
}

const isBlankItem = (item: InvoiceItem, gross: number) => !(item.name || "").trim() && !(item.description || "").trim() && gross === 0;

export function computeInvoice(content: EngineInput): InvoiceTotals {
  const items = Array.isArray(content.items) ? content.items : [];
  const gstOn = content.tax?.mode !== "none";
  const inclusive = gstOn && !!content.tax?.pricesIncludeTax;
  const sellerState = stateCodeOfGstin(content.seller?.gstin) || HOME_STATE_CODE;
  const placeOfSupply = (content.tax?.placeOfSupply || "").trim() || sellerState;
  const supply: SupplyType | "none" = gstOn ? supplyTypeOf(sellerState, placeOfSupply) : "none";

  // 1) Every line on the basis it was typed.
  const raw = items.map((item) => {
    const quantity = safeAmount(item?.quantity, 1e7);
    const rate = safeAmount(item?.rate);
    const gross = roundHalfUp(quantity * rate * 100);
    const discountValue = safeAmount(item?.discountValue);
    let discount = item?.discountKind === "percent"
      ? roundHalfUp((gross * Math.min(100, discountValue)) / 100)
      : roundHalfUp(discountValue * 100);
    discount = Math.min(discount, gross);
    const taxRate = gstOn ? Math.min(100, safeAmount(item?.taxRate)) : 0;
    return { item, quantity, rate, gross, discount, net: gross - discount, taxRate };
  });

  // 2) Tax per rate group, shared back to the lines.
  const amountOf = new Array<number>(raw.length).fill(0);
  const taxOf = new Array<number>(raw.length).fill(0);
  const groups = new Map<number, number[]>();
  raw.forEach((r, i) => {
    if (!groups.has(r.taxRate)) groups.set(r.taxRate, []);
    groups.get(r.taxRate)!.push(i);
  });

  const buckets: TaxBucket[] = [];
  for (const rate of [...groups.keys()].sort((a, b) => a - b)) {
    const idx = groups.get(rate)!;
    const nets = idx.map((i) => raw[i].net);
    const sumNet = nets.reduce((s, v) => s + v, 0);
    let cgst = 0, sgst = 0, igst = 0, taxable: number;

    if (rate === 0 || supply === "none") {
      taxable = sumNet;
    } else if (inclusive) {
      if (supply === "intra") cgst = sgst = roundHalfUp((sumNet * rate) / (2 * (100 + rate)));
      else igst = roundHalfUp((sumNet * rate) / (100 + rate));
      taxable = sumNet - cgst - sgst - igst;
    } else {
      taxable = sumNet;
      if (supply === "intra") cgst = sgst = roundHalfUp((taxable * rate) / 200);
      else igst = roundHalfUp((taxable * rate) / 100);
    }
    const tax = cgst + sgst + igst;

    const amounts = inclusive && rate > 0
      ? allocate(taxable, nets, nets.map((n) => roundHalfUp((n * 100) / (100 + rate))))
      : nets;
    const taxes = inclusive && rate > 0
      ? nets.map((n, k) => n - amounts[k])
      : allocate(tax, nets, nets.map((n) => roundHalfUp((n * rate) / 100)));
    idx.forEach((i, k) => { amountOf[i] = amounts[k]; taxOf[i] = rate > 0 && supply !== "none" ? taxes[k] : 0; });

    if (taxable > 0 || tax > 0) buckets.push({ rate, taxable, cgst, sgst, igst, tax });
  }

  // 3) What each line prints.
  let printed = 0;
  const lines: InvoiceLine[] = raw.map((r, i) => {
    const blank = isBlankItem(r.item || ({} as InvoiceItem), r.gross);
    const exTax = inclusive && r.taxRate > 0;
    const displayDiscount = exTax ? roundHalfUp((r.discount * 100) / (100 + r.taxRate)) : r.discount;
    const amount = amountOf[i];
    const displayGross = amount + displayDiscount;
    // Derived from the printed amount so a one-unit line always reads Rate = Amount.
    const displayRate = r.quantity > 0
      ? roundHalfUp(displayGross / r.quantity)
      : exTax ? roundHalfUp((r.rate * 100 * 100) / (100 + r.taxRate)) : roundHalfUp(r.rate * 100);
    return {
      id: r.item?.id || String(i),
      number: blank ? 0 : ++printed,
      quantity: r.quantity,
      taxRate: r.taxRate,
      gross: r.gross,
      discount: r.discount,
      net: r.net,
      displayRate,
      displayDiscount,
      amount,
      tax: taxOf[i],
      total: amount + taxOf[i],
      isBlank: blank,
    };
  });

  const sum = (pick: (l: InvoiceLine) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const discount = sum((l) => l.displayDiscount);
  const taxable = sum((l) => l.amount);
  const cgst = buckets.reduce((s, b) => s + b.cgst, 0);
  const sgst = buckets.reduce((s, b) => s + b.sgst, 0);
  const igst = buckets.reduce((s, b) => s + b.igst, 0);
  const tax = cgst + sgst + igst;
  const beforeRoundOff = taxable + tax;
  const roundOff = content.roundOff ? roundHalfUp(beforeRoundOff / 100) * 100 - beforeRoundOff : 0;
  const printedLines = lines.filter((l) => !l.isBlank);
  const printedRates = new Set(printedLines.map((l) => l.taxRate));

  return {
    lines,
    supply,
    sellerState,
    placeOfSupply,
    pricesIncludeTax: inclusive,
    subtotal: taxable + discount,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    buckets,
    beforeRoundOff,
    roundOff,
    grandTotal: beforeRoundOff + roundOff,
    hasDiscount: discount > 0,
    mixedRates: gstOn && printedRates.size > 1,
    hasSac: items.some((it, i) => !lines[i].isBlank && !!(it?.sac || "").trim()),
    printedCount: printedLines.length,
  };
}

// ─── Printing money ─────────────────────────────────────────────────────────────────────────────

const RUPEES = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `1740000` → `17,400.00`; with `symbol`, `₹17,400.00`. A negative prints with a real minus. */
export function formatPaise(paise: Paise, opts: { symbol?: boolean } = {}): string {
  const value = Number.isFinite(paise) ? paise : 0;
  const text = RUPEES.format(Math.abs(value) / 100);
  return `${value < 0 ? "−" : ""}${opts.symbol ? "₹" : ""}${text}`;
}

/** A quantity as people write it: `1`, `2.5`, never `2.500`. */
export function formatQuantity(q: number): string {
  if (!Number.isFinite(q)) return "0";
  return Number(q.toFixed(3)).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** `18` → `18%`, `2.5` → `2.5%`. */
export const formatRate = (rate: number): string => `${Number((rate || 0).toFixed(2))}%`;
