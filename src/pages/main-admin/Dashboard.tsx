import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatRupeeAxis } from "@/utils/formatters";
import StatCard from "@/components/dashboard/StatCard";
import type { AppUser, Lead } from "@/types";
import { TrendingUp, Users, Video, ShoppingBag } from "lucide-react";
import { dailyTargetOf } from "@/utils/salesTargets";
import { isStaffMember } from "@/utils/roleHelpers";
import { awaitingApprovalLabel, isApprovedSale, lastCalendarDays, revenueSeries, revenueTotals, saleItemsOf } from "@/utils/salesRevenue";
import { timestampMs } from "@/utils/saleIdentity";
import { useToday } from "@/hooks/useToday";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function MainAdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [todayAssignments, setTodayAssignments] = useState<any[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // The LOCAL day: `work_assignments.date` is written with `format(new Date(), "yyyy-MM-dd")`, so the
  // UTC day (`toISOString`) showed yesterday's jobs as "today" until 05:30 IST. `useToday` also turns
  // over at midnight, which re-subscribes the effect below (it is keyed on `today`).
  const today = useToday();

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
    }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => {
      setTodayAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a: any) => a.date === today));
    }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    }));
    return () => unsubs.forEach((u) => u());
  }, [today]);

  /*
    ── What "today" counts (2026-10-18, whole-app audit D-02 / D-04) ──
    "Sales Closed Today" and "Total Revenue Today" counted EVERY lead ever sold (no date at all) and only its LAST
    sale (`saleDetails`), and revenue added the tech side's delivered value — the same work a second time. The
    "7-Day Revenue" chart was one point labelled "Today" holding that all-time sum, and Recent Activity dated a sale
    by the lead's last edit. Now: today = the local (India) day each sale was MADE; revenue = APPROVED sales (the
    one rule, utils/salesRevenue — owner-delegated decision 2026-10-18), with what awaits approval said beside it;
    the chart is the last 7 calendar days; the feed is each sale at the moment it was recorded. Staff counts leave
    out external creators and switched-off accounts (`isStaffMember`).
  */
  const members = useMemo(() => users.filter(isStaffMember), [users]);
  const techMembers = useMemo(() => members.filter((u) => u.role === "tech_member"), [members]);
  const salesMembers = useMemo(() => members.filter((u) => u.role === "sales_member"), [members]);
  const isToday = (day: string) => day === today;
  const todaySales = revenueTotals(leads, { inDay: isToday });
  const sevenDays = useMemo(() => revenueSeries(leads, lastCalendarDays(today, 7)), [leads, today]);
  const sevenDayTotal = sevenDays.reduce((s, d) => s + d.revenue, 0);

  const recentActivity = useMemo(() => {
    const nameOf = (uid?: string) => users.find((u) => u.uid === uid)?.name;
    const events: { text: string; at: number; type: string }[] = [];
    todayAssignments.filter((a) => a.status === "verified").forEach((a) => {
      events.push({
        text: `${nameOf(a.assignedTo) || "Tech Member"} completed ${a.clipCount || 0} clip${(a.clipCount || 0) !== 1 ? "s" : ""}`,
        at: timestampMs(a.verifiedAt),
        type: "approved",
      });
    });
    for (const lead of leads) {
      for (const item of saleItemsOf(lead)) {
        if (item.verificationStatus === "rejected") continue;
        const at = timestampMs(item.submittedAt) || timestampMs(lead.createdAt);
        if (!at) continue;
        events.push({
          text: `${nameOf(lead.assignedTo) || "Sales Executive"} closed a sale — ${formatCurrency(item.amount || 0)}${isApprovedSale(item) ? "" : " · awaiting approval"}`,
          at,
          type: "sale",
        });
      }
    }
    return events
      .sort((a, b) => b.at - a.at)
      .slice(0, 10)
      .map((e) => ({ text: e.text, type: e.type, time: e.at ? timeAgo(new Date(e.at)) : "recently" }));
  }, [users, leads, todayAssignments]);

  // Compute stats
  const totalMembers = members.length;
  const totalVideosToday = todayAssignments
    .filter((a) => a.status === "verified")
    .reduce((sum, a) => sum + (a.clipCount || 0), 0);
  const totalRevenueToday = todaySales.revenue;
  const salesToday = todaySales.count + todaySales.awaitingCount;

  // Build tech team table data
  const techTableData = techMembers.map((m) => {
    const memberAssignments = todayAssignments.filter((a) => a.assignedTo === m.uid);
    const videos = memberAssignments.filter((a) => a.status === "verified").reduce((s, a) => s + (a.clipCount || 0), 0);
    const revenue = memberAssignments
      .filter((a) => a.status === "verified")
      .reduce((s, a) => s + (a.totalPrice || 0), 0);
    const hasWork = memberAssignments.length > 0;
    return { name: m.name, videos, revenue, status: hasWork ? "active" : "idle" };
  });

  // Build sales team table data
  const salesTableData = salesMembers.map((m) => {
    const mine = revenueTotals(leads, { inDay: isToday, ownerId: m.uid });
    return { name: m.name, sales: mine.count + mine.awaitingCount, revenue: mine.revenue, target: dailyTargetOf(m) || 10000 };
  });

  return (
    <div className="space-y-6 animate-counter">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {user?.name || "Admin"}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Revenue Today"
          value={totalRevenueToday}
          prefix="₹"
          icon={TrendingUp}
          note={todaySales.awaitingCount > 0 ? awaitingApprovalLabel(todaySales) : "Approved sales"}
        />
        <StatCard title="Total Team Members" value={totalMembers} icon={Users} color="bg-info/10 text-info" note="Active staff" />
        <StatCard title="Videos Today" value={totalVideosToday} icon={Video} color="bg-success/10 text-success" note="Clips verified today" />
        <StatCard
          title="Sales Closed Today"
          value={salesToday}
          icon={ShoppingBag}
          color="bg-warning/10 text-warning"
          note={`${todaySales.count} approved · ${todaySales.awaitingCount} awaiting`}
        />
      </div>

      {/* Activity + the last 7 days' revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground">7-Day Revenue</h3>
          <p className="text-xs text-muted-foreground mb-4">Approved sales, by the day each sale was made · last 7 days</p>
          {sevenDayTotal === 0 && !loading ? (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm" data-test="seven-day-empty">
              <div className="text-center">
                <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                <p>No approved sales in the last 7 days</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={sevenDays}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={12} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={12} tickFormatter={formatRupeeAxis} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(240 5.3% 7.1%)",
                    border: "1px solid hsl(240 3.8% 16.1%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, ""]}
                />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(24.6 95% 53.1%)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary rounded" /> Revenue (approved sales)</span>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-display font-semibold text-foreground">Recent Activity</h3>
            <span className="w-2 h-2 rounded-full bg-success animate-live-dot" />
          </div>
          <div className="space-y-3">
            {recentActivity.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activity yet today</p>
            ) : (
              recentActivity.map((event, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors animate-slide-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    event.type === "sale" ? "bg-success" :
                    event.type === "approved" ? "bg-primary" :
                    event.type === "tech" ? "bg-info" :
                    event.type === "lead" ? "bg-warning" : "bg-muted-foreground"
                  }`} />
                  <div>
                    <p className="text-sm text-foreground">{event.text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{event.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Team Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tech Team */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Tech Department <span className="text-xs font-normal text-muted-foreground">· today</span></h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-3 font-medium">Member</th>
                  <th className="text-right pb-3 font-medium">Videos</th>
                  <th className="text-right pb-3 font-medium" title="The value of the work verified today — a productivity measure, not revenue">Work value</th>
                  <th className="text-right pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {techTableData.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No tech members yet</td></tr>
                ) : (
                  techTableData.map((m, i) => (
                    <tr key={i} className={`border-b border-border/50 ${i % 2 === 1 ? "bg-elevated/30" : ""}`}>
                      <td className="py-3 font-medium text-foreground">{m.name}</td>
                      <td className="py-3 text-right font-mono">{m.videos}</td>
                      <td className="py-3 text-right font-mono text-primary">{formatCurrency(m.revenue)}</td>
                      <td className="py-3 text-right">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          m.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        }`}>{m.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sales Team */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Business Development Department <span className="text-xs font-normal text-muted-foreground">· today</span></h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-3 font-medium">Member</th>
                  <th className="text-right pb-3 font-medium">Sales</th>
                  <th className="text-right pb-3 font-medium" title="Today's approved sales">Revenue</th>
                  <th className="text-left pb-3 pl-4 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {salesTableData.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No sales executives yet</td></tr>
                ) : (
                  salesTableData.map((m, i) => {
                    const pct = Math.min((m.revenue / m.target) * 100, 100);
                    return (
                      <tr key={i} className={`border-b border-border/50 ${i % 2 === 1 ? "bg-elevated/30" : ""}`}>
                        <td className="py-3 font-medium text-foreground">{m.name}</td>
                        <td className="py-3 text-right font-mono">{m.sales}</td>
                        <td className="py-3 text-right font-mono text-primary">{formatCurrency(m.revenue)}</td>
                        <td className="py-3 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct >= 100 ? "bg-success" : "bg-primary"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-muted-foreground w-10 text-right">{Math.round(pct)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago`;
}
