/**
 * Feedback & Upsell, as the people above the seller need to see it.
 *
 * ── Why an admin needs this at all ───────────────────────────────────────────────────────────
 * A sales member has this on their own Clients page, where it belongs — the call is theirs to make.
 * What nobody had was the view across it: which delivered jobs have been asked about, what clients
 * are actually saying about the work, and which sellers are sitting on a book of delivered
 * customers nobody has rung. The two ratings are about two different departments — the WORK is the
 * tech team's, the SERVICE is ours — which is why the tech admin and the team leader can read every
 * word of it, and why neither of them can enter one (see `canRecordFeedback`).
 *
 * ── Why you open a member first ──────────────────────────────────────────────────────────────
 * Because the alternative is reading every order in the company to build one screen. This project
 * runs on the Firebase free tier and a cross-member scan of orders is precisely the query that
 * exhausts a day's read budget before lunch. So the landing view is the (small) list of sellers,
 * and one seller's orders are subscribed to only while their book is open.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  ArrowLeft, Contact, Loader2, MessageCircle, Search, Sparkles, Users,
} from "lucide-react";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import SaleFeedbackCard from "@/components/sales/SaleFeedbackCard";
import { feedbackComplete, type AppUser, type Order } from "@/types";

/** Epoch ms from any of the timestamp shapes this data has carried over time. */
function msOf(ts: unknown): number {
  const t = ts as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

/** One customer of one seller, with every delivered job of theirs. */
interface ClientGroup {
  phoneId: string;
  phone: string;
  name: string;
  orders: Order[];
  due: number;
}

export default function FeedbackUpsell() {
  const user = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [open, setOpen] = useState<AppUser | null>(null);
  const [search, setSearch] = useState("");

  /**
   * The sellers. Queried by role rather than by reading the whole users collection, and scoped for
   * a sales admin to their own team — an admin looking at another admin's team is not a view this
   * app has anywhere else, and adding it here by accident would be a surprise.
   */
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "sales_member")),
      (snap) => {
        const all = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
        setMembers(
          user.role === "sales_admin"
            ? all.filter((m) => m.createdBy === user.uid)
            : all,
        );
        setLoadingMembers(false);
      },
      () => setLoadingMembers(false),
    );
    return unsub;
  }, [user?.uid, user?.role]);

  const visibleMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? members.filter((m) => (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q))
      : members;
    return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [members, search]);

  if (open) return <MemberBook member={open} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-lg font-bold text-foreground md:text-2xl">Feedback &amp; Upsell</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Open a sales member to see every job they have delivered, what the client said about it, and
          which of them are ready to be sold something else.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a sales member…"
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      {loadingMembers ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visibleMembers.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No sales members{search ? " match that" : " yet"}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMembers.map((m) => (
            <button
              key={m.uid}
              data-test="feedback-member-card"
              onClick={() => setOpen(m)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display font-bold text-primary">
                {m.name?.charAt(0)?.toUpperCase() || "?"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">{m.name || "Unnamed"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{m.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One seller's delivered book.
 *
 * Subscribed only while it is open, and only to that seller's orders — the same `soldBy` query the
 * member's own Clients page uses, so this costs exactly what one member's page costs and nothing
 * for the members nobody opened.
 */
function MemberBook({ member, onBack }: { member: AppUser; onBack: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyDue, setOnlyDue] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, "orders"), where("soldBy", "==", member.uid)),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [member.uid]);

  /**
   * Delivered jobs, grouped by customer, newest customer first.
   *
   * Grouped because the call is to a PERSON, not to an order: a client with three delivered ads is
   * one phone call about three ads, and a flat list of orders would have the member dial them three
   * times. Read from the order's own status rather than from any client document — that document is
   * written when work ships, by a write that can fail, and this view must not inherit that failure.
   */
  const groups = useMemo<ClientGroup[]>(() => {
    const byClient = new Map<string, ClientGroup>();
    for (const o of orders) {
      if (o.status !== "completed" && o.status !== "verified") continue;
      const key = o.clientPhoneId || (o.clientPhone || "").replace(/[^0-9]/g, "");
      if (!key) continue;
      const g = byClient.get(key) || {
        phoneId: key,
        phone: o.clientPhone || key,
        name: o.clientName || o.businessName || "",
        orders: [],
        due: 0,
      };
      g.orders.push(o);
      if (!feedbackComplete(o.feedback)) g.due += 1;
      byClient.set(key, g);
    }
    const list = Array.from(byClient.values());
    for (const g of list) {
      g.orders.sort((a, b) => msOf(b.completedAt || b.verifiedAt) - msOf(a.completedAt || a.verifiedAt));
    }
    // Newest delivery first: the client they most recently shipped to is the one to ring today.
    return list.sort((a, b) =>
      msOf(b.orders[0]?.completedAt || b.orders[0]?.verifiedAt) -
      msOf(a.orders[0]?.completedAt || a.orders[0]?.verifiedAt));
  }, [orders]);

  const shown = onlyDue ? groups.filter((g) => g.due > 0) : groups;
  const totalDue = groups.reduce((n, g) => n + g.due, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All members
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold text-foreground">{member.name}</h1>
          <p className="text-xs text-muted-foreground">
            {groups.length} delivered {groups.length === 1 ? "client" : "clients"}
            {totalDue > 0 ? ` · ${totalDue} still to ask about` : " · all asked about"}
          </p>
        </div>
        <button
          onClick={() => setOnlyDue((v) => !v)}
          data-test="feedback-only-due"
          className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
            onlyDue ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" /> Only ones to ask about
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <Contact className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {onlyDue ? "Every delivered job here has been asked about." : "Nothing of theirs has been delivered yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((g) => (
            <div key={g.phoneId} data-test="feedback-client-group" className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display font-bold text-primary">
                  {g.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{g.name || "Unnamed"}</p>
                  <a
                    href={getWhatsAppUrl(g.phone)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400"
                  >
                    <MessageCircle className="h-3 w-3" /> {formatPhoneDisplay(g.phone)}
                  </a>
                </div>
                <span className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatCurrency(g.orders.reduce((n, o) => n + (o.amount || 0), 0))}
                  </span>
                  {g.due > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <MessageCircle className="h-2.5 w-2.5" /> {g.due} to ask about
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                      <Sparkles className="h-2.5 w-2.5" /> Ready to upsell
                    </span>
                  )}
                </span>
              </div>
              <div className="space-y-2">
                {/*
                  No `onUpsell` here, deliberately. Starting an upsell claims the number to whoever
                  presses it, so an admin doing so would take the client off the member who owns
                  them. The card says as much in place of the button.
                */}
                {g.orders.map((o) => <SaleFeedbackCard key={o.id} order={o} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
