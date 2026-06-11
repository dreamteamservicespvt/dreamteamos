import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { Lead, SaleDetail } from "@/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Target, Award, Zap, IndianRupee } from "lucide-react";

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
  const [earningsView, setEarningsView] = useState<"option1" | "option2">("option1");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const getSaleItems = (l: Lead): SaleDetail[] =>
    l.saleItems || (l.saleDetails ? [l.saleDetails] : []);

  const total = leads.length;
  const salesDoneCount = leads.filter((l) => l.saleDone).length;

  // All-time revenue (all sale items)
  const totalRevenue = leads.reduce((sum, l) =>
    sum + getSaleItems(l).reduce((s, i) => s + (i.amount || 0), 0), 0);
  const verifiedRevenue = leads.reduce((sum, l) =>
    sum + getSaleItems(l).filter((i) => i.verificationStatus === "verified").reduce((s, i) => s + (i.amount || 0), 0), 0);

  const target = user?.monthlyTarget || user?.target || 0;

  // Current-month revenue for earnings calculation
  const currentMonthStr = format(new Date(), "yyyy-MM");
  const monthlyLeads = leads.filter((l) => {
    if (!l.createdAt?.seconds) return false;
    return format(new Date(l.createdAt.seconds * 1000), "yyyy-MM") === currentMonthStr;
  });
  const monthlyVerifiedRevenue = monthlyLeads.reduce((sum, l) =>
    sum + getSaleItems(l).filter((i) => i.verificationStatus === "verified").reduce((s, i) => s + (i.amount || 0), 0), 0);

  // Earnings calculations
  const MONTHLY_TARGET = 30000;
  const STIPEND_MAX = 5000;
  const stipendAmount = Math.min(STIPEND_MAX, (monthlyVerifiedRevenue / MONTHLY_TARGET) * STIPEND_MAX);
  const option1Total = stipendAmount + monthlyVerifiedRevenue * 0.05;
  const option2Total = monthlyVerifiedRevenue * 0.10;
  const assignedOption = user?.earningsOption;

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

      {/* Earnings Estimator */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <IndianRupee size={16} className="text-primary" />
              <h2 className="font-display font-semibold text-foreground">My Earnings This Month</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on {formatCurrency(monthlyVerifiedRevenue)} verified revenue in {format(new Date(), "MMMM yyyy")}
            </p>
          </div>
          {assignedOption && (
            <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${
              assignedOption === "stipend_plus_5"
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-success/10 text-success border-success/30"
            }`}>
              Your Plan: {assignedOption === "stipend_plus_5" ? "Stipend + 5%" : "10% Incentive"}
            </span>
          )}
        </div>

        {/* Toggle */}
        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setEarningsView("option1")}
            className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors relative ${
              earningsView === "option1"
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-accent border border-border text-muted-foreground hover:bg-accent/80"
            }`}
          >
            Stipend + 5%
            {assignedOption === "stipend_plus_5" && (
              <span className="ml-1 text-[9px] opacity-75">★ Your Plan</span>
            )}
          </button>
          <button
            onClick={() => setEarningsView("option2")}
            className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
              earningsView === "option2"
                ? "bg-success/15 text-success border border-success/30"
                : "bg-accent border border-border text-muted-foreground hover:bg-accent/80"
            }`}
          >
            10% Incentive
            {assignedOption === "incentive_10" && (
              <span className="ml-1 text-[9px] opacity-75">★ Your Plan</span>
            )}
          </button>
        </div>

        {/* Option 1 breakdown */}
        {earningsView === "option1" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground">Stipend (proportional to ₹30,000 target)</span>
              <span className="font-mono font-medium text-foreground">{formatCurrency(stipendAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground">5% Incentive on {formatCurrency(monthlyVerifiedRevenue)}</span>
              <span className="font-mono font-medium text-foreground">{formatCurrency(monthlyVerifiedRevenue * 0.05)}</span>
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="font-semibold text-foreground">Total Earnings</span>
              <span className="font-display font-bold text-xl text-primary">{formatCurrency(option1Total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 mt-1">
              Stipend is proportional: ₹5,000 max at ₹30,000 sales. At {monthlyVerifiedRevenue >= MONTHLY_TARGET ? "100%" : `${Math.round((monthlyVerifiedRevenue / MONTHLY_TARGET) * 100)}%`} you earn {formatCurrency(stipendAmount)} stipend.
            </p>
          </div>
        )}

        {/* Option 2 breakdown */}
        {earningsView === "option2" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground">10% on {formatCurrency(monthlyVerifiedRevenue)} verified sales</span>
              <span className="font-mono font-medium text-foreground">{formatCurrency(option2Total)}</span>
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="font-semibold text-foreground">Total Earnings</span>
              <span className="font-display font-bold text-xl text-success">{formatCurrency(option2Total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 mt-1">
              No target required — earn 10% on every verified sale. More you sell, more you earn.
            </p>
          </div>
        )}

        {/* Side-by-side comparison hint */}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Option 1 (Stipend + 5%)</span>
          <span className="font-mono font-medium text-foreground">{formatCurrency(option1Total)}</span>
          <span className="text-muted-foreground/40">vs</span>
          <span className="font-mono font-medium text-foreground">{formatCurrency(option2Total)}</span>
          <span>Option 2 (10%)</span>
        </div>

        {!assignedOption && (
          <p className="text-xs text-muted-foreground text-center mt-3 italic">
            Your earnings plan hasn't been assigned yet — contact your sales admin.
          </p>
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
                  <th className="p-3 text-xs text-muted-foreground font-medium">Submitted</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Approved</th>
                </tr>
              </thead>
              <tbody>
                {leads.filter((l) => l.saleDone).flatMap((l) =>
                  getSaleItems(l).map((item, idx) => (
                    <tr key={`${l.id}-${idx}`} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
