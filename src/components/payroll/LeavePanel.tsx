import { useEffect, useMemo, useRef, useState } from "react";
import { format, parse } from "date-fns";
import { AlertTriangle, CalendarPlus, Check, Clock3, Loader2, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import {
  approvedLeaveOnRequests, cancelLeaveRequest, isHalfDayLeave, leaveWorkingDates, requestWorkingDates,
  submitLeaveRequest, watchMemberLeaveRequests,
} from "@/services/leave";
import { isWholeDaySplit, splitLeaveDays, type LeaveSplit } from "@/utils/leaveAllowance";
import { formatDayCount, formatDays, paidLeaveUsed } from "@/utils/payrollEngine";
import type { LeaveDuration, LeaveRequest, LeaveStatus, PayrollConfig, SalaryComputation } from "@/types/payroll";

/**
 * Leave for the employee: how much paid leave is left this cycle, a form to request more, and
 * the outcome of everything they've asked for.
 *
 * The form states the leave/absence split *before* submitting. Discovering on payday that half a
 * week was recorded as absence is the single worst way to learn about an allowance.
 *
 * ── Full day or half day (owner, 2026-10-12) ─────────────────────────────────────────────────
 * The form asks first how much of a day: Full day (one or more whole days, From → To, as always) or Half day
 * (ONE working day, of which the member works the other half). A half day takes half a day of the same allowance —
 * inside it the day is paid in full; past it the day is recorded and paid as a half day — and the preview says
 * which before anything is sent. Tech members (/tech/salary) and sales members (/sales/salary) share this panel.
 */

const DURATIONS: { value: LeaveDuration; label: string }[] = [
  { value: "full_day", label: "Full day" },
  { value: "half_day", label: "Half day" },
];

const EMPTY_FORM = { duration: "full_day" as LeaveDuration, fromDate: "", toDate: "", reason: "" };

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What a drafted request will cost, in words — the sentences under the dates. Whole-day requests keep the
 * sentences they always had; a half day says whether it comes from the allowance or costs pay.
 */
function previewWords(split: LeaveSplit, quota: number, halfDayFactor: number): string {
  // A half day: from the allowance (paid in full) or past it (a half day's pay).
  if (split.days.length === 1 && split.days[0].share < 1) {
    if (split.days[0].paid > 0) {
      return "This half day comes out of your paid leave allowance (half a day of it). You work the other half, and the day is paid in full.";
    }
    const cost = 1 - halfDayFactor;
    const costWords = Math.abs(cost - 0.5) < 1e-9 ? "half a day's pay" : `${Math.round(cost * 100)}% of a day's pay`;
    return `You've used all ${formatDayCount(quota)} paid leave days for this pay period, so this half day is not paid leave — it is recorded as a half day and costs ${costWords}.`;
  }

  if (isWholeDaySplit(split)) {
    const paid = split.leaveDates.length;
    const absent = split.absentDates.length;
    return absent === 0
      ? `All ${paid} will be paid leave.`
      : paid === 0
        ? `You've used all ${quota} paid leave days for this pay period, so ${absent === 1 ? "this day counts as an absence" : `all ${absent} days count as absences`} — unpaid, and recorded as absent rather than leave.`
        : `${paid} paid leave, then ${absent} counted as ${absent === 1 ? "an absence" : "absences"} — unpaid, and recorded as absent rather than leave.`;
  }

  // Full days where the allowance runs out halfway through one of them: that day is half paid, half unpaid leave.
  const absent = split.absentDates.length;
  const absentNote = absent > 0 ? `, and ${absent === 1 ? "1 day is" : `${absent} days are`} recorded as absent rather than leave` : "";
  return `${capitalise(formatDays(split.paidDays))} of paid leave, then ${formatDays(split.unpaidDays)} unpaid — your allowance runs out halfway through a day, so that day is half paid${absentNote}.`;
}

const STATUS_TONE: Record<LeaveStatus, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

interface LeavePanelProps {
  /** `yyyy-MM` pay period being viewed. */
  month: string;
  config: PayrollConfig;
  /**
   * The period's LIVE salary computation (from attendance as it is now) — the single source of truth for
   * leave already taken.
   *
   * Counting approved *requests* instead would miss leave an admin or team lead marked straight
   * onto the attendance grid, leaving the employee's balance disagreeing with their payslip.
   * The engine resolves leave from attendance itself, so both routes stay in sync.
   *
   * Never the paid snapshot (2026-10-15): once a period was paid the pages passed the frozen payment, so
   * leave approved after payday still read "0 of 2 paid leaves used" and a new request was previewed as
   * if the allowance were untouched — while the approval itself counts the attendance record.
   */
  computation: SalaryComputation;
}

export default function LeavePanel({ month, config, computation }: LeavePanelProps) {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** A second tap while the first request is still being written must not send it twice. */
  const inFlight = useRef(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const halfDay = form.duration === "half_day";

  useEffect(() => {
    if (!user?.uid) return;
    return watchMemberLeaveRequests(user.uid, setRequests);
  }, [user?.uid]);

  /**
   * Leave already taken this period, read straight off attendance — in days, so a half-day leave counts ½ and the
   * header can read "1½ of 2 paid leaves used".
   */
  const usedPaid = paidLeaveUsed(computation);
  const usedUnpaid = computation.unpaidLeaveDays + 0.5 * (computation.unpaidHalfLeaveDays ?? 0);
  const quota = config.paidLeaveQuota;
  const remaining = Math.max(0, quota - usedPaid);

  /**
   * Working days the drafted request would consume, split into paid and unpaid.
   *
   * Requesting beyond the quota is allowed on purpose — the extra days simply become unpaid, and
   * the split is stated up front so nobody discovers it on payday.
   */
  const preview = useMemo(() => {
    if (!form.fromDate) return null;
    // A half day is the one date; the To field is not even shown.
    const to = halfDay ? form.fromDate : (form.toDate || form.fromDate);
    if (to < form.fromDate) return { days: [] as string[], split: null, invalid: "End date is before the start date." };

    const days = leaveWorkingDates(form.fromDate, to);
    if (days.length === 0) {
      return {
        days,
        split: null,
        invalid: halfDay
          ? "That day is a Sunday — already a day off. Pick a working day."
          : "That range is only Sundays — already days off.",
      };
    }

    /**
     * Settled by the same rule the approval will use, so the number here is the number they get.
     *
     * Two sources, deliberately: days already approved on other requests (a half-day request's day as half a
     * day), and — for the period being viewed — the engine's own count, which also catches leave an admin marked
     * straight onto the attendance grid and which belongs to no request at all.
     */
    const onRequests = approvedLeaveOnRequests(requests);
    const split = splitLeaveDays({
      requestedDates: days,
      duration: form.duration,
      alreadyApprovedLeaveDates: onRequests.full,
      alreadyApprovedHalfLeaveDates: onRequests.half,
      alreadyUsedByPeriod: { [month]: usedPaid },
      quota,
      cycleStartDay: config.payDayOfMonth,
    });

    return { days, split, invalid: null };
  }, [form.fromDate, form.toDate, form.duration, halfDay, requests, month, usedPaid, quota, config.payDayOfMonth]);

  const handleSubmit = async () => {
    if (!user || !preview || preview.invalid || preview.days.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await submitLeaveRequest(
        { uid: user.uid, name: user.name },
        {
          fromDate: form.fromDate,
          toDate: halfDay ? form.fromDate : (form.toDate || form.fromDate),
          reason: form.reason,
          duration: form.duration,
        },
      );
      toast({
        title: halfDay ? "Half-day leave requested" : "Leave requested",
        description: "Your admin or team lead will review it.",
      });
      setForm(EMPTY_FORM);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Could not submit",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleCancel = async (request: LeaveRequest) => {
    if (!user) return;
    try {
      await cancelLeaveRequest(request, { uid: user.uid, name: user.name });
      toast({ title: "Request withdrawn" });
    } catch {
      toast({ title: "Could not withdraw request", variant: "destructive" });
    }
  };

  const day = (d: string) => format(parse(d, "yyyy-MM-dd", new Date()), "dd MMM");

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-info" />
          <h2 className="font-display text-sm font-semibold text-foreground">Leave</h2>
          {/* In days: a half-day leave is ½ of the allowance, so "1½ of 2" is a real answer now. */}
          <span data-test="leave-used" className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            remaining > 0 ? "bg-info/10 text-info" : "bg-warning/15 text-warning"
          }`}>
            {formatDayCount(usedPaid)} of {formatDayCount(quota)} paid leaves used
          </span>
          {usedUnpaid > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              {formatDayCount(usedUnpaid)} unpaid
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {open ? "Cancel" : "Apply for leave"}
        </button>
      </header>

      {/* Request form */}
      {open && (
        <div className="space-y-3 border-b border-border bg-accent/20 px-4 py-4 md:px-5">
          {/* How much of a day — asked first, because it decides which dates the form wants. */}
          <div>
            <p id="leave-duration-label" className="mb-1.5 text-[11px] font-medium text-muted-foreground">How long</p>
            <div role="radiogroup" aria-labelledby="leave-duration-label"
              className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1 sm:inline-grid sm:w-auto">
              {DURATIONS.map(d => {
                const on = form.duration === d.value;
                return (
                  <button key={d.value} type="button" role="radio" aria-checked={on} data-test={`leave-duration-${d.value}`}
                    // Leaving Half day drops nothing; entering it drops a To date it would never use.
                    onClick={() => setForm(f => ({ ...f, duration: d.value, toDate: d.value === "half_day" ? "" : f.toDate }))}
                    className={`h-9 min-w-[7rem] rounded-lg px-4 text-xs font-semibold transition-colors ${
                      on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}>
                    {d.label}
                  </button>
                );
              })}
            </div>
            {halfDay && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                One working day: you work one half and take the other half off. It uses half a day of your paid leave.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="leave-from" className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                {halfDay ? "Date" : "From"}
              </label>
              <input
                id="leave-from" type="date" value={form.fromDate}
                onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {/* A half day is one date — no To. */}
            {!halfDay && (
              <div>
                <label htmlFor="leave-to" className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  To <span className="text-muted-foreground/60">(same day if blank)</span>
                </label>
                <input
                  id="leave-to" type="date" value={form.toDate} min={form.fromDate}
                  onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="leave-reason" className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Reason</label>
            <textarea
              id="leave-reason" rows={2} value={form.reason} placeholder="Briefly, so your lead can decide quickly"
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Paid / unpaid preview — the whole point of this panel */}
          {preview?.invalid && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {preview.invalid}
            </p>
          )}
          {preview && !preview.invalid && preview.split && preview.days.length > 0 && (
            <div data-test="leave-preview" className={`rounded-xl border px-3.5 py-3 text-xs ${
              preview.split.unpaidDays > 0 ? "border-warning/40 bg-warning/10" : "border-success/30 bg-success/10"
            }`}>
              <p className="font-semibold text-foreground">
                {halfDay
                  ? `Half a day requested · ${day(preview.days[0])}`
                  : `${preview.days.length} working day${preview.days.length === 1 ? "" : "s"} requested`}
              </p>
              <p className="mt-1 text-muted-foreground">
                {previewWords(preview.split, quota, config.halfDayFactor)}
              </p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            data-test="leave-submit"
            disabled={submitting || !preview || !!preview.invalid || preview.days.length === 0}
            className="flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Submit request
          </button>
        </div>
      )}

      {/* History */}
      {requests.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground md:px-5">
          No leave requests yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {requests.slice(0, 6).map(r => {
            const days = requestWorkingDates(r);
            return (
              <div key={r.id} data-test="leave-history-row" className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0 flex-1">
                  {isHalfDayLeave(r) ? (
                    <p className="text-sm font-medium text-foreground">Half day · {day(r.fromDate)}</p>
                  ) : (
                    <p className="text-sm font-medium text-foreground">
                      {day(r.fromDate)}{r.toDate !== r.fromDate && ` – ${day(r.toDate)}`}
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        {days.length} day{days.length === 1 ? "" : "s"}
                      </span>
                    </p>
                  )}
                  {r.reason && <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.reason}</p>}
                  {r.reviewNote && (
                    <p className="mt-0.5 text-xs text-destructive">Note: {r.reviewNote}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${STATUS_TONE[r.status]}`}>
                  {r.status === "pending" && <Clock3 className="mr-1 inline h-2.5 w-2.5" />}
                  {r.status}
                </span>
                {r.status === "pending" && (
                  <button
                    onClick={() => handleCancel(r)}
                    aria-label="Withdraw request"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
