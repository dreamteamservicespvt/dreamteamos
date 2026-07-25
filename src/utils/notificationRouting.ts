/**
 * Which notifications are allowed to take over someone's screen.
 *
 * The bar is deliberately high: a centered popup interrupts whatever the person was doing, so it is
 * reserved for something they must ACT on, about their OWN work. Anything merely informative goes
 * to the bell and waits to be read.
 *
 * This exists as its own module because getting it wrong is invisible from the sending side. A
 * team leader was being shown the full "New Work Assigned" popup every time the admin assigned
 * anything to anyone — the FYI had simply been sent with the same `work_assigned` type the member's
 * own notification uses, and inherited the popup along with it. Naming the two sets here makes that
 * mistake checkable instead of a matter of remembering.
 */

/** Types that open a centered popup. Each is about the recipient's own work. */
export const POPUP_NOTIFICATION_TYPES = [
  "work_assigned",
  "work_editing",
  "attendance_update",
] as const;

/**
 * Types sent to a team leader ABOUT SOMEONE ELSE. Informative, never interruptive — a leader who is
 * popped up at for every movement on their team stops reading any of them.
 */
export const TEAM_FYI_NOTIFICATION_TYPES = [
  "team_work_assigned",
  "work_completed",
] as const;

export function isPopupNotification(type: string): boolean {
  return (POPUP_NOTIFICATION_TYPES as readonly string[]).includes(type);
}
