import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency, formatRupeeAxis } from "@/utils/formatters";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { AppUser, Lead, WorkAssignment } from "@/types";
import { revenueReport, rangeCaption, type RevenueRange } from "@/utils/revenueReport";
import { useToday } from "@/hooks/useToday";
import { TrendingUp, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function RevenueSummary() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<RevenueRange>("30");
  const today = useToday();

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  /*
    The same report as the main admin's Revenue Overview (utils/revenueReport, 2026-10-18): revenue = APPROVED
    sales on the day each was made (the one rule, owner-delegated decision); what awaits approval is its own card;
    tech work is its value, never revenue; the cards, chart, table and CSV all follow the range picked. "Total
    Revenue" used to add pending sales and the tech value of the same work, for all time whatever the range.
  */
  const report = useMemo(
    () => revenueReport({ leads, assignments, users, range: dateRange, today }),
    [leads, assignments, users, dateRange, today],
  );
  const { totals, techDelivered, chart, rows } = report;
  const chartHasRevenue = chart.some((d) => d.revenue > 0);

  const exportCSV = () => {
    const out = [["Member", "Role", "Approved sales", "Tech work delivered"]];
    rows.forEach(({ member: m, salesRevenue, techDelivered: work }) => {
      out.push([m.name, getRoleLabel(m.role), String(salesRevenue), String(work)]);
    });
    const blob = new Blob([out.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-foreground">Revenue Summary</h1>
          <p className="text-muted-foreground text-sm mt-1">Revenue = approved sales · {rangeCaption(dateRange)}</p>
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
          <p className="text-xs text-muted-foreground font-medium mb-1">Revenue (approved sales)</p>
          <p className="font-display text-2xl font-bold text-primary" data-test="summary-approved">{formatCurrency(totals.revenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totals.count} sale{totals.count === 1 ? "" : "s"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Awaiting approval</p>
          <p className="font-display text-2xl font-bold text-warning" data-test="summary-awaiting">{formatCurrency(totals.awaiting)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totals.awaitingCount} sale{totals.awaitingCount === 1 ? "" : "s"} · not in revenue</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Tech work delivered</p>
          <p className="font-display text-2xl font-bold text-info" data-test="summary-tech-delivered">{formatCurrency(techDelivered)}</p>
          <p className="text-xs text-muted-foreground mt-1">Value of verified work · not revenue</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground">Revenue Over Time</h3>
        <p className="text-xs text-muted-foreground mb-4">Approved sales, by the day each sale was made · {rangeCaption(dateRange)}</p>
        {!chartHasRevenue ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center"><TrendingUp size={32} className="mx-auto mb-2 opacity-30" /><p>No approved sales in this range</p></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
              <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={(v) => String(v).slice(5)} />
              <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={formatRupeeAxis} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }} formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">By member</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Approved sales and the value of verified work, {rangeCaption(dateRange)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Approved sales</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tech work delivered</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nothing in this range yet</td></tr>
              ) : (
                rows.map(({ member: m, salesRevenue, techDelivered: work }, i) => (
                  <tr key={m.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{getRoleLabel(m.role)}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(salesRevenue)}</td>
                    <td className="px-4 py-3 text-right font-mono text-info">{formatCurrency(work)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
