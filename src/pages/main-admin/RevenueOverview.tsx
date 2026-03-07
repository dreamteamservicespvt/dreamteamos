import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Filter } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

export default function RevenueOverview() {
  const [members, setMembers] = useState<AppUser[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"7" | "30" | "all">("7");
  const isMobile = useIsMobile();

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const verifiedAssignments = assignments.filter((a) => a.status === "verified");
  const salesWithDone = leads.filter((l: any) => l.saleDone && l.saleDetails);

  const totalTechRevenue = verifiedAssignments.reduce((s, a) => s + (a.totalPrice || 0), 0);
  const totalSalesRevenue = salesWithDone.reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
  const totalRevenue = totalTechRevenue + totalSalesRevenue;

  const revenueByDate: Record<string, { date: string; tech: number; sales: number }> = {};

  verifiedAssignments.forEach((a) => {
    const d = a.date || "unknown";
    if (!revenueByDate[d]) revenueByDate[d] = { date: d, tech: 0, sales: 0 };
    revenueByDate[d].tech += a.totalPrice || 0;
  });

  salesWithDone.forEach((l: any) => {
    const d = l.lastUpdated?.toDate?.()
      ? l.lastUpdated.toDate().toISOString().slice(0, 10)
      : "unknown";
    if (!revenueByDate[d]) revenueByDate[d] = { date: d, tech: 0, sales: 0 };
    revenueByDate[d].sales += l.saleDetails?.amount || 0;
  });

  const chartData = Object.values(revenueByDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(dateRange === "7" ? -7 : dateRange === "30" ? -30 : 0);

  const memberRevenue = members
    .filter((m) => ["tech_member", "sales_member", "tech_admin", "sales_admin"].includes(m.role))
    .map((m) => {
      const techRev = verifiedAssignments
        .filter((a) => a.assignedTo === m.uid)
        .reduce((s, a) => s + (a.totalPrice || 0), 0);
      const salesRev = salesWithDone
        .filter((l: any) => l.assignedTo === m.uid)
        .reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
      return { ...m, techRev, salesRev, total: techRev + salesRev };
    })
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Revenue Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Track all revenue streams</p>
        </div>
        <div className="flex gap-1.5">
          {(["7", "30", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                dateRange === r
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-card text-muted-foreground border border-border hover:bg-accent"
              }`}
            >
              {r === "7" ? "7D" : r === "30" ? "30D" : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <p className="text-[10px] md:text-xs text-muted-foreground font-medium mb-1">Total Revenue</p>
          <p className="font-display text-lg md:text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <p className="text-[10px] md:text-xs text-muted-foreground font-medium mb-1">From Sales</p>
          <p className="font-display text-lg md:text-2xl font-bold text-primary">{formatCurrency(totalSalesRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5 col-span-2 sm:col-span-1">
          <p className="text-[10px] md:text-xs text-muted-foreground font-medium mb-1">From Tech Work</p>
          <p className="font-display text-lg md:text-2xl font-bold text-info">{formatCurrency(totalTechRevenue)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">Revenue Breakdown</h3>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] md:h-[280px] text-muted-foreground text-sm">
            <div className="text-center">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
              <p>No revenue data yet</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
              <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={11} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: number) => [formatCurrency(value), ""]}
              />
              <Legend />
              <Bar dataKey="sales" name="Sales" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tech" name="Tech Work" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Member Breakdown */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Revenue by Member</h3>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tech Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sales Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {memberRevenue.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No revenue data yet</td></tr>
              ) : (
                memberRevenue.map((m) => (
                  <tr key={m.uid} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{getRoleLabel(m.role)}</span></td>
                    <td className="px-4 py-3 text-right font-mono text-info">{formatCurrency(m.techRev)}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(m.salesRev)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">{formatCurrency(m.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border/50">
          {memberRevenue.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No revenue data yet</p>
          ) : (
            memberRevenue.map((m) => (
              <div key={m.uid} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground text-sm">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground">{getRoleLabel(m.role)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px]">Tech</p>
                    <p className="font-mono text-info">{formatCurrency(m.techRev)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Sales</p>
                    <p className="font-mono text-primary">{formatCurrency(m.salesRev)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px]">Total</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(m.total)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}