import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DateRange } from 'react-day-picker';
import { addMonths, format, isValid, startOfDay } from 'date-fns';
import { BarChart3, ChevronLeft, ChevronRight, Trophy, Video, X } from 'lucide-react';
import DashboardDateRangePicker from '@/components/dashboard/DateRangePicker';
import { normalizeDateRange } from '@/utils/dateRange';
import { formatCurrency } from '@/utils/formatters';
import { DONE_STATUSES, completionDate, cycleForDate } from '@/utils/performanceCycle';
import { categoryLabel } from '@/utils/serviceCatalog';
import type { AppUser, WorkAssignment } from '@/types';

/**
 * Work-done reporting for the tech team.
 *
 * Defaults to the 10th → 9th performance cycle containing today (see utils/performanceCycle) and
 * lets you page through earlier cycles. A custom date range is also supported for ad-hoc
 * questions ("how many did we ship last week?").
 *
 * A "video done" is a completed or verified assignment, counted on the day it was completed.
 * Members are ranked by revenue delivered, not video count — an expensive cinematic ad is worth
 * more than several cheap promos, and counting videos would rank them backwards.
 *
 * A row is not just a total: it carries the split by ad type, and opens a day-by-day record of
 * exactly which ads that member finished on which day. "21 videos" is where the question starts,
 * not where it ends.
 */

/** The three ad types, in the order they're shown wherever the split appears. */
const AD_CATEGORIES = ['cinematic', 'promotional', 'wishes'] as const;
type AdCategory = typeof AD_CATEGORIES[number];

/** One colour per ad type, used identically on the row chips and in the drill-down. */
const CATEGORY_STYLES: Record<AdCategory, string> = {
  cinematic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  promotional: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  wishes: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
};

const emptyBreakdown = (): Record<string, number> => ({ cinematic: 0, promotional: 0, wishes: 0 });

interface WorkDoneReportProps {
  assignments: WorkAssignment[];
  members: AppUser[];
  /**
   * Whether to surface money. Team leaders manage output, not pay, so they see volume only —
   * revenue and salary are the tech admin's business.
   */
  showRevenue?: boolean;
}

export default function WorkDoneReport({
  assignments, members, showRevenue = true,
}: WorkDoneReportProps) {
  const [mode, setMode] = useState<'career' | 'cycle' | 'day' | 'range'>('cycle');
  /** How many 10→9 cycles back from the current one we're viewing. */
  const [cycleOffset, setCycleOffset] = useState(0);
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  /** `yyyy-MM-dd` for single-day mode — defaults to today. */
  const [day, setDay] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  const cycle = useMemo(
    () => cycleForDate(addMonths(new Date(), cycleOffset)),
    [cycleOffset]
  );

  const activeRange = useMemo(() => {
    if (mode === 'cycle') return cycle;
    // Career = every day on record; bounds wide enough to contain the whole history.
    if (mode === 'career') return { from: new Date(2000, 0, 1), to: new Date(2999, 11, 31) };
    if (mode === 'day') {
      const d = startOfDay(new Date(`${day}T00:00:00`));
      return isValid(d) ? { from: d, to: d } : null;
    }
    const normalized = normalizeDateRange(customRange);
    return normalized?.from ? { from: normalized.from, to: normalized.to ?? normalized.from } : null;
  }, [mode, cycle, customRange, day]);

  /**
   * Per-member totals for the active range.
   *
   * Ranked by the **revenue** each person delivered rather than the raw video count: a member
   * who shipped three ₹1,999 cinematic ads contributed more than one who shipped five ₹499
   * promos, and ranking by count would say the opposite.
   */
  /** Everything delivered inside the active range, keyed by member — the basis for both views. */
  const doneByMember = useMemo(() => {
    const byMember = new Map<string, WorkAssignment[]>();
    if (!activeRange) return byMember;

    for (const a of assignments) {
      if (!DONE_STATUSES.has(a.status)) continue;
      const done = completionDate(a);
      if (!done || done < activeRange.from || done > activeRange.to) continue;
      const list = byMember.get(a.assignedTo);
      if (list) list.push(a);
      else byMember.set(a.assignedTo, [a]);
    }
    return byMember;
  }, [assignments, activeRange]);

  const rows = useMemo(() => {
    if (!activeRange) return [];

    return members
      .map(m => {
        // One completed assignment = one video. Clips are an internal production detail (a 40s ad
        // is five clips), so counting them would inflate output and make members incomparable.
        const done = doneByMember.get(m.uid) || [];
        const byCategory = emptyBreakdown();
        let revenue = 0;
        for (const a of done) {
          revenue += a.totalPrice || 0;
          if (a.category in byCategory) byCategory[a.category] += 1;
        }
        const salary = m.salary || 0;
        return {
          uid: m.uid,
          name: m.name,
          videos: done.length,
          byCategory,
          revenue,
          salary,
          /**
           * Revenue delivered per rupee of salary — the honest read on whether someone is
           * paying for themselves. Undefined when we don't know their salary, so the UI can
           * say "—" rather than print a misleading 0%.
           */
          ratio: salary > 0 ? (revenue / salary) * 100 : null,
        };
      })
      .filter(r => r.videos > 0)
      // Ranked by whatever the viewer can actually see: revenue for an admin, volume for a lead.
      .sort((a, b) => (showRevenue ? b.revenue - a.revenue : b.videos - a.videos));
  }, [members, activeRange, doneByMember, showRevenue]);

  /** The member whose day-by-day record is open, if any. */
  const [detailUid, setDetailUid] = useState<string | null>(null);
  const detailMember = detailUid ? members.find(m => m.uid === detailUid) : undefined;

  /**
   * The open member's work, grouped by the day it was finished, newest day first. This is the
   * answer to "what did they actually do?" — a total is only ever the start of that question.
   */
  const detailDays = useMemo(() => {
    if (!detailUid) return [];
    const byDay = new Map<string, WorkAssignment[]>();
    for (const a of doneByMember.get(detailUid) || []) {
      const day = format(completionDate(a)!, 'yyyy-MM-dd');
      const list = byDay.get(day);
      if (list) list.push(a);
      else byDay.set(day, [a]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, items]) => {
        const byCategory = emptyBreakdown();
        let revenue = 0;
        for (const a of items) {
          revenue += a.totalPrice || 0;
          if (a.category in byCategory) byCategory[a.category] += 1;
        }
        return { day, items, byCategory, revenue };
      });
  }, [detailUid, doneByMember]);

  const totalVideos = rows.reduce((sum, r) => sum + r.videos, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalSalary = rows.reduce((sum, r) => sum + r.salary, 0);
  const topRevenue = Math.max(0, ...rows.map(r => r.revenue), 0);
  const topVideos = Math.max(0, ...rows.map(r => r.videos), 0);

  const rangeLabel = mode === 'career'
    ? 'All time'
    : activeRange
      ? mode === 'day'
        ? format(activeRange.from, 'dd MMM yyyy')
        : `${format(activeRange.from, 'dd MMM yyyy')} — ${format(activeRange.to, 'dd MMM yyyy')}`
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
            {([
              { key: 'career' as const, label: 'Career' },
              { key: 'cycle' as const, label: 'Monthly (10–9)' },
              { key: 'day' as const, label: 'Day' },
              { key: 'range' as const, label: 'Custom Range' },
            ]).map(({ key, label }) => (
              <button key={key} onClick={() => setMode(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === key ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'career' ? (
            <span className="text-xs font-medium text-muted-foreground">All time</span>
          ) : mode === 'day' ? (
            <input
              type="date"
              value={day}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setDay(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20"
            />
          ) : mode === 'cycle' ? (
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
      {showRevenue ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <p className="text-xl md:text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
            <p className="text-[10px] text-muted-foreground">Revenue Delivered</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <p className="text-xl md:text-2xl font-bold text-foreground">{formatCurrency(totalSalary)}</p>
            <p className="text-[10px] text-muted-foreground">Salary Cost</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            {/* The headline efficiency number: revenue produced per rupee of salary. */}
            <p className={`text-xl md:text-2xl font-bold ${
              totalSalary > 0 && totalRevenue / totalSalary >= 2 ? "text-success"
                : totalSalary > 0 && totalRevenue / totalSalary >= 1 ? "text-warning"
                : "text-destructive"
            }`}>
              {totalSalary > 0 ? `${Math.round((totalRevenue / totalSalary) * 100)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Revenue vs Salary</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <p className="text-xl md:text-2xl font-bold text-foreground">{totalVideos}</p>
            <p className="text-[10px] text-muted-foreground">Videos · {rows.length} members</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <p className="text-xl md:text-2xl font-bold text-foreground">{totalVideos}</p>
            <p className="text-[10px] text-muted-foreground">Videos Done</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <p className="text-xl md:text-2xl font-bold text-foreground">{rows.length}</p>
            <p className="text-[10px] text-muted-foreground">Members Contributing</p>
          </div>
        </div>
      )}

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
          {rows.map((row, index) => (
            <button key={row.uid} type="button" onClick={() => setDetailUid(row.uid)}
              title={`See exactly what ${row.name} finished, day by day`}
              className="w-full flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40">
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
                    style={{
                      width: `${
                        showRevenue
                          ? (topRevenue > 0 ? (row.revenue / topRevenue) * 100 : 0)
                          : (topVideos > 0 ? (row.videos / topVideos) * 100 : 0)
                      }%`,
                    }} />
                </div>
                {/* The split by ad type — a member who shipped 20 wishes and one who shipped 20
                    cinematics did very different amounts of work. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {AD_CATEGORIES.filter(c => row.byCategory[c] > 0).map(c => (
                    <span key={c} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[c]}`}>
                      {row.byCategory[c]} {categoryLabel(c)}
                    </span>
                  ))}
                  {showRevenue && row.salary > 0 && (
                    <span className="text-[10px] text-muted-foreground">· salary {formatCurrency(row.salary)}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {showRevenue ? (
                  <>
                    <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(row.revenue)}</p>
                    {row.ratio === null ? (
                      <p className="text-[10px] text-muted-foreground">salary not set</p>
                    ) : (
                      <p className={`text-[10px] font-semibold ${
                        row.ratio >= 200 ? "text-success" : row.ratio >= 100 ? "text-warning" : "text-destructive"
                      }`}>
                        {Math.round(row.ratio)}% of salary
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-foreground tabular-nums">{row.videos}</p>
                    <p className="text-[10px] text-muted-foreground">videos</p>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Member drill-down — every ad they finished, grouped by the day they finished it.
          Rendered through a portal to document.body: this card carries `backdrop-blur`, which
          makes it a containing block for `position: fixed`, so an inline modal would be trapped
          inside the card instead of covering the viewport. The portal escapes that. */}
      {detailMember && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailUid(null)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">{detailMember.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rows.find(r => r.uid === detailUid)?.videos ?? 0} videos over {detailDays.length} day{detailDays.length === 1 ? '' : 's'} · {rangeLabel}
                </p>
              </div>
              <button onClick={() => setDetailUid(null)} aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {detailDays.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing finished in this period.</p>
              ) : (
                <div className="space-y-3">
                  {detailDays.map(({ day, items, byCategory, revenue }) => (
                    <div key={day} className="rounded-xl border border-border bg-background">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-3 py-2">
                        <span className="text-sm font-semibold text-foreground">
                          {format(new Date(`${day}T00:00:00`), 'EEE, dd MMM yyyy')}
                        </span>
                        <span className="text-xs font-medium text-primary">
                          {items.length} ad{items.length === 1 ? '' : 's'}
                        </span>
                        {AD_CATEGORIES.filter(c => byCategory[c] > 0).map(c => (
                          <span key={c} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[c]}`}>
                            {byCategory[c]} {categoryLabel(c)}
                          </span>
                        ))}
                        {showRevenue && (
                          <span className="ml-auto text-xs font-bold tabular-nums text-foreground">{formatCurrency(revenue)}</span>
                        )}
                      </div>
                      <div className="divide-y divide-border/60">
                        {items.map(a => (
                          <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[a.category as AdCategory] || 'bg-muted text-muted-foreground'}`}>
                              {categoryLabel(a.category)}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground"
                              title={a.businessName || a.clientName || a.displayTitle}>
                              {a.businessName || a.clientName || a.displayTitle}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{a.duration} · {a.clipCount} clips</span>
                            <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">{a.uniqueId}</span>
                            {showRevenue && (
                              <span className="w-16 shrink-0 text-right font-medium tabular-nums text-primary">{formatCurrency(a.totalPrice || 0)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
