import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format, eachDayOfInterval, subDays, startOfDay } from "date-fns";
import type { AppUser } from "@/types";
import { Users, Phone, ShoppingBag, TrendingUp, Target, Award, CheckCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { motion } from "framer-motion";

export default function SalesAdminDashboard() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid));
    }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const memberIds = members.map((m) => m.uid);
  const teamLeads = leads.filter((l: any) => memberIds.includes(l.assignedTo));

  // Filter by selected date
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filteredLeads = dateStr
    ? teamLeads.filter((l: any) => {
        const ts = l.lastUpdated?.seconds || l.createdAt?.seconds;
        if (!ts) return false;
        return format(new Date(ts * 1000), "yyyy-MM-dd") === dateStr;
      })
    : teamLeads;

  const salesDone = filteredLeads.filter((l: any) => l.saleDone);
  const allSaleItems = salesDone.flatMap((l: any) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []));
  const totalRevenue = allSaleItems.reduce((s: number, item: any) => s + (item.amount || 0), 0);
  const called = filteredLeads.filter((l: any) => l.status !== "not_called").length;
  const pendingApprovals = allSaleItems.filter((item: any) => item.verificationStatus === "pending").length;

  const chartData = members.map((m) => {
    const mLeads = filteredLeads.filter((l: any) => l.assignedTo === m.uid);
    const mSales = mLeads.filter((l: any) => l.saleDone);
    const mItems = mSales.flatMap((l: any) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []));
    return {
      name: m.name?.split(" ")[0] || "?",
      leads: mLeads.length,
      sales: mSales.length,
      revenue: mItems.reduce((s: number, item: any) => s + (item.amount || 0), 0),
    };
  });

  // Per-member detailed performance: daily target tracking
  const memberPerformance = useMemo(() => {
    return members.map((m) => {
      const dailyTarget = m.dailyTarget || m.target || 10000;
      const memberLeads = teamLeads.filter((l: any) => l.assignedTo === m.uid);
      const memberSaleLeads = memberLeads.filter((l: any) => l.saleDone);
      const allItems = memberSaleLeads.flatMap((l: any) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []));
      const verifiedItems = allItems.filter((item: any) => item.verificationStatus === "verified");
      const totalRev = allItems.reduce((s: number, item: any) => s + (item.amount || 0), 0);
      const verifiedRev = verifiedItems.reduce((s: number, item: any) => s + (item.amount || 0), 0);

      // Group sales by day to count how many days they hit their target
      const revenueByDay: Record<string, number> = {};
      memberSaleLeads.forEach((l: any) => {
        const ts = l.lastUpdated?.seconds || l.createdAt?.seconds;
        if (!ts) return;
        const day = format(new Date(ts * 1000), "yyyy-MM-dd");
        const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
        const dayRev = items.reduce((s: number, item: any) => s + (item.amount || 0), 0);
        revenueByDay[day] = (revenueByDay[day] || 0) + dayRev;
      });

      const daysReachedTarget = Object.values(revenueByDay).filter((rev) => rev >= dailyTarget).length;
      const totalActiveDays = Object.keys(revenueByDay).length;

      // Today's revenue
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const todayRevenue = revenueByDay[todayStr] || 0;
      const todayProgress = dailyTarget > 0 ? Math.min((todayRevenue / dailyTarget) * 100, 100) : 0;

      return {
        member: m,
        totalRevenue: totalRev,
        verifiedRevenue: verifiedRev,
        totalSales: allItems.length,
        totalLeads: memberLeads.length,
        dailyTarget,
        todayRevenue,
        todayProgress,
        daysReachedTarget,
        totalActiveDays,
        conversionRate: memberLeads.length > 0 ? ((memberSaleLeads.length / memberLeads.length) * 100) : 0,
      };
    });
  }, [members, teamLeads]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Sales Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedDate ? `Activity on ${format(selectedDate, "dd/MM/yyyy")}` : "Overview of your team's performance"}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
        <StatBox icon={Users} label="Team Members" value={members.length} color="text-role-sales-member" />
        <StatBox icon={Phone} label={selectedDate ? "Active Leads" : "Total Leads"} value={filteredLeads.length} color="text-info" />
        <StatBox icon={Target} label="Called" value={called} color="text-warning" />
        <StatBox icon={ShoppingBag} label="Sales Closed" value={salesDone.length} color="text-success" />
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
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Team Performance</h3>
          <ResponsiveContainer width="100%" height={280}>
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
      )}

      {/* Member Performance Cards */}
      <div>
        <h3 className="font-display font-semibold text-foreground mb-4">Member Performance & Daily Target</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {memberPerformance.map((mp) => {
            const isOnTrack = mp.todayProgress >= 100;
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

                {/* Today's Progress */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Today's Target</span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(mp.todayRevenue)} / {formatCurrency(mp.dailyTarget)}
                    </span>
                  </div>
                  <div className="h-2.5 bg-border rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${mp.todayProgress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full ${mp.todayProgress >= 100 ? "bg-success" : mp.todayProgress >= 50 ? "bg-primary" : "bg-warning"}`}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{mp.todayProgress.toFixed(0)}% of daily target</p>
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
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Member Summary</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Leads</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Called</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sales</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Today</th>
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
                        mp.todayProgress >= 100
                          ? "bg-success/15 text-success"
                          : mp.todayProgress >= 50
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive"
                      }`}>
                        {mp.todayProgress.toFixed(0)}%
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
