/**
 * A sales member's own customer book — everyone they have sold to, and a way to sell again.
 *
 * ── Why this is not the shared Clients page ───────────────────────────────────────────────────
 * That page answers "who has the company delivered to", built from the `clients` collection, which
 * only gains a record when work SHIPS. A seller's question is different and larger: who have I sold
 * to. Against live data one member had sold to 710 customers and the shared page offered her 53 —
 * the rest were either still in production or carried no `soldByIds` because that field is filled
 * in by a one-off backfill that had never been run. Two different ways to lose a customer you are
 * entitled to ring.
 *
 * So the book is built from the member's own ORDERS and enriched by the client record wherever one
 * exists. Nothing here depends on the backfill, and a customer who bought this morning is in the
 * list this morning.
 *
 * ── Why the period filter measures the SALE ───────────────────────────────────────────────────
 * "My July clients" means the people who bought from me in July. Whether the tech team shipped in
 * July or in August is not a fact about the seller's month, and filtering on delivery moves
 * customers between months for reasons the seller had no part in. It also defaults to Career: this
 * is a calling list, and a call list that hides everybody older than four weeks is not one.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import {
  Users, Search, Loader2, MessageCircle, TrendingUp, Star, CalendarDays, UserPlus,
  ArrowDownUp, Hourglass, ShoppingBag, Sparkles,
} from "lucide-react";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { useToast } from "@/hooks/use-toast";
import { clientsQuery } from "@/services/clients";
import { startUpsell, upsellLeadUrl } from "@/services/upsell";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import { categoryLabel, bulkCategoryLabel, SERVICE_CATALOG } from "@/utils/serviceCatalog";
import { buildSalesClients, soldWithin, type SalesClient } from "@/utils/salesClients";
import { defaultPeriodFilter, periodLabel, withinPeriod, type PeriodFilter } from "@/utils/periodFilter";
import PeriodFilterBar from "@/components/dashboard/PeriodFilterBar";
import ViewToggle from "@/components/common/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { format } from "date-fns";
import type { Client, Order } from "@/types";

/**
 * What can be upsold, in the order a seller would reach for it.
 *
 * Wishes leads because festivals are what drive an upsell round — Independence Day, Diwali, a
 * shop's anniversary — and in those weeks it is the only thing most of these calls are about.
 */
const UPSELL_CATEGORIES = [
  "wishes",
  "promotional",
  ...SERVICE_CATALOG.map(c => c.key).filter(k => k !== "wishes" && k !== "promotional"),
];

type SalesClientSort = "recent" | "oldest" | "name" | "value";

const SORT_OPTIONS: { key: SalesClientSort; label: string }[] = [
  { key: "recent", label: "Latest sale first" },
  { key: "oldest", label: "Oldest sale first" },
  { key: "name", label: "Name (A–Z)" },
  { key: "value", label: "Highest value" },
];

export default function MyClients() {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();
  const navigate = useNavigate();

  /** Everyone they sold to — the record of the sale, which exists from the moment it is taken. */
  const ordersQ = useMemo(
    () => (user?.uid ? query(collection(db, "orders"), where("soldBy", "==", user.uid)) : null),
    [user?.uid],
  );
  const { data: orders, loading: ordersLoading } = useFirestoreQuery<Order>(ordersQ, [user?.uid]);

  /** The delivered ones, for their history, profile and reviews. Absent is fine — see the header. */
  const clientsQ = useMemo(() => clientsQuery(user?.role, user?.uid), [user?.role, user?.uid]);
  const { data: clients } = useFirestoreQuery<Client>(clientsQ, [user?.role, user?.uid]);

  // Career by default: this is a calling list. The filter is there to narrow, not to hide.
  const [period, setPeriod] = useState<PeriodFilter>(() => ({ ...defaultPeriodFilter(), mode: "career" }));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SalesClientSort>("recent");
  const [view, setView] = useViewMode("my-clients");
  const [active, setActive] = useState<SalesClient | null>(null);

  const book = useMemo(
    () => buildSalesClients({ orders, clients }),
    [orders, clients],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const filtered = book.filter(row => {
      if (!soldWithin(row, day => withinPeriod(day, period))) return false;
      if (!q) return true;
      if (row.name.toLowerCase().includes(q)) return true;
      if (qDigits && row.phone.replace(/\D/g, "").includes(qDigits)) return true;
      return row.orders.some(o => (o.category || "").toLowerCase().includes(q));
    });

    const compare: Record<SalesClientSort, (a: SalesClient, b: SalesClient) => number> = {
      recent: (a, b) => b.lastSoldMs - a.lastSoldMs,
      oldest: (a, b) => a.firstSoldMs - b.firstSoldMs,
      name: (a, b) => a.name.localeCompare(b.name),
      value: (a, b) => b.totalSold - a.totalSold || b.lastSoldMs - a.lastSoldMs,
    };
    return [...filtered].sort(compare[sort]);
  }, [book, search, period, sort]);

  if (ordersLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 shadow-sm md:p-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Users className="h-3 w-3" /> Everyone you've sold to
        </div>
        <h1 className="text-xl font-bold text-foreground md:text-2xl">My Clients</h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          Your whole book, from your first sale to today — including work still in production.
          Pick a client and sell them their next ad; it is recorded as an ordinary sale and reaches
          the tech team the usual way.
        </p>
      </div>

      <PeriodFilterBar value={period} onChange={setPeriod}>
        <span className="text-xs font-semibold text-foreground">
          {visible.length} {visible.length === 1 ? "client" : "clients"}
          <span className="ml-1 font-normal text-muted-foreground">· {periodLabel(period)}</span>
        </span>
      </PeriodFilterBar>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            data-test="my-clients-search"
            placeholder="Search by name, phone or what they bought…"
            className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="relative shrink-0">
          <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={sort} onChange={e => setSort(e.target.value as SalesClientSort)} aria-label="Sort clients"
            className="h-10 w-full rounded-xl border border-border/70 bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 sm:w-48">
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <ViewToggle mode={view} onChange={setView} />
      </div>

      {visible.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">
            {book.length === 0 ? "No clients yet" : `No clients in ${periodLabel(period)}`}
          </p>
          <p className="text-sm">
            {book.length === 0
              ? "A client appears here as soon as you record a sale for them."
              : `Switch to Career to see all ${book.length}.`}
          </p>
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid grid-cols-1 gap-2"}>
          {visible.map((row, i) => (
            <ClientCard key={row.phoneId} row={row} index={i} onOpen={() => setActive(row)}
              onUpsell={cat => handleUpsell(row, cat)} />
          ))}
        </div>
      )}

      {active && (
        <ClientDetail row={active} onClose={() => setActive(null)}
          onUpsell={cat => handleUpsell(active, cat)} />
      )}
    </div>
  );

  /**
   * Take them to the sale form for this client, on the thing they picked.
   *
   * The number has to be their own lead before a sale can be added to it, which is what
   * `startUpsell` settles — including the common case where it already is.
   */
  async function handleUpsell(row: SalesClient, category: string) {
    if (!user) return;
    const result = await startUpsell({
      user: { uid: user.uid, name: user.name },
      phone: row.phone,
      displayName: row.name,
    });

    if (!result.ok || !result.leadId) {
      toast({ title: "Can't sell to this number", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: `Upselling ${categoryLabel(category)}`, description: result.message });
    navigate(upsellLeadUrl(result.leadId, category));
  }
}

/** The upsell control: what to sell, then go. Wishes first — festivals drive these calls. */
function UpsellPicker({ onUpsell, compact }: { onUpsell: (c: string) => void; compact?: boolean }) {
  const [category, setCategory] = useState("wishes");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        aria-label="What to upsell"
        data-test="upsell-category"
        className={`min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary ${compact ? "h-8" : "h-9"}`}
      >
        {UPSELL_CATEGORIES.map(key => (
          <option key={key} value={key}>{categoryLabel(key)}</option>
        ))}
      </select>
      <button
        type="button"
        data-test="upsell-go"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onUpsell(category); } finally { setBusy(false); } }}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 ${compact ? "h-8" : "h-9"}`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Sell
      </button>
    </div>
  );
}

function ClientCard({ row, index, onOpen, onUpsell }: {
  row: SalesClient;
  index: number;
  onOpen: () => void;
  onUpsell: (c: string) => void;
}) {
  return (
    <div data-test="my-client-card"
      className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md">
      <button onClick={onOpen} className="w-full text-left">
        <div className="mb-3 flex items-center gap-3">
          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground/70">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display font-bold text-primary">
            {row.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{row.name || "Unnamed"}</p>
            <p className="truncate text-xs text-muted-foreground">{formatPhoneDisplay(row.phone)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {row.orders.length} {row.orders.length === 1 ? "sale" : "sales"}
            {row.works.length > 0 && ` · ${row.works.length} delivered`}
          </span>
          <span className="font-semibold text-primary">{formatCurrency(row.totalSold)}</span>
        </div>
        {row.firstSoldMs > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <UserPlus size={10} className="shrink-0" />
            Client since {format(new Date(row.firstSoldMs), "dd MMM yyyy")}
          </p>
        )}
        {row.lastSoldMs > 0 && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays size={10} className="shrink-0" />
            Last sale {format(new Date(row.lastSoldMs), "dd MMM yyyy")}
          </p>
        )}
        {row.awaitingDelivery && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
            <Hourglass size={9} /> Nothing delivered yet
          </p>
        )}
      </button>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-3">
        <a href={getWhatsAppUrl(row.phone)} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Message on WhatsApp"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
        <div className="min-w-0 flex-1">
          <UpsellPicker onUpsell={onUpsell} compact />
        </div>
      </div>
    </div>
  );
}

function ClientDetail({ row, onClose, onUpsell }: {
  row: SalesClient;
  onClose: () => void;
  onUpsell: (c: string) => void;
}) {
  // Escape closes it — a modal a phone cannot dismiss is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reviews = row.client?.reviews || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
        data-test="my-client-detail" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-foreground">{row.name || formatPhoneDisplay(row.phone)}</h3>
            <a href={getWhatsAppUrl(row.phone)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
              <MessageCircle className="h-3 w-3" /> {formatPhoneDisplay(row.phone)}
            </a>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Close
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Sell them the next one — the reason this page exists during a festival week. */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp size={14} className="text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Sell them their next ad</h4>
            </div>
            <p className="mb-2.5 text-xs text-muted-foreground">
              Opens their lead with the sale form ready. It is recorded as a normal sale and reaches
              the tech team the usual way.
            </p>
            <UpsellPicker onUpsell={onUpsell} />
          </div>

          {/* What they have bought from this member. */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <ShoppingBag size={14} className="text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">What you've sold them</h4>
              <span className="text-[10px] text-muted-foreground">
                {row.orders.length} · {formatCurrency(row.totalSold)}
              </span>
            </div>
            <div className="space-y-1.5">
              {row.orders.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">
                      {bulkCategoryLabel(o.category, o.bulkAdType)}
                    </span>
                    {o.packageKey && o.packageKey !== "custom" && (
                      <span className="text-muted-foreground"> · {o.packageKey}</span>
                    )}
                    <span className="block text-[10px] text-muted-foreground">
                      {o.createdAt ? format(new Date((o.createdAt as { seconds: number }).seconds * 1000), "dd MMM yyyy") : "—"}
                      {" · "}
                      {o.status === "verified" ? "Delivered"
                        : o.status === "completed" ? "Awaiting verify"
                        : o.status === "assigned" ? "In production"
                        : "Not assigned"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono font-medium text-primary">{formatCurrency(o.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* What they said, when they have said anything. */}
          {reviews.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Star size={14} className="text-amber-500" />
                <h4 className="text-sm font-semibold text-foreground">What they said</h4>
              </div>
              <div className="space-y-2">
                {reviews.map(r => (
                  <div key={r.assignmentId} className="rounded-lg border border-border p-2.5 text-xs">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${
                      Math.min(r.work, r.service) <= 3
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}>
                      <Star size={10} className="fill-current" /> {r.work}/5 work · {r.service}/5 service
                    </span>
                    {r.comment && <p className="mt-1.5 italic text-muted-foreground">“{r.comment}”</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {row.awaitingDelivery && (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Nothing has been delivered to this client yet, so there is no work history or review to
              show — only what you have sold them.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
