import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parse } from "date-fns";
import {
  AlertCircle, Banknote, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Coffee, Download, IndianRupee, PiggyBank, ShieldCheck, Wallet,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSalaryMonth } from "@/hooks/useSalaryMonth";
import { isBankComplete, payoutSummary, watchEmployeeBank } from "@/services/payroll";
import { formatCurrency } from "@/utils/formatters";
import { ATTENDANCE_META, type AttendanceStatus } from "@/services/techAttendance";
import BankDetailsModal from "@/components/payroll/BankDetailsModal";
import LeavePanel from "@/components/payroll/LeavePanel";
import { downloadPayslip } from "@/utils/payslipPdf";
import { currentPayMonth, deductionsFor, payPeriodLabel, shiftPayMonth } from "@/utils/payrollEngine";
import type { EmployeeBank } from "@/types/payroll";

/**
 * My Salary — the employee's single source of truth.
 *
 * Framed as a salary, not as earnings: the monthly figure is the headline, and absences/half
 * days are shown as plain subtractions from it. Answers, without any arithmetic on their part,
 * what they are paid, what attendance cost them, what lands in their account, and when.
 * Everything recomputes live from attendance — see hooks/useSalaryMonth.
 */

/** Calendar swatches, matched to the attendance status vocabulary used across the app. */
const DAY_TONE: Record<AttendanceStatus, string> = {
  full: "bg-success/20 text-success border-success/30",
  half: "bg-warning/20 text-warning border-warning/30",
  absent: "bg-destructive/15 text-destructive border-destructive/30",
  leave: "bg-info/20 text-info border-info/30",
  holiday: "bg-muted text-muted-foreground border-border",
};

export default function MySalaryDashboard() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();

  const [monthOffset, setMonthOffset] = useState(0);
  // The pay period we are IN, stepped by the ‹ › buttons — not the calendar month, which for the
  // first nine days of any month names a period that has not started (see currentPayMonth).
  const month = shiftPayMonth(currentPayMonth(), monthOffset);

  const [bank, setBank] = useState<EmployeeBank | null>(null);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankPromptDeferred, setBankPromptDeferred] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { loading, days, statusByDate, computation: c, payDay, isPastMonth, period, config } = useSalaryMonth({
    memberId: user?.uid,
    monthlySalary: user?.salary || 0,
    month,
  });

  useEffect(() => {
    if (!user?.uid) return;
    return watchEmployeeBank(user.uid, next => {
      setBank(next);
      setBankLoaded(true);
    });
  }, [user?.uid]);

  // Prompt for payout details once the record has actually loaded — never flash the blocking
  // modal at someone who already filled it in.
  const bankComplete = isBankComplete(bank);
  useEffect(() => {
    if (bankLoaded && !bankComplete && !bankPromptDeferred) setBankModalOpen(true);
  }, [bankLoaded, bankComplete, bankPromptDeferred]);

  // The span is spelled out: "July 2026" alone reads as 1–31 July to everyone who sees it.
  const monthLabel = payPeriodLabel(month, config.payDayOfMonth);

  /** Leading blanks so the period's first day lands under its real weekday. */
  const leadingBlanks = useMemo(
    () => parse(period.start, "yyyy-MM-dd", new Date()).getDay(),
    [period.start],
  );

  const selected = selectedDate ? { date: selectedDate, status: statusByDate.get(selectedDate) ?? null } : null;

  /**
   * What attendance cost, as plain subtractions from the monthly salary. Uses the shared engine
   * helper rather than repeating the arithmetic here, so the employee, the admin table and the
   * payslip can never disagree about what a day off is worth.
   */
  const { rows: deductions, total: totalDeduction } = useMemo(() => deductionsFor(c), [c]);
  const netPayable = Math.max(0, c.monthlySalary - totalDeduction);

  /**
   * What was subtracted, said in days rather than rupees ("1 day absent", not "₹385").
   * The employee sees which days cost them and what lands in their account; the rupee value of a
   * single day is deliberately never shown, because a visible daily rate makes a monthly salary
   * read like piece-work.
   */
  const deductionDays = useMemo(
    () => deductions.map(d => {
      const plural = d.days === 1 ? "day" : "days";
      switch (d.key) {
        case "half": return `${d.days} half ${plural}`;
        case "unpaid_leave": return `${d.days} ${plural} unpaid leave`;
        case "unpaid_holiday": return `${d.days} unpaid ${d.days === 1 ? "holiday" : "holidays"}`;
        default: return `${d.days} ${plural} absent`;
      }
    }).join(" · "),
    [deductions],
  );

  const handleDownloadPayslip = () => {
    if (!user) return;
    downloadPayslip({
      month,
      employeeName: user.name,
      employeeId: user.employeeId,
      role: "Tech Member",
      computation: c,
      netPayable,
      paymentMethod: bank ? payoutSummary(bank) : undefined,
    });
  };

  if (!user) return null;

  return (
    <div className="space-y-5 pb-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/25 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Wallet className="h-3 w-3" />
              Live salary
            </div>
            <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">My Salary</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              {/* The cycle is 10th→9th, so say so — a bare month name would be misleading. */}
              Salary period: <strong className="text-foreground">
                {format(parse(period.start, "yyyy-MM-dd", new Date()), "dd MMM")} – {format(parse(period.end, "yyyy-MM-dd", new Date()), "dd MMM yyyy")}
              </strong> · updates live with your attendance
            </p>
          </div>

          {/* Month navigator */}
          <div className="flex items-center gap-1 self-start rounded-xl border border-border bg-background p-1 lg:self-auto">
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              aria-label="Previous month"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span data-test="salary-period" className="min-w-[13rem] text-center text-sm font-semibold text-foreground">{monthLabel}</span>
            <button
              onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
              disabled={monthOffset >= 0}
              aria-label="Next month"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Payout details banner ──────────────────────────────────────── */}
      {bankLoaded && !bankComplete && (
        <button
          onClick={() => setBankModalOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5 text-left transition-colors hover:bg-warning/15"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Add your payout details</p>
            <p className="text-xs text-muted-foreground">
              Your salary is being calculated, but we can't transfer it until we know where to send it.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-warning" />
        </button>
      )}

      {loading ? (
        <SalarySkeleton />
      ) : (
        <>
          {/* ── Hero: salary, minus what attendance cost ─────────────────── */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
              {/* Your salary is the headline. Deductions are subtracted from it — never framed
                  as "earned so far", which reads like piece-work rather than a salary. */}
              <p className="text-xs font-medium text-muted-foreground">Your monthly salary</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-foreground md:text-4xl">
                {formatCurrency(c.monthlySalary)}
              </p>

              {/* Deductions */}
              <div className="mt-4 space-y-1.5 border-t border-border pt-4">
                {deductions.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    No deductions — full salary
                  </p>
                ) : (
                  deductions.map(d => (
                    <div key={d.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{d.label}</span>
                      {/* Days, never rupees — the day is the fact the employee can act on. */}
                      <span className="shrink-0 font-medium tabular-nums text-destructive">
                        {d.days} {d.days === 1 ? "day" : "days"}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Net payable */}
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {isPastMonth ? "Final salary" : "Salary payable"}
                  </p>
                  {deductionDays && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatCurrency(c.monthlySalary)} − {deductionDays} deducted
                    </p>
                  )}
                </div>
                <span className="font-display text-2xl font-bold tabular-nums text-success md:text-3xl">
                  {formatCurrency(netPayable)}
                </span>
              </div>
            </div>

            {/* Pay day */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5">
              <div>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarClock className="h-4.5 w-4.5" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Next salary date</p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">
                  {format(payDay.date, "dd MMM yyyy")}
                </p>
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <p className="font-display text-2xl font-bold tabular-nums text-primary">
                  {payDay.daysRemaining === 0 ? "Today" : `${payDay.daysRemaining} days`}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {payDay.daysRemaining === 0
                    ? "Salary is being processed"
                    : `until payday · covering ${format(parse(payDay.payingForMonth, "yyyy-MM", new Date()), "MMMM")}`}
                </p>
              </div>
            </div>
          </section>

          {/* ── Stat grid ─────────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat icon={CalendarDays} label="Working Days" value={c.workingDays} />
            <Stat icon={CheckCircle2} label="Full Days" value={c.fullDays} tone="success" />
            <Stat icon={Clock} label="Half Days" value={c.halfDays} tone={c.halfDays ? "warning" : undefined} />
            <Stat icon={AlertCircle} label="Absent" value={c.absentDays} tone={c.absentDays ? "destructive" : undefined} />
            <Stat icon={Coffee} label="Paid Leave Left" value={`${c.paidLeavesRemaining}/${c.paidLeaveQuota}`}
              tone="info" hint={c.unpaidLeaveDays ? `${c.unpaidLeaveDays} unpaid` : undefined} />
            <Stat icon={PiggyBank} label="Attendance" value={`${Math.round(c.attendancePercent)}%`}
              tone={c.attendancePercent >= 90 ? "success" : c.attendancePercent >= 75 ? "warning" : "destructive"} />
          </section>

          <div className="grid gap-5">
            {/* ── Calendar ──────────────────────────────────────────────── */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold text-foreground">Attendance</h2>
                </div>
                <span className="text-[11px] text-muted-foreground">Tap a day for details</span>
              </header>

              <div className="p-3 md:p-4">
                <div className="mb-1.5 grid grid-cols-7 gap-1">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <span key={i} className="py-1 text-center text-[10px] font-semibold text-muted-foreground">{d}</span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: leadingBlanks }).map((_, i) => <span key={`blank-${i}`} />)}

                  {days.map(({ date, status }) => {
                    const dayNum = Number(date.slice(-2));
                    const isToday = date === format(new Date(), "yyyy-MM-dd");
                    const isFuture = date > format(new Date(), "yyyy-MM-dd");
                    const isSelected = selectedDate === date;

                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(isSelected ? null : date)}
                        aria-label={`${format(parse(date, "yyyy-MM-dd", new Date()), "d MMMM")}${status ? ` — ${ATTENDANCE_META[status].label}` : ""}`}
                        aria-pressed={isSelected}
                        className={`relative aspect-square rounded-lg border text-xs font-semibold transition-all hover:scale-105 ${
                          status ? DAY_TONE[status] : isFuture
                            ? "border-border/50 bg-background text-muted-foreground/40"
                            : "border-dashed border-border bg-background text-muted-foreground"
                        } ${isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""} ${
                          isToday ? "outline outline-2 outline-offset-1 outline-primary" : ""
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border pt-3">
                  {(Object.keys(ATTENDANCE_META) as AttendanceStatus[]).map(s => (
                    <span key={s} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={`h-2.5 w-2.5 rounded border ${DAY_TONE[s]}`} />
                      {ATTENDANCE_META[s].label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Selected day detail — the day's status only. A per-day rupee figure reads like
                  piece-work rather than a salary, so the money stays at the salary level. */}
              {selected && (
                <div className="border-t border-border bg-accent/25 px-4 py-3.5 md:px-5">
                  <p className="text-sm font-semibold text-foreground">
                    {format(parse(selected.date, "yyyy-MM-dd", new Date()), "EEEE, d MMMM")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected.status
                      ? ATTENDANCE_META[selected.status].label
                      : selected.date > format(new Date(), "yyyy-MM-dd")
                        ? "Upcoming working day"
                        : "Not recorded yet"}
                  </p>
                </div>
              )}
            </section>
          </div>

          <LeavePanel month={month} config={config} computation={c} />

          {/* ── Payout details ──────────────────────────────────────────────
              Deliberately the loudest card on the page. This is the one thing on the salary
              screen only the employee can fix, and stale bank details are what actually stops a
              salary from landing — so it carries the accent border and the filled button, and
              the payslip download steps back to a plain outline. */}
          <section className={`rounded-2xl border-2 p-4 shadow-sm md:p-5 ${
            bankComplete
              ? "border-primary/40 bg-gradient-to-br from-card via-card to-primary/5"
              : "border-warning/60 bg-warning/5 ring-4 ring-warning/10"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                  bankComplete ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning"
                }`}>
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-sm font-semibold text-foreground md:text-base">
                      {bankComplete ? "Your payout details" : "Add your payout details"}
                    </h2>
                    {bank?.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        <ShieldCheck className="h-2.5 w-2.5" /> Verified
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        bankComplete ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning"
                      }`}>
                        {bankComplete ? "Keep this up to date" : "Action needed"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {bankComplete
                      ? <>Salary is transferred to <strong className="text-foreground">{payoutSummary(bank)}</strong></>
                      : "We can't transfer your salary until we know where to send it."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => navigate("/tech/salary/receipts")}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Payment history
                </button>
                <button
                  onClick={handleDownloadPayslip}
                  className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Salary slip
                </button>
                <button
                  onClick={() => setBankModalOpen(true)}
                  className={`rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${
                    bankComplete ? "" : "ring-2 ring-warning/50"
                  }`}
                >
                  {bank?.verified ? "View bank details" : bankComplete ? "Update bank details" : "Add bank details"}
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
        onClose={() => {
          setBankModalOpen(false);
          if (!bankComplete) setBankPromptDeferred(true);
        }}
      />
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint, tone,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "success" | "warning" | "destructive" | "info";
}) {
  const toneClass = tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : tone === "destructive" ? "text-destructive"
    : tone === "info" ? "text-info"
    : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/30">
      <Icon className={`mb-2 h-4 w-4 ${tone ? toneClass : "text-muted-foreground"}`} />
      <p className={`font-display text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SalarySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading salary">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
