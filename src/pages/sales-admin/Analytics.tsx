import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import {
  format, startOfDay, startOfWeek, startOfMonth, isAfter,
} from "date-fns";
import type { AppUser } from "@/types";
import {
  TrendingUp, TrendingDown, Trophy, AlertTriangle, Phone, ShoppingBag,
  Target, Users, Crown, ArrowUp, ArrowDown, Minus, ArrowUpDown,
  ChevronDown, ChevronUp, Zap, Star,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { motion } from "framer-motion";

type Period = "today" | "week" | "month" | "all";
type SortBy = "score" | "revenue" | "sales" | "conversion" | "callRate" | "leads";
type SortOrder = "best" | "worst";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

const SORT_LABELS: Record<SortBy, string> = {
  score: "Score",
  revenue: "Revenue",
  sales: "Sales",
  conversion: "Conversion",
  callRate: "Call Rate",
  leads: "Leads",
};

const PIE_COLORS = [
  "hsl(var(--muted-foreground))",  // not_called
  "hsl(142.1 70.6% 45.3%)",       // answered
  "hsl(47.9 95.8% 53.1%)",        // not_answered
  "hsl(217.2 91.2% 59.8%)",       // call_later
  "hsl(0 84.2% 60.2%)",           // not_interested
];

function getGrade(score: number): { grade: string; color: string } {
  if (score >= 90) return { grade: "A+", color: "text-success bg-success/15" };
  if (score >= 75) return { grade: "A", color: "text-success bg-success/10" };
  if (score >= 55) return { grade: "B", color: "text-primary bg-primary/10" };
  if (score >= 35) return { grade: "C", color: "text-warning bg-warning/10" };
  return { grade: "D", color: "text-destructive bg-destructive/10" };
}

export default function SalesAnalytics() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("best");

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(
      onSnapshot(collection(db, "users"), (snap) => {
        const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
        setMembers(allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, "leads"), (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const memberIds = members.map((m) => m.uid);
  const teamLeads = leads.filter((l: any) => memberIds.includes(l.assignedTo));

  // Filter leads by period
  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "today") return startOfDay(now);
    if (period === "week") return startOfWeek(now, { weekStartsOn: 1 });
    if (period === "month") return startOfMonth(now);
    return null;
  }, [period]);

  const filteredLeads = useMemo(() => {
    if (!periodStart) return teamLeads;
    return teamLeads.filter((l: any) => {
      const ts = l.createdAt?.seconds;
      if (!ts) return false;
      return isAfter(new Date(ts * 1000), periodStart) || format(new Date(ts * 1000), "yyyy-MM-dd") === format(periodStart, "yyyy-MM-dd");
    });
  }, [teamLeads, periodStart]);

  // Lead status distribution
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      not_called: 0, answered: 0, not_answered: 0, call_later: 0, not_interested: 0,
    };
    filteredLeads.forEach((l: any) => {
      if (counts[l.status] !== undefined) counts[l.status]++;
    });
    return [
      { name: "Not Called", value: counts.not_called },
      { name: "Answered", value: counts.answered },
      { name: "No Answer", value: counts.not_answered },
      { name: "Call Later", value: counts.call_later },
      { name: "Not Interested", value: counts.not_interested },
    ].filter((d) => d.value > 0);
  }, [filteredLeads]);

  // Compute per-member analytics with performance score
  const rawAnalytics = useMemo(() => {
    return members.map((m) => {
      const mLeads = filteredLeads.filter((l: any) => l.assignedTo === m.uid);
      const called = mLeads.filter((l: any) => l.status !== "not_called").length;
      const uncalled = mLeads.filter((l: any) => l.status === "not_called").length;
      const answered = mLeads.filter((l: any) => l.status === "answered").length;
      const saleLeads = mLeads.filter((l: any) => l.saleDone);
      const allItems = saleLeads.flatMap((l: any) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []));
      const verifiedItems = allItems.filter((i: any) => i.verificationStatus === "verified");
      const totalRevenue = allItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);
      const verifiedRevenue = verifiedItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);
      const conversionRate = mLeads.length > 0 ? (saleLeads.length / mLeads.length) * 100 : 0;
      const callRate = mLeads.length > 0 ? (called / mLeads.length) * 100 : 0;
      const avgRevenuePerSale = allItems.length > 0 ? totalRevenue / allItems.length : 0;

      return {
        member: m,
        totalLeads: mLeads.length,
        called,
        uncalled,
        answered,
        salesCount: allItems.length,
        saleDoneLeads: saleLeads.length,
        totalRevenue,
        verifiedRevenue,
        conversionRate,
        callRate,
        avgRevenuePerSale,
        score: 0, // computed below
      };
    });
  }, [members, filteredLeads]);

  // Compute performance scores (0-100) normalized against team max
  const analytics = useMemo(() => {
    if (rawAnalytics.length === 0) return [];
    const maxRevenue = Math.max(...rawAnalytics.map((a) => a.totalRevenue), 1);
    const maxSales = Math.max(...rawAnalytics.map((a) => a.salesCount), 1);

    const scored = rawAnalytics.map((a) => {
      // Revenue contribution (40%): normalized to team max
      const revScore = (a.totalRevenue / maxRevenue) * 100;
      // Conversion rate (25%): capped at 50% as perfect
      const convScore = Math.min(a.conversionRate / 50, 1) * 100;
      // Call rate (25%): direct percentage
      const callScore = a.callRate;
      // Activity (10%): sales count normalized to max
      const activityScore = (a.salesCount / maxSales) * 100;

      const score = Math.round(revScore * 0.4 + convScore * 0.25 + callScore * 0.25 + activityScore * 0.1);
      return { ...a, score: Math.min(score, 100) };
    });

    // Sort
    const sortFn = (a: typeof scored[0], b: typeof scored[0]) => {
      const mul = sortOrder === "best" ? -1 : 1;
      switch (sortBy) {
        case "score": return (a.score - b.score) * mul;
        case "revenue": return (a.totalRevenue - b.totalRevenue) * mul;
        case "sales": return (a.salesCount - b.salesCount) * mul;
        case "conversion": return (a.conversionRate - b.conversionRate) * mul;
        case "callRate": return (a.callRate - b.callRate) * mul;
        case "leads": return (a.totalLeads - b.totalLeads) * mul;
        default: return 0;
      }
    };
    return scored.sort(sortFn);
  }, [rawAnalytics, sortBy, sortOrder]);

  // Team averages
  const teamAvg = useMemo(() => {
    if (analytics.length === 0) return { revenue: 0, sales: 0, callRate: 0, conversion: 0, score: 0, leads: 0 };
    const n = analytics.length;
    return {
      revenue: analytics.reduce((s, a) => s + a.totalRevenue, 0) / n,
      sales: analytics.reduce((s, a) => s + a.salesCount, 0) / n,
      callRate: analytics.reduce((s, a) => s + a.callRate, 0) / n,
      conversion: analytics.reduce((s, a) => s + a.conversionRate, 0) / n,
      score: analytics.reduce((s, a) => s + a.score, 0) / n,
      leads: analytics.reduce((s, a) => s + a.totalLeads, 0) / n,
    };
  }, [analytics]);

  // Totals
  const totals = useMemo(() => {
    return {
      leads: filteredLeads.length,
      called: filteredLeads.filter((l: any) => l.status !== "not_called").length,
      sales: analytics.reduce((s, a) => s + a.salesCount, 0),
      revenue: analytics.reduce((s, a) => s + a.totalRevenue, 0),
      verifiedRevenue: analytics.reduce((s, a) => s + a.verifiedRevenue, 0),
      avgScore: Math.round(teamAvg.score),
    };
  }, [filteredLeads, analytics, teamAvg]);

  // Top / bottom
  const bestSorted = [...analytics].sort((a, b) => b.score - a.score);
  const topPerformer = bestSorted.length > 0 && bestSorted[0].totalRevenue > 0 ? bestSorted[0] : null;
  const worstPerformer = bestSorted.length > 1 ? bestSorted[bestSorted.length - 1] : null;

  const underperformers = analytics.filter((a) => {
    if (a.totalLeads === 0) return false;
    return a.callRate < 50 || (a.totalLeads >= 3 && a.conversionRate < 5) || (a.totalLeads >= 5 && a.salesCount === 0);
  });

  // Chart data (always sorted best→worst for chart readability)
  const chartData = [...analytics].sort((a, b) => b.totalRevenue - a.totalRevenue).map((a) => ({
    name: a.member.name?.split(" ")[0] || "?",
    revenue: a.totalRevenue,
    sales: a.salesCount,
    leads: a.totalLeads,
    score: a.score,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 md:h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
            Deep performance insights for your sales team
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-card border border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        <StatCard icon={Users} label="Team Size" value={members.length} color="text-role-sales-member" />
        <StatCard icon={Phone} label="Total Leads" value={totals.leads} color="text-info" />
        <StatCard icon={Target} label="Called" value={totals.called} color="text-warning" />
        <StatCard icon={ShoppingBag} label="Sales" value={totals.sales} color="text-success" />
        <StatCard icon={TrendingUp} label="Revenue" value={formatCurrency(totals.revenue)} color="text-primary" />
        <StatCard icon={Zap} label="Avg Score" value={`${totals.avgScore}/100`} color="text-amber-500" />
      </div>

      {/* Top vs Bottom Comparison */}
      {topPerformer && worstPerformer && topPerformer.member.uid !== worstPerformer.member.uid && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Best */}
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-amber-500/10 to-success/5 border border-amber-500/30 rounded-xl p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Crown size={18} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-display font-bold text-foreground text-sm">{topPerformer.member.name}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-medium">Best</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getGrade(topPerformer.score).color}`}>
                    {getGrade(topPerformer.score).grade}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] md:text-xs text-muted-foreground">
                  <span>Score: <span className="font-mono font-medium text-amber-500">{topPerformer.score}</span></span>
                  <span>Rev: <span className="font-mono font-medium text-primary">{formatCurrency(topPerformer.totalRevenue)}</span></span>
                  <span>Sales: <span className="font-mono font-medium text-success">{topPerformer.salesCount}</span></span>
                  <span>Conv: <span className="font-mono font-medium text-foreground">{topPerformer.conversionRate.toFixed(1)}%</span></span>
                </div>
              </div>
            </div>
          </motion.div>
          {/* Worst */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-destructive/10 to-warning/5 border border-destructive/30 rounded-xl p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-display font-bold text-foreground text-sm">{worstPerformer.member.name}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">Needs Work</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getGrade(worstPerformer.score).color}`}>
                    {getGrade(worstPerformer.score).grade}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] md:text-xs text-muted-foreground">
                  <span>Score: <span className="font-mono font-medium text-destructive">{worstPerformer.score}</span></span>
                  <span>Rev: <span className="font-mono font-medium text-primary">{formatCurrency(worstPerformer.totalRevenue)}</span></span>
                  <span>Sales: <span className="font-mono font-medium text-success">{worstPerformer.salesCount}</span></span>
                  <span>Conv: <span className="font-mono font-medium text-foreground">{worstPerformer.conversionRate.toFixed(1)}%</span></span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue + Sales Chart */}
        {chartData.length > 0 && (
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden">
            <h3 className="font-display font-semibold text-foreground mb-4">Revenue & Sales Comparison</h3>
            <div className="overflow-x-auto">
              <div className="min-w-[300px]">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--chart-tooltip-bg))", border: "1px solid hsl(var(--chart-tooltip-border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                      formatter={(value: number, name: string) =>
                        name === "revenue" ? [formatCurrency(value), "Revenue"] : name === "score" ? [value, "Score"] : [value, name.charAt(0).toUpperCase() + name.slice(1)]
                      }
                    />
                    <Bar dataKey="revenue" name="revenue" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sales" name="sales" fill="hsl(142.1 70.6% 45.3%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="score" name="score" fill="hsl(47.9 95.8% 53.1%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Lead Status Distribution */}
        {statusDistribution.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden">
            <h3 className="font-display font-semibold text-foreground mb-4">Lead Status</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusDistribution.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--chart-tooltip-bg))", border: "1px solid hsl(var(--chart-tooltip-border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Team Averages */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="font-display font-semibold text-foreground mb-3">Team Averages</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
          <div className="bg-background border border-border rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Score</p>
            <p className="font-display font-bold text-sm text-amber-500">{teamAvg.score.toFixed(0)}/100</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Revenue</p>
            <p className="font-display font-bold text-sm text-primary">{formatCurrency(teamAvg.revenue)}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Sales</p>
            <p className="font-display font-bold text-sm text-success">{teamAvg.sales.toFixed(1)}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Call Rate</p>
            <p className="font-display font-bold text-sm text-warning">{teamAvg.callRate.toFixed(0)}%</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Conversion</p>
            <p className="font-display font-bold text-sm text-foreground">{teamAvg.conversion.toFixed(1)}%</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Leads</p>
            <p className="font-display font-bold text-sm text-info">{teamAvg.leads.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Detailed Rankings */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header with sort controls */}
        <div className="px-4 md:px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display font-semibold text-foreground">
            Performance Rankings — {PERIOD_LABELS[period]}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Order Toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === "best" ? "worst" : "best")}
              className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                sortOrder === "best"
                  ? "bg-success/10 text-success border-success/30"
                  : "bg-destructive/10 text-destructive border-destructive/30"
              }`}
            >
              {sortOrder === "best" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {sortOrder === "best" ? "Best First" : "Worst First"}
            </button>
            {/* Sort By Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-8 px-3 rounded-lg bg-background border border-border text-foreground text-xs outline-none focus:border-primary"
            >
              {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
                <option key={key} value={key}>Sort: {SORT_LABELS[key]}</option>
              ))}
            </select>
          </div>
        </div>

        {analytics.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No team members yet.</div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden p-3 space-y-2">
              {analytics.map((a, idx) => {
                const isTop = a.member.uid === topPerformer?.member.uid;
                const isUnder = underperformers.some((u) => u.member.uid === a.member.uid);
                const grade = getGrade(a.score);
                const aboveAvgRev = a.totalRevenue > teamAvg.revenue;
                return (
                  <motion.div
                    key={a.member.uid}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`bg-background border rounded-xl p-3.5 space-y-2.5 ${
                      isTop ? "border-amber-500/40" : isUnder ? "border-destructive/40" : "border-border"
                    }`}
                  >
                    {/* Name + Rank + Grade */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-sm ${
                          isTop ? "bg-amber-500/15 text-amber-500" : isUnder ? "bg-destructive/15 text-destructive" : "bg-role-sales-member/15 text-role-sales-member"
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{a.member.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${grade.color}`}>{grade.grade}</span>
                            <span className="text-[9px] font-mono text-muted-foreground">Score: {a.score}</span>
                            {isTop && <span className="text-[9px] text-amber-500 font-medium">★ Best</span>}
                            {isUnder && <span className="text-[9px] text-destructive font-medium">⚠ Low</span>}
                          </div>
                        </div>
                      </div>
                      <p className="font-display font-bold text-primary text-base">{formatCurrency(a.totalRevenue)}</p>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-1.5">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Leads</p>
                        <p className="font-mono font-medium text-xs text-foreground">{a.totalLeads}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Called</p>
                        <p className="font-mono font-medium text-xs text-foreground">{a.called}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Sales</p>
                        <p className="font-mono font-medium text-xs text-success">{a.salesCount}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Avg/Sale</p>
                        <p className="font-mono font-medium text-xs text-foreground">{a.avgRevenuePerSale > 0 ? formatCurrency(a.avgRevenuePerSale) : "—"}</p>
                      </div>
                    </div>

                    {/* Progress bars */}
                    <div className="space-y-1.5">
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">Call Rate</span>
                          <span className="flex items-center gap-1">
                            <span className={`font-mono ${a.callRate >= 70 ? "text-success" : a.callRate >= 40 ? "text-warning" : "text-destructive"}`}>
                              {a.callRate.toFixed(0)}%
                            </span>
                            {a.callRate > teamAvg.callRate ? <ArrowUp size={8} className="text-success" /> : a.callRate < teamAvg.callRate ? <ArrowDown size={8} className="text-destructive" /> : null}
                          </span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${a.callRate >= 70 ? "bg-success" : a.callRate >= 40 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${Math.min(a.callRate, 100)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">Conversion</span>
                          <span className="flex items-center gap-1">
                            <span className={`font-mono ${a.conversionRate >= 15 ? "text-success" : a.conversionRate >= 5 ? "text-warning" : "text-destructive"}`}>
                              {a.conversionRate.toFixed(1)}%
                            </span>
                            {a.conversionRate > teamAvg.conversion ? <ArrowUp size={8} className="text-success" /> : a.conversionRate < teamAvg.conversion ? <ArrowDown size={8} className="text-destructive" /> : null}
                          </span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${a.conversionRate >= 15 ? "bg-success" : a.conversionRate >= 5 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${Math.min(a.conversionRate, 100)}%` }} />
                        </div>
                      </div>
                      {/* Score bar */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">Performance Score</span>
                          <span className={`font-mono font-medium ${a.score >= 75 ? "text-success" : a.score >= 50 ? "text-warning" : "text-destructive"}`}>{a.score}/100</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${a.score >= 75 ? "bg-success" : a.score >= 50 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${a.score}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Revenue vs avg */}
                    <div className="flex items-center justify-between text-[10px] border-t border-border pt-2">
                      <span className="text-muted-foreground">vs Team Avg Revenue</span>
                      <span className={`font-mono font-medium flex items-center gap-1 ${aboveAvgRev ? "text-success" : "text-destructive"}`}>
                        {aboveAvgRev ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                        {aboveAvgRev ? "+" : ""}{formatCurrency(a.totalRevenue - teamAvg.revenue)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[850px]">
                <thead>
                  <tr className="border-b border-border bg-elevated/30">
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground text-xs w-10">#</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs">Member</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground text-xs">Grade</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground text-xs">Score</th>
                    <th className="text-right px-2 py-3 font-medium text-muted-foreground text-xs">Leads</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground text-xs">Call Rate</th>
                    <th className="text-right px-2 py-3 font-medium text-muted-foreground text-xs">Sales</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground text-xs">Conversion</th>
                    <th className="text-right px-2 py-3 font-medium text-muted-foreground text-xs">Revenue</th>
                    <th className="text-right px-2 py-3 font-medium text-muted-foreground text-xs">Avg/Sale</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground text-xs">vs Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((a, idx) => {
                    const isTop = a.member.uid === topPerformer?.member.uid;
                    const isUnder = underperformers.some((u) => u.member.uid === a.member.uid);
                    const grade = getGrade(a.score);
                    const revDiff = a.totalRevenue - teamAvg.revenue;
                    return (
                      <tr
                        key={a.member.uid}
                        className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${
                          isTop ? "bg-amber-500/5" : isUnder ? "bg-destructive/5" : idx % 2 === 1 ? "bg-elevated/20" : ""
                        }`}
                      >
                        <td className="px-2 py-3 text-center">
                          {isTop ? <Trophy size={14} className="mx-auto text-amber-500" /> : <span className="font-mono text-muted-foreground">{idx + 1}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs ${
                              isTop ? "bg-amber-500/15 text-amber-500" : isUnder ? "bg-destructive/15 text-destructive" : "bg-role-sales-member/15 text-role-sales-member"
                            }`}>
                              {a.member.name?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-foreground text-xs">{a.member.name}</p>
                              <p className="text-[10px] text-muted-foreground">{a.member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${grade.color}`}>{grade.grade}</span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`font-mono text-xs font-medium ${a.score >= 75 ? "text-success" : a.score >= 50 ? "text-warning" : "text-destructive"}`}>
                              {a.score}
                            </span>
                            <div className="w-10 h-1 bg-border rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${a.score >= 75 ? "bg-success" : a.score >= 50 ? "bg-warning" : "bg-destructive"}`}
                                style={{ width: `${a.score}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-xs">{a.totalLeads}</td>
                        <td className="px-2 py-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                            a.callRate >= 70 ? "bg-success/15 text-success" : a.callRate >= 40 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                          }`}>
                            {a.callRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-xs text-success">{a.salesCount}</td>
                        <td className="px-2 py-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                            a.conversionRate >= 15 ? "bg-success/15 text-success" : a.conversionRate >= 5 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                          }`}>
                            {a.conversionRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-xs font-medium text-primary">{formatCurrency(a.totalRevenue)}</td>
                        <td className="px-2 py-3 text-right font-mono text-xs text-muted-foreground">
                          {a.avgRevenuePerSale > 0 ? formatCurrency(a.avgRevenuePerSale) : "—"}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className={`text-[10px] font-mono font-medium inline-flex items-center gap-0.5 ${revDiff >= 0 ? "text-success" : "text-destructive"}`}>
                            {revDiff >= 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                            {revDiff >= 0 ? "+" : ""}{formatCurrency(revDiff)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-2.5 md:p-4">
      <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
        <Icon size={14} className={`${color} md:hidden`} />
        <Icon size={16} className={`${color} hidden md:block`} />
        <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className="font-display text-base md:text-xl font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
