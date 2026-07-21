import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { formatCurrency } from "@/utils/formatters";
import { format, parseISO } from "date-fns";
import {
  Wallet, Loader2, Search, IndianRupee, CheckCircle2, CalendarRange, ChevronRight, History, BellRing,
} from "lucide-react";
import {
  commissionRate, computeUnpaidCommission, countPendingSales, lastSettlementOf, earliestVerifiedSaleDate, totalPaid, createSettlement,
  adminSettlementsQuery, adminPendingRequestsQuery, resolvePendingRequests, type SettlementRequest,
} from "@/services/settlements";
import { useToast } from "@/hooks/use-toast";
import type { AppUser, CommissionSettlement, Lead } from "@/types";
import { Info } from "lucide-react";

const today = () => format(new Date(), "yyyy-MM-dd");

export default function Settlements() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [members, setMembers] = useState<AppUser[]>([]);
  const { data: settlements } = useFirestoreQuery<CommissionSettlement>(
    useMemo(() => (user ? adminSettlementsQuery(user.uid) : null), [user?.uid]),
    [user?.uid],
  );
  const { data: pendingRequests } = useFirestoreQuery<SettlementRequest>(
    useMemo(() => (user ? adminPendingRequestsQuery(user.uid) : null), [user?.uid]),
    [user?.uid],
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AppUser | null>(null);

  // Team members (this admin's sales members)
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "sales_member"), where("createdBy", "==", user.uid)),
      (snap) => {
        setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)).filter((m) => m.isActive !== false));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  // Deep link from a "settlement requested" notification — jump straight to that member.
  useEffect(() => {
    const memberUid = searchParams.get("member");
    if (memberUid && members.length > 0) {
      const member = members.find((m) => m.uid === memberUid);
      if (member) {
        setSelected(member);
        const next = new URLSearchParams(searchParams);
        next.delete("member");
        setSearchParams(next, { replace: true });
      }
    }
  }, [searchParams, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestedMemberIds = useMemo(() => new Set(pendingRequests.map((r) => r.memberId)), [pendingRequests]);

  const visibleMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    return members
      .filter((m) => !s || m.name.toLowerCase().includes(s))
      .sort((a, b) => Number(requestedMemberIds.has(b.uid)) - Number(requestedMemberIds.has(a.uid)));
  }, [members, search, requestedMemberIds]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Wallet className="w-3 h-3" /> Commission payouts
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Settlements</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Pay each member's commission by date range and always see what's paid vs still owed.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      {visibleMembers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No members</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleMembers.map((m) => {
            const rate = commissionRate(m.earningsOption);
            const last = lastSettlementOf(settlements, m.uid);
            const paid = totalPaid(settlements, m.uid);
            const requested = requestedMemberIds.has(m.uid);
            return (
              <button key={m.uid} onClick={() => setSelected(m)}
                className={`text-left bg-card border rounded-xl p-4 hover:shadow-md transition-all ${requested ? "border-warning/50 ring-1 ring-warning/30" : "border-border hover:border-primary/40"}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary">{m.name?.charAt(0) || "?"}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info">{rate}% commission</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </div>
                {requested && (
                  <div className="flex items-center gap-1 mb-2 text-[10px] font-semibold text-warning">
                    <BellRing className="w-3 h-3" /> Settlement requested
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Last paid {last?.paidAt?.seconds ? format(new Date(last.paidAt.seconds * 1000), "dd MMM") : "—"}</span>
                  <span className="font-semibold text-primary">{formatCurrency(paid)} paid</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && user && (
        <SettlementDetail
          member={selected}
          admin={user}
          settlements={settlements}
          pendingRequests={pendingRequests.filter((r) => r.memberId === selected.uid)}
          onClose={() => setSelected(null)}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Per-member settlement modal ─────────────────────────────────────────────
function SettlementDetail({ member, admin, settlements, pendingRequests, onClose, toast }: {
  member: AppUser;
  admin: AppUser;
  settlements: CommissionSettlement[];
  pendingRequests: SettlementRequest[];
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const rate = commissionRate(member.earningsOption);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "leads"), where("assignedTo", "==", member.uid)),
      (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead))); setLeadsLoading(false); },
      () => setLeadsLoading(false),
    );
    return unsub;
  }, [member.uid]);

  const myHistory = useMemo(
    () => settlements.filter((s) => s.memberId === member.uid).sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)),
    [settlements, member.uid],
  );

  // Timestamp-cut model: pay EVERY verified sale since the last settlement's payment moment.
  // A sale verified even a minute after the previous payout is picked up here — nothing can
  // slip through a same-day boundary the way a calendar cut allowed.
  const last = lastSettlementOf(settlements, member.uid);
  const lastPaidAtMs = (last?.paidAt?.seconds || 0) * 1000;
  const earliest = earliestVerifiedSaleDate(leads);
  const range = useMemo(
    () => computeUnpaidCommission(leads, lastPaidAtMs, rate),
    [leads, lastPaidAtMs, rate],
  );
  // Pending sales are purely informational now — they'll be paid automatically the moment
  // they're verified (they land after this cut), so nothing is ever lost.
  const pendingCount = useMemo(() => countPendingSales(leads), [leads]);

  // Human-readable window for the history record: from just after the last payout (or the
  // first verified sale) to now.
  const fromDate = last?.paidAt?.seconds
    ? format(new Date(last.paidAt.seconds * 1000), "yyyy-MM-dd")
    : (earliest || today());
  const toDate = today();

  const pay = async () => {
    if (range.commission <= 0) return;
    setPaying(true);
    try {
      await createSettlement({
        member, admin, fromDate, toDate, rate,
        salesBase: range.base, amount: range.commission, saleCount: range.saleCount,
        note,
      });
      if (pendingRequests.length > 0) await resolvePendingRequests(member.uid, pendingRequests).catch(() => {});
      setNote("");
      toast({ title: "Marked as paid", description: `${formatCurrency(range.commission)} commission recorded for ${member.name}.` });
    } catch {
      toast({ title: "Error", description: "Failed to record the settlement.", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !paying && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{member.name}</h3>
            <p className="text-xs text-muted-foreground">
              {rate}% commission · last paid {last?.paidAt?.seconds ? format(new Date(last.paidAt.seconds * 1000), "dd MMM yyyy, hh:mm a") : "never"}
            </p>
          </div>
          <button onClick={onClose} disabled={paying} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 text-sm">Close</button>
        </div>

        <div className="p-5 space-y-5">
          {pendingRequests.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs p-2.5">
              <BellRing className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{member.name} requested this settlement. Paying below will clear the request.</span>
            </div>
          )}
          {leadsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Pay everything verified since the last payout */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarRange size={15} className="text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Pay commission</h4>
                </div>

                <p className="text-xs text-muted-foreground">
                  Covers every verified sale since {last?.paidAt?.seconds
                    ? `the last payment on ${format(new Date(last.paidAt.seconds * 1000), "dd MMM yyyy, hh:mm a")}`
                    : "the member's first sale"}.
                </p>

                {range.commission <= 0 ? (
                  <p className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 size={13} /> All caught up — no unpaid verified sales.</p>
                ) : (
                  <div className="rounded-md bg-muted/40 p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Verified sales ({range.saleCount})</span><span className="text-foreground font-medium">{formatCurrency(range.base)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Commission @ {rate}%</span><span className="text-primary font-bold text-base">{formatCurrency(range.commission)}</span></div>
                  </div>
                )}

                {pendingCount > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-info/10 border border-info/30 text-info text-xs p-2.5">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {pendingCount} sale{pendingCount > 1 ? "s" : ""} still awaiting verification — {pendingCount > 1 ? "they'll" : "it'll"} be added to the next
                      payout automatically once verified. Nothing is lost by paying now.
                    </span>
                  </div>
                )}

                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. paid via UPI"
                  className="w-full h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />

                <button onClick={pay} disabled={paying || range.commission <= 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
                  <span>{paying ? "Recording…" : `Mark as paid${range.commission > 0 ? ` — ${formatCurrency(range.commission)}` : ""}`}</span>
                </button>
              </div>

              {/* History */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <History size={14} className="text-muted-foreground" />
                  <h4 className="text-sm font-semibold text-foreground">Payment history</h4>
                  <span className="text-[10px] text-muted-foreground">{myHistory.length} payments · {formatCurrency(totalPaid(settlements, member.uid))} total</span>
                </div>
                {myHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No payments yet.</p>
                ) : (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {myHistory.map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div>
                          <span className="text-foreground font-medium">{format(parseISO(s.fromDate), "dd MMM")} → {format(parseISO(s.toDate), "dd MMM yyyy")}</span>
                          <span className="block text-[10px] text-muted-foreground">{s.commissionRate}% of {formatCurrency(s.salesBase)} · {s.saleCount} sales{s.note ? ` · ${s.note}` : ""}</span>
                        </div>
                        <span className="font-semibold text-primary">{formatCurrency(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
