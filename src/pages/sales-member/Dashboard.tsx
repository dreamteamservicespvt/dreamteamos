import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { Lead } from "@/types";
import { motion } from "framer-motion";
import { Phone, CheckCircle, Clock, TrendingUp, AlertCircle, LogIn, LogOut, Loader2, Send } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import SalesEarningsCard from "@/components/sales/SalesEarningsCard";
import { useSalesEarnings } from "@/hooks/useSalesEarnings";
import { payPeriodForDate, payPeriodLabel, currentPayMonth } from "@/utils/payrollEngine";
import { dailyTargetOf, monthlyTargetOf } from "@/utils/salesTargets";
import { collectedInRange } from "@/utils/salePayments";
import {
  recordCheckIn, recordCheckOut, watchTodayCheckin, buildCheckInMessage, buildCheckOutReport,
  reportWhatsAppUrl, type SalesCheckin,
} from "@/services/salesCheckin";

const statVariant = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { delay: i * 0.08 } },
});

export default function SalesMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Total pay this cycle — salary + incentives on verified sales, the same figure as My Salary.
  // Shown here as day-to-day motivation, independent of the date filter above.
  const earnings = useSalesEarnings({
    memberId: user?.uid,
    monthlySalary: user?.salary || 0,
    earningsOption: user?.earningsOption,
    // The 75% gate, so this figure is the one the member is actually owed.
    dailyTarget: dailyTargetOf(user),
  });

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Filter by date
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filtered = dateStr
    ? leads.filter((l) => {
        const ts = l.lastUpdated?.seconds || l.createdAt?.seconds;
        if (!ts) return false;
        return format(new Date(ts * 1000), "yyyy-MM-dd") === dateStr;
      })
    : leads;

  // A sale belongs to the day the MEMBER SUBMITTED it — never lead.lastUpdated, which the
  // admin's approve/reject bumps (that made a yesterday sale show up as today's sale once
  // verified today). Same submittedAt-first rule the leaderboard and settlements use.
  const saleItemDate = (item: { submittedAt?: any }, lead: Lead): string | null => {
    const ts = item.submittedAt?.seconds ?? lead.createdAt?.seconds;
    return ts ? format(new Date(ts * 1000), "yyyy-MM-dd") : null;
  };
  // Rejected sales are failed sales — excluded from every revenue/target figure (matches
  // the sales admin dashboard, so both sides always show the same numbers).
  const allSaleItems = leads.flatMap((l) =>
    (l.saleItems || (l.saleDetails ? [l.saleDetails] : []))
      .filter((item) => item.verificationStatus !== "rejected")
      .map((item) => ({ item, lead: l }))
  );

  const total = filtered.length;
  const called = filtered.filter((l) => l.status !== "not_called").length;
  const answered = filtered.filter((l) => l.status === "answered").length;
  const salesDone = filtered.filter((l) => l.saleDone).length;
  // Revenue for the selected day = items SUBMITTED that day (all items when no date picked).
  const revenueItems = dateStr
    ? allSaleItems.filter(({ item, lead }) => saleItemDate(item, lead) === dateStr)
    : allSaleItems;
  const pendingVerification = revenueItems.filter(({ item }) => item.verificationStatus === "pending").length;
  const totalRevenue = revenueItems.reduce((sum, { item }) => sum + (item.amount || 0), 0);
  const conversionRate = total > 0 ? ((salesDone / total) * 100).toFixed(1) : "0";
  // Both derived from the one stored figure — see utils/salesTargets.
  const dailyTarget = dailyTargetOf(user);
  const monthlyTarget = monthlyTargetOf(user);

  // Monthly target runs on the business pay cycle — 10th → 9th of next month (the same cycle the
  // leaderboard and every salary screen use), NOT all-time and NOT the calendar month. Taken from
  // the one pay-period function rather than rebuilt here, so it cannot drift from the rest.
  const { start: cycleStart, end: cycleEnd } = payPeriodForDate(new Date());

  /**
   * Target progress counts VERIFIED sales, with anything still waiting shown beside it.
   *
   * ── The contradiction this removes ────────────────────────────────────────────────────────
   * These cards used to count every non-rejected sale while the incentive gate on the earnings
   * card counted only verified ones, so the same cycle appeared twice on one screen with two
   * different answers — "17% achieved" above, "you are at 10%" below. A member cannot act on a
   * screen that disagrees with itself, and the half that decides their money is the verified one.
   *
   * The pending figure is not hidden: it is what turns "why is my progress lower than my sales?"
   * into a reason to chase the admin, so it is shown as its own number rather than folded in.
   */
  const inCycle = (item: { submittedAt?: any }, lead: Lead) => {
    const d = saleItemDate(item, lead);
    return d !== null && d >= cycleStart && d <= cycleEnd;
  };
  const cycleVerified = allSaleItems
    .filter(({ item }) => item.verificationStatus === "verified")
    .reduce((sum, { item, lead }) => sum + collectedInRange(item, lead, cycleStart, cycleEnd), 0);
  const cyclePending = allSaleItems
    .filter(({ item }) => item.verificationStatus !== "verified")
    .reduce((sum, { item, lead }) => sum + collectedInRange(item, lead, cycleStart, cycleEnd), 0);
  const monthlyProgress = monthlyTarget > 0 ? Math.min((cycleVerified / monthlyTarget) * 100, 100) : 0;

  /**
   * Today's number, counted exactly as the leaderboard counts it.
   *
   * Two things had to change to make the two screens agree, and both were wrong here rather than
   * there:
   *
   *  1. **Money collected, not price agreed.** The leaderboard sums PAYMENTS in the window, so a
   *     sale taken with an advance counts the advance today and the balance on the day it is
   *     collected. Summing the whole sale price on the day it was recorded put ₹19,615 next to the
   *     board's ₹14,615 for the same member on the same day.
   *  2. **Not verified-only.** A daily target is the answer to "did I hit my number today", and a
   *     sale made today has not been approved yet — it usually cannot be until tomorrow. Measuring
   *     it on verified sales made the card read ₹0 every afternoon however much somebody sold,
   *     which is worse than no card at all. The verified basis belongs to the incentive gate,
   *     where the money is decided; it does not belong here.
   */
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayRevenue = allSaleItems
    .reduce((sum, { item, lead }) => sum + collectedInRange(item, lead, todayStr, todayStr), 0);
  const todayPending = allSaleItems
    .filter(({ item }) => item.verificationStatus !== "verified")
    .reduce((sum, { item, lead }) => sum + collectedInRange(item, lead, todayStr, todayStr), 0);
  const dailyProgress = dailyTarget > 0 ? Math.min((todayRevenue / dailyTarget) * 100, 100) : 0;

  const stats = [
    { label: selectedDate ? "Active Leads" : "Total Leads", value: total, icon: Phone, color: "text-info" },
    { label: "Called", value: called, icon: Clock, color: "text-warning" },
    { label: "Answered", value: answered, icon: CheckCircle, color: "text-success" },
    { label: "Sales Done", value: salesDone, icon: TrendingUp, color: "text-primary" },
    { label: "Pending Verify", value: pendingVerification, icon: AlertCircle, color: "text-role-sales-admin" },
    /*
      All-time unless a day is picked, and it says so.

      Unlabelled, this sat directly above two cycle-based target cards showing far smaller figures,
      and read as "revenue this period" — which made the targets underneath look broken rather than
      the label look vague.
    */
    {
      label: selectedDate ? "Revenue (this day)" : "Revenue (all time)",
      value: formatCurrency(totalRevenue),
      icon: TrendingUp,
      color: "text-success",
    },
  ];

  const statusBreakdown = [
    { label: "Not Called", count: filtered.filter((l) => l.status === "not_called").length, color: "bg-muted-foreground" },
    { label: "Answered", count: answered, color: "bg-info" },
    { label: "Not Answered", count: filtered.filter((l) => l.status === "not_answered").length, color: "bg-warning" },
    { label: "Call Later", count: filtered.filter((l) => l.status === "call_later").length, color: "bg-role-main-admin" },
    { label: "Not Interested", count: filtered.filter((l) => l.status === "not_interested").length, color: "bg-destructive" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedDate ? `Activity on ${format(selectedDate, "dd/MM/yyyy")}` : `Welcome back, ${user?.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Daily check-in / check-out — drives monthly attendance */}
      {user && <CheckinCard user={{ uid: user.uid, name: user.name }} leads={leads} />}

      {/* Total earnings this cycle — salary + incentives, the same figure as My Salary. Tap to
          open the full breakdown. */}
      <SalesEarningsCard
        loading={earnings.loading}
        totalEarnings={earnings.totalEarnings}
        salaryPayable={earnings.salaryPayable}
        commission={earnings.commission}
        incentiveWithheld={earnings.incentiveWithheld}
        commissionBeforeTarget={earnings.commissionBeforeTarget}
        achievement={earnings.achievement}
        incentiveShortfall={earnings.incentiveShortfall}
        subtitle={earnings.salary.period
          ? `Cycle ${format(new Date(`${earnings.salary.period.start}T00:00:00`), "dd MMM")} – ${format(new Date(`${earnings.salary.period.end}T00:00:00`), "dd MMM")}`
          : undefined}
        onClick={() => navigate("/sales/salary")}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} {...statVariant(i)} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display font-bold text-xl text-foreground">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {(dailyTarget > 0 || monthlyTarget > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {dailyTarget > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <h2 className="font-display font-semibold text-foreground text-sm">Daily Target</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatCurrency(todayRevenue)} / {formatCurrency(dailyTarget)}
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${dailyProgress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${dailyProgress >= 100 ? "bg-success" : "bg-primary"}`}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {dailyProgress.toFixed(0)}% achieved
                {todayPending > 0 && (
                  <span className="text-warning"> · {formatCurrency(todayPending)} still to be approved</span>
                )}
              </p>
            </div>
          )}
          {monthlyTarget > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              {/*
                Stacked, not a two-column row.

                The heading names the pay period — "Monthly Target · August 2026 (10 Aug – 09 Sep)"
                — which on a phone ran straight into the figure beside it and printed
                "…(10₹78,160 /". A wrapping flex row keeps them apart at every width, and the
                figure is given its own line to sit on rather than fighting for the same one.
              */}
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h2 data-test="monthly-target-heading" className="min-w-0 font-display text-sm font-semibold text-foreground">
                  Monthly Target · {payPeriodLabel(currentPayMonth())}
                </h2>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatCurrency(cycleVerified)} / {formatCurrency(monthlyTarget)}
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${monthlyProgress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${monthlyProgress >= 100 ? "bg-success" : "bg-primary"}`}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {monthlyProgress.toFixed(0)}% achieved · cycle {format(new Date(cycleStart), "dd MMM")} → {format(new Date(cycleEnd), "dd MMM")}
                {cyclePending > 0 && (
                  <span className="text-warning"> · {formatCurrency(cyclePending)} awaiting approval, not counted yet</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Lead Status Breakdown</h2>
          <div className="space-y-3">
            {statusBreakdown.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${s.color}`} />
                <span className="text-sm text-foreground flex-1">{s.label}</span>
                <span className="text-sm font-mono text-muted-foreground">{s.count}</span>
                <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Performance</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Conversion Rate</span>
              <span className="font-display font-bold text-foreground text-lg">{conversionRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Sale Value</span>
              <span className="font-display font-bold text-foreground text-lg">
                {salesDone > 0 ? formatCurrency(totalRevenue / salesDone) : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Call Rate</span>
              <span className="font-display font-bold text-foreground text-lg">
                {total > 0 ? ((called / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Daily Check-In / Check-Out ─── */

function fmtTs(ts: any): string {
  const s = ts?.seconds;
  return s ? format(new Date(s * 1000), "hh:mm a") : "—";
}

function CheckinCard({ user, leads }: { user: { uid: string; name: string }; leads: Lead[] }) {
  const { toast } = useToast();
  const [checkin, setCheckin] = useState<SalesCheckin | null>(null);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  useEffect(() => watchTodayCheckin(user.uid, setCheckin), [user.uid]);

  const checkedIn = !!checkin?.checkInAt;
  const checkedOut = !!checkin?.checkOutAt;

  const handleCheckIn = async () => {
    setBusy("in");
    try {
      await recordCheckIn(user);
      window.open(reportWhatsAppUrl(buildCheckInMessage(user.name)), "_blank");
      toast({ title: "Checked in", description: "Check-in recorded — send the WhatsApp message that just opened." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Check-in failed.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleCheckOut = async () => {
    setBusy("out");
    try {
      const report = buildCheckOutReport(user.name, leads);
      await recordCheckOut(user, report);
      window.open(reportWhatsAppUrl(report.reportText), "_blank");
      toast({ title: "Checked out", description: "Progress report ready — send the WhatsApp message that just opened." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Check-out failed.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const resendReport = () => {
    const text = checkin?.reportText || buildCheckOutReport(user.name, leads).reportText;
    window.open(reportWhatsAppUrl(text), "_blank");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          checkedOut ? "bg-success/15 text-success" : checkedIn ? "bg-info/15 text-info" : "bg-warning/15 text-warning"
        }`}>
          {checkedOut ? <CheckCircle size={18} /> : checkedIn ? <Clock size={18} /> : <LogIn size={18} />}
        </div>
        <div className="min-w-0">
          <p className="font-display font-semibold text-foreground text-sm">
            {checkedOut ? "Day complete" : checkedIn ? "Checked in — working" : "Start your day"}
          </p>
          <p className="text-xs text-muted-foreground">
            {checkedIn ? `In: ${fmtTs(checkin?.checkInAt)}` : "Check in to mark today's attendance"}
            {checkedOut ? ` · Out: ${fmtTs(checkin?.checkOutAt)} · Sales ₹${(checkin?.totalSalesAmount || 0).toLocaleString("en-IN")}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!checkedIn && (
          <button
            onClick={handleCheckIn}
            disabled={busy !== null}
            className="h-9 px-4 rounded-lg bg-success text-white font-display font-semibold text-xs flex items-center gap-1.5 hover:bg-success/90 disabled:opacity-50 transition-colors"
          >
            {busy === "in" ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Check In
          </button>
        )}
        {checkedIn && !checkedOut && (
          <button
            onClick={handleCheckOut}
            disabled={busy !== null}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {busy === "out" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Check Out
          </button>
        )}
        {checkedOut && (
          <button
            onClick={resendReport}
            className="h-9 px-4 rounded-lg bg-accent border border-border text-foreground font-medium text-xs flex items-center gap-1.5 hover:bg-accent/80 transition-colors"
          >
            <Send size={13} /> Resend report
          </button>
        )}
      </div>
    </div>
  );
}
