import React, { useState, useMemo } from 'react';
import {
  Film, Clock, Loader2, CheckCircle2, Sparkles, Play, Edit3, Search, Copy, Check,
} from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreQuery } from '@/hooks/useFirestore';
import { formatDate, formatTime } from '@/utils/formatters';
import type { WorkAssignment } from '@/types';
import CodeVerificationModal from '@/components/ai-platform/CodeVerificationModal';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';
import { doc, updateDoc } from 'firebase/firestore';
import { useRef } from 'react';

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  assigned:    { icon: <Play className="w-3 h-3" />,        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       label: 'Assigned' },
  in_progress: { icon: <Sparkles className="w-3 h-3" />,    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'In Progress' },
  completed:   { icon: <CheckCircle2 className="w-3 h-3" />,color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',     label: 'Completed' },
  verified:    { icon: <CheckCircle2 className="w-3 h-3" />,color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Verified' },
  editing:     { icon: <Edit3 className="w-3 h-3" />,       color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',  label: 'Edits Required' },
};

function getAssignedSeconds(a: WorkAssignment): number {
  const ts = a.assignedAt as any;
  return ts?.seconds || (a.assignedAtIso ? Math.floor(new Date(a.assignedAtIso).getTime() / 1000) : 0);
}

function getAssignedStamp(a: WorkAssignment): string {
  const ts = a.assignedAt as any;
  const date =
    ts?.toDate?.() ||
    (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : undefined) ||
    (a.assignedAtIso ? new Date(a.assignedAtIso) : undefined) ||
    (a.date ? new Date(`${a.date}T00:00:00`) : undefined);
  if (!date || Number.isNaN(date.getTime())) return a.date || '—';
  return `${formatDate(date)} ${formatTime(date)}`;
}

export default function RecentAds() {
  const user = useAuthStore((s) => s.user);
  const q = useMemo(
    () => (user ? query(collection(db, 'work_assignments'), where('assignedTo', '==', user.uid)) : null),
    [user?.uid],
  );
  const { data: assignments, loading } = useFirestoreQuery<WorkAssignment>(q, [user?.uid]);

  const [search, setSearch] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [verifyingAssignment, setVerifyingAssignment] = useState<WorkAssignment | null>(null);
  const [openAssignment, setOpenAssignment] = useState<WorkAssignment | null>(null);
  const sessionStartRef = useRef<Date | null>(null);

  const sorted = useMemo(
    () => [...assignments].sort((a, b) => getAssignedSeconds(b) - getAssignedSeconds(a)),
    [assignments],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (a) =>
        (a.businessName || a.displayTitle || '').toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q) ||
        (a.uniqueId || '').toLowerCase().includes(q),
    );
  }, [sorted, search]);

  // Track session when an ad is opened
  React.useEffect(() => {
    if (openAssignment) {
      sessionStartRef.current = new Date();
      if (openAssignment.status === 'assigned' || openAssignment.status === 'editing') {
        updateDoc(doc(db, 'work_assignments', openAssignment.id), { status: 'in_progress' });
      }
    }
    return () => {
      if (openAssignment && sessionStartRef.current) {
        const durationSeconds = Math.round((Date.now() - sessionStartRef.current.getTime()) / 1000);
        if (durationSeconds > 5) {
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

  const handleBusinessNameExtracted = async (name: string) => {
    if (!openAssignment || openAssignment.businessName || openAssignment.clientName) return;
    try {
      await updateDoc(doc(db, 'work_assignments', openAssignment.id), {
        businessName: name,
        displayTitle: name,
      });
    } catch {}
  };

  if (openAssignment) {
    return (
      <AIPlatformApp
        assignment={openAssignment}
        assignmentId={openAssignment.id}
        onBusinessNameExtracted={handleBusinessNameExtracted}
        onClose={() => setOpenAssignment(null)}
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
      {verifyingAssignment && (
        <CodeVerificationModal
          accessCode={verifyingAssignment.accessCode}
          onVerified={() => {
            setOpenAssignment(verifyingAssignment);
            setVerifyingAssignment(null);
          }}
          onClose={() => setVerifyingAssignment(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Film className="w-6 h-6" /> Recent Ads
        </h1>
        <p className="text-sm text-muted-foreground mt-1">All your ad generation assignments</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, category…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-card text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span className="bg-card border rounded-lg px-3 py-1.5">Total <strong className="text-foreground ml-1">{assignments.length}</strong></span>
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = assignments.filter((a) => a.status === status).length;
          if (!count) return null;
          return (
            <span key={status} className={`rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${cfg.color}`}>
              {cfg.icon} {cfg.label} <strong>{count}</strong>
            </span>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Film className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">{search ? 'No matching ads' : 'No ads yet'}</p>
          <p className="text-sm mt-1">{search ? 'Try a different search term' : 'Your ad assignments will appear here'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.assigned;
            return (
              <div
                key={a.id}
                className="bg-card border rounded-xl px-5 py-4 hover:border-primary/40 hover:bg-accent/30 transition-all group cursor-pointer"
                onClick={() => setVerifyingAssignment(a)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-card-foreground truncate">
                        {a.businessName || a.displayTitle || a.uniqueId}
                      </p>
                      <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                        <span className="capitalize">{a.category}</span>
                        <span>{a.clipCount} clips</span>
                        <span>{a.duration}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{getAssignedStamp(a)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">Code:</span>
                      <code className="font-mono text-sm font-bold text-foreground">{a.accessCode}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(a.accessCode);
                          setCopiedCode(a.id);
                          setTimeout(() => setCopiedCode(null), 2000);
                        }}
                        className="p-0.5 rounded hover:bg-muted transition-colors"
                        title="Copy code"
                      >
                        {copiedCode === a.id
                          ? <Check className="w-3.5 h-3.5 text-green-500" />
                          : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    </div>
                    <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Open →
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
