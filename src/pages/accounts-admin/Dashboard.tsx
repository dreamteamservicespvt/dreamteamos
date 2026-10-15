import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency } from "@/utils/formatters";
import { getRoleLabel, isActiveUser } from "@/utils/roleHelpers";
import { computeProfit } from "@/utils/profitAnalytics";
import { defaultPeriodFilter, periodLabel } from "@/utils/periodFilter";
import { salesBookedByDay } from "@/utils/salesRevenue";
import type { AppUser, Lead, WorkAssignment } from "@/types";
import type { PayrollLine } from "@/types/payroll";
import { Wallet, TrendingUp, TrendingDown, Users, PieChart } from "lucide-react";
import {
  PieChart as RPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

export default function AccountsDashboard() {
  /** Everyone, inactive included — a leader paid in the period still cost money in it. */
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [payrollLines, setPayrollLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 5) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setAllUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "expenses"), (snap) => { setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "payroll_lines"), (snap) => { setPayrollLines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollLine))); checkDone(); }, () => checkDone()));
    return () => unsubs.forEach((u) => u());
  }, []);

  // Only active people are shown (owner, 2026-10-10).
  const members = useMemo(() => allUsers.filter(isActiveUser), [allUsers]);

  /*
    ── One period for revenue, expenses and salaries (2026-10-15) ──
    The net profit here was ALL-TIME revenue (sales + the delivered value of the same work, counted twice)
    minus ALL-TIME expenses minus ONE month of today's salaries — three different periods in one subtraction.
    It is now the P&L's own figure (utils/profitAnalytics, the Profit page's engine) for one pay period, the
    one running now: verified sales, expenses, salaries (paid where paid, else what applied then) and
    incentives (the payroll rule), all for the same days. An unpaid salary is charged for the period's days so
    far (today included), not in full — a month's salary against half a month's sales read as a loss.
  */
  const period = useMemo(() => defaultPeriodFilter("cycle"), []);
  const profit = useMemo(() => computeProfit({
    filter: period,
    users: allUsers,
    leads: leads as Lead[],
    assignments: assignments as WorkAssignment[],
    expenses,
    payrollLines,
  }), [period, allUsers, leads, assignments, expenses, payrollLines]);
  const totalRevenue = profit.totalIncome;
  const totalExpenses = profit.expenses;
  const totalSalaries = profit.techSalary + profit.salesSalary + profit.salesCommission;
  const netProfit = profit.netProfit;

  // Expense by category for pie chart
  const expByCategory: Record<string, number> = {};
  expenses.forEach((e) => {
    const cat = e.category || "Other";
    expByCategory[cat] = (expByCategory[cat] || 0) + (e.amount || 0);
  });
  const pieData = Object.entries(expByCategory).map(([name, value]) => ({ name, value }));
  const COLORS = [
    "hsl(24.6 95% 53.1%)", "hsl(217.2 91.2% 59.8%)", "hsl(142.1 70.6% 45.3%)",
    "hsl(47.9 95.8% 47.3%)", "hsl(270 91% 65%)", "hsl(0 84.2% 60.2%)",
  ];

  // Revenue by date for bar chart (last 7 days)
  const revenueByDate: Record<string, { date: string; sales: number; tech: number }> = {};
  assignments.filter((a) => a.status === "verified").forEach((a) => {
    const d = a.date || "unknown";
    if (!revenueByDate[d]) revenueByDate[d] = { date: d, sales: 0, tech: 0 };
    revenueByDate[d].tech += a.totalPrice || 0;
  });
  // Each sale on its own (local) day, across saleItems and the legacy shape (2026-10-15) — not the lead's
  // last-touched time in UTC, and not the legacy field alone.
  salesBookedByDay(leads as Lead[]).forEach((amount, d) => {
    if (!revenueByDate[d]) revenueByDate[d] = { date: d, sales: 0, tech: 0 };
    revenueByDate[d].sales += amount;
  });
  const barData = Object.values(revenueByDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);

  // Team count by role
  const roleCounts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Accounts Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Financial overview of the organization · figures for this pay period, <span data-test="accounts-period">{periodLabel(period)}</span>
        </p>
      </div>

      {/* Summary Cards — one pay period for all of them, so Net Profit is their own sum. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatBox icon={TrendingUp} label="Revenue (verified sales)" value={formatCurrency(totalRevenue)} color="text-success" />
        <StatBox icon={TrendingDown} label="Expenses" value={formatCurrency(totalExpenses)} color="text-destructive" />
        <StatBox icon={Wallet} label="Salaries & incentives" value={formatCurrency(totalSalaries)} color="text-warning" />
        <StatBox icon={TrendingUp} label="Net Profit" value={formatCurrency(netProfit)} color={netProfit >= 0 ? "text-success" : "text-destructive"} />
        <StatBox icon={Users} label="Total Staff" value={members.length} color="text-info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Revenue (Last 7 Days)</h3>
          {barData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={(v) => v.slice(5)} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }} formatter={(v: number) => [formatCurrency(v), ""]} />
                <Bar dataKey="sales" name="Sales" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tech" name="Tech" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Expense Breakdown Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Expense Breakdown</h3>
          {pieData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No expenses yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <RPieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10} fill="hsl(var(--foreground))">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--chart-tooltip-bg))", border: "1px solid hsl(var(--chart-tooltip-border))", borderRadius: "8px", fontSize: "11px", color: "hsl(var(--foreground))" }} formatter={(v: number) => [formatCurrency(v), ""]} />
              </RPieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Staff by Role */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-3">Staff by Role</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(roleCounts).map(([role, count]) => (
            <div key={role} className="bg-background border border-border rounded-lg px-4 py-3 text-center min-w-[120px]">
              <p className="font-display text-lg font-bold text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground">{getRoleLabel(role as never)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="font-display text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
