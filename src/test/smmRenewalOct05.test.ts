import { describe, it, expect } from "vitest";
import { leadIdOfOrderId, renewalLinksToCheck, renewalRelinkPatch, renewalUnlinkPatch, isGoneMonth } from "@/utils/smmRenewalLink";
import {
  commissionOn, monthKeyTitle, monthValue, openRenewalsBefore, renewalOutcome, renewalTotals, renewalWhen, renewalsBySeller,
  renewalsInMonth, runningClients, shiftMonthKey,
} from "@/utils/smmRenewalMoney";
import type { SmmCampaign, SmmCycle } from "@/types/smm";

/**
 * 2026-10-05 (owner): (1) deleting a renewal sale left the month before it reading "Renewed by
 * Govardhan — the next month is set"; (3)(4) the salesperson's and the admins' renewal numbers.
 */

const TODAY = "2026-10-05";
const cy = (startDate: string, endDate: string) => ({ startDate, endDate, month: startDate.slice(0, 7) }) as unknown as SmmCycle;

const month = (id: string, patch: Partial<SmmCampaign> = {}): SmmCampaign => ({
  id,
  orderId: id,
  origin: "sale",
  clientPhone: "+919800000000",
  clientPhoneId: `p_${id}`,
  clientName: `Client ${id}`,
  businessName: `Business ${id}`,
  packageKey: "Starter Package",
  packageLabel: "Starter Package",
  amount: 10000,
  cycle: cy("2026-09-08", "2026-10-08"),
  platforms: [],
  commitments: {},
  items: [],
  ads: [],
  budgetPayments: [],
  team: { creator: null, publisher: null, marketer: null, assistants: [] },
  soldBy: "gov",
  soldByName: "Govardhan",
  watchers: ["gov"],
  status: "active",
  renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null },
  ...patch,
}) as unknown as SmmCampaign;

describe("un-renewing when the renewal month goes away", () => {
  const renewed = month("m1", { renewal: { state: "won", byName: "Govardhan", nextCampaignId: "m2" } });

  it("puts the month back to no decision", () => {
    const patch = renewalUnlinkPatch(renewed, "m2");
    expect(patch?.renewal).toEqual({ state: "none", at: null, byName: null, note: null, nextCampaignId: null });
    expect(patch?.status).toBeUndefined();
  });

  it("puts a month already filed as renewed back on the board", () => {
    expect(renewalUnlinkPatch({ ...renewed, status: "renewed" }, "m2")?.status).toBe("active");
    // A history month with nothing after it any more is on hold — back on the board too (2026-10-05),
    // whether it was filed as renewed or as completed when the month after it was added.
    expect(renewalUnlinkPatch({ ...renewed, status: "renewed", history: true }, "m2")?.status).toBe("active");
    expect(renewalUnlinkPatch({ ...renewed, status: "completed", history: true }, "m2")?.status).toBe("active");
    // A month that ran in the app and was never filed keeps its status.
    expect(renewalUnlinkPatch({ ...renewed, status: "lapsed" }, "m2")?.status).toBeUndefined();
  });

  it("leaves a month renewed by a different month alone", () => {
    expect(renewalUnlinkPatch(renewed, "m9")).toBeNull();
    expect(renewalUnlinkPatch(month("m1"), "m2")).toBeNull();
  });

  it("renews it again when the renewal month comes back", () => {
    const unlinked = month("m1", { cycle: cy("2026-08-08", "2026-09-08") });
    const patch = renewalRelinkPatch(unlinked, { id: "m2", soldByName: "Govardhan" }, TODAY);
    expect(patch?.renewal.state).toBe("won");
    expect(patch?.renewal.nextCampaignId).toBe("m2");
    expect(patch?.status).toBe("renewed"); // its last day has passed
  });

  it("never overwrites a link to another month, and never touches a gone month", () => {
    const other = month("m1", { renewal: { state: "won", nextCampaignId: "m3" } });
    expect(renewalRelinkPatch(other, { id: "m2", soldByName: "G" }, TODAY)).toBeNull();
    expect(renewalRelinkPatch(month("m1", { status: "deleted" }), { id: "m2", soldByName: "G" }, TODAY)).toBeNull();
    expect(renewalRelinkPatch(renewed, { id: "m2", soldByName: "G" }, TODAY)).toBeNull(); // already linked
  });

  it("reads the lead out of a sold month's order id", () => {
    expect(leadIdOfOrderId("o_AbC123xyz_1759000000000")).toBe("AbC123xyz");
    expect(leadIdOfOrderId("o_AbC123xyz__2")).toBe("AbC123xyz"); // legacy
    expect(leadIdOfOrderId("Xy7AutoId")).toBe(""); // a month with no sale
  });

  it("checks only links pointing outside the months already held", () => {
    const list = [renewed, month("m3", { renewal: { state: "won", nextCampaignId: "m4" } }), month("m4")];
    const alive = new Set(list.filter((c) => !isGoneMonth(c)).map((c) => c.id));
    expect(renewalLinksToCheck(list, alive)).toEqual([{ monthId: "m1", nextId: "m2" }]);
  });
});

describe("a calendar month's renewals", () => {
  const months = [
    // Due in October:
    month("won", { cycle: cy("2026-09-02", "2026-10-02"), renewal: { state: "won", nextCampaignId: "won2" } }),
    month("won2", { cycle: cy("2026-10-02", "2026-11-02"), amount: 15000, renewalOf: "won" }),
    month("soon", { cycle: cy("2026-09-07", "2026-10-07") }),
    month("ended", { cycle: cy("2026-09-03", "2026-10-03") }),
    month("lost", { cycle: cy("2026-09-20", "2026-10-20"), renewal: { state: "lost" } }),
    month("other", { soldBy: "ravi", soldByName: "Ravi", cycle: cy("2026-09-10", "2026-10-10") }),
    // Not counted:
    month("hist", { history: true, status: "completed", cycle: cy("2026-09-01", "2026-10-01") }),
    month("gone", { status: "removed", cycle: cy("2026-09-01", "2026-10-01") }),
    // Ended in September with no decision:
    month("late", { cycle: cy("2026-08-25", "2026-09-25") }),
  ];

  it("lists the seller's months ending in the month, worst first", () => {
    const rows = renewalsInMonth(months, "2026-10", TODAY, "gov");
    expect(rows.map((r) => r.month.id)).toEqual(["won", "ended", "soon", "lost"]);
    expect(rows.map((r) => r.outcome)).toEqual(["renewed", "waiting", "waiting", "lost"]);
  });

  it("values a renewal at the next month's price, else the month's own", () => {
    const rows = renewalsInMonth(months, "2026-10", TODAY, "gov");
    expect(rows.find((r) => r.month.id === "won")?.value).toBe(15000);
    expect(rows.find((r) => r.month.id === "soon")?.value).toBe(10000);
    // A month with no sale (₹0) is valued at its package's list price.
    expect(monthValue({ amount: 0, packageKey: "Plus Package" })).toBe(15000);
  });

  it("adds the totals up", () => {
    const t = renewalTotals(renewalsInMonth(months, "2026-10", TODAY, "gov"));
    expect(t).toMatchObject({ due: 4, renewed: 1, waiting: 2, lost: 1, renewedValue: 15000, waitingValue: 20000, lostValue: 10000 });
    expect(t.rate).toBe(0.25);
  });

  it("keeps earlier undecided months out of the totals but in the to-do list", () => {
    expect(openRenewalsBefore(months, "2026-10", TODAY, "gov").map((r) => r.month.id)).toEqual(["late"]);
  });

  it("counts running clients once each, from the month covering today", () => {
    const run = runningClients(months, TODAY, "gov");
    expect(run.months.map((c) => c.id).sort()).toEqual(["lost", "soon", "won2"]);
    expect(run.value).toBe(35000);
  });

  it("splits the company by salesperson, best rate first", () => {
    const rows = renewalsBySeller(months, "2026-10", TODAY);
    expect(rows.map((r) => r.sellerName)).toEqual(["Govardhan", "Ravi"]);
    expect(rows[1]).toMatchObject({ due: 1, waiting: 1, running: 1, rate: 0 });
  });

  it("speaks plainly", () => {
    expect(renewalOutcome(month("x", { status: "lapsed" }))).toBe("lost");
    expect(renewalWhen(2)).toBe("Ends in 2 days");
    expect(renewalWhen(0)).toBe("Last day today");
    expect(renewalWhen(-3)).toBe("Ended 3 days ago");
    expect(commissionOn(10000, 5)).toBe(500);
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(monthKeyTitle("2026-10")).toBe("October 2026");
  });
});
