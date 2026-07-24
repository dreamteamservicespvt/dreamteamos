import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, subDays } from 'date-fns';
import { Activity, ClipboardList, Clock, CheckCircle2, ShieldCheck, Inbox, X } from 'lucide-react';
import PeriodFilterBar from '@/components/dashboard/PeriodFilterBar';
import { defaultPeriodFilter, periodLabel, withinPeriod, type PeriodFilter } from '@/utils/periodFilter';
import { workCountsOn } from '@/utils/workDates';
import { categoryLabel } from '@/utils/serviceCatalog';
import { formatCurrency } from '@/utils/formatters';
import type { AppUser, Order, WorkAssignment } from '@/types';

/**
 * "What came in, and where is it?" for any day, month or span.
 *
 * The Work Assign page answers "who is free"; this answers the other daily question — how many
 * ads landed in a period and how far each has got. Work is bucketed on the day it was ASSIGNED
 * (see utils/workDates.workCountsOn), matching every other report; orders still waiting are
 * counted on the day the sale came in, because that is the day they arrived to be done.
 *
 * Every tile opens the list behind it, so a number is never a dead end — you can always see
 * exactly which ads and which members it is made of.
 */

type BucketKey = 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'verified';

const BUCKETS: { key: BucketKey; label: string; hint: string; icon: any; tone: string }[] = [
  { key: 'unassigned', label: 'Not assigned', hint: 'Waiting in Orders — nobody is on them yet', icon: Inbox, tone: 'text-amber-500 border-amber-500/30 bg-amber-500/10' },
  { key: 'assigned', label: 'Assigned', hint: 'Handed out, not started', icon: ClipboardList, tone: 'text-blue-500 border-blue-500/30 bg-blue-500/10' },
  { key: 'in_progress', label: 'In progress', hint: 'Being worked on right now', icon: Clock, tone: 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10' },
  { key: 'completed', label: 'Completed', hint: 'Delivered, awaiting your approval', icon: CheckCircle2, tone: 'text-green-500 border-green-500/30 bg-green-500/10' },
  { key: 'verified', label: 'Verified', hint: 'Approved and closed', icon: ShieldCheck, tone: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' },
];

/** One row in the drill-down: an assignment, or an order that has no assignment yet. */
interface BucketItem {
  id: string;
  business: string;
  category: string;
  memberName: string | null;
  uniqueId?: string;
  price?: number;
  when?: string;
}

interface AdsStatusBoardProps {
  assignments: WorkAssignment[];
  /** Live orders — supplies the "not assigned" count. */
  orders: Order[];
  members: AppUser[];
  /** Team leaders don't see money. */
  showPricing?: boolean;
}

export default function AdsStatusBoard({ assignments, orders, members, showPricing = true }: AdsStatusBoardProps) {
  // Defaults to today — the question this board exists to answer is "what about today?".
  const [period, setPeriod] = useState<PeriodFilter>(() => ({ ...defaultPeriodFilter(), mode: 'day' }));
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);

  const nameOf = useMemo(() => {
    const byUid = new Map(members.map(m => [m.uid, m.name]));
    return (uid?: string | null) => (uid ? byUid.get(uid) || 'Unknown' : null);
  }, [members]);

  /** Quick jumps — the spans a lead actually asks for, built on the same period filter. */
  const quick: { label: string; apply: () => PeriodFilter }[] = [
    { label: 'Today', apply: () => ({ ...period, mode: 'day', day: format(new Date(), 'yyyy-MM-dd') }) },
    { label: 'Yesterday', apply: () => ({ ...period, mode: 'day', day: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
    {
      label: 'Last 5 days',
      apply: () => ({ ...period, mode: 'range', range: { from: subDays(new Date(), 4), to: new Date() } }),
    },
  ];

  const buckets = useMemo(() => {
    const empty: Record<BucketKey, BucketItem[]> = {
      unassigned: [], assigned: [], in_progress: [], completed: [], verified: [],
    };

    for (const a of assignments) {
      if (!withinPeriod(workCountsOn(a), period)) continue;
      const key = (a.status === 'editing' ? 'in_progress' : a.status) as BucketKey;
      if (!(key in empty)) continue;
      empty[key].push({
        id: a.id,
        business: a.businessName || a.clientName || a.displayTitle,
        category: a.category,
        memberName: nameOf(a.assignedTo),
        uniqueId: a.uniqueId,
        price: a.totalPrice,
        when: workCountsOn(a),
      });
    }

    // Orders still waiting — counted on the day the sale arrived.
    for (const o of orders) {
      if (o.status !== 'unassigned' || o.deleted) continue;
      const day = o.createdAt?.seconds ? format(new Date(o.createdAt.seconds * 1000), 'yyyy-MM-dd') : undefined;
      if (!withinPeriod(day, period)) continue;
      empty.unassigned.push({
        id: o.id,
        business: o.businessName || 'Unnamed client',
        category: o.category,
        memberName: null,
        price: o.amount,
        when: day,
      });
    }

    return empty;
  }, [assignments, orders, period, nameOf]);

  const counts = useMemo(
    () => Object.fromEntries(BUCKETS.map(b => [b.key, buckets[b.key].length])) as Record<BucketKey, number>,
    [buckets],
  );
  const total = useMemo(() => Object.values(counts).reduce((s, n) => s + n, 0), [counts]);

  const open = openBucket ? BUCKETS.find(b => b.key === openBucket)! : null;
  const openItems = openBucket ? buckets[openBucket] : [];

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-3 md:p-4 shadow-sm space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm md:text-base font-semibold text-foreground">Ads status</h2>
            <p className="text-[11px] text-muted-foreground">
              {total} ad{total === 1 ? '' : 's'} · {periodLabel(period)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {quick.map(q => (
            <button key={q.label} onClick={() => setPeriod(q.apply())}
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* The same Career / Month / Day / Range control used everywhere else. */}
      <PeriodFilterBar value={period} onChange={setPeriod} />

      {/* Totals — every tile opens the list behind it. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xl md:text-2xl font-bold text-foreground tabular-nums">{total}</p>
          <p className="text-[10px] text-muted-foreground">Total ads</p>
        </div>
        {BUCKETS.map(({ key, label, hint, icon: Icon, tone }) => (
          <button key={key} type="button" title={hint}
            onClick={() => counts[key] > 0 && setOpenBucket(key)}
            disabled={counts[key] === 0}
            className={`rounded-xl border p-3 text-center transition-colors ${tone} ${
              counts[key] > 0 ? 'hover:brightness-125 cursor-pointer' : 'opacity-50 cursor-default'
            }`}>
            <p className="text-xl md:text-2xl font-bold tabular-nums">{counts[key]}</p>
            <p className="flex items-center justify-center gap-1 text-[10px] opacity-90">
              <Icon className="h-3 w-3" /> {label}
            </p>
          </button>
        ))}
      </div>

      {/* Drill-down — who has what. Portalled: this card is inside blurred/scrolling containers. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenBucket(null)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <open.icon className="h-4 w-4" /> {open.label} · {openItems.length}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{open.hint} · {periodLabel(period)}</p>
              </div>
              <button onClick={() => setOpenBucket(null)} aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {openItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {categoryLabel(item.category)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={item.business}>
                      {item.business}
                    </span>
                    {item.uniqueId && <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">{item.uniqueId}</span>}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {item.memberName ?? 'Not assigned'}
                    </span>
                    {showPricing && !!item.price && (
                      <span className="w-16 shrink-0 text-right font-medium tabular-nums text-primary">{formatCurrency(item.price)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
