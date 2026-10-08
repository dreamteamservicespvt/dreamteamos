/**
 * The Invoice Builder workspace — `/invoices/:invoiceId` (2026-10-08).
 *
 * Editor on the left, the invoice itself on the right, updating as you type. On a narrow screen the
 * two become Edit and Preview, one tap apart. The preview IS the document: the PDF and the print are
 * made from the same sheets (`InvoicePreview.capturePages`).
 *
 * ── Saving ────────────────────────────────────────────────────────────────────────────────────
 * A DRAFT saves itself a moment after the last keystroke — there is no Save button to forget.
 * A GENERATED invoice opens read-only; "Edit" unlocks it and "Save changes" writes it, keeping its
 * number (owner, 2026-10-08) and recording the edit in its history. An issued invoice never changes
 * because somebody brushed a key.
 *
 * ── Not losing work ───────────────────────────────────────────────────────────────────────────
 * Three layers: autosave (drafts); a leave prompt on reload, close and in-app links (`useLeaveGuard`);
 * and an on-device copy of anything unsaved, offered back when the invoice is opened again — for the
 * exits no prompt can catch (the phone's back button, a notification tap, a crash). App updates are
 * held while anything is unsaved (`holdUpdates`).
 *
 * ── Ids ───────────────────────────────────────────────────────────────────────────────────────
 * `/invoices/new` swaps itself for `/invoices/<fresh id>` before anything is typed, so an invoice has
 * the same id from its first keystroke to its last reprint — and the URL never changes under someone
 * who is typing.
 */
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, Check, CheckCircle2, CloudOff, Copy, Settings2, Download, FileCheck2, Loader2, MoreHorizontal, Pencil,
  Printer, Trash2, X,
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
import {
  fetchMyRecentInvoices, generateInvoice, newInvoiceId, saveInvoiceContent, setInvoiceStatus,
  deleteInvoice, watchInvoice, type InvoiceActor,
} from "@/services/invoices";
import type { Order } from "@/types";
import type { InvoiceContent, InvoiceCustomer, InvoiceStatus } from "@/types/invoice";
import { computeInvoice, formatPaise } from "@/utils/invoiceMath";
import {
  blankItem, blockingIssues, buildNewInvoiceContent, deleteConfirmCopy, contentFingerprint, contentOf, displayStatusOf, DISPLAY_STATUS_LABEL,
  duplicateContent, fillFromOrder, invoiceFileName, recentCustomers, validateInvoice,
} from "@/utils/invoiceDraft";
import { financialYearLabel, financialYearShort, financialYearStart, INVOICE_NUMBER_PREFIX } from "@/utils/invoiceNumber";
import { canDeleteInvoice, canEditInvoice, canEditInvoiceDefaults } from "@/utils/invoiceAccess";
import { optimizeLogoFile } from "@/utils/signatureImage";
import { downloadInvoicePdf, printInvoicePages } from "@/utils/invoicePdf";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InvoiceEditor, { sectionOfField, type SectionId } from "@/components/invoice/InvoiceEditor";
import InvoicePreview, { type InvoicePreviewHandle } from "@/components/invoice/InvoicePreview";
import FillFromSale from "@/components/invoice/FillFromSale";
import { Segmented, type FieldIssue } from "@/components/invoice/editorKit";
import { squareImageFile } from "@/components/invoice/useInvoiceAssets";
import { useInvoicePaper } from "@/components/invoice/useInvoicePaper";
import { StatusPill } from "@/components/invoice/StatusPill";

/** The route: `/invoices/new` becomes a fresh id; anything else is that invoice. */
export default function InvoiceBuilderRoute() {
  const { invoiceId = "" } = useParams();
  if (invoiceId === "new") return <NewInvoiceRedirect />;
  // Keyed by id: opening a different invoice (a duplicate, say) is a clean start, never a merge.
  return <InvoiceBuilder key={invoiceId} invoiceId={invoiceId} />;
}

function NewInvoiceRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    navigate(`/invoices/${newInvoiceId()}${location.search}`, { replace: true, state: { fresh: true } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <CenteredLoader label="Starting a new invoice…" />;
}

function CenteredLoader({ label }: { label: string }) {
  return (
    <div className="h-full min-h-[50vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="animate-spin text-primary" size={26} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

type Phase = "loading" | "creating" | "ready" | "missing" | "denied" | "error";
type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

interface Meta {
  number: string | null;
  status: InvoiceStatus;
  ownerId: string;
  ownerName: string;
}

interface WipCopy {
  content: InvoiceContent;
  at: number;
}

/**
 * What a new invoice opens with: the two things that change every time — who it is for, what was sold.
 * Dates, business, tax, payment, terms and notes start filled in and folded to a one-line summary.
 * A generated invoice also opens "Invoice details", where its status (Paid / Cancelled) is set.
 */
const DEFAULT_OPEN: Record<SectionId, boolean> = {
  details: false, business: false, customer: true, items: true, tax: false, payment: false, terms: false, notes: false,
};

const wipKey = (uid: string, id: string) => `dts.invoiceWip.${uid}.${id}`;
function readWip(uid: string, id: string): WipCopy | null {
  try {
    const raw = localStorage.getItem(wipKey(uid, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WipCopy;
    return parsed && parsed.content ? { content: contentOf(parsed.content), at: Number(parsed.at) || 0 } : null;
  } catch { return null; }
}
function writeWip(uid: string, id: string, content: InvoiceContent) {
  try { localStorage.setItem(wipKey(uid, id), JSON.stringify({ content, at: Date.now() })); } catch { /* storage full or blocked */ }
}
function clearWip(uid: string, id: string) {
  try { localStorage.removeItem(wipKey(uid, id)); } catch { /* blocked */ }
}

const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.message === "offline") return "You're offline. Generating needs a connection, so a number is never given out twice.";
  if (e?.code === "permission-denied") return "You don't have permission to do that.";
  if (e?.code === "unavailable") return "Can't reach the server. Check your connection and try again.";
  return e?.message || "Something went wrong. Please try again.";
}

function InvoiceBuilder({ invoiceId }: { invoiceId: string }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { company, loaded: companyLoaded } = useCompany();
  const companyLogo = useCompanyLogo();
  const { defaults, loaded: defaultsLoaded } = useInvoiceDefaults();
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh === true;

  const [phase, setPhase] = useState<Phase>("loading");
  const [content, setContent] = useState<InvoiceContent | null>(null);
  const [meta, setMeta] = useState<Meta>({ number: null, status: "draft", ownerId: user?.uid || "", ownerName: user?.name || "" });
  const [baseFp, setBaseFp] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [editingIssued, setEditingIssued] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [open, setOpen] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [width, setWidth] = useState(0);
  const [restore, setRestore] = useState<WipCopy | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "print" | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  /** The number just generated — opens the "ready" window with Download PDF and Print. */
  const [justGenerated, setJustGenerated] = useState<string | null>(null);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<InvoiceCustomer[]>([]);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);

  const rootRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<InvoicePreviewHandle>(null);
  const contentRef = useRef<InvoiceContent | null>(null);
  const baseContentRef = useRef<InvoiceContent | null>(null);
  const baseFpRef = useRef("");
  const persistedRef = useRef(false);
  const savingRef = useRef(false);
  const saveSeq = useRef(0);
  const dirtyRef = useRef(false);
  const generatingRef = useRef(false);
  const deletedRef = useRef(false);
  const exportingRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const sourceOrderRef = useRef<string | null>(null);
  const wipChecked = useRef(false);
  const customersAsked = useRef(false);

  contentRef.current = content;
  const currentFp = useMemo(() => (content ? contentFingerprint(content) : ""), [content]);
  const dirty = !!content && currentFp !== baseFp;
  dirtyRef.current = dirty;

  const actor: InvoiceActor | null = user ? { uid: user.uid, name: user.name || user.email || "", role: user.role } : null;
  const isIssued = !!meta.number;
  const numberRef = useRef<string | null>(meta.number);
  numberRef.current = meta.number;
  const mayEdit = !!user && (phase === "creating" || canEditInvoice(user, { ownerId: meta.ownerId || user.uid }));
  const readOnly = !mayEdit || (isIssued && !editingIssued);

  const markBase = useCallback((c: InvoiceContent) => {
    const fp = contentFingerprint(c);
    baseContentRef.current = c;
    baseFpRef.current = fp;
    setBaseFp(fp);
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return watchInvoice(invoiceId, (inv, info) => {
      if (inv) {
        if (!canEditInvoice(user, inv)) { setPhase("denied"); return; }
        persistedRef.current = true;
        setMeta({ number: inv.number || null, status: inv.status || "draft", ownerId: inv.ownerId, ownerName: inv.ownerName || "" });
        const incoming = contentOf(inv);
        // Take the server's copy unless something typed here is still on its way there.
        if (!contentRef.current || (!dirtyRef.current && !savingRef.current)) {
          setContent(incoming);
          markBase(incoming);
        }
        if (!wipChecked.current) {
          wipChecked.current = true;
          if (inv.number) setOpen((o) => ({ ...o, details: true }));
          const wip = readWip(user.uid, invoiceId);
          if (wip && contentFingerprint(wip.content) !== contentFingerprint(incoming)) setRestore(wip);
          else if (wip) clearWip(user.uid, invoiceId);
        }
        setPhase("ready");
        return;
      }
      if (deletedRef.current) return; // we deleted it ourselves and are on our way out
      if (persistedRef.current) { setPhase("missing"); return; }
      const wip = readWip(user.uid, invoiceId);
      if (fresh || wip) { setPhase((p) => (p === "ready" ? p : "creating")); return; }
      // Not in this device's cache yet: wait for the server's word before calling it missing.
      if (!info.fromCache) setPhase("missing");
    }, (err) => {
      setPhase((err as { code?: string })?.code === "permission-denied" ? "denied" : "error");
    });
  }, [invoiceId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new invoice starts from Settings and the admins' defaults — or from the copy kept on this device.
  useEffect(() => {
    if (phase !== "creating" || contentRef.current || !user) return;
    const wip = readWip(user.uid, invoiceId);
    if (wip) {
      setContent(wip.content);
      markBase(buildNewInvoiceContent(company, defaults)); // so it reads as unsaved and saves itself
      setPhase("ready");
      toast({ title: "Restored your unsaved invoice", description: `Kept on this device ${ago(wip.at)}.` });
      return;
    }
    if (!companyLoaded || !defaultsLoaded) return;
    const c = buildNewInvoiceContent(company, defaults);
    setContent(c);
    markBase(c);
    setPhase("ready");
  }, [phase, companyLoaded, defaultsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);
  const wide = width >= 1060;
  const editorWidth = wide ? Math.min(640, Math.max(470, Math.round(width * 0.46))) : width;
  const compact = editorWidth < 600;

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────────────────────
  const totals = useMemo(() => (content ? computeInvoice(content) : null), [content]);
  const issues = useMemo(() => (content && totals ? validateInvoice(content, totals) : []), [content, totals]);
  const issueFor = useCallback((field: string): FieldIssue | null => {
    const found = issues.find((i) => i.field === field);
    if (!found) return null;
    if (found.level === "warning") return found;
    // A missing value is only pointed out once they have tried to generate; a wrong one, at once.
    const hasValue = (() => {
      const c = contentRef.current;
      if (!c) return false;
      if (field === "seller.gstin") return !!c.seller.gstin.trim();
      if (field === "customer.gstin") return !!c.customer.gstin.trim();
      if (field === "dueDate") return !!c.dueDate;
      return false;
    })();
    return attempted || hasValue ? found : null;
  }, [issues, attempted]);

  const deferred = useDeferredValue(content);
  // The sheets, their logo and their QR — the same hook drives the Settings preview.
  const paper = useInvoicePaper({ content: deferred, number: meta.number, status: meta.status, companyLogo });
  const model = paper.model;

  // ── Saving ──────────────────────────────────────────────────────────────────────────────────
  const save = useCallback(async (opts: { issued?: boolean } = {}): Promise<boolean> => {
    const c = contentRef.current;
    // Never while a number is being taken (the transaction writes the content itself), and never
    // after a delete — the leave-the-page save would otherwise bring a deleted draft back.
    if (!c || !actor || generatingRef.current || deletedRef.current) return false;
    clearTimeout(autosaveTimer.current);
    const fp = contentFingerprint(c);
    const isNew = !persistedRef.current;
    const prevBase = baseContentRef.current;
    persistedRef.current = true;
    markBase(c);
    const seq = ++saveSeq.current;
    savingRef.current = true;
    const offline = navigator.onLine === false;
    setSaveState(offline ? "offline" : "saving");

    const failed = (err: unknown) => {
      if (seq === saveSeq.current) savingRef.current = false;
      if (isNew) persistedRef.current = false;
      if (baseFpRef.current === fp && prevBase) markBase(prevBase);
      setSaveState("error");
      setSaveError(friendlyError(err));
      return false;
    };
    let committed: Promise<void>;
    try {
      committed = saveInvoiceContent(invoiceId, c, actor, {
        isNew,
        issued: opts.issued,
        sourceOrderId: sourceOrderRef.current,
      }).committed;
    } catch (err) {
      return failed(err);
    }
    sourceOrderRef.current = null;
    const settled = committed.then(() => {
      if (seq === saveSeq.current) {
        savingRef.current = false;
        setSaveState("saved");
        setSaveError("");
      }
      if (contentFingerprint(contentRef.current || c) === fp) clearWip(actor.uid, invoiceId);
      return true;
    }, failed);
    // Offline, the write is already safe in this device's Firestore cache and goes up when the
    // connection is back — the person is not kept waiting on a network that isn't there.
    return offline ? true : settled;
  }, [actor?.uid, invoiceId, markBase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drafts save themselves.
  useEffect(() => {
    if (phase !== "ready" || !dirty || isIssued || !mayEdit) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void save(); }, 900);
    return () => clearTimeout(autosaveTimer.current);
  }, [currentFp, phase, isIssued, mayEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // The on-device copy of anything unsaved.
  useEffect(() => {
    if (!user || !content || !dirty) return;
    const t = setTimeout(() => writeWip(user.uid, invoiceId, content), 400);
    return () => clearTimeout(t);
  }, [currentFp, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving with a draft half-saved: save it on the way out. (Only drafts autosave; an issued
  // invoice's unsaved edits stay in the on-device copy and are offered back on reopening.)
  const isIssuedRef = useRef(isIssued);
  isIssuedRef.current = isIssued;
  useEffect(() => () => {
    if (dirtyRef.current && !generatingRef.current && contentRef.current && !isIssuedRef.current) void save();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dirty || saveState === "saving" || editingIssued) return holdUpdates();
  }, [dirty, saveState, editingIssued]);

  useLeaveGuard(dirty || saveState === "saving", async () => {
    if (!isIssued) { void save(); return true; } // a draft is saved on the way out
    const r = await confirm({
      title: "Leave without saving?",
      description: "Your changes to this invoice haven't been saved. They stay on this device and are offered back when you reopen it.",
      confirmText: "Leave",
      cancelText: "Keep editing",
      variant: "destructive",
    });
    return r.confirmed;
  });

  // ── Editing helpers ─────────────────────────────────────────────────────────────────────────
  const update = useCallback((fn: (c: InvoiceContent) => InvoiceContent) => {
    setContent((prev) => (prev ? fn(prev) : prev));
  }, []);

  const addItem = useCallback(() => {
    const c = contentRef.current;
    if (!c) return;
    const it = blankItem(c.tax.defaultRate);
    setOpen((o) => ({ ...o, items: true }));
    update((x) => ({ ...x, items: [...x.items, it] }));
    setFocusItemId(it.id);
    if (!wide) setView("edit");
  }, [update, wide]);

  const jumpTo = useCallback((field: string) => {
    const section = sectionOfField(field);
    setOpen((o) => ({ ...o, [section]: true }));
    setView("edit");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const root = rootRef.current;
      const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(field) : field;
      const el = root?.querySelector<HTMLElement>(`[data-field="${safe}"]`)
        || root?.querySelector<HTMLElement>(`[data-section="${section}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
    }));
  }, []);

  const pickSale = useCallback((order: Order) => {
    const c = contentRef.current;
    if (!c) return;
    const { customer, item } = fillFromOrder(order, c.tax.defaultRate);
    sourceOrderRef.current = order.id;
    update((x) => {
      const items = [...x.items];
      const blank = items.findIndex((it) => !it.name.trim() && !it.description.trim() && !it.rate);
      if (blank >= 0) items[blank] = item; else items.push(item);
      return { ...x, customer: { ...x.customer, ...customer }, items };
    });
    toast({ title: "Filled from the sale", description: `${customer.name || "Customer"} · ${formatPaise(Math.round(item.rate * 100), { symbol: true })}` });
  }, [update, toast]);

  const wantCustomers = useCallback(() => {
    if (customersAsked.current || !user) return;
    customersAsked.current = true;
    fetchMyRecentInvoices(user.uid)
      .then((list) => setCustomers(recentCustomers(list.filter((i) => i.id !== invoiceId))))
      .catch(() => { customersAsked.current = false; });
  }, [user?.uid, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLogoFile = useCallback(async (file: File) => {
    if (!/^image\//.test(file.type)) { toast({ title: "That isn't an image", variant: "destructive" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Logo is too large", description: "Use an image under 5 MB.", variant: "destructive" }); return; }
    setLogoUploading(true);
    try {
      const url = await uploadToCloudinary(await optimizeLogoFile(file));
      update((x) => ({ ...x, seller: { ...x.seller, logoUrl: url } }));
    } catch {
      toast({ title: "Couldn't upload the logo", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }, [update, toast]);

  /** The company's own QR image — made square on white first, so it prints exactly as photographed. */
  const onQrFile = useCallback(async (file: File) => {
    if (!/^image\//.test(file.type)) { toast({ title: "That isn't an image", description: "Choose a PNG or JPG of your QR code.", variant: "destructive" }); return; }
    if (file.size > 8 * 1024 * 1024) { toast({ title: "Image is too large", description: "Use an image under 8 MB.", variant: "destructive" }); return; }
    setQrUploading(true);
    try {
      const url = await uploadToCloudinary(await squareImageFile(file));
      update((x) => ({ ...x, payment: { ...x.payment, qrImageUrl: url, showQr: true } }));
      toast({ title: "QR code added", description: "It's printed on this invoice. To print it on every invoice, add it in Invoice settings." });
    } catch {
      toast({ title: "Couldn't upload the QR code", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setQrUploading(false);
    }
  }, [update, toast]);


  // ── Export ──────────────────────────────────────────────────────────────────────────────────
  const deferredRef = useRef(deferred);
  deferredRef.current = deferred;
  const paperReadyRef = useRef(true);
  paperReadyRef.current = paper.ready;
  const waitForPreview = useCallback(async () => {
    const started = Date.now();
    // The preview runs a frame behind the typing (useDeferredValue) and the QR is drawn async;
    // wait until both match what is on screen, so the file is never last second's invoice.
    while (Date.now() - started < 3000) {
      const synced = deferredRef.current === contentRef.current && paperReadyRef.current;
      if (synced) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }, []);

  const runExport = useCallback(async (kind: "pdf" | "print") => {
    // A ref, not the state: two clicks in one frame both see `exporting` still null.
    if (exportingRef.current || !previewRef.current || !contentRef.current) return;
    // Only the final, numbered invoice is ever a file (owner, 2026-10-08) — never a draft.
    if (!numberRef.current) return;
    if (isIssued && dirtyRef.current) {
      toast({ title: "Save your changes first", description: "Or cancel them — the PDF shows the saved invoice." });
      return;
    }
    exportingRef.current = true;
    setExporting(kind);
    try {
      await waitForPreview();
      if (!previewRef.current) throw new Error("preview gone");
      const capture = await previewRef.current.capturePages();
      try {
        const c = contentRef.current;
        const name = invoiceFileName({ number: meta.number, customer: c?.customer });
        if (kind === "pdf") await downloadInvoicePdf(capture.pages, name, name.replace(/\.pdf$/, ""));
        else await printInvoicePages(capture.pages);
      } finally {
        capture.done();
      }
    } catch {
      toast({ title: kind === "pdf" ? "Couldn't make the PDF" : "Couldn't open printing", description: "Please try again.", variant: "destructive" });
    } finally {
      exportingRef.current = false;
      setExporting(null);
    }
  }, [isIssued, meta.number, toast, waitForPreview]);

  // ── Generate ────────────────────────────────────────────────────────────────────────────────
  const onGenerate = useCallback(async () => {
    const c = contentRef.current;
    if (!c || !actor || generatingRef.current) return;
    setAttempted(true);
    const errors = blockingIssues(validateInvoice(c));
    if (errors.length) {
      jumpTo(errors[0].field);
      toast({
        title: errors.length === 1 ? "One thing to fix first" : `${errors.length} things to fix first`,
        description: errors[0].message,
        variant: "destructive",
      });
      return;
    }
    const fyStart = financialYearStart(c.issueDate);
    const ok = await confirm({
      title: "Generate this invoice?",
      description: `It gets the next number in the ${financialYearLabel(fyStart)} series (${INVOICE_NUMBER_PREFIX}/${financialYearShort(fyStart)}/…). You can still edit it later — the number never changes.`,
      confirmText: "Generate invoice",
    });
    if (!ok.confirmed) return;

    generatingRef.current = true;
    clearTimeout(autosaveTimer.current);
    setGenerating(true);
    try {
      const latest = contentRef.current || c;
      const result = await generateInvoice(invoiceId, latest, actor);
      persistedRef.current = true;
      markBase(latest);
      clearWip(actor.uid, invoiceId);
      numberRef.current = result.number;
      setMeta((m) => ({ ...m, number: result.number, status: "issued" }));
      setSaveState("saved");
      setOpen((o) => ({ ...o, details: true }));
      // The moment the person was working towards: one window, the number, and the final PDF.
      setJustGenerated(result.number);
    } catch (err) {
      toast({ title: "Couldn't generate the invoice", description: friendlyError(err), variant: "destructive" });
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [actor?.uid, invoiceId, confirm, jumpTo, markBase, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const runExportRef = useRef(runExport);
  runExportRef.current = runExport;

  // ── Issued invoices: edit, save, cancel ─────────────────────────────────────────────────────
  const startEdit = () => {
    setEditingIssued(true);
    if (!wide) setView("edit");
  };
  const cancelEdit = async () => {
    if (dirty) {
      const r = await confirm({ title: "Discard your changes?", description: "The invoice goes back to how it was saved.", confirmText: "Discard", variant: "destructive" });
      if (!r.confirmed) return;
    }
    if (baseContentRef.current) setContent(baseContentRef.current);
    if (user) clearWip(user.uid, invoiceId);
    setEditingIssued(false);
    setAttempted(false);
  };
  const saveEdit = async () => {
    const c = contentRef.current;
    if (!c) return;
    setAttempted(true);
    const errors = blockingIssues(validateInvoice(c));
    if (errors.length) {
      jumpTo(errors[0].field);
      toast({ title: "Fix this before saving", description: errors[0].message, variant: "destructive" });
      return;
    }
    if (!dirty) { setEditingIssued(false); return; }
    const ok = await save({ issued: true });
    if (ok) {
      setEditingIssued(false);
      setAttempted(false);
      toast({ title: "Changes saved", description: `The invoice keeps its number, ${meta.number}.` });
    } else {
      toast({ title: "Couldn't save your changes", description: "They are kept on this device. Try again.", variant: "destructive" });
    }
  };

  // ── Status, duplicate, delete ───────────────────────────────────────────────────────────────
  const changeStatus = async (next: Exclude<InvoiceStatus, "draft">) => {
    if (!actor || !meta.number || next === meta.status) return;
    if (next === "cancelled") {
      const r = await confirm({
        title: `Cancel invoice ${meta.number}?`,
        description: "It stays in the register as Cancelled and keeps its number — a cancelled invoice is never deleted. You can mark it unpaid again later.",
        confirmText: "Cancel invoice",
        cancelText: "Keep it",
        variant: "destructive",
      });
      if (!r.confirmed) return;
    }
    const before = meta.status;
    setStatusBusy(true);
    setMeta((m) => ({ ...m, status: next }));
    try {
      await setInvoiceStatus({ id: invoiceId, number: meta.number }, next, actor);
      toast({ title: next === "paid" ? "Marked as paid" : next === "cancelled" ? "Invoice cancelled" : "Marked as unpaid" });
    } catch (err) {
      setMeta((m) => ({ ...m, status: before }));
      toast({ title: "Couldn't change the status", description: friendlyError(err), variant: "destructive" });
    } finally {
      setStatusBusy(false);
    }
  };

  const onDuplicate = () => {
    const c = contentRef.current;
    if (!c || !actor) return;
    const id = newInvoiceId();
    const { committed } = saveInvoiceContent(id, duplicateContent(c), actor, { isNew: true, duplicatedFrom: invoiceId });
    committed.catch((err) => toast({ title: "Couldn't save the copy", description: friendlyError(err), variant: "destructive" }));
    toast({ title: "Copy created", description: "A new draft with the same customer and items, dated today." });
    navigate(`/invoices/${id}`);
  };

  const onDelete = async () => {
    if (!user) return;
    const copy = deleteConfirmCopy({ number: meta.number, customer: contentRef.current?.customer });
    const r = await confirm({ title: copy.title, description: copy.description, confirmText: copy.confirmText, variant: "destructive" });
    if (!r.confirmed) return;
    clearTimeout(autosaveTimer.current);
    // From here no save may run — not the autosave, not the save on the way out of the page.
    deletedRef.current = true;
    try {
      if (persistedRef.current) await deleteInvoice(invoiceId, actor || { uid: user.uid, name: user.name || "", role: user.role });
      clearWip(user.uid, invoiceId);
      baseFpRef.current = currentFp;
      dirtyRef.current = false;
      setBaseFp(currentFp); // nothing left to protect
      toast({ title: copy.done });
      navigate("/invoices", { replace: true });
    } catch (err) {
      deletedRef.current = false;
      toast({ title: "Couldn't delete the invoice", description: friendlyError(err), variant: "destructive" });
    }
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "Enter" && !readOnly) { e.preventDefault(); addItem(); }
      if ((e.key === "s" || e.key === "S") && !readOnly) {
        e.preventDefault();
        if (isIssued) void saveEdit(); else void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Render ──────────────────────────────────────────────────────────────────────────────────
  if (!user) return null;
  if (phase === "loading" || phase === "creating" || !content || !totals) {
    if (phase === "missing" || phase === "denied" || phase === "error") return <BlockedState phase={phase} />;
    return <CenteredLoader label={phase === "creating" ? "Preparing a new invoice…" : "Opening the invoice…"} />;
  }
  if (phase === "missing" || phase === "denied" || phase === "error") return <BlockedState phase={phase} />;

  const displayStatus = displayStatusOf({ status: meta.status, dueDate: content.dueDate });
  const deletable = canDeleteInvoice(user, { ownerId: meta.ownerId, status: meta.status, number: meta.number });
  const errorCount = attempted ? blockingIssues(issues).length : 0;
  const title = meta.number || (content.customer.name.trim() ? `Draft · ${content.customer.name.trim()}` : "New invoice");
  const ownerNote = meta.ownerId && meta.ownerId !== user.uid && meta.ownerName ? `by ${meta.ownerName}` : "";

  // ── Actions ───────────────────────────────────────────────────────────────────────────────────
  // A draft has ONE thing to do — Generate. The PDF and Print exist only for a generated invoice, so every
  // file that leaves the building is the final, numbered one (owner, 2026-10-08: "download the final correct
  // pdf button only"). A generated invoice's main button is Download PDF.
  const generateButton = (
    <button type="button" onClick={onGenerate} disabled={generating} data-test="generate-invoice"
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 shadow-sm whitespace-nowrap">
      {generating ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
      {generating ? "Generating…" : "Generate invoice"}
    </button>
  );
  const editingButtons = (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-accent">
        <X size={15} /> Cancel
      </button>
      <button type="button" onClick={saveEdit} disabled={saveState === "saving"} data-test="save-changes"
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 shadow-sm whitespace-nowrap">
        {saveState === "saving" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save changes
      </button>
    </div>
  );
  const printButton = (
    <button type="button" onClick={() => runExport("print")} disabled={!!exporting} title="Print" aria-label="Print" data-test="print-invoice"
      className="w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-60">
      {exporting === "print" ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
    </button>
  );
  const pdfButton = (
    <button type="button" onClick={() => runExport("pdf")} disabled={!!exporting} data-test="download-pdf"
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 shadow-sm whitespace-nowrap">
      {exporting === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      Download PDF
    </button>
  );
  const editButton = (
    <button type="button" onClick={startEdit} data-test="edit-invoice"
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-accent">
      <Pencil size={14} /> Edit
    </button>
  );
  const actions = !isIssued
    ? (mayEdit ? generateButton : null)
    : editingIssued
      ? editingButtons
      : <>{printButton}{mayEdit && width >= 640 && editButton}{pdfButton}</>;

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More actions" data-test="invoice-more"
          className="w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {isIssued && !editingIssued && mayEdit && (
          <DropdownMenuItem onSelect={startEdit}><Pencil size={14} className="mr-2" /> Edit invoice</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDuplicate}><Copy size={14} className="mr-2" /> Duplicate as new draft</DropdownMenuItem>
        {canEditInvoiceDefaults(user.role) && (
          <DropdownMenuItem asChild><Link to="/invoices/settings"><Settings2 size={14} className="mr-2" /> Invoice settings</Link></DropdownMenuItem>
        )}
        {deletable && (<>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void onDelete()} className="text-destructive focus:text-destructive">
            <Trash2 size={14} className="mr-2" /> {isIssued ? "Delete invoice" : "Delete draft"}
          </DropdownMenuItem>
        </>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /** Close — back to the list. A link, so the unsaved-changes guard sees it like any other way out. */
  const closeButton = (
    <Link to="/invoices" data-test="close-invoice" title="Close and go back to all invoices" aria-label="Close"
      className="h-9 shrink-0 rounded-lg inline-flex items-center justify-center gap-1.5 px-2.5 border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
      <X size={16} />
      <span className={cn(width < 640 && "sr-only")}>Close</span>
    </Link>
  );

  const saveLabel = (() => {
    if (isIssued && !editingIssued) return null;
    if (isIssued && editingIssued) return dirty ? { text: "Unsaved changes", tone: "warn" } : { text: "No changes yet", tone: "muted" };
    if (saveState === "error") return { text: "Couldn't save", tone: "error" };
    if (!online || saveState === "offline") return { text: "Saved on this device", tone: "offline" };
    if (dirty || saveState === "saving") return { text: "Saving…", tone: "muted" };
    if (saveState === "saved") return { text: "Saved", tone: "ok" };
    return persistedRef.current ? { text: "Saved", tone: "ok" } : { text: "Not saved yet", tone: "muted" };
  })();

  const editor = (
    <div className="px-4 sm:px-5 pb-28 lg:pb-10">
      {restore && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm flex flex-wrap items-center gap-3" role="status">
          <span className="flex-1 min-w-[200px] text-foreground">Unsaved changes from {ago(restore.at)} were kept on this device.</span>
          <button type="button" className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-semibold"
            onClick={() => { setContent(restore.content); if (isIssued) setEditingIssued(true); setRestore(null); }}>Restore</button>
          <button type="button" className="h-8 px-3 rounded-lg border border-border text-xs font-medium"
            onClick={() => { clearWip(user.uid, invoiceId); setRestore(null); }}>Discard</button>
        </div>
      )}
      {isIssued && editingIssued && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[13px] text-muted-foreground">
          Editing <span className="font-medium text-foreground">{meta.number}</span>. Saved changes keep this number; a copy the client already has won't change.
        </div>
      )}
      {errorCount > 0 && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-3" role="alert" data-test="issue-list">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <AlertTriangle size={15} className="text-destructive" />
            {errorCount === 1 ? "One thing to fix before generating" : `${errorCount} things to fix before generating`}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {blockingIssues(issues).slice(0, 6).map((i) => (
              <li key={i.field + i.message}>
                <button type="button" onClick={() => jumpTo(i.field)} className="text-[13px] text-destructive hover:underline text-left">{i.message}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <InvoiceEditor
        content={content}
        update={update}
        totals={totals}
        number={meta.number}
        status={meta.status}
        readOnly={readOnly}
        compact={compact}
        issueFor={issueFor}
        open={open}
        onToggle={(id) => setOpen((o) => ({ ...o, [id]: !o[id] }))}
        company={company}
        logoSrc={paper.logoSrc || content.seller.logoUrl || companyLogo}
        logoUploading={logoUploading}
        qrSrc={paper.qrSrc}
        qrUploading={qrUploading}
        onQrFile={onQrFile}
        onLogoFile={onLogoFile}
        canChangeStatus={mayEdit}
        statusBusy={statusBusy}
        onStatusChange={changeStatus}
        canEditDefaults={canEditInvoiceDefaults(user.role)}
        focusItemId={focusItemId}
        onFocusDone={() => setFocusItemId(null)}
        onAddItem={addItem}
        fillFromSale={user.role === "sales_member" ? <FillFromSale onPick={pickSale} /> : undefined}
        customerSuggestions={customers}
        onWantSuggestions={wantCustomers}
      />
    </div>
  );

  return (
    <div ref={rootRef} className="-m-4 md:-m-6 h-[calc(100%_+_2rem)] md:h-[calc(100%_+_3rem)] min-h-[520px] flex flex-col bg-background" data-test="invoice-builder">
      {ConfirmDialog}

      {/* Top bar */}
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="h-14 pl-4 pr-3 sm:pr-4 flex items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[15px] font-semibold text-foreground truncate" data-test="builder-title">{title}</h1>
              <StatusPill status={displayStatus} />
            </div>
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
              {saveLabel && (
                <span className={cn("inline-flex items-center gap-1",
                  saveLabel.tone === "ok" && "text-emerald-600 dark:text-emerald-400",
                  saveLabel.tone === "error" && "text-destructive",
                  saveLabel.tone === "warn" && "text-amber-600 dark:text-amber-400")} data-test="save-state">
                  {saveLabel.tone === "offline" && <CloudOff size={12} />}
                  {saveLabel.tone === "ok" && <Check size={12} />}
                  {saveLabel.text}
                  {saveLabel.tone === "error" && (
                    <button type="button" onClick={() => void save({ issued: isIssued })} className="underline ml-1" title={saveError}>Retry</button>
                  )}
                </span>
              )}
              {saveLabel && <span aria-hidden>·</span>}
              <span className="tabular-nums">{formatPaise(totals.grandTotal, { symbol: true })}</span>
              {ownerNote && <><span aria-hidden>·</span><span className="truncate">{ownerNote}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {width >= 640 && actions}
            {moreMenu}
            <span className="w-px h-6 bg-border mx-0.5 hidden sm:block" aria-hidden />
            {closeButton}
          </div>
        </div>
        {!wide && (
          <div className="px-3 sm:px-4 pb-2.5">
            <Segmented<"edit" | "preview">
              ariaLabel="Edit or preview"
              value={view}
              onChange={setView}
              className="w-full [&>button]:flex-1"
              options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]}
            />
          </div>
        )}
      </header>

      {/* Body */}
      <div className={cn("flex-1 min-h-0", wide ? "grid" : "flex flex-col")}
        style={wide ? { gridTemplateColumns: `${editorWidth}px minmax(0, 1fr)` } : undefined}>
        <div ref={editorScrollRef} className={cn("min-h-0 overflow-y-auto overscroll-contain", wide ? "border-r border-border" : view === "edit" ? "flex-1" : "hidden")}>
          {editor}
        </div>
        <div className={cn("min-h-0 overflow-y-auto overscroll-contain bg-muted/50 dark:bg-muted/20", wide ? "" : view === "preview" ? "flex-1" : "hidden")}>
          {!isIssued && (
            <div className="sticky top-0 z-10 px-4 py-2 border-b border-border bg-background/85 backdrop-blur text-xs text-muted-foreground flex items-center gap-2" data-test="draft-preview-note">
              <FileCheck2 size={14} className="shrink-0" />
              <span>Preview. Generate the invoice to get its number and download the final PDF.</span>
            </div>
          )}
          {model && <InvoicePreview ref={previewRef} model={model} padding={wide ? 28 : 14} />}
        </div>
      </div>

      {/* Phone / tablet action bar */}
      {width < 640 && (
        <div className="shrink-0 border-t border-border bg-background px-3 py-2.5 flex items-center gap-2" data-test="mobile-actions">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground leading-none">Total</div>
            <div className="text-base font-semibold text-foreground tabular-nums truncate">{formatPaise(totals.grandTotal, { symbol: true })}</div>
          </div>
          {actions}
        </div>
      )}

      {/* The invoice is numbered: one window, the number, and the final PDF. */}
      <Dialog open={!!justGenerated} onOpenChange={(v) => { if (!v) setJustGenerated(null); }}>
        <DialogContent className="max-w-sm" data-test="generated-dialog">
          <div className="flex flex-col items-center text-center pt-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 size={26} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <DialogTitle className="mt-3 text-lg">Invoice {justGenerated} is ready</DialogTitle>
            <DialogDescription className="mt-1">
              {content.customer.name.trim() || "Customer"} · {formatPaise(totals.grandTotal, { symbol: true })}
            </DialogDescription>
          </div>
          <div className="mt-2 grid gap-2">
            <button type="button" data-test="generated-download"
              onClick={() => { setJustGenerated(null); void runExportRef.current("pdf"); }}
              className="h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 inline-flex items-center justify-center gap-2">
              <Download size={16} /> Download PDF
            </button>
            <button type="button" data-test="generated-print"
              onClick={() => { setJustGenerated(null); void runExportRef.current("print"); }}
              className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-accent inline-flex items-center justify-center gap-2">
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={() => setJustGenerated(null)}
              className="h-9 text-sm text-muted-foreground hover:text-foreground">Done</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlockedState({ phase }: { phase: Phase }) {
  const text = phase === "missing"
    ? { title: "Invoice not found", body: "It may have been a draft that was deleted, or the link is wrong." }
    : phase === "denied"
      ? { title: "You can't open this invoice", body: "Invoices are visible to the person who made them and to the admins." }
      : { title: "Couldn't open the invoice", body: "Check your connection and try again." };
  return (
    <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center gap-3 px-6">
      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"><AlertTriangle size={20} className="text-muted-foreground" /></div>
      <h2 className="text-base font-semibold text-foreground">{text.title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm">{text.body}</p>
      <div className="flex gap-2 mt-1">
        <Link to="/invoices" className="h-9 px-3.5 inline-flex items-center rounded-lg border border-border text-sm font-medium hover:bg-accent">All invoices</Link>
        <Link to="/invoices/new" className="h-9 px-3.5 inline-flex items-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">New invoice</Link>
      </div>
    </div>
  );
}
