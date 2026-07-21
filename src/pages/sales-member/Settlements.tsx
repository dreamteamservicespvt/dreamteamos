import { useState, useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { formatCurrency } from "@/utils/formatters";
import { format, parseISO, addDays } from "date-fns";
import { Wallet, Loader2, IndianRupee, Send, CheckCircle2, Clock, History, CalendarRange } from "lucide-react";
import {
  commissionRate, computeCommissionInRange, earliestVerifiedSaleDate, paidThrough, totalPaid,
  memberSettlementsQuery, memberPendingRequestsQuery, requestSettlement, type SettlementRequest,
} from "@/services/settlements";
import { useToast } from "@/hooks/use-toast";
import type { CommissionSettlement, Lead } from "@/types";

const today = () => format(new Date(), "yyyy-MM-dd");

export default function SalesMemberSettlements() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);

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

  const rate = commissionRate(user?.earningsOption);
  const pt = paidThrough(settlements, user?.uid || "");
  const earliest = earliestVerifiedSaleDate(leads);
  const fromDate = pt ? format(addDays(parseISO(pt), 1), "yyyy-MM-dd") : (earliest || today());
  const toDate = today();
  const validRange = fromDate <= toDate;
  const current = useMemo(
    () => (validRange ? computeCommissionInRange(leads, fromDate, toDate, rate) : { base: 0, commission: 0, saleCount: 0 }),
    [leads, fromDate, toDate, rate, validRange],
  );

  const history = useMemo(
    () => [...settlements].sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)),
    [settlements],
  );
  const lastSettlement = history[0] || null;
  const alreadyRequested = pendingRequests.length > 0;

  const handleRequest = async () => {
    if (!user || !user.createdBy || current.commission <= 0 || alreadyRequested) return;
    setRequesting(true);
    try {
      await requestSettlement({
        member: user, adminId: user.createdBy, fromDate, toDate,
        amount: current.commission, saleCount: current.saleCount,
      });
      toast({ title: "Settlement requested", description: "Your admin has been notified and will review it shortly." });
    } catch {
      toast({ title: "Error", description: "Could not send the request. Try again.", variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  if (settlementsLoading || leadsLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Wallet className="w-3 h-3" /> My commission
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Settlements</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Track your commission and request your payout whenever you're ready.</p>
      </div>

      {/* Last settlement */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><History size={15} className="text-muted-foreground" /> Last settlement</h2>
        {lastSettlement ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{format(parseISO(lastSettlement.fromDate), "dd MMM")} → {format(parseISO(lastSettlement.toDate), "dd MMM yyyy")}</p>
              <p className="text-xs text-muted-foreground truncate">{lastSettlement.commissionRate}% of {formatCurrency(lastSettlement.salesBase)} · {lastSettlement.saleCount} sales{lastSettlement.note ? ` · ${lastSettlement.note}` : ""}</p>
            </div>
            <span className="font-display font-bold text-lg text-success shrink-0">{formatCurrency(lastSettlement.amount)}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No settlements paid yet.</p>
        )}
      </div>

      {/* Current unpaid period */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><CalendarRange size={15} className="text-primary" /> Current sales &amp; commission</h2>
        <p className="text-xs text-muted-foreground">Since {pt ? format(parseISO(fromDate), "dd MMM yyyy") : "your first verified sale"} · {rate}% commission plan</p>
        {!validRange || current.saleCount === 0 ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3 text-center">Nothing pending right now — you're all caught up.</p>
        ) : (
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Verified sales ({current.saleCount})</span><span className="text-foreground font-medium">{formatCurrency(current.base)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Commission @ {rate}%</span><span className="text-primary font-bold text-lg">{formatCurrency(current.commission)}</span></div>
          </div>
        )}

        {alreadyRequested ? (
          <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs p-2.5">
            <Clock size={14} className="shrink-0" /> Requested — your admin has been notified and will pay this shortly.
          </div>
        ) : (
          <button onClick={handleRequest} disabled={requesting || current.commission <= 0}
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
                  <span className="text-foreground font-medium">{format(parseISO(s.fromDate), "dd MMM")} → {format(parseISO(s.toDate), "dd MMM yyyy")}</span>
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
