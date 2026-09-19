/**
 * The month's arithmetic.
 *
 * Three things here are load-bearing beyond this file:
 *  - `derivedProgressCounts` / `targetsFromCommitments` feed the ORDER's counters, which gate the
 *    balance-collect prompt (utils/collectReadiness) and tech payroll (utils/techProductivity);
 *  - `clientWaitDays` is the number quoted back to a client who says no work was done;
 *  - `canPublish` is the rule that nothing goes up without approval.
 */
import { describe, it, expect } from "vitest";
import {
  addDays, approvalWaitDays, budgetLedger, blankItem, buildInitialItems, canPublish,
  campaignHeadline, clientWaitSummary, cycleFromStart, daysBetween, daysLeftInCycle,
  daysUntilDue, derivedProgressCounts, extraWork, fulfilment, isMade, isOverdue, isPosted,
  isSmmOverseer, itemsForRun, postsByPlatform, smmWatchers, targetsFromCommitments, teamMembers,
  adTotals, adRunDays, budgetForDay, plannedSpend, postLinks, paymentProofs, DEFAULT_UPLOAD_TIME,
} from "@/utils/smmPlan";
import { isProgressComplete, progressPercent } from "@/utils/orderProgress";
import { collectReadiness } from "@/utils/collectReadiness";
import type { SmmAdRun, SmmBudgetPayment, SmmCampaign, SmmContentItem } from "@/types/smm";
import type { Order } from "@/types";

const PLATFORMS = ["instagram", "facebook"] as const;

function item(over: Partial<SmmContentItem> = {}): SmmContentItem {
  return { ...blankItem("poster", [...PLATFORMS]), ...over };
}

function campaign(over: Partial<SmmCampaign> = {}): SmmCampaign {
  return {
    id: "c1", orderId: "c1", leadId: "l1", saleItemKey: "l1__0",
    clientPhone: "+919000000000", clientPhoneId: "919000000000",
    clientName: "Ravi", businessName: "Sri Lakshmi Jewellers",
    packageKey: "Pro Package", packageLabel: "Pro Package", amount: 20000,
    cycle: cycleFromStart("2026-09-01"),
    platforms: [...PLATFORMS],
    commitments: { poster: 2, ai_ad: 2, real_video: 0 },
    items: [], ads: [], budgetPayments: [],
    team: { creator: null, publisher: null, marketer: null, assistants: [] },
    soldBy: "seller", soldByName: "Anita", salesAdminId: null,
    watchers: ["seller"], status: "active",
    renewal: { state: "none" },
    ...over,
  };
}

describe("dates", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-09-01", "2026-09-04")).toBe(3);
    expect(daysBetween("2026-09-04", "2026-09-01")).toBe(-3);
    expect(daysBetween("2026-09-01", "2026-09-01")).toBe(0);
  });

  it("runs a month for thirty days from the day it was sold, not to the end of the calendar month", () => {
    const c = cycleFromStart("2026-09-22");
    expect(c.startDate).toBe("2026-09-22");
    expect(c.endDate).toBe("2026-10-21");
    expect(c.month).toBe("2026-09");
  });

  it("counts today as a day left, and goes negative once the month is over", () => {
    const c = cycleFromStart("2026-09-01");
    expect(daysLeftInCycle(c, "2026-09-30")).toBe(1);
    expect(daysLeftInCycle(c, "2026-10-01")).toBe(0);
    expect(daysLeftInCycle(c, "2026-10-05")).toBe(-4);
  });

  it("survives a malformed date rather than producing Invalid Date", () => {
    expect(daysBetween("", "2026-09-01")).toBe(0);
    expect(addDays("not-a-date", 3)).toBe("not-a-date");
  });
});

describe("the plan a sale opens with", () => {
  it("is one row per committed piece, already on the right accounts", () => {
    const items = buildInitialItems({ poster: 8, ai_ad: 8, real_video: 2 }, [...PLATFORMS]);
    expect(items).toHaveLength(18);
    expect(items.filter((i) => i.kind === "poster")).toHaveLength(8);
    expect(items.filter((i) => i.kind === "real_video")).toHaveLength(2);
    expect(items[0].platforms).toEqual(["instagram", "facebook"]);
    expect(items[0].status).toBe("planned");
    expect(items.every((i) => !i.extra)).toBe(true);
  });

  it("gives every row its own id", () => {
    const items = buildInitialItems({ poster: 5, ai_ad: 0, real_video: 0 }, []);
    expect(new Set(items.map((i) => i.id)).size).toBe(5);
  });
});

describe("nothing is posted without approval", () => {
  it("refuses to publish until the client has said yes", () => {
    expect(canPublish(item())).toBe(false);
    expect(canPublish(item({ approval: { state: "waiting", chases: [] } }))).toBe(false);
    expect(canPublish(item({ approval: { state: "changes", chases: [] } }))).toBe(false);
    expect(canPublish(item({ approval: { state: "approved", chases: [] } }))).toBe(true);
  });
});

describe("where an item stands", () => {
  it("counts as made once it exists, whatever the client has since said", () => {
    expect(isMade(item({ status: "planned" }))).toBe(false);
    expect(isMade(item({ status: "in_progress" }))).toBe(false);
    expect(isMade(item({ status: "awaiting_approval" }))).toBe(true);
    expect(isMade(item({ status: "changes_requested" }))).toBe(true);
    expect(isMade(item({ status: "posted" }))).toBe(true);
  });

  it("is late only when it has a date, is past it, and is not up", () => {
    expect(isOverdue(item({ uploadDate: "2026-09-01" }), "2026-09-05")).toBe(true);
    expect(isOverdue(item({ uploadDate: "2026-09-01", status: "posted" }), "2026-09-05")).toBe(false);
    expect(isOverdue(item({ uploadDate: null }), "2026-09-05")).toBe(false);
    expect(isOverdue(item({ uploadDate: "2026-09-09" }), "2026-09-05")).toBe(false);
  });

  it("reports no due date rather than pretending one is today", () => {
    expect(daysUntilDue(item({ uploadDate: null }), "2026-09-05")).toBeNull();
    expect(daysUntilDue(item({ uploadDate: "2026-09-08" }), "2026-09-05")).toBe(3);
  });
});

describe("fulfilment", () => {
  const c = campaign({
    commitments: { poster: 2, ai_ad: 2, real_video: 0 },
    items: [
      item({ kind: "poster", status: "posted" }),
      item({ kind: "poster", status: "awaiting_approval" }),
      item({ kind: "ai_ad", status: "posted" }),
      item({ kind: "ai_ad", status: "planned" }),
    ],
  });

  it("measures posted against committed", () => {
    const f = fulfilment(c);
    expect(f.committed).toBe(4);
    expect(f.posted).toBe(2);
    expect(f.made).toBe(3);
    expect(f.percent).toBe(50);
    expect(f.complete).toBe(false);
  });

  it("never lets extra work flatter a month that is behind", () => {
    const withExtra = campaign({
      ...c,
      items: [...c.items, item({ kind: "poster", status: "posted", extra: true })],
    });
    const f = fulfilment(withExtra);
    expect(f.posted).toBe(2);       // still two of the four that were SOLD
    expect(f.percent).toBe(50);
    expect(f.extra).toBe(1);
  });

  it("counts a post once per account it went to", () => {
    const posts = postsByPlatform([
      item({ status: "posted", platforms: ["instagram", "facebook"] }),
      item({ status: "posted", platforms: ["instagram"] }),
      item({ status: "planned", platforms: ["instagram"] }),
    ]);
    expect(posts.find((p) => p.platform === "instagram")?.count).toBe(2);
    expect(posts.find((p) => p.platform === "facebook")?.count).toBe(1);
    expect(posts.find((p) => p.platform === "youtube")).toBeUndefined();
  });
});

describe("how long the client kept us waiting", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-09-20T10:00:00Z");

  it("counts an open wait up to today", () => {
    const a = { state: "waiting" as const, askedAt: now - 5 * day, chases: [] };
    expect(approvalWaitDays(a, now)).toBe(5);
  });

  it("counts an answered wait only up to the answer", () => {
    const a = { state: "approved" as const, askedAt: now - 5 * day, respondedAt: now - 3 * day, chases: [] };
    expect(approvalWaitDays(a, now)).toBe(2);
  });

  it("counts nothing for an approval nobody has asked for", () => {
    expect(approvalWaitDays({ state: "not_sent", chases: [] }, now)).toBe(0);
    expect(approvalWaitDays(null, now)).toBe(0);
  });

  it("adds the month up, and names the worst single wait", () => {
    const c = campaign({
      items: [
        item({ approval: { state: "approved", askedAt: now - 9 * day, respondedAt: now - 3 * day, chases: [] } }),
        item({ approval: { state: "waiting", askedAt: now - 2 * day, chases: [{ at: now, byName: "Anita" }] } }),
        item(),
      ],
    });
    const w = clientWaitSummary(c.items, now);
    expect(w.totalDays).toBe(8);   // six on the first, two still running on the second
    expect(w.worstDays).toBe(6);
    expect(w.openCount).toBe(1);
    expect(w.chases).toBe(1);
  });
});

describe("ads", () => {
  const run: SmmAdRun = {
    id: "r1", name: "Diwali", scope: { kind: "ai_ad", itemIds: [] },
    startDate: "2026-09-10", days: 3, dailyBudget: 300,
    budgetByDay: { "2026-09-11": 800 }, status: "running", reports: [],
  };

  it("lists every day the run covers", () => {
    expect(adRunDays(run)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });

  it("keeps the agreed daily figure and honours a single day that moved", () => {
    expect(budgetForDay(run, "2026-09-10")).toBe(300);
    expect(budgetForDay(run, "2026-09-11")).toBe(800);
    expect(run.dailyBudget).toBe(300);          // the agreed figure is untouched
    expect(plannedSpend(run)).toBe(300 + 800 + 300);
  });

  it("totals a run by dividing the whole spend by the whole leads, not by averaging the days", () => {
    const totals = adTotals([
      { date: "2026-09-10", leads: 10, spend: 300, costPerResult: 30, byName: "K", at: null },
      { date: "2026-09-11", leads: 2, spend: 800, costPerResult: 400, byName: "K", at: null },
    ]);
    expect(totals.leads).toBe(12);
    expect(totals.spend).toBe(1100);
    // Averaging the two dashboard figures would say ₹215; the truth is ₹91.67.
    expect(totals.costPerResult).toBeCloseTo(91.67, 1);
  });

  it("resolves a run's scope to a whole kind or to named items", () => {
    const poster = item({ kind: "poster" });
    const ad = item({ kind: "ai_ad" });
    const c = campaign({ items: [poster, ad] });
    expect(itemsForRun(c, run)).toEqual([ad]);
    expect(itemsForRun(c, { ...run, scope: { kind: "all", itemIds: [] } })).toHaveLength(2);
    expect(itemsForRun(c, { ...run, scope: { kind: "all", itemIds: [poster.id] } })).toEqual([poster]);
  });
});

describe("the client's ad money", () => {
  it("says when tomorrow is not covered", () => {
    const c = campaign({
      budgetPayments: [{ id: "p1", amount: 1000, at: null, byName: "Anita" }],
      ads: [{
        id: "r1", name: "x", scope: { kind: "all", itemIds: [] },
        startDate: "2026-09-10", days: 5, dailyBudget: 500, status: "running",
        reports: [{ date: "2026-09-10", leads: 5, spend: 800, costPerResult: 160, byName: "K", at: null }],
      }],
    });
    const ledger = budgetLedger(c, "2026-09-10");
    expect(ledger.funded).toBe(1000);
    expect(ledger.spent).toBe(800);
    expect(ledger.balance).toBe(200);
    expect(ledger.nextDayNeed).toBe(500);
    expect(ledger.short).toBe(true);
  });

  it("does not cry short when nothing is running tomorrow", () => {
    const c = campaign({
      ads: [{
        id: "r1", name: "x", scope: { kind: "all", itemIds: [] },
        startDate: "2026-09-10", days: 1, dailyBudget: 500, status: "running", reports: [],
      }],
    });
    expect(budgetLedger(c, "2026-09-10").short).toBe(false);
  });
});

describe("extra work", () => {
  it("separates what is still to settle from what was charged or given", () => {
    const e = extraWork([
      item({ extra: true, extraCharge: "unbilled" }),
      item({ extra: true, extraCharge: "billed", extraAmount: 500 }),
      item({ extra: true, extraCharge: "free" }),
      item({ extra: false }),
    ]);
    expect(e.items).toHaveLength(3);
    expect(e.unbilled).toBe(1);
    expect(e.billedAmount).toBe(500);
    expect(e.freeCount).toBe(1);
  });
});

describe("the order's own counters, derived", () => {
  it("reproduces exactly what the catalogue quota already said for a stock package", () => {
    // Pro is 8 videos, 8 posters and 16 posts — see utils/serviceCatalog. Stories are zero: the
    // per-item tick box that fed that counter has gone, so a target on it could never be met and
    // would pin every month to the top of the Orders queue for ever.
    expect(targetsFromCommitments({ poster: 8, ai_ad: 8, real_video: 0 }))
      .toEqual({ ads: 8, posters: 8, posted: 16, stories: 0, campaigns: 8 });
  });

  it("owes more the moment real videos are sold on top", () => {
    expect(targetsFromCommitments({ poster: 8, ai_ad: 8, real_video: 3 }))
      .toEqual({ ads: 11, posters: 8, posted: 19, stories: 0, campaigns: 11 });
  });

  it("counts made, posted and promoted pieces off the plan", () => {
    const promoted = item({ kind: "ai_ad", status: "posted", story: true });
    const c = campaign({
      items: [
        item({ kind: "poster", status: "awaiting_approval" }),
        item({ kind: "poster", status: "posted" }),
        promoted,
        item({ kind: "ai_ad", status: "planned" }),
        item({ kind: "poster", status: "posted", extra: true }),   // extra never counts here
      ],
      ads: [{
        id: "r1", name: "x", scope: { kind: "all", itemIds: [promoted.id] },
        startDate: "2026-09-10", days: 2, dailyBudget: 200, status: "running", reports: [],
      }],
    });
    expect(derivedProgressCounts(c)).toEqual({ ads: 1, posters: 2, posted: 2, stories: 1, campaigns: 1 });
    // `stories` still counts a legacy item that carries the old flag; nothing writes it any more.
  });

  it("does not count a campaign that has only been planned", () => {
    const ad = item({ kind: "ai_ad", status: "posted" });
    const c = campaign({
      items: [ad],
      ads: [{
        id: "r1", name: "x", scope: { kind: "all", itemIds: [] },
        startDate: "2026-09-10", days: 2, dailyBudget: 200, status: "planned", reports: [],
      }],
    });
    expect(derivedProgressCounts(c).campaigns).toBe(0);
  });
});

describe("the derived counters keep the rest of the app working", () => {
  const c = campaign({
    commitments: { poster: 1, ai_ad: 1, real_video: 0 },
    items: [
      item({ kind: "poster", status: "posted", story: true }),
      item({ kind: "ai_ad", status: "posted", story: true }),
    ],
    ads: [{
      id: "r1", name: "x", scope: { kind: "all", itemIds: [] },
      startDate: "2026-09-10", days: 2, dailyBudget: 200, status: "running", reports: [],
    }],
  });

  const order = {
    status: "assigned",
    progress: {
      kind: "smm" as const,
      targets: targetsFromCommitments(c.commitments),
      done: derivedProgressCounts(c),
      tracks: {},
      completedTracks: [],
      log: [],
      derived: true,
    },
  } as unknown as Order;

  it("lets the balance become collectable once the first post is made, up and running", () => {
    expect(collectReadiness(order).ready).toBe(true);
  });

  it("reads as complete to the Orders queue when every counter is met", () => {
    expect(isProgressComplete(order.progress)).toBe(true);
    expect(progressPercent(order.progress)).toBe(100);
  });
});

describe("who can see and change a month", () => {
  it("watches the seller and everyone given a seat, and nobody else", () => {
    const team = {
      creator: { uid: "tech1", name: "Kiran" },
      publisher: { uid: "tech2", name: "Divya" },
      marketer: { uid: "tech1", name: "Kiran" },
      assistants: [{ uid: "junior", name: "Sai" }],
    };
    const w = smmWatchers(team, "seller");
    expect(w.sort()).toEqual(["junior", "seller", "tech1", "tech2"]);
    // An admin is deliberately absent — they read the active set instead.
    expect(w).not.toContain("admin");
  });

  it("lists somebody holding two seats once, with both named", () => {
    const team = {
      creator: { uid: "tech1", name: "Kiran" },
      publisher: null,
      marketer: { uid: "tech1", name: "Kiran" },
      assistants: [],
    };
    expect(teamMembers(team)).toEqual([{ uid: "tech1", name: "Kiran", roles: ["Content", "Marketing"] }]);
  });

  it("treats an SMM leader as an overseer on top of their own role", () => {
    expect(isSmmOverseer({ role: "tech_member" })).toBe(false);
    expect(isSmmOverseer({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(isSmmOverseer({ role: "tech_admin" })).toBe(true);
    expect(isSmmOverseer(null)).toBe(false);
  });
});

describe("the one line on a card", () => {
  it("says what is posted, what is stuck, and how long is left", () => {
    const c = campaign({
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      items: [item({ status: "posted" }), item({ approval: { state: "waiting", askedAt: Date.now(), chases: [] } })],
    });
    expect(campaignHeadline(c, "2026-09-25")).toBe("1 of 2 posted · 1 waiting on client · ends in 6 days");
  });
});

describe("a new row arrives ready to use", () => {
  it("carries the default upload time, so nobody types 06:00 thirty times a month", () => {
    expect(blankItem("poster", [...PLATFORMS]).uploadTime).toBe(DEFAULT_UPLOAD_TIME);
    expect(DEFAULT_UPLOAD_TIME).toBe("06:00");
    expect(buildInitialItems({ poster: 3, ai_ad: 0, real_video: 0 }, []).every((i) => i.uploadTime === "06:00")).toBe(true);
  });

  it("no longer carries the two tick boxes that were removed", () => {
    const fresh = blankItem("poster", [...PLATFORMS]);
    expect(fresh.scheduled).toBeUndefined();
    expect(fresh.story).toBeUndefined();
  });
});

describe("where a post actually went live", () => {
  it("returns one link per account, in the app's own account order", () => {
    const links = postLinks(item({
      platforms: ["instagram", "facebook"],
      postUrls: { facebook: "https://fb.com/p/2", instagram: "https://ig.com/p/1" },
    }));
    expect(links.map((l) => l.platform)).toEqual(["instagram", "facebook"]);
    expect(links.map((l) => l.url)).toEqual(["https://ig.com/p/1", "https://fb.com/p/2"]);
  });

  it("ignores a box somebody left blank", () => {
    const links = postLinks(item({
      platforms: ["instagram", "facebook"],
      postUrls: { instagram: "https://ig.com/p/1", facebook: "   " },
    }));
    expect(links).toHaveLength(1);
    expect(links[0].platform).toBe("instagram");
  });

  it("ignores a link for an account this post was never on", () => {
    const links = postLinks(item({
      platforms: ["instagram"],
      postUrls: { instagram: "https://ig.com/p/1", youtube: "https://yt.com/p/9" },
    }));
    expect(links.map((l) => l.platform)).toEqual(["instagram"]);
  });

  it("still shows the single link an older item carries, with no migration", () => {
    const links = postLinks(item({
      platforms: ["instagram", "facebook"],
      postUrl: "https://ig.com/old",
      postUrls: null,
    }));
    expect(links).toEqual([{ platform: "instagram", label: "Instagram", url: "https://ig.com/old" }]);
  });

  it("says nothing when nothing has been pasted", () => {
    expect(postLinks(item({ platforms: ["instagram"] }))).toEqual([]);
  });
});

describe("how the client's ad money reached Meta", () => {
  const pay = (over: Partial<SmmBudgetPayment> = {}): SmmBudgetPayment => ({
    id: `p${Math.random()}`, amount: 1000, at: null, byName: "Anita", ...over,
  });

  it("counts money paid to us and not yet forwarded as held by us", () => {
    const c = campaign({
      budgetPayments: [
        pay({ amount: 5000, route: "via_us" }),
        pay({ amount: 2000, route: "via_us", metaProofUrl: "https://proof/2" }),
        pay({ amount: 3000, route: "direct" }),
      ],
    });
    const ledger = budgetLedger(c, "2026-09-10");
    expect(ledger.funded).toBe(10000);       // every route funds the ads
    expect(ledger.heldByUs).toBe(5000);      // only the one with no forward proof
    expect(ledger.awaitingForward).toHaveLength(1);
  });

  it("treats a payment recorded before routes existed as paid directly", () => {
    const c = campaign({ budgetPayments: [pay({ amount: 4000 })] });
    const ledger = budgetLedger(c, "2026-09-10");
    expect(ledger.funded).toBe(4000);
    expect(ledger.heldByUs).toBe(0);
  });

  it("never treats a direct payment as money we are sitting on", () => {
    // A direct payment has no second leg to prove, so it can never be "awaiting forward".
    const c = campaign({ budgetPayments: [pay({ route: "direct", metaProofUrl: null })] });
    expect(budgetLedger(c, "2026-09-10").heldByUs).toBe(0);
  });

  it("labels each proof by the leg it belongs to", () => {
    expect(paymentProofs(pay({ route: "direct", clientProofUrl: "https://a" })))
      .toEqual([{ label: "Client → Meta", url: "https://a" }]);

    expect(paymentProofs(pay({ route: "via_us", clientProofUrl: "https://a", metaProofUrl: "https://b" })))
      .toEqual([
        { label: "Client → us", url: "https://a" },
        { label: "Us → Meta", url: "https://b" },
      ]);
  });

  it("still shows the single proof an older payment carries", () => {
    expect(paymentProofs(pay({ screenshotUrl: "https://old" })))
      .toEqual([{ label: "Client → Meta", url: "https://old" }]);
  });

  it("shows nothing rather than a broken link when no proof was uploaded", () => {
    expect(paymentProofs(pay())).toEqual([]);
  });
});
