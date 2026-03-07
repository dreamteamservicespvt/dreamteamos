import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency } from "@/utils/formatters";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import { TrendingUp, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export default function RevenueSummary() {
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"7" | "30" | "all">("30");

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const verifiedAssignments = assignments.filter((a) => a.status === "verified");
  const salesDone = leads.filter((l: any) => l.saleDone && l.saleDetails);

  const totalTechRevenue = verifiedAssignments.reduce((s, a) => s + (a.totalPrice || 0), 0);
  const totalSalesRevenue = salesDone.reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);

  // Revenue by date
  const revenueByDate: Record<string, { date: string; tech: number; sales: number }> = {};
  verifiedAssignments.forEach((a) => {
    const d = a.date || "unknown";
    if (!revenueByDate[d]) revenueByDate[d] = { date: d, tech: 0, sales: 0 };
    revenueByDate[d].tech += a.totalPrice || 0;
  });
  salesDone.forEach((l: any) => {
    const d = l.lastUpdated?.toDate?.() ? l.lastUpdated.toDate().toISOString().slice(0, 10) : "unknown";
    if (!revenueByDate[d]) revenueByDate[d] = { date: d, tech: 0, sales: 0 };
    revenueByDate[d].sales += l.saleDetails?.amount || 0;
  });
  const chartData = Object.values(revenueByDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(dateRange === "7" ? -7 : dateRange === "30" ? -30 : 0);

  // Per-member revenue
  const memberRevenue = members
    .filter((m) => ["tech_member", "sales_member", "tech_admin", "sales_admin"].includes(m.role))
    .map((m) => {
      const techRev = verifiedAssignments.filter((a) => a.assignedTo === m.uid).reduce((s, a) => s + (a.totalPrice || 0), 0);
      const salesRev = salesDone.filter((l: any) => l.assignedTo === m.uid).reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
      return { ...m, techRev, salesRev, total: techRev + salesRev };
    })
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  const exportCSV = () => {
    const rows = [["Member", "Role", "Tech Revenue", "Sales Revenue", "Total"]];
    memberRevenue.forEach((m) => {
      rows.push([m.name, getRoleLabel(m.role), String(m.techRev), String(m.salesRev), String(m.total)]);
    });
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "revenue-summary.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Revenue Summary</h1>
          <p className="text-muted-foreground text-sm mt-1">Complete revenue breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {(["7", "30", "all"] as const).map((r) => (
              <button key={r} onClick={() => setDateRange(r)}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${dateRange === r ? "bg-primary/15 text-primary border border-primary/30" : "bg-card text-muted-foreground border border-border hover:bg-accent"}`}>
                {r === "7" ? "7 Days" : r === "30" ? "30 Days" : "All"}
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            className="h-8 px-3 rounded-md bg-accent text-foreground text-xs font-medium flex items-center gap-1 border border-border hover:bg-accent/80">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Revenue</p>
          <p className="font-display text-2xl font-bold text-foreground">{formatCurrency(totalTechRevenue + totalSalesRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Sales Revenue</p>
          <p className="font-display text-2xl font-bold text-primary">{formatCurrency(totalSalesRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Tech Revenue</p>
          <p className="font-display text-2xl font-bold text-info">{formatCurrency(totalTechRevenue)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">Revenue Over Time</h3>
        {chartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center"><TrendingUp size={32} className="mx-auto mb-2 opacity-30" /><p>No revenue data</p></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
              <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }} formatter={(v: number) => [formatCurrency(v), ""]} />
              <Legend />
              <Bar dataKey="sales" name="Sales" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tech" name="Tech Work" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Revenue by Member</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tech</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sales</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {memberRevenue.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No revenue data</td></tr>
            ) : (
              memberRevenue.map((m, i) => (
                <tr key={m.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{getRoleLabel(m.role)}</td>
                  <td className="px-4 py-3 text-right font-mono text-info">{formatCurrency(m.techRev)}</td>
                  <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(m.salesRev)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-foreground">{formatCurrency(m.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
