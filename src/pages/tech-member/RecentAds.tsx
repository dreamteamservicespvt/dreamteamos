import React, { useState, useMemo, useRef } from 'react';

/** Recent ads load a page at a time; searching always looks at the full history. */
const ADS_PAGE_SIZE = 10;
import {
  Film, Clock, Loader2, CheckCircle2, Sparkles, Play, Edit3, Search, Copy, Check, ChevronRight,
} from 'lucide-react';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreQuery } from '@/hooks/useFirestore';
import { formatDate, formatTime } from '@/utils/formatters';
import type { WorkAssignment } from '@/types';
import CodeVerificationModal from '@/components/ai-platform/CodeVerificationModal';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';

const STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  label: string;
  badge: string;
  accent: string;
}> = {
  assigned:    { icon: <Play className="w-3 h-3" />,         label: 'Assigned',       badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       accent: 'bg-blue-500' },
  in_progress: { icon: <Sparkles className="w-3 h-3" />,     label: 'In Progress',    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',    accent: 'bg-amber-500' },
  completed:   { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Completed',      badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',    accent: 'bg-green-500' },
  verified:    { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Verified',       badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', accent: 'bg-emerald-500' },
  editing:     { icon: <Edit3 className="w-3 h-3" />,        label: 'Edits Required', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', accent: 'bg-orange-500' },
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
  const [shown, setShown] = useState(ADS_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [verifyingAssignment, setVerifyingAssignment] = useState<WorkAssignment | null>(null);
  const [openAssignment, setOpenAssignment] = useState<WorkAssignment | null>(null);
  const sessionStartRef = useRef<Date | null>(null);

  const sorted = useMemo(
    () => [...assignments].sort((a, b) => getAssignedSeconds(b) - getAssignedSeconds(a)),
    [assignments],
  );

  const filtered = useMemo(() => {
    let result = statusFilter === 'all' ? sorted : sorted.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (a) =>
          (a.businessName || a.displayTitle || '').toLowerCase().includes(s) ||
          (a.category || '').toLowerCase().includes(s) ||
          (a.uniqueId || '').toLowerCase().includes(s),
      );
    }
    return result;
  }, [sorted, search, statusFilter]);

  /**
   * Only the newest few are shown up front; the rest load on demand.
   *
   * Searching bypasses the page limit entirely — a search that only looked at the first ten rows
   * would silently fail to find older ads, which is worse than no search at all.
   */
  const isSearching = search.trim().length > 0;
  const visible = useMemo(
    () => (isSearching ? filtered : filtered.slice(0, shown)),
    [filtered, shown, isSearching],
  );

  // A new status filter starts a fresh page rather than carrying the previous expansion over.
  React.useEffect(() => {
    setShown(ADS_PAGE_SIZE);
  }, [statusFilter]);

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
          updateDoc(doc(db, 'work_assignments', openAssignment.id), {
            sessions: [...(openAssignment.sessions || []), newSession],
            totalDurationSeconds: (openAssignment.totalDurationSeconds || 0) + durationSeconds,
          });
        }
        sessionStartRef.current = null;
      }
    };
  }, [openAssignment?.id]);

  const handleBusinessNameExtracted = async (name: string) => {
    if (!openAssignment || openAssignment.businessName || openAssignment.clientName) return;
    try {
      await updateDoc(doc(db, 'work_assignments', openAssignment.id), { businessName: name, displayTitle: name });
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

  const statusCounts = Object.keys(STATUS_CONFIG).reduce<Record<string, number>>((acc, s) => {
    acc[s] = assignments.filter((a) => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {verifyingAssignment && (
        <CodeVerificationModal
          accessCode={verifyingAssignment.accessCode}
          onVerified={() => { setOpenAssignment(verifyingAssignment); setVerifyingAssignment(null); }}
          onClose={() => setVerifyingAssignment(null)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Film className="w-5 h-5 text-primary" />
          </div>
          Recent Ads
        </h1>
        <p className="text-sm text-muted-foreground mt-1 ml-11">All your ad generation assignments</p>
      </div>

      {/* Filter pills — Total + each status */}
      <div className="flex flex-wrap gap-2">
        {/* Total / All */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
            statusFilter === 'all'
              ? 'bg-foreground text-background border-foreground shadow-sm'
              : 'bg-card text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
          }`}
        >
          All <span className="font-bold">{assignments.length}</span>
        </button>

        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = statusCounts[status];
          if (!count) return null;
          const active = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(active ? 'all' : status)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                active
                  ? `${cfg.badge} border-current ring-2 ring-current/30 shadow-sm`
                  : `${cfg.badge} border-transparent opacity-60 hover:opacity-100 hover:border-current`
              }`}
            >
              {cfg.icon} {cfg.label} <span className="font-bold">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business name, category…"
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border bg-card text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Film className="w-8 h-8 opacity-30" />
          </div>
          <p className="text-base font-semibold">
            {search ? 'No matching ads' : statusFilter !== 'all' ? `No ${STATUS_CONFIG[statusFilter]?.label} ads` : 'No ads yet'}
          </p>
          <p className="text-sm mt-1 opacity-70">
            {search ? 'Try a different search term' : statusFilter !== 'all' ? 'Try a different filter' : 'Your ad assignments will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => {
            const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.assigned;
            const name = a.businessName || a.displayTitle || a.uniqueId;

            return (
              <div
                key={a.id}
                className="bg-card border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="flex items-stretch">
                  {/* Status accent stripe */}
                  <div className={`w-1 shrink-0 ${cfg.accent}`} />

                  {/* Content */}
                  <div className="flex-1 flex items-center justify-between gap-4 px-5 py-4 min-w-0">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <h3 className="font-bold text-sm text-foreground truncate">{name}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="capitalize">{a.category}</span>
                        <span className="opacity-40">·</span>
                        <span>{a.clipCount} clips</span>
                        <span className="opacity-40">·</span>
                        <span>{a.duration}</span>
                        <span className="opacity-40">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getAssignedStamp(a)}
                        </span>
                      </div>
                    </div>

                    {/* Right: code + open */}
                    <div className="shrink-0 flex items-center gap-2">
                      {/* Code badge */}
                      <div className="flex items-center gap-1.5 bg-muted/80 rounded-lg px-3 py-2">
                        <span className="text-[11px] text-muted-foreground font-medium">Code</span>
                        <code className="font-mono text-sm font-bold text-foreground tracking-wider">{a.accessCode}</code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(a.accessCode);
                            setCopiedCode(a.id);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy code"
                        >
                          {copiedCode === a.id
                            ? <Check className="w-3.5 h-3.5 text-green-500" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Open button — standalone, always visible */}
                      <button
                        onClick={() => setVerifyingAssignment(a)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm shadow-primary/20"
                      >
                        Open <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {!isSearching && filtered.length > visible.length && (
            <button
              onClick={() => setShown(n => n + ADS_PAGE_SIZE)}
              className="w-full rounded-2xl border border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
            >
              Load {Math.min(ADS_PAGE_SIZE, filtered.length - visible.length)} more
              <span className="ml-1 text-muted-foreground/60">
                ({visible.length} of {filtered.length} shown)
              </span>
            </button>
          )}

          {isSearching && (
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              Showing all {filtered.length} match{filtered.length === 1 ? "" : "es"} across your full history
            </p>
          )}
        </div>
      )}
    </div>
  );
}
