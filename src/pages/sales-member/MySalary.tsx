import { useEffect, useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { currentPayMonth, payPeriodLabel, shiftPayMonth } from "@/utils/payrollEngine";
import {
  AlertCircle, Banknote, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Download, IndianRupee, ShieldCheck, TrendingUp, Wallet,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSalesEarnings } from "@/hooks/useSalesEarnings";
import { isBankComplete, payoutSummary, watchEmployeeBank } from "@/services/payroll";
import { formatCurrency } from "@/utils/formatters";
import { downloadPayslip } from "@/utils/payslipPdf";
import BankDetailsModal from "@/components/payroll/BankDetailsModal";
import LeavePanel from "@/components/payroll/LeavePanel";
import SalesEarningsCard from "@/components/sales/SalesEarningsCard";
import type { EmployeeBank } from "@/types/payroll";

/**
 * My Salary — sales member.
 *
 * Same salary engine as tech, plus commission on verified sales. The two halves are shown
 * separately all the way to the total: a sales member needs to see what is guaranteed and what
 * they earned, not one blended number.
 */
export default function SalesMySalary() {
  const user = useAuthStore(s => s.user);

  const [monthOffset, setMonthOffset] = useState(0);
  // The period we are IN, stepped by the ‹ › buttons. Reading the calendar month here is what
  // showed every sales member ₹0 for the first nine days of each month — see currentPayMonth.
  const month = shiftPayMonth(currentPayMonth(), monthOffset);

  const [bank, setBank] = useState<EmployeeBank | null>(null);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankDeferred, setBankDeferred] = useState(false);

  const earnings = useSalesEarnings({
    memberId: user?.uid,
    monthlySalary: user?.salary || 0,
    earningsOption: user?.earningsOption,
    month,
  });

  const { salary, salaryPayable, salaryDeduction, commission, totalEarnings } = earnings;
  const c = salary.computation;

  useEffect(() => {
    if (!user?.uid) return;
    return watchEmployeeBank(user.uid, next => { setBank(next); setBankLoaded(true); });
  }, [user?.uid]);

  const bankComplete = isBankComplete(bank);
  useEffect(() => {
    if (bankLoaded && !bankComplete && !bankDeferred) setBankModalOpen(true);
  }, [bankLoaded, bankComplete, bankDeferred]);

  // "July 2026 (10 Jul – 09 Aug)" — the span is spelled out because calling 10 Jul → 9 Aug "July"
  // with no dates is what made the team think a month of their commission had gone missing.
  const monthLabel = payPeriodLabel(month, salary.config.payDayOfMonth);
  const day = (d: string) => format(parse(d, "yyyy-MM-dd", new Date()), "dd MMM");

  const handlePayslip = () => {
    if (!user) return;
    downloadPayslip({
      month,
      employeeName: user.name,
      employeeId: user.employeeId,
      role: "Sales Member",
      computation: c,
      netPayable: totalEarnings,
      paymentMethod: bank ? payoutSummary(bank) : undefined,
    });
  };

  if (!user) return null;

  return (
    <div className="space-y-5 pb-8">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/25 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Wallet className="h-3 w-3" /> Salary + incentives
            </div>
            <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">My Salary</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Period <strong className="text-foreground">{day(salary.period.start)} – {day(salary.period.end)}</strong>
              {" "}· updates live with attendance and verified sales
            </p>
          </div>

          <div className="flex items-center gap-1 self-start rounded-xl border border-border bg-background p-1 lg:self-auto">
            <button onClick={() => setMonthOffset(o => o - 1)} aria-label="Previous month"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span data-test="salary-period" className="min-w-[13rem] text-center text-sm font-semibold text-foreground">{monthLabel}</span>
            <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset >= 0}
              aria-label="Next month"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {bankLoaded && !bankComplete && (
        <button onClick={() => setBankModalOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5 text-left transition-colors hover:bg-warning/15">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Add your payout details</p>
            <p className="text-xs text-muted-foreground">We can't transfer your pay until we know where to send it.</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-warning" />
        </button>
      )}

      {earnings.loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : (
        <>
          {/* Total pay */}
          {/* The total is always attributed to a named span — "this period" on its own is what
              let a member read July's pay as August's and conclude it had gone missing. */}
          <SalesEarningsCard totalEarnings={totalEarnings} salaryPayable={salaryPayable}
            commission={commission} subtitle={monthLabel} />

          <section className="grid gap-4 lg:grid-cols-2">
            {/* Salary half */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <Banknote className="h-4 w-4 text-primary" /> Salary
              </h2>
              {/* Full salary leads — what you're on, before anything comes off it. */}
              <p className="font-display text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(c.monthlySalary)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Your monthly salary</p>

              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                {salaryDeduction === 0 ? (
                  <p className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="h-4 w-4" /> No deductions — full salary
                  </p>
                ) : (
                  <>
                    {c.absentDays > 0 && <DeductLine label="Absent" days={c.absentDays} amount={c.absentDays * c.dailySalary} />}
                    {c.halfDays > 0 && <DeductLine label="Half days" days={c.halfDays} amount={c.halfDays * c.dailySalary * 0.5} />}
                    {c.unpaidLeaveDays > 0 && <DeductLine label="Unpaid leave" days={c.unpaidLeaveDays} amount={c.unpaidLeaveDays * c.dailySalary} />}
                  </>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold text-foreground">Salary payable</span>
                <span className="font-display text-lg font-bold tabular-nums text-foreground">
                  {formatCurrency(salaryPayable)}
                </span>
              </div>
            </div>

            {/* Commission half */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <TrendingUp className="h-4 w-4 text-success" /> Commission
              </h2>
              <p className="font-display text-2xl font-bold tabular-nums text-success">
                {formatCurrency(commission)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {earnings.rate}% of {formatCurrency(earnings.salesBase)} in verified sales
              </p>

              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Verified sales</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {earnings.saleCount} · {formatCurrency(earnings.salesBase)}
                  </span>
                </div>
                {earnings.pendingSaleCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-warning">
                      <Clock className="h-3 w-3" /> Awaiting verification
                    </span>
                    <span className="font-mono tabular-nums text-warning">
                      {earnings.pendingSaleCount} · {formatCurrency(earnings.pendingSaleValue)}
                    </span>
                  </div>
                )}
              </div>

              {earnings.pendingSaleCount > 0 && (
                <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  Pending sales don't earn commission until your admin verifies them. Verified,
                  they would add about {formatCurrency(Math.round((earnings.pendingSaleValue * earnings.rate) / 100))}.
                </p>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={CheckCircle2} label="Full Days" value={c.fullDays} />
            <Stat icon={Clock} label="Half Days" value={c.halfDays} />
            <Stat icon={AlertCircle} label="Absent" value={c.absentDays} />
            <Stat icon={CalendarClock} label="Next Pay Day"
              value={salary.payDay.daysRemaining === 0 ? "Today" : `${salary.payDay.daysRemaining}d`}
              hint={format(salary.payDay.date, "dd MMM")} />
          </section>

          <LeavePanel month={month} config={salary.config} computation={c} />

          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  bankComplete ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-semibold text-foreground">Payout details</h2>
                    {bank?.accounts?.some(a => a.verified) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        <ShieldCheck className="h-2.5 w-2.5" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{payoutSummary(bank)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setBankModalOpen(true)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                  {bankComplete ? "Update" : "Add details"}
                </button>
                <button onClick={handlePayslip}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  <Download className="h-3.5 w-3.5" /> Salary slip
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <BankDetailsModal
        open={bankModalOpen}
        bank={bank}
        required={!bankComplete}
        onClose={() => { setBankModalOpen(false); if (!bankComplete) setBankDeferred(true); }}
      />
    </div>
  );
}

/**
 * One deduction line: what it was, how many days, what it cost.
 *
 * Takes the finished amount rather than a per-day rate — showing the divisor made salary read
 * like piece-work, which is the one thing the team objected to.
 */
function DeductLine({ label, days, amount }: { label: string; days: number; amount: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">
        {label} <span className="text-[11px]">({days} {days === 1 ? "day" : "days"})</span>
      </span>
      <span className="font-mono tabular-nums text-destructive">−{formatCurrency(amount)}</span>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint,
}: { icon: typeof IndianRupee; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <Icon className="mb-2 h-4 w-4 text-muted-foreground" />
      <p className="font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
