import type { AppUser, DailyCheckin, WorkAssignment } from "@/types";

/**
 * Ordering the "Assign To" list so the obvious choice is at the top.
 *
 * Whoever is checked in today and carrying the least live work is usually who should take the next
 * job — so the list leads with them instead of making the admin type a name to see anyone at all.
 * It is only a suggestion: every member stays in the list and can be picked or searched for.
 */

/** Work that still occupies a member. Delivered/verified jobs no longer count against them. */
const LIVE_STATUSES = new Set(["assigned", "in_progress", "editing"]);

export interface MemberPickerOption {
  member: AppUser;
  /** Live assignments this member is carrying right now. */
  activeCount: number;
  /** Whether they've checked in today (and haven't checked out). */
  checkedIn: boolean;
}

export function buildMemberPickerOptions(
  members: AppUser[],
  assignments: WorkAssignment[],
  checkins: Map<string, DailyCheckin>,
): MemberPickerOption[] {
  const activeByMember = new Map<string, number>();
  for (const a of assignments) {
    if (!LIVE_STATUSES.has(a.status)) continue;
    activeByMember.set(a.assignedTo, (activeByMember.get(a.assignedTo) || 0) + 1);
  }

  return members
    .map((member) => {
      const ci = checkins.get(member.uid);
      // Checked out for the day is no longer "active" — they've finished.
      const checkedIn = !!ci && !ci.checkedOutAt && ci.status !== "rejected";
      return { member, activeCount: activeByMember.get(member.uid) || 0, checkedIn };
    })
    .sort((a, b) =>
      // Active first, then the most vacant, then alphabetical so the order is stable.
      Number(b.checkedIn) - Number(a.checkedIn)
      || a.activeCount - b.activeCount
      || (a.member.name || "").localeCompare(b.member.name || ""),
    );
}

/** Case/phone-insensitive search over the ranked list, preserving the ranking. */
export function filterMemberPickerOptions(
  options: MemberPickerOption[],
  search: string,
  digitsOf: (v: string) => string,
): MemberPickerOption[] {
  const raw = search.trim();
  if (!raw) return options;
  const q = raw.toLowerCase();
  const qDigits = raw.replace(/\D/g, "");
  return options.filter(({ member }) => {
    if (member.name?.toLowerCase().includes(q)) return true;
    if (qDigits && member.phone) {
      const pd = digitsOf(member.phone);
      if (pd.includes(qDigits) || qDigits.includes(pd)) return true;
    }
    return false;
  });
}
