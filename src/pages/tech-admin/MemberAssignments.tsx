import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ClipboardList, Trash2, CheckCircle2, Edit3, Loader2,
  Pencil, X, Save, Undo2, Search
} from 'lucide-react';
import { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { sendNotification } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreCollection } from '@/hooks/useFirestore';
import { PRICING } from '@/utils/pricing';
import { formatCurrency, formatDate, formatTime } from '@/utils/formatters';
import { format, subDays, startOfDay, parseISO, isValid } from 'date-fns';
import DashboardDayPicker from '@/components/dashboard/DayPicker';
import type { WorkAssignment, AppUser } from '@/types';

const DURATIONS: Record<string, string[]> = {
  wishes: ['20s', '40s'],
  promotional: ['16s', '32s', '48s', '64s'],
  cinematic: ['16s', '32s', '48s', '64s'],
};

const CLIP_COUNTS: Record<string, number> = {
  '16s': 2, '32s': 4, '48s': 6, '64s': 8,
  '20s': 2, '40s': 4,
};

const HAS_POSTER: Record<string, boolean> = {
  '16s': false, '32s': true, '48s': true, '64s': true,
  '20s': false, '40s': false,
};

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const VALID_STATUS_FILTERS = ['all', 'assigned', 'in_progress', 'completed', 'verified', 'editing'] as const;

function parseQueryDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

function isValidDayFilter(value: string | null): value is string {
  return value === 'all' || (typeof value === 'string' && /^[0-4]$/.test(value));
}

function WorkPreview({ assignmentId }: { assignmentId: string }) {
  const [generation, setGeneration] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWork() {
      try {
        const q = query(collection(db, 'ai_generations'), where('workAssignmentId', '==', assignmentId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          // just taking the most recent one if multiple exist, usually it's one.
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => 
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );
          setGeneration(data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch ai generations', err);
      } finally {
        setLoading(false);
      }
    }
    fetchWork();
  }, [assignmentId]);

  if (loading) return <div className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>;
  if (!generation) return <div className="p-4 text-center text-xs text-muted-foreground border-t border-border mt-2">No AI platform work found for this assignment.</div>;

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <h4 className="text-sm font-semibold text-foreground">AI Platform Output Preview</h4>
      <div className="p-3 bg-muted/30 rounded-lg border border-border text-xs text-muted-foreground space-y-2 max-h-48 overflow-y-auto">
        <p><strong className="text-foreground">Header:</strong> {generation.headerPrompt}</p>
        <p><strong className="text-foreground">Voice Over:</strong> {generation.voiceOverScript}</p>
        {generation.veoPrompts && generation.veoPrompts.length > 0 && (
          <div>
            <strong className="text-foreground">Clips ({generation.veoPrompts.length}):</strong>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {generation.veoPrompts.map((p: string, i: number) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MemberAssignments() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>('users');
  const { data: allAssignments, loading: assignmentsLoading } = useFirestoreCollection<WorkAssignment>('work_assignments');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('0');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ category: string; duration: string; pricePerUnit: number; businessName: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'sendback'; id: string; assignedTo?: string; title: string } | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState<{ mode: 'single' | 'all'; items: WorkAssignment[] } | null>(null);

  const member = useMemo(() => allUsers.find(u => u.uid === memberId), [allUsers, memberId]);

  // Show today's assignments + still-active from any date
  const activeStatuses = ['assigned', 'in_progress', 'editing'];

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && VALID_STATUS_FILTERS.includes(statusParam as typeof VALID_STATUS_FILTERS[number])) {
      setStatusFilter(statusParam);
    } else {
      setStatusFilter('all');
    }

    const parsedDate = parseQueryDate(searchParams.get('date'));
    if (parsedDate) {
      setSelectedDate(parsedDate);
      setDayFilter('0');
      return;
    }

    setSelectedDate(undefined);
    const dayParam = searchParams.get('day');
    setDayFilter(isValidDayFilter(dayParam) ? dayParam : '0');
  }, [searchParams, memberId]);

  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      const today = startOfDay(new Date());
      const target = startOfDay(d);
      const diffMs = today.getTime() - target.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
      days.push({ date: startOfDay(d), dateStr: format(d, 'yyyy-MM-dd'), label });
    }
    return days;
  }, []);

  // Open verify dialog automatically if "verify" param exists in URL
  useEffect(() => {
    const verifyId = searchParams.get('verify');
    if (verifyId && allAssignments.length > 0) {
      const assignmentToVerify = allAssignments.find(a => a.id === verifyId);
      if (assignmentToVerify) {
        setVerifyDialog({ mode: 'single', items: [assignmentToVerify] });
      }
      
      // Safe remove verify from URL to prevent loop
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('verify');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, allAssignments, setSearchParams]);

  const memberAssignments = useMemo(() => {
    let result = allAssignments.filter(a => a.assignedTo === memberId);

    // Status filter
    if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);

    // Date filter
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(a => a.date === dateStr);
    } else if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      if (dayIndex === 0) {
        const todayTasks = result.filter(a => a.date === dayDateStr);
        const incomingPast = result.filter(a => a.date !== dayDateStr && activeStatuses.includes(a.status));
        result = [...todayTasks, ...incomingPast];
      } else if (dayDateStr) {
        result = result.filter(a => a.date === dayDateStr);
      }
    }

    return result.sort((a, b) => (b.assignedAt?.seconds || 0) - (a.assignedAt?.seconds || 0));
  }, [allAssignments, memberId, statusFilter, selectedDate, dayFilter, recentDays]);

  const filteredAssignments = useMemo(() => {
    if (!searchQuery.trim()) return memberAssignments;
    const q = searchQuery.toLowerCase();
    return memberAssignments.filter(a =>
      (a.businessName || a.clientName)?.toLowerCase().includes(q) ||
      a.displayTitle?.toLowerCase().includes(q) ||
      a.uniqueId?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q)
    );
  }, [memberAssignments, searchQuery]);

  const getClipCount = (duration: string) => CLIP_COUNTS[duration] || Math.floor(parseInt(duration) / 8);
  const getEndCredits = () => 5;
  const hasPoster = (duration: string) => HAS_POSTER[duration] || false;

  const verifyAssignments = async (items: WorkAssignment[]) => {
    if (!currentUser) return;
    try {
      for (const assignment of items) {
        await updateDoc(doc(db, 'work_assignments', assignment.id), {
          status: 'verified',
          verifiedAt: serverTimestamp(),
          verifiedBy: currentUser.uid,
        });
        await sendNotification({
          userId: assignment.assignedTo,
          type: 'work_verified',
          title: 'Work Verified!',
          message: `Your ${assignment.category} work (${assignment.displayTitle}) has been verified and approved.`,
        });
      }
    } catch (error) {
      console.error('Failed to verify assignment(s):', error);
    }
  };

  const handleVerify = (assignment: WorkAssignment) => {
    setVerifyDialog({ mode: 'single', items: [assignment] });
  };

  const handleVerifyAll = (items: WorkAssignment[]) => {
    if (!items.length) return;
    setVerifyDialog({ mode: 'all', items });
  };

  const handleConfirmVerify = async () => {
    if (!verifyDialog || verifyDialog.items.length === 0) return;
    setVerifyingAll(true);
    try {
      await verifyAssignments(verifyDialog.items);
      setVerifyDialog(null);
    } finally {
      setVerifyingAll(false);
    }
  };

  const handleSetEditing = async (assignmentId: string, assignedTo: string) => {
    try {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { status: 'editing' });
      await sendNotification({
        userId: assignedTo,
        type: 'work_editing',
        title: 'Edits Required',
        message: 'Your work has been sent back for edits. Please review and resubmit.',
      });
      setConfirmAction(null);
    } catch (error) {
      console.error('Failed to set editing:', error);
    }
  };

  const handleUndoEditing = async (assignmentId: string) => {
    try {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { status: 'completed' });
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
    setEditForm({ category: a.category, duration: a.duration, pricePerUnit: a.pricePerUnit, businessName: a.businessName || a.clientName || '' });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;
    try {
      const clips = getClipCount(editForm.duration);
      await updateDoc(doc(db, 'work_assignments', editingId), {
        category: editForm.category,
        duration: editForm.duration,
        pricePerUnit: editForm.pricePerUnit,
        clipCount: clips,
        totalPrice: editForm.pricePerUnit,
        businessName: editForm.businessName.trim(),
      });
      setEditingId(null);
      setEditForm(null);
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
    const ts = assignment.assignedAt as any;
    const assignedDate = ts?.toDate?.()
      || (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : undefined)
      || (assignment.assignedAtIso ? new Date(assignment.assignedAtIso) : undefined)
      || (assignment.date ? new Date(`${assignment.date}T00:00:00`) : undefined);
    if (!assignedDate || Number.isNaN(assignedDate.getTime())) return assignment.date || '—';
    return `${formatDate(assignedDate)} ${formatTime(assignedDate)}`;
  };

  const getAdName = (assignment: WorkAssignment) => {
    return assignment.businessName || assignment.clientName || assignment.displayTitle;
  };

  const completedVisibleAssignments = useMemo(
    () => filteredAssignments.filter((a) => a.status === 'completed'),
    [filteredAssignments]
  );

  if (assignmentsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalPrice = filteredAssignments.reduce((s, a) => s + a.totalPrice, 0);

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
                : <>Send <strong className="text-foreground">{confirmAction.title}</strong> back to the member for edits?</>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !verifyingAll && setVerifyDialog(null)}>
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {verifyDialog.mode === 'all' ? `Verify All (${verifyDialog.items.length})` : 'Verify Assignment'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review member, ad name, price, and date/time before confirming verification.
                </p>
              </div>
              <button
                onClick={() => setVerifyDialog(null)}
                disabled={verifyingAll}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] md:text-xs font-medium text-muted-foreground">
                <span className="col-span-3">Member Name</span>
                <span className="col-span-4">Ad Name</span>
                <span className="col-span-2">Price</span>
                <span className="col-span-3">Time & Date</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-border">
                {verifyDialog.items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-xs md:text-sm text-foreground">
                    <span className="col-span-3 truncate" title={member?.name || 'Unknown'}>{member?.name || 'Unknown'}</span>
                    <span className="col-span-4 truncate" title={getAdName(item)}>{getAdName(item)}</span>
                    <span className="col-span-2 font-medium text-primary">{formatCurrency(item.totalPrice)}</span>
                    <span className="col-span-3 text-muted-foreground">{getAssignedStamp(item)}</span>
                  </div>
                ))}
              </div>
            </div>
              {verifyDialog.items.length === 1 && (
                <WorkPreview assignmentId={verifyDialog.items[0].id} />
              )}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs md:text-sm text-muted-foreground">
                Total items: <span className="font-semibold text-foreground">{verifyDialog.items.length}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVerifyDialog(null)}
                  disabled={verifyingAll}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmVerify}
                  disabled={verifyingAll}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {verifyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{verifyingAll ? 'Verifying...' : 'Confirm Verify'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-lg shrink-0">
            {member?.name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-foreground truncate">{member?.name || 'Unknown Member'}</h1>
            <p className="text-xs text-muted-foreground">
              {memberAssignments.length} active assignment{memberAssignments.length !== 1 ? 's' : ''} · Total: {formatCurrency(totalPrice)}
            </p>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search by business name, ID, category..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-2 md:px-3 py-2 text-xs md:text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none flex-1 sm:flex-none">
            <option value="all">All Status</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="verified">Verified</option>
            <option value="editing">Editing</option>
          </select>
          {!selectedDate && (
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
              className="border rounded-lg px-2 md:px-3 py-2 text-xs md:text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none flex-1 sm:flex-none">
              {recentDays.map((d, i) => (
                <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, 'dd/MM')})</option>
              ))}
              <option value="all">All Days</option>
            </select>
          )}
          <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); if (d) setDayFilter('0'); }} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          )}
          <button
            onClick={() => handleVerifyAll(completedVisibleAssignments)}
            disabled={verifyingAll || completedVisibleAssignments.length === 0}
            className="flex items-center gap-1.5 px-2 md:px-3 py-2 text-xs md:text-sm font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Verify all completed assignments in current filter"
          >
            {verifyingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{verifyingAll ? 'Verifying...' : `Verify All (${completedVisibleAssignments.length})`}</span>
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {['assigned', 'in_progress', 'editing', 'completed', 'verified'].map(status => {
          const count = filteredAssignments.filter(a => a.status === status).length;
          return (
            <div key={status} className="bg-card border border-border rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-foreground">{count}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
            </div>
          );
        })}
      </div>

      {/* Assignment Cards */}
      <div className="space-y-3">
        {filteredAssignments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{searchQuery.trim() ? 'No matching assignments' : 'No active assignments'}</p>
          </div>
        ) : filteredAssignments.map(a => (
          <div key={a.id} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Card Header */}
            <div className="px-4 py-3 border-b border-border/50 flex flex-wrap items-center gap-2">
              <span className={`text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[a.status]}`}>
                {a.status.replace('_', ' ')}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{a.uniqueId}</span>
              {(a.businessName || a.clientName) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium">
                  {a.businessName || a.clientName}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">Assigned: {getAssignedStamp(a)}</span>
            </div>

            {/* Card Body */}
            <div className="px-4 py-3">
              {editingId === a.id && editForm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={editForm.category} onChange={(e) => {
                    const cat = e.target.value;
                    const dur = DURATIONS[cat][0];
                    setEditForm(prev => prev ? { ...prev, category: cat, duration: dur, pricePerUnit: PRICING[cat]?.[dur] ?? 0 } : prev);
                  }} className="border rounded px-2 py-1 text-xs bg-background text-foreground border-border">
                    <option value="wishes">Wishes</option>
                    <option value="promotional">Promotional</option>
                    <option value="cinematic">Cinematic</option>
                  </select>
                  <select value={editForm.duration} onChange={(e) => setEditForm(prev => prev ? { ...prev, duration: e.target.value, pricePerUnit: PRICING[prev.category]?.[e.target.value] ?? 0 } : prev)}
                    className="border rounded px-2 py-1 text-xs bg-background text-foreground border-border">
                    {DURATIONS[editForm.category].map(d => <option key={d} value={d}>{d} ({getClipCount(d)} clips + {hasPoster(d) ? 'Poster ' : ''}{getEndCredits()}s EC)</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <input type="number" value={editForm.pricePerUnit} onChange={(e) => setEditForm(prev => prev ? { ...prev, pricePerUnit: parseInt(e.target.value) || 0 } : prev)}
                      className="w-20 border rounded px-2 py-1 text-xs bg-background text-foreground border-border" />
                  </div>
                  <input type="text" placeholder="Business name" value={editForm.businessName}
                    onChange={(e) => setEditForm(prev => prev ? { ...prev, businessName: e.target.value } : prev)}
                    className="w-32 border rounded px-2 py-1 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">= {formatCurrency(editForm.pricePerUnit)}</span>
                  <button onClick={handleSaveEdit} className="flex items-center space-x-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded transition-colors">
                    <Save className="w-3 h-3" /><span>Save</span>
                  </button>
                  <button onClick={() => { setEditingId(null); setEditForm(null); }} className="flex items-center space-x-1 px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded transition-colors">
                    <X className="w-3 h-3" /><span>Cancel</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Category</p>
                    <p className="text-sm font-medium text-foreground capitalize">{a.category}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Duration & Clips</p>
                    <p className="text-sm font-medium text-foreground">{a.duration} · {a.clipCount} clips</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Price</p>
                    <p className="text-sm font-medium text-primary font-mono">{formatCurrency(a.totalPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Access Code</p>
                    <p className="text-sm font-medium text-foreground font-mono">{a.accessCode}</p>
                  </div>
                  {a.totalDurationSeconds > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Time Spent</p>
                      <p className="text-sm font-medium text-foreground">{formatDuration(a.totalDurationSeconds)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Card Actions */}
            {editingId !== a.id && (
              <div className="px-4 py-2 border-t border-border/50 flex items-center flex-wrap gap-1.5">
                {a.status === 'completed' && (
                  <button onClick={() => handleVerify(a)}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[10px] md:text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-lg transition-colors">
                    <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Verify</span>
                  </button>
                )}
                {(a.status === 'completed' || a.status === 'verified') && (
                    <button onClick={() => setConfirmAction({ type: 'sendback', id: a.id, assignedTo: a.assignedTo, title: a.businessName || a.clientName || a.displayTitle })}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[10px] md:text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 rounded-lg transition-colors">
                    <Edit3 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Send Back</span>
                  </button>
                )}
                {a.status === 'editing' && (
                  <button onClick={() => handleUndoEditing(a.id)}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[10px] md:text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 rounded-lg transition-colors">
                    <Undo2 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Undo</span>
                  </button>
                )}
                {a.status !== 'verified' && (
                  <button onClick={() => handleStartEdit(a)}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[10px] md:text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors">
                    <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Edit</span>
                  </button>
                )}
                <button onClick={() => setConfirmAction({ type: 'delete', id: a.id, title: a.businessName || a.clientName || a.displayTitle })}
                  className="flex items-center space-x-1 px-2.5 py-1 text-[10px] md:text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                  <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Delete</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
