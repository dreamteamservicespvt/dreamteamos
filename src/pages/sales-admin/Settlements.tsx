import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { formatCurrency } from "@/utils/formatters";
import { format, addDays, parseISO } from "date-fns";
import {
  Wallet, Loader2, Search, IndianRupee, CheckCircle2, CalendarRange, ChevronRight, History,
} from "lucide-react";
import {
  commissionRate, computeCommissionInRange, earliestVerifiedSaleDate, paidThrough, totalPaid, createSettlement,
  adminSettlementsQuery,
} from "@/services/settlements";
import { useToast } from "@/hooks/use-toast";
import type { AppUser, CommissionSettlement, Lead } from "@/types";

const today = () => format(new Date(), "yyyy-MM-dd");

export default function Settlements() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const [members, setMembers] = useState<AppUser[]>([]);
  const { data: settlements } = useFirestoreQuery<CommissionSettlement>(
    useMemo(() => (user ? adminSettlementsQuery(user.uid) : null), [user?.uid]),
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

  const visibleMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    return members.filter((m) => !s || m.name.toLowerCase().includes(s));
  }, [members, search]);

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
            const pt = paidThrough(settlements, m.uid);
            const paid = totalPaid(settlements, m.uid);
            return (
              <button key={m.uid} onClick={() => setSelected(m)}
                className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary">{m.name?.charAt(0) || "?"}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info">{rate}% commission</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Paid through {pt ? format(parseISO(pt), "dd MMM") : "—"}</span>
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
          onClose={() => setSelected(null)}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Per-member settlement modal ─────────────────────────────────────────────
function SettlementDetail({ member, admin, settlements, onClose, toast }: {
  member: AppUser;
  admin: AppUser;
  settlements: CommissionSettlement[];
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const rate = commissionRate(member.earningsOption);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [toDate, setToDate] = useState(today());
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

  const pt = paidThrough(settlements, member.uid);
  const earliest = earliestVerifiedSaleDate(leads);
  const fromDate = pt ? format(addDays(parseISO(pt), 1), "yyyy-MM-dd") : (earliest || today());
  const validRange = fromDate <= toDate;
  const range = useMemo(
    () => (validRange ? computeCommissionInRange(leads, fromDate, toDate, rate) : { base: 0, commission: 0, saleCount: 0 }),
    [leads, fromDate, toDate, rate, validRange],
  );

  const pay = async () => {
    if (!validRange || range.commission <= 0) return;
    setPaying(true);
    try {
      await createSettlement({
        member, admin, fromDate, toDate, rate,
        salesBase: range.base, amount: range.commission, saleCount: range.saleCount,
        note,
      });
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
            <p className="text-xs text-muted-foreground">{rate}% commission · paid through {pt ? format(parseISO(pt), "dd MMM yyyy") : "never"}</p>
          </div>
          <button onClick={onClose} disabled={paying} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 text-sm">Close</button>
        </div>

        <div className="p-5 space-y-5">
          {leadsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Pay the unpaid period */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarRange size={15} className="text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Pay commission</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">From (continues from last payment)</label>
                    <input type="text" value={fromDate} readOnly
                      className="w-full h-9 px-3 rounded-md bg-muted border border-border text-muted-foreground text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">To</label>
                    <input type="date" value={toDate} min={fromDate} max={today()} onChange={(e) => setToDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                  </div>
                </div>

                {!validRange ? (
                  <p className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 size={13} /> All caught up — nothing pending for this period.</p>
                ) : (
                  <div className="rounded-md bg-muted/40 p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Verified sales ({range.saleCount})</span><span className="text-foreground font-medium">{formatCurrency(range.base)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Commission @ {rate}%</span><span className="text-primary font-bold text-base">{formatCurrency(range.commission)}</span></div>
                  </div>
                )}

                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. paid via UPI"
                  className="w-full h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />

                <button onClick={pay} disabled={paying || !validRange || range.commission <= 0}
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
