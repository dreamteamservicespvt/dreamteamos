import React, { useState, useMemo } from 'react';
import {
  ClipboardList, Plus, Trash2, Eye, CheckCircle2, Edit3, Loader2, AlertCircle,
  Search, Filter, ChevronDown, Pencil, X, Save, Undo2
} from 'lucide-react';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreCollection } from '@/hooks/useFirestore';
import { PRICING } from '@/utils/pricing';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { format, subDays, startOfDay } from 'date-fns';
import DashboardDayPicker from '@/components/dashboard/DayPicker';
import type { WorkAssignment, AppUser, WorkSubmission } from '@/types';

const DURATIONS: Record<string, string[]> = {
  wishes: ['20s', '40s'],
  promotional: ['16s', '32s', '45s', '64s'],
  cinematic: ['16s', '32s', '45s', '64s'],
};

// Clip count lookup for promotional/cinematic durations
const CLIP_COUNTS: Record<string, number> = {
  '16s': 2, '32s': 4, '45s': 6, '64s': 8,
  '20s': 2, '40s': 4,
};

// Whether duration includes a poster (32s+)
const HAS_POSTER: Record<string, boolean> = {
  '16s': false, '32s': true, '45s': true, '64s': true,
  '20s': false, '40s': false,
};

function generateAccessCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Simple sequential ID: W001, P002, C003
function generateSimpleId(category: string, existingAssignments: WorkAssignment[]): string {
  const prefix = category === 'wishes' ? 'W' : category === 'promotional' ? 'P' : 'C';
  const sameCategory = existingAssignments.filter(a => a.uniqueId?.startsWith(prefix));
  const maxNum = sameCategory.reduce((max, a) => {
    const num = parseInt(a.uniqueId?.slice(1) || '0');
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

function getDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export default function WorkAssign() {
  const user = useAuthStore((s) => s.user);
  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>('users');
  const { data: assignments, loading: assignmentsLoading } = useFirestoreCollection<WorkAssignment>('work_assignments');
  const techMembers = useMemo(() => allUsers.filter(u => u.role === 'tech_member' && u.isActive), [allUsers]);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ category: string; duration: string; pricePerUnit: number } | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'sendback'; id: string; assignedTo?: string; title: string } | null>(null);

  // Form state — no more end credits or manual clip count
  const [form, setForm] = useState({
    assignedTo: '',
    category: 'wishes' as 'wishes' | 'promotional' | 'cinematic',
    duration: '20s',
    pricePerUnit: 499,
  });

  // Get clip count from lookup table
  const getClipCount = (duration: string) => {
    return CLIP_COUNTS[duration] || Math.floor(parseInt(duration) / 8);
  };
  const getEndCredits = (duration: string) => {
    return 5; // Always 5s end credits
  };
  const hasPoster = (duration: string) => {
    return HAS_POSTER[duration] || false;
  };

  // Auto-update price when category/duration changes
  const updateField = (field: string, value: any) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'category') {
        const durations = DURATIONS[value as string];
        next.duration = durations[0];
        next.pricePerUnit = PRICING[value as string]?.[durations[0]] ?? 0;
      }
      if (field === 'duration') {
        next.pricePerUnit = PRICING[next.category]?.[value as string] ?? 0;
      }
      return next;
    });
  };

  const clipCount = getClipCount(form.duration);
  const totalPrice = form.pricePerUnit;

  const filteredMembers = techMembers.filter(m =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleCreate = async () => {
    if (!user || !form.assignedTo) return;
    setSubmitting(true);
    try {
      const uniqueId = generateSimpleId(form.category, assignments);
      const accessCode = generateAccessCode();
      const today = format(new Date(), 'yyyy-MM-dd');
      const clips = getClipCount(form.duration);

      await addDoc(collection(db, 'work_assignments'), {
        assignedTo: form.assignedTo,
        assignedBy: user.uid,
        assignedAt: serverTimestamp(),
        category: form.category,
        clipCount: clips,
        includesEndCredits: false,
        duration: form.duration,
        pricePerUnit: form.pricePerUnit,
        totalPrice: form.pricePerUnit,
        uniqueId,
        accessCode,
        businessName: '',
        displayTitle: `${form.category.charAt(0).toUpperCase() + form.category.slice(1)} - ${uniqueId}`,
        status: 'assigned',
        sessions: [],
        totalDurationSeconds: 0,
        date: today,
      });

      // Send notification
      await addDoc(collection(db, 'notifications'), {
        userId: form.assignedTo,
        type: 'work_assigned',
        title: 'New Work Assigned',
        message: `You have been assigned a new ${form.category} work (${clips} clips, ${form.duration}). Access code: ${accessCode}`,
        read: false,
        createdAt: serverTimestamp(),
      });

      setShowForm(false);
      setForm({ assignedTo: '', category: 'wishes', duration: '20s', pricePerUnit: 499 });
      setMemberSearch('');
    } catch (error) {
      console.error('Failed to create assignment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (assignment: WorkAssignment) => {
    if (!user) return;
    try {
      // Update assignment to verified
      await updateDoc(doc(db, 'work_assignments', assignment.id), {
        status: 'verified',
        verifiedAt: serverTimestamp(),
        verifiedBy: user.uid,
      });

      // Auto-create work_submission
      const items = [];
      for (let i = 0; i < assignment.clipCount; i++) {
        items.push({
          type: assignment.category,
          duration: assignment.duration,
          quantity: 1,
          pricePerUnit: assignment.pricePerUnit,
        });
      }

      await addDoc(collection(db, 'work_submissions'), {
        techMemberId: assignment.assignedTo,
        submittedAt: serverTimestamp(),
        date: assignment.completedDate || format(new Date(), 'yyyy-MM-dd'),
        status: 'approved',
        approvedBy: user.uid,
        approvedAt: serverTimestamp(),
        totalVideos: assignment.clipCount,
        aiVerificationResult: 'pass',
        driveFolderUrl: '',
        screenshotUrl: '',
        items,
        calculatedRevenue: assignment.totalPrice,
        source: 'work_assignment',
        workAssignmentId: assignment.id,
      });

      // Notify member
      await addDoc(collection(db, 'notifications'), {
        userId: assignment.assignedTo,
        type: 'work_verified',
        title: 'Work Verified!',
        message: `Your ${assignment.category} work (${assignment.displayTitle}) has been verified and approved.`,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to verify assignment:', error);
    }
  };

  const handleSetEditing = async (assignmentId: string, assignedTo: string) => {
    try {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { status: 'editing' });
      await addDoc(collection(db, 'notifications'), {
        userId: assignedTo,
        type: 'work_editing',
        title: 'Edits Required',
        message: 'Your work has been sent back for edits. Please review and resubmit.',
        read: false,
        createdAt: serverTimestamp(),
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
    setEditForm({ category: a.category, duration: a.duration, pricePerUnit: a.pricePerUnit });
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
      });
      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Failed to edit assignment:', error);
    }
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

  const filteredAssignments = useMemo(() => {
    let result = assignments;
    if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.displayTitle?.toLowerCase().includes(q) ||
        a.businessName?.toLowerCase().includes(q) ||
        a.uniqueId?.toLowerCase().includes(q) ||
        techMembers.find(m => m.uid === a.assignedTo)?.name.toLowerCase().includes(q)
      );
    }

    // Date filter
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(a => a.date === dateStr);
    } else if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      if (dayIndex === 0) {
        // Today: show today's tasks + any assigned (incoming) tasks from past
        const todayTasks = result.filter(a => a.date === dayDateStr);
        const incomingPast = result.filter(a => a.date !== dayDateStr && a.status === 'assigned');
        result = [...todayTasks, ...incomingPast];
      } else {
        result = result.filter(a => a.date === dayDateStr);
      }
    }

    return result.sort((a, b) => (b.assignedAt?.seconds || 0) - (a.assignedAt?.seconds || 0));
  }, [assignments, statusFilter, searchQuery, techMembers, selectedDate, dayFilter, recentDays]);

  const getMemberName = (uid: string) => allUsers.find(u => u.uid === uid)?.name || 'Unknown';

  const statusColors: Record<string, string> = {
    assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Work Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">Assign, track and verify AI ad generation work</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /><span>{showForm ? 'Cancel' : 'New Assignment'}</span>
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4 text-card-foreground">Create New Assignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Member */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Assign To</label>
              <div className="relative">
                <input type="text" placeholder="Search member..." value={memberSearch}
                  onChange={(e) => { setMemberSearch(e.target.value); if (form.assignedTo) updateField('assignedTo', ''); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
                {form.assignedTo && (
                  <div className="mt-1 text-xs text-green-500">✓ {techMembers.find(m => m.uid === form.assignedTo)?.name}</div>
                )}
                {!form.assignedTo && memberSearch && filteredMembers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredMembers.map(m => (
                      <button key={m.uid} type="button" onClick={() => { updateField('assignedTo', m.uid); setMemberSearch(m.name); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground">{m.name}</button>
                    ))}
                  </div>
                )}
                {!form.assignedTo && memberSearch && filteredMembers.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg p-3 text-xs text-muted-foreground">No members found</div>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Category</label>
              <select value={form.category} onChange={(e) => updateField('category', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="wishes">Wishes</option>
                <option value="promotional">Promotional</option>
                <option value="cinematic">Cinematic</option>
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Duration</label>
              <select value={form.duration} onChange={(e) => updateField('duration', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                {DURATIONS[form.category].map(d => <option key={d} value={d}>{d} ({getClipCount(d)} clips + {hasPoster(d) ? 'Poster ' : ''}{getEndCredits(d)}s EC)</option>)}
              </select>
            </div>

            {/* Price Per Unit */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Price Per Unit (₹)</label>
              <input type="number" min={0} value={form.pricePerUnit}
                onChange={(e) => updateField('pricePerUnit', parseInt(e.target.value) || 0)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-bold text-foreground text-lg">{formatCurrency(totalPrice)}</span>
              <span className="ml-2">({clipCount} clips + {hasPoster(form.duration) ? 'Poster ' : ''}5s EC)</span>
            </div>
            <button onClick={handleCreate} disabled={submitting || !form.assignedTo}
              className="flex items-center space-x-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              <span>{submitting ? 'Creating...' : 'Create Assignment'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center space-x-3 flex-wrap gap-y-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search by name, title, ID..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
          <option value="all">All Status</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="verified">Verified</option>
          <option value="editing">Editing</option>
        </select>
        {!selectedDate && (
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
            {recentDays.map((d, i) => (
              <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
            ))}
            <option value="all">All Days</option>
          </select>
        )}
        <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); if (d) setDayFilter('0'); }} />
        {selectedDate && (
          <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Clear date</button>
        )}
      </div>

      {/* Day info */}
      <p className="text-xs text-muted-foreground">
        {selectedDate
          ? `Showing assignments from ${format(selectedDate, "dd/MM/yyyy")}`
          : dayFilter === "all"
            ? "Showing all assignments"
            : dayFilter === "0"
              ? "Today's assignments + incoming (assigned) from past"
              : `Showing assignments from ${recentDays[parseInt(dayFilter)]?.label}`
        }
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {['assigned', 'in_progress', 'completed', 'verified', 'editing'].map(status => {
          const count = filteredAssignments.filter(a => a.status === status).length;
          return (
            <div key={status} className="bg-card border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-card-foreground">{count}</p>
              <p className="text-xs text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
            </div>
          );
        })}
      </div>

      {/* Assignments List */}
      <div className="space-y-3">
        {filteredAssignments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No assignments found</p>
          </div>
        ) : filteredAssignments.map(a => (
          <div key={a.id} className="bg-card border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="font-semibold text-card-foreground">{a.businessName || a.displayTitle}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[a.status]}`}>
                    {a.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">{a.uniqueId}</span>
                </div>

                {/* Inline edit mode */}
                {editingId === a.id && editForm ? (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <select value={editForm.category} onChange={(e) => {
                      const cat = e.target.value;
                      const dur = DURATIONS[cat][0];
                      setEditForm({ category: cat, duration: dur, pricePerUnit: PRICING[cat]?.[dur] ?? 0 });
                    }} className="border rounded px-2 py-1 text-xs bg-background text-foreground border-border">
                      <option value="wishes">Wishes</option>
                      <option value="promotional">Promotional</option>
                      <option value="cinematic">Cinematic</option>
                    </select>
                    <select value={editForm.duration} onChange={(e) => setEditForm(prev => prev ? { ...prev, duration: e.target.value, pricePerUnit: PRICING[prev.category]?.[e.target.value] ?? 0 } : prev)}
                      className="border rounded px-2 py-1 text-xs bg-background text-foreground border-border">
                      {DURATIONS[editForm.category].map(d => <option key={d} value={d}>{d} ({getClipCount(d)} clips + {hasPoster(d) ? 'Poster ' : ''}{getEndCredits(d)}s EC)</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">₹</span>
                      <input type="number" value={editForm.pricePerUnit} onChange={(e) => setEditForm(prev => prev ? { ...prev, pricePerUnit: parseInt(e.target.value) || 0 } : prev)}
                        className="w-20 border rounded px-2 py-1 text-xs bg-background text-foreground border-border" />
                    </div>
                    <span className="text-xs text-muted-foreground">= {formatCurrency(editForm.pricePerUnit)}</span>
                    <button onClick={handleSaveEdit} className="flex items-center space-x-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded transition-colors">
                      <Save className="w-3 h-3" /><span>Save</span>
                    </button>
                    <button onClick={() => { setEditingId(null); setEditForm(null); }} className="flex items-center space-x-1 px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded transition-colors">
                      <X className="w-3 h-3" /><span>Cancel</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Assigned to: <strong className="text-foreground">{getMemberName(a.assignedTo)}</strong></span>
                    <span>Category: <strong className="capitalize text-foreground">{a.category}</strong></span>
                    <span>{a.clipCount} clips + EC · {a.duration}</span>
                    <span>Price: <strong className="text-foreground">{formatCurrency(a.totalPrice)}</strong></span>
                    {a.totalDurationSeconds > 0 && <span>Time: {formatDuration(a.totalDurationSeconds)}</span>}
                    <span className="font-mono text-xs">Code: {a.accessCode}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 ml-4">
                {a.status === 'completed' && (
                  <button onClick={() => handleVerify(a)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-lg transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" /><span>Verify</span>
                  </button>
                )}
                {(a.status === 'completed' || a.status === 'verified') && (
                  <button onClick={() => setConfirmAction({ type: 'sendback', id: a.id, assignedTo: a.assignedTo, title: a.businessName || a.displayTitle })}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 rounded-lg transition-colors">
                    <Edit3 className="w-3.5 h-3.5" /><span>Send Back</span>
                  </button>
                )}
                {a.status === 'editing' && (
                  <button onClick={() => handleUndoEditing(a.id)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 rounded-lg transition-colors">
                    <Undo2 className="w-3.5 h-3.5" /><span>Undo Send Back</span>
                  </button>
                )}
                {a.status !== 'verified' && editingId !== a.id && (
                  <button onClick={() => handleStartEdit(a)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" /><span>Edit</span>
                  </button>
                )}
                <button onClick={() => setConfirmAction({ type: 'delete', id: a.id, title: a.businessName || a.displayTitle })}
                  className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /><span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
