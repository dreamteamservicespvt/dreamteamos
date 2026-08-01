import { useMemo, useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { assignedAtMs, isVerified } from '@/utils/memberWorkload';
import type { AppUser, DailyCheckin, WorkAssignment } from '@/types';
import MemberAvatar from '@/components/MemberAvatar';

/**
 * One member's workload, as a card in the Team Workload wall.
 *
 * The card answers one question — "who is this person working for right now?" — with the five
 * most recent businesses, each a tap-to-copy WhatsApp number. It deliberately shows nothing else:
 * a longer list, and the ad-ID chips that used to sit underneath, made the wall dense enough that
 * the one thing anybody came here to do (grab a number) got lost in it. The full record is one
 * click away on the member's own page.
 */

/** How many businesses a card shows before the rest collapse into a "+N". */
const MAX_BUSINESS_CHIPS = 5;

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
  /** This member's recent assignments, any status (any order — the card sorts them newest-first). */
  assignments: WorkAssignment[];
  /** How many are still live. Defaults to counting the list, which is right when it isn't capped. */
  activeCount?: number;
  /** Rupee value of the live work. Defaults to the value of the assignments passed in. */
  activeValue?: number;
  /** Everything on record for the member, so the "+N" can account for work beyond the cap. */
  totalCount?: number;
  checkin?: DailyCheckin;
  /** Tech admins see the workload's value; team leaders do not. */
  showPricing?: boolean;
  onOpen: () => void;
}

export default function MemberWorkloadCard({
  member, assignments, activeCount, activeValue, totalCount, checkin, showPricing = false, onOpen,
}: MemberWorkloadCardProps) {
  const [copiedBusiness, setCopiedBusiness] = useState<string | null>(null);

  /** Newest work first, so the businesses a member is on *right now* lead the card. */
  const recentFirst = useMemo(
    () => [...assignments].sort((a, b) => assignedAtMs(b) - assignedAtMs(a)),
    [assignments]
  );

  // The counts are supplied by the caller, which sees the member's whole history; falling back to
  // the passed list keeps the card usable standalone.
  const live = activeCount ?? recentFirst.filter(a => !isVerified(a)).length;
  const liveValue = activeValue
    ?? recentFirst.filter(a => !isVerified(a)).reduce((sum, a) => sum + (a.totalPrice || 0), 0);
  const total = totalCount ?? recentFirst.length;

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

  const dot = checkinDot(checkin);

  const copyPhone = (name: string, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedBusiness(name);
    setTimeout(() => setCopiedBusiness(null), 2000);
  };

  return (
    // A plain container, not a <button>: the chips inside are themselves buttons, and a button
    // may not contain a button. The header row below is the real, keyboard-reachable control.
    // A member with nothing live is dimmed rather than hidden — they stay on the wall precisely
    // so the admin can see at a glance who is free to take the next assignment.
    <div className={`group flex flex-col rounded-xl border bg-background transition-all hover:border-primary/40 hover:shadow-md focus-within:border-primary/60 ${
      live > 0 ? 'border-border' : 'border-dashed border-border/70'
    }`}>
      {/* Header — the card's primary action */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${member.name}'s assignments`}
        className="flex w-full items-center gap-2.5 rounded-t-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <MemberAvatar name={member.name} avatar={member.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {member.name}
            </span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot.className}`} title={dot.label} />
          </div>
          <div className="flex flex-wrap items-center gap-x-2">
            {/* Lead with live work — that's what this page is for — but never at the cost of
                hiding that the member has finished work behind it. */}
            <span className={`text-[11px] ${live > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {live > 0
                ? `${live} active`
                : total > 0 ? 'No active work' : 'No work yet'}
            </span>
            {total > 0 && (
              <span className="text-[11px] text-muted-foreground">
                · {total} video{total !== 1 ? 's' : ''}
              </span>
            )}
            {showPricing && liveValue > 0 && (
              <span className="font-mono text-[11px] font-medium text-primary">{formatCurrency(liveValue)}</span>
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

      {/* The answer to "who can take this next?" — stated, not left as an empty card. */}
      {live === 0 && (
        <div className="border-t border-border/60 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground">Free to take new work</span>
        </div>
      )}
    </div>
  );
}
