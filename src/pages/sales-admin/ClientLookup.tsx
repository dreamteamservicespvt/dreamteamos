/**
 * One number, its whole story — for the sales admin.
 *
 * The question this answers is asked several times a week and had no screen: a client rings the
 * office, or two members claim the same number, or somebody wants to know whether a number has
 * been sold to before calling it. Until now the answer had to be assembled by hand from the
 * approvals queue, the duplicates tab and whichever member happened to remember.
 *
 * Everything about the number, in the order somebody asks for it:
 *   1. who holds it now, and until when
 *   2. who has ever held it — the claim / takeover / sale timeline
 *   3. every sale recorded against it, by whom, for how much, and whether it was approved
 *   4. every order the tech team built from those sales
 *
 * ── What it costs ─────────────────────────────────────────────────────────────────────────────
 * Four reads per lookup, all exact-match, and none of them run until an admin actually searches:
 * the lock doc and the client doc are fetched by id, orders by `clientPhoneId`, and leads by an
 * `in` over the handful of ways the same number gets written down. Nothing scans a collection —
 * this app runs on Firestore's free daily read budget.
 */
import { useState } from "react";
import { collection, getDoc, getDocs, doc, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { format } from "date-fns";
import {
  Search, Loader2, Phone, Lock, ShieldOff, User, ShoppingBag, IndianRupee,
  CheckCircle2, XCircle, Clock, History, AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, normalizePhone, phoneLockId } from "@/utils/phone";
import { collectedOf } from "@/utils/salePayments";
import { saleDiscountOf } from "@/utils/saleDiscount";
import { categoryLabel } from "@/utils/serviceCatalog";
import type { Client, Lead, NumberLock, Order, SaleDetail } from "@/types";

const tsMs = (ts: unknown): number => {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
};
const when = (ts: unknown, fallback = "—"): string => {
  const ms = tsMs(ts);
  return ms ? format(new Date(ms), "dd MMM yyyy, hh:mm a") : fallback;
};

const ACTION_LABEL: Record<string, string> = {
  claimed: "Added",
  taken_over: "Taken over",
  sold: "Sale made — number frozen",
  admin_override: "Lock released by admin",
};
const ACTION_TONE: Record<string, string> = {
  claimed: "bg-info",
  taken_over: "bg-warning",
  sold: "bg-success",
  admin_override: "bg-destructive",
};

const STATUS_CHIP: Record<string, string> = {
  verified: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
};

interface Result {
  phone: string;
  phoneId: string;
  lock: NumberLock | null;
  client: Client | null;
  leads: Lead[];
  orders: Order[];
  /** uid → name for the members on these leads. A lead stores only the uid. */
  memberNames: Record<string, string>;
}

const itemsOf = (lead: Lead): SaleDetail[] =>
  lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

/**
 * The forms one number gets written down in.
 *
 * Leads are keyed by whatever the member typed or pasted, so the same client exists as
 * "+919849834102", "919849834102" and "9849834102" across different rows. An equality query on one
 * of those finds one third of the history, which on this screen looks exactly like "no history".
 */
function phoneVariants(raw: string): string[] {
  const digits = phoneLockId(raw);
  if (!digits) return [];
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return [...new Set([
    `+${digits}`, digits, local, `+91${local}`, `91${local}`, `0${local}`,
  ])];
}

export default function ClientLookup() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const search = async () => {
    const phoneId = phoneLockId(input);
    if (phoneId.length < 6) {
      setError("Enter at least 6 digits of the number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const variants = phoneVariants(input);
      const [lockSnap, clientSnap, orderSnap, leadSnap] = await Promise.all([
        getDoc(doc(db, "numberLocks", phoneId)),
        getDoc(doc(db, "clients", phoneId)),
        getDocs(query(collection(db, "orders"), where("clientPhoneId", "==", phoneId))),
        getDocs(query(collection(db, "leads"), where("phone", "in", variants.slice(0, 30)))),
      ]);

      const leads = leadSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));

      /*
        A lead stores who owns it as a uid and nothing else, and "held by
        6paVxtxnh7QQl6w7Bkoo6Snzfb93" answers nobody's question. One getDoc per distinct owner —
        there are rarely more than three on a number, and a number with none costs nothing.
      */
      const ownerIds = [...new Set(leads.map((l) => l.assignedTo).filter(Boolean))];
      const ownerDocs = await Promise.all(ownerIds.map((uid) => getDoc(doc(db, "users", uid))));
      const memberNames: Record<string, string> = {};
      ownerDocs.forEach((snap, i) => {
        memberNames[ownerIds[i]] = (snap.data() as { name?: string })?.name || "Unknown member";
      });

      setResult({
        phone: normalizePhone(input),
        phoneId,
        lock: lockSnap.exists() ? (lockSnap.data() as NumberLock) : null,
        client: clientSnap.exists() ? (clientSnap.data() as Client) : null,
        memberNames,
        leads,
        orders: orderSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Order))
          .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const memberName = (uid: string) => result?.memberNames[uid] || uid;

  /** Every sale ever recorded against the number, newest first, with who took it. */
  const saleRows = (result?.leads || [])
    .flatMap((lead) => itemsOf(lead).map((item, idx) => ({ lead, item, idx })))
    .sort((a, b) => tsMs(b.item.submittedAt) - tsMs(a.item.submittedAt));

  const totalCollected = saleRows
    .filter(({ item }) => item.verificationStatus !== "rejected")
    .reduce((sum, { item, lead }) => sum + collectedOf(item, lead), 0);

  const frozenUntilMs = tsMs(result?.lock?.saleFrozenUntil);
  const stillFrozen = !!result?.lock?.saleFrozen && frozenUntilMs > Date.now();

  return (
    <div className="space-y-5 pb-8">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/25 p-4 shadow-sm md:p-5">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <History className="h-3 w-3" /> One number, its whole story
        </div>
        <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">Client Lookup</h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          Search any client number to see who holds it, everyone who has ever held it, every sale
          recorded against it and every order built from those sales.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="tel"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="Client number — any format (+91 98498 34102, 9849834102…)"
            data-test="client-lookup-input"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => void search()}
          disabled={loading}
          data-test="client-lookup-search"
          className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {result && (
        <div className="space-y-4" data-test="client-lookup-result">
          {/* ── Who holds it now ── */}
          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
                  <Phone className="h-4 w-4 text-primary" /> {formatPhoneDisplay(result.phone)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {result.client?.name || result.leads[0]?.displayName || "No name on record"}
                  {result.client?.businessCategory ? ` · ${result.client.businessCategory}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {result.lock ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2.5 py-1 text-[11px] font-semibold text-info">
                    <User className="h-3 w-3" /> Held by {result.lock.ownerName}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    <ShieldOff className="h-3 w-3" /> Never claimed
                  </span>
                )}
                {stillFrozen && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning">
                    <Lock className="h-3 w-3" /> Frozen till {format(new Date(frozenUntilMs), "dd MMM")}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Sales recorded", String(saleRows.length)],
                ["Approved", String(saleRows.filter((r) => r.item.verificationStatus === "verified").length)],
                ["Collected", formatCurrency(totalCollected)],
                ["Orders", String(result.orders.length)],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-background px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-display text-base font-bold tabular-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {result.leads.length > 1 && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                This number is on {result.leads.length} lead cards
                {" — "}
                {[...new Set(result.leads.map((l) => memberName(l.assignedTo)))].join(", ")}.
              </p>
            )}
          </section>

          {/* ── Everyone who has ever held it ── */}
          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <History className="h-4 w-4 text-primary" /> Hold history
            </h2>
            {result.lock?.timeline?.length ? (
              <ol className="space-y-2.5">
                {[...result.lock.timeline]
                  .sort((a, b) => tsMs(b.at) - tsMs(a.at))
                  .map((entry, i) => (
                    <li key={i} className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTION_TONE[entry.action] || "bg-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">
                          {ACTION_LABEL[entry.action] || entry.action}
                          <span className="ml-1 font-normal text-muted-foreground">by {entry.byName}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {when(entry.at)}
                          {entry.freezeDays ? ` · frozen ${entry.freezeDays} day${entry.freezeDays === 1 ? "" : "s"}` : ""}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">
                No lock history — this number was never claimed through the lock system.
              </p>
            )}
          </section>

          {/* ── Every sale against it ── */}
          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <IndianRupee className="h-4 w-4 text-success" /> Sales ({saleRows.length})
            </h2>
            {saleRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing has been sold to this number.</p>
            ) : (
              <div className="space-y-2">
                {saleRows.map(({ lead, item, idx }) => {
                  const discount = saleDiscountOf(item);
                  const collected = collectedOf(item, lead);
                  const status = item.verificationStatus || "pending";
                  return (
                    <div key={`${lead.id}_${idx}`} data-test="lookup-sale-row"
                      className="rounded-xl border border-border bg-background p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 text-sm font-semibold text-foreground">
                          {categoryLabel(item.category)}
                          {item.requirement?.businessName && (
                            <span className="ml-1 font-normal text-muted-foreground">· {item.requirement.businessName}</span>
                          )}
                        </p>
                        <span className="shrink-0 font-mono text-sm font-bold text-foreground">
                          {formatCurrency(item.amount || 0)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_CHIP[status] || "bg-muted text-muted-foreground"}`}>
                          {status === "verified" ? "Approved" : status === "rejected" ? "Rejected" : "Pending"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3" /> {memberName(lead.assignedTo)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {when(item.submittedAt)}
                        </span>
                        {discount.amount > 0 && (
                          <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">
                            {discount.label}
                          </span>
                        )}
                        {/* Collected is the figure every incentive and target is counted on, so it
                            is printed next to the price rather than left to be worked out. */}
                        <span className={`inline-flex items-center gap-1 font-medium ${collected >= (item.amount || 0) ? "text-success" : "text-warning"}`}>
                          {collected >= (item.amount || 0) ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {formatCurrency(collected)} collected
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── What the tech team built ── */}
          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <ShoppingBag className="h-4 w-4 text-primary" /> Orders ({result.orders.length})
            </h2>
            {result.orders.length === 0 ? (
              <p className="text-xs text-muted-foreground">No order has reached the tech team for this number.</p>
            ) : (
              <div className="space-y-2">
                {result.orders.map((o) => (
                  <div key={o.id} data-test="lookup-order-row"
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-border bg-background p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {categoryLabel(o.category)}
                        {o.businessName && <span className="ml-1 font-normal text-muted-foreground">· {o.businessName}</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Sold by {o.soldByName} · {when(o.createdAt)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      o.status === "verified" ? "bg-success/15 text-success"
                        : o.status === "completed" ? "bg-info/15 text-info"
                          : o.status === "cancelled" ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                    }`}>
                      {o.status === "verified" ? "Delivered" : o.status === "assigned" ? "With tech" : o.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {saleRows.length === 0 && result.orders.length === 0 && !result.lock && (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4" /> Nothing on record for this number.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
