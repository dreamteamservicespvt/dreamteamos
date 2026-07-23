import type { AppUser, WorkAssignment } from '@/types';

/**
 * The Team Workload wall, built once and shared by the tech admin's and the team leader's Work
 * Assign pages so the two can never drift apart.
 *
 * Two rules this file exists to hold:
 *
 *  1. **Every member appears, always.** A member is never dropped for having no live work — that
 *     is precisely who the admin is looking for when deciding who takes the next assignment. The
 *     wall is a roster, not a queue.
 *  2. **A member's card lists recent work whatever its status.** Assigned, in progress, delivered
 *     or verified — it all shows. Hiding verified work made a busy member's card empty out the
 *     moment their ads were approved, which read as "this person did nothing".
 *
 * The live/verified distinction is still carried, as counts, so the card can lead with what still
 * needs doing without pretending finished work never happened.
 */

/** How many of a member's most recent assignments a card lists before collapsing into a "+N". */
export const RECENT_WORKLOAD_LIMIT = 12;

/**
 * When an assignment was handed out, in epoch ms.
 *
 * Reads whichever stamp the document actually carries: a Firestore Timestamp, the ISO mirror
 * written alongside it, or the plain `date`. A doc written moments ago still has a null
 * `assignedAt` (the server hasn't resolved `serverTimestamp()` yet) but always has `assignedAtIso`
 * — without the fallback the newest assignment on the page sorts to the very bottom.
 */
export function assignedAtMs(a: WorkAssignment): number {
  const ts = a.assignedAt as { toDate?: () => Date; seconds?: number } | undefined;
  if (typeof ts?.toDate === 'function') {
    const ms = ts.toDate().getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;

  const iso = a.assignedAtIso ? Date.parse(a.assignedAtIso) : NaN;
  if (Number.isFinite(iso)) return iso;

  const day = a.date ? Date.parse(`${a.date}T00:00:00`) : NaN;
  return Number.isFinite(day) ? day : 0;
}

/** Work that has left the queue. Everything else is still someone's job to finish. */
export const isVerified = (a: WorkAssignment) => a.status === 'verified';

export interface MemberWorkload {
  member: AppUser;
  /** The member's most recent work, newest first, whatever its status. */
  assignments: WorkAssignment[];
  /** How many of the member's assignments are still live (not yet verified). */
  activeCount: number;
  /** Rupee value of that live work — what this member is currently holding. */
  activeValue: number;
  /** Everything on record for the member, so a card can say how much sits behind the cap. */
  totalCount: number;
}

/**
 * Group assignments onto the roster.
 *
 * Ordering puts whoever has live work first (that is the page's job), then most recently
 * assigned, then alphabetical — so members with nothing on record still land somewhere stable
 * and findable rather than shuffling on every render.
 */
export function buildMemberWorkload(
  members: AppUser[],
  assignments: WorkAssignment[],
  limit: number = RECENT_WORKLOAD_LIMIT,
): MemberWorkload[] {
  const byMember = new Map<string, WorkAssignment[]>();
  for (const a of assignments) {
    const list = byMember.get(a.assignedTo);
    if (list) list.push(a);
    else byMember.set(a.assignedTo, [a]);
  }

  return members
    .map(member => {
      const all = [...(byMember.get(member.uid) ?? [])].sort((x, y) => assignedAtMs(y) - assignedAtMs(x));
      const live = all.filter(a => !isVerified(a));
      return {
        member,
        assignments: all.slice(0, limit),
        activeCount: live.length,
        activeValue: live.reduce((sum, a) => sum + (a.totalPrice || 0), 0),
        totalCount: all.length,
      };
    })
    .sort((a, b) => {
      const aLive = a.activeCount > 0;
      const bLive = b.activeCount > 0;
      if (aLive !== bLive) return aLive ? -1 : 1;

      const recency = (w: MemberWorkload) => (w.assignments[0] ? assignedAtMs(w.assignments[0]) : 0);
      const byRecency = recency(b) - recency(a);
      if (byRecency !== 0) return byRecency;

      return (a.member.name || '').localeCompare(b.member.name || '');
    });
}

/**
 * The wall's one search box: matches a member by name or phone, or any of their work by business
 * name, title, ad ID, or the business's WhatsApp number.
 */
export function filterMemberWorkload(
  workload: MemberWorkload[],
  search: string,
  normalizeDigits: (value: string) => string,
): MemberWorkload[] {
  const rawQ = search.trim();
  if (!rawQ) return workload;

  const q = rawQ.toLowerCase();
  const queryDigits = rawQ.replace(/\D/g, '');
  const digitsMatch = (value?: string | null) => {
    if (!queryDigits || !value) return false;
    const d = normalizeDigits(value);
    return d.includes(queryDigits) || queryDigits.includes(d);
  };

  return workload.filter(({ member, assignments }) => {
    if (member.name?.toLowerCase().includes(q) || digitsMatch(member.phone)) return true;
    return assignments.some(a =>
      (a.businessName || a.clientName || '').toLowerCase().includes(q) ||
      (a.displayTitle || '').toLowerCase().includes(q) ||
      (a.uniqueId || '').toLowerCase().includes(q) ||
      digitsMatch(a.businessWhatsapp)
    );
  });
}
