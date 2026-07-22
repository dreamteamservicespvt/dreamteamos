import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AgreementListForMember from '@/components/agreement/AgreementListForMember';
import type { DateRange } from 'react-day-picker';
import {
  ArrowLeft, ClipboardList, Trash2, CheckCircle2, Edit3, Loader2,
  Pencil, X, Save, Undo2, Search, Copy, Check, MessageCircle
} from 'lucide-react';
import { doc, updateDoc, deleteDoc, serverTimestamp, query, where, getDocs, collection } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { sendNotification } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreCollection } from '@/hooks/useFirestore';
import ReassignWork from '@/components/work/ReassignWork';
import {
  DURATIONS, END_CREDITS_SECONDS, getClipCount, hasPoster, durationOptionsFor, priceForClips,
} from '@/utils/assignmentDuration';
import { formatDate, formatTime } from '@/utils/formatters';
import { formatPhoneDisplay, getWhatsAppUrl, normalizePhone } from '@/utils/phone';
import { format, subDays, startOfDay } from 'date-fns';
import DashboardDateRangePicker from '@/components/dashboard/DateRangePicker';
import type { WorkAssignment, AppUser } from '@/types';
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from '@/types/aiPlatform';
import { formatDateRangeLabel, isDateWithinRange, normalizeDateRange, parseQueryDate, parseQueryDateRange } from '@/utils/dateRange';

// Human-readable labels for each attire option (mirrors WorkAssign / AIPlatformApp).
const ATTIRE_LABELS: Record<AttireType, string> = {
  [AttireType.PROFESSIONAL]: 'Professional (Formal Suit)',
  [AttireType.TRADITIONAL]: 'Traditional (Designer Saree)',
  [AttireType.SHIRT_PANT]: 'Professional (In-shirt & Pant)',
  [AttireType.CUSTOM]: 'Custom',
};

const ASSIGNMENT_LANGUAGE_OPTIONS = ['Telugu', 'English', 'Hindi', 'Kannada', 'Custom'] as const;

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const VALID_STATUS_FILTERS = ['all', 'assigned', 'in_progress', 'completed', 'verified', 'editing'] as const;

function isValidDayFilter(value: string | null): value is string {
  return value === 'all' || (typeof value === 'string' && /^[0-4]$/.test(value));
}

export default function TeamLeaderMemberAssignments() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>('users');
  const { data: allAssignments, loading: assignmentsLoading } = useFirestoreCollection<WorkAssignment>('work_assignments');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('0');
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    category: string; duration: string; businessName: string; businessWhatsapp: string;
    modelGender: ModelGender; attireType: AttireType; customAttire: string; aspectRatio: '9:16' | '16:9'; language: string; customLanguage: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'sendback'; id: string; assignedTo?: string; title: string } | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState<{ mode: 'single' | 'all'; items: WorkAssignment[] } | null>(null);

  const member = useMemo(() => allUsers.find(u => u.uid === memberId), [allUsers, memberId]);

  const activeStatuses = ['assigned', 'in_progress', 'editing'];

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && VALID_STATUS_FILTERS.includes(statusParam as typeof VALID_STATUS_FILTERS[number])) {
      setStatusFilter(statusParam);
    } else {
      setStatusFilter('all');
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

  useEffect(() => {
    const verifyId = searchParams.get('verify');
    if (verifyId && allAssignments.length > 0) {
      const assignmentToVerify = allAssignments.find(a => a.id === verifyId);
      if (assignmentToVerify) {
        setVerifyDialog({ mode: 'single', items: [assignmentToVerify] });
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('verify');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, allAssignments, setSearchParams]);

  const memberAssignments = useMemo(() => {
    let result = allAssignments.filter(a => a.assignedTo === memberId);
    if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);
    if (selectedRange?.from) {
      result = result.filter(a => isDateWithinRange(a.date, selectedRange));
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
  }, [allAssignments, memberId, statusFilter, selectedRange, dayFilter, recentDays]);

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

  const handleVerify = (assignment: WorkAssignment) => setVerifyDialog({ mode: 'single', items: [assignment] });
  const handleVerifyAll = (items: WorkAssignment[]) => { if (items.length) setVerifyDialog({ mode: 'all', items }); };

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
    const gender = (a.modelGender as ModelGender) || ModelGender.FEMALE;
    const attireType = (a.attireType as AttireType) || AttireType.TRADITIONAL;
    const isPresetLanguage = a.language && (ASSIGNMENT_LANGUAGE_OPTIONS as readonly string[]).includes(a.language);
    setEditForm({
      category: a.category, duration: a.duration, businessName: a.businessName || a.clientName || '', businessWhatsapp: a.businessWhatsapp || '',
      modelGender: gender, attireType, customAttire: a.customAttire || '',
      aspectRatio: a.aspectRatio || '9:16',
      language: a.language ? (isPresetLanguage ? a.language : 'Custom') : 'Telugu',
      customLanguage: a.language && !isPresetLanguage ? a.language : '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;
    try {
      const clips = getClipCount(editForm.duration);
      const price = priceForClips(editForm.category, clips);
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

  const getAdName = (assignment: WorkAssignment) => assignment.businessName || assignment.clientName || assignment.displayTitle;

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

      {/* Verify Dialog — no pricing */}
      {verifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !verifyingAll && setVerifyDialog(null)}>
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {verifyDialog.mode === 'all' ? `Verify All (${verifyDialog.items.length})` : 'Verify Assignment'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review ad name and date/time before confirming verification.
                </p>
              </div>
              <button onClick={() => setVerifyDialog(null)} disabled={verifyingAll}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-7 gap-2 px-3 py-2 bg-muted/50 text-[11px] md:text-xs font-medium text-muted-foreground">
                <span className="col-span-4">Ad Name</span>
                <span className="col-span-3">Time & Date</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-border">
                {verifyDialog.items.map(item => (
                  <div key={item.id} className="grid grid-cols-7 gap-2 px-3 py-2.5 text-xs md:text-sm text-foreground">
                    <span className="col-span-4 truncate" title={getAdName(item)}>{getAdName(item)}</span>
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
                <button onClick={() => setVerifyDialog(null)} disabled={verifyingAll}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleConfirmVerify} disabled={verifyingAll}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">
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
        <button onClick={() => navigate('/team-leader/work-assign')}
          className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{member?.name || 'Member'}</h1>
          <p className="text-xs text-muted-foreground">{member?.email}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 md:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-xs md:text-sm text-foreground outline-none flex-1 sm:flex-none">
              <option value="all">All Status</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="verified">Verified</option>
              <option value="editing">Editing</option>
            </select>
            {!selectedRange?.from && (
              <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-xs md:text-sm text-foreground outline-none flex-1 sm:flex-none">
                {recentDays.map((d, i) => (
                  <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, 'dd/MM')})</option>
                ))}
                <option value="all">All Days</option>
              </select>
            )}
            <DashboardDateRangePicker value={selectedRange} onSelect={(range) => { setSelectedRange(normalizeDateRange(range)); if (range?.from) setDayFilter('all'); }} />
            {(selectedRange?.from || dayFilter !== 'all') && (
              <button onClick={() => { setSelectedRange(undefined); setDayFilter('all'); }} className="h-10 rounded-xl border border-border/70 px-3 text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground">Clear</button>
            )}
            <button
              onClick={() => handleVerifyAll(completedVisibleAssignments)}
              disabled={verifyingAll || completedVisibleAssignments.length === 0}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-green-100 px-3 text-xs md:text-sm font-medium text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 disabled:cursor-not-allowed disabled:opacity-50">
              {verifyingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{verifyingAll ? 'Verifying...' : `Verify All (${completedVisibleAssignments.length})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
        {['assigned', 'in_progress', 'completed', 'verified', 'editing'].map(status => {
          const count = filteredAssignments.filter(a => a.status === status).length;
          return (
            <div key={status} className="bg-card border rounded-lg p-2 md:p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-card-foreground">{count}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
            </div>
          );
        })}
      </div>

      {/* Assignment List — no pricing */}
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
                </div>

                {/* Inline edit — full labeled grid (no price for leads) */}
                {editingId === a.id && editForm ? (
                  <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 md:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Category */}
                      <div>
                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Category</label>
                        <select value={editForm.category} onChange={(e) => {
                          const cat = e.target.value;
                          const dur = DURATIONS[cat][0];
                          setEditForm(prev => prev ? { ...prev, category: cat, duration: dur } : prev);
                        }} className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                          <option value="wishes">Wishes</option>
                          <option value="promotional">Promotional</option>
                          <option value="cinematic">Cinematic</option>
                        </select>
                      </div>

                      {/* Duration */}
                      <div>
                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Duration</label>
                        <select value={editForm.duration} onChange={(e) => setEditForm(prev => prev ? { ...prev, duration: e.target.value } : prev)}
                          className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                          {durationOptionsFor(editForm.category, editForm.duration).map(d => <option key={d} value={d}>{d} ({getClipCount(d)} clips + {hasPoster(d) ? 'Poster ' : ''}{END_CREDITS_SECONDS}s EC)</option>)}
                        </select>
                      </div>

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
                                return { ...prev, modelGender: g, attireType: allowed.includes(prev.attireType) ? prev.attireType : AttireType.PROFESSIONAL };
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
                          {ATTIRE_OPTIONS_BY_GENDER[editForm.modelGender].map(at => <option key={at} value={at}>{ATTIRE_LABELS[at]}</option>)}
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

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-end gap-2">
                      <button onClick={() => { setEditingId(null); setEditForm(null); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded-lg transition-colors hover:text-foreground">
                        <X className="w-3 h-3" /><span>Cancel</span>
                      </button>
                      <button onClick={handleSaveEdit}
                        className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg transition-colors hover:bg-green-700">
                        <Save className="w-3 h-3" /><span>Save Changes</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-x-3 md:gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                      <span>Assigned: <strong className="text-foreground">{getAssignedStamp(a)}</strong></span>
                      {(a.businessName || a.clientName) && <span>Business: <strong className="text-foreground">{a.businessName || a.clientName}</strong></span>}
                      <span>Category: <strong className="capitalize text-foreground">{a.category}</strong></span>
                      <span>{a.clipCount} clips + EC · {a.duration}</span>
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
                  <button onClick={() => handleVerify(a)}
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
                {a.status !== 'verified' && currentUser && (
                  <ReassignWork assignment={a} currentUser={{ uid: currentUser.uid, name: currentUser.name }}
                    members={allUsers.filter(u => u.role === 'tech_member' && u.createdBy === currentUser.createdBy && u.isActive !== false)} />
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

      {memberId && <AgreementListForMember memberId={memberId} />}
    </div>
  );
}
