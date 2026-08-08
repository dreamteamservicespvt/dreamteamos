import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Briefcase, Clock, Play, CheckCircle2, ChevronDown, Loader2, AlertCircle, Sparkles, Edit3, Copy, Check, Undo2,
  MessagesSquare
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, doc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { revertOrderToAssigned } from '@/services/orders';
import { useCompleteWork } from '@/hooks/useCompleteWork';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreQuery } from '@/hooks/useFirestore';
import { format, subDays, subMonths, startOfDay } from 'date-fns';
import { cycleForDate } from '@/utils/performanceCycle';
import { formatDate, formatTime } from '@/utils/formatters';
import DashboardDayPicker from '@/components/dashboard/DayPicker';
import { ORDER_TRACKS } from '@/types';
import type { Order, WorkAssignment } from '@/types';
import { useOrdersByIds } from '@/hooks/useOrdersByIds';
import { isPinnedOrder } from '@/utils/orderProgress';
import OrderProgressPanel from '@/components/work/OrderProgressPanel';
import { isBulkVideoOrder } from '@/utils/bulkVideos';
import CodeVerificationModal from '@/components/ai-platform/CodeVerificationModal';
import { isWorkUnlocked, rememberWorkUnlock } from '@/utils/workUnlock';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';
import SaleDeletedBanner from '@/components/work/SaleDeletedBanner';
import StaffOrderChat from '@/components/order-chat/StaffOrderChat';
import { useOrderChatUnread } from '@/hooks/useOrderChat';
import { reopenOrderChat, syncOrderChatWorkStatus } from '@/services/orderChat';
import { useConfirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/use-toast';

/** Completed work is paged so a long history never buries the active assignments above it. */
const COMPLETED_PAGE_SIZE = 10;

/** How many past performance months the filter offers. Half a year is as far back as anyone looks. */
const CYCLE_OPTIONS = 6;

/** Filter values that select a whole 10th → 9th month, e.g. `cycle:2026-07`. */
const CYCLE_PREFIX = 'cycle:';

function getDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export default function MyWork() {
  const user = useAuthStore((s) => s.user);
  const q = useMemo(() => user ? query(collection(db, 'work_assignments'), where('assignedTo', '==', user.uid)) : null, [user?.uid]);
  const { data: assignments, loading } = useFirestoreQuery<WorkAssignment>(q, [user?.uid]);

  const [verifyingAssignment, setVerifyingAssignment] = useState<WorkAssignment | null>(null);
  /**
   * What the code is being typed for. The client chat is behind the same four digits as the
   * generator — one code per job, whichever door you are opening with it.
   */
  const [verifyPurpose, setVerifyPurpose] = useState<'work' | 'chat'>('work');
  const [openAssignment, setOpenAssignment] = useState<WorkAssignment | null>(null);
  const [openChatFor, setOpenChatFor] = useState<WorkAssignment | null>(null);

  /**
   * A tapped "… sent a message" notification opens that conversation, not this list.
   *
   * The push carries `?chat=<assignmentId>`. Landing a member on twenty jobs and expecting them to
   * find the one that just messaged them is how a reply takes an hour, which is the delay this
   * whole feature exists to remove. The parameter is cleared once used so a refresh — or a Back
   * into this entry — does not reopen a chat the member deliberately closed.
   */
  const [chatParams, setChatParams] = useSearchParams();
  const requestedChatId = chatParams.get("chat");
  useEffect(() => {
    if (!requestedChatId) return;
    const match = assignments.find(a => a.id === requestedChatId);
    if (!match) return;              // still loading, or not this member's job
    setOpenChatFor(match);
    const next = new URLSearchParams(chatParams);
    next.delete("chat");
    setChatParams(next, { replace: true });
  }, [requestedChatId, assignments, chatParams, setChatParams]);
  const chatState = useOrderChatUnread(user?.uid);

  /**
   * The open job, as it stands RIGHT NOW rather than as it was when it was opened.
   *
   * `openAssignment` is a snapshot taken at the moment of clicking, so an admin correcting the spec
   * of a job already in someone's hands changed nothing on their screen — they carried on to the
   * generator with the original brief. `assignments` is a live subscription, so re-reading the job
   * from it is what makes an edit reach the person doing the work.
   */
  const liveOpenAssignment = useMemo(
    () => (openAssignment ? assignments.find(a => a.id === openAssignment.id) ?? openAssignment : null),
    [assignments, openAssignment],
  );
  const sessionStartRef = useRef<Date | null>(null);
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast } = useToast();

  // Track session duration
  useEffect(() => {
    if (openAssignment) {
      sessionStartRef.current = new Date();
      // Mark as in_progress if assigned
      if (openAssignment.status === 'assigned' || openAssignment.status === 'editing') {
        updateDoc(doc(db, 'work_assignments', openAssignment.id), { status: 'in_progress' });
        // The client chat carries the same fact, so the seller fielding "has anyone started?"
        // can answer it without ringing the tech side.
        syncOrderChatWorkStatus(openAssignment.id, 'in_progress');
      }
    }
    return () => {
      // Save session when closing
      if (openAssignment && sessionStartRef.current) {
        const durationSeconds = Math.round((Date.now() - sessionStartRef.current.getTime()) / 1000);
        if (durationSeconds > 5) { // Only save sessions > 5 seconds
          const newSession = { openedAt: sessionStartRef.current.toISOString(), closedAt: new Date().toISOString(), durationSeconds };
          const prevSessions = openAssignment.sessions || [];
          const prevTotal = openAssignment.totalDurationSeconds || 0;
          updateDoc(doc(db, 'work_assignments', openAssignment.id), {
            sessions: [...prevSessions, newSession],
            totalDurationSeconds: prevTotal + durationSeconds,
          });
        }
        sessionStartRef.current = null;
      }
    };
  }, [openAssignment?.id]);

  /**
   * The code is asked once per job, per person, per device — not on every open.
   *
   * It gates two doors with the same four digits, so a member answering a client typed them to
   * read the message, again to open the generator, and again the next time the client wrote. The
   * third prompt protects nothing the first one did. See utils/workUnlock.
   */
  const openWithCode = (assignment: WorkAssignment, purpose: 'work' | 'chat') => {
    if (isWorkUnlocked(user?.uid, assignment.id)) {
      if (purpose === 'chat') setOpenChatFor(assignment);
      else setOpenAssignment(assignment);
      return;
    }
    setVerifyPurpose(purpose);
    setVerifyingAssignment(assignment);
  };

  const handleOpenWork = (assignment: WorkAssignment) => openWithCode(assignment, 'work');
  const handleOpenChat = (assignment: WorkAssignment) => openWithCode(assignment, 'chat');

  const handleVerified = () => {
    if (!verifyingAssignment) return;
    rememberWorkUnlock(user?.uid, verifyingAssignment.id);
    if (verifyPurpose === 'chat') setOpenChatFor(verifyingAssignment);
    else setOpenAssignment(verifyingAssignment);
    setVerifyingAssignment(null);
  };

  const handleClose = () => {
    setOpenAssignment(null);
  };

  /**
   * Submitting is slow and the button used to look identical the whole time it ran.
   *
   * The handler does five sequential writes — the assignment, a notification, a fan-out to every
   * team leader, the order, the client record — which on mobile data takes seconds with nothing
   * changing on screen. So members tapped again, and again, and each tap sent another round of
   * notifications. The guard, the busy state and the notification keys all live in the shared hook
   * now (hooks/useCompleteWork), because Recent Ads submits the same way.
   */
  const { completing, complete } = useCompleteWork();

  const handleComplete = async () => {
    const submitted = await complete(openAssignment, { sessionStart: sessionStartRef.current });
    if (submitted) {
      // Counted by the hook's final write; leaving it set would bill the time twice on unmount.
      sessionStartRef.current = null;
      setOpenAssignment(null);
    }
  };

  const handleUndoComplete = async (assignment: WorkAssignment) => {
    const { confirmed } = await confirm({ title: "Undo Completion", description: "Revert this to In Progress? This will undo the completion.", confirmText: "Undo", variant: "destructive" });
    if (!confirmed) return;
    try {
      await updateDoc(doc(db, 'work_assignments', assignment.id), {
        status: 'in_progress',
        completedAt: deleteField(),
        completedDate: deleteField(),
      });
      // Order-driven work → put the order back in the active queue (resumes deadline alerts).
      if (assignment.orderId) await revertOrderToAssigned(assignment.orderId);
      // Back in progress means the client can talk to their member again.
      await reopenOrderChat(assignment.id, undefined, 'The team is still working on this — chat is open again.');
      await syncOrderChatWorkStatus(assignment.id, 'in_progress');
    } catch (error) {
      console.error('Failed to undo complete:', error);
    }
  };

  const handleBusinessNameExtracted = async (name: string) => {
    if (!openAssignment) return;
    // Don't overwrite admin-provided business name
    if (openAssignment.businessName || openAssignment.clientName) return;
    try {
      await updateDoc(doc(db, 'work_assignments', openAssignment.id), {
        businessName: name,
        displayTitle: name,
      });
    } catch (error) {
      console.error('Failed to update business name:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getAssignedStamp = (assignment: WorkAssignment) => {
    const ts = assignment.assignedAt as any;
    const assignedDate = ts?.toDate?.()
      || (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : undefined)
      || (assignment.assignedAtIso ? new Date(assignment.assignedAtIso) : undefined)
      || (assignment.date ? new Date(`${assignment.date}T00:00:00`) : undefined);
    if (!assignedDate || Number.isNaN(assignedDate.getTime())) return assignment.date || '—';
    return `${formatDate(assignedDate)} ${formatTime(assignedDate)}`;
  };

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    assigned: { icon: <Play className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Start Work' },
    in_progress: { icon: <Sparkles className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Continue' },
    completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Completed' },
    verified: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Verified' },
    editing: { icon: <Edit3 className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: 'Edits Required' },
  };

  // Latest-added work first (most recent assignment on top)
  const assignedSeconds = (a: WorkAssignment) => {
    const ts = a.assignedAt as any;
    return ts?.seconds || (a.assignedAtIso ? Math.floor(new Date(a.assignedAtIso).getTime() / 1000) : 0);
  };
  /**
   * The orders behind this member's multi-deliverable work — a social-media month or a bulk order.
   * Fetched by id rather than by subscribing to the whole collection: only work that carries tracks
   * needs one, so a member doing ordinary single ads pays for nothing here.
   */
  const trackedOrderIds = useMemo(
    () => assignments.filter(a => a.tracks?.length && a.orderId).map(a => a.orderId!),
    [assignments],
  );
  const trackedOrders = useOrdersByIds(trackedOrderIds);
  const orderFor = (a: WorkAssignment): Order | null => (a.orderId ? trackedOrders.get(a.orderId) ?? null : null);
  /** Ordinary work has no order to pin by, and work whose order hasn't loaded yet does not jump. */
  const isPinned = (a: WorkAssignment): boolean => {
    const o = orderFor(a);
    return !!o && isPinnedOrder(o);
  };

  /**
   * Active work, with unfinished months and bulk orders held at the top.
   *
   * Those run over days while single ads land and clear around them, so on plain newest-first they
   * sink below a fortnight of finished ads while still owing the client work.
   */
  const activeWork = useMemo(
    () => assignments
      .filter(a => ['assigned', 'in_progress', 'editing'].includes(a.status))
      .sort((a, b) => {
        const pinA = isPinned(a);
        const pinB = isPinned(b);
        if (pinA !== pinB) return pinA ? -1 : 1;
        return assignedSeconds(b) - assignedSeconds(a);
      }),
    [assignments, trackedOrders]
  );
  const completedWork = useMemo(
    () => assignments.filter(a => ['completed', 'verified'].includes(a.status)).sort((a, b) => {
      const ca = (a.completedAt as any)?.seconds || assignedSeconds(a);
      const cb = (b.completedAt as any)?.seconds || assignedSeconds(b);
      return cb - ca;
    }),
    [assignments]
  );

  const [completedOpen, setCompletedOpen] = useState(false);
  const [completedShown, setCompletedShown] = useState(COMPLETED_PAGE_SIZE);
  /**
   * The status tile currently being used as a filter, or null for everything.
   *
   * The tiles were a read-out and nothing more: a member who saw "3 changes" then had to go and
   * find those three by eye among everything else on the page. Each one is now the filter for the
   * thing it counts.
   */
  const [statusFilter, setStatusFilter] = useState<WorkAssignment['status'] | null>(null);

  /** Picking a delivered status opens the completed list, or the filter would appear to do nothing. */
  const pickStatus = (status: WorkAssignment['status']) => {
    setStatusFilter((current) => {
      const next = current === status ? null : status;
      if (next === 'completed' || next === 'verified') setCompletedOpen(true);
      return next;
    });
  };

  // 5-day filter
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      days.push({ date: startOfDay(d), dateStr: format(d, "yyyy-MM-dd"), label: getDayLabel(d) });
    }
    return days;
  }, []);

  /**
   * The team's real months: 10th → 9th, newest first.
   *
   * A tech member's output, targets and salary are all counted over that cycle (see
   * utils/performanceCycle), so "this month's work" here has to mean the same span it means on
   * every other screen. The last five days answer "what am I doing now"; this answers "what did I
   * do this month", which until now could only be reached one day at a time.
   */
  const cycles = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: CYCLE_OPTIONS }, (_, i) => {
      const { from, to } = cycleForDate(subMonths(today, i));
      return {
        value: `${CYCLE_PREFIX}${format(from, 'yyyy-MM')}`,
        // Spelled out in full: calling 10 Jul → 09 Aug "July" is the exact confusion to avoid.
        label: `${format(from, 'dd MMM')} – ${format(to, 'dd MMM yyyy')}${i === 0 ? ' (this month)' : ''}`,
        from: format(from, 'yyyy-MM-dd'),
        to: format(to, 'yyyy-MM-dd'),
      };
    });
  }, []);

  const activeCycle = useMemo(
    () => (dayFilter.startsWith(CYCLE_PREFIX) ? cycles.find(c => c.value === dayFilter) ?? null : null),
    [dayFilter, cycles],
  );

  /** The day window in force, or null when everything is shown. Assignment dates are `yyyy-MM-dd`. */
  const inWindow = (a: WorkAssignment): boolean => {
    if (!a.date) return false;
    if (activeCycle) return a.date >= activeCycle.from && a.date <= activeCycle.to;
    return a.date === recentDays[parseInt(dayFilter)]?.dateStr;
  };

  // Filter by date
  const filteredActive = useMemo(() => {
    let result = activeWork;
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(a => a.date === dateStr);
    } else if (dayFilter !== 'all') {
      if (dayFilter === '0') {
        // Today: show today's + any assigned (incoming) from past
        const todayTasks = result.filter(inWindow);
        const incomingPast = result.filter(a => !inWindow(a) && a.status === 'assigned');
        result = [...todayTasks, ...incomingPast];
      } else {
        result = result.filter(inWindow);
      }
    }
    if (statusFilter) result = result.filter(a => a.status === statusFilter);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork, selectedDate, dayFilter, recentDays, activeCycle, statusFilter]);

  const filteredCompleted = useMemo(() => {
    // Bucketed by the ASSIGNED date, not when it was marked complete/submitted — a video
    // assigned on day 1 but finished on day 3 still belongs to day 1's work.
    let result = completedWork;
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(a => a.date === dateStr);
    } else if (dayFilter !== 'all') {
      result = result.filter(inWindow);
    }
    if (statusFilter) result = result.filter(a => a.status === statusFilter);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedWork, selectedDate, dayFilter, recentDays, activeCycle, statusFilter]);

  const visibleCompleted = useMemo(
    () => filteredCompleted.slice(0, completedShown),
    [filteredCompleted, completedShown],
  );

  /**
   * The assignments the stat tiles count.
   *
   * They used to count everything the member had ever been given, whatever the filter said — which
   * reads as a bug the moment a month is selected: pick 10 Jun – 09 Jul and "Completed" still shows
   * a career total. The tiles now answer the question the filter asked.
   */
  const windowAssignments = useMemo(() => {
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      return assignments.filter(a => a.date === dateStr);
    }
    if (dayFilter === 'all') return assignments;
    return assignments.filter(inWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, selectedDate, dayFilter, recentDays, activeCycle]);

  /**
   * One tile per status, in the order work moves through them.
   *
   * "Total time" used to sit at the end and was the only tile nobody could act on — a career
   * stopwatch on a page about what to do next. Each tile now names one status and filters to it.
   */
  const statusTiles = useMemo(() => {
    const count = (status: WorkAssignment['status']) =>
      windowAssignments.filter(a => a.status === status).length;
    return [
      { key: 'assigned' as const, label: 'Active', hint: 'Not started yet', value: count('assigned') },
      { key: 'in_progress' as const, label: 'In Progress', hint: 'Being worked on', value: count('in_progress') },
      { key: 'editing' as const, label: 'Changes', hint: 'Sent back for edits', value: count('editing') },
      { key: 'completed' as const, label: 'Completed', hint: 'Awaiting verify', value: count('completed') },
      { key: 'verified' as const, label: 'Verified', hint: 'Signed off', value: count('verified') },
    ];
  }, [windowAssignments]);

  // Changing the date filter starts a fresh page — otherwise a previously expanded list would
  // keep showing more rows than the new filter warrants.
  useEffect(() => {
    setCompletedShown(COMPLETED_PAGE_SIZE);
  }, [selectedDate, dayFilter]);

  // Show AI Platform when assignment is opened
  if (openAssignment && liveOpenAssignment) {
    return (
      <AIPlatformApp
        assignment={liveOpenAssignment}
        assignmentId={liveOpenAssignment.id}
        completing={completing}
        onBusinessNameExtracted={handleBusinessNameExtracted}
        onClose={handleClose}
        onComplete={handleComplete}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      {/* Code Verification Modal */}
      {verifyingAssignment && (
        <CodeVerificationModal
          accessCode={verifyingAssignment.accessCode}
          onVerified={handleVerified}
          onClose={() => setVerifyingAssignment(null)}
        />
      )}

      {openChatFor && (
        <StaffOrderChat
          assignment={openChatFor}
          memberName={user?.name}
          onClose={() => setOpenChatFor(null)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Work</h1>
        <p className="text-sm text-muted-foreground mt-1">AI ad generation assignments</p>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedDate ? 'custom' : dayFilter} onChange={e => { setSelectedDate(undefined); setDayFilter(e.target.value); }}
          className="border rounded-lg px-3 py-2 text-sm bg-card text-card-foreground">
          <optgroup label="Days">
            {recentDays.map((d, i) => <option key={i} value={String(i)}>{d.label}</option>)}
          </optgroup>
          <optgroup label="Months (10th – 9th)">
            {cycles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </optgroup>
          <option value="all">All Days</option>
        </select>
        <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); if (d) setDayFilter('custom'); }} />
        {selectedDate && (
          <button onClick={() => { setSelectedDate(undefined); setDayFilter('0'); }} className="text-xs text-muted-foreground hover:text-foreground">Clear date</button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {selectedDate
            ? format(selectedDate, 'MMM d, yyyy')
            : activeCycle?.label || recentDays[parseInt(dayFilter)]?.label || 'All Days'}
        </span>
      </div>

      {/* Status tiles — each one filters the lists below to exactly what it counts. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statusTiles.map(tile => {
          const on = statusFilter === tile.key;
          return (
            <button
              key={tile.key}
              onClick={() => pickStatus(tile.key)}
              data-test={`my-work-tile-${tile.key}`}
              aria-pressed={on}
              className={`rounded-lg border p-4 text-center transition-colors ${
                on
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-accent/40'
              }`}
            >
              <p className={`text-2xl font-bold ${on ? 'text-primary' : 'text-card-foreground'}`}>{tile.value}</p>
              <p className="text-xs font-medium text-foreground">{tile.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{on ? 'Tap to clear' : tile.hint}</p>
            </button>
          );
        })}
      </div>

      {statusFilter && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="flex-1 text-xs text-muted-foreground">
            Showing only{' '}
            <b className="text-foreground">{statusTiles.find(t => t.key === statusFilter)?.label}</b> work.
          </p>
          <button onClick={() => setStatusFilter(null)} data-test="my-work-clear-status"
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent">
            Show all
          </button>
        </div>
      )}

      {/* Active Work */}
      {filteredActive.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center space-x-2">
            <Briefcase className="w-5 h-5" /><span>Active Assignments ({filteredActive.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredActive.map(a => {
              const cfg = statusConfig[a.status];
              const order = orderFor(a);
              const pinned = isPinned(a);
              return (
                <div key={a.id} data-test="my-work-card"
                  className={`bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow ${pinned ? "border-purple-500/40 ring-1 ring-purple-500/20" : ""}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-card-foreground">{a.businessName || a.displayTitle}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{a.uniqueId}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{a.status.replace('_', ' ')}</span>
                  </div>
                  <SaleDeletedBanner assignment={a} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
                    <span className="capitalize">{a.category.replace(/_/g, ' ')}</span>
                    {/* Ordinary ad work is counted in clips; a month is counted in jobs, and
                        "8 clips + EC" would be a lie about what this person was actually given. */}
                    {a.tracks?.length ? (
                      <span className="text-purple-600 dark:text-purple-400">
                        {a.tracks.map(t => ORDER_TRACKS.find(x => x.key === t)?.label || t).join(' + ')}
                      </span>
                    ) : (
                      <span>{a.clipCount} clips + EC</span>
                    )}
                    <span>{a.duration}</span>
                    <span>Assigned: {getAssignedStamp(a)}</span>
                    {a.totalDurationSeconds > 0 && (
                      <span className="flex items-center space-x-1"><Clock className="w-3 h-3" /><span>{formatDuration(a.totalDurationSeconds)}</span></span>
                    )}
                  </div>

                  {/* The shared counters — or, for a bulk order, this member's own videos with a
                      tick against each. Written to the order, so the other members on a split
                      month see this person's progress without anyone having to message anyone.
                      Bulk orders render whether or not they carry a progress object: their videos
                      come from the quantity sold, and a member must always be able to tick off
                      work that is sitting in their name. */}
                  {order && (order.progress || isBulkVideoOrder(order)) && (
                    <div className="mb-3">
                      <OrderProgressPanel order={order} user={user} />
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-4 bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground">Access Code:</span>
                    <div className="flex items-center space-x-2">
                      <code className="font-mono text-sm font-bold text-foreground">{a.accessCode}</code>
                      <button onClick={() => { navigator.clipboard.writeText(a.accessCode); setCopiedCode(a.id); setTimeout(() => setCopiedCode(null), 2000); }}
                        className="p-1 rounded hover:bg-muted transition-colors" title="Copy code">
                        {copiedCode === a.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenWork(a)}
                      className="flex flex-1 items-center justify-center space-x-2 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">
                      {cfg.icon}<span>{cfg.label}</span><span className="text-[10px] opacity-60 font-mono ml-1">{a.uniqueId}</span>
                    </button>
                    {/* Talk to the client about this exact job — same code as the generator. */}
                    <button onClick={() => handleOpenChat(a)} title="Chat with the client"
                      className="relative shrink-0 rounded-lg border border-border bg-background p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <MessagesSquare className="h-5 w-5" />
                      {chatState[a.id]?.unread > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {chatState[a.id].unread}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Work — collapsed by default and paged, so a long history never buries
          the active work above it. */}
      {filteredCompleted.length > 0 && (
        <div>
          <button
            onClick={() => setCompletedOpen(o => !o)}
            aria-expanded={completedOpen}
            className="mb-3 flex w-full items-center gap-2 rounded-lg text-lg font-semibold text-foreground transition-colors hover:text-primary"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span>Completed ({filteredCompleted.length})</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${completedOpen ? "rotate-180" : ""}`} />
          </button>

          {completedOpen && (
          <div className="space-y-2">
            {visibleCompleted.map(a => {
              const cfg = statusConfig[a.status];
              return (
                <div key={a.id} className="bg-card border rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    <div>
                      <span className="font-medium text-card-foreground text-sm">{a.businessName || a.displayTitle}</span>
                      <span className="ml-3 text-xs text-muted-foreground capitalize">{a.category} · {a.clipCount} clips · {a.duration} · Assigned: {getAssignedStamp(a)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === 'completed' && (
                      <button
                        onClick={() => handleUndoComplete(a)}
                        className="h-7 px-2.5 rounded-lg border border-destructive/30 text-destructive text-[10px] font-medium hover:bg-destructive/10 transition-colors inline-flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" /> Undo
                      </button>
                    )}
                    <div className="text-xs text-muted-foreground flex items-center space-x-1">
                      <Clock className="w-3 h-3" /><span>{formatDuration(a.totalDurationSeconds)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredCompleted.length > visibleCompleted.length && (
              <button
                onClick={() => setCompletedShown(n => n + COMPLETED_PAGE_SIZE)}
                className="w-full rounded-lg border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
              >
                Load {Math.min(COMPLETED_PAGE_SIZE, filteredCompleted.length - visibleCompleted.length)} more
                <span className="ml-1 text-muted-foreground/60">
                  ({visibleCompleted.length} of {filteredCompleted.length} shown)
                </span>
              </button>
            )}
          </div>
          )}
        </div>
      )}

      {/* Nothing to show. Says WHY: an empty month reads as a broken page unless the filter that
          emptied it is named. */}
      {filteredActive.length === 0 && filteredCompleted.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-20" />
          {assignments.length === 0 ? (
            <>
              <p className="text-lg font-medium">No assignments yet</p>
              <p className="text-sm mt-1">Your work assignments will appear here</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No work in this period</p>
              <p className="text-sm mt-1">
                Nothing was assigned to you in{' '}
                {selectedDate
                  ? format(selectedDate, 'MMM d, yyyy')
                  : activeCycle?.label.replace(' (this month)', '') || recentDays[parseInt(dayFilter)]?.label || 'this period'}
                . Try another day or month.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
