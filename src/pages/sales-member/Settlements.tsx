import { useEffect, useState, useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { useToday } from "@/hooks/useToday";
import { formatCurrency } from "@/utils/formatters";
import { format, parseISO } from "date-fns";
import { Wallet, Loader2, IndianRupee, Send, CheckCircle2, Clock, History, CalendarRange } from "lucide-react";
import {
  commissionRate, countPendingSales, lastSettlementOf, totalPaid,
  memberSettlementsQuery, memberPendingRequestsQuery, requestSettlement, type SettlementRequest,
} from "@/services/settlements";
import { isLinePaid, watchMemberPayrollHistory } from "@/services/payrollRun";
import { collectionsOf, commissionByPeriod } from "@/utils/salesPay";
import { commissionTermsFor } from "@/utils/payTerms";
import { payPeriodLabel } from "@/utils/payrollEngine";
import { useToast } from "@/hooks/use-toast";
import CommissionPeriodList from "@/components/sales/CommissionPeriodList";
import type { CommissionSettlement, Lead } from "@/types";
import type { PayrollLine } from "@/types/payroll";

/**
 * A sales member's own incentive payouts.
 *
 * Since 2026-10-15 the figure is the one commission rule (`utils/salesPay`, the owner's "Payroll's rule
 * everywhere"): by pay period, the money collected in it, at the rate that applied then, once the period
 * has ended and 75% of its target was met — the same figure the sales admin's Settlements pays, and never
 * a period already paid with the salary in Sales Payroll.
 */
export default function SalesMemberSettlements() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const todayStr = useToday();
  const [requesting, setRequesting] = useState(false);
  const [lines, setLines] = useState<PayrollLine[] | null>(null);

  const { data: settlements, loading: settlementsLoading } = useFirestoreQuery<CommissionSettlement>(
    useMemo(() => (user ? memberSettlementsQuery(user.uid) : null), [user?.uid]),
    [user?.uid],
  );
  const { data: pendingRequests } = useFirestoreQuery<SettlementRequest>(
    useMemo(() => (user ? memberPendingRequestsQuery(user.uid) : null), [user?.uid]),
    [user?.uid],
  );
  const { data: leads, loading: leadsLoading } = useFirestoreQuery<Lead>(
    useMemo(() => (user ? query(collection(db, "leads"), where("assignedTo", "==", user.uid)) : null), [user?.uid]),
    [user?.uid],
  );
  // The periods paid with the salary in Sales Payroll — their incentive went there.
  useEffect(() => {
    if (!user?.uid) return;
    return watchMemberPayrollHistory(user.uid, setLines);
  }, [user?.uid]);

  const rate = commissionRate(user?.earningsOption);

  const history = useMemo(
    () => [...settlements].sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)),
    [settlements],
  );
  const lastSettlement = lastSettlementOf(settlements, user?.uid || "");
  const alreadyRequested = pendingRequests.length > 0;

  const result = useMemo(() => commissionByPeriod({
    collections: collectionsOf(leads),
    settlements,
    payrollPaid: new Set((lines || []).filter((l) => isLinePaid(l)).map((l) => l.month)),
    termsFor: (period) => commissionTermsFor(user, period),
    todayStr,
  }), [leads, settlements, lines, user, todayStr]);
  const pendingCount = useMemo(() => countPendingSales(leads), [leads]);

  const handleRequest = async () => {
    if (!user || !user.createdBy || result.dueAmount <= 0 || alreadyRequested) return;
    const due = [...result.due].sort((a, b) => a.period.localeCompare(b.period));
    setRequesting(true);
    try {
      await requestSettlement({
        member: user, adminId: user.createdBy,
        fromDate: due[0].start, toDate: due[due.length - 1].end,
        amount: result.dueAmount, saleCount: due.reduce((s, r) => s + r.saleCount, 0),
      });
      toast({ title: "Settlement requested", description: "Your admin has been notified and will review it shortly." });
    } catch {
      toast({ title: "Error", description: "Could not send the request. Try again.", variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  if (settlementsLoading || leadsLoading || lines === null) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const span = (s: CommissionSettlement) => (Array.isArray(s.periods) && s.periods.length > 0
    ? s.periods.map((p) => payPeriodLabel(p).replace(/ \(.*\)$/, "")).join(", ")
    : `${format(parseISO(s.fromDate), "dd MMM")} → ${format(parseISO(s.toDate), "dd MMM yyyy")}`);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Wallet className="w-3 h-3" /> My incentives
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Settlements</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Track your incentives by pay period and request a payout once a period has ended.</p>
      </div>

      {/* Last settlement */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><History size={15} className="text-muted-foreground" /> Last settlement</h2>
        {lastSettlement ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{span(lastSettlement)}</p>
              <p className="text-xs text-muted-foreground truncate">{lastSettlement.commissionRate}% of {formatCurrency(lastSettlement.salesBase)} · {lastSettlement.saleCount} sales{lastSettlement.note ? ` · ${lastSettlement.note}` : ""}</p>
            </div>
            <span className="font-display font-bold text-lg text-success shrink-0">{formatCurrency(lastSettlement.amount)}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No settlements paid yet.</p>
        )}
      </div>

      {/* By pay period */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><CalendarRange size={15} className="text-primary" /> My incentives by pay period</h2>
        <p className="text-xs text-muted-foreground">
          The money you collected in each period · {rate}% plan now · paid once the period has ended and you reached 75% of its target
          {pendingCount > 0 && (
            <span className="block mt-0.5">{pendingCount} sale{pendingCount > 1 ? "s" : ""} still pending verification will count in the period you collected the money, once approved.</span>
          )}
        </p>
        <CommissionPeriodList rows={result.rows} />
        {result.dueAmount <= 0 ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3 text-center">Nothing due right now — you're all caught up.</p>
        ) : (
          <div className="rounded-lg bg-muted/40 p-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Due to you ({result.due.length} period{result.due.length === 1 ? "" : "s"})</span>
            <span className="text-primary font-bold text-lg" data-test="member-settlement-due">{formatCurrency(result.dueAmount)}</span>
          </div>
        )}

        {alreadyRequested ? (
          <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs p-2.5">
            <Clock size={14} className="shrink-0" /> Requested — your admin has been notified and will pay this shortly.
          </div>
        ) : (
          <button onClick={handleRequest} disabled={requesting || result.dueAmount <= 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {requesting ? "Sending…" : "Request settlement"}
          </button>
        )}
      </div>

      {/* Full history */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><IndianRupee size={15} className="text-muted-foreground" /> Payment history</h2>
          <span className="text-[10px] text-muted-foreground">{history.length} payment{history.length === 1 ? "" : "s"} · {formatCurrency(totalPaid(settlements, user?.uid || ""))} total</span>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {history.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-xs gap-2">
                <div className="min-w-0">
                  <span className="text-foreground font-medium">{span(s)}</span>
                  <span className="block text-[10px] text-muted-foreground truncate">{s.commissionRate}% of {formatCurrency(s.salesBase)} · {s.saleCount} sales{s.note ? ` · ${s.note}` : ""}</span>
                </div>
                <span className="font-semibold text-primary flex items-center gap-1 shrink-0"><CheckCircle2 size={12} className="text-success" /> {formatCurrency(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
