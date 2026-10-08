/**
 * Invoices → Settings — `/invoices/settings` (owner, 2026-10-08).
 *
 * "For the invoice section we need a settings option: upload the logo, the QR code and the details,
 * prefilled with everything you already have. Every invoice shows them by default; if I want to change
 * something while creating an invoice, I'll change it there."
 *
 * So this page holds what every NEW invoice starts with — the business block and logo, the bank details
 * and QR, the GST rate and how it is charged, the due-date gap, the terms and the notes — stored in
 * `invoice_settings/defaults`. It opens prefilled: the admins' saved values over Settings → Company
 * Documents over the company's own last invoice (`resolveInvoiceDefaults`). Invoices already made keep
 * their own details (each is a snapshot); one invoice can still be changed inside the builder.
 *
 * Only the four admins can change it — a different bank account on every new invoice is a fraud, not a
 * typo — and the Firestore rules say the same (`invoice_settings/defaults` → `invoiceAdmin`).
 *
 * A live preview of a sample invoice sits beside the form, drawn by the same sheets as every real one.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, Check, ImagePlus, Landmark, Loader2, Lock, NotebookPen, Percent, QrCode, RotateCcw, ScrollText,
  Undo2, Upload, X,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useInvoiceDefaults } from "@/hooks/useInvoiceSettings";
import { useLeaveGuard } from "@/hooks/useLeaveGuard";
import { holdUpdates } from "@/services/appUpdate";
import { uploadToCloudinary } from "@/services/cloudinary";
import { saveInvoiceDefaults } from "@/services/invoiceSettings";
import type { InvoiceContent, InvoicePayment, InvoiceSeller } from "@/types/invoice";
import {
  addDaysIso, EMPTY_CUSTOMER, isoDate, resolveInvoiceDefaults, sellerFromCompany,
} from "@/utils/invoiceDraft";
import { formatRate } from "@/utils/invoiceMath";
import {
  GST_RATES, GSTIN_PROBLEM_TEXT, HOME_STATE_CODE, gstinProblem, isValidIfsc, isValidUpiId, normalizeGstin, stateCodeOfGstin,
} from "@/utils/gst";
import { canEditInvoiceDefaults } from "@/utils/invoiceAccess";
import { optimizeLogoFile } from "@/utils/signatureImage";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import InvoiceAccessCard from "@/components/invoice/InvoiceAccessCard";
import { Field, NumberInput, Segmented, TextArea, TextInput, inputClass, type FieldIssue } from "@/components/invoice/editorKit";
import { squareImageFile, useInlinedImage } from "@/components/invoice/useInvoiceAssets";
import { useInvoicePaper } from "@/components/invoice/useInvoicePaper";

/** What this page edits — exactly the defaults a new invoice is built from. */
interface SettingsForm {
  seller: InvoiceSeller;
  payment: InvoicePayment;
  taxRate: number;
  pricesIncludeTax: boolean;
  dueDays: number;
  terms: string;
  notes: string;
}

const DUE_CHOICES = [0, 5, 7, 15, 30];

const fingerprint = (f: SettingsForm | null) => JSON.stringify(f);

export default function InvoiceSettings() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { company, loaded: companyLoaded } = useCompany();
  const companyLogo = useCompanyLogo();
  const { defaults, loaded: defaultsLoaded } = useInvoiceDefaults();

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [baseFp, setBaseFp] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [width, setWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const resolved = useMemo<SettingsForm>(() => {
    const r = resolveInvoiceDefaults(defaults, company);
    return { seller: r.seller, payment: r.payment, taxRate: r.taxRate, pricesIncludeTax: r.pricesIncludeTax, dueDays: r.dueDays, terms: r.terms, notes: r.notes };
  }, [defaults, company]);

  const dirty = !!form && fingerprint(form) !== baseFp;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Prefill once both records are in — and follow a change made elsewhere while nothing is typed here.
  // Keyed on the resolved VALUES, not the object: an object rebuilt with the same values must not set
  // state again (that loop pegged the page once — see useCompany).
  const resolvedFp = fingerprint(resolved);
  useEffect(() => {
    if (!companyLoaded || !defaultsLoaded) return;
    if (form && dirtyRef.current) return;
    if (form && fingerprint(form) === resolvedFp) return;
    setForm(resolved);
    setBaseFp(resolvedFp);
  }, [resolvedFp, companyLoaded, defaultsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [form === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const wide = width >= 1060;
  const formWidth = wide ? Math.min(620, Math.max(460, Math.round(width * 0.45))) : width;
  const compact = formWidth < 560;

  useEffect(() => { if (dirty) return holdUpdates(); }, [dirty]);
  useLeaveGuard(dirty, async () => {
    const r = await confirm({
      title: "Leave without saving?",
      description: "Your changes to the invoice settings haven't been saved.",
      confirmText: "Leave",
      cancelText: "Keep editing",
      variant: "destructive",
    });
    return r.confirmed;
  });

  const setSeller = (p: Partial<InvoiceSeller>) => setForm((f) => (f ? { ...f, seller: { ...f.seller, ...p } } : f));
  const setPayment = (p: Partial<InvoicePayment>) => setForm((f) => (f ? { ...f, payment: { ...f.payment, ...p } } : f));
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  // ── The live preview: a sample invoice built from the form, on the real sheets ─────────────────
  const today = isoDate();
  const sample = useMemo<InvoiceContent | null>(() => form ? {
    issueDate: today,
    dueDate: addDaysIso(today, form.dueDays),
    seller: form.seller,
    customer: { ...EMPTY_CUSTOMER, name: "Sample Customer", billingAddress: "Street, area\nCity, State PIN" },
    items: [{
      id: "sample-1", name: "Social Media Management", description: "Content creation and posting for one month",
      sac: "", quantity: 1, rate: 10000, discountKind: "percent", discountValue: 0, taxRate: form.taxRate,
    }],
    tax: {
      mode: "gst",
      pricesIncludeTax: form.pricesIncludeTax,
      placeOfSupply: stateCodeOfGstin(form.seller.gstin) || HOME_STATE_CODE,
      defaultRate: form.taxRate,
    },
    roundOff: false,
    payment: form.payment,
    terms: form.terms,
    notes: form.notes,
  } : null, [form, today]);
  const paper = useInvoicePaper({ content: sample, number: "SAMPLE", status: "issued", companyLogo });
  const ownLogo = useInlinedImage(form?.seller.logoUrl || "");

  // ── Checks ────────────────────────────────────────────────────────────────────────────────────
  const issues = useMemo(() => {
    const out: Record<string, FieldIssue> = {};
    if (!form) return out;
    if (!form.seller.name.trim()) out["seller.name"] = { level: "error", message: "Your business name is missing." };
    const g = gstinProblem(form.seller.gstin);
    if (g) out["seller.gstin"] = { level: "error", message: GSTIN_PROBLEM_TEXT[g] };
    if (form.payment.ifsc && !isValidIfsc(form.payment.ifsc)) out["payment.ifsc"] = { level: "warning", message: "An IFSC is 11 characters, like BARB0GHATIX." };
    if (form.payment.upiId && !isValidUpiId(form.payment.upiId)) {
      out["payment.upiId"] = { level: "warning", message: form.payment.qrImageUrl ? "A UPI ID looks like name@bank." : "A UPI ID looks like name@bank. The QR code is hidden until it's right." };
    }
    return out;
  }, [form]);
  const issueFor = (field: string): FieldIssue | null => {
    const i = issues[field];
    if (!i) return null;
    if (i.level === "warning") return i;
    return attempted || field === "seller.gstin" ? i : null;
  };
  const errors = Object.entries(issues).filter(([, i]) => i.level === "error");

  // ── Images ────────────────────────────────────────────────────────────────────────────────────
  const uploadImage = useCallback(async (file: File, kind: "logo" | "qr") => {
    if (!/^image\//.test(file.type)) { toast({ title: "That isn't an image", description: "Choose a PNG or JPG.", variant: "destructive" }); return; }
    if (file.size > 8 * 1024 * 1024) { toast({ title: "Image is too large", description: "Use an image under 8 MB.", variant: "destructive" }); return; }
    const setBusy = kind === "logo" ? setLogoUploading : setQrUploading;
    setBusy(true);
    try {
      const prepared = kind === "logo" ? await optimizeLogoFile(file) : await squareImageFile(file);
      const url = await uploadToCloudinary(prepared);
      if (kind === "logo") setSeller({ logoUrl: url });
      else setPayment({ qrImageUrl: url, showQr: true });
    } catch {
      toast({ title: kind === "logo" ? "Couldn't upload the logo" : "Couldn't upload the QR code", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ──────────────────────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form || !user || saving) return;
    setAttempted(true);
    if (errors.length) {
      toast({ title: "Fix this before saving", description: errors[0][1].message, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const clean: SettingsForm = {
        ...form,
        seller: { ...form.seller, gstin: normalizeGstin(form.seller.gstin), name: form.seller.name.trim() },
      };
      await saveInvoiceDefaults({
        seller: clean.seller,
        payment: clean.payment,
        taxRate: clean.taxRate,
        pricesIncludeTax: clean.pricesIncludeTax,
        dueDays: clean.dueDays,
        terms: clean.terms,
        notes: clean.notes,
      }, { uid: user.uid, name: user.name || "", role: user.role });
      setForm(clean);
      setBaseFp(fingerprint(clean));
      setAttempted(false);
      toast({ title: "Invoice settings saved", description: "Every new invoice starts with these. Invoices already made keep their own details." });
    } catch {
      toast({ title: "Couldn't save the settings", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    const r = await confirm({ title: "Discard your changes?", description: "The settings go back to how they were saved.", confirmText: "Discard", variant: "destructive" });
    if (!r.confirmed) return;
    setForm(resolved);
    setBaseFp(fingerprint(resolved));
    setAttempted(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────────────────────────
  if (!user) return null;
  if (!canEditInvoiceDefaults(user.role)) {
    return (
      <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center gap-3 px-6" data-test="invoice-settings-locked">
        <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"><Lock size={19} className="text-muted-foreground" /></div>
        <h2 className="text-base font-semibold text-foreground">Only admins can change invoice settings</h2>
        <p className="text-sm text-muted-foreground max-w-sm">Your invoices start with the business details, bank details and QR code your admin has set. You can still change them on any invoice you make.</p>
        <Link to="/invoices" className="mt-1 h-9 px-3.5 inline-flex items-center rounded-lg border border-border text-sm font-medium hover:bg-accent">Back to invoices</Link>
      </div>
    );
  }
  if (!form) {
    return (
      <div className="h-full min-h-[50vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="animate-spin text-primary" size={26} />
        <p className="text-sm">Loading invoice settings…</p>
      </div>
    );
  }

  const usingCompanyLogo = !form.seller.logoUrl;
  const logoPreview = usingCompanyLogo ? companyLogo : (ownLogo.src || form.seller.logoUrl);
  const companySeller = sellerFromCompany(company);

  const block = (icon: React.ReactNode, title: string, hint: string, children: React.ReactNode, aside?: React.ReactNode, test?: string) => (
    <section className="py-5 border-b border-border last:border-b-0" data-test={test}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );

  const grid = cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2");
  const span2 = compact ? "" : "col-span-2";

  const formPane = (
    <div className="px-4 sm:px-6 pb-28 lg:pb-10">
      {block(<Building2 size={16} />, "Your business", "Printed at the top of every invoice. Starts from Settings → Company Documents; changes here affect invoices only.",
        <>
          <div className="flex items-center gap-3 mb-4" data-test="settings-logo">
            <div className="h-14 w-32 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview ? <img src={logoPreview} alt="Logo" className="max-h-11 max-w-[112px] object-contain" /> : <Building2 size={18} className="text-slate-400" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <PickImage label={usingCompanyLogo ? "Upload logo" : "Replace logo"} busy={logoUploading} icon={<ImagePlus size={13} />} onFile={(f) => uploadImage(f, "logo")} testId="settings-logo-upload" />
                {!usingCompanyLogo && (
                  <button type="button" onClick={() => setSeller({ logoUrl: "" })}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
                    <Undo2 size={13} /> Use the company logo
                  </button>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-1.5">{usingCompanyLogo ? "Using the logo from Company Documents." : "This logo is used on invoices only."}</p>
            </div>
          </div>
          <div className={grid}>
            <Field label="Business name" htmlFor="set-name" issue={issueFor("seller.name")}>
              <TextInput id="set-name" value={form.seller.name} onValue={(v) => setSeller({ name: v })} maxLength={120} invalid={issueFor("seller.name")?.level === "error"} data-test="settings-name" />
            </Field>
            <Field label="GSTIN" htmlFor="set-gstin" issue={issueFor("seller.gstin")}>
              <TextInput id="set-gstin" value={form.seller.gstin} onValue={(v) => setSeller({ gstin: normalizeGstin(v).slice(0, 15) })}
                placeholder="37ABCDE1234F1Z5" className="uppercase tracking-wide" invalid={issueFor("seller.gstin")?.level === "error"} data-test="settings-gstin" />
            </Field>
            <Field label="Address" htmlFor="set-addr" className={span2}>
              <TextArea id="set-addr" value={form.seller.address} onValue={(v) => setSeller({ address: v })} minRows={2} maxLength={400} />
            </Field>
            <Field label="Website" htmlFor="set-web"><TextInput id="set-web" value={form.seller.website} onValue={(v) => setSeller({ website: v })} maxLength={120} /></Field>
            <Field label="Email" htmlFor="set-email"><TextInput id="set-email" type="email" value={form.seller.email} onValue={(v) => setSeller({ email: v.trim() })} maxLength={120} /></Field>
            <Field label="Phone" htmlFor="set-phone"><TextInput id="set-phone" type="tel" value={form.seller.phone} onValue={(v) => setSeller({ phone: v })} maxLength={40} /></Field>
          </div>
        </>,
        <button type="button" onClick={() => setSeller({ ...companySeller, logoUrl: form.seller.logoUrl })}
          title="Copy the name, GSTIN, address and contacts from Settings → Company Documents"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <RotateCcw size={12} /> Company details
        </button>, "settings-business")}

      {block(<Landmark size={16} />, "Payment details & QR code", "Where the client pays. Printed under the totals on every invoice.",
        <div className={grid}>
          <Field label="Bank name" htmlFor="set-bank"><TextInput id="set-bank" value={form.payment.bankName} onValue={(v) => setPayment({ bankName: v })} maxLength={80} data-test="settings-bank" /></Field>
          <Field label="Branch" htmlFor="set-branch"><TextInput id="set-branch" value={form.payment.branch} onValue={(v) => setPayment({ branch: v })} maxLength={120} /></Field>
          <Field label="Account name" htmlFor="set-acname"><TextInput id="set-acname" value={form.payment.accountName} onValue={(v) => setPayment({ accountName: v })} placeholder="Optional" maxLength={120} /></Field>
          <Field label="Account number" htmlFor="set-acno"><TextInput id="set-acno" value={form.payment.accountNumber} onValue={(v) => setPayment({ accountNumber: v.replace(/[^0-9A-Za-z]/g, "").slice(0, 24) })} inputMode="numeric" /></Field>
          <Field label="IFSC" htmlFor="set-ifsc" issue={issueFor("payment.ifsc")}>
            <TextInput id="set-ifsc" value={form.payment.ifsc} onValue={(v) => setPayment({ ifsc: v.toUpperCase().replace(/\s/g, "").slice(0, 11) })} className="uppercase tracking-wide" />
          </Field>
          <Field label="SWIFT" htmlFor="set-swift"><TextInput id="set-swift" value={form.payment.swift} onValue={(v) => setPayment({ swift: v.toUpperCase().replace(/\s/g, "").slice(0, 11) })} className="uppercase tracking-wide" placeholder="Optional" /></Field>
          <Field label="UPI ID" htmlFor="set-upi" issue={issueFor("payment.upiId")} className={span2}>
            <TextInput id="set-upi" value={form.payment.upiId} onValue={(v) => setPayment({ upiId: v.trim() })} placeholder="name@bank" />
          </Field>
          <div className={cn("rounded-xl border border-border p-3 flex items-start gap-3", span2)} data-test="settings-qr">
            <div className="w-[76px] h-[76px] rounded-lg border border-border bg-white flex items-center justify-center shrink-0 overflow-hidden">
              {paper.qrSrc && form.payment.showQr
                ? <img src={paper.qrSrc} alt="UPI QR code" className="w-[64px] h-[64px] object-contain" />
                : <QrCode size={26} className="text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">UPI QR code on every invoice</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {form.payment.qrImageUrl ? "Your uploaded QR image is printed." : "Made from the UPI ID above, with each invoice's total already filled in."}
                  </span>
                </span>
                <Switch checked={form.payment.showQr} onCheckedChange={(v) => setPayment({ showQr: v })} aria-label="Show UPI QR code" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <PickImage label={form.payment.qrImageUrl ? "Replace QR image" : "Upload your QR image"} busy={qrUploading} icon={<Upload size={13} />} onFile={(f) => uploadImage(f, "qr")} testId="settings-qr-upload" />
                {form.payment.qrImageUrl && (
                  <button type="button" onClick={() => setPayment({ qrImageUrl: "" })}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
                    <Undo2 size={13} /> Use the UPI ID instead
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>, undefined, "settings-payment")}

      {block(<Percent size={16} />, "Tax & due date", "How a new invoice charges GST, and how long the client has to pay.",
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented ariaLabel="How GST is charged" value={form.pricesIncludeTax ? "incl" : "excl"} onChange={(v) => set("pricesIncludeTax", v === "incl")}
              options={[{ value: "excl", label: "Add GST on top" }, { value: "incl", label: "Rate includes GST" }]} />
          </div>
          <div className={grid}>
            <Field label="GST rate" htmlFor="set-rate" hint="Every new item starts with this rate.">
              <select id="set-rate" value={String(form.taxRate)} onChange={(e) => set("taxRate", Number(e.target.value))} className={inputClass} data-test="settings-rate">
                {GST_RATES.map((r) => <option key={r} value={r}>{formatRate(r)}</option>)}
                {!GST_RATES.includes(form.taxRate) && <option value={form.taxRate}>{formatRate(form.taxRate)}</option>}
              </select>
            </Field>
            <Field label="Due in (days)" htmlFor="set-due" hint={form.dueDays === 0 ? "Due on the invoice date." : `Due ${form.dueDays} day${form.dueDays === 1 ? "" : "s"} after the invoice date.`}>
              <NumberInput id="set-due" value={form.dueDays} onValue={(v) => set("dueDays", Math.round(v))} decimals={0} max={365} className="text-left" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Due in">
            {DUE_CHOICES.map((d) => (
              <button key={d} type="button" onClick={() => set("dueDays", d)}
                className={cn("h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
                  form.dueDays === d ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/60")}>
                {d === 0 ? "On receipt" : `${d} days`}
              </button>
            ))}
          </div>
        </div>, undefined, "settings-tax")}

      {block(<ScrollText size={16} />, "Terms & conditions", "One per line. Printed near the end of every invoice.",
        <TextArea value={form.terms} onValue={(v) => set("terms", v)} minRows={3} maxLength={2000} aria-label="Terms and conditions" data-test="settings-terms" />,
        undefined, "settings-terms-block")}

      {block(<NotebookPen size={16} />, "Notes", "A thank-you or anything the client should read.",
        <TextArea value={form.notes} onValue={(v) => set("notes", v)} minRows={3} maxLength={2000} aria-label="Notes" />,
        undefined, "settings-notes-block")}

      <div className="pt-5">
        <InvoiceAccessCard />
      </div>
    </div>
  );

  const actions = (
    <>
      {dirty && (
        <button type="button" onClick={discard} disabled={saving}
          className="h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-accent disabled:opacity-60 whitespace-nowrap">
          Discard
        </button>
      )}
      <button type="button" onClick={save} disabled={!dirty || saving} data-test="settings-save"
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 shadow-sm whitespace-nowrap">
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saving ? "Saving…" : "Save settings"}
      </button>
    </>
  );

  return (
    <div ref={rootRef} className="-m-4 md:-m-6 h-[calc(100%_+_2rem)] md:h-[calc(100%_+_3rem)] min-h-[520px] flex flex-col bg-background" data-test="invoice-settings">
      {ConfirmDialog}
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="h-14 pl-4 pr-3 sm:pr-4 flex items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold text-foreground truncate">Invoice settings</h1>
            <p className="text-xs text-muted-foreground truncate" data-test="settings-state">
              {dirty ? <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span> : "Every new invoice starts with these"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {width >= 640 && actions}
            <span className="w-px h-6 bg-border mx-0.5 hidden sm:block" aria-hidden />
            <Link to="/invoices" data-test="settings-close" aria-label="Close" title="Back to all invoices"
              className="h-9 rounded-lg inline-flex items-center justify-center gap-1.5 px-2.5 border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
              <X size={16} /><span className={cn(width < 640 && "sr-only")}>Close</span>
            </Link>
          </div>
        </div>
        {!wide && (
          <div className="px-3 sm:px-4 pb-2.5">
            <Segmented<"edit" | "preview"> ariaLabel="Settings or preview" value={view} onChange={setView} className="w-full [&>button]:flex-1"
              options={[{ value: "edit", label: "Settings" }, { value: "preview", label: "Preview" }]} />
          </div>
        )}
      </header>

      <div className={cn("flex-1 min-h-0", wide ? "grid" : "flex flex-col")}
        style={wide ? { gridTemplateColumns: `${formWidth}px minmax(0, 1fr)` } : undefined}>
        <div className={cn("min-h-0 overflow-y-auto overscroll-contain", wide ? "border-r border-border" : view === "edit" ? "flex-1" : "hidden")}>
          {formPane}
        </div>
        <div className={cn("min-h-0 overflow-y-auto overscroll-contain bg-muted/50 dark:bg-muted/20", wide ? "" : view === "preview" ? "flex-1" : "hidden")}>
          <div className="sticky top-0 z-10 px-4 py-2 border-b border-border bg-background/85 backdrop-blur text-xs text-muted-foreground" data-test="settings-preview-note">
            A sample invoice with these settings. Real invoices use the customer and items you enter.
          </div>
          {paper.model && <InvoicePreview model={paper.model} padding={wide ? 28 : 14} />}
        </div>
      </div>

      {width < 640 && (
        <div className="shrink-0 border-t border-border bg-background px-3 py-2.5 flex items-center justify-end gap-2" data-test="settings-mobile-actions">
          {actions}
        </div>
      )}
    </div>
  );
}

function PickImage({ label, busy, icon, onFile, testId }: {
  label: string;
  busy: boolean;
  icon: React.ReactNode;
  onFile: (f: File) => void;
  testId: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-test={`${testId}-input`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} data-test={testId}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60">
        {busy ? <Loader2 size={13} className="animate-spin" /> : icon} {busy ? "Uploading…" : label}
      </button>
    </>
  );
}
