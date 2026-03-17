import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Briefcase, Clock, Play, CheckCircle2, Loader2, AlertCircle, Sparkles, Edit3, Copy, Check, Undo2
} from 'lucide-react';
import { collection, query, where, doc, updateDoc, deleteField, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreQuery } from '@/hooks/useFirestore';
import { format, subDays, startOfDay } from 'date-fns';
import { formatDate, formatTime } from '@/utils/formatters';
import DashboardDayPicker from '@/components/dashboard/DayPicker';
import type { WorkAssignment } from '@/types';
import CodeVerificationModal from '@/components/ai-platform/CodeVerificationModal';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';
import { useConfirm } from '@/hooks/useConfirm';

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
  const [openAssignment, setOpenAssignment] = useState<WorkAssignment | null>(null);
  const sessionStartRef = useRef<Date | null>(null);
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Track session duration
  useEffect(() => {
    if (openAssignment) {
      sessionStartRef.current = new Date();
      // Mark as in_progress if assigned
      if (openAssignment.status === 'assigned' || openAssignment.status === 'editing') {
        updateDoc(doc(db, 'work_assignments', openAssignment.id), { status: 'in_progress' });
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

  const handleOpenWork = (assignment: WorkAssignment) => {
    setVerifyingAssignment(assignment);
  };

  const handleVerified = () => {
    if (verifyingAssignment) {
      setOpenAssignment(verifyingAssignment);
      setVerifyingAssignment(null);
    }
  };

  const handleClose = () => {
    setOpenAssignment(null);
  };

  const handleComplete = async () => {
    if (!openAssignment) return;
    try {
      // Save final session
      if (sessionStartRef.current) {
        const durationSeconds = Math.round((Date.now() - sessionStartRef.current.getTime()) / 1000);
        const newSession = { openedAt: sessionStartRef.current.toISOString(), closedAt: new Date().toISOString(), durationSeconds };
        const prevSessions = openAssignment.sessions || [];
        const prevTotal = openAssignment.totalDurationSeconds || 0;
        await updateDoc(doc(db, 'work_assignments', openAssignment.id), {
          status: 'completed',
          completedAt: serverTimestamp(),
          completedDate: format(new Date(), 'yyyy-MM-dd'),
          sessions: [...prevSessions, newSession],
          totalDurationSeconds: prevTotal + durationSeconds,
        });
        sessionStartRef.current = null;
      } else {
        await updateDoc(doc(db, 'work_assignments', openAssignment.id), {
          status: 'completed',
          completedAt: serverTimestamp(),
          completedDate: format(new Date(), 'yyyy-MM-dd'),
        });
      }

      // Notify admin
      if (openAssignment.assignedBy) {
        await addDoc(collection(db, 'notifications'), {
          userId: openAssignment.assignedBy,
          type: 'work_completed',
          title: 'Work Completed',
          message: `${user?.name || 'A member'} has completed work: ${openAssignment.businessName || openAssignment.displayTitle}`,
          read: false,
          link: `/tech-admin/work-assign/${user.uid}?verify=${openAssignment.id}`,
          createdAt: serverTimestamp(),
        });
      }

      setOpenAssignment(null);
    } catch (error) {
      console.error('Failed to mark complete:', error);
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

  const activeWork = useMemo(() => assignments.filter(a => ['assigned', 'in_progress', 'editing'].includes(a.status)), [assignments]);
  const completedWork = useMemo(() => assignments.filter(a => ['completed', 'verified'].includes(a.status)), [assignments]);

  // 5-day filter
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      days.push({ date: startOfDay(d), dateStr: format(d, "yyyy-MM-dd"), label: getDayLabel(d) });
    }
    return days;
  }, []);

  // Filter by date
  const filteredActive = useMemo(() => {
    let result = activeWork;
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(a => a.date === dateStr);
    } else if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      if (dayIndex === 0) {
        // Today: show today's + any assigned (incoming) from past
        const todayTasks = result.filter(a => a.date === dayDateStr);
        const incomingPast = result.filter(a => a.date !== dayDateStr && a.status === 'assigned');
        result = [...todayTasks, ...incomingPast];
      } else {
        result = result.filter(a => a.date === dayDateStr);
      }
    }
    return result;
  }, [activeWork, selectedDate, dayFilter, recentDays]);

  const filteredCompleted = useMemo(() => {
    let result = completedWork;
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      result = result.filter(a => (a.completedDate || a.date) === dateStr);
    } else if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      result = result.filter(a => (a.completedDate || a.date) === dayDateStr);
    }
    return result;
  }, [completedWork, selectedDate, dayFilter, recentDays]);

  // Show AI Platform when assignment is opened
  if (openAssignment) {
    return (
      <AIPlatformApp
        assignment={openAssignment}
        assignmentId={openAssignment.id}
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

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Work</h1>
        <p className="text-sm text-muted-foreground mt-1">AI ad generation assignments</p>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedDate ? 'custom' : dayFilter} onChange={e => { setSelectedDate(undefined); setDayFilter(e.target.value); }}
          className="border rounded-lg px-3 py-2 text-sm bg-card text-card-foreground">
          {recentDays.map((d, i) => <option key={i} value={String(i)}>{d.label}</option>)}
          <option value="all">All Days</option>
        </select>
        <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); if (d) setDayFilter('custom'); }} />
        {selectedDate && (
          <button onClick={() => { setSelectedDate(undefined); setDayFilter('0'); }} className="text-xs text-muted-foreground hover:text-foreground">Clear date</button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {selectedDate ? format(selectedDate, 'MMM d, yyyy') : recentDays[parseInt(dayFilter)]?.label || 'All Days'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-card-foreground">{activeWork.length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="bg-card border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-card-foreground">{completedWork.length}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-card-foreground">{assignments.filter(a => a.status === 'verified').length}</p>
          <p className="text-xs text-muted-foreground">Verified</p>
        </div>
        <div className="bg-card border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-card-foreground">
            {formatDuration(assignments.reduce((sum, a) => sum + (a.totalDurationSeconds || 0), 0))}
          </p>
          <p className="text-xs text-muted-foreground">Total Time</p>
        </div>
      </div>

      {/* Active Work */}
      {filteredActive.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center space-x-2">
            <Briefcase className="w-5 h-5" /><span>Active Assignments ({filteredActive.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredActive.map(a => {
              const cfg = statusConfig[a.status];
              return (
                <div key={a.id} className="bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-card-foreground">{a.businessName || a.displayTitle}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{a.uniqueId}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{a.status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
                    <span className="capitalize">{a.category}</span>
                    <span>{a.clipCount} clips + EC</span>
                    <span>{a.duration}</span>
                    <span>Assigned: {getAssignedStamp(a)}</span>
                    {a.totalDurationSeconds > 0 && (
                      <span className="flex items-center space-x-1"><Clock className="w-3 h-3" /><span>{formatDuration(a.totalDurationSeconds)}</span></span>
                    )}
                  </div>
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
                  <button onClick={() => handleOpenWork(a)}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">
                    {cfg.icon}<span>{cfg.label}</span><span className="text-[10px] opacity-60 font-mono ml-1">{a.uniqueId}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Work */}
      {filteredCompleted.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5" /><span>Completed ({filteredCompleted.length})</span>
          </h2>
          <div className="space-y-2">
            {filteredCompleted.map(a => {
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
          </div>
        </div>
      )}

      {assignments.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No assignments yet</p>
          <p className="text-sm mt-1">Your work assignments will appear here</p>
        </div>
      )}
    </div>
  );
}
