import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import StatCard from "@/components/dashboard/StatCard";
import type { AppUser } from "@/types";
import { TrendingUp, Users, Video, ShoppingBag } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function MainAdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [techMembers, setTechMembers] = useState<AppUser[]>([]);
  const [salesMembers, setSalesMembers] = useState<AppUser[]>([]);
  const [todaySubmissions, setTodaySubmissions] = useState<any[]>([]);
  const [todayLeads, setTodayLeads] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<{ text: string; time: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let allUsers: AppUser[] = [];
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(allUsers.filter((u) => u.isActive));
      setTechMembers(allUsers.filter((u) => u.role === "tech_member" && u.isActive));
      setSalesMembers(allUsers.filter((u) => u.role === "sales_member" && u.isActive));
    }));

    unsubs.push(onSnapshot(collection(db, "work_submissions"), (snap) => {
      const allSubs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTodaySubmissions(allSubs.filter((s: any) => s.date === today));

      // Build tech activities
      const activities: { text: string; time: string; type: string }[] = [];
      allSubs.filter((s: any) => s.date === today).forEach((data: any) => {
        const member = allUsers.find((u) => u.uid === data.techMemberId);
        activities.push({
          text: `${member?.name || "Tech Member"} submitted ${data.totalVideos} video${data.totalVideos !== 1 ? "s" : ""}`,
          time: data.submittedAt?.toDate?.() ? timeAgo(data.submittedAt.toDate()) : "recently",
          type: data.status === "approved" ? "approved" : "tech",
        });
      });
      setRecentActivity((prev) => {
        const salesActivities = prev.filter((a) => a.type === "sale");
        return [...activities, ...salesActivities].slice(0, 10);
      });
    }));

    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
      const allLeads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTodayLeads(allLeads.filter((l: any) => l.saleDone));

      const saleActivities: { text: string; time: string; type: string }[] = [];
      allLeads.filter((l: any) => l.saleDone && l.saleDetails).forEach((l: any) => {
        const member = allUsers.find((u) => u.uid === l.assignedTo);
        saleActivities.push({
          text: `${member?.name || "Sales Member"} closed sale — ${formatCurrency(l.saleDetails?.amount || 0)}`,
          time: l.lastUpdated?.toDate?.() ? timeAgo(l.lastUpdated.toDate()) : "recently",
          type: "sale",
        });
      });
      setRecentActivity((prev) => {
        const techActivities = prev.filter((a) => a.type !== "sale");
        return [...techActivities, ...saleActivities].slice(0, 10);
      });
      setLoading(false);
    }));

    return () => unsubs.forEach((u) => u());
  }, [today]);

  // Compute stats
  const totalMembers = members.length;
  const totalVideosToday = todaySubmissions
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + (s.totalVideos || 0), 0);
  const totalSalesRevenue = todayLeads.reduce(
    (sum, l: any) => sum + (l.saleDetails?.amount || 0), 0
  );
  const totalTechRevenue = todaySubmissions
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + (s.calculatedRevenue || 0), 0);
  const totalRevenueToday = totalSalesRevenue + totalTechRevenue;
  const salesToday = todayLeads.length;

  // Build tech team table data
  const techTableData = techMembers.map((m) => {
    const memberSubs = todaySubmissions.filter((s) => s.techMemberId === m.uid);
    const videos = memberSubs.reduce((s, sub) => s + (sub.totalVideos || 0), 0);
    const revenue = memberSubs
      .filter((s) => s.status === "approved")
      .reduce((s, sub) => s + (sub.calculatedRevenue || 0), 0);
    const hasSub = memberSubs.length > 0;
    return { name: m.name, videos, revenue, status: hasSub ? "active" : "idle" };
  });

  // Build sales team table data
  const salesTableData = salesMembers.map((m) => {
    const memberLeads = todayLeads.filter((l: any) => l.assignedTo === m.uid);
    const revenue = memberLeads.reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
    return { name: m.name, sales: memberLeads.length, revenue, target: m.dailyTarget || m.target || 10000 };
  });

  return (
    <div className="space-y-6 animate-counter">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {user?.name || "Admin"}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard title="Total Revenue Today" value={totalRevenueToday} prefix="₹" icon={TrendingUp} />
        <StatCard title="Total Team Members" value={totalMembers} icon={Users} color="bg-info/10 text-info" />
        <StatCard title="Videos Today" value={totalVideosToday} icon={Video} color="bg-success/10 text-success" />
        <StatCard title="Sales Closed Today" value={salesToday} icon={ShoppingBag} color="bg-warning/10 text-warning" />
      </div>

      {/* Activity + empty chart placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart placeholder — shows data when daily_revenue collection is populated */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">7-Day Revenue</h3>
          {totalRevenueToday === 0 && !loading ? (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              <div className="text-center">
                <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                <p>Revenue chart will populate as data comes in</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={[{ day: "Today", sales: totalSalesRevenue, tech: totalTechRevenue }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="day" stroke="hsl(240 3.7% 65.9%)" fontSize={12} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(240 5.3% 7.1%)",
                    border: "1px solid hsl(240 3.8% 16.1%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, ""]}
                />
                <Line type="monotone" dataKey="sales" stroke="hsl(24.6 95% 53.1%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="tech" stroke="hsl(217.2 91.2% 59.8%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary rounded" /> Sales Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-info rounded" /> Tech Work Value</span>
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
          <h3 className="font-display font-semibold text-foreground mb-4">Tech Department</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-3 font-medium">Member</th>
                  <th className="text-right pb-3 font-medium">Videos</th>
                  <th className="text-right pb-3 font-medium">Revenue</th>
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
          <h3 className="font-display font-semibold text-foreground mb-4">Sales Department</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-3 font-medium">Member</th>
                  <th className="text-right pb-3 font-medium">Sales</th>
                  <th className="text-right pb-3 font-medium">Revenue</th>
                  <th className="text-left pb-3 pl-4 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {salesTableData.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No sales members yet</td></tr>
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
