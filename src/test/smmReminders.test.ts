/**
 * Who gets told what, and when.
 *
 * The two rules worth pinning down are about ADDRESSING, not timing: a due post goes to the people
 * who have to make and post it, and a client who will not answer goes to the person who can ring
 * them. Getting either wrong means the reminder arrives and nothing happens.
 */
import { describe, it, expect } from "vitest";
import {
  SMM_REMINDER_DAYS, approvalChasesFor, budgetAlertsFor, dueItemsFor, dueLabel,
  dueNotificationKey, overdueItemsFor, remindersFor, renewalsDueFor, waitLine,
} from "@/utils/smmReminders";
import { blankItem, cycleFromStart } from "@/utils/smmPlan";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const TODAY = "2026-09-20";
const NOW = Date.parse("2026-09-20T10:00:00Z");
const DAY = 86_400_000;

function item(over: Partial<SmmContentItem> = {}): SmmContentItem {
  return { ...blankItem("poster", ["instagram"]), makerUid: "maker", publisherUid: "poster1", ...over };
}

function campaign(over: Partial<SmmCampaign> = {}): SmmCampaign {
  return {
    id: "c1", orderId: "c1", leadId: "l1", saleItemKey: "l1__0",
    clientPhone: "+919000000000", clientPhoneId: "919000000000",
    clientName: "Ravi", businessName: "Sri Lakshmi Jewellers",
    packageKey: "Pro", packageLabel: "Pro", amount: 20000,
    cycle: cycleFromStart("2026-09-01"),
    platforms: ["instagram"],
    commitments: { poster: 2, ai_ad: 0, real_video: 0 },
    items: [], ads: [], budgetPayments: [],
    team: { creator: null, publisher: null, marketer: null, assistants: [] },
    soldBy: "seller", soldByName: "Anita", salesAdminId: null,
    watchers: ["seller", "maker", "poster1"], status: "active",
    renewal: { state: "none" },
    ...over,
  };
}

describe("what is due", () => {
  const c = campaign({
    items: [
      item({ id: "a", title: "Dussehra offer", uploadDate: "2026-09-22" }),   // in 2 days
      item({ id: "b", title: "Far off", uploadDate: "2026-09-30" }),          // outside the window
      item({ id: "c", title: "Late one", uploadDate: "2026-09-18" }),         // 2 days late
      item({ id: "d", title: "Already up", uploadDate: "2026-09-19", status: "posted" }),
      item({ id: "e", title: "No date" }),
      item({ id: "f", title: "Not mine", uploadDate: "2026-09-21", makerUid: "other", publisherUid: "other" }),
    ],
  });

  it("shows only what is inside the reminder window, soonest first", () => {
    const due = dueItemsFor([c], "maker", TODAY);
    expect(due.map((d) => d.item.id)).toEqual(["c", "a"]);
    expect(SMM_REMINDER_DAYS).toBe(3);
  });

  it("does not remind anybody about a post that is already up", () => {
    expect(dueItemsFor([c], "maker", TODAY).some((d) => d.item.id === "d")).toBe(false);
  });

  it("does not remind anybody about a post with no date", () => {
    expect(dueItemsFor([c], "maker", TODAY).some((d) => d.item.id === "e")).toBe(false);
  });

  it("reminds the person who posts it as well as the person who makes it", () => {
    expect(dueItemsFor([c], "poster1", TODAY).map((d) => d.item.id)).toEqual(["c", "a"]);
  });

  it("tells nobody about work that is nobody's", () => {
    expect(dueItemsFor([c], "maker", TODAY).some((d) => d.item.id === "f")).toBe(false);
    expect(dueItemsFor([c], "nobody", TODAY)).toHaveLength(0);
  });

  it("separates what is already late", () => {
    expect(overdueItemsFor([c], "maker", TODAY).map((d) => d.item.id)).toEqual(["c"]);
  });

  it("ignores a month that has been closed", () => {
    expect(dueItemsFor([campaign({ ...c, status: "completed" })], "maker", TODAY)).toHaveLength(0);
  });

  it("writes the line a notification and a list row both use", () => {
    const due = dueItemsFor([c], "maker", TODAY);
    expect(dueLabel(due[0])).toBe("Late one — 2 days late");
    expect(dueLabel(due[1])).toBe("Dussehra offer — due in 2 days");
  });
});

describe("the push fires once per item per day", () => {
  it("keys on the item, the recipient and the day — never on the clock", () => {
    const key = dueNotificationKey("item1", "maker", TODAY);
    expect(key).toBe("smm_due_item1_maker_2026-09-20");
    expect(dueNotificationKey("item1", "maker", TODAY)).toBe(key);          // same day, same key
    expect(dueNotificationKey("item1", "maker", "2026-09-21")).not.toBe(key); // genuinely new
  });
});

describe("a client who will not answer", () => {
  const c = campaign({
    items: [
      item({ id: "a", title: "Waiting long", approval: { state: "waiting", askedAt: NOW - 4 * DAY, chases: [{ at: NOW, byName: "Anita" }] } }),
      item({ id: "b", title: "Just sent", approval: { state: "waiting", askedAt: NOW - 1 * DAY, chases: [] } }),
      item({ id: "c", title: "Answered", approval: { state: "approved", askedAt: NOW - 9 * DAY, respondedAt: NOW - 8 * DAY, chases: [] } }),
    ],
  });

  it("nudges the SELLER, because they are the one the client answers to", () => {
    expect(approvalChasesFor([c], "seller", NOW).map((x) => x.item.id)).toEqual(["a"]);
    expect(approvalChasesFor([c], "maker", NOW)).toHaveLength(0);
  });

  it("waits a couple of days before calling it stuck", () => {
    expect(approvalChasesFor([c], "seller", NOW).some((x) => x.item.id === "b")).toBe(false);
  });

  it("carries the number to ring and how often we have already tried", () => {
    const [chase] = approvalChasesFor([c], "seller", NOW);
    expect(chase.clientPhone).toBe("+919000000000");
    expect(chase.waitingDays).toBe(4);
    expect(chase.chases).toBe(1);
  });

  it("summarises the same thing in one line for a card", () => {
    expect(waitLine(c, NOW)).toBe("2 waiting on client · longest 4d");
    expect(waitLine(campaign(), NOW)).toBe("");
  });
});

describe("ad money running out", () => {
  const short = campaign({
    budgetPayments: [{ id: "p", amount: 100, at: null, byName: "Anita" }],
    ads: [{
      id: "r", name: "x", scope: { kind: "all", itemIds: [] },
      startDate: TODAY, days: 3, dailyBudget: 500, status: "running", reports: [],
    }],
  });

  it("tells the seller, who is the one who can ask for a top-up", () => {
    expect(budgetAlertsFor([short], "seller", TODAY)).toHaveLength(1);
    expect(budgetAlertsFor([short], "maker", TODAY)).toHaveLength(0);
  });

  it("says how much is left against what tomorrow needs", () => {
    const [alert] = budgetAlertsFor([short], "seller", TODAY);
    expect(alert.balance).toBe(100);
    expect(alert.nextDayNeed).toBe(500);
  });
});

describe("renewals", () => {
  it("raises it five days out, with the month's score attached", () => {
    const c = campaign({
      cycle: cycleFromStart("2026-08-25"),   // ends 2026-09-23
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      items: [item({ status: "posted" }), item()],
    });
    const [r] = renewalsDueFor([c], "seller", TODAY);
    expect(r.daysLeft).toBe(4);
    expect(r.postedOfCommitted).toBe("1/2");
  });

  it("stays quiet while there is still a month to run", () => {
    expect(renewalsDueFor([campaign({ cycle: cycleFromStart("2026-09-15") })], "seller", TODAY)).toHaveLength(0);
  });

  it("stops asking once it has been settled either way", () => {
    const ending = campaign({ cycle: cycleFromStart("2026-08-25") });
    expect(renewalsDueFor([{ ...ending, renewal: { state: "won" } }], "seller", TODAY)).toHaveLength(0);
    expect(renewalsDueFor([{ ...ending, renewal: { state: "lost" } }], "seller", TODAY)).toHaveLength(0);
    // "Pitched" is not settled — they have not answered yet, so it stays on the list.
    expect(renewalsDueFor([{ ...ending, renewal: { state: "pitched" } }], "seller", TODAY)).toHaveLength(1);
  });

  it("is the seller's business, not the tech team's", () => {
    expect(renewalsDueFor([campaign({ cycle: cycleFromStart("2026-08-25") })], "maker", TODAY)).toHaveLength(0);
  });
});

describe("everything at once", () => {
  it("reports empty when there is genuinely nothing to say", () => {
    expect(remindersFor([campaign()], "maker", TODAY, NOW).empty).toBe(true);
  });

  it("gathers a person's whole day in one pass", () => {
    const c = campaign({
      cycle: cycleFromStart("2026-08-25"),
      items: [
        item({ uploadDate: "2026-09-18" }),
        item({ approval: { state: "waiting", askedAt: NOW - 5 * DAY, chases: [] } }),
      ],
    });
    const seller = remindersFor([c], "seller", TODAY, NOW);
    expect(seller.empty).toBe(false);
    expect(seller.chases).toHaveLength(1);
    expect(seller.renewals).toHaveLength(1);
    expect(seller.due).toHaveLength(0);   // the seller does not make the posts

    const maker = remindersFor([c], "maker", TODAY, NOW);
    expect(maker.due).toHaveLength(1);
    expect(maker.overdue).toHaveLength(1);
    expect(maker.chases).toHaveLength(0);
  });
});
