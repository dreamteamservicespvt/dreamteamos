import { describe, it, expect } from "vitest";
import {
  answerSlot, dueSlot, holdsSeat, parseStatusCheckMemory, slotToShow, snoozeSlot, statusCheckMonths, SMM_STATUS_CHECK_SNOOZE_MS,
} from "@/utils/smmStatusCheck";
import { monthGlance } from "@/utils/smmGlance";
import type { SmmCampaign } from "@/types/smm";

/** 2026-10-05 (owner): the social-media team updates their posts at 11 AM and 5 PM. */

const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m);
const DAY = "2026-10-05";

describe("when it opens", () => {
  it("opens from 11 AM, and again from 5 PM", () => {
    expect(dueSlot(at(10, 59))).toBeNull();
    expect(dueSlot(at(11))?.key).toBe("am");
    expect(dueSlot(at(16, 59))?.key).toBe("am");
    expect(dueSlot(at(17))?.key).toBe("pm");
    expect(dueSlot(at(23))?.key).toBe("pm");
  });

  it("once per slot: answered stays answered, Later comes back after 30 minutes", () => {
    const fresh = parseStatusCheckMemory(null, DAY);
    expect(slotToShow(at(11, 5), fresh)?.key).toBe("am");

    const later = snoozeSlot(fresh, at(11, 5));
    expect(slotToShow(at(11, 20), later)).toBeNull();
    expect(slotToShow(new Date(at(11, 5).getTime() + SMM_STATUS_CHECK_SNOOZE_MS + 1000), later)?.key).toBe("am");

    const done = answerSlot(fresh, { key: "am", hour: 11, label: "11 AM" });
    expect(slotToShow(at(15), done)).toBeNull();
    expect(slotToShow(at(17, 1), done)?.key).toBe("pm");
  });

  it("opened first after 5 PM, it asks once — answering 5 PM answers 11 AM too", () => {
    const done = answerSlot(parseStatusCheckMemory(null, DAY), { key: "pm", hour: 17, label: "5 PM" });
    expect(done.done.sort()).toEqual(["am", "pm"]);
  });

  it("starts every day fresh, and survives a broken store", () => {
    const yesterday = JSON.stringify({ day: "2026-10-04", done: ["am", "pm"], snoozeUntil: 0 });
    expect(parseStatusCheckMemory(yesterday, DAY).done).toEqual([]);
    expect(parseStatusCheckMemory("{not json", DAY)).toEqual({ day: DAY, done: [], snoozeUntil: 0 });
  });
});

describe("what it asks about", () => {
  const item = (id: string, over: Record<string, unknown> = {}) => ({
    id, kind: "ai_ad", title: id, status: "planned", uploadDate: null, extra: false, ...over,
  });
  const month = (id: string, over: Record<string, unknown> = {}) => ({
    id, businessName: id, status: "active", cycle: { startDate: "2026-09-20", endDate: "2026-10-20" },
    team: { creator: { uid: "arjun", name: "Arjun" }, publisher: null, marketer: { uid: "divya", name: "Divya" }, assistants: [] },
    soldBy: "gov", items: [], ...over,
  }) as unknown as SmmCampaign;

  it("only months running today that the person holds a seat on", () => {
    const list = [
      month("mine", { items: [item("a")] }),
      month("theirs", { team: { creator: { uid: "ravi" }, assistants: [] }, items: [item("b")] }),
      month("ended", { cycle: { startDate: "2026-08-20", endDate: "2026-09-20" }, items: [item("c")] }),
      month("history", { history: true, items: [item("d")] }),
      month("allPosted", { items: [item("e", { status: "posted" })] }),
    ];
    expect(statusCheckMonths(list, "arjun", DAY).map((m) => m.campaign.id)).toEqual(["mine"]);
    // The salesperson is not on the team.
    expect(holdsSeat(list[0], "gov")).toBe(false);
    expect(holdsSeat(list[0], "divya")).toBe(true);
  });

  it("lists the person's own pieces first, then late ones, then by date", () => {
    const m = month("m", {
      items: [
        item("later", { uploadDate: "2026-10-12" }),
        item("late", { uploadDate: "2026-10-01" }),
        item("mine", { uploadDate: "2026-10-15", makerUid: "arjun" }),
        item("done", { status: "posted" }),
        item("extra", { extra: true }),
      ],
    });
    const [only] = statusCheckMonths([m], "arjun", DAY);
    expect(only.open.map((i) => i.id)).toEqual(["mine", "late", "later", "extra"]);
    // The month card's own count (what was promised), not the number of rows.
    const glance = monthGlance(m, DAY);
    expect(only).toMatchObject({ posted: glance.posted, promised: glance.total });
  });
});
