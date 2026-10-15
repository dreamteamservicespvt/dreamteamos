import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { useMyLeads } from "@/hooks/useMyLeads";
import { formatCurrency } from "@/utils/formatters";
import { format, parseISO } from "date-fns";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { Lead, SaleDetail, CommissionSettlement } from "@/types";
import type { PayrollLine } from "@/types/payroll";
import { lastSettlementOf, totalPaid, memberSettlementsQuery } from "@/services/settlements";
import { isLinePaid } from "@/services/payrollRun";
import { payPeriodForDate, payPeriodLabel, currentPayMonth } from "@/utils/payrollEngine";
import {
  collectionsOf, commissionByPeriod, salesInPeriod, runningPlanEstimate,
  PLAN_ESTIMATE_SALARY_MAX, PLAN_ESTIMATE_SALES_FOR_FULL_SALARY,
} from "@/utils/salesPay";
import { commissionTermsFor, payTermsFor } from "@/utils/payTerms";
import CommissionPeriodList from "@/components/sales/CommissionPeriodList";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Target, Award, Zap, IndianRupee, Wallet, History, CheckCircle2, Search, Plus } from "lucide-react";
import AttendanceCard from "@/components/sales/AttendanceCard";
import { monthlyTargetOf } from "@/utils/salesTargets";
import { EARNINGS_PLAN_LABELS, earningsPlanLabel } from "@/utils/salesIncentive";

const PIE_COLORS = [
  "hsl(142 71% 45%)",   // success
  "hsl(217 91% 60%)",   // info
  "hsl(48 96% 47%)",    // warning
  "hsl(270 91% 65%)",   // role-main-admin
  "hsl(0 84% 60%)",     // destructive
  "hsl(240 4% 66%)",    // muted-foreground
];

/** How many completed sales are listed at a time — the first page, and each "load more". */
const SALES_PAGE = 10;

export default function MyPerformance() {
  const user = useAuthStore((s) => s.user);
  // Shared session-wide listener (see hooks/useMyLeads.ts) — not a page-local subscription.
  const { leads, loading } = useMyLeads();
  const [earningsView, setEarningsView] = useState<"option1" | "option2">("option1");
  const [saleSearch, setSaleSearch] = useState("");
  const [saleLimit, setSaleLimit] = useState(SALES_PAGE);

  const getSaleItems = (l: Lead): SaleDetail[] =>
    l.saleItems || (l.saleDetails ? [l.saleDetails] : []);

  const total = leads.length;
  const salesDoneCount = leads.filter((l) => l.saleDone).length;

  // All-time revenue (all sale items)
  const totalRevenue = leads.reduce((sum, l) =>
    sum + getSaleItems(l).reduce((s, i) => s + (i.amount || 0), 0), 0);
  const verifiedRevenue = leads.reduce((sum, l) =>
    sum + getSaleItems(l).filter((i) => i.verificationStatus === "verified").reduce((s, i) => s + (i.amount || 0), 0), 0);

  const target = monthlyTargetOf(user);

  /**
   * This cycle's verified revenue — the figure the earnings estimate below is built on.
   *
   * Two things used to be wrong here, and together they emptied the estimate. It bucketed by the
   * day the LEAD was created rather than the day the SALE was made, so a sale closed this month on
   * an older number counted for nothing; and it used the calendar month, which for the first nine
   * days of any month is not the period we are in at all. A member who had sold all through July
   * opened this page on 1 August and was told they had earned nothing.
   */
  const cycle = payPeriodForDate(new Date());
  /*
    The money COLLECTED on verified sales in this cycle — the base of the one commission rule (utils/salesPay,
    2026-10-15). It summed verified sale PRICES on the sale's day, so an advance counted its whole package and
    a balance collected this cycle on last cycle's sale counted nothing.
  */
  const monthlyVerifiedRevenue = salesInPeriod(leads, cycle.start, cycle.end).salesBase;

  /*
    The running period's terms (utils/payTerms): the plan and the target that apply NOW — the stored fields are
    the latest change, which may be one agreed for a later period.
  */
  const runningTerms = payTermsFor(user, cycle.month);
  /*
    Earnings calculations — an ESTIMATE for the running period under the ONE rule (utils/salesPay.runningPlanEstimate,
    2026-10-15): the incentive only at 75% of this period's target, as Sales Payroll pays it. It multiplied the
    period's money by 5% / 10% with no gate, promising an incentive payroll would withhold.
  */
  const MONTHLY_TARGET = PLAN_ESTIMATE_SALES_FOR_FULL_SALARY;
  const STIPEND_MAX = PLAN_ESTIMATE_SALARY_MAX;
  const estimate = useMemo(() => runningPlanEstimate({
    collections: collectionsOf(leads),
    period: cycle,
    dailyTarget: runningTerms.dailyTarget,
  }), [leads, cycle.month, runningTerms.dailyTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  const stipendAmount = estimate.option1.salary;
  const option1Total = estimate.option1.total;
  const option2Total = estimate.option2.total;
  const assignedOption = runningTerms.earningsOption;

  /**
   * Which breakdown is on screen.
   *
   * A member who has been put on a plan sees that plan and only that plan; the toggle is for the
   * unassigned, who are still choosing. `earningsView` therefore only decides anything when there
   * is no assignment to decide it for them.
   */
  const showOption1 = assignedOption ? assignedOption === "stipend_plus_5" : earningsView === "option1";
  const showOption2 = assignedOption ? assignedOption === "incentive_10" : earningsView === "option2";

  // ── Incentive settlements (what's been paid vs what's still owed) ──
  const { data: settlements } = useFirestoreQuery<CommissionSettlement>(
    useMemo(() => (user ? memberSettlementsQuery(user.uid) : null), [user?.uid]),
    [user?.uid],
  );
  // The rate of the period running now (a plan change agreed for a later period is not shown as today's).
  const commRate = commissionTermsFor(user, cycle.month).rate;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  // The periods paid with the salary in Sales Payroll — their incentive went there, not to Settlements.
  const { data: payrollLines } = useFirestoreQuery<PayrollLine>(
    useMemo(() => (user ? query(collection(db, "payroll_lines"), where("memberId", "==", user.uid)) : null), [user?.uid]),
    [user?.uid],
  );
  /*
    What is owed, by pay period, under the ONE rule Settlements pays and Sales Payroll prices (2026-10-15).
    This panel summed 5% / 10% of verified sale prices since the last settlement's "paid through" day — no
    target gate, and blind to what Sales Payroll had already paid with the salary.
  */
  const settle = useMemo(() => commissionByPeriod({
    collections: collectionsOf(leads),
    settlements: settlements.filter((s) => s.memberId === user?.uid),
    payrollPaid: new Set(payrollLines.filter((l) => isLinePaid(l)).map((l) => l.month)),
    termsFor: (period) => commissionTermsFor(user, period),
    todayStr,
  }), [leads, settlements, payrollLines, user, todayStr]);
  const lastSettlement = user ? lastSettlementOf(settlements, user.uid) : null;
  const settlePaidTotal = user ? totalPaid(settlements, user.uid) : 0;
  const settleHistory = useMemo(
    () => settlements.filter((s) => s.memberId === user?.uid).sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)),
    [settlements, user?.uid],
  );

  // Category breakdown (all sale items)
  const categoryMap: Record<string, { count: number; amount: number }> = {};
  leads.forEach((l) => {
    getSaleItems(l).forEach((item) => {
      const cat = item.category || "unknown";
      if (!categoryMap[cat]) categoryMap[cat] = { count: 0, amount: 0 };
      categoryMap[cat].count++;
      categoryMap[cat].amount += item.amount || 0;
    });
  });
  const categoryData = Object.entries(categoryMap).map(([name, v]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    sales: v.count,
    revenue: v.amount,
  }));

  // Status pie
  const statusData = [
    { name: "Sale Done", value: salesDoneCount },
    { name: "Answered", value: leads.filter((l) => l.status === "answered" && !l.saleDone).length },
    { name: "Not Answered", value: leads.filter((l) => l.status === "not_answered").length },
    { name: "Call Later", value: leads.filter((l) => l.status === "call_later").length },
    { name: "Not Interested", value: leads.filter((l) => l.status === "not_interested").length },
    { name: "Not Called", value: leads.filter((l) => l.status === "not_called").length },
  ].filter((d) => d.value > 0);

  /**
   * Completed sales, newest first, as flat rows.
   *
   * ── Why it is a list rather than a nested map in the table ────────────────────────────────────
   * One lead can hold several sale items, so the table's rows are items, not leads. Searching and
   * paging have to work on the same units the table draws — flattening once here is what lets
   * "showing 10 of 47" be a true statement, and it puts the sort in one place.
   *
   * ── Why newest first ──────────────────────────────────────────────────────────────────────────
   * The list arrives in whatever order Firestore returns the leads, which is neither chronological
   * nor stable. Cutting an arbitrary order at ten hides an arbitrary ten. A member opening this
   * table wants the sale they just made, so recency is the order and the first page is the answer
   * to the question they actually came with.
   */
  const saleRows = useMemo(() => {
    const rows = leads
      .filter((l) => l.saleDone)
      .flatMap((l) => getSaleItems(l).map((item, idx) => ({ lead: l, item, key: `${l.id}-${idx}` })));
    return rows.sort((a, b) => {
      const at = (a.item.submittedAt as { seconds?: number } | undefined)?.seconds || 0;
      const bt = (b.item.submittedAt as { seconds?: number } | undefined)?.seconds || 0;
      return bt - at;
    });
  }, [leads]);

  /**
   * Free-text search across everything the row shows.
   *
   * Matched against one lower-cased haystack per row rather than field by field, so a member can
   * type whatever they remember about the sale — the client's name, "wedding", the package, the
   * amount, or "pending" — and find it. Every token has to match, which is what makes a second
   * word narrow the list instead of widening it.
   */
  const filteredSales = useMemo(() => {
    const terms = saleSearch.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return saleRows;
    return saleRows.filter(({ lead, item }) => {
      const hay = [
        lead.displayName,
        item.category?.replace(/_/g, " "),
        item.packageKey,
        item.amount,
        item.verificationStatus || "pending",
      ].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [saleRows, saleSearch]);

  // A new search starts at the top of its own results — otherwise a search run after three
  // "load more" presses would show 40 rows of a 5-row result and read as if nothing happened.
  useEffect(() => { setSaleLimit(SALES_PAGE); }, [saleSearch]);

  const visibleSales = filteredSales.slice(0, saleLimit);
  const moreSales = filteredSales.length - visibleSales.length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">My Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">Track your sales metrics and progress</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: TrendingUp, color: "text-success" },
          { label: "Verified Revenue", value: formatCurrency(verifiedRevenue), icon: Award, color: "text-primary" },
          { label: "Conversion Rate", value: `${total > 0 ? ((salesDoneCount / total) * 100).toFixed(1) : 0}%`, icon: Zap, color: "text-warning" },
          { label: "Target Progress", value: target > 0 ? `${Math.min((totalRevenue / target) * 100, 100).toFixed(0)}%` : "No target", icon: Target, color: "text-info" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display font-bold text-2xl text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly Attendance (from daily check-in/check-out) */}
      {user && <AttendanceCard memberId={user.uid} />}

      {/* Incentive settlements (paid vs pending, from the sales admin) */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={16} className="text-primary" />
          <h2 className="font-display font-semibold text-foreground">Incentive Settlements</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/15 text-info">{commRate}%</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Paid so far</p>
            <p className="font-display font-bold text-lg text-foreground">{formatCurrency(settlePaidTotal)}</p>
          </div>
          <div className="rounded-lg bg-warning/10 p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Due</p>
            <p className="font-display font-bold text-lg text-warning" data-test="settle-due">{formatCurrency(settle.dueAmount)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Last paid</p>
            <p className="font-display font-bold text-sm text-foreground pt-1.5">{lastSettlement?.paidAt?.seconds ? format(new Date(lastSettlement.paidAt.seconds * 1000), "dd MMM") : "—"}</p>
          </div>
        </div>
        {/* Period by period: due, paid with the salary, paid in Settlements, under target, or still running. */}
        <div className="mb-3">
          <CommissionPeriodList rows={settle.rows} max={4} />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <History size={13} className="text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground">Payment history</h3>
        </div>
        {settleHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><CheckCircle2 size={12} /> No incentives paid yet.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {settleHistory.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div>
                  <span className="text-foreground font-medium">
                    {Array.isArray(s.periods) && s.periods.length > 0
                      ? s.periods.map((p) => payPeriodLabel(p).replace(/ \(.*\)$/, "")).join(", ")
                      : `${format(parseISO(s.fromDate), "dd MMM")} → ${format(parseISO(s.toDate), "dd MMM yyyy")}`}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">{s.commissionRate}% of {formatCurrency(s.salesBase)}{s.note ? ` · ${s.note}` : ""}</span>
                </div>
                <span className="font-semibold text-primary">{formatCurrency(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Earnings Estimator */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <IndianRupee size={16} className="text-primary" />
              <h2 className="font-display font-semibold text-foreground">My Earnings This Period · estimate</h2>
            </div>
            {/* Names the exact period, so "this month" can never be read as 1st–31st. */}
            <p data-test="earnings-period" className="text-xs text-muted-foreground mt-0.5">
              Estimate so far, on {formatCurrency(monthlyVerifiedRevenue)} collected on verified sales in {payPeriodLabel(currentPayMonth())}
            </p>
            {/*
              The 75% gate, said where the figures are: the period is still running, so the gate is decided when it
              ends — an incentive shown here can still go, and one at ₹0 can still come.
            */}
            <p
              data-test="earnings-gate"
              data-gate={estimate.periodTarget <= 0 ? "none" : estimate.gateMetSoFar ? "met" : "under"}
              className={`text-xs mt-0.5 ${estimate.periodTarget > 0 && !estimate.gateMetSoFar ? "text-warning" : "text-muted-foreground"}`}
            >
              {estimate.periodTarget <= 0
                ? "No target set for this period — no incentive is withheld."
                : estimate.gateMetSoFar
                  ? `75% of this period's ${formatCurrency(estimate.periodTarget)} target reached (${Math.round(estimate.achievement * 100)}%) — the incentive counts if it holds until ${format(parseISO(cycle.end), "dd MMM")}.`
                  : `Incentive not earned yet: ${Math.round(estimate.achievement * 100)}% of this period's ${formatCurrency(estimate.periodTarget)} target — ${formatCurrency(estimate.shortfall)} more by ${format(parseISO(cycle.end), "dd MMM")} reaches 75%.`}
            </p>
          </div>
          {assignedOption && (
            <span
              data-test="earnings-plan-badge"
              className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${
                assignedOption === "stipend_plus_5"
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-success/10 text-success border-success/30"
              }`}
            >
              Your Plan: {earningsPlanLabel(assignedOption)}
            </span>
          )}
        </div>

        {/*
          The toggle only exists for somebody who has NOT been put on a plan yet — for them the two
          are genuinely a choice, and seeing both is the point.

          Once a plan is assigned it is not a menu, and showing the other one was actively harmful:
          a member on Salary + 5% could open the 10% tab, read a bigger number as their earnings,
          and go to payroll with it. They now see one plan — theirs — and every figure on this card
          is money they are actually owed.
        */}
        {!assignedOption && (
          <div className="flex gap-1.5 mb-4" data-test="earnings-plan-toggle">
            <button
              onClick={() => setEarningsView("option1")}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors relative ${
                earningsView === "option1"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-accent border border-border text-muted-foreground hover:bg-accent/80"
              }`}
            >
              {EARNINGS_PLAN_LABELS.stipend_plus_5}
            </button>
            <button
              onClick={() => setEarningsView("option2")}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                earningsView === "option2"
                  ? "bg-success/15 text-success border border-success/30"
                  : "bg-accent border border-border text-muted-foreground hover:bg-accent/80"
              }`}
            >
              {EARNINGS_PLAN_LABELS.incentive_10}
            </button>
          </div>
        )}

        {/* Salary + 5% */}
        {showOption1 && (
          <div className="space-y-2" data-test="earnings-option1">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground">Salary (proportional to {formatCurrency(MONTHLY_TARGET)} target)</span>
              <span className="font-mono font-medium text-foreground">{formatCurrency(stipendAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground">
                5% Incentive on {formatCurrency(monthlyVerifiedRevenue)}
                {!estimate.gateMetSoFar && estimate.option1.incentiveBeforeTarget > 0 && (
                  <> · {formatCurrency(estimate.option1.incentiveBeforeTarget)} at 75% of target</>
                )}
              </span>
              <span data-test="earnings-option1-incentive" className="font-mono font-medium text-foreground">{formatCurrency(estimate.option1.incentive)}</span>
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="font-semibold text-foreground">Estimated total</span>
              <span className="font-display font-bold text-xl text-primary">{formatCurrency(option1Total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 mt-1">
              Salary is proportional: {formatCurrency(STIPEND_MAX)} max at {formatCurrency(MONTHLY_TARGET)} sales. At {monthlyVerifiedRevenue >= MONTHLY_TARGET ? "100%" : `${Math.round((monthlyVerifiedRevenue / MONTHLY_TARGET) * 100)}%`} you earn {formatCurrency(stipendAmount)} salary.
            </p>
          </div>
        )}

        {/* 10% Incentive */}
        {showOption2 && (
          <div className="space-y-2" data-test="earnings-option2">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground">
                10% on {formatCurrency(monthlyVerifiedRevenue)} collected on verified sales
                {!estimate.gateMetSoFar && estimate.option2.incentiveBeforeTarget > 0 && (
                  <> · {formatCurrency(estimate.option2.incentiveBeforeTarget)} at 75% of target</>
                )}
              </span>
              <span data-test="earnings-option2-incentive" className="font-mono font-medium text-foreground">{formatCurrency(option2Total)}</span>
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="font-semibold text-foreground">Estimated total</span>
              <span className="font-display font-bold text-xl text-success">{formatCurrency(option2Total)}</span>
            </div>
            {/* It said "No target required" — untrue since the 75% gate applies to both plans (utils/salesPay). */}
            <p className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 mt-1">
              10% on the money collected on verified sales — paid when the period reaches 75% of its target.
            </p>
          </div>
        )}

        {/* The comparison is only meaningful while both plans are on offer — see the toggle above. */}
        {!assignedOption && (
          <>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Option 1 ({EARNINGS_PLAN_LABELS.stipend_plus_5})</span>
              <span className="font-mono font-medium text-foreground">{formatCurrency(option1Total)}</span>
              <span className="text-muted-foreground/40">vs</span>
              <span className="font-mono font-medium text-foreground">{formatCurrency(option2Total)}</span>
              <span>Option 2 ({EARNINGS_PLAN_LABELS.incentive_10})</span>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3 italic">
              Your earnings plan hasn't been assigned yet — contact your sales admin.
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Revenue */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Revenue by Category</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--chart-tooltip-bg))", border: "1px solid hsl(var(--chart-tooltip-border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="revenue" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No sales data yet</p>
          )}
        </div>

        {/* Status Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Lead Outcomes</h2>
          {statusData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--chart-tooltip-bg))", border: "1px solid hsl(var(--chart-tooltip-border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {statusData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-muted-foreground">{d.name}</span>
                    <span className="text-xs font-mono text-foreground ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No leads yet</p>
          )}
        </div>
      </div>

      {/* Sales Table */}
      {salesDoneCount > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-foreground">Completed Sales</h2>
              {/* Said plainly, because "10 rows" with no count reads as "you have made 10 sales". */}
              <p className="text-xs text-muted-foreground mt-0.5" data-test="sales-count">
                Showing {visibleSales.length} of {filteredSales.length}
                {saleSearch.trim() && saleRows.length !== filteredSales.length ? ` matching sales (${saleRows.length} total)` : " sales"}
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
                placeholder="Search name, category, package…"
                data-test="sales-search"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-background border border-border text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-3 text-xs text-muted-foreground font-medium">Lead</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Category</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Package</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium text-right">Amount</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Submitted</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Approved</th>
                </tr>
              </thead>
              <tbody>
                {visibleSales.map(({ lead: l, item, key }) => (
                    <tr key={key} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">
                        {l.displayName}
                        {l.isCustomEntry && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Custom</span>}
                      </td>
                      <td className="p-3 text-muted-foreground capitalize">{item.category?.replace(/_/g, " ")}</td>
                      <td className="p-3 text-muted-foreground">{item.packageKey}</td>
                      <td className="p-3 text-right font-mono text-foreground">{formatCurrency(item.amount || 0)}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          item.verificationStatus === "verified"
                            ? "bg-success/15 text-success"
                            : item.verificationStatus === "rejected"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-warning/15 text-warning"
                        }`}>
                          {item.verificationStatus === "verified" ? "Verified" : item.verificationStatus === "rejected" ? "Rejected" : "Pending"}
                        </span>
                      </td>
                      <td className="p-3 text-[10px] text-muted-foreground font-mono">
                        {(item.submittedAt as any)?.seconds ? format(new Date((item.submittedAt as any).seconds * 1000), "dd MMM, hh:mm a") : "—"}
                      </td>
                      <td className="p-3 text-[10px] font-mono">
                        {item.verificationStatus === "verified" && (item.verifiedAt as any)?.seconds
                          ? <span className="text-success">{format(new Date((item.verifiedAt as any).seconds * 1000), "dd MMM, hh:mm a")}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                ))}
                {visibleSales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground" data-test="sales-no-match">
                      No sales match “{saleSearch.trim()}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Load more — ten at a time, the same page size the table opens with. */}
          {moreSales > 0 && (
            <div className="p-3 border-t border-border">
              <button
                onClick={() => setSaleLimit((n) => n + SALES_PAGE)}
                data-test="sales-load-more"
                className="w-full h-9 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <Plus size={13} />
                Load {Math.min(SALES_PAGE, moreSales)} more
                <span className="text-muted-foreground">({moreSales} left)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
