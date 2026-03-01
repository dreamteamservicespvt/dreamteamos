import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import type { Lead } from "@/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Target, Award, Zap } from "lucide-react";

const PIE_COLORS = [
  "hsl(142 71% 45%)",   // success
  "hsl(217 91% 60%)",   // info
  "hsl(48 96% 47%)",    // warning
  "hsl(270 91% 65%)",   // role-main-admin
  "hsl(0 84% 60%)",     // destructive
  "hsl(240 4% 66%)",    // muted-foreground
];

export default function MyPerformance() {
  const user = useAuthStore((s) => s.user);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const total = leads.length;
  const salesDone = leads.filter((l) => l.saleDone);
  const totalRevenue = salesDone.reduce((sum, l) => sum + (l.saleDetails?.amount || 0), 0);
  const verified = salesDone.filter((l) => l.saleDetails?.verificationStatus === "verified");
  const verifiedRevenue = verified.reduce((sum, l) => sum + (l.saleDetails?.amount || 0), 0);
  const target = user?.monthlyTarget || user?.target || 0;

  // Category breakdown
  const categoryMap: Record<string, { count: number; amount: number }> = {};
  salesDone.forEach((l) => {
    const cat = l.saleDetails?.category || "unknown";
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, amount: 0 };
    categoryMap[cat].count++;
    categoryMap[cat].amount += l.saleDetails?.amount || 0;
  });
  const categoryData = Object.entries(categoryMap).map(([name, v]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    sales: v.count,
    revenue: v.amount,
  }));

  // Status pie
  const statusData = [
    { name: "Sale Done", value: salesDone.length },
    { name: "Answered", value: leads.filter((l) => l.status === "answered" && !l.saleDone).length },
    { name: "Not Answered", value: leads.filter((l) => l.status === "not_answered").length },
    { name: "Call Later", value: leads.filter((l) => l.status === "call_later").length },
    { name: "Not Interested", value: leads.filter((l) => l.status === "not_interested").length },
    { name: "Not Called", value: leads.filter((l) => l.status === "not_called").length },
  ].filter((d) => d.value > 0);

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
          { label: "Conversion Rate", value: `${total > 0 ? ((salesDone.length / total) * 100).toFixed(1) : 0}%`, icon: Zap, color: "text-warning" },
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
      {salesDone.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-semibold text-foreground">Completed Sales</h2>
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
                </tr>
              </thead>
              <tbody>
                {salesDone.map((l) => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="p-3 font-medium text-foreground">{l.displayName}</td>
                    <td className="p-3 text-muted-foreground capitalize">{l.saleDetails?.category?.replace(/_/g, " ")}</td>
                    <td className="p-3 text-muted-foreground">{l.saleDetails?.packageKey}</td>
                    <td className="p-3 text-right font-mono text-foreground">{formatCurrency(l.saleDetails?.amount || 0)}</td>
                    <td className="p-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        l.saleDetails?.verificationStatus === "verified"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      }`}>
                        {l.saleDetails?.verificationStatus === "verified" ? "Verified" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
