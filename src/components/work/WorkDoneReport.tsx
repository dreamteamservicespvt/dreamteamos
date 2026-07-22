import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { addMonths, format } from 'date-fns';
import { BarChart3, ChevronLeft, ChevronRight, Trophy, Video } from 'lucide-react';
import DashboardDateRangePicker from '@/components/dashboard/DateRangePicker';
import { normalizeDateRange } from '@/utils/dateRange';
import { DONE_STATUSES, completionDate, cycleForDate } from '@/utils/performanceCycle';
import type { AppUser, WorkAssignment } from '@/types';

/**
 * Work-done reporting for the tech team.
 *
 * Defaults to the 10th → 9th performance cycle containing today (see utils/performanceCycle) and
 * lets you page through earlier cycles. A custom date range is also supported for ad-hoc
 * questions ("how many did we ship last week?").
 *
 * A "video done" is a completed or verified assignment, counted on the day it was completed.
 */

interface WorkDoneReportProps {
  assignments: WorkAssignment[];
  members: AppUser[];
  /** Opens a member's assignment list. Omit to render the rows as plain (non-clickable) cards. */
  onSelectMember?: (uid: string) => void;
}

export default function WorkDoneReport({ assignments, members, onSelectMember }: WorkDoneReportProps) {
  const [mode, setMode] = useState<'cycle' | 'range'>('cycle');
  /** How many 10→9 cycles back from the current one we're viewing. */
  const [cycleOffset, setCycleOffset] = useState(0);
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

  const cycle = useMemo(
    () => cycleForDate(addMonths(new Date(), cycleOffset)),
    [cycleOffset]
  );

  const activeRange = useMemo(() => {
    if (mode === 'cycle') return cycle;
    const normalized = normalizeDateRange(customRange);
    return normalized?.from ? { from: normalized.from, to: normalized.to ?? normalized.from } : null;
  }, [mode, cycle, customRange]);

  /** Per-member totals for the active range, busiest first. */
  const rows = useMemo(() => {
    if (!activeRange) return [];

    const counts = new Map<string, { videos: number; clips: number }>();
    for (const a of assignments) {
      if (!DONE_STATUSES.has(a.status)) continue;
      const done = completionDate(a);
      if (!done || done < activeRange.from || done > activeRange.to) continue;

      const entry = counts.get(a.assignedTo) || { videos: 0, clips: 0 };
      entry.videos += 1;
      entry.clips += a.clipCount || 0;
      counts.set(a.assignedTo, entry);
    }

    return members
      .map(m => ({
        uid: m.uid,
        name: m.name,
        videos: counts.get(m.uid)?.videos ?? 0,
        clips: counts.get(m.uid)?.clips ?? 0,
      }))
      .filter(r => r.videos > 0)
      .sort((a, b) => b.videos - a.videos);
  }, [assignments, members, activeRange]);

  const totalVideos = rows.reduce((sum, r) => sum + r.videos, 0);
  const totalClips = rows.reduce((sum, r) => sum + r.clips, 0);
  const topCount = rows[0]?.videos ?? 0;

  const rangeLabel = activeRange
    ? `${format(activeRange.from, 'dd MMM yyyy')} — ${format(activeRange.to, 'dd MMM yyyy')}`
    : 'Pick a date range';

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-3 md:p-4 shadow-sm backdrop-blur-sm space-y-4">
      {/* Header + mode switch */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm md:text-base font-semibold text-foreground">Work Done</h2>
            <p className="text-[11px] text-muted-foreground">Videos completed per member</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['cycle', 'range'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'
                }`}>
                {m === 'cycle' ? 'Monthly (10–9)' : 'Custom Range'}
              </button>
            ))}
          </div>

          {mode === 'cycle' ? (
            <div className="flex items-center gap-1">
              <button onClick={() => setCycleOffset(o => o - 1)} aria-label="Previous cycle"
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-medium text-foreground whitespace-nowrap">{rangeLabel}</span>
              <button onClick={() => setCycleOffset(o => o + 1)} disabled={cycleOffset >= 0} aria-label="Next cycle"
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
              {cycleOffset !== 0 && (
                <button onClick={() => setCycleOffset(0)} className="text-xs text-primary hover:underline px-1">This cycle</button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <DashboardDateRangePicker value={customRange} onSelect={setCustomRange} />
              {customRange?.from && (
                <button onClick={() => setCustomRange(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xl md:text-2xl font-bold text-foreground">{totalVideos}</p>
          <p className="text-[10px] text-muted-foreground">Total Videos</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xl md:text-2xl font-bold text-foreground">{rows.length}</p>
          <p className="text-[10px] text-muted-foreground">Members Contributing</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xl md:text-2xl font-bold text-foreground">{totalClips}</p>
          <p className="text-[10px] text-muted-foreground">Total Clips</p>
        </div>
      </div>

      {/* Per-member breakdown */}
      {!activeRange ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Pick a date range to see the totals.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">No videos completed in this period.</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{rangeLabel}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, index) => {
            const Row = onSelectMember ? 'button' : 'div';
            return (
              <Row key={row.uid}
                {...(onSelectMember ? { onClick: () => onSelectMember(row.uid), type: 'button' as const } : {})}
                className={`w-full flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors ${
                  onSelectMember ? 'hover:border-primary/40 hover:bg-accent/40' : ''
                }`}>
                <span className="w-6 text-xs font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {row.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{row.name}</span>
                    {index === 0 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary"
                      style={{ width: `${topCount > 0 ? (row.videos / topCount) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-foreground tabular-nums">{row.videos}</p>
                  <p className="text-[10px] text-muted-foreground">{row.clips} clips</p>
                </div>
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
