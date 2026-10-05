import { describe, expect, it } from "vitest";
import { byGlanceUrgency, clockLabel, monthGlance, upcomingDayLabel } from "@/utils/smmGlance";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const TODAY = "2026-10-04";
let seq = 0;
const item = (over: Partial<SmmContentItem> = {}): SmmContentItem => ({
  id: `g${(seq += 1)}`, kind: "poster", title: "Post", uploadDate: null, uploadTime: "06:00", platforms: ["instagram"],
  status: "planned", approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
  extra: false, postedAt: null, ...over,
});
const team = { creator: { uid: "u1", name: "Arjun" }, publisher: null, marketer: null, assistants: [] };
const month = (over: Partial<SmmCampaign>): SmmCampaign => ({
  id: "x", orderId: "x", leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Client", businessName: "Business", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: { month: "2026-09", startDate: "2026-09-20", endDate: "2026-10-20" },
  platforms: ["instagram"], commitments: { poster: 4, ai_ad: 2, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team, soldBy: "s1", soldByName: "Anil", watchers: ["s1"], status: "active", renewal: { state: "none" }, ...over,
});

describe("monthGlance — the status in plain words", () => {
  it("calls a month with late posts Off track and says how many", () => {
    const g = monthGlance(month({
      items: [
        item({ status: "posted", uploadDate: "2026-09-22" }),
        item({ status: "planned", uploadDate: "2026-09-30" }),
        item({ status: "in_progress", uploadDate: "2026-10-02" }),
        item({ status: "approved", uploadDate: "2026-10-06", approval: { state: "approved" } }),
        item({ status: "awaiting_approval", uploadDate: "2026-10-08", kind: "ai_ad", approval: { state: "waiting" } }),
      ],
    }), TODAY);
    expect(g).toMatchObject({ status: "off_track", label: "Off track", reason: "2 posts are late", tone: "bad" });
    // 6 promised: 1 posted, 1 approved, 1 with the client, 2 late, 1 never planned.
    expect(g.buckets).toEqual({ posted: 1, progress: 1, waiting: 1, notStarted: 1, late: 2 });
    expect([g.posted, g.total, g.percent]).toEqual([1, 6, 17]);
  });

  it("calls a month behind its calendar but with nothing late At risk", () => {
    const g = monthGlance(month({
      commitments: { poster: 6, ai_ad: 0, real_video: 0 },
      items: [1, 2, 3, 4, 5, 6].map((i) => item({ status: "in_progress", uploadDate: `2026-10-${String(10 + i).padStart(2, "0")}` })),
    }), TODAY);
    // 15 of 31 days gone → 2 posts expected by today, none posted.
    expect(g).toMatchObject({ status: "at_risk", reason: "2 posts behind schedule", tone: "warn" });
  });

  it("calls a month keeping pace On track, and mentions posts waiting on the client", () => {
    const base = {
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      cycle: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" },
    };
    expect(monthGlance(month({ ...base, items: [item({ uploadDate: "2026-10-10" }), item({ uploadDate: "2026-10-20" })] }), TODAY))
      .toMatchObject({ status: "on_track", reason: "Everything is on schedule", tone: "good" });
    expect(monthGlance(month({
      ...base,
      items: [item({ status: "awaiting_approval", uploadDate: "2026-10-10", approval: { state: "waiting" } }), item({ uploadDate: "2026-10-20" })],
    }), TODAY).reason).toBe("1 post is waiting for the client's approval");
  });

  it("names the other states", () => {
    expect(monthGlance(month({ commitments: { poster: 1, ai_ad: 0, real_video: 0 }, items: [item({ status: "posted", uploadDate: "2026-09-25" })] }), TODAY))
      .toMatchObject({ status: "done", label: "Completed", reason: "The post is live" });
    expect(monthGlance(month({ cycle: { month: "2026-10", startDate: "2026-10-07", endDate: "2026-11-07" } }), TODAY))
      .toMatchObject({ status: "not_started", reason: "Starts in 3 days", tone: "idle" });
    expect(monthGlance(month({ team: { creator: null, publisher: null, marketer: null, assistants: [] } }), TODAY))
      .toMatchObject({ status: "setup", label: "Needs setup", tone: "warn" });
    // Ended and renewed (filed): what it delivered.
    const ended = { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" };
    expect(monthGlance(month({
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      cycle: ended,
      items: [item({ status: "posted", uploadDate: "2026-09-10" }), item({ status: "posted", uploadDate: "2026-09-20" })],
      status: "renewed", renewal: { state: "won", nextCampaignId: "y" },
    }), TODAY)).toMatchObject({ status: "done" });
    expect(monthGlance(month({
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      cycle: ended,
      items: [item({ status: "posted", uploadDate: "2026-09-10" }), item({ status: "posted", uploadDate: "2026-09-20", extra: true })],
      status: "renewed", renewal: { state: "won", nextCampaignId: "y" },
    }), TODAY)).toMatchObject({ status: "off_track", reason: "Month ended with 1 post not live" });
    // A filed history month (something followed it) is history.
    expect(monthGlance(month({ history: true, status: "completed", cycle: ended }), TODAY)).toMatchObject({ status: "history" });
  });

  it("says On hold for a month that ended without a renewal — a history month too (owner, 2026-10-05)", () => {
    const ended = { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" };
    const allPosted = month({
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      cycle: ended,
      items: [item({ status: "posted", uploadDate: "2026-09-10" }), item({ status: "posted", uploadDate: "2026-09-20" })],
    });
    expect(monthGlance(allPosted, TODAY)).toMatchObject({
      status: "on_hold", label: "On hold", tone: "idle", reason: "Ended 1 Oct — not renewed yet",
    });
    expect(monthGlance(month({ cycle: ended, items: [item({ status: "posted", uploadDate: "2026-09-10" })] }), TODAY).reason)
      .toBe("Ended 1 Oct — not renewed yet · 5 posts not live");
    // A history month's blank rows are a record left blank — not "posts not live".
    expect(monthGlance(month({ history: true, cycle: ended }), TODAY))
      .toMatchObject({ status: "on_hold", reason: "Ended 1 Oct — not renewed yet" });
    // Decided — renewed, or not renewing — is no longer on hold.
    expect(monthGlance({ ...allPosted, renewal: { state: "lost" } }, TODAY).status).toBe("done");
    expect(monthGlance({ ...allPosted, renewal: { state: "won", nextCampaignId: "y" } }, TODAY).status).toBe("done");
    // Still running: not on hold, however it is doing.
    expect(monthGlance(month({}), TODAY).status).not.toBe("on_hold");
    // Worst first: work that is late, then on hold, then completed.
    const ranked = byGlanceUrgency([
      { glance: monthGlance({ ...allPosted, renewal: { state: "lost" } }, TODAY) },
      { glance: monthGlance(allPosted, TODAY) },
      { glance: monthGlance(month({ items: [item({ status: "planned", uploadDate: "2026-09-30" })] }), TODAY) },
    ]).map((x) => x.glance.status);
    expect(ranked).toEqual(["off_track", "on_hold", "done"]);
  });

  it("counts each kind, the extras, the days left and the next post", () => {
    const g = monthGlance(month({
      items: [
        item({ status: "posted", uploadDate: "2026-09-22", kind: "ai_ad" }),
        item({ uploadDate: "2026-10-09", uploadTime: "18:30", title: "Weekend sale" }),
        item({ uploadDate: "2026-10-05", uploadTime: "06:00", title: "Diwali offer" }),
        item({ status: "posted", extra: true, uploadDate: "2026-09-28" }),
      ],
    }), TODAY);
    expect(g.kinds).toEqual([
      { kind: "poster", label: "Posters", posted: 0, total: 4 },
      { kind: "ai_ad", label: "Videos", posted: 1, total: 2 },
    ]);
    expect(g.extra).toBe(1);
    expect(g.timeLabel).toBe("17 days left");
    expect(g.next).toEqual({ title: "Diwali offer", day: "2026-10-05", dayLabel: "Tomorrow", timeLabel: "6:00 AM" });
  });

  it("says where the renewal stands", () => {
    const ending = { cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" } };
    expect(monthGlance(month(ending), TODAY).renewal).toEqual({ state: "due", label: "Renewal in 2 days" });
    expect(monthGlance(month({ ...ending, renewal: { state: "none", nextCampaignId: "n" } }), TODAY).renewal.state).toBe("renewed");
    expect(monthGlance(month({ ...ending, renewal: { state: "lost" } }), TODAY).renewal.label).toBe("Not renewing");
    expect(monthGlance(month({ cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" } }), TODAY).renewal)
      .toEqual({ state: "overdue", label: "Renewal overdue" });
    expect(monthGlance(month({}), TODAY).renewal.state).toBe("none");
  });
});

describe("helpers", () => {
  it("reads a clock time the way people say it", () => {
    expect(["06:00", "18:30", "00:15", "12:00", "x", null].map((t) => clockLabel(t as string))).toEqual(
      ["6:00 AM", "6:30 PM", "12:15 AM", "12:00 PM", null, null],
    );
  });

  it("names an upcoming day", () => {
    expect(["2026-10-04", "2026-10-05", "2026-10-09", "2026-10-18"].map((d) => upcomingDayLabel(d, TODAY)))
      .toEqual(["Today", "Tomorrow", "Fri", "18 Oct"]);
  });

  it("puts the clients that need somebody first", () => {
    const g = (id: string, over: Partial<SmmCampaign>) => ({ id, glance: monthGlance(month(over), TODAY) });
    const list = [
      g("ok", { commitments: { poster: 1, ai_ad: 0, real_video: 0 }, items: [item({ status: "posted", uploadDate: "2026-09-25" })] }),
      g("late", { items: [item({ uploadDate: "2026-10-01" })] }),
      g("setup", { team: { creator: null, publisher: null, marketer: null, assistants: [] } }),
    ];
    expect(byGlanceUrgency(list).map((x) => x.id)).toEqual(["late", "setup", "ok"]);
  });
});
