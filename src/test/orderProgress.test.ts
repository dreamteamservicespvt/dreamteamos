import { describe, it, expect } from "vitest";
import {
  initialProgress, activeFields, activeTracks, isTrackComplete, isProgressComplete,
  progressPercent, progressSummary, isPinnedOrder, canEditProgress, editableFields, tracksForMember,
} from "@/utils/orderProgress";
import type { Order, OrderProgress } from "@/types";

const smm = (done: Partial<OrderProgress["done"]> = {}): OrderProgress => ({
  kind: "smm",
  targets: { ads: 8, posters: 8, posted: 8, campaigns: 8 },
  done: { ads: 0, posters: 0, posted: 0, campaigns: 0, ...done },
  tracks: {},
  completedTracks: [],
  log: [],
});

describe("initialProgress", () => {
  it("seeds a social media month from its package quota", () => {
    const p = initialProgress({ category: "social_media_management", packageKey: "Pro Package" })!;
    expect(p.kind).toBe("smm");
    expect(p.targets).toEqual({ ads: 8, posters: 8, posted: 8, campaigns: 8 });
    expect(p.done).toEqual({ ads: 0, posters: 0, posted: 0, campaigns: 0 });
  });

  it("seeds every listed package", () => {
    const quotas = ["Starter Package", "Plus Package", "Pro Package", "Business Package", "Ultra Package"]
      .map((k) => initialProgress({ category: "social_media_management", packageKey: k })!.targets.ads);
    expect(quotas).toEqual([4, 6, 8, 10, 12]);
  });

  it("seeds a bulk order with N ads and N posters, and no marketing leg", () => {
    const p = initialProgress({ category: "bulk_ads", packageKey: "30 Seconds + Poster", quantity: 8 })!;
    expect(p.kind).toBe("bulk");
    expect(p.targets).toEqual({ ads: 8, posters: 8, posted: 0, campaigns: 0 });
  });

  it("gives an ordinary single ad nothing to count", () => {
    expect(initialProgress({ category: "promotional", packageKey: "30 Seconds + Poster" })).toBeNull();
    expect(initialProgress({ category: "logo", packageKey: "Basic" })).toBeNull();
  });

  it("gives a custom-priced month nothing to count, rather than a made-up quota", () => {
    expect(initialProgress({ category: "social_media_management", packageKey: "" })).toBeNull();
  });

  it("gives a bulk order with no quantity nothing to count", () => {
    expect(initialProgress({ category: "bulk_ads", quantity: 0 })).toBeNull();
  });
});

describe("which counters and jobs an order actually has", () => {
  it("a month owes all four counters and all three jobs", () => {
    expect(activeFields(smm())).toEqual(["ads", "posters", "posted", "campaigns"]);
    expect(activeTracks(smm())).toEqual(["ad_creation", "social_upload", "digital_marketing"]);
  });

  it("a bulk order owes only ad creation", () => {
    const bulk = initialProgress({ category: "bulk_ads", quantity: 5 })!;
    expect(activeFields(bulk)).toEqual(["ads", "posters"]);
    expect(activeTracks(bulk)).toEqual(["ad_creation"]);
  });
});

describe("completion", () => {
  it("a track is done when its own counters are met, regardless of the others", () => {
    const p = smm({ ads: 8, posters: 8 });
    expect(isTrackComplete(p, "ad_creation")).toBe(true);
    expect(isTrackComplete(p, "social_upload")).toBe(false);
    expect(isProgressComplete(p)).toBe(false);
  });

  it("a track marked done by hand shows as done to everyone", () => {
    const p = { ...smm(), completedTracks: ["social_upload" as const] };
    expect(isTrackComplete(p, "social_upload")).toBe(true);
  });

  it("the order is complete only when every counter is met", () => {
    expect(isProgressComplete(smm({ ads: 8, posters: 8, posted: 8 }))).toBe(false);
    expect(isProgressComplete(smm({ ads: 8, posters: 8, posted: 8, campaigns: 8 }))).toBe(true);
  });

  it("over-delivering still counts as complete", () => {
    expect(isProgressComplete(smm({ ads: 9, posters: 9, posted: 9, campaigns: 9 }))).toBe(true);
  });

  it("an order with no progress is not 'complete'", () => {
    expect(isProgressComplete(null)).toBe(false);
  });
});

describe("percent and summary", () => {
  it("counts across every counter, not per job", () => {
    expect(progressPercent(smm())).toBe(0);
    expect(progressPercent(smm({ ads: 8, posters: 8 }))).toBe(50);
    expect(progressPercent(smm({ ads: 8, posters: 8, posted: 8, campaigns: 8 }))).toBe(100);
  });

  it("does not let over-delivery push the bar past 100", () => {
    expect(progressPercent(smm({ ads: 40, posters: 40, posted: 40, campaigns: 40 }))).toBe(100);
  });

  it("reads as a sentence", () => {
    expect(progressSummary(smm({ ads: 5, posters: 3 })))
      .toBe("5 of 8 ads created · 3 of 8 posters created · 0 of 8 posted on social media · 0 of 8 ads running");
  });
});

describe("pinning", () => {
  const order = (progress: OrderProgress | null) => ({ id: "o1", progress } as unknown as Order);

  it("pins an unfinished month or bulk order", () => {
    expect(isPinnedOrder(order(smm({ ads: 4 })))).toBe(true);
  });

  it("releases it once everything is delivered", () => {
    expect(isPinnedOrder(order(smm({ ads: 8, posters: 8, posted: 8, campaigns: 8 })))).toBe(false);
  });

  it("never pins an ordinary single ad", () => {
    expect(isPinnedOrder(order(null))).toBe(false);
  });
});

describe("who may move the counters", () => {
  const withTracks = (): OrderProgress => ({
    ...smm(),
    tracks: {
      ad_creation: { uid: "m1", name: "Ravi" },
      social_upload: { uid: "m2", name: "Sana" },
      digital_marketing: { uid: "m2", name: "Sana" },
    },
  });

  it("lets the tech admin and team leader edit anything", () => {
    expect(canEditProgress(withTracks(), "tech_admin", "x")).toBe(true);
    expect(canEditProgress(withTracks(), "tech_team_leader", "x")).toBe(true);
    expect(editableFields(withTracks(), "tech_admin", "x"))
      .toEqual(["ads", "posters", "posted", "campaigns"]);
  });

  it("lets an assigned member edit only their own job's counters", () => {
    expect(canEditProgress(withTracks(), "tech_member", "m1")).toBe(true);
    expect(editableFields(withTracks(), "tech_member", "m1")).toEqual(["ads", "posters"]);
  });

  it("gives a member holding two jobs both sets of counters", () => {
    expect(editableFields(withTracks(), "tech_member", "m2")).toEqual(["posted", "campaigns"]);
    expect(tracksForMember(withTracks(), "m2")).toEqual(["social_upload", "digital_marketing"]);
  });

  it("shuts out a member who is on none of the jobs", () => {
    expect(canEditProgress(withTracks(), "tech_member", "m9")).toBe(false);
    expect(editableFields(withTracks(), "tech_member", "m9")).toEqual([]);
  });
});
