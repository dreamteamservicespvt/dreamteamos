import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency, formatRupeeAxis } from "@/utils/formatters";
import { getRoleLabel, isStaffMember } from "@/utils/roleHelpers";
import { computeProfit } from "@/utils/profitAnalytics";
import { defaultPeriodFilter, periodLabel, withinPeriod } from "@/utils/periodFilter";
import { awaitingApprovalLabel, lastCalendarDays, revenueSeries, revenueTotals } from "@/utils/salesRevenue";
import { useToday } from "@/hooks/useToday";
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

  // Only active people are shown (owner, 2026-10-10), and never an external creator — an outsider allowed only the
  // ad tool is not staff (2026-10-18, whole-app audit D-04: "Total Staff" and "Tech Member" counted one).
  const members = useMemo(() => allUsers.filter(isStaffMember), [allUsers]);
  const today = useToday();

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

  // Sales in this pay period still awaiting approval — said beside revenue, never added into it (2026-10-18).
  const awaiting = useMemo(
    () => revenueTotals(leads as Lead[], { inDay: (day) => withinPeriod(day, period) }),
    [leads, period],
  );

  // Expense by category for the pie — the same pay period as the cards above (it was every expense ever, beside
  // cards that say "this pay period"; 2026-10-18). computeProfit already groups them.
  const pieData = profit.expensesByCategory.map(({ category, amount }) => ({ name: category, value: amount }));
  const COLORS = [
    "hsl(24.6 95% 53.1%)", "hsl(217.2 91.2% 59.8%)", "hsl(142.1 70.6% 45.3%)",
    "hsl(47.9 95.8% 47.3%)", "hsl(270 91% 65%)", "hsl(0 84.2% 60.2%)",
  ];

  /*
    ── Revenue, the last 7 CALENDAR days (2026-10-18, whole-app audit D-05) ──
    The chart was the last 7 DATES THAT HAD DATA (`slice(-7)`), counted PENDING sales at full contract value and
    added the tech side's delivered value as a second "revenue" bar — beside a card that counts approved sales only.
    Now it is the one revenue rule (utils/salesRevenue — approved sales on the day each was made; owner-delegated
    decision 2026-10-18) for each of the last 7 days, today included, a quiet day showing 0.
  */
  const barData = useMemo(() => revenueSeries(leads as Lead[], lastCalendarDays(today, 7)), [leads, today]);
  const sevenDayTotal = barData.reduce((s, d) => s + d.revenue, 0);

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
        <StatBox icon={TrendingUp} label="Revenue (approved sales)" value={formatCurrency(totalRevenue)} color="text-success"
          note={awaiting.awaitingCount > 0 ? awaitingApprovalLabel(awaiting) : undefined} />
        <StatBox icon={TrendingDown} label="Expenses" value={formatCurrency(totalExpenses)} color="text-destructive" />
        <StatBox icon={Wallet} label="Salaries & incentives" value={formatCurrency(totalSalaries)} color="text-warning" />
        <StatBox icon={TrendingUp} label="Net Profit" value={formatCurrency(netProfit)} color={netProfit >= 0 ? "text-success" : "text-destructive"} />
        <StatBox icon={Users} label="Total Staff" value={members.length} color="text-info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground">Revenue (Last 7 Days)</h3>
          <p className="text-xs text-muted-foreground mb-4">Approved sales, by the day each sale was made</p>
          {sevenDayTotal === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm" data-test="accounts-7day-empty">No approved sales in the last 7 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="date" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={(v) => v.slice(5)} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tickFormatter={formatRupeeAxis} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }} formatter={(v: number) => [formatCurrency(v), ""]} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Expense Breakdown Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Expense Breakdown <span className="text-xs font-normal text-muted-foreground">· this pay period</span></h3>
          {pieData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No expenses in this pay period</div>
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

function StatBox({ icon: Icon, label, value, color, note }: { icon: any; label: string; value: string | number; color: string; note?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="font-display text-xl font-bold text-foreground">{value}</p>
      {note && <p className="text-[11px] text-muted-foreground mt-1" data-test="statbox-note">{note}</p>}
    </div>
  );
}
