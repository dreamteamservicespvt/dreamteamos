import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 2026-10-05 (owner): "when the salesperson renewed the package and deleted that package, the tech side
 * still showed 'Renewed by Govardhan — the next month is set. Next month'". "Renewed" now follows the
 * renewal SALE: withdrawn (deleted, rejected, taken back) → the month before is un-renewed; brought back
 * → renewed again; the tech side tidying the month or its order away while the sale stands → still
 * renewed. Run on the in-memory Firestore (transactions, listeners and deletes behave).
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));
vi.mock("@/services/orderChat", () => ({ ensureSaleOrderChat: vi.fn(async () => undefined), deleteOrderChat: vi.fn(async () => undefined) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const orders = await import("@/services/orders");

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const SOLD_AT = { seconds: 1_759_000_000, nanoseconds: 0, toMillis: () => 1_759_000_000_000 };
const firstSale = { category: "social_media_management", packageKey: "Starter Package", amount: 10000, verificationStatus: "verified" } as any;
const renewalSale = { category: "social_media_management", packageKey: "Starter Package", amount: 10000, verificationStatus: "pending", submittedAt: SOLD_AT, smm: { renewalOf: "m1" } } as any;
const NEXT = orders.orderDocId("lead1", renewalSale, 1);

const base = (id: string, over: Record<string, unknown>) => ({
  id, orderId: id, leadId: "lead1", origin: "sale", clientPhone: "+919800000000", clientPhoneId: "9800000000",
  clientName: "Sri Sai", businessName: "Sri Sai Tiffins", packageKey: "Starter Package", packageLabel: "Starter Package",
  amount: 10000, platforms: ["instagram"], commitments: { ai_ad: 4, poster: 4, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: null, publisher: null, marketer: null, assistants: [] }, soldBy: "gov", soldByName: "Govardhan", watchers: ["gov"],
  status: "active", renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null },
  ...over,
});

function seedRenewed(prevOver: Record<string, unknown> = {}) {
  mem.__seed("smm_campaigns/m1", base("m1", {
    cycle: { startDate: "2026-09-08", endDate: "2026-10-08", month: "2026-09" },
    renewal: { state: "won", at: null, byName: "Govardhan", note: null, nextCampaignId: NEXT },
    ...prevOver,
  }));
  mem.__seed(`smm_campaigns/${NEXT}`, base(NEXT, {
    cycle: { startDate: "2026-10-08", endDate: "2026-11-08", month: "2026-10" }, renewalOf: "m1", monthNumber: 2,
  }));
}
const m1Renewal = () => read("smm_campaigns/m1")?.renewal;
const told = () => sendNotification.mock.calls.map((c) => c[0]).filter((p) => p.type === "smm_renewal_cancelled");

beforeEach(() => {
  mem.__reset();
  smm.__resetRenewalLinkChecksForTests();
  sendNotification.mockClear();
  mem.__seed("users/kiran", { role: "tech_admin", name: "Kiran", isActive: true });
});

describe("the renewal sale is withdrawn", () => {
  it("deleted after its jobs went out: the order is cancelled, the month removed, the month before no longer renewed", async () => {
    seedRenewed();
    mem.__seed(`orders/${NEXT}`, { status: "assigned", leadId: "lead1", businessName: "Sri Sai Tiffins", assignedTo: "arjun", techAdminId: "kiran" });
    await orders.cancelOrderForSale({ leadId: "lead1", item: renewalSale, itemIndex: 1, deletedByName: "Govardhan" });

    expect(read(`smm_campaigns/${NEXT}`)?.status).toBe("removed");
    expect(m1Renewal()).toMatchObject({ state: "none", nextCampaignId: null });
    expect(told().map((p) => p.userId)).toEqual(["kiran"]);
    expect(told()[0].link).toBe("/smm/m1");
  });

  it("deleted before anybody was on it: the month is erased, and the month before is no longer renewed", async () => {
    seedRenewed();
    mem.__seed(`orders/${NEXT}`, { status: "unassigned", leadId: "lead1" });
    await orders.cancelOrderForSale({ leadId: "lead1", item: renewalSale, itemIndex: 1, deletedByName: "Govardhan" });

    expect(read(`smm_campaigns/${NEXT}`)).toBeUndefined();
    expect(m1Renewal()?.nextCampaignId).toBeNull();
  });

  it("puts a month already filed as renewed back on the board, waiting for a decision", async () => {
    seedRenewed({ status: "renewed", cycle: { startDate: "2026-08-08", endDate: "2026-09-08", month: "2026-08" } });
    await smm.setCampaignRemovedForOrders([NEXT], true, { saleWithdrawn: true });
    expect(read("smm_campaigns/m1")).toMatchObject({ status: "active", renewal: { state: "none" } });
  });

  it("renews it again when the sale comes back (re-approved)", async () => {
    seedRenewed();
    await smm.setCampaignRemovedForOrders([NEXT], true, { saleWithdrawn: true });
    await smm.setCampaignRemovedForOrders([NEXT], false);
    expect(m1Renewal()).toMatchObject({ state: "won", nextCampaignId: NEXT, byName: "Govardhan" });
  });

  it("does not undo a renewal recorded again since", async () => {
    seedRenewed();
    await smm.setCampaignRemovedForOrders([NEXT], true, { saleWithdrawn: true });
    mem.__seed("smm_campaigns/m1", { ...read("smm_campaigns/m1"), renewal: { state: "won", nextCampaignId: "o_other", byName: "Govardhan" } });
    await smm.setCampaignRemovedForOrders([NEXT], false);
    expect(m1Renewal()?.nextCampaignId).toBe("o_other");
  });
});

describe("the tech side tidies the renewal month away while its sale stands", () => {
  it("removing its order from the queue keeps the month before renewed", async () => {
    seedRenewed();
    await smm.setCampaignRemovedForOrders([NEXT], true);
    expect(read(`smm_campaigns/${NEXT}`)?.status).toBe("removed");
    expect(m1Renewal()).toMatchObject({ state: "won", nextCampaignId: NEXT });
    expect(told()).toHaveLength(0);
  });

  it("purging it keeps the month before renewed", async () => {
    seedRenewed();
    await smm.deleteCampaignsForOrders([NEXT]);
    expect(read(`smm_campaigns/${NEXT}`)).toBeUndefined();
    expect(m1Renewal()?.state).toBe("won");
  });

  it("deleting the month keeps the month before renewed", async () => {
    seedRenewed();
    await smm.deleteCampaign({ id: NEXT, orderId: NEXT }, { uid: "kiran", name: "Kiran" });
    expect(read(`smm_campaigns/${NEXT}`)?.status).toBe("deleted");
    expect(m1Renewal()?.state).toBe("won");
  });
});

describe("links broken before the fix are repaired on open — only where the sale was withdrawn", () => {
  const heal = () => smm.healRenewalLinksOnOpen([{ ...read("smm_campaigns/m1"), id: "m1" } as any]);

  it("next month removed with its order cancelled (the sale deleted or rejected): repaired", async () => {
    seedRenewed();
    mem.__seed(`smm_campaigns/${NEXT}`, { ...read(`smm_campaigns/${NEXT}`), status: "removed" });
    mem.__seed(`orders/${NEXT}`, { status: "cancelled", saleDeleted: true });
    expect(await heal()).toBe(1);
    expect(m1Renewal()?.state).toBe("none");
    expect(told()).toHaveLength(0); // a repair rings nobody
  });

  it("next month erased and no such sale on the lead (deleted before anybody was on it): repaired", async () => {
    seedRenewed();
    mem.__seed("leads/lead1", { saleItems: [firstSale] });
    await smm.deleteCampaignsForOrders([NEXT]); // erased by hand, as the old code left it
    expect(await heal()).toBe(1);
    expect(m1Renewal()?.nextCampaignId).toBeNull();
  });

  it("next month removed from the queue by the tech side (order tombstoned): left renewed", async () => {
    seedRenewed();
    mem.__seed(`smm_campaigns/${NEXT}`, { ...read(`smm_campaigns/${NEXT}`), status: "removed" });
    mem.__seed(`orders/${NEXT}`, { status: "deleted", deleted: true });
    expect(await heal()).toBe(0);
    expect(m1Renewal()?.state).toBe("won");
  });

  it("next month purged while the sale is still on the lead: left renewed", async () => {
    seedRenewed();
    mem.__seed("leads/lead1", { saleItems: [firstSale, renewalSale] });
    await smm.deleteCampaignsForOrders([NEXT]);
    expect(await heal()).toBe(0);
    expect(m1Renewal()?.state).toBe("won");
  });

  it("checks each link once a session", async () => {
    seedRenewed();
    mem.__seed(`smm_campaigns/${NEXT}`, { ...read(`smm_campaigns/${NEXT}`), status: "removed" });
    mem.__seed(`orders/${NEXT}`, { status: "deleted", deleted: true });
    expect(await heal()).toBe(0);
    mem.__seed(`orders/${NEXT}`, { status: "cancelled" }); // changed after the check
    expect(await heal()).toBe(0);
    smm.__resetRenewalLinkChecksForTests(); // a new session
    expect(await heal()).toBe(1);
  });

  it("a link to a live month is left alone, without a read of its order", async () => {
    mem.__seed("smm_campaigns/m3", base("m3", { cycle: { startDate: "2026-09-01", endDate: "2026-10-01", month: "2026-09" }, renewal: { state: "won", nextCampaignId: "m4" } }));
    mem.__seed("smm_campaigns/m4", base("m4", { cycle: { startDate: "2026-10-01", endDate: "2026-11-01", month: "2026-10" }, renewalOf: "m3" }));
    expect(await smm.healRenewalLinksOnOpen([{ ...read("smm_campaigns/m3"), id: "m3" } as any])).toBe(0);
    expect(read("smm_campaigns/m3")?.renewal?.nextCampaignId).toBe("m4");
  });
});

describe("the Money tab's read", () => {
  it("reads the months ending in a calendar month, without the gone ones", async () => {
    seedRenewed();
    mem.__seed("smm_campaigns/gone", base("gone", { status: "deleted", cycle: { startDate: "2026-09-10", endDate: "2026-10-10", month: "2026-09" } }));
    const list = await smm.fetchMonthsEndingBetween("2026-10-01", "2026-10-31");
    expect(list.map((c) => c.id)).toEqual(["m1"]);
  });
});
