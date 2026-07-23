import { useState, useEffect, useMemo, useRef } from "react";
import { fetchTeamMembers, subscribeTeamLeads } from "@/services/teamLeads";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format, eachDayOfInterval, subDays, startOfDay, differenceInCalendarDays } from "date-fns";
import type { AppUser } from "@/types";
import { Users, Phone, ShoppingBag, TrendingUp, Target, Award, CheckCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import PeriodFilterBar from "@/components/dashboard/PeriodFilterBar";
import { defaultPeriodFilter, periodBounds, periodLabel, withinPeriod, type PeriodFilter } from "@/utils/periodFilter";
import { motion } from "framer-motion";
import { processScheduledPools } from "@/services/scheduleRelease";
import { useToast } from "@/hooks/use-toast";

/**
 * How many selling days the selected period has actually reached.
 *
 * Bounded by today, so a mid-month view isn't judged against the whole month's target — on the
 * 5th of July the team is measured against 5 days, not 31.
 */
function targetDaysIn(filter: PeriodFilter): number {
  const bounds = periodBounds(filter);
  if (!bounds) return 1;                                    // Career — fall back to a daily target.

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const to = bounds.to > todayStr ? todayStr : bounds.to;
  if (to < bounds.from) return 0;                           // Period is entirely in the future.

  const days = differenceInCalendarDays(
    new Date(`${to}T00:00:00`),
    new Date(`${bounds.from}T00:00:00`),
  ) + 1;
  return Math.max(1, days);
}

export default function SalesAdminDashboard() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>(defaultPeriodFilter);
  const { toast } = useToast();
  const autoReleaseRan = useRef(false);

  useEffect(() => {
    if (!currentUser?.uid) return;
    // Quota-friendly: one-time team fetch + leads listener scoped to the team only.
    let unsubLeads: (() => void) | undefined;
    let cancelled = false;
    fetchTeamMembers(currentUser.uid).then((myMembers) => {
      if (cancelled) return;
      setMembers(myMembers);
      unsubLeads = subscribeTeamLeads(myMembers.map((m) => m.uid), (teamLeads) => {
        setLeads(teamLeads);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
    return () => { cancelled = true; unsubLeads?.(); };
  }, [currentUser?.uid]);

  // Auto-release scheduled pools once per dashboard load
  useEffect(() => {
    if (!currentUser?.uid || autoReleaseRan.current) return;
    autoReleaseRan.current = true;
    processScheduledPools(currentUser.uid).then((result) => {
      if (result.released > 0) {
        toast({ title: "Auto-Release", description: `${result.released} scheduled numbers released to members.` });
      }
    }).catch(() => { /* silent fail */ });
  }, [currentUser?.uid]);

  const memberIds = members.map((m) => m.uid);
  const teamLeads = leads.filter((l: any) => memberIds.includes(l.assignedTo));

  // Career / This Month / Day / Range — the same control the tech dashboard uses, so a period
  // means the same span on both sides of the business.
  const filteredLeads = useMemo(
    () => teamLeads.filter((l: any) => {
      const ts = l.lastUpdated?.seconds || l.createdAt?.seconds;
      if (!ts) return period.mode === "career";
      return withinPeriod(format(new Date(ts * 1000), "yyyy-MM-dd"), period);
    }),
    [teamLeads, period],
  );

  // A sale belongs to the day the member SUBMITTED it — never lead.lastUpdated, which
  // approving/rejecting bumps (that made a yesterday sale count as today once verified today).
  const saleItemDate = (item: any, lead: any): string | null => {
    const ts = item.submittedAt?.seconds ?? lead.createdAt?.seconds;
    return ts ? format(new Date(ts * 1000), "yyyy-MM-dd") : null;
  };
  // REJECTED sales are failed sales — they must never count toward sales/revenue numbers.
  const teamSaleItems = teamLeads.flatMap((l: any) =>
    (l.saleItems || (l.saleDetails ? [l.saleDetails] : []))
      .filter((item: any) => item.verificationStatus !== "rejected")
      .map((item: any) => ({ item, lead: l }))
  );
  const dateSaleItems = useMemo(
    () => teamSaleItems.filter(({ item, lead }: any) => withinPeriod(saleItemDate(item, lead) ?? undefined, period)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamLeads, period],
  );

  // Sales Closed = sale items SUBMITTED in the period (not leads whose lastUpdated happens
  // to fall in it — approval bumps lastUpdated and was shifting yesterday's sales to today).
  const salesClosed = dateSaleItems.length;
  const totalRevenue = dateSaleItems.reduce((s: number, { item }: any) => s + (item.amount || 0), 0);
  const called = filteredLeads.filter((l: any) => l.status !== "not_called").length;
  const pendingApprovals = dateSaleItems.filter(({ item }: any) => item.verificationStatus === "pending").length;

  const chartData = members.map((m) => {
    const mLeads = filteredLeads.filter((l: any) => l.assignedTo === m.uid);
    const mItems = dateSaleItems.filter(({ lead }: any) => lead.assignedTo === m.uid);
    return {
      name: m.name?.split(" ")[0] || "?",
      leads: mLeads.length,
      sales: mItems.length,
      revenue: mItems.reduce((s: number, { item }: any) => s + (item.amount || 0), 0),
    };
  });

  /**
   * Per-member performance for the selected period.
   *
   * The target line adapts to the period rather than always meaning "today": in Day mode it is
   * the daily target, otherwise it's the daily target multiplied by the selling days the period
   * has actually reached. Comparing a month's revenue against a single day's target would make
   * everyone look like a hero, which is worse than showing nothing.
   */
  const memberPerformance = useMemo(() => {
    const targetDays = targetDaysIn(period);

    return members.map((m) => {
      const dailyTarget = m.dailyTarget || m.target || 10000;
      const memberLeads = filteredLeads.filter((l: any) => l.assignedTo === m.uid);
      const memberItems = dateSaleItems.filter(({ lead }: any) => lead.assignedTo === m.uid);

      const allItems = memberItems.map(({ item }: any) => item);
      const verifiedItems = allItems.filter((item: any) => item.verificationStatus === "verified");
      const totalRev = allItems.reduce((s: number, item: any) => s + (item.amount || 0), 0);
      const verifiedRev = verifiedItems.reduce((s: number, item: any) => s + (item.amount || 0), 0);

      // Group by the day each item was SUBMITTED (not lead.lastUpdated, which approving bumps)
      // to count how many days they hit their target.
      const revenueByDay: Record<string, number> = {};
      memberItems.forEach(({ item, lead }: any) => {
        const day = saleItemDate(item, lead);
        if (!day) return;
        revenueByDay[day] = (revenueByDay[day] || 0) + (item.amount || 0);
      });

      const daysReachedTarget = Object.values(revenueByDay).filter((rev) => rev >= dailyTarget).length;
      const totalActiveDays = Object.keys(revenueByDay).length;

      const periodTarget = dailyTarget * targetDays;
      const periodProgress = periodTarget > 0 ? Math.min((totalRev / periodTarget) * 100, 100) : 0;

      const saleLeadCount = new Set(memberItems.map(({ lead }: any) => lead.id ?? lead.phone)).size;

      return {
        member: m,
        totalRevenue: totalRev,
        verifiedRevenue: verifiedRev,
        totalSales: allItems.length,
        totalLeads: memberLeads.length,
        dailyTarget,
        periodTarget,
        periodRevenue: totalRev,
        periodProgress,
        daysReachedTarget,
        totalActiveDays,
        conversionRate: memberLeads.length > 0 ? ((saleLeadCount / memberLeads.length) * 100) : 0,
      };
    });
  }, [members, filteredLeads, dateSaleItems, period]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 md:h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Sales Dashboard</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">
          Your team's performance for {periodLabel(period).toLowerCase()}
        </p>
      </div>

      {/* One filter for the whole page — headline stats, member performance and the summary
          table all read from it, so the numbers can never disagree about the period. */}
      <PeriodFilterBar value={period} onChange={setPeriod} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
        <StatBox icon={Users} label="Team Members" value={members.length} color="text-role-sales-member" />
        <StatBox icon={Phone} label={period.mode === "career" ? "Total Leads" : "Active Leads"} value={filteredLeads.length} color="text-info" />
        <StatBox icon={Target} label="Called" value={called} color="text-warning" />
        <StatBox icon={ShoppingBag} label="Sales Closed" value={salesClosed} color="text-success" />
        <StatBox icon={TrendingUp} label="Revenue" value={formatCurrency(totalRevenue)} color="text-primary" />
      </div>

      {pendingApprovals > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
          <ShoppingBag size={18} className="text-warning" />
          <p className="text-sm text-warning font-medium">
            {pendingApprovals} sale{pendingApprovals > 1 ? "s" : ""} pending your approval
          </p>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden">
          <h3 className="font-display font-semibold text-foreground mb-4">Team Performance</h3>
          <div className="overflow-x-auto">
            <div className="min-w-[300px]">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--chart-tooltip-bg))", border: "1px solid hsl(var(--chart-tooltip-border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="leads" name="Leads" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales" name="Sales" fill="hsl(142.1 70.6% 45.3%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Member Performance Cards */}
      <div>
        <h3 className="font-display font-semibold text-foreground mb-4">Member Performance & Daily Target</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {memberPerformance.map((mp) => {
            const isOnTrack = mp.periodProgress >= 100;
            return (
              <motion.div
                key={mp.member.uid}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-5 space-y-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-role-sales-member/15 flex items-center justify-center font-display font-bold text-role-sales-member text-sm">
                      {mp.member.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{mp.member.name}</p>
                      <p className="text-[10px] text-muted-foreground">{mp.member.email}</p>
                    </div>
                  </div>
                  {isOnTrack && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium flex items-center gap-1">
                      <CheckCircle size={10} /> On Target
                    </span>
                  )}
                </div>

                {/* Target progress for whatever period is selected */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">
                      {period.mode === "day" ? "Daily Target" : "Target so far"}
                    </span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(mp.periodRevenue)} / {formatCurrency(mp.periodTarget)}
                    </span>
                  </div>
                  <div className="h-2.5 bg-border rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${mp.periodProgress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full ${mp.periodProgress >= 100 ? "bg-success" : mp.periodProgress >= 50 ? "bg-primary" : "bg-warning"}`}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {mp.periodProgress.toFixed(0)}% of {formatCurrency(mp.dailyTarget)}/day target
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-background border border-border rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Revenue</p>
                    <p className="font-display font-bold text-sm text-primary">{formatCurrency(mp.totalRevenue)}</p>
                  </div>
                  <div className="bg-background border border-border rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Verified</p>
                    <p className="font-display font-bold text-sm text-success">{formatCurrency(mp.verifiedRevenue)}</p>
                  </div>
                  <div className="bg-background border border-border rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Conversion</p>
                    <p className="font-display font-bold text-sm text-foreground">{mp.conversionRate.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Bottom Stats */}
                <div className="flex items-center justify-between text-xs border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <Award size={12} className="text-warning" />
                    <span className="text-muted-foreground">Days target reached:</span>
                    <span className="font-mono font-medium text-foreground">{mp.daysReachedTarget}</span>
                    <span className="text-muted-foreground">/ {mp.totalActiveDays} active</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag size={12} className="text-info" />
                    <span className="font-mono font-medium text-foreground">{mp.totalSales} sales</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Member Summary</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Leads</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Called</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sales</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Target</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">🏆 Days</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No team members yet.</td></tr>
            ) : (
              memberPerformance.map((mp, i) => {
                const mLeads = filteredLeads.filter((l: any) => l.assignedTo === mp.member.uid);
                const mCalled = mLeads.filter((l: any) => l.status !== "not_called").length;
                return (
                  <tr key={mp.member.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-role-sales-member/15 flex items-center justify-center font-display font-bold text-role-sales-member text-[10px]">
                          {mp.member.name?.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{mp.member.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{mLeads.length}</td>
                    <td className="px-4 py-3 text-right font-mono">{mCalled}</td>
                    <td className="px-4 py-3 text-right font-mono text-success">{mp.totalSales}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(mp.totalRevenue)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                        mp.periodProgress >= 100
                          ? "bg-success/15 text-success"
                          : mp.periodProgress >= 50
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive"
                      }`}>
                        {mp.periodProgress.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-foreground">{mp.daysReachedTarget}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
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
