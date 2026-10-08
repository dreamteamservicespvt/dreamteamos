/**
 * The invoice on paper — one A4 sheet, and the measuring copy that decides where the sheets break.
 *
 * ── One rendering for screen, PDF and print ───────────────────────────────────────────────────
 * The live preview shows these sheets scaled down; the PDF photographs the same sheets at full size;
 * the print dialog receives them too. Nothing else draws an invoice, so the three cannot disagree.
 *
 * ── Inline styles, not Tailwind ───────────────────────────────────────────────────────────────
 * Paper is white in every theme. Tailwind's colours here are theme variables, and an inherited
 * near-white `color` from the dark theme is exactly how the HR letters once printed grey ghosts
 * (§28 "ink-colour bug"). Every colour below is a literal, set on the element that uses it.
 *
 * ── No tabular figures ────────────────────────────────────────────────────────────────────────
 * The PDF is drawn by html2canvas, and a canvas ignores `font-variant-numeric`. Turning tabular
 * figures on here would make every right-aligned amount a pixel wider on screen than in the file.
 *
 * Geometry is A4 at 96 dpi, the same 794 × 1123 the HR documents use (`utils/documentPages`).
 */
import type { ReactNode } from "react";
import type { InvoiceContent, InvoiceStatus } from "@/types/invoice";
import type { InvoiceTotals } from "@/utils/invoiceMath";
import { formatPaise, formatQuantity, formatRate } from "@/utils/invoiceMath";
import { formatInvoiceDate, rupeesInWords } from "@/utils/invoiceDraft";
import { stateName } from "@/utils/gst";
import type { InvoiceLayoutBlock, InvoicePagePlan } from "@/utils/invoiceLayout";

export const PAGE_W = 794;
export const PAGE_H = 1123;
const PAD_X = 56;
const PAD_TOP = 48;
/** Room kept at the foot of every sheet for the footer line. */
const FOOT_ZONE = 58;
/** The continuation header on sheet 2 onwards — a fixed height, so the plan can rely on it. */
const CONT_H = 58;
/** Sub-pixel rounding across a dozen rows can add up to a pixel or two; never let it clip a line. */
const SAFETY = 6;

export const CONTENT_W = PAGE_W - PAD_X * 2;
export const FIRST_PAGE_HEIGHT = PAGE_H - PAD_TOP - FOOT_ZONE - SAFETY;
export const NEXT_PAGE_HEIGHT = FIRST_PAGE_HEIGHT - CONT_H;

const FONT = '"Inter", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const RULE = "#e2e8f0";
const ROW_RULE = "#edf1f6";
const SOFT = "#f1f5f9";

const label: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: MUTED, lineHeight: 1.4,
};
const wrap: React.CSSProperties = { overflowWrap: "anywhere", wordBreak: "break-word" };

// ─── The model every block renders from ─────────────────────────────────────────────────────────

export interface PaperColumn {
  key: "no" | "item" | "sac" | "qty" | "rate" | "discount" | "gst" | "amount";
  label: string;
  width: string;
  align: "left" | "right";
}

export interface PaperAfterBlock extends Omit<InvoiceLayoutBlock, "height"> {
  render: () => ReactNode;
}

export interface PaperModel {
  content: InvoiceContent;
  totals: InvoiceTotals;
  number: string | null;
  status: InvoiceStatus;
  logoSrc: string | null;
  qrSrc: string | null;
  showQr: boolean;
  columns: PaperColumn[];
  gridTemplate: string;
  /** Indexes into `content.items` of the lines that print (blank lines never do). */
  printedRows: number[];
  after: PaperAfterBlock[];
}

const splitParagraphs = (text: string): string[] =>
  (text || "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");

/** Build the model once per change; the measuring copy and every sheet share it. */
export function buildPaperModel(input: {
  content: InvoiceContent;
  totals: InvoiceTotals;
  number: string | null;
  status: InvoiceStatus;
  logoSrc: string | null;
  qrSrc: string | null;
  showQr: boolean;
}): PaperModel {
  const { content, totals } = input;
  const columns: PaperColumn[] = [
    { key: "no", label: "#", width: "22px", align: "left" },
    { key: "item", label: "Item", width: "minmax(0, 1fr)", align: "left" },
  ];
  if (totals.hasSac) columns.push({ key: "sac", label: "HSN/SAC", width: "64px", align: "left" });
  columns.push({ key: "qty", label: "Qty", width: "46px", align: "right" });
  columns.push({ key: "rate", label: "Rate", width: "90px", align: "right" });
  if (totals.hasDiscount) columns.push({ key: "discount", label: "Discount", width: "78px", align: "right" });
  if (totals.mixedRates) columns.push({ key: "gst", label: "GST", width: "48px", align: "right" });
  columns.push({ key: "amount", label: "Amount", width: "100px", align: "right" });

  const printedRows = totals.lines.map((l, i) => (l.isBlank ? -1 : i)).filter((i) => i >= 0);

  const model: PaperModel = {
    ...input,
    columns,
    gridTemplate: columns.map((c) => c.width).join(" "),
    printedRows,
    after: [],
  };

  model.after.push({ key: "summary", keepWithRows: true, render: () => <Summary model={model} /> });
  if (hasPayment(model)) model.after.push({ key: "payment", render: () => <Payment model={model} /> });

  const terms = splitParagraphs(content.terms);
  if (terms.length) {
    model.after.push({ key: "terms-h", keepWithNext: true, render: () => <SectionHeading>Terms &amp; conditions</SectionHeading> });
    terms.forEach((t, i) => model.after.push({ key: `terms-${i}`, render: () => <Paragraph>{t}</Paragraph> }));
  }
  const notes = splitParagraphs(content.notes);
  if (notes.length) {
    model.after.push({ key: "notes-h", keepWithNext: true, render: () => <SectionHeading>Notes</SectionHeading> });
    notes.forEach((t, i) => model.after.push({ key: `notes-${i}`, render: () => <Paragraph>{t}</Paragraph> }));
  }
  return model;
}

function hasPayment(model: PaperModel): boolean {
  const p = model.content.payment;
  return [p.bankName, p.accountNumber, p.ifsc, p.swift, p.upiId, p.branch, p.accountName].some((v) => (v || "").trim() !== "")
    || !!(model.showQr && model.qrSrc);
}

// ─── Blocks ─────────────────────────────────────────────────────────────────────────────────────

function Placeholder({ children }: { children: ReactNode }) {
  return <span style={{ color: FAINT, fontStyle: "italic" }}>{children}</span>;
}

/** The invoice heading and both parties — sheet 1 only. */
export function Intro({ model }: { model: PaperModel }) {
  const { content, number, status, logoSrc, totals } = model;
  const s = content.seller;
  const c = content.customer;
  const gstOn = content.tax.mode === "gst";
  const contact = [s.website, s.email, s.phone].map((v) => v.trim()).filter(Boolean).join("  ·  ");
  const customerContact = [c.email, c.phone].map((v) => v.trim()).filter(Boolean).join("  ·  ");
  const pos = totals.placeOfSupply;

  return (
    <div style={{ display: "flow-root" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 32 }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          {logoSrc ? (
            <img src={logoSrc} alt="" style={{ display: "block", height: 44, maxWidth: 170, objectFit: "contain", objectPosition: "left center" }} />
          ) : null}
          <div style={{ marginTop: logoSrc ? 14 : 0, fontSize: 15, fontWeight: 600, color: INK, lineHeight: 1.3, ...wrap }}>
            {s.name.trim() || <Placeholder>Your business name</Placeholder>}
          </div>
          {s.address.trim() && (
            <div style={{ marginTop: 4, fontSize: 10.5, color: BODY, lineHeight: 1.55, whiteSpace: "pre-line", ...wrap }}>{s.address.trim()}</div>
          )}
          {s.gstin.trim() && (
            <div style={{ marginTop: 4, fontSize: 10.5, color: BODY, lineHeight: 1.5 }}>
              <span style={{ color: MUTED }}>GSTIN </span>{s.gstin.trim().toUpperCase()}
            </div>
          )}
          {contact && <div style={{ marginTop: 2, fontSize: 10.5, color: MUTED, lineHeight: 1.5, ...wrap }}>{contact}</div>}
        </div>

        <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 200 }}>
          <div style={{ ...label, fontSize: 10, letterSpacing: "0.18em", color: MUTED }}>{gstOn ? "Tax invoice" : "Invoice"}</div>
          <div style={{ marginTop: 6, fontSize: 21, fontWeight: 600, color: number ? INK : FAINT, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
            {number || "Draft"}
          </div>
          {!number && <div style={{ marginTop: 2, fontSize: 9.5, color: FAINT }}>Number given when generated</div>}
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto auto", justifyContent: "end", columnGap: 16, rowGap: 4, fontSize: 10.5, lineHeight: 1.45 }}>
            <span style={{ color: MUTED, textAlign: "left" }}>Invoice date</span>
            <span style={{ color: INK, fontWeight: 500 }}>{formatInvoiceDate(content.issueDate)}</span>
            {content.dueDate && (<>
              <span style={{ color: MUTED, textAlign: "left" }}>Due date</span>
              <span style={{ color: INK, fontWeight: 500 }}>{formatInvoiceDate(content.dueDate)}</span>
            </>)}
          </div>
          {(status === "paid" || status === "cancelled") && (
            <div style={{
              display: "inline-block", marginTop: 12, padding: "3px 10px", borderRadius: 999,
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: status === "paid" ? "#047857" : "#b91c1c",
              background: status === "paid" ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${status === "paid" ? "#a7f3d0" : "#fecaca"}`,
            }}>{status === "paid" ? "Paid" : "Cancelled"}</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, borderTop: `1px solid ${RULE}`, paddingTop: 18, display: "flex", gap: 28 }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div style={label}>Billed to</div>
          <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.35, ...wrap }}>
            {c.name.trim() || <Placeholder>Customer name</Placeholder>}
          </div>
          {c.gstin.trim() && (
            <div style={{ marginTop: 3, fontSize: 10.5, color: BODY, lineHeight: 1.5 }}>
              <span style={{ color: MUTED }}>GSTIN </span>{c.gstin.trim().toUpperCase()}
            </div>
          )}
          {c.billingAddress.trim() && (
            <div style={{ marginTop: 3, fontSize: 10.5, color: BODY, lineHeight: 1.55, whiteSpace: "pre-line", ...wrap }}>{c.billingAddress.trim()}</div>
          )}
          {customerContact && <div style={{ marginTop: 3, fontSize: 10.5, color: MUTED, lineHeight: 1.5, ...wrap }}>{customerContact}</div>}
        </div>
        {c.shipToDifferent && (
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={label}>Ship to</div>
            <div style={{ marginTop: 6, fontSize: 10.5, color: BODY, lineHeight: 1.55, whiteSpace: "pre-line", ...wrap }}>
              {c.shippingAddress.trim() || <Placeholder>Shipping address</Placeholder>}
            </div>
          </div>
        )}
        {gstOn && (
          <div style={{ flex: "0 0 150px", minWidth: 0 }}>
            <div style={label}>Place of supply</div>
            <div style={{ marginTop: 6, fontSize: 10.5, color: INK, fontWeight: 500, lineHeight: 1.5 }}>
              {stateName(pos) || "—"}{pos ? <span style={{ color: MUTED, fontWeight: 400 }}> ({pos})</span> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The table's column labels — repeated at the top of every sheet that carries rows. */
export function TableHead({ model }: { model: PaperModel }) {
  return (
    <div style={{ display: "flow-root", paddingTop: 24 }}>
      <div style={{
        display: "grid", gridTemplateColumns: model.gridTemplate, columnGap: 12,
        paddingBottom: 8, borderBottom: `1.5px solid ${INK}`,
      }}>
        {model.columns.map((col) => (
          <div key={col.key} style={{ ...label, textAlign: col.align, color: BODY }}>{col.label}</div>
        ))}
      </div>
    </div>
  );
}

export function Row({ model, index }: { model: PaperModel; index: number }) {
  const item = model.content.items[index];
  const line = model.totals.lines[index];
  if (!item || !line) return null;
  const cell = (key: PaperColumn["key"]): ReactNode => {
    switch (key) {
      case "no": return <span style={{ color: FAINT }}>{line.number}</span>;
      case "item": return (
        <div style={{ minWidth: 0 }}>
          <div style={{ color: INK, fontWeight: 500, ...wrap }}>{item.name.trim() || <Placeholder>Item</Placeholder>}</div>
          {item.description.trim() && (
            <div style={{ marginTop: 2, fontSize: 10, color: MUTED, lineHeight: 1.5, whiteSpace: "pre-line", ...wrap }}>{item.description.trim()}</div>
          )}
        </div>
      );
      case "sac": return <span style={{ color: BODY, ...wrap }}>{item.sac.trim()}</span>;
      case "qty": return formatQuantity(line.quantity);
      case "rate": return formatPaise(line.displayRate);
      case "discount": return line.displayDiscount > 0 ? <span style={{ color: BODY }}>−{formatPaise(line.displayDiscount)}</span> : <span style={{ color: FAINT }}>—</span>;
      case "gst": return formatRate(line.taxRate);
      case "amount": return <span style={{ color: INK, fontWeight: 500 }}>{formatPaise(line.amount)}</span>;
    }
  };
  return (
    <div style={{
      display: "grid", gridTemplateColumns: model.gridTemplate, columnGap: 12,
      padding: "10px 0", borderBottom: `1px solid ${ROW_RULE}`, fontSize: 11, color: BODY, lineHeight: 1.45,
      alignItems: "start",
    }}>
      {model.columns.map((col) => (
        <div key={col.key} style={{ textAlign: col.align, minWidth: 0 }}>{cell(col.key)}</div>
      ))}
    </div>
  );
}

/** Shown in place of rows while the invoice has no item yet. */
export function EmptyRow({ model }: { model: PaperModel }) {
  return (
    <div style={{ padding: "18px 0", borderBottom: `1px solid ${ROW_RULE}`, fontSize: 11, color: FAINT, fontStyle: "italic", gridTemplateColumns: model.gridTemplate }}>
      Items you add appear here.
    </div>
  );
}

function SummaryLine({ name, value, strong }: { name: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 11, lineHeight: 1.45, padding: "3px 0" }}>
      <span style={{ color: strong ? INK : MUTED, fontWeight: strong ? 500 : 400 }}>{name}</span>
      <span style={{ color: INK, fontWeight: strong ? 500 : 400, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Summary({ model }: { model: PaperModel }) {
  const t = model.totals;
  const gstOn = model.content.tax.mode === "gst";
  return (
    <div style={{ display: "flow-root", paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, paddingTop: 4 }}>
          <div style={label}>Amount in words</div>
          <div style={{ marginTop: 5, fontSize: 10.5, color: INK, lineHeight: 1.55, ...wrap }}>{rupeesInWords(t.grandTotal)}</div>
          {gstOn && t.pricesIncludeTax && t.tax > 0 && (
            <div style={{ marginTop: 6, fontSize: 9.5, color: MUTED, lineHeight: 1.5 }}>Prices include GST.</div>
          )}
        </div>
        <div style={{ flex: "0 0 262px" }}>
          <SummaryLine name="Subtotal" value={formatPaise(t.subtotal)} />
          {t.discount > 0 && <SummaryLine name="Discount" value={`−${formatPaise(t.discount)}`} />}
          {t.discount > 0 && gstOn && <SummaryLine name="Taxable value" value={formatPaise(t.taxable)} strong />}
          {gstOn && t.buckets.filter((b) => b.tax > 0).map((b) => (
            t.supply === "inter"
              ? <SummaryLine key={`i${b.rate}`} name={`IGST (${formatRate(b.rate)})`} value={formatPaise(b.igst)} />
              : [
                  <SummaryLine key={`c${b.rate}`} name={`CGST (${formatRate(b.rate / 2)})`} value={formatPaise(b.cgst)} />,
                  <SummaryLine key={`s${b.rate}`} name={`SGST (${formatRate(b.rate / 2)})`} value={formatPaise(b.sgst)} />,
                ]
          ))}
          {t.roundOff !== 0 && <SummaryLine name="Round off" value={formatPaise(t.roundOff)} />}
          <div style={{
            marginTop: 8, background: SOFT, borderRadius: 8, padding: "10px 12px",
            display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: INK }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: INK, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{formatPaise(t.grandTotal, { symbol: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Payment({ model }: { model: PaperModel }) {
  const p = model.content.payment;
  const rows: [string, string][] = ([
    ["Bank", p.bankName],
    ["Branch", p.branch],
    ["Account name", p.accountName],
    ["Account no.", p.accountNumber],
    ["IFSC", p.ifsc.toUpperCase()],
    ["SWIFT", p.swift.toUpperCase()],
    ["UPI ID", p.upiId],
  ] as [string, string][]).filter(([, v]) => (v || "").trim());
  const qr = model.showQr && model.qrSrc;
  return (
    <div style={{ display: "flow-root", paddingTop: 22 }}>
      <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 16, display: "flex", justifyContent: "space-between", gap: 24 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={label}>Payment details</div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", rowGap: 4, columnGap: 12, fontSize: 10.5, lineHeight: 1.5 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <span style={{ color: MUTED }}>{k}</span>
                <span style={{ color: INK, ...wrap }}>{v.trim()}</span>
              </div>
            ))}
          </div>
        </div>
        {qr && (
          <div style={{ flex: "0 0 auto", textAlign: "center" }}>
            {/* A block frame with no fill of its own: html2canvas painted an inline-block's white
                background OVER its image, and every PDF came out with an empty square (2026-10-08). */}
            <div style={{ border: `1px solid ${RULE}`, borderRadius: 10, padding: 8, display: "block", boxSizing: "border-box", width: 114, margin: "0 auto" }}>
              <img src={model.qrSrc!} alt="UPI QR code" style={{ display: "block", width: 96, height: 96 }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 9.5, fontWeight: 600, color: INK }}>Scan to pay</div>
            <div style={{ fontSize: 9.5, color: MUTED }}>{formatPaise(model.totals.grandTotal, { symbol: true })} by UPI</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <div style={{ display: "flow-root", paddingTop: 20 }}><div style={label}>{children}</div></div>;
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flow-root", paddingTop: 5 }}>
      <div style={{ fontSize: 10.5, color: BODY, lineHeight: 1.6, ...wrap }}>{children}</div>
    </div>
  );
}

// ─── Sheets ─────────────────────────────────────────────────────────────────────────────────────

function Watermark({ status }: { status: InvoiceStatus }) {
  if (status !== "draft" && status !== "cancelled") return null;
  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none", overflow: "hidden",
    }}>
      <div style={{
        transform: "rotate(-28deg)", fontSize: status === "draft" ? 150 : 110, fontWeight: 800, letterSpacing: "0.08em",
        color: status === "draft" ? "rgba(15, 23, 42, 0.045)" : "rgba(220, 38, 38, 0.07)", fontFamily: FONT,
      }}>{status === "draft" ? "DRAFT" : "CANCELLED"}</div>
    </div>
  );
}

function ContinuationHeader({ model }: { model: PaperModel }) {
  const gstOn = model.content.tax.mode === "gst";
  return (
    <div style={{
      height: CONT_H, boxSizing: "border-box", paddingBottom: 12, borderBottom: `1px solid ${RULE}`,
      display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: INK, ...wrap }}>{model.content.seller.name}</span>
      <span style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap" }}>
        {gstOn ? "Tax invoice" : "Invoice"} {model.number || "(draft)"} · continued
      </span>
    </div>
  );
}

/** One finished A4 sheet. `data-invoice-page` is what the PDF and print paths collect. */
export function InvoicePage({ model, plan, index, count }: {
  model: PaperModel;
  plan: InvoicePagePlan;
  index: number;
  count: number;
}) {
  const s = model.content.seller;
  const footLeft = [s.name.trim(), s.website.trim()].filter(Boolean).join("  ·  ");
  return (
    <div
      data-invoice-page="true"
      data-document-page="true"
      style={{
        position: "relative", width: PAGE_W, height: PAGE_H, overflow: "hidden", boxSizing: "border-box",
        background: "#ffffff", color: INK, fontFamily: FONT, colorScheme: "light",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <Watermark status={model.status} />
      <div style={{ position: "absolute", left: PAD_X, right: PAD_X, top: PAD_TOP, height: FIRST_PAGE_HEIGHT + SAFETY }}>
        {!plan.intro && <ContinuationHeader model={model} />}
        {plan.intro && <Intro model={model} />}
        {plan.tableHead && <TableHead model={model} />}
        {plan.rows.map((r) =>
          model.printedRows.length === 0
            ? <EmptyRow key="empty" model={model} />
            : <Row key={model.content.items[model.printedRows[r]]?.id ?? r} model={model} index={model.printedRows[r]} />,
        )}
        {plan.after.map((key) => {
          const block = model.after.find((b) => b.key === key);
          return block ? <div key={key}>{block.render()}</div> : null;
        })}
      </div>
      <div style={{
        position: "absolute", left: PAD_X, right: PAD_X, bottom: 22, paddingTop: 8, borderTop: `1px solid ${RULE}`,
        display: "flex", justifyContent: "space-between", gap: 16, fontSize: 9, color: FAINT, lineHeight: 1.4,
      }}>
        <span style={{ ...wrap }}>{footLeft}</span>
        <span style={{ whiteSpace: "nowrap" }}>
          {model.number ? `${model.number}  ·  ` : ""}Page {index + 1} of {count}
        </span>
      </div>
    </div>
  );
}

/**
 * Every block stacked at the sheet's content width, for measuring. Rendered off-screen; never seen.
 * `data-block` names what each element is, and `planInvoicePages` turns their heights into sheets.
 */
export function InvoiceMeasure({ model }: { model: PaperModel }) {
  return (
    <div style={{ width: CONTENT_W, fontFamily: FONT, color: INK, background: "#ffffff" }}>
      <div data-block="intro"><Intro model={model} /></div>
      <div data-block="thead"><TableHead model={model} /></div>
      {model.printedRows.length === 0
        ? <div data-block="row"><EmptyRow model={model} /></div>
        : model.printedRows.map((i) => (
          <div data-block="row" key={model.content.items[i].id}><Row model={model} index={i} /></div>
        ))}
      {model.after.map((b) => (
        <div data-block="after" data-key={b.key} key={b.key}>{b.render()}</div>
      ))}
    </div>
  );
}
