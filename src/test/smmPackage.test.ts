/**
 * The rules a social-media month is run by (2026-10-03): its dates, its video length, its pace,
 * which pile of work it belongs in, and who may do what with it. Pure — no Firestore.
 */
import { describe, it, expect } from "vitest";
import {
  addMonthsIso, boardStats, canRecordSmmSaleForSeller, canRenewSmm, canSetUpSmm, closingStatus, clipsPerVideoOf,
  cycleElapsed, cyclePhase, cycleRangeLabel, cycleTimeLabel, jobsByMember, kindSegments, monthCycle, needsAttention,
  needsSetup, normaliseClipsPerVideo, paceLabel, paceOf, renewalDue, renewalLeadUrl, renewalPrefillOf,
  renewalStartDate, saleDay, smmSalesOnLeads, teamFromTracks, tracksFromTeam, videoDuration, videoLengthLabel,
  videosLine,
} from "@/utils/smmPackage";
import { blankItem } from "@/utils/smmPlan";
import { canDeleteSmmCampaign } from "@/utils/smmPlan";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";
import type { Lead } from "@/types";

const team = (over: Partial<SmmCampaign["team"]> = {}): SmmCampaign["team"] =>
  ({ creator: null, publisher: null, marketer: null, assistants: [], ...over });

function month(over: Partial<SmmCampaign> = {}): SmmCampaign {
  return {
    id: "o1", orderId: "o1", leadId: "l1", saleItemKey: "l1__0", origin: "sale",
    clientPhone: "+919000000000", clientPhoneId: "919000000000", clientName: "Ravi", businessName: "Sri Sai Silks",
    packageKey: "Starter Package", packageLabel: "Starter Package", amount: 10000,
    cycle: monthCycle("2026-10-03"),
    platforms: ["instagram", "facebook"],
    commitments: { poster: 4, ai_ad: 4, real_video: 0 },
    items: [], ads: [], budgetPayments: [], team: team(),
    soldBy: "seller", soldByName: "Anil", watchers: ["seller"], status: "active",
    renewal: { state: "none" },
    ...over,
  };
}

const item = (over: Partial<SmmContentItem>): SmmContentItem => ({ ...blankItem("poster", ["instagram"]), ...over });

describe("a month runs to the same date next month", () => {
  it("3 Oct → 3 Nov", () => {
    expect(monthCycle("2026-10-03")).toEqual({ month: "2026-10", startDate: "2026-10-03", endDate: "2026-11-03" });
  });

  it("clamps to the end of a shorter month — 31 Jan → 28 Feb, and 29 Feb in a leap year", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsIso("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonthsIso("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("keeps an end date somebody typed, and ignores one before the start", () => {
    expect(monthCycle("2026-10-03", "2026-10-31").endDate).toBe("2026-10-31");
    expect(monthCycle("2026-10-03", "2026-10-01").endDate).toBe("2026-11-03");
  });

  it("says how much is left without the old off-by-one", () => {
    const c = monthCycle("2026-10-03");
    expect(cycleTimeLabel(c, "2026-10-01")).toBe("Starts in 2 days");
    expect(cycleTimeLabel(c, "2026-10-02")).toBe("Starts tomorrow");
    expect(cycleTimeLabel(c, "2026-11-01")).toBe("3 days left");
    expect(cycleTimeLabel(c, "2026-11-03")).toBe("Last day");
    // The day after the last day used to read "Last day".
    expect(cycleTimeLabel(c, "2026-11-04")).toBe("Ended yesterday");
    expect(cycleTimeLabel(c, "2026-11-08")).toBe("Ended 5 days ago");
    expect(cycleRangeLabel(c)).toBe("3 Oct → 3 Nov 2026");
  });

  it("knows where it is in its dates", () => {
    const c = monthCycle("2026-10-03");
    expect(cyclePhase(c, "2026-10-02")).toBe("upcoming");
    expect(cyclePhase(c, "2026-10-20")).toBe("running");
    expect(cyclePhase(c, "2026-11-04")).toBe("ended");
    expect(cycleElapsed(c, "2026-11-03")).toBe(1);
  });

  it("a renewal starts on the old end date, or the day it was renewed if that is later", () => {
    const c = monthCycle("2026-10-03");
    expect(renewalStartDate(c, "2026-10-30")).toBe("2026-11-03");
    expect(renewalStartDate(c, "2026-11-10")).toBe("2026-11-10");
  });
});

describe("how long each video is", () => {
  it("defaults to 4 clips — a 32-second video — and caps at the studio's 15", () => {
    expect(clipsPerVideoOf(month())).toBe(4);
    expect(clipsPerVideoOf(month({ clipsPerVideo: 6 }))).toBe(6);
    expect(normaliseClipsPerVideo(40)).toBe(15);
    expect(normaliseClipsPerVideo(0)).toBe(4);
    expect(videoDuration(6)).toBe("48s");
    expect(videoLengthLabel(6)).toBe("6 clips · 48 sec");
    expect(videosLine(month({ clipsPerVideo: 6 }))).toBe("4 videos × 48 sec");
    expect(videosLine(month({ commitments: { poster: 4, ai_ad: 0, real_video: 0 } }))).toBe("");
  });
});

describe("pace — posts done against posts that should be done by now", () => {
  const posted = (n: number) => Array.from({ length: n }, () => item({ status: "posted" }));
  const planned = (n: number) => Array.from({ length: n }, () => item({}));

  it("is behind when fewer are up than the calendar says", () => {
    // 8 pieces over 32 days; by 3 Nov... take day 17 (≈ half): 4 expected.
    const c = month({ commitments: { poster: 8, ai_ad: 0, real_video: 0 }, items: [...posted(1), ...planned(7)] });
    const p = paceOf(c, "2026-10-19");
    expect(p.state).toBe("behind");
    expect(p.behindBy).toBe(p.expected - 1);
    expect(paceLabel(p)).toBe(`Behind by ${p.behindBy}`);
  });

  it("is on track, done, not started, or short at the end", () => {
    const c = month({ commitments: { poster: 8, ai_ad: 0, real_video: 0 }, items: [...posted(5), ...planned(3)] });
    expect(paceOf(c, "2026-10-19").state).toBe("on_track");
    expect(paceOf({ ...c, items: posted(8) }, "2026-10-19").state).toBe("done");
    expect(paceOf(c, "2026-10-01").state).toBe("upcoming");
    const short = paceOf(c, "2026-11-10");
    expect(short.state).toBe("ended_short");
    expect(paceLabel(short)).toBe("3 not posted");
  });
});

describe("one block per piece", () => {
  it("orders posted first and late last, and leaves extra work out", () => {
    const items = [
      item({ id: "a", status: "planned", uploadDate: "2026-10-05" }),
      item({ id: "b", status: "posted" }),
      item({ id: "c", status: "approved" }),
      item({ id: "x", status: "posted", extra: true }),
    ];
    const segs = kindSegments(items, "poster", "2026-10-10");
    expect(segs.map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(segs.map((s) => s.tone)).toEqual(["done", "ready", "late"]);
  });
});

describe("which pile a month is in", () => {
  it("needs setup while running with nobody on it — not when ended or history", () => {
    expect(needsSetup(month(), "2026-10-10")).toBe(true);
    expect(needsSetup(month({ team: team({ creator: { uid: "m1", name: "Arjun" } }) }), "2026-10-10")).toBe(false);
    expect(needsSetup(month(), "2026-11-20")).toBe(false);
    expect(needsSetup(month({ history: true }), "2026-10-10")).toBe(false);
  });

  it("is due for renewal in its last five days and after, until somebody decides", () => {
    expect(renewalDue(month(), "2026-10-20")).toBe(false);
    expect(renewalDue(month(), "2026-10-31")).toBe(true);
    expect(renewalDue(month(), "2026-11-10")).toBe(true);
    expect(renewalDue(month({ renewal: { state: "lost" } }), "2026-10-31")).toBe(false);
    expect(renewalDue(month({ renewal: { state: "won", nextCampaignId: "o2" } }), "2026-10-31")).toBe(false);
  });

  it("needs attention when late, waiting on the client, or ended undecided", () => {
    expect(needsAttention(month(), "2026-10-10")).toBe(false);
    expect(needsAttention(month({ items: [item({ uploadDate: "2026-10-05" })] }), "2026-10-10")).toBe(true);
    expect(needsAttention(month({ items: [item({ approval: { state: "waiting" } })] }), "2026-10-10")).toBe(true);
    expect(needsAttention(month(), "2026-11-10")).toBe(true);
  });

  it("is filed as renewed or lapsed only once its dates are over and somebody decided", () => {
    expect(closingStatus(month({ renewal: { state: "won", nextCampaignId: "o2" } }), "2026-10-20")).toBeNull();
    expect(closingStatus(month({ renewal: { state: "won", nextCampaignId: "o2" } }), "2026-11-04")).toBe("renewed");
    expect(closingStatus(month({ renewal: { state: "lost" } }), "2026-11-04")).toBe("lapsed");
    expect(closingStatus(month(), "2026-11-04")).toBeNull();
  });
});

describe("the team, as jobs", () => {
  const arjun = { uid: "m1", name: "Arjun" };
  const divya = { uid: "m2", name: "Divya" };

  it("gives one job per person, naming every seat they hold", () => {
    const jobs = jobsByMember(team({ creator: arjun, publisher: arjun, marketer: divya }));
    expect(jobs).toEqual([
      { uid: "m1", name: "Arjun", tracks: ["ad_creation", "social_upload"] },
      { uid: "m2", name: "Divya", tracks: ["digital_marketing"] },
    ]);
  });

  it("round-trips through the order's tracks", () => {
    const t = team({ creator: arjun, marketer: divya });
    expect(tracksFromTeam(t)).toEqual({ ad_creation: arjun, digital_marketing: divya });
    expect(teamFromTracks(tracksFromTeam(t))).toEqual({ ...t, publisher: null, assistants: [] });
  });
});

describe("sales already on a number", () => {
  it("finds every social-media sale, including a legacy single sale, oldest first", () => {
    const ts = (ms: number) => ({ seconds: ms / 1000 });
    const leads = [
      { id: "l1", assignedTo: "anil", saleItems: [
        { category: "promotional", packageKey: "x", amount: 999, verificationStatus: "verified", submittedAt: ts(2_000_000_000_000) },
        { category: "social_media_management", packageKey: "Plus Package", amount: 15000, verificationStatus: "verified", submittedAt: ts(1_800_000_000_000) },
      ] },
      { id: "l2", assignedTo: "kiran", saleDetails: { category: "social_media_management", packageKey: "Starter Package", amount: 10000, verificationStatus: "pending", submittedAt: ts(1_700_000_000_000) } },
    ] as unknown as Lead[];
    const sales = smmSalesOnLeads(leads);
    expect(sales.map((s) => [s.leadId, s.itemIndex, s.sellerUid])).toEqual([["l2", 0, "kiran"], ["l1", 1, "anil"]]);
    expect(saleDay(sales[0].item, "x")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("renewing", () => {
  it("opens the sale form on the month being renewed", () => {
    const prefill = renewalPrefillOf(month({ clipsPerVideo: 6 }), "2026-10-30");
    expect(prefill).toMatchObject({ campaignId: "o1", packageKey: "Starter Package", clipsPerVideo: 6, nextStart: "2026-11-03" });
    expect(renewalLeadUrl("lead 1", "o1")).toBe("/sales/leads?lead=lead%201&sale=1&category=social_media_management&renew=o1");
  });
});

describe("who may do what", () => {
  it("lets only the tech side record a sale for a salesperson, and the SMM lead set months up", () => {
    expect(canRecordSmmSaleForSeller({ role: "tech_admin" })).toBe(true);
    expect(canRecordSmmSaleForSeller({ role: "tech_team_leader" })).toBe(true);
    expect(canRecordSmmSaleForSeller({ role: "main_admin" })).toBe(true);
    expect(canRecordSmmSaleForSeller({ role: "tech_member", smmLeader: true })).toBe(false);
    expect(canRecordSmmSaleForSeller({ role: "sales_admin" })).toBe(false);
    expect(canSetUpSmm({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(canSetUpSmm({ role: "tech_team_leader" })).toBe(true);
    expect(canSetUpSmm({ role: "sales_admin" })).toBe(false);
    expect(canSetUpSmm({ role: "tech_member" })).toBe(false);
  });

  it("lets only the month's own salesperson renew it", () => {
    const c = month();
    expect(canRenewSmm(c, { uid: "seller", role: "sales_member" })).toBe(true);
    expect(canRenewSmm(c, { uid: "other", role: "sales_member" })).toBe(false);
    expect(canRenewSmm(c, { uid: "seller", role: "tech_admin" })).toBe(false);
  });

  it("lets the team leader delete a month (owner, 2026-10-03)", () => {
    expect(canDeleteSmmCampaign({ role: "tech_team_leader" })).toBe(true);
  });
});

describe("the board's numbers", () => {
  it("counts running months, delivery, late, waiting, renewals and setup", () => {
    const today = "2026-10-31";
    const late = item({ uploadDate: "2026-10-20" });
    const dueSoon = item({ uploadDate: "2026-11-02" });
    const waiting = item({ approval: { state: "waiting" } });
    const a = month({ id: "a", items: [late, dueSoon, waiting, item({ status: "posted" })], commitments: { poster: 4, ai_ad: 0, real_video: 0 } });
    const b = month({ id: "b", amount: 15000, team: team({ creator: { uid: "m1", name: "Arjun" } }), cycle: monthCycle("2026-10-20") });
    const finished = month({ id: "c", status: "renewed" });
    const s = boardStats([a, b, finished], today);
    expect(s.running).toBe(2);
    expect(s.monthlyValue).toBe(25000);
    expect(s.late).toBe(1);
    expect(s.dueThisWeek).toBe(1);
    expect(s.waiting).toBe(1);
    expect(s.renewalsDue).toBe(1);   // a ends 3 Nov; b ends 20 Nov
    expect(s.needsSetup).toBe(1);    // a has nobody on it
    expect(s.posted).toBe(1);
  });
});
