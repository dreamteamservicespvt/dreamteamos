import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ArrowDownRight, ArrowUpRight, Banknote, Briefcase, Loader2, Phone, PiggyBank, Receipt, TrendingUp, Wallet,
} from "lucide-react";
import { db } from "@/services/firebase";
import { useFirestoreCollection } from "@/hooks/useFirestore";
import { formatCurrency } from "@/utils/formatters";
import PeriodFilterBar from "@/components/dashboard/PeriodFilterBar";
import { defaultPeriodFilter, periodLabel, type PeriodFilter } from "@/utils/periodFilter";
import { computeProfit, salaryMonthsFor, type ExpenseRecord, type OtherIncomeRecord } from "@/utils/profitAnalytics";
import type { AppUser, Lead, WorkAssignment } from "@/types";

/**
 * Profit & Loss — what the company earned, what it cost, and what is left.
 *
 * Sales bring revenue in and tech delivers it, so both departments are shown against their own
 * cost. Delivered ad value is reported as productivity but never added to income: the same rupee
 * would otherwise be counted twice, once when sold and again when delivered.
 */
export default function Profit() {
  const { data: users, loading: usersLoading } = useFirestoreCollection<AppUser>("users");
  const { data: leads, loading: leadsLoading } = useFirestoreCollection<Lead>("leads");
  const { data: assignments } = useFirestoreCollection<WorkAssignment>("work_assignments");

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [otherIncome, setOtherIncome] = useState<OtherIncomeRecord[]>([]);
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "expenses"), snap =>
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExpenseRecord)))),
      onSnapshot(collection(db, "other_income"), snap =>
        setOtherIncome(snap.docs.map(d => ({ id: d.id, ...d.data() } as OtherIncomeRecord))),
        () => setOtherIncome([])),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  /** Earliest sale date, so a career view charges the salary months actually elapsed. */
  const earliestDate = useMemo(() => {
    let earliest: string | undefined;
    for (const lead of leads) {
      const seconds = (lead.createdAt as { seconds?: number })?.seconds;
      if (!seconds) continue;
      const date = new Date(seconds * 1000).toISOString().slice(0, 10);
      if (!earliest || date < earliest) earliest = date;
    }
    return earliest;
  }, [leads]);

  const profit = useMemo(() => computeProfit({
    filter, users, leads, assignments, expenses, otherIncome,
    salaryMonths: salaryMonthsFor(filter, earliestDate),
  }), [filter, users, leads, assignments, expenses, otherIncome, earliestDate]);

  if (usersLoading || leadsLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const profitable = profit.netProfit >= 0;

  return (
    <div className="space-y-5 pb-8">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/25 p-4 shadow-sm md:p-5">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <PiggyBank className="h-3 w-3" /> Company performance
        </div>
        <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">Profit &amp; Loss</h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          What sales brought in, what the team cost, and what is left — for {periodLabel(filter).toLowerCase()}.
        </p>
      </header>

      <PeriodFilterBar value={filter} onChange={setFilter} />

      {/* Bottom line */}
      <section className={`rounded-2xl border p-5 ${
        profitable ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
      }`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Net {profitable ? "profit" : "loss"}</p>
            <p className={`mt-1 font-display text-3xl font-bold tabular-nums md:text-4xl ${
              profitable ? "text-success" : "text-destructive"
            }`}>
              {formatCurrency(Math.abs(profit.netProfit))}
            </p>
            {profit.marginPercent !== null && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {profitable ? <ArrowUpRight className="h-3.5 w-3.5 text-success" /> : <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
                {profit.marginPercent}% margin on {formatCurrency(profit.totalIncome)} income
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <p className="text-[11px] text-muted-foreground">Income</p>
              <p className="font-display text-lg font-bold tabular-nums text-foreground">{formatCurrency(profit.totalIncome)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Cost</p>
              <p className="font-display text-lg font-bold tabular-nums text-foreground">{formatCurrency(profit.totalCost)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="grid gap-4 lg:grid-cols-2">
        <DeptCard
          icon={Phone}
          title="Sales"
          subtitle={`${profit.salesCount} verified sale${profit.salesCount === 1 ? "" : "s"}`}
          headline={formatCurrency(profit.salesRevenue)}
          headlineLabel="Revenue brought in"
          rows={[
            { label: "Salary", amount: profit.salesSalary },
            { label: "Commission", amount: profit.salesCommission },
          ]}
          ratio={profit.salesRevenueRatio}
          ratioLabel="revenue per rupee of sales cost"
        />
        <DeptCard
          icon={Briefcase}
          title="Tech"
          subtitle={`${profit.techVideosDelivered} video${profit.techVideosDelivered === 1 ? "" : "s"} delivered`}
          headline={formatCurrency(profit.techDeliveredValue)}
          headlineLabel="Value delivered"
          rows={[{ label: "Salary", amount: profit.techSalary }]}
          ratio={profit.techRevenueRatio}
          ratioLabel="delivered per rupee of tech salary"
          note="Delivered value is productivity, not extra income — it is already counted in sales revenue."
        />
      </section>

      {/* Money in / out */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-success" /> Money in
          </h2>
          <Line label="Sales revenue" amount={profit.salesRevenue} />
          <Line label="Other income" amount={profit.otherIncome} muted={profit.otherIncome === 0} />
          <Line label="Total income" amount={profit.totalIncome} bold />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-destructive" /> Money out
          </h2>
          <Line label="Tech salary" amount={profit.techSalary} negative />
          <Line label="Sales salary" amount={profit.salesSalary} negative />
          <Line label="Sales commission" amount={profit.salesCommission} negative />
          <Line label="Expenses" amount={profit.expenses} negative />
          <Line label="Total cost" amount={profit.totalCost} negative bold />
        </div>
      </section>

      {/* Expense breakdown */}
      {profit.expensesByCategory.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <Receipt className="h-4 w-4 text-muted-foreground" /> Expenses by category
          </h2>
          <div className="space-y-2">
            {profit.expensesByCategory.map(({ category, amount }) => {
              const share = profit.expenses > 0 ? (amount / profit.expenses) * 100 : 0;
              return (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{category}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-destructive/60" style={{ width: `${share}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatCurrency(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-border bg-accent/20 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Salary is prorated to the length of the selected period, so a single day is charged one
        day of salary rather than a whole month. Only verified sales count as income.
      </p>
    </div>
  );
}

function DeptCard({
  icon: Icon, title, subtitle, headline, headlineLabel, rows, ratio, ratioLabel, note,
}: {
  icon: typeof Phone;
  title: string;
  subtitle: string;
  headline: string;
  headlineLabel: string;
  rows: { label: string; amount: number }[];
  ratio: number | null;
  ratioLabel: string;
  note?: string;
}) {
  const cost = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        {ratio !== null && (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold ${
            ratio >= 200 ? "bg-success/15 text-success"
              : ratio >= 100 ? "bg-warning/15 text-warning"
              : "bg-destructive/15 text-destructive"
          }`}>
            {ratio}%
          </span>
        )}
      </div>

      <p className="font-display text-2xl font-bold tabular-nums text-foreground">{headline}</p>
      <p className="text-[11px] text-muted-foreground">{headlineLabel}</p>

      <div className="mt-3 space-y-1 border-t border-border pt-3">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-mono tabular-nums text-destructive">−{formatCurrency(r.amount)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-xs font-semibold">
          <span className="text-foreground">Total cost</span>
          <span className="font-mono tabular-nums text-foreground">{formatCurrency(cost)}</span>
        </div>
      </div>

      {ratio !== null && (
        <p className="mt-2 text-[11px] text-muted-foreground">{ratio}% {ratioLabel}</p>
      )}
      {note && <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">{note}</p>}
    </div>
  );
}

function Line({
  label, amount, negative, bold, muted,
}: { label: string; amount: number; negative?: boolean; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${bold ? "mt-1 border-t border-border pt-2.5 font-semibold" : ""}`}>
      <span className={muted ? "text-muted-foreground/60" : "text-muted-foreground"}>{label}</span>
      <span className={`font-mono tabular-nums ${
        bold ? "text-foreground" : negative ? "text-destructive" : muted ? "text-muted-foreground/60" : "text-foreground"
      }`}>
        {negative && amount > 0 ? "−" : ""}{formatCurrency(amount)}
      </span>
    </div>
  );
}
