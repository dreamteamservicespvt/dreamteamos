import { useState, useMemo, useEffect } from "react";
import {
  Users, Search, Loader2, MessageCircle, X, Save, Mail, Globe, MapPin, Image as ImageIcon,
  CreditCard, Plus, Trash2, Contact, ShoppingBag, TrendingUp, Star, Gift, ExternalLink, CheckCircle2, DownloadCloud, CalendarDays, ArrowDownUp, UserPlus,
} from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import { categoryLabel, gapCategories } from "@/utils/serviceCatalog";
import {
  clientsQuery, updateClientProfile, assignUpsellLead, backfillClientsFromDeliveredWork,
  recordClientBackfill, watchClientBackfill,
  type ClientBackfillResult, type ClientBackfillRecord,
} from "@/services/clients";
import PeriodFilterBar from "@/components/dashboard/PeriodFilterBar";
import ViewToggle from "@/components/common/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { clientTotal, workAmount } from "@/utils/clientValue";
import { defaultPeriodFilter, periodLabel, withinPeriod, type PeriodFilter } from "@/utils/periodFilter";
import { createReviewTask, fetchReviewTask, verifyFiveStar, rejectReview } from "@/services/reviews";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { AppUser, Client, ClientSocialLink, ReviewTask, WorkAssignment } from "@/types";

function fmtTs(ts: any): string {
  const s = ts?.seconds ?? (typeof ts?.toMillis === "function" ? ts.toMillis() / 1000 : 0);
  return s ? format(new Date(s * 1000), "dd MMM yyyy") : "—";
}

const isImageUrl = (u?: string | null) => !!u && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u);

/** Seconds of the most recent delivery, or 0 when nothing has been delivered yet. */
function lastWorkSeconds(c: Client): number {
  return (c.works || []).reduce((max, w) => {
    const s = (w.deliveredAt as { seconds?: number } | undefined)?.seconds ?? 0;
    return s > max ? s : max;
  }, 0);
}

/** Seconds of a client's *first* delivery — where the old→new ordering starts. */
function firstWorkSeconds(c: Client): number {
  return (c.works || []).reduce((min, w) => {
    const s = (w.deliveredAt as { seconds?: number } | undefined)?.seconds ?? 0;
    if (!s) return min;
    return min === 0 || s < min ? s : min;
  }, 0);
}


type ClientSort = "new_old" | "old_new" | "name" | "value";

const SORT_OPTIONS: { key: ClientSort; label: string }[] = [
  { key: "new_old", label: "Newest work first" },
  { key: "old_new", label: "Oldest work first" },
  { key: "name", label: "Name (A–Z)" },
  { key: "value", label: "Highest value" },
];

/** Whether this client had any work delivered inside the selected period. */
function worksWithin(c: Client, filter: PeriodFilter): boolean {
  if (filter.mode === "career") return true;
  return (c.works || []).some((w) => {
    const s = (w.deliveredAt as { seconds?: number } | undefined)?.seconds;
    return s ? withinPeriod(format(new Date(s * 1000), "yyyy-MM-dd"), filter) : false;
  });
}

export default function Clients() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const q = useMemo(() => clientsQuery(user?.role, user?.uid), [user?.role, user?.uid]);
  const { data: clients, loading } = useFirestoreQuery<Client>(q, [user?.role, user?.uid]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Client | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>(defaultPeriodFilter);
  /** Newest delivery first by default — "who did we just finish for?" is the usual question. */
  const [sort, setSort] = useState<ClientSort>("new_old");
  // Grid is the default view; the toggle switches to a single-column list, remembered per viewer.
  const [view, setView] = useViewMode("clients");

  const canManage = user?.role === "sales_admin" || user?.role === "main_admin";
  /** Tech side owns delivery, so they're the ones who can pull delivered work into Clients. */
  const canImport = user?.role === "tech_admin" || user?.role === "main_admin";
  /**
   * A sales member sees the customers they sold to, and only those (see `clientsQuery`).
   *
   * They can still EDIT what is on the record — the email they were given, the logo, the Instagram
   * handle. That is the whole point of the page for them: two members who have both sold to a
   * business are looking at one document, so whatever either of them learns is immediately in
   * front of the other and in front of the sales admin. What they cannot do is hand the client to
   * someone else or run the delivered-work import, both of which are an admin's call.
   */
  const isSalesMember = user?.role === "sales_member";

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<ClientBackfillResult | null>(null);

  /** Null until we know; a record means the one-time sweep has already been run. */
  const [backfill, setBackfill] = useState<ClientBackfillRecord | null>(null);
  useEffect(() => watchClientBackfill(setBackfill), []);

  /**
   * Sweep every delivered assignment into Clients. Idempotent, so re-running only picks up
   * whatever is new — it never double-counts an existing client's work.
   */
  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const [assignSnap, userSnap] = await Promise.all([
        getDocs(collection(db, "work_assignments")),
        getDocs(collection(db, "users")),
      ]);

      const names = new Map<string, string>();
      userSnap.docs.forEach((d) => names.set(d.id, (d.data() as AppUser).name || ""));

      const assignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment));
      const result = await backfillClientsFromDeliveredWork(
        assignments,
        (uid) => names.get(uid) || "",
        (done, total) => setImportProgress({ done, total }),
      );

      setImportResult(result);
      // Remember it ran, so the banner stops nagging the whole company once it's done.
      if (user) await recordClientBackfill(result, { uid: user.uid, name: user.name });
      const changes = [
        result.imported > 0 ? `${result.imported} job${result.imported === 1 ? "" : "s"} added` : null,
        result.repaired > 0 ? `${result.repaired} delivery date${result.repaired === 1 ? "" : "s"} corrected` : null,
      ].filter(Boolean);
      toast({
        title: changes.length > 0 ? "Clients updated" : "Already up to date",
        description: changes.length > 0
          ? `${changes.join(" · ")} across ${result.clientsWritten} client${result.clientsWritten === 1 ? "" : "s"}.`
          : `All ${result.scanned} delivered jobs are already in Clients.`,
      });
    } catch (error) {
      console.error("Client import failed:", error);
      toast({ title: "Import failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // Sales members this admin can assign upsell/review work to.
  const [salesMembers, setSalesMembers] = useState<AppUser[]>([]);
  useEffect(() => {
    if (!user || !canManage) return;
    const qy = user.role === "sales_admin"
      ? query(collection(db, "users"), where("role", "==", "sales_member"), where("createdBy", "==", user.uid))
      : query(collection(db, "users"), where("role", "==", "sales_member"));
    getDocs(qy).then((snap) => setSalesMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)))).catch(() => {});
  }, [user, canManage]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sDigits = s.replace(/\D/g, "");
    const filtered = clients.filter((c) => {
      // Period filter matches on delivery, not on when the record was last touched: "July"
      // should mean "clients we did work for in July", not "clients whose row changed in July".
      if (!worksWithin(c, period)) return false;
      if (!s) return true;
      if (c.name?.toLowerCase().includes(s)) return true;
      if (c.businessCategory?.toLowerCase().includes(s)) return true;
      if (sDigits && c.phone?.replace(/\D/g, "").includes(sDigits)) return true;
      return false;
    });

    // Ordering is by real delivery dates. A client with no dated work falls back to when their
    // record was last touched, so they still land somewhere stable rather than at the very top.
    const newest = (c: Client) => lastWorkSeconds(c) || c.updatedAt?.seconds || 0;
    const oldest = (c: Client) => firstWorkSeconds(c) || c.createdAt?.seconds || c.updatedAt?.seconds || 0;

    const compare: Record<ClientSort, (a: Client, b: Client) => number> = {
      new_old: (a, b) => newest(b) - newest(a),
      old_new: (a, b) => oldest(a) - oldest(b),
      name: (a, b) => (a.name || "").localeCompare(b.name || ""),
      value: (a, b) => clientTotal(b) - clientTotal(a) || newest(b) - newest(a),
    };

    return [...filtered].sort(compare[sort]);
  }, [clients, search, period, sort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Contact className="w-3 h-3" /> Single customer view
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">{isSalesMember ? "My Clients" : "Clients"}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          {isSalesMember
            ? "Every customer you've sold to and we've delivered for — what they bought, what they're missing, and what they said about it. Anything you add here is visible to your sales admin and to anyone else who has sold to them."
            : "Every customer we've delivered to — what they bought, what they're missing, and their reviews."}
        </p>
      </div>

      {/* Import delivered work — a one-off sweep for jobs finished before clients were recorded
          automatically. Once it's been run the prompt collapses to a quiet line, because from
          here on every verified job lands in Clients by itself. */}
      {canImport && !backfill && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <DownloadCloud className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Import delivered work</p>
            <p className="text-xs text-muted-foreground">
              {importResult
                ? `Scanned ${importResult.scanned} delivered jobs · ${importResult.imported} added · ${importResult.repaired} dates corrected · ${importResult.alreadyPresent} already here${importResult.missingPhone ? ` · ${importResult.missingPhone} skipped (no WhatsApp number)` : ""}`
                : "A one-time catch-up for work delivered before Clients existed. New work arrives here automatically."}
            </p>
          </div>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {importing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{importProgress ? `${importProgress.done}/${importProgress.total} clients` : "Importing..."}</>
              : <>Import clients</>}
          </button>
        </div>
      )}

      {canImport && backfill && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-success/25 bg-success/5 px-4 py-2.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Delivered work imported {fmtTs(backfill.completedAt)}
            {backfill.byName ? ` by ${backfill.byName}` : ""} · every verified job is added here automatically now.
          </p>
          <button
            onClick={handleImport}
            disabled={importing}
            className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
          >
            {importing
              ? (importProgress ? `${importProgress.done}/${importProgress.total} clients` : "Re-syncing…")
              : "Re-sync"}
          </button>
        </div>
      )}

      {/* Period filter — the same Career / Month / Day / Range control used across the app. */}
      <PeriodFilterBar value={period} onChange={setPeriod}>
        <span className="text-xs font-semibold text-foreground">
          {visible.length} {visible.length === 1 ? "client" : "clients"}
          <span className="ml-1 font-normal text-muted-foreground">· {periodLabel(period)}</span>
        </span>
      </PeriodFilterBar>

      {/* Search + ordering */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search clients by name, category, phone…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="relative shrink-0">
          <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={sort} onChange={(e) => setSort(e.target.value as ClientSort)} aria-label="Sort clients"
            className="h-10 w-full rounded-xl border border-border/70 bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 sm:w-48">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <ViewToggle mode={view} onChange={setView} />
      </div>

      {/* Grid / list */}
      {visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {clients.length === 0 ? (
            <>
              <p className="text-lg font-medium">No clients yet</p>
              <p className="text-sm">
                {isSalesMember
                  ? "A client you sold to appears here once the tech team has delivered their ad."
                  : "Clients appear here once their work is delivered and verified."}
              </p>
              {/*
                Said out loud, because the alternative is a member concluding the page is broken.

                Sales attribution on client records is filled in by the one-time re-sync on the
                admin's copy of this page. Until somebody runs it, a member who has delivered forty
                customers sees exactly this screen, and has no way of knowing why.
              */}
              {isSalesMember && (
                <p className="mx-auto mt-3 max-w-md rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs">
                  Sold to clients already? Ask your admin to press <strong className="text-foreground">Re-sync</strong> on
                  their Clients page once — it is what files past deliveries under the person who sold them.
                </p>
              )}
            </>
          ) : (
            // There *are* clients — the filter just excluded them. Say so, or this reads as data loss.
            <>
              <p className="text-lg font-medium">No clients in {periodLabel(period)}</p>
              <p className="text-sm">
                Switch to Career to see all {clients.length} client{clients.length === 1 ? "" : "s"}.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "grid grid-cols-1 gap-2"}>
          {visible.map((c, i) => (
            <button key={c.phoneId} onClick={() => setActive(c)}
              className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-3">
                {/* Serial number — makes the running total legible without counting cards. */}
                <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {isImageUrl(c.logoUrl) ? (
                  <img src={c.logoUrl!} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary">{c.name?.charAt(0) || "?"}</div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.businessCategory || formatPhoneDisplay(c.phone)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{c.workCount} {c.workCount === 1 ? "service" : "services"}</span>
                <span className="font-semibold text-primary">{formatCurrency(clientTotal(c))}</span>
              </div>
              {/* Client since (first job) + last job — together they say how long this customer
                  has been with us and whether we've worked for them recently, without opening the
                  card. "Client since" is the date we first delivered anything for them. */}
              {firstWorkSeconds(c) > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <UserPlus size={10} className="shrink-0" />
                  Client since {format(new Date(firstWorkSeconds(c) * 1000), "dd MMM yyyy")}
                </p>
              )}
              {lastWorkSeconds(c) > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarDays size={10} className="shrink-0" />
                  Last work {format(new Date(lastWorkSeconds(c) * 1000), "dd MMM yyyy")}
                </p>
              )}
              {(c.loyaltyDiscountPercent || gapCategories((c.works || []).map((w) => w.category)).length > 0) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {!!c.loyaltyDiscountPercent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5"><Star size={9} /> {c.loyaltyDiscountPercent}% loyalty</span>}
                  {gapCategories((c.works || []).map((w) => w.category)).length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info inline-flex items-center gap-0.5"><TrendingUp size={9} /> {gapCategories((c.works || []).map((w) => w.category)).length} upsell</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {active && (
        <ClientDetail
          client={active}
          salesMembers={salesMembers}
          canManage={canManage}
          admin={user || null}
          onClose={() => setActive(null)}
          onSaved={(c) => setActive(c)}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Detail / edit modal ───────────────────────────────────────────────────
function ClientDetail({ client, salesMembers, canManage, admin, onClose, onSaved, toast }: {
  client: Client;
  salesMembers: AppUser[];
  canManage: boolean;
  admin: AppUser | null;
  onClose: () => void;
  onSaved: (c: Client) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [form, setForm] = useState({
    name: client.name || "",
    businessCategory: client.businessCategory || "",
    email: client.email || "",
    logoUrl: client.logoUrl || "",
    visitingCardUrl: client.visitingCardUrl || "",
    googleBusinessUrl: client.googleBusinessUrl || "",
    websiteUrl: client.websiteUrl || "",
  });
  const [social, setSocial] = useState<ClientSocialLink[]>(client.socialMedia || []);
  const [saving, setSaving] = useState(false);

  // Upsell
  const gaps = useMemo(() => gapCategories((client.works || []).map((w) => w.category)), [client.works]);
  const [upsellMemberId, setUpsellMemberId] = useState("");
  const [busyGap, setBusyGap] = useState<string | null>(null);

  // Review workflow
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [reviewMemberId, setReviewMemberId] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const reloadTask = async (taskId?: string | null) => {
    const id = taskId ?? client.reviewTaskId;
    if (!id) { setTask(null); return; }
    setTask(await fetchReviewTask(id));
  };
  useEffect(() => { reloadTask(); /* eslint-disable-next-line */ }, [client.reviewTaskId]);

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        name: form.name.trim(),
        businessCategory: form.businessCategory.trim() || null,
        email: form.email.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        visitingCardUrl: form.visitingCardUrl.trim() || null,
        googleBusinessUrl: form.googleBusinessUrl.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        socialMedia: social.filter((s) => s.platform.trim() && s.url.trim()),
      };
      await updateClientProfile(client.phoneId, patch as any);
      onSaved({ ...client, ...patch } as Client);
      toast({ title: "Saved", description: "Client profile updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const doUpsell = async (categoryKey: string) => {
    const member = salesMembers.find((m) => m.uid === upsellMemberId);
    if (!member || !admin) { toast({ title: "Pick a member", description: "Select a sales executive first.", variant: "destructive" }); return; }
    setBusyGap(categoryKey);
    try {
      const res = await assignUpsellLead({ client, member, admin, categoryKey });
      toast({ title: res.ok ? "Upsell assigned" : "Couldn't assign", description: res.message, variant: res.ok ? undefined : "destructive" });
    } catch {
      toast({ title: "Error", description: "Failed to assign upsell.", variant: "destructive" });
    } finally {
      setBusyGap(null);
    }
  };

  const requestReview = async () => {
    const member = salesMembers.find((m) => m.uid === reviewMemberId);
    if (!member || !admin) { toast({ title: "Pick a member", description: "Select a sales executive first.", variant: "destructive" }); return; }
    setReviewBusy(true);
    try {
      const id = await createReviewTask({ client, member, admin });
      onSaved({ ...client, reviewTaskId: id, reviewStatus: "requested", reviewAssignedTo: member.uid, reviewAssignedToName: member.name });
      await reloadTask(id);
      toast({ title: "Review requested", description: `${member.name} will collect a 5★ review.` });
    } catch {
      toast({ title: "Error", description: "Failed to request review.", variant: "destructive" });
    } finally {
      setReviewBusy(false);
    }
  };

  const doVerify = async () => {
    if (!task) return;
    setReviewBusy(true);
    try {
      await verifyFiveStar(task);
      onSaved({ ...client, reviewStatus: "verified", loyaltyDiscountPercent: 10 });
      await reloadTask();
      toast({ title: "5★ verified", description: "10% loyalty discount applied; feedback video unlocked." });
    } catch {
      toast({ title: "Error", description: "Failed to verify.", variant: "destructive" });
    } finally {
      setReviewBusy(false);
    }
  };

  const doReject = async () => {
    if (!task) return;
    setReviewBusy(true);
    try {
      await rejectReview(task.id);
      await reloadTask();
      toast({ title: "Sent back", description: "Asked the member to re-collect the 5★ review." });
    } finally {
      setReviewBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder = "", icon?: React.ReactNode) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">{icon}{label}</label>
      <input type="text" value={form[key]} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
    </div>
  );

  const memberSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
      <option value="">Select sales executive…</option>
      {salesMembers.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">{client.name || formatPhoneDisplay(client.phone)}</h3>
            <a href={getWhatsAppUrl(client.phone)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium">
              <MessageCircle className="w-3 h-3" /> {formatPhoneDisplay(client.phone)}
            </a>
            {!!client.loyaltyDiscountPercent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5"><Star size={10} /> {client.loyaltyDiscountPercent}%</span>}
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Profile form */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">Profile</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("Client / Business Name", "name", "e.g. Sharma Electronics")}
              {field("Business Category", "businessCategory", "e.g. Electronics retail")}
              {field("Email", "email", "name@example.com", <Mail size={12} />)}
              {field("Website", "websiteUrl", "https://…", <Globe size={12} />)}
              {field("Google Business Profile", "googleBusinessUrl", "https://…", <MapPin size={12} />)}
              {field("Logo (image URL)", "logoUrl", "https://…", <ImageIcon size={12} />)}
              {field("Visiting Card (image URL)", "visitingCardUrl", "https://…", <CreditCard size={12} />)}
            </div>
            {(isImageUrl(form.logoUrl) || isImageUrl(form.visitingCardUrl)) && (
              <div className="flex gap-3 mt-3">
                {isImageUrl(form.logoUrl) && <img src={form.logoUrl} alt="Logo" className="h-16 rounded-md border border-border object-contain bg-background" />}
                {isImageUrl(form.visitingCardUrl) && <img src={form.visitingCardUrl} alt="Visiting card" className="h-16 rounded-md border border-border object-contain bg-background" />}
              </div>
            )}
          </div>

          {/* Social links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-foreground">Social Media</h4>
              <button onClick={() => setSocial((s) => [...s, { platform: "", url: "" }])}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Plus size={12} /> Add</button>
            </div>
            {social.length === 0 ? (
              <p className="text-xs text-muted-foreground">No social links yet.</p>
            ) : (
              <div className="space-y-2">
                {social.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={s.platform} placeholder="Platform (e.g. Instagram)" onChange={(e) => setSocial((arr) => arr.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))}
                      className="w-40 h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                    <input type="text" value={s.url} placeholder="https://…" onChange={(e) => setSocial((arr) => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      className="flex-1 h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                    <button onClick={() => setSocial((arr) => arr.filter((_, j) => j !== i))} className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grow this client (upsell gaps) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-info" />
              <h4 className="text-sm font-semibold text-foreground">Grow this client</h4>
            </div>
            {gaps.length === 0 ? (
              <p className="text-xs text-muted-foreground">Owns all core services 🎉</p>
            ) : canManage ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Not there yet — assign a sales executive to pitch:</p>
                {memberSelect(upsellMemberId, setUpsellMemberId)}
                <div className="flex flex-wrap gap-2">
                  {gaps.map((g) => (
                    <button key={g.key} disabled={!upsellMemberId || busyGap === g.key} onClick={() => doUpsell(g.key)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-info/30 bg-info/10 text-info text-xs font-medium hover:bg-info/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {busyGap === g.key ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {g.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Missing: {gaps.map((g) => g.label).join(", ")}</p>
            )}
          </div>

          {/* Review & feedback (DTS-US) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Star size={14} className="text-amber-500" />
              <h4 className="text-sm font-semibold text-foreground">Review &amp; feedback (DTS-US)</h4>
            </div>
            {!client.reviewTaskId ? (
              canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  {memberSelect(reviewMemberId, setReviewMemberId)}
                  <button disabled={!reviewMemberId || reviewBusy} onClick={requestReview}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                    {reviewBusy ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />} Request 5★ review
                  </button>
                </div>
              ) : <p className="text-xs text-muted-foreground">No review requested yet.</p>
            ) : (
              <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Assigned to <strong className="text-foreground">{task?.assignedToName || client.reviewAssignedToName}</strong></span>
                  <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                    (task?.status || client.reviewStatus) === "verified" || (task?.status) === "completed" ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : (task?.status) === "review_uploaded" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"}`}>
                    {(task?.status || client.reviewStatus || "requested").replace("_", " ")}
                  </span>
                  {!!task?.loyaltyDiscountPercent && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"><Gift size={10} /> {task.loyaltyDiscountPercent}% discount</span>}
                </div>
                {task?.reviewScreenshotUrl && (
                  <a href={task.reviewScreenshotUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink size={11} /> View 5★ screenshot</a>
                )}
                {task?.feedbackVideoUrl && (
                  <a href={task.feedbackVideoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline ml-3"><ExternalLink size={11} /> View feedback video</a>
                )}
                {canManage && task?.status === "review_uploaded" && (
                  <div className="flex gap-2 pt-1">
                    <button disabled={reviewBusy} onClick={doVerify} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium hover:bg-green-200 disabled:opacity-50"><CheckCircle2 size={12} /> Verify 5★ (apply 10%)</button>
                    <button disabled={reviewBusy} onClick={doReject} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive font-medium hover:bg-destructive/20 disabled:opacity-50"><X size={12} /> Reject</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* What they told us about the ads themselves — straight from their own chat. */}
          {!!client.reviews?.length && (
            <div data-test="client-reviews">
              <div className="flex items-center gap-2 mb-2">
                <Star size={14} className="text-amber-500" />
                <h4 className="text-sm font-semibold text-foreground">What this client said</h4>
                <span className="text-[10px] text-muted-foreground">
                  {client.reviews.length} review{client.reviews.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">
                {[...client.reviews]
                  .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))
                  .map((r) => (
                    <div key={r.assignmentId} className="rounded-lg border border-border p-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                          Math.min(r.work, r.service) <= 3
                            ? "bg-destructive/15 text-destructive"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}>
                          <Star size={10} className="fill-current" /> {r.work}/5 work · {r.service}/5 service
                        </span>
                        {r.uniqueId && <span className="font-mono text-[10px] text-muted-foreground">{r.uniqueId}</span>}
                        <span className="text-[10px] text-muted-foreground">{fmtTs(r.at)}</span>
                      </div>
                      {r.comment && (
                        <p className="mt-1.5 italic text-muted-foreground">“{r.comment}”</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {r.soldByName ? `Sold by ${r.soldByName}` : "Sold by —"}
                        {r.deliveredByName ? ` · Made by ${r.deliveredByName}` : ""}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Our Works */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={14} className="text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">Our Works</h4>
              <span className="text-[10px] text-muted-foreground">{client.workCount} delivered</span>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] font-medium text-muted-foreground">
                <span className="col-span-5">Service</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-2">Sold by</span>
                <span className="col-span-3">Delivered by</span>
              </div>
              <div className="divide-y divide-border">
                {(client.works || []).map((w, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-xs text-foreground items-center">
                    <span className="col-span-5 min-w-0">
                      <span className="font-medium">{categoryLabel(w.category)}</span>
                      {w.packageKey && w.packageKey !== "custom" && <span className="text-muted-foreground"> · {w.packageKey}</span>}
                      {w.billing === "monthly" && <span className="ml-1 text-[9px] px-1 rounded bg-purple-500/15 text-purple-500">Monthly</span>}
                      {w.fromAd && <span className="ml-1 text-[9px] px-1 rounded bg-info/15 text-info">Ad</span>}
                      <span className="block text-[10px] text-muted-foreground">{fmtTs(w.deliveredAt)}</span>
                    </span>
                    <span className="col-span-2 text-right font-medium text-primary">{formatCurrency(workAmount(w))}</span>
                    <span className="col-span-2 truncate text-muted-foreground" title={w.soldByName}>{w.soldByName || "—"}</span>
                    <span className="col-span-3 truncate text-muted-foreground" title={w.deliveredByName || ""}>{w.deliveredByName || "—"}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-muted/30 text-xs font-semibold text-foreground">
                <span className="col-span-5">Total</span>
                <span className="col-span-2 text-right text-primary">{formatCurrency(clientTotal(client))}</span>
                <span className="col-span-5" />
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex justify-end">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? "Saving…" : "Save profile"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
