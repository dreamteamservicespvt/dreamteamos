import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { useToday } from "@/hooks/useToday";
import { formatCurrency } from "@/utils/formatters";
import { format, parseISO } from "date-fns";
import {
  Wallet, Loader2, Search, IndianRupee, CheckCircle2, CalendarRange, ChevronRight, History, BellRing,
} from "lucide-react";
import {
  commissionRate, countPendingSales, lastSettlementOf, totalPaid, createSettlement,
  adminSettlementsQuery, adminPendingRequestsQuery, resolvePendingRequests, type SettlementRequest,
} from "@/services/settlements";
import { isLinePaid, watchMemberPayrollHistory } from "@/services/payrollRun";
import { collectionsOf, commissionByPeriod } from "@/utils/salesPay";
import { commissionTermsFor } from "@/utils/payTerms";
import { payPeriodLabel } from "@/utils/payrollEngine";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import CommissionPeriodList from "@/components/sales/CommissionPeriodList";
import type { AppUser, CommissionSettlement, Lead } from "@/types";
import type { PayrollLine } from "@/types/payroll";
import { Info } from "lucide-react";

/**
 * Settlements — the sales admin pays a member's incentives outside the salary.
 *
 * ── The rule (owner, 2026-10-15: "Payroll's rule everywhere") ──────────────────────────────────
 * This page used to pay "every sale verified since the last settlement": the whole collected amount, no
 * 75% target gate, found again by the sale's approval stamp — so revoking and re-approving a settled sale
 * paid it twice, and Sales Payroll could pay the same money with the salary. It now pays the one rule
 * (`utils/salesPay`): per ENDED pay period, the money collected in it, at the rate that applied then, only
 * when 75% of that period's target was met — never a period Sales Payroll has paid, never a collection a
 * settlement already paid. Each payment records the periods and collections it covered.
 */
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
          <Wallet className="w-3 h-3" /> Incentive payouts
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Settlements</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Pay each member's incentives by pay period, on the same rule as Sales Payroll — what one pays, the other never pays again.
        </p>
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info">{rate}% incentive</span>
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

/** "July 2026 → August 2026" — the periods a settlement paid, or its old date range. */
function settlementSpan(s: CommissionSettlement): string {
  if (Array.isArray(s.periods) && s.periods.length > 0) return s.periods.map((p) => payPeriodLabel(p).replace(/ \(.*\)$/, "")).join(", ");
  return `${format(parseISO(s.fromDate), "dd MMM")} → ${format(parseISO(s.toDate), "dd MMM yyyy")}`;
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
  const todayStr = useToday();
  const { confirm, ConfirmDialog } = useConfirm();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [lines, setLines] = useState<PayrollLine[] | null>(null);
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

  // The periods Sales Payroll has paid — their incentive went with the salary, so they are never due here.
  useEffect(() => watchMemberPayrollHistory(member.uid, setLines), [member.uid]);

  const mine = useMemo(() => settlements.filter((s) => s.memberId === member.uid), [settlements, member.uid]);
  const myHistory = useMemo(
    () => [...mine].sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)),
    [mine],
  );

  const result = useMemo(() => commissionByPeriod({
    collections: collectionsOf(leads),
    settlements: mine,
    payrollPaid: new Set((lines || []).filter((l) => isLinePaid(l)).map((l) => l.month)),
    termsFor: (period) => commissionTermsFor(member, period),
    todayStr,
  }), [leads, mine, lines, member, todayStr]);

  // Sales still awaiting approval earn nothing until approved — then they count in the period collected.
  const pendingCount = useMemo(() => countPendingSales(leads), [leads]);

  const pay = async () => {
    if (result.dueAmount <= 0 || paying) return;
    const { confirmed } = await confirm({
      title: `Pay ${member.name}'s incentives?`,
      description: `${formatCurrency(result.dueAmount)} for ${result.due.map((r) => r.label).join(", ")}. `
        + "These periods are then settled: Sales Payroll will not pay these sales again.",
      confirmText: "Mark as paid",
    });
    if (!confirmed) return;
    setPaying(true);
    try {
      await createSettlement({ member, admin, rows: result.due, note });
      if (pendingRequests.length > 0) await resolvePendingRequests(member.uid, pendingRequests).catch(() => {});
      setNote("");
      toast({ title: "Marked as paid", description: `${formatCurrency(result.dueAmount)} incentives recorded for ${member.name}.` });
    } catch {
      toast({ title: "Error", description: "Failed to record the settlement.", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const ready = !leadsLoading && lines !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !paying && onClose()}>
      {ConfirmDialog}
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">{member.name}</h3>
            <p className="text-xs text-muted-foreground">
              {commissionRate(member.earningsOption)}% incentive now · {myHistory.length} payment{myHistory.length === 1 ? "" : "s"} so far
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
          {!ready ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarRange size={15} className="text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Pay incentives</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  By pay period: the money collected in it, at the rate that applied then, once the period has ended and
                  75% of its target was met. A period Sales Payroll has paid is settled there.
                </p>

                <CommissionPeriodList rows={result.rows} />

                {result.dueAmount <= 0 ? (
                  <p className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 size={13} /> Nothing due — every ended period is paid.</p>
                ) : (
                  <div className="rounded-md bg-muted/40 p-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Due now ({result.due.length} period{result.due.length === 1 ? "" : "s"})</span>
                    <span className="text-primary font-bold text-base" data-test="settlement-due">{formatCurrency(result.dueAmount)}</span>
                  </div>
                )}

                {pendingCount > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-info/10 border border-info/30 text-info text-xs p-2.5">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {pendingCount} sale{pendingCount > 1 ? "s" : ""} still awaiting verification — {pendingCount > 1 ? "they" : "it"} count
                      in the period the money was collected once verified.
                    </span>
                  </div>
                )}

                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. paid via UPI"
                  className="w-full h-9 px-3 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />

                <button onClick={pay} disabled={paying || result.dueAmount <= 0} data-test="settlement-pay"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
                  <span>{paying ? "Recording…" : `Mark as paid${result.dueAmount > 0 ? ` — ${formatCurrency(result.dueAmount)}` : ""}`}</span>
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
                      <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="text-foreground font-medium">{settlementSpan(s)}</span>
                          <span className="block text-[10px] text-muted-foreground">{s.commissionRate}% of {formatCurrency(s.salesBase)} · {s.saleCount} sales{s.note ? ` · ${s.note}` : ""}</span>
                        </div>
                        <span className="font-semibold text-primary shrink-0">{formatCurrency(s.amount)}</span>
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
