import { useState, useMemo, useEffect } from "react";
import {
  Users, Search, Loader2, MessageCircle, X, Save, Mail, Globe, MapPin, Image as ImageIcon,
  CreditCard, Plus, Trash2, Contact, ShoppingBag, TrendingUp, Star, Gift, ExternalLink, CheckCircle2,
} from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import { categoryLabel, gapCategories } from "@/utils/serviceCatalog";
import { clientsQuery, updateClientProfile, assignUpsellLead } from "@/services/clients";
import { createReviewTask, fetchReviewTask, verifyFiveStar, rejectReview } from "@/services/reviews";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { AppUser, Client, ClientSocialLink, ReviewTask } from "@/types";

function fmtTs(ts: any): string {
  const s = ts?.seconds ?? (typeof ts?.toMillis === "function" ? ts.toMillis() / 1000 : 0);
  return s ? format(new Date(s * 1000), "dd MMM yyyy") : "—";
}

const isImageUrl = (u?: string | null) => !!u && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u);

export default function Clients() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const q = useMemo(() => clientsQuery(user?.role, user?.uid), [user?.role, user?.uid]);
  const { data: clients, loading } = useFirestoreQuery<Client>(q, [user?.role, user?.uid]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Client | null>(null);

  const canManage = user?.role === "sales_admin" || user?.role === "main_admin";

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
    return [...clients]
      .filter((c) => {
        if (!s) return true;
        if (c.name?.toLowerCase().includes(s)) return true;
        if (c.businessCategory?.toLowerCase().includes(s)) return true;
        if (sDigits && c.phone?.replace(/\D/g, "").includes(sDigits)) return true;
        return false;
      })
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  }, [clients, search]);

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
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Clients</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Every customer we've delivered to — what they bought, what they're missing, and their reviews.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Search clients by name, category, phone…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No clients yet</p>
          <p className="text-sm">Clients appear here once their work is delivered and verified.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((c) => (
            <button key={c.phoneId} onClick={() => setActive(c)}
              className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-3">
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
                <span className="font-semibold text-primary">{formatCurrency(c.totalSaleAmount || 0)}</span>
              </div>
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
    if (!member || !admin) { toast({ title: "Pick a member", description: "Select a sales member first.", variant: "destructive" }); return; }
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
    if (!member || !admin) { toast({ title: "Pick a member", description: "Select a sales member first.", variant: "destructive" }); return; }
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
      <option value="">Select sales member…</option>
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
                <p className="text-xs text-muted-foreground">Not there yet — assign a sales member to pitch:</p>
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
                    <span className="col-span-2 text-right font-medium text-primary">{formatCurrency(w.saleAmount)}</span>
                    <span className="col-span-2 truncate text-muted-foreground" title={w.soldByName}>{w.soldByName}</span>
                    <span className="col-span-3 truncate text-muted-foreground" title={w.deliveredByName || ""}>{w.deliveredByName || "—"}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-muted/30 text-xs font-semibold text-foreground">
                <span className="col-span-5">Total</span>
                <span className="col-span-2 text-right text-primary">{formatCurrency(client.totalSaleAmount || 0)}</span>
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
