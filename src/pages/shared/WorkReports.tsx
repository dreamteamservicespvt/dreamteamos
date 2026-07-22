import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { DateRange } from 'react-day-picker';
import {
  ClipboardList, Trash2, CheckCircle2, Edit3, Loader2, Search, ChevronDown,
  Pencil, X, Save, Undo2, Copy, Check, MessageCircle, BarChart3,
} from 'lucide-react';
import { formatPhoneDisplay, getWhatsAppUrl, normalizePhone } from '@/utils/phone';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { sendNotification } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreCollection } from '@/hooks/useFirestore';
import {
  DURATIONS, END_CREDITS_SECONDS, getClipCount, hasPoster, durationOptionsFor, priceForClips,
} from '@/utils/assignmentDuration';
import { formatCurrency, formatDate, formatTime } from '@/utils/formatters';
import { format, subDays, startOfDay } from 'date-fns';
import DashboardDateRangePicker from '@/components/dashboard/DateRangePicker';
import type { WorkAssignment, AppUser } from '@/types';
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from '@/types/aiPlatform';
import { formatDateRangeLabel, isDateWithinRange, normalizeDateRange, parseQueryDate, parseQueryDateRange } from '@/utils/dateRange';
import { revertOrderToAssigned, markOrderCompleted } from '@/services/orders';
import { verifyAssignments } from '@/services/workVerify';
import { reassignWork } from '@/services/workReassign';
import DeadlineChip from '@/components/work/DeadlineChip';
import WorkDoneReport from '@/components/work/WorkDoneReport';

/**
 * Work Done & Reports — everything that is about *looking back* at the team's work.
 *
 * Split out of the Work Assign pages so those stay a focused control centre (assign, approve,
 * team workload). This single page serves both tech_admin and tech_team_leader: the leader sees
 * only their own team's members and no pricing, exactly as before, so there is one implementation
 * instead of two near-identical ones.
 */

const ATTIRE_LABELS: Record<AttireType, string> = {
  [AttireType.PROFESSIONAL]: 'Professional (Formal Suit)',
  [AttireType.TRADITIONAL]: 'Traditional (Designer Saree)',
  [AttireType.SHIRT_PANT]: 'Professional (In-shirt & Pant)',
  [AttireType.CUSTOM]: 'Custom',
};

const ASSIGNMENT_LANGUAGE_OPTIONS = ['Telugu', 'English', 'Hindi', 'Kannada', 'Custom'] as const;

const VALID_STATUS_FILTERS = ['all', 'assigned', 'in_progress', 'completed', 'verified', 'editing'] as const;

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function isValidDayFilter(value: string | null): value is string {
  return value === 'all' || (typeof value === 'string' && /^[0-4]$/.test(value));
}

function getDayLabel(date: Date): string {
  const diffDays = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

export default function WorkReports() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>('users');
  const { data: allAssignments, loading: assignmentsLoading } = useFirestoreCollection<WorkAssignment>('work_assignments');

  // A team leader is scoped to the members created by the same tech admin; an admin sees everyone.
  const isTeamLeader = user?.role === 'tech_team_leader';
  const showPricing = !isTeamLeader;
  const routeBase = isTeamLeader ? '/team-leader' : '/tech-admin';

  const techMembers = useMemo(() => {
    const base = allUsers.filter(u => u.role === 'tech_member' && u.isActive);
    return isTeamLeader ? base.filter(u => u.createdBy === user?.createdBy) : base;
  }, [allUsers, isTeamLeader, user?.createdBy]);

  const memberUids = useMemo(() => new Set(techMembers.map(m => m.uid)), [techMembers]);
  const assignments = useMemo(
    () => (isTeamLeader ? allAssignments.filter(a => memberUids.has(a.assignedTo)) : allAssignments),
    [allAssignments, isTeamLeader, memberUids]
  );

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    assignedTo: string; category: string; duration: string; pricePerUnit: number; businessName: string; businessWhatsapp: string;
    modelGender: ModelGender; attireType: AttireType; customAttire: string; aspectRatio: '9:16' | '16:9'; language: string; customLanguage: string;
  } | null>(null);
  const [editMemberSearch, setEditMemberSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'sendback'; id: string; assignedTo?: string; title: string } | null>(null);
  const [verifyDialog, setVerifyDialog] = useState<{ mode: 'single' | 'all'; items: WorkAssignment[] } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);

  // Deep links from the Work Assign page ("view this member's completed work") land here.
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && VALID_STATUS_FILTERS.includes(statusParam as typeof VALID_STATUS_FILTERS[number])) {
      setStatusFilter(statusParam);
    }

    const parsedRange = parseQueryDateRange(searchParams.get('from'), searchParams.get('to'));
    if (parsedRange?.from) {
      setSelectedRange(parsedRange);
      setDayFilter('all');
      return;
    }

    const parsedDate = parseQueryDate(searchParams.get('date'));
    if (parsedDate) {
      setSelectedRange({ from: parsedDate, to: parsedDate });
      setDayFilter('all');
      return;
    }

    setSelectedRange(undefined);
    setDayFilter(isValidDayFilter(searchParams.get('day')) ? searchParams.get('day')! : 'all');
  }, [searchParams]);

  const getMemberName = (uid: string) => allUsers.find(u => u.uid === uid)?.name || 'Unknown';

  const recentDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = subDays(new Date(), i);
      return { date: startOfDay(d), dateStr: format(d, 'yyyy-MM-dd'), label: getDayLabel(d) };
    });
  }, []);

  const filteredAssignments = useMemo(() => {
    let result = assignments;
    if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);

    if (searchQuery.trim()) {
      const rawQ = searchQuery.trim();
      const q = rawQ.toLowerCase();
      const hasDigits = /[0-9]/.test(rawQ);
      const queryDigits = hasDigits ? normalizePhone(rawQ).replace(/\D/g, '') : '';

      result = result.filter(a => {
        const memberName = techMembers.find(m => m.uid === a.assignedTo)?.name?.toLowerCase() || '';
        const businessName = (a.businessName || a.clientName || '').toLowerCase();
        if (
          (a.displayTitle?.toLowerCase() || '').includes(q) ||
          businessName.includes(q) ||
          (a.uniqueId?.toLowerCase() || '').includes(q) ||
          memberName.includes(q)
        ) return true;

        if (hasDigits) {
          if (a.businessWhatsapp) {
            const d = normalizePhone(a.businessWhatsapp).replace(/\D/g, '');
            if (d.includes(queryDigits) || queryDigits.includes(d)) return true;
          }
          const memberPhone = allUsers.find(u => u.uid === a.assignedTo)?.phone;
          if (memberPhone) {
            const d = normalizePhone(memberPhone).replace(/\D/g, '');
            if (d.includes(queryDigits) || queryDigits.includes(d)) return true;
          }
        }
        return false;
      });
    }

    if (selectedRange?.from) {
      result = result.filter(a => isDateWithinRange(a.date, selectedRange));
    } else if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      if (dayIndex === 0) {
        // Today: today's tasks plus anything still merely "assigned" from earlier days
        const todayTasks = result.filter(a => a.date === dayDateStr);
        const incomingPast = result.filter(a => a.date !== dayDateStr && a.status === 'assigned');
        result = [...todayTasks, ...incomingPast];
      } else {
        result = result.filter(a => a.date === dayDateStr);
      }
    }

    return [...result].sort((a, b) => (b.assignedAt?.seconds || 0) - (a.assignedAt?.seconds || 0));
  }, [assignments, statusFilter, searchQuery, techMembers, allUsers, selectedRange, dayFilter, recentDays]);

  const completedVisibleAssignments = useMemo(
    () => filteredAssignments.filter(a => a.status === 'completed'),
    [filteredAssignments]
  );

  const handleConfirmVerify = async () => {
    if (!verifyDialog?.items.length || !user) return;
    setVerifying(true);
    try {
      await verifyAssignments(verifyDialog.items, user.uid, getMemberName);
      setVerifyDialog(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleSetEditing = async (assignmentId: string, assignedTo: string) => {
    try {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { status: 'editing' });
      // Sent back for edits → order returns to the active queue.
      const orderId = assignments.find(a => a.id === assignmentId)?.orderId;
      if (orderId) await revertOrderToAssigned(orderId);
      await sendNotification({
        userId: assignedTo,
        type: 'work_editing',
        title: 'Edits Required',
        message: 'Your work has been sent back for edits. Please review and resubmit.',
        link: '/tech/my-work',
      });
      setConfirmAction(null);
    } catch (error) {
      console.error('Failed to set editing:', error);
    }
  };

  const handleUndoEditing = async (assignmentId: string) => {
    try {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { status: 'completed' });
      // Undo edits → work is completed again, so the order is awaiting verify.
      const orderId = assignments.find(a => a.id === assignmentId)?.orderId;
      if (orderId) await markOrderCompleted(orderId);
    } catch (error) {
      console.error('Failed to undo editing:', error);
    }
  };

  const handleDelete = async (assignmentId: string) => {
    try {
      await deleteDoc(doc(db, 'work_assignments', assignmentId));
      setConfirmAction(null);
    } catch (error) {
      console.error('Failed to delete assignment:', error);
    }
  };

  const handleStartEdit = (a: WorkAssignment) => {
    setEditingId(a.id);
    const isPresetLanguage = a.language && (ASSIGNMENT_LANGUAGE_OPTIONS as readonly string[]).includes(a.language);
    setEditForm({
      assignedTo: a.assignedTo,
      category: a.category, duration: a.duration, pricePerUnit: a.pricePerUnit,
      businessName: a.businessName || a.clientName || '', businessWhatsapp: a.businessWhatsapp || '',
      modelGender: (a.modelGender as ModelGender) || ModelGender.FEMALE,
      attireType: (a.attireType as AttireType) || AttireType.TRADITIONAL,
      customAttire: a.customAttire || '',
      aspectRatio: a.aspectRatio || '9:16',
      language: a.language ? (isPresetLanguage ? a.language : 'Custom') : 'Telugu',
      customLanguage: a.language && !isPresetLanguage ? a.language : '',
    });
    setEditMemberSearch(getMemberName(a.assignedTo));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm || !editForm.assignedTo) return;
    try {
      const original = assignments.find(x => x.id === editingId);
      const clips = getClipCount(editForm.duration);
      const price = showPricing ? editForm.pricePerUnit : priceForClips(editForm.category, clips);
      const language = editForm.language === 'Custom' ? (editForm.customLanguage.trim() || 'Custom') : editForm.language;
      await updateDoc(doc(db, 'work_assignments', editingId), {
        category: editForm.category,
        duration: editForm.duration,
        pricePerUnit: price,
        clipCount: clips,
        totalPrice: price,
        businessName: editForm.businessName.trim(),
        ...(editForm.businessWhatsapp.trim() ? { businessWhatsapp: normalizePhone(editForm.businessWhatsapp.trim()) } : { businessWhatsapp: '' }),
        modelGender: editForm.modelGender,
        attireType: editForm.attireType,
        customAttire: editForm.attireType === AttireType.CUSTOM ? editForm.customAttire.trim() : '',
        aspectRatio: editForm.aspectRatio,
        language,
      });
      // Member changed → hand off through the established reassign flow (resets the work to
      // "assigned" for the new member and notifies both members).
      if (user && original && editForm.assignedTo !== original.assignedTo) {
        const newMember = techMembers.find(m => m.uid === editForm.assignedTo);
        if (newMember) {
          await reassignWork(
            { ...original, businessName: editForm.businessName.trim() || original.businessName },
            { uid: newMember.uid, name: newMember.name },
            { uid: user.uid, name: user.name },
          );
        }
      }
      setEditingId(null);
      setEditForm(null);
      setEditMemberSearch('');
    } catch (error) {
      console.error('Failed to edit assignment:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const getAssignedStamp = (assignment: WorkAssignment) => {
    const ts = assignment.assignedAt;
    const assignedDate = ts?.toDate?.()
      || (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : undefined)
      || (assignment.assignedAtIso ? new Date(assignment.assignedAtIso) : undefined)
      || (assignment.date ? new Date(`${assignment.date}T00:00:00`) : undefined);
    if (!assignedDate || Number.isNaN(assignedDate.getTime())) return assignment.date || '—';
    return `${formatDate(assignedDate)} ${formatTime(assignedDate)}`;
  };

  const getAdName = (a: WorkAssignment) => a.businessName || a.clientName || a.displayTitle;

  if (assignmentsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmAction(null)}>
          <div className="bg-card border border-border rounded-xl p-6 shadow-2xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmAction.type === 'delete' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
              {confirmAction.type === 'delete'
                ? <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                : <Edit3 className="w-6 h-6 text-orange-600 dark:text-orange-400" />}
            </div>
            <h3 className="text-lg font-semibold text-center text-foreground mb-2">
              {confirmAction.type === 'delete' ? 'Delete Assignment' : 'Send Back for Edits'}
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {confirmAction.type === 'delete'
                ? <>Are you sure you want to delete <strong className="text-foreground">{confirmAction.title}</strong>? This action cannot be undone.</>
                : <>Send <strong className="text-foreground">{confirmAction.title}</strong> back to the member for edits? You can undo this later.</>}
            </p>
            <div className="flex items-center space-x-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={() => confirmAction.type === 'delete' ? handleDelete(confirmAction.id) : handleSetEditing(confirmAction.id, confirmAction.assignedTo!)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg text-white transition-colors ${confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                {confirmAction.type === 'delete' ? 'Delete' : 'Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Dialog */}
      {verifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !verifying && setVerifyDialog(null)}>
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {verifyDialog.mode === 'all' ? `Verify All (${verifyDialog.items.length})` : 'Verify Assignment'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review member, ad name{showPricing ? ', price,' : ''} and date/time before confirming verification.
                </p>
              </div>
              <button onClick={() => setVerifyDialog(null)} disabled={verifying}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] md:text-xs font-medium text-muted-foreground">
                <span className="col-span-3">Member Name</span>
                <span className={showPricing ? 'col-span-4' : 'col-span-6'}>Ad Name</span>
                {showPricing && <span className="col-span-2">Price</span>}
                <span className="col-span-3">Time &amp; Date</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-border">
                {verifyDialog.items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-xs md:text-sm text-foreground">
                    <span className="col-span-3 truncate" title={getMemberName(item.assignedTo)}>{getMemberName(item.assignedTo)}</span>
                    <span className={`${showPricing ? 'col-span-4' : 'col-span-6'} truncate`} title={getAdName(item)}>{getAdName(item)}</span>
                    {showPricing && <span className="col-span-2 font-medium text-primary">{formatCurrency(item.totalPrice)}</span>}
                    <span className="col-span-3 text-muted-foreground">{getAssignedStamp(item)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <p className="text-xs md:text-sm text-muted-foreground">
                Total items: <span className="font-semibold text-foreground">{verifyDialog.items.length}</span>
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setVerifyDialog(null)} disabled={verifying}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleConfirmVerify} disabled={verifying}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{verifying ? 'Verifying...' : 'Confirm Verify'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <BarChart3 className="w-3 h-3" />
              Delivery reporting
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Work Done &amp; Reports</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Output per member, delivery history, and the full assignment record</p>
          </div>
          <button onClick={() => navigate(`${routeBase}/work-assign`)}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent w-full sm:w-auto">
            <ClipboardList className="w-4 h-4" /><span>Back to Work Assign</span>
          </button>
        </div>
      </div>

      {/* Work Done — 10→9 performance cycle, or any custom range */}
      <WorkDoneReport
        assignments={assignments}
        members={techMembers}
        onSelectMember={(uid) => {
          const member = techMembers.find(m => m.uid === uid);
          if (member) { setSearchQuery(member.name); setStatusFilter('all'); setShowList(true); }
        }}
      />

      {/* Filters */}
      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 md:p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Filter assignments</p>
            <p className="text-xs text-muted-foreground">Compare overall status or inspect a specific member workload across a custom date range.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedRange?.from
              ? `Showing assignments from ${formatDateRangeLabel(selectedRange)}`
              : dayFilter === 'all'
                ? 'Showing all assignments'
                : dayFilter === '0'
                  ? "Today's assignments + incoming (assigned) from past"
                  : `Showing assignments from ${recentDays[parseInt(dayFilter)]?.label}`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search by business, member, ID or phone..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-xs md:text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 flex-1 sm:flex-none">
              <option value="all">All Status</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="verified">Verified</option>
              <option value="editing">Editing</option>
            </select>
            {!selectedRange?.from && (
              <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-xs md:text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 flex-1 sm:flex-none">
                {recentDays.map((d, i) => (
                  <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, 'dd/MM')})</option>
                ))}
                <option value="all">All Days</option>
              </select>
            )}
            <DashboardDateRangePicker value={selectedRange} onSelect={(range) => { setSelectedRange(normalizeDateRange(range)); if (range?.from) setDayFilter('all'); }} />
            {(selectedRange?.from || dayFilter !== 'all' || searchQuery) && (
              <button onClick={() => { setSelectedRange(undefined); setDayFilter('all'); setSearchQuery(''); }}
                className="h-10 rounded-xl border border-border/70 px-3 text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground">Clear</button>
            )}
            <button
              onClick={() => completedVisibleAssignments.length && setVerifyDialog({ mode: 'all', items: completedVisibleAssignments })}
              disabled={verifying || completedVisibleAssignments.length === 0}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-green-100 px-3 text-xs md:text-sm font-medium text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Verify all completed assignments in current filter">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verify All ({completedVisibleAssignments.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Status breakdown for the current filter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
        {['assigned', 'in_progress', 'completed', 'verified', 'editing'].map(status => (
          <div key={status} className="bg-card border rounded-lg p-2 md:p-3 text-center">
            <p className="text-xl md:text-2xl font-bold text-card-foreground">{filteredAssignments.filter(a => a.status === status).length}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
          </div>
        ))}
      </div>

      {/* Assignment record */}
      <div className="rounded-2xl border border-border/70 bg-card/80 px-3 md:px-4 py-2.5 md:py-3 shadow-sm backdrop-blur-sm">
        <button onClick={() => setShowList(v => !v)} className="w-full flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">Assignment Record</h3>
          <span className="text-[10px] text-muted-foreground">{filteredAssignments.length} matching</span>
          <ChevronDown className={`ml-auto w-4 h-4 text-muted-foreground transition-transform ${showList ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showList && (
        <div className="space-y-3">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No assignments found</p>
            </div>
          ) : filteredAssignments.map(a => (
            <div key={a.id} className="bg-card border rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-semibold text-card-foreground text-sm md:text-base">{a.businessName || a.displayTitle}</h3>
                    <span className={`text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[a.status]}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] md:text-xs font-mono text-muted-foreground">{a.uniqueId}</span>
                    {a.status !== 'verified' && <DeadlineChip promise={a.promise} />}
                  </div>

                  {/* Inline edit mode — full labeled grid, mirroring Create New Assignment */}
                  {editingId === a.id && editForm ? (
                    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 md:p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Assign To */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Assign To</label>
                          <div className="relative">
                            <input type="text" placeholder="Search member..." value={editMemberSearch}
                              onChange={(e) => { setEditMemberSearch(e.target.value); setEditForm(prev => prev ? { ...prev, assignedTo: '' } : prev); }}
                              className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20" />
                            {editForm.assignedTo && (
                              <div className="mt-1 text-[11px] text-green-500">
                                ✓ {getMemberName(editForm.assignedTo)}{editForm.assignedTo !== a.assignedTo ? ' — will be reassigned on Save' : ''}
                              </div>
                            )}
                            {!editForm.assignedTo && editMemberSearch && (
                              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-36 overflow-y-auto">
                                {techMembers.filter(m => m.name.toLowerCase().includes(editMemberSearch.toLowerCase())).map(m => (
                                  <button key={m.uid} type="button"
                                    onClick={() => { setEditForm(prev => prev ? { ...prev, assignedTo: m.uid } : prev); setEditMemberSearch(m.name); }}
                                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">{m.name}</button>
                                ))}
                                {techMembers.filter(m => m.name.toLowerCase().includes(editMemberSearch.toLowerCase())).length === 0 && (
                                  <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">No members found</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Category */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Category</label>
                          <select value={editForm.category} onChange={(e) => {
                            const cat = e.target.value;
                            const dur = DURATIONS[cat][0];
                            setEditForm(prev => prev ? { ...prev, category: cat, duration: dur, pricePerUnit: priceForClips(cat, getClipCount(dur)) } : prev);
                          }} className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                            <option value="promotional">Promotional</option>
                            <option value="wishes">Wishes</option>
                            <option value="cinematic">Cinematic</option>
                          </select>
                        </div>

                        {/* Duration */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Duration</label>
                          <select value={editForm.duration} onChange={(e) => setEditForm(prev => prev ? { ...prev, duration: e.target.value, pricePerUnit: priceForClips(prev.category, getClipCount(e.target.value)) } : prev)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                            {durationOptionsFor(editForm.category, editForm.duration).map(d => (
                              <option key={d} value={d}>{d} ({getClipCount(d)} clips + {hasPoster(d) ? 'Poster ' : ''}{END_CREDITS_SECONDS}s EC)</option>
                            ))}
                          </select>
                        </div>

                        {/* Price */}
                        {showPricing && (
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Price Per Unit (₹)</label>
                            <input type="number" min={0} value={editForm.pricePerUnit}
                              onChange={(e) => setEditForm(prev => prev ? { ...prev, pricePerUnit: parseInt(e.target.value) || 0 } : prev)}
                              className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                        )}

                        {/* Business Name */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Business Name</label>
                          <input type="text" placeholder="e.g. Sharma Electronics" value={editForm.businessName}
                            onChange={(e) => setEditForm(prev => prev ? { ...prev, businessName: e.target.value } : prev)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>

                        {/* Business WhatsApp */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Business WhatsApp</label>
                          <input type="text" placeholder="e.g. 9876543210" value={editForm.businessWhatsapp}
                            onChange={(e) => setEditForm(prev => prev ? { ...prev, businessWhatsapp: e.target.value } : prev)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>

                        {/* Model */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Model</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[ModelGender.FEMALE, ModelGender.MALE].map(g => (
                              <button key={g} type="button"
                                onClick={() => setEditForm(prev => {
                                  if (!prev) return prev;
                                  const allowed = ATTIRE_OPTIONS_BY_GENDER[g];
                                  const nextAttire = allowed.includes(prev.attireType) ? prev.attireType : AttireType.PROFESSIONAL;
                                  return { ...prev, modelGender: g, attireType: nextAttire };
                                })}
                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  editForm.modelGender === g ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                                }`}>
                                {g === ModelGender.FEMALE ? '👩 Female' : '👨 Male'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Attire */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Attire</label>
                          <select value={editForm.attireType} onChange={(e) => setEditForm(prev => prev ? { ...prev, attireType: e.target.value as AttireType } : prev)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                            {ATTIRE_OPTIONS_BY_GENDER[editForm.modelGender].map(opt => (
                              <option key={opt} value={opt}>{ATTIRE_LABELS[opt]}</option>
                            ))}
                          </select>
                          {editForm.attireType === AttireType.CUSTOM && (
                            <input type="text" placeholder="Describe the exact attire…" value={editForm.customAttire}
                              onChange={(e) => setEditForm(prev => prev ? { ...prev, customAttire: e.target.value } : prev)}
                              className="w-full mt-1.5 border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                          )}
                        </div>

                        {/* Aspect Ratio */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Aspect Ratio</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(['9:16', '16:9'] as const).map(r => (
                              <button key={r} type="button" onClick={() => setEditForm(prev => prev ? { ...prev, aspectRatio: r } : prev)}
                                className={`px-2 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                                  editForm.aspectRatio === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                                }`}>
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Language */}
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Language</label>
                          <select value={editForm.language} onChange={(e) => setEditForm(prev => prev ? { ...prev, language: e.target.value } : prev)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                            {ASSIGNMENT_LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          {editForm.language === 'Custom' && (
                            <input type="text" placeholder="Type the language…" value={editForm.customLanguage}
                              onChange={(e) => setEditForm(prev => prev ? { ...prev, customLanguage: e.target.value } : prev)}
                              className="w-full mt-1.5 border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                        {showPricing
                          ? <span className="text-xs text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(editForm.pricePerUnit)}</strong></span>
                          : <span className="text-xs text-muted-foreground">{getClipCount(editForm.duration)} clips + {END_CREDITS_SECONDS}s EC</span>}
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setEditingId(null); setEditForm(null); setEditMemberSearch(''); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded-lg transition-colors hover:text-foreground">
                            <X className="w-3 h-3" /><span>Cancel</span>
                          </button>
                          <button onClick={handleSaveEdit} disabled={!editForm.assignedTo}
                            className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Save className="w-3 h-3" /><span>Save Changes</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-x-3 md:gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                        <span>Assigned to: <strong className="text-foreground">{getMemberName(a.assignedTo)}</strong></span>
                        <span>Assigned: <strong className="text-foreground">{getAssignedStamp(a)}</strong></span>
                        {(a.businessName || a.clientName) && <span>Business: <strong className="text-foreground">{a.businessName || a.clientName}</strong></span>}
                        <span>Category: <strong className="capitalize text-foreground">{a.category}</strong></span>
                        <span>{a.clipCount} clips + EC · {a.duration}</span>
                        {showPricing && <span>Price: <strong className="text-foreground">{formatCurrency(a.totalPrice)}</strong></span>}
                        {a.totalDurationSeconds > 0 && <span>Time: {formatDuration(a.totalDurationSeconds)}</span>}
                        <span className="font-mono text-[10px] md:text-xs">Code: {a.accessCode}</span>
                      </div>
                      {(a.modelGender || a.attireType || a.aspectRatio || a.language) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {a.modelGender && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {a.modelGender === 'male' ? '👨 Male' : '👩 Female'}
                            </span>
                          )}
                          {a.attireType && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                              {a.attireType === 'custom' && a.customAttire ? a.customAttire : ATTIRE_LABELS[a.attireType]}
                            </span>
                          )}
                          {a.aspectRatio && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{a.aspectRatio}</span>
                          )}
                          {a.language && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{a.language}</span>
                          )}
                        </div>
                      )}
                      {a.businessWhatsapp && (
                        <div className="flex items-center gap-2 mt-2">
                          <a href={getWhatsAppUrl(a.businessWhatsapp)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors text-xs font-medium">
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{formatPhoneDisplay(a.businessWhatsapp)}</span>
                          </a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(a.businessWhatsapp!); setCopiedPhone(a.id); setTimeout(() => setCopiedPhone(null), 2000); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs transition-colors"
                            title="Copy number">
                            {copiedPhone === a.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedPhone === a.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-1.5 md:gap-2">
                  {a.status === 'completed' && (
                    <button onClick={() => setVerifyDialog({ mode: 'single', items: [a] })}
                      className="flex items-center space-x-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-lg transition-colors">
                      <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Verify</span>
                    </button>
                  )}
                  {(a.status === 'completed' || a.status === 'verified') && (
                    <button onClick={() => setConfirmAction({ type: 'sendback', id: a.id, assignedTo: a.assignedTo, title: a.businessName || a.displayTitle })}
                      className="flex items-center space-x-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 rounded-lg transition-colors">
                      <Edit3 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Send Back</span>
                    </button>
                  )}
                  {a.status === 'editing' && (
                    <button onClick={() => handleUndoEditing(a.id)}
                      className="flex items-center space-x-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 rounded-lg transition-colors">
                      <Undo2 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Undo</span>
                    </button>
                  )}
                  {a.status !== 'verified' && editingId !== a.id && (
                    <button onClick={() => handleStartEdit(a)}
                      className="flex items-center space-x-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors">
                      <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Edit</span>
                    </button>
                  )}
                  <button onClick={() => setConfirmAction({ type: 'delete', id: a.id, title: a.businessName || a.displayTitle })}
                    className="flex items-center space-x-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                    <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
