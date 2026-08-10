import { useEffect, useState } from "react";
import { format, parse } from "date-fns";
import { Check, Clock3, Loader2, Undo2, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import {
  approveLeaveRequest, leaveWorkingDates, rejectLeaveRequest, undoLeaveDecision,
  watchPendingLeaveRequests,
} from "@/services/leave";
import { splitLeaveDays, describeLeaveSplit } from "@/utils/leaveAllowance";
import type { LeaveRequest } from "@/types/payroll";

/**
 * Pending leave, for whoever can decide — tech admin or team lead.
 *
 * Approving writes onto those attendance days, which immediately moves the employee's salary.
 * That makes it a money decision, so the panel states up front how the request will actually
 * settle — two paid leave days per pay period, everything past them an absence — and every
 * decision is reversible from here.
 *
 * The warning on a row is a FLOOR, not a forecast — see `splitFor`. The binding split is computed
 * at approval against the member's live record, and reported back in the toast.
 */

interface LeaveApprovalsPanelProps {
  /** Restrict to these member ids (a team lead sees only their own team). Omit for everyone. */
  visibleMemberIds?: Set<string>;
}

export default function LeaveApprovalsPanel({ visibleMemberIds }: LeaveApprovalsPanelProps) {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<LeaveRequest | null>(null);

  useEffect(() => watchPendingLeaveRequests(setRequests), []);

  /**
   * The absence this request causes ON ITS OWN — a floor, never the final figure.
   *
   * This panel watches PENDING requests only, so it cannot see what the member has already had
   * approved in the same pay period. Estimating from what it holds would therefore under-report,
   * and quietly: an approver would be shown "all paid" for somebody with no allowance left. So the
   * panel claims only what a request proves by itself — more than two days in one period must
   * produce an absence whatever the history — and says "at least".
   *
   * The real split is computed at approval, which reads the member's live record, and both the
   * toast and the employee's notification report it.
   */
  const splitFor = (request: LeaveRequest) => splitLeaveDays({
    requestedDates: leaveWorkingDates(request.fromDate, request.toDate),
  });

  const visible = visibleMemberIds
    ? requests.filter(r => visibleMemberIds.has(r.memberId))
    : requests;

  const handleApprove = async (request: LeaveRequest) => {
    if (!user) return;
    setBusyId(request.id);
    try {
      await approveLeaveRequest(request, { uid: user.uid, name: user.name });
      setLastDecision({ ...request, status: "approved" });
      const split = splitFor(request);
      toast({
        title: "Leave approved",
        description: `${request.memberName} · ${describeLeaveSplit(split)}`,
      });
    } catch (error) {
      console.error("Failed to approve leave:", error);
      toast({ title: "Could not approve", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (request: LeaveRequest) => {
    if (!user) return;
    const { confirmed, inputValue } = await confirm({
      title: `Reject ${request.memberName}'s leave?`,
      description: "They'll be notified. A short reason helps them plan.",
      confirmText: "Reject",
      variant: "destructive",
      withInput: true,
      inputPlaceholder: "Reason (optional)",
    });
    if (!confirmed) return;

    setBusyId(request.id);
    try {
      await rejectLeaveRequest(request, inputValue || "", { uid: user.uid, name: user.name });
      setLastDecision({ ...request, status: "rejected" });
      toast({ title: "Leave rejected", description: request.memberName });
    } catch (error) {
      console.error("Failed to reject leave:", error);
      toast({ title: "Could not reject", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  /** Undo the most recent decision — clears any attendance days the approval wrote. */
  const handleUndo = async () => {
    if (!user || !lastDecision) return;
    setBusyId(lastDecision.id);
    try {
      await undoLeaveDecision(lastDecision, { uid: user.uid, name: user.name });
      toast({ title: "Decision undone", description: `${lastDecision.memberName}'s request is pending again.` });
      setLastDecision(null);
    } catch (error) {
      console.error("Failed to undo leave decision:", error);
      toast({ title: "Could not undo", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const day = (d: string) => format(parse(d, "yyyy-MM-dd", new Date()), "dd MMM");

  if (visible.length === 0 && !lastDecision) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-warning/30 bg-warning/5">
      {ConfirmDialog}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/20 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-warning" />
          <h2 className="font-display text-sm font-semibold text-foreground">
            Leave requests
            {visible.length > 0 && (
              <span className="ml-1.5 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-bold text-warning">
                {visible.length}
              </span>
            )}
          </h2>
        </div>
        {lastDecision && (
          <button
            onClick={handleUndo}
            disabled={busyId === lastDecision.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Undo2 className="h-3 w-3" />
            Undo {lastDecision.status} · {lastDecision.memberName}
          </button>
        )}
      </header>

      {visible.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground md:px-5">
          Nothing waiting for a decision.
        </p>
      ) : (
        <div className="divide-y divide-warning/10">
          {visible.map(request => {
            const days = leaveWorkingDates(request.fromDate, request.toDate);
            const split = splitFor(request);
            const busy = busyId === request.id;
            return (
              <div key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {request.memberName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {day(request.fromDate)}
                      {request.toDate !== request.fromDate && ` – ${day(request.toDate)}`}
                      {" · "}{days.length} working day{days.length === 1 ? "" : "s"}
                      {split.absentDates.length > 0 && (
                        <>
                          {" · "}
                          <span data-test="leave-absence-warning"
                            title="Two paid leave days per pay period. Leave already taken this period will push more of these into absence."
                            className="font-semibold text-warning">
                            at least {split.absentDates.length} absence
                          </span>
                        </>
                      )}
                    </span>
                  </p>
                  {request.reason && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{request.reason}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleReject(request)} disabled={busy}
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => handleApprove(request)} disabled={busy}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-success px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
