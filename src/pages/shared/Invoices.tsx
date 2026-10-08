/**
 * Invoices — `/invoices` (2026-10-08). The register, and the way into the builder.
 *
 * One row per invoice, its status in words (Draft / Unpaid / Overdue / Paid / Cancelled), filters that
 * are also counts, and a search over the customer and the number. A salesperson or team leader sees the
 * invoices they made; the four admins see every invoice (`utils/invoiceAccess`).
 *
 * One live query (`services/invoices.watchInvoices`) — scoped to the owner for members, capped for admins.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, FileText, MoreHorizontal, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { deleteInvoice, duplicateInvoice, watchInvoices } from "@/services/invoices";
import type { Invoice } from "@/types/invoice";
import { formatPaise } from "@/utils/invoiceMath";
import { deleteConfirmCopy, displayStatusOf, formatInvoiceDate, isoDate, type InvoiceDisplayStatus } from "@/utils/invoiceDraft";
import { canDeleteInvoice, canManageInvoiceAccess, isInvoiceAdmin } from "@/utils/invoiceAccess";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/invoice/StatusPill";

type Filter = "all" | InvoiceDisplayStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Invoices() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [list, setList] = useState<Invoice[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!user) return;
    setError(false);
    return watchInvoices({ uid: user.uid, role: user.role }, setList, () => setError(true));
  }, [user?.uid, user?.role, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = isoDate();
  const rows = useMemo(() => (list || []).map((inv) => ({ inv, display: displayStatusOf(inv, today) })), [list, today]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, draft: 0, unpaid: 0, overdue: 0, paid: 0, cancelled: 0 };
    rows.forEach((r) => { c[r.display] += 1; });
    return c;
  }, [rows]);
  const outstanding = useMemo(() => rows
    .filter((r) => r.display === "unpaid" || r.display === "overdue")
    .reduce((s, r) => s + (r.inv.totals?.grandTotal || 0), 0), [rows]);
  const overdueTotal = useMemo(() => rows
    .filter((r) => r.display === "overdue")
    .reduce((s, r) => s + (r.inv.totals?.grandTotal || 0), 0), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    const hit = (inv: Invoice) => !needle
      || (inv.customer?.name || "").toLowerCase().includes(needle)
      || (inv.number || "").toLowerCase().includes(needle)
      || (digits.length >= 3 && (inv.customer?.phone || "").replace(/\D/g, "").includes(digits));
    return rows.filter((r) => (filter === "all" || r.display === filter) && hit(r.inv));
  }, [rows, filter, q]);

  if (!user) return null;
  const admin = isInvoiceAdmin(user.role);
  const settingsPath = user.role === "tech_admin" ? "/tech-admin/settings" : user.role === "main_admin" ? "/main-admin/settings" : "";

  const onDuplicate = (inv: Invoice) => {
    const { id, committed } = duplicateInvoice(inv, { uid: user.uid, name: user.name || "", role: user.role });
    committed.catch(() => toast({ title: "Couldn't save the copy", variant: "destructive" }));
    navigate(`/invoices/${id}`);
  };

  const onDelete = async (inv: Invoice) => {
    const copy = deleteConfirmCopy(inv);
    const r = await confirm({ title: copy.title, description: copy.description, confirmText: copy.confirmText, variant: "destructive" });
    if (!r.confirmed) return;
    try {
      await deleteInvoice(inv.id, { uid: user.uid, name: user.name || "", role: user.role });
      toast({ title: copy.done });
    } catch (err) {
      toast({ title: "Couldn't delete the invoice", description: (err as Error)?.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-6xl mx-auto" data-test="invoices-page">
      {ConfirmDialog}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {admin ? "Every invoice the company has made." : "The invoices you've made."}
            {canManageInvoiceAccess(user.role) && settingsPath && (
              <> <Link to={settingsPath} className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground underline-offset-2 hover:underline ml-1">
                <Settings2 size={12} /> Team leader access
              </Link></>
            )}
          </p>
        </div>
        <Link to="/invoices/new" data-test="new-invoice"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-sm">
          <Plus size={16} /> New invoice
        </Link>
      </div>

      {list && list.length > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="text-foreground font-medium tabular-nums">{formatPaise(outstanding, { symbol: true })}</span> waiting to be paid
          {overdueTotal > 0 && <> · <span className="text-amber-700 dark:text-amber-400 font-medium tabular-nums">{formatPaise(overdueTotal, { symbol: true })}</span> overdue</>}
        </p>
      )}

      <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative md:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, number or phone" aria-label="Search invoices"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              className={cn("h-8 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition-colors",
                filter === f.key ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/60")}>
              {f.label} <span className="tabular-nums opacity-70 ml-0.5">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
        {error ? (
          <div className="p-10 text-center">
            <p className="text-sm text-foreground font-medium">Couldn't load invoices</p>
            <p className="text-xs text-muted-foreground mt-1">Check your connection.</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="mt-3 h-8 px-3 rounded-lg border border-border text-xs font-medium hover:bg-accent">Try again</button>
          </div>
        ) : list === null ? (
          <ul aria-busy="true" aria-label="Loading invoices">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="px-4 py-4 border-b border-border last:border-b-0 flex items-center gap-4">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              </li>
            ))}
          </ul>
        ) : list.length === 0 ? (
          <div className="px-6 py-16 text-center" data-test="invoices-empty">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center"><FileText size={20} className="text-muted-foreground" /></div>
            <h2 className="mt-4 text-base font-semibold text-foreground">No invoices yet</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">Fill in the customer and what you sold — the invoice builds itself as you type.</p>
            <Link to="/invoices/new" className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
              <Plus size={15} /> Create your first invoice
            </Link>
          </div>
        ) : shown.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No invoices match.</div>
        ) : (
          <>
            <div className={cn("hidden md:grid gap-4 px-4 py-2.5 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
              admin ? "grid-cols-[150px_minmax(0,1fr)_120px_110px_130px_96px_40px]" : "grid-cols-[150px_minmax(0,1fr)_110px_130px_96px_40px]")}>
              <span>Number</span><span>Customer</span>{admin && <span>Made by</span>}<span>Date</span><span className="text-right">Amount</span><span>Status</span><span />
            </div>
            <ul data-test="invoice-list">
              {shown.map(({ inv, display }) => (
                <li key={inv.id} className="border-b border-border last:border-b-0" data-test="invoice-row">
                  <div className={cn("relative grid gap-x-4 gap-y-1 px-4 py-3 items-center hover:bg-accent/40 transition-colors",
                    "grid-cols-[minmax(0,1fr)_auto]",
                    admin ? "md:grid-cols-[150px_minmax(0,1fr)_120px_110px_130px_96px_40px]" : "md:grid-cols-[150px_minmax(0,1fr)_110px_130px_96px_40px]")}>
                    <Link to={`/invoices/${inv.id}`} className="absolute inset-0" aria-label={`Open ${inv.number || "draft"} for ${inv.customer?.name || "no customer"}`} />
                    <span className={cn("text-sm tabular-nums truncate order-3 md:order-none", inv.number ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {inv.number || "Draft"}
                      <span className="md:hidden text-muted-foreground font-normal"> · {formatInvoiceDate(inv.issueDate)}</span>
                    </span>
                    <span className="text-sm text-foreground truncate order-1 md:order-none font-medium md:font-normal">{inv.customer?.name || <span className="text-muted-foreground">No customer yet</span>}</span>
                    {admin && <span className="hidden md:block text-sm text-muted-foreground truncate">{inv.ownerName || "—"}</span>}
                    <span className="hidden md:block text-sm text-muted-foreground tabular-nums">{formatInvoiceDate(inv.issueDate)}</span>
                    <span className="text-sm text-foreground tabular-nums text-right order-2 md:order-none">{formatPaise(inv.totals?.grandTotal || 0, { symbol: true })}</span>
                    <span className="order-4 md:order-none justify-self-end md:justify-self-start"><StatusPill status={display} /></span>
                    <span className="relative z-10 hidden md:flex justify-end">
                      <RowMenu inv={inv} canDelete={canDeleteInvoice(user, inv)} onDuplicate={onDuplicate} onDelete={onDelete} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function RowMenu({ inv, canDelete, onDuplicate, onDelete }: {
  inv: Invoice;
  canDelete: boolean;
  onDuplicate: (inv: Invoice) => void;
  onDelete: (inv: Invoice) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Invoice actions" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild><Link to={`/invoices/${inv.id}`}><FileText size={14} className="mr-2" /> Open</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(inv)}><Copy size={14} className="mr-2" /> Duplicate</DropdownMenuItem>
        {canDelete && (<>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onDelete(inv)} className="text-destructive focus:text-destructive"><Trash2 size={14} className="mr-2" /> {inv.number ? "Delete invoice" : "Delete draft"}</DropdownMenuItem>
        </>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
