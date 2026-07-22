import { useMemo, useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import type { AppUser, DailyCheckin, WorkAssignment } from '@/types';

/**
 * One member's live workload, as a card in the Team Workload wall.
 *
 * Shows as many of the member's businesses as will reasonably fit — most recently assigned
 * first — because "who is this person working for right now" is the question this wall exists to
 * answer. The caps below are safety valves for an outlier member, not a display budget: with real
 * workloads every business and ad ID is visible without interaction.
 */

/** Beyond this many chips the card would dominate the wall, so the rest collapse into a "+N". */
const MAX_BUSINESS_CHIPS = 10;
const MAX_AD_CHIPS = 12;

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const assignedSeconds = (a: WorkAssignment) => a.assignedAt?.seconds || 0;

/** Attendance dot: colour + tooltip for today's check-in state. */
function checkinDot(checkin?: DailyCheckin) {
  if (!checkin) return { className: 'bg-muted-foreground/40', label: 'Not checked in' };
  if (checkin.status === 'pending_approval') return { className: 'bg-yellow-500 animate-pulse', label: 'Pending approval' };
  if (checkin.status === 'approved') return { className: 'bg-green-500', label: 'Approved' };
  if (checkin.status === 'rejected') return { className: 'bg-red-500', label: 'Rejected' };
  if (checkin.checkedOutAt) return { className: 'bg-blue-500', label: 'Checked out' };
  return { className: 'bg-green-500 animate-pulse', label: 'Checked in' };
}

interface MemberWorkloadCardProps {
  member: AppUser;
  /** This member's live assignments (any order — the card sorts them newest-first). */
  assignments: WorkAssignment[];
  checkin?: DailyCheckin;
  /** Tech admins see the workload's value; team leaders do not. */
  showPricing?: boolean;
  onOpen: () => void;
}

export default function MemberWorkloadCard({
  member, assignments, checkin, showPricing = false, onOpen,
}: MemberWorkloadCardProps) {
  const [copiedBusiness, setCopiedBusiness] = useState<string | null>(null);

  /** Newest work first, so the businesses a member is on *right now* lead the card. */
  const recentFirst = useMemo(
    () => [...assignments].sort((a, b) => assignedSeconds(b) - assignedSeconds(a)),
    [assignments]
  );

  /**
   * One chip per business, newest first. A business can span several ads, so we keep the first
   * (most recent) sighting and take a WhatsApp number from whichever of its ads actually has one.
   */
  const businesses = useMemo(() => {
    const byName = new Map<string, string | null>();
    for (const a of recentFirst) {
      const name = a.businessName || a.clientName;
      if (!name) continue;
      const existing = byName.get(name);
      if (existing === undefined || (!existing && a.businessWhatsapp)) {
        byName.set(name, a.businessWhatsapp || null);
      }
    }
    return [...byName.entries()];
  }, [recentFirst]);

  const visibleBusinesses = businesses.slice(0, MAX_BUSINESS_CHIPS);
  const hiddenBusinesses = businesses.length - visibleBusinesses.length;
  const visibleAds = recentFirst.slice(0, MAX_AD_CHIPS);
  const hiddenAds = recentFirst.length - visibleAds.length;

  const totalPrice = recentFirst.reduce((sum, a) => sum + (a.totalPrice || 0), 0);
  const dot = checkinDot(checkin);

  const copyPhone = (name: string, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedBusiness(name);
    setTimeout(() => setCopiedBusiness(null), 2000);
  };

  return (
    // A plain container, not a <button>: the chips inside are themselves buttons, and a button
    // may not contain a button. The header row below is the real, keyboard-reachable control.
    <div className="group flex flex-col rounded-xl border border-border bg-background transition-all hover:border-primary/40 hover:shadow-md focus-within:border-primary/60">
      {/* Header — the card's primary action */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${member.name}'s assignments`}
        className="flex w-full items-center gap-2.5 rounded-t-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-role-tech-member/15 font-display text-sm font-bold text-role-tech-member">
          {member.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {member.name}
            </span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot.className}`} title={dot.label} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {recentFirst.length} video{recentFirst.length !== 1 ? 's' : ''}
            </span>
            {showPricing && (
              <span className="font-mono text-[11px] font-medium text-primary">{formatCurrency(totalPrice)}</span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>

      {/* Businesses — newest first. Tap a chip to copy that business's WhatsApp number. */}
      {visibleBusinesses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2.5">
          {visibleBusinesses.map(([name, phone]) => {
            const copied = copiedBusiness === name;
            return (
              <button
                key={name}
                type="button"
                disabled={!phone}
                onClick={() => phone && copyPhone(name, phone)}
                title={phone ? `Copy WhatsApp: ${phone}` : `${name} — no WhatsApp number saved`}
                className={`inline-flex min-h-[26px] max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors sm:min-h-0 sm:py-0.5 ${
                  copied
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : phone
                      ? 'cursor-pointer bg-primary/10 text-primary hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400'
                      : 'cursor-default bg-muted text-muted-foreground'
                }`}
              >
                {copied
                  ? <Check className="h-2.5 w-2.5 shrink-0" />
                  : phone ? <Copy className="h-2.5 w-2.5 shrink-0 opacity-50" /> : null}
                <span className="truncate">{name}</span>
              </button>
            );
          })}
          {hiddenBusinesses > 0 && (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex min-h-[26px] items-center rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:min-h-0 sm:py-0.5"
            >
              +{hiddenBusinesses} more
            </button>
          )}
        </div>
      )}

      {/* Ad IDs, colour-coded by status */}
      {visibleAds.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-border/60 px-3 py-2">
          {visibleAds.map(a => (
            <span
              key={a.id}
              title={`${a.uniqueId} — ${a.status.replace('_', ' ')}`}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[a.status] || ''}`}
            >
              {a.uniqueId}
            </span>
          ))}
          {hiddenAds > 0 && (
            <span className="px-1 py-0.5 text-[10px] text-muted-foreground">+{hiddenAds}</span>
          )}
        </div>
      )}
    </div>
  );
}
