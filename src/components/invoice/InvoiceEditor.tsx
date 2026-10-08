/**
 * The left half of the Invoice Builder: eight short sections, in the order an invoice reads.
 *
 * The parts that are the same on every invoice — the business, the tax settings, the bank details,
 * the terms — start filled in (from Settings and the admins' defaults) and folded to a one-line
 * summary. What changes every time — who it is for and what was sold — starts open. A salesperson
 * who opens a new invoice sees two things to fill in, not forty.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, ImagePlus, Loader2, QrCode, RotateCcw, Save, Undo2, Upload } from "lucide-react";
import type { InvoiceContent, InvoiceCustomer, InvoiceDefaults, InvoiceItem, InvoiceStatus } from "@/types/invoice";
import type { InvoiceTotals } from "@/utils/invoiceMath";
import { formatRate } from "@/utils/invoiceMath";
import type { ResolvedCompany } from "@/utils/company";
import {
  GST_RATES, GST_STATES, gstinProblem, normalizeGstin, stateCodeOfGstin, stateName,
} from "@/utils/gst";
import {
  addDaysIso, daysBetween, formatInvoiceDate, paymentSummary, sellerFromCompany, STATUS_LABEL,
} from "@/utils/invoiceDraft";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import ItemsEditor from "@/components/invoice/ItemsEditor";
import { Field, Section, Segmented, TextArea, TextInput, inputClass, type FieldIssue } from "@/components/invoice/editorKit";

export type SectionId = "details" | "business" | "customer" | "items" | "tax" | "payment" | "terms" | "notes";

/** Which section a validation field lives in — so "fix this" can open it first. */
export function sectionOfField(field: string): SectionId {
  if (field === "issueDate" || field === "dueDate") return "details";
  if (field.startsWith("seller.")) return "business";
  if (field.startsWith("customer.")) return "customer";
  if (field.startsWith("items")) return "items";
  if (field.startsWith("payment.")) return "payment";
  if (field.startsWith("tax")) return "tax";
  return "details";
}

const DUE_CHOICES: { days: number; label: string }[] = [
  { days: 0, label: "On receipt" },
  { days: 7, label: "7 days" },
  { days: 15, label: "15 days" },
  { days: 30, label: "30 days" },
];

interface Props {
  content: InvoiceContent;
  update: (fn: (c: InvoiceContent) => InvoiceContent) => void;
  totals: InvoiceTotals;
  number: string | null;
  status: InvoiceStatus;
  readOnly: boolean;
  compact: boolean;
  issueFor: (field: string) => FieldIssue | null;
  open: Record<SectionId, boolean>;
  onToggle: (id: SectionId) => void;
  company: ResolvedCompany;
  logoSrc: string | null;
  logoUploading: boolean;
  onLogoFile: (file: File) => void;
  /** What the QR on the invoice looks like now — the uploaded image or the one made from the UPI ID. */
  qrSrc: string | null;
  qrUploading: boolean;
  onQrFile: (file: File) => void;
  canChangeStatus: boolean;
  statusBusy: boolean;
  onStatusChange: (s: Exclude<InvoiceStatus, "draft">) => void;
  canSaveDefaults: boolean;
  onSaveDefaults: (patch: Partial<InvoiceDefaults>, what: string) => Promise<void>;
  focusItemId: string | null;
  onFocusDone: () => void;
  onAddItem: () => void;
  /** "Fill from a sale" — supplied for salespeople, who have their sales in memory already. */
  fillFromSale?: ReactNode;
  customerSuggestions: InvoiceCustomer[];
  onWantSuggestions: () => void;
}

export default function InvoiceEditor(props: Props) {
  const {
    content, update, totals, number, status, readOnly, compact, issueFor, open, onToggle,
    company, logoSrc, logoUploading, onLogoFile, qrSrc, qrUploading, onQrFile, canChangeStatus, statusBusy, onStatusChange,
    canSaveDefaults, onSaveDefaults, focusItemId, onFocusDone, onAddItem, fillFromSale,
  } = props;
  const c = content;
  const gstOn = c.tax.mode === "gst";

  const setSeller = (p: Partial<InvoiceContent["seller"]>) => update((x) => ({ ...x, seller: { ...x.seller, ...p } }));
  const setCustomer = (p: Partial<InvoiceCustomer>) => update((x) => ({ ...x, customer: { ...x.customer, ...p } }));
  const setPayment = (p: Partial<InvoiceContent["payment"]>) => update((x) => ({ ...x, payment: { ...x.payment, ...p } }));
  const setTax = (p: Partial<InvoiceContent["tax"]>) => update((x) => ({ ...x, tax: { ...x.tax, ...p } }));

  const dueGap = c.issueDate && c.dueDate ? daysBetween(c.issueDate, c.dueDate) : null;
  const rates = new Set(c.items.map((it) => it.taxRate));
  const mixed = rates.size > 1;
  const sellerState = stateCodeOfGstin(c.seller.gstin);

  const [savingDefault, setSavingDefault] = useState<string | null>(null);
  const saveDefault = async (key: string, patch: Partial<InvoiceDefaults>, what: string) => {
    setSavingDefault(key);
    try { await onSaveDefaults(patch, what); } finally { setSavingDefault(null); }
  };
  const defaultButton = (key: string, patch: () => Partial<InvoiceDefaults>, what: string) => canSaveDefaults && !readOnly ? (
    <button
      type="button"
      onClick={() => saveDefault(key, patch(), what)}
      disabled={savingDefault !== null}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      title={`Start every new invoice with these ${what}`}
    >
      {savingDefault === key ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save as default
    </button>
  ) : null;

  return (
    <div className="min-w-0" data-test="invoice-editor">
      {/* 1 ─ Invoice details */}
      <Section id="details" step={1} title="Invoice details" open={open.details} onToggle={() => onToggle("details")}
        summary={`${number || "Draft"} · ${formatInvoiceDate(c.issueDate)}`}>
        <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-4")}>
          <Field label="Invoice number" className={compact ? "col-span-2" : "col-span-2"}>
            <div className={cn(inputClass, "flex items-center bg-muted/40 select-all", !number && "text-muted-foreground")} data-test="invoice-number">
              {number || "Given when you generate"}
            </div>
          </Field>
          <Field label="Status" className="col-span-2">
            {number && canChangeStatus ? (
              <Segmented
                ariaLabel="Invoice status"
                value={status === "draft" ? "issued" : status}
                onChange={(s) => onStatusChange(s)}
                disabled={statusBusy}
                options={[
                  { value: "issued", label: STATUS_LABEL.issued },
                  { value: "paid", label: STATUS_LABEL.paid },
                  { value: "cancelled", label: STATUS_LABEL.cancelled },
                ]}
              />
            ) : (
              <div className={cn(inputClass, "flex items-center bg-muted/40 text-muted-foreground")}>
                {number ? STATUS_LABEL[status] : "Draft — generate to issue"}
              </div>
            )}
          </Field>
          <Field label="Invoice date" htmlFor="inv-issue" field="issueDate" issue={issueFor("issueDate")} className="col-span-2">
            <input
              id="inv-issue"
              disabled={readOnly}
              type="date"
              value={c.issueDate}
              onChange={(e) => {
                const v = e.target.value;
                // Moving the invoice date moves the due date with it — the terms did not change.
                update((x) => ({ ...x, issueDate: v, dueDate: dueGap !== null && v ? addDaysIso(v, Math.max(0, dueGap)) : x.dueDate }));
              }}
              className={inputClass}
              data-test="issue-date"
            />
          </Field>
          <Field label="Due date" htmlFor="inv-due" field="dueDate" issue={issueFor("dueDate")} className="col-span-2">
            <input
              id="inv-due"
              disabled={readOnly}
              type="date"
              value={c.dueDate}
              min={c.issueDate || undefined}
              onChange={(e) => update((x) => ({ ...x, dueDate: e.target.value }))}
              className={inputClass}
              data-test="due-date"
            />
          </Field>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Due in">
          {DUE_CHOICES.map((d) => (
            <button
              key={d.days}
              type="button"
              disabled={readOnly}
              onClick={() => c.issueDate && update((x) => ({ ...x, dueDate: addDaysIso(x.issueDate, d.days) }))}
              className={cn(
                "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
                dueGap === d.days ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >{d.label}</button>
          ))}
        </div>
      </Section>

      {/* 2 ─ Business */}
      <Section disabled={readOnly} id="business" step={2} title="Your business" open={open.business} onToggle={() => onToggle("business")}
        summary={[c.seller.name, c.seller.gstin && `GSTIN ${c.seller.gstin}`].filter(Boolean).join(" · ") || "Add your business details"}
        actions={open.business && !readOnly ? (
          <button type="button" onClick={() => setSeller(sellerFromCompany(company))}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" title="Use the details saved in Settings → Company Documents">
            <RotateCcw size={12} /> Company details
          </button>
        ) : undefined}>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-28 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
            {logoSrc ? <img src={logoSrc} alt="Logo" className="max-h-10 max-w-[100px] object-contain" /> : <Building2 size={18} className="text-slate-400" />}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ImagePickButton uploading={logoUploading} onFile={onLogoFile} label="Change logo" busyLabel="Uploading…" icon={<ImagePlus size={13} />} testId="logo-upload" />
            {c.seller.logoUrl && (
              <button type="button" onClick={() => setSeller({ logoUrl: "" })}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
                <Undo2 size={13} /> Company logo
              </button>
            )}
          </div>
        </div>
        <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2")}>
          <Field label="Business name" htmlFor="inv-sname" field="seller.name" issue={issueFor("seller.name")}>
            <TextInput id="inv-sname" value={c.seller.name} onValue={(v) => setSeller({ name: v })} maxLength={120} invalid={issueFor("seller.name")?.level === "error"} />
          </Field>
          <Field label="GSTIN" htmlFor="inv-sgst" field="seller.gstin" issue={issueFor("seller.gstin")}>
            <TextInput id="inv-sgst" value={c.seller.gstin} onValue={(v) => setSeller({ gstin: normalizeGstin(v).slice(0, 15) })}
              placeholder="37ABCDE1234F1Z5" className="uppercase tracking-wide" invalid={issueFor("seller.gstin")?.level === "error"} />
          </Field>
          <Field label="Address" htmlFor="inv-saddr" className={compact ? "" : "col-span-2"}>
            <TextArea id="inv-saddr" value={c.seller.address} onValue={(v) => setSeller({ address: v })} minRows={2} maxLength={400} />
          </Field>
          <Field label="Website" htmlFor="inv-sweb">
            <TextInput id="inv-sweb" value={c.seller.website} onValue={(v) => setSeller({ website: v })} maxLength={120} />
          </Field>
          <Field label="Email" htmlFor="inv-semail" field="seller.email" issue={issueFor("seller.email")}>
            <TextInput id="inv-semail" type="email" value={c.seller.email} onValue={(v) => setSeller({ email: v.trim() })} maxLength={120} />
          </Field>
          <Field label="Phone" htmlFor="inv-sphone">
            <TextInput id="inv-sphone" type="tel" value={c.seller.phone} onValue={(v) => setSeller({ phone: v })} maxLength={40} />
          </Field>
        </div>
      </Section>

      {/* 3 ─ Customer */}
      <Section disabled={readOnly} id="customer" step={3} title="Customer" open={open.customer} onToggle={() => onToggle("customer")}
        summary={c.customer.name || "Who is this invoice for?"}
        actions={open.customer && !readOnly ? fillFromSale : undefined}>
        <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2")}>
          <CustomerName
            value={c.customer.name}
            issue={issueFor("customer.name")}
            suggestions={props.customerSuggestions}
            onWant={props.onWantSuggestions}
            onValue={(v) => setCustomer({ name: v })}
            onPick={(cust) => update((x) => {
              const pos = stateCodeOfGstin(cust.gstin);
              return { ...x, customer: { ...cust }, tax: pos ? { ...x.tax, placeOfSupply: pos } : x.tax };
            })}
            className={compact ? "" : "col-span-2"}
          />
          <Field label="Email" htmlFor="inv-cemail" field="customer.email" issue={issueFor("customer.email")}>
            <TextInput id="inv-cemail" type="email" value={c.customer.email} onValue={(v) => setCustomer({ email: v.trim() })} placeholder="client@example.com" maxLength={120} />
          </Field>
          <Field label="Phone" htmlFor="inv-cphone">
            <TextInput id="inv-cphone" type="tel" value={c.customer.phone} onValue={(v) => setCustomer({ phone: v })} placeholder="+91 98765 43210" maxLength={40} />
          </Field>
          <Field label="GSTIN" htmlFor="inv-cgst" field="customer.gstin" issue={issueFor("customer.gstin")}
            hint={c.customer.gstin && !gstinProblem(c.customer.gstin) && stateCodeOfGstin(c.customer.gstin) ? `Registered in ${stateName(stateCodeOfGstin(c.customer.gstin))}` : "Leave empty for an unregistered client."}
            className={compact ? "" : "col-span-2"}>
            <TextInput
              id="inv-cgst"
              value={c.customer.gstin}
              onValue={(v) => {
                const g = normalizeGstin(v).slice(0, 15);
                // A registered client's GSTIN names their state — and the state decides CGST+SGST or IGST.
                const pos = !gstinProblem(g) ? stateCodeOfGstin(g) : "";
                update((x) => ({ ...x, customer: { ...x.customer, gstin: g }, tax: pos ? { ...x.tax, placeOfSupply: pos } : x.tax }));
              }}
              placeholder="Optional"
              className="uppercase tracking-wide"
              invalid={issueFor("customer.gstin")?.level === "error"}
              data-test="customer-gstin"
            />
          </Field>
          <Field label="Billing address" htmlFor="inv-cbill" className={compact ? "" : "col-span-2"}>
            <TextArea id="inv-cbill" value={c.customer.billingAddress} onValue={(v) => setCustomer({ billingAddress: v })} minRows={2} maxLength={400} placeholder="Street, area, city, PIN" />
          </Field>
          <label className={cn("flex items-center gap-2 text-sm text-foreground cursor-pointer select-none", compact ? "" : "col-span-2")}>
            <input type="checkbox" checked={c.customer.shipToDifferent} onChange={(e) => setCustomer({ shipToDifferent: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-primary" />
            Ship to a different address
          </label>
          {c.customer.shipToDifferent && (
            <Field label="Shipping address" htmlFor="inv-cship" field="customer.shippingAddress" issue={issueFor("customer.shippingAddress")} className={compact ? "" : "col-span-2"}>
              <TextArea id="inv-cship" value={c.customer.shippingAddress} onValue={(v) => setCustomer({ shippingAddress: v })} minRows={2} maxLength={400} />
            </Field>
          )}
        </div>
      </Section>

      {/* 4 ─ Items */}
      <Section disabled={readOnly} id="items" step={4} title="Items" open={open.items} onToggle={() => onToggle("items")}
        summary={`${totals.printedCount} ${totals.printedCount === 1 ? "item" : "items"}`}>
        <ItemsEditor
          items={c.items}
          totals={totals}
          gstOn={gstOn}
          defaultRate={c.tax.defaultRate}
          pricesIncludeTax={c.tax.pricesIncludeTax}
          disabled={readOnly}
          compact={compact}
          issueFor={issueFor}
          onChange={(items: InvoiceItem[]) => update((x) => ({ ...x, items }))}
          focusId={focusItemId}
          onFocusDone={onFocusDone}
          onAdd={onAddItem}
        />
      </Section>

      {/* 5 ─ Tax */}
      <Section disabled={readOnly} id="tax" step={5} title="Tax" open={open.tax} onToggle={() => onToggle("tax")}
        summary={gstOn
          ? `GST ${mixed ? "mixed rates" : formatRate(c.tax.defaultRate)} · ${c.tax.pricesIncludeTax ? "rate includes GST" : "added on top"} · ${totals.supply === "inter" ? "IGST" : "CGST + SGST"}`
          : "No GST"}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented ariaLabel="GST" value={c.tax.mode} onChange={(m) => setTax({ mode: m })}
              options={[{ value: "gst", label: "GST invoice" }, { value: "none", label: "No GST" }]} />
            {gstOn && (
              <Segmented ariaLabel="Prices" value={c.tax.pricesIncludeTax ? "incl" : "excl"} onChange={(v) => setTax({ pricesIncludeTax: v === "incl" })}
                options={[{ value: "excl", label: "Add GST on top" }, { value: "incl", label: "Rate includes GST" }]} />
            )}
          </div>
          {gstOn && (
            <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2")}>
              <Field label="GST rate" htmlFor="inv-rate" hint={mixed ? "Items have different rates — choosing one applies it to every item." : "Applies to every item. A single item can have its own rate under ⋯ → SAC, discount, GST."}>
                <select
                  id="inv-rate"
                  value={mixed ? "mixed" : String(c.tax.defaultRate)}
                  onChange={(e) => {
                    const r = Number(e.target.value);
                    if (!Number.isFinite(r)) return;
                    update((x) => ({ ...x, tax: { ...x.tax, defaultRate: r }, items: x.items.map((it) => ({ ...it, taxRate: r })) }));
                  }}
                  className={inputClass}
                  data-test="invoice-gst-rate"
                >
                  {mixed && <option value="mixed">Mixed rates</option>}
                  {GST_RATES.map((r) => <option key={r} value={r}>{formatRate(r)}</option>)}
                </select>
              </Field>
              <Field label="Place of supply" htmlFor="inv-pos"
                hint={totals.supply === "inter"
                  ? `Outside ${stateName(sellerState) || "your state"} — IGST at the full rate.`
                  : `Within ${stateName(sellerState) || "your state"} — CGST + SGST, half the rate each.`}>
                <select id="inv-pos" value={c.tax.placeOfSupply || sellerState} onChange={(e) => setTax({ placeOfSupply: e.target.value })} className={inputClass} data-test="place-of-supply">
                  {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
            </div>
          )}
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm text-foreground">Round total to the nearest rupee</span>
              <span className="block text-xs text-muted-foreground">Prints the difference as “Round off”.</span>
            </span>
            <Switch checked={c.roundOff} onCheckedChange={(v) => update((x) => ({ ...x, roundOff: v }))} disabled={readOnly} aria-label="Round off" />
          </label>
          {canSaveDefaults && !readOnly && (
            <div className="flex justify-end">
              {defaultButton("tax", () => ({ taxRate: c.tax.defaultRate, pricesIncludeTax: c.tax.pricesIncludeTax }), "tax settings")}
            </div>
          )}
        </div>
      </Section>

      {/* 6 ─ Payment */}
      <Section disabled={readOnly} id="payment" step={6} title="Payment details" open={open.payment} onToggle={() => onToggle("payment")}
        summary={paymentSummary(c.payment)}
        actions={open.payment ? defaultButton("payment", () => ({ payment: { ...c.payment } }), "payment details") : undefined}>
        <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2")}>
          <Field label="Bank name" htmlFor="inv-bank"><TextInput id="inv-bank" value={c.payment.bankName} onValue={(v) => setPayment({ bankName: v })} maxLength={80} /></Field>
          <Field label="Branch" htmlFor="inv-branch"><TextInput id="inv-branch" value={c.payment.branch} onValue={(v) => setPayment({ branch: v })} maxLength={120} /></Field>
          <Field label="Account name" htmlFor="inv-acname"><TextInput id="inv-acname" value={c.payment.accountName} onValue={(v) => setPayment({ accountName: v })} placeholder="Optional" maxLength={120} /></Field>
          <Field label="Account number" htmlFor="inv-acno"><TextInput id="inv-acno" value={c.payment.accountNumber} onValue={(v) => setPayment({ accountNumber: v.replace(/[^0-9A-Za-z]/g, "").slice(0, 24) })} inputMode="numeric" /></Field>
          <Field label="IFSC" htmlFor="inv-ifsc" field="payment.ifsc" issue={issueFor("payment.ifsc")}>
            <TextInput id="inv-ifsc" value={c.payment.ifsc} onValue={(v) => setPayment({ ifsc: v.toUpperCase().replace(/\s/g, "").slice(0, 11) })} className="uppercase tracking-wide" />
          </Field>
          <Field label="SWIFT" htmlFor="inv-swift"><TextInput id="inv-swift" value={c.payment.swift} onValue={(v) => setPayment({ swift: v.toUpperCase().replace(/\s/g, "").slice(0, 11) })} className="uppercase tracking-wide" placeholder="Optional" /></Field>
          <Field label="UPI ID" htmlFor="inv-upi" field="payment.upiId" issue={issueFor("payment.upiId")} className={compact ? "" : "col-span-2"}>
            <TextInput id="inv-upi" value={c.payment.upiId} onValue={(v) => setPayment({ upiId: v.trim() })} placeholder="name@bank" data-test="upi-id" />
          </Field>
          {/* The QR: the company's own uploaded image, or one made here from the UPI ID (owner, 2026-10-08). */}
          <div className={cn("rounded-xl border border-border p-3 flex items-start gap-3", compact ? "" : "col-span-2")} data-test="qr-block">
            <div className="w-[76px] h-[76px] rounded-lg border border-border bg-white flex items-center justify-center shrink-0 overflow-hidden">
              {qrSrc && c.payment.showQr
                ? <img src={qrSrc} alt="UPI QR code" className="w-[64px] h-[64px] object-contain" data-test="qr-thumb" />
                : <QrCode size={26} className="text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">UPI QR code on the invoice</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {c.payment.qrImageUrl
                      ? "Your uploaded QR image is printed."
                      : "Made from the UPI ID above, with the invoice total already filled in."}
                  </span>
                </span>
                <Switch checked={c.payment.showQr} onCheckedChange={(v) => setPayment({ showQr: v })} disabled={readOnly} aria-label="Show UPI QR code" data-test="qr-toggle" />
              </label>
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <ImagePickButton
                    uploading={qrUploading}
                    onFile={onQrFile}
                    label={c.payment.qrImageUrl ? "Replace QR image" : "Upload your QR image"}
                    busyLabel="Uploading…"
                    icon={<Upload size={13} />}
                    testId="qr-upload"
                  />
                  {c.payment.qrImageUrl && (
                    <button type="button" onClick={() => setPayment({ qrImageUrl: "" })} data-test="qr-remove"
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
                      <Undo2 size={13} /> Use the UPI ID instead
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* 7 ─ Terms */}
      <Section disabled={readOnly} id="terms" step={7} title="Terms & conditions" open={open.terms} onToggle={() => onToggle("terms")}
        summary={c.terms.split("\n")[0] || "No terms"}
        actions={open.terms ? defaultButton("terms", () => ({ terms: c.terms }), "terms") : undefined}>
        <TextArea value={c.terms} onValue={(v) => update((x) => ({ ...x, terms: v }))} minRows={3} maxLength={2000} aria-label="Terms and conditions" placeholder="One term per line" />
      </Section>

      {/* 8 ─ Notes */}
      <Section disabled={readOnly} id="notes" step={8} title="Notes" open={open.notes} onToggle={() => onToggle("notes")}
        summary={c.notes.split("\n")[0] || "No notes"}
        actions={open.notes ? defaultButton("notes", () => ({ notes: c.notes }), "notes") : undefined}>
        <TextArea value={c.notes} onValue={(v) => update((x) => ({ ...x, notes: v }))} minRows={3} maxLength={2000} aria-label="Notes" placeholder="A thank-you, a reference, anything the client should read" />
      </Section>
    </div>
  );
}

/** A small button that opens the file picker for one image (the logo, the QR). */
function ImagePickButton({ uploading, onFile, label, busyLabel, icon, testId }: {
  uploading: boolean;
  onFile: (f: File) => void;
  label: string;
  busyLabel: string;
  icon: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-test={testId ? `${testId}-input` : undefined}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading} data-test={testId}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60">
        {uploading ? <Loader2 size={13} className="animate-spin" /> : icon} {uploading ? busyLabel : label}
      </button>
    </>
  );
}

/** The customer's name, with the people this person has invoiced before one click away. */
function CustomerName({ value, issue, suggestions, onWant, onValue, onPick, className }: {
  value: string;
  issue: FieldIssue | null;
  suggestions: InvoiceCustomer[];
  onWant: () => void;
  onValue: (v: string) => void;
  onPick: (c: InvoiceCustomer) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    return suggestions.filter((s) => s.name.trim().toLowerCase() !== q && (!q || s.name.toLowerCase().includes(q))).slice(0, 6);
  }, [suggestions, value]);
  const show = focused && matches.length > 0;

  return (
    <Field label="Customer or business name" htmlFor="inv-cname" field="customer.name" issue={issue} className={cn("relative", className)}>
      <TextInput
        id="inv-cname"
        value={value}
        onValue={(v) => { onValue(v); setActive(0); }}
        onFocus={() => { setFocused(true); onWant(); }}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(matches.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter") { e.preventDefault(); onPick(matches[active]); setFocused(false); }
          if (e.key === "Escape") setFocused(false);
        }}
        placeholder="e.g. Samas Sarees"
        maxLength={140}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls="inv-cname-list"
        invalid={issue?.level === "error"}
        data-test="customer-name"
      />
      {show && (
        <ul id="inv-cname-list" role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg py-1 max-h-64 overflow-auto">
          <li className="px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Invoiced before</li>
          {matches.map((m, i) => (
            <li key={m.name} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(m); setFocused(false); }}
                className={cn("w-full text-left px-3 py-2 text-sm", i === active ? "bg-accent" : "hover:bg-accent/60")}>
                <span className="block text-foreground truncate">{m.name}</span>
                {(m.gstin || m.phone) && <span className="block text-xs text-muted-foreground truncate">{[m.gstin, m.phone].filter(Boolean).join(" · ")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

