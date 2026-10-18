import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency, formatRupeeAxis } from "@/utils/formatters";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { AppUser, Lead, WorkAssignment } from "@/types";
import { revenueReport, rangeCaption, type RevenueRange } from "@/utils/revenueReport";
import { useToday } from "@/hooks/useToday";
import { TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

export default function RevenueOverview() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<RevenueRange>("7");
  const isMobile = useIsMobile();
  const today = useToday();

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  /*
    One report for the whole page, for the range picked (2026-10-18 — utils/revenueReport): revenue = APPROVED
    sales on the day each was made (the one rule, owner-delegated decision); what awaits approval is its own card;
    the tech side's delivered value is shown as work value, never added to revenue. The cards used to be all-time
    whatever the range said, and "Total Revenue" added pending sales and the tech value of the same work.
  */
  const report = useMemo(
    () => revenueReport({ leads, assignments, users, range: dateRange, today }),
    [leads, assignments, users, dateRange, today],
  );
  const { totals, techDelivered, chart, rows } = report;
  const chartHasRevenue = chart.some((d) => d.revenue > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-foreground">Revenue Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Revenue = approved sales · {rangeCaption(dateRange)}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
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

      {/* Summary Cards — all for the range picked */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <p className="text-[10px] md:text-xs text-muted-foreground font-medium mb-1">Revenue (approved sales)</p>
          <p className="font-display text-lg md:text-2xl font-bold text-primary" data-test="revenue-approved">{formatCurrency(totals.revenue)}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{totals.count} sale{totals.count === 1 ? "" : "s"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <p className="text-[10px] md:text-xs text-muted-foreground font-medium mb-1">Awaiting approval</p>
          <p className="font-display text-lg md:text-2xl font-bold text-warning" data-test="revenue-awaiting">{formatCurrency(totals.awaiting)}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{totals.awaitingCount} sale{totals.awaitingCount === 1 ? "" : "s"} · not in revenue</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5 col-span-2 sm:col-span-1">
          <p className="text-[10px] md:text-xs text-muted-foreground font-medium mb-1">Tech work delivered</p>
          <p className="font-display text-lg md:text-2xl font-bold text-info" data-test="revenue-tech-delivered">{formatCurrency(techDelivered)}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">Value of verified work · not revenue</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="font-display font-semibold text-foreground">Revenue by day</h3>
        <p className="text-xs text-muted-foreground mb-4">Approved sales, by the day each sale was made · {rangeCaption(dateRange)}</p>
        {!chartHasRevenue || loading ? (
          <div className="flex items-center justify-center h-[200px] md:h-[280px] text-muted-foreground text-sm">
            <div className="text-center">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
              <p>No approved sales in this range</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
              <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={11} tickFormatter={(v) => String(v).slice(5)} />
              <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={11} tickFormatter={formatRupeeAxis} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: number) => [formatCurrency(value), "Revenue"]}
              />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Member Breakdown */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">By member</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Approved sales and the value of verified work, {rangeCaption(dateRange)}</p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
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
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">Nothing in this range yet</td></tr>
              ) : (
                rows.map(({ member: m, salesRevenue, techDelivered: work }) => (
                  <tr key={m.uid} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{getRoleLabel(m.role)}</span></td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(salesRevenue)}</td>
                    <td className="px-4 py-3 text-right font-mono text-info">{formatCurrency(work)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border/50">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">Nothing in this range yet</p>
          ) : (
            rows.map(({ member: m, salesRevenue, techDelivered: work }) => (
              <div key={m.uid} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground text-sm truncate min-w-0">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{getRoleLabel(m.role)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px]">Approved sales</p>
                    <p className="font-mono text-primary">{formatCurrency(salesRevenue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px]">Tech work delivered</p>
                    <p className="font-mono text-info">{formatCurrency(work)}</p>
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
