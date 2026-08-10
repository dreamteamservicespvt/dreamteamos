import { useEffect, useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { AlertTriangle, CalendarPlus, Check, Clock3, Loader2, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import {
  cancelLeaveRequest, leaveWorkingDates,
  submitLeaveRequest, watchMemberLeaveRequests,
} from "@/services/leave";
import { splitLeaveDays } from "@/utils/leaveAllowance";
import type { LeaveRequest, LeaveStatus, PayrollConfig, SalaryComputation } from "@/types/payroll";

/**
 * Leave for the employee: how much paid leave is left this cycle, a form to request more, and
 * the outcome of everything they've asked for.
 *
 * The form states the leave/absence split *before* submitting. Discovering on payday that half a
 * week was recorded as absence is the single worst way to learn about an allowance.
 */

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
   * The period's salary computation — the single source of truth for leave already taken.
   *
   * Counting approved *requests* instead would miss leave an admin or team lead marked straight
   * onto the attendance grid, leaving the employee's balance disagreeing with their payslip.
   * The engine resolves leave from attendance itself, so both routes stay in sync.
   */
  computation: SalaryComputation;
}

export default function LeavePanel({ month, config, computation }: LeavePanelProps) {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "" });

  useEffect(() => {
    if (!user?.uid) return;
    return watchMemberLeaveRequests(user.uid, setRequests);
  }, [user?.uid]);

  /** Leave already taken this period, read straight off attendance. */
  const usedPaid = computation.paidLeaveDays;
  const usedUnpaid = computation.unpaidLeaveDays;
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
    const to = form.toDate || form.fromDate;
    if (to < form.fromDate) return { days: [], paid: 0, absent: 0, invalid: "End date is before the start date." };

    const days = leaveWorkingDates(form.fromDate, to);
    if (days.length === 0) return { days, paid: 0, absent: 0, invalid: "That range is only Sundays — already days off." };

    /**
     * Settled by the same rule the approval will use, so the number here is the number they get.
     *
     * Two sources, deliberately: days already approved on other requests, and — for the period
     * being viewed — the engine's own count, which also catches leave an admin marked straight
     * onto the attendance grid and which belongs to no request at all.
     */
    const split = splitLeaveDays({
      requestedDates: days,
      alreadyApprovedLeaveDates: requests
        .filter(r => r.status === "approved")
        .flatMap(r => r.leaveDates ?? leaveWorkingDates(r.fromDate, r.toDate)),
      alreadyUsedByPeriod: { [month]: usedPaid },
      quota,
      cycleStartDay: config.payDayOfMonth,
    });

    return {
      days,
      paid: split.leaveDates.length,
      absent: split.absentDates.length,
      invalid: null,
      split,
    };
  }, [form.fromDate, form.toDate, requests, month, usedPaid, quota, config.payDayOfMonth]);

  const handleSubmit = async () => {
    if (!user || !preview || preview.invalid || preview.days.length === 0) return;
    setSubmitting(true);
    try {
      await submitLeaveRequest(
        { uid: user.uid, name: user.name },
        { fromDate: form.fromDate, toDate: form.toDate || form.fromDate, reason: form.reason },
      );
      toast({ title: "Leave requested", description: "Your admin or team lead will review it." });
      setForm({ fromDate: "", toDate: "", reason: "" });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Could not submit",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
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
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-info" />
          <h2 className="font-display text-sm font-semibold text-foreground">Leave</h2>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            remaining > 0 ? "bg-info/10 text-info" : "bg-warning/15 text-warning"
          }`}>
            {usedPaid} of {quota} paid leaves used
          </span>
          {usedUnpaid > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              {usedUnpaid} unpaid
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="leave-from" className="mb-1.5 block text-[11px] font-medium text-muted-foreground">From</label>
              <input
                id="leave-from" type="date" value={form.fromDate}
                onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
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
          {preview && !preview.invalid && preview.days.length > 0 && (
            <div className={`rounded-xl border px-3.5 py-3 text-xs ${
              preview.absent > 0 ? "border-warning/40 bg-warning/10" : "border-success/30 bg-success/10"
            }`}>
              <p className="font-semibold text-foreground">
                {preview.days.length} working day{preview.days.length === 1 ? "" : "s"} requested
              </p>
              <p className="mt-1 text-muted-foreground">
                {preview.absent === 0
                  ? `All ${preview.paid} will be paid leave.`
                  : preview.paid === 0
                    ? `You've used all ${quota} paid leave days for this pay period, so ${preview.absent === 1 ? "this day counts as an absence" : `all ${preview.absent} days count as absences`} — unpaid, and recorded as absent rather than leave.`
                    : `${preview.paid} paid leave, then ${preview.absent} counted as ${preview.absent === 1 ? "an absence" : "absences"} — unpaid, and recorded as absent rather than leave.`}
              </p>
            </div>
          )}

          <button
            onClick={handleSubmit}
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
            const days = leaveWorkingDates(r.fromDate, r.toDate);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {day(r.fromDate)}{r.toDate !== r.fromDate && ` – ${day(r.toDate)}`}
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      {days.length} day{days.length === 1 ? "" : "s"}
                    </span>
                  </p>
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
