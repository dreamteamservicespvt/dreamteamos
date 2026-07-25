import { describe, it, expect } from "vitest";
import {
  POPUP_NOTIFICATION_TYPES, TEAM_FYI_NOTIFICATION_TYPES, isPopupNotification,
} from "@/utils/notificationRouting";

/**
 * A team leader was getting the full centered "New Work Assigned" popup every time the admin
 * assigned anything to anyone. The FYI had been sent with the same `work_assigned` type the
 * member's own notification uses, and inherited the popup along with it.
 *
 * The mistake is invisible from the sending side — you write a notification and only find out how
 * loud it is by receiving one — so the rule is pinned here rather than left to memory.
 */

describe("what is allowed to take over the screen", () => {
  it("pops up only for work the recipient has to act on themselves", () => {
    expect([...POPUP_NOTIFICATION_TYPES]).toEqual(["work_assigned", "work_editing", "attendance_update"]);
  });

  /** The regression itself: no team-wide FYI may ever be a popup type. */
  it("never pops up an FYI about someone else's work", () => {
    for (const type of TEAM_FYI_NOTIFICATION_TYPES) {
      expect(isPopupNotification(type)).toBe(false);
    }
  });

  it("keeps the two sets disjoint", () => {
    const overlap = TEAM_FYI_NOTIFICATION_TYPES.filter(
      (t) => (POPUP_NOTIFICATION_TYPES as readonly string[]).includes(t),
    );
    expect(overlap).toEqual([]);
  });

  it("still pops up the member's own new work", () => {
    expect(isPopupNotification("work_assigned")).toBe(true);
  });

  // The leader's version of the same event, which must stay quiet.
  it("does not pop up the leader's copy of that same assignment", () => {
    expect(isPopupNotification("team_work_assigned")).toBe(false);
  });

  it("ignores a type nobody has taught it about", () => {
    expect(isPopupNotification("something_new")).toBe(false);
    expect(isPopupNotification("")).toBe(false);
  });
});
