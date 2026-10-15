/**
 * "The SALE FORM asks when the month starts" (owner, 2026-10-15) — where every month's first day comes from,
 * on the in-memory Firestore with the REAL services, the clock on 15 Oct 2026:
 *
 *   • the sale carries "Month starts on" (`SmmSaleSpec.startDate`): a renewal opens on the old month's END DATE
 *     — always, even recorded late — and may not start before it; a new client opens on the sale day;
 *   • the month is made on it; a sale without one: a renewal on the old end date (never "today"), a first
 *     month on the day it was sold;
 *   • "Create next renewal" starts on the old end date even when made late, never earlier;
 *   • the tech side rebuilding a purged sale's order to set it up does not make the month first (no renewal
 *     side effects before the setup's dates);
 *   • a gone sale's period, for the no-sale clash check, is its "Month starts on".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));
vi.mock("@/services/orderChat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/orderChat")>()),
  ensureSaleOrderChat: vi.fn(async () => undefined),
  attachAssignmentToChat: vi.fn(async () => undefined),
  createOrderChat: vi.fn(async () => undefined),
  joinMonthRoom: vi.fn(async () => undefined),
}));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const setup = await import("@/services/smmSetup");
const orders = await import("@/services/orders");
const { saleMonthStartCheck, saleMonthStartDefault } = await import("@/utils/smmMonthDates");
const { renewalPrefillOf, monthCycle } = await import("@/utils/smmPackage");
import type { SmmCampaign } from "@/types/smm";
import type { SaleDetail } from "@/types";

const TODAY = "2026-10-15";
const PHONE_ID = "919876543210";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored documents are read loosely
const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;

/** A month already on the board (the one being renewed). */
function seedMonth(id: string, start: string, end: string, over: Partial<SmmCampaign> = {}) {
  mem.__seed(`smm_campaigns/${id}`, {
    orderId: id, leadId: "l1", saleItemKey: "l1__0", origin: "sale", clientPhone: "+919876543210", clientPhoneId: PHONE_ID,
    clientName: "Dhana lakshmi", businessName: "Dhana lakshmi", packageKey: "Plus Package", packageLabel: "Plus Package",
    amount: 10000, cycle: { month: start.slice(0, 7), startDate: start, endDate: end }, platforms: ["instagram"],
    commitments: { poster: 2, ai_ad: 0, real_video: 0 }, items: [], ads: [], budgetPayments: [],
    team: { creator: null, publisher: null, marketer: null, assistants: [] }, soldBy: "anil", soldByName: "Anil",
    watchers: ["anil"], status: "active", renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null },
    clipsPerVideo: 4, pageLinks: null, renewalOf: null, monthNumber: 1, ...over,
  });
}

/** The campaign input a sale opens, as `afterOrderWrite` builds it. */
function inputFor(orderId: string, smmSpec: Partial<NonNullable<SaleDetail["smm"]>>, soldMs = new Date(`${TODAY}T09:00:00`).getTime()) {
  return smm.campaignInputFromSale({
    order: { id: orderId, leadId: "l1", saleItemKey: "l1__1", clientPhone: "+919876543210", clientPhoneId: PHONE_ID, clientName: "Dhana lakshmi", businessName: "Dhana lakshmi", soldBy: "anil" },
    item: {
      category: "social_media_management", packageKey: "Plus Package", amount: 10000, verificationStatus: "pending",
      submittedAt: mem.Timestamp.fromMillis(soldMs),
      smm: { platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final", ...smmSpec },
    } as unknown as SaleDetail,
    soldByName: "Anil",
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  mem.__reset();
  sendNotification.mockClear();
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
});
afterEach(() => { vi.useRealTimers(); });

describe("the sale form's \"Month starts on\"", () => {
  it("opens a renewal on the old month's end date — always — and a new client on the sale day", () => {
    expect(saleMonthStartDefault({ previousEnd: "2026-10-06", saleDay: TODAY })).toBe("2026-10-06");
    expect(saleMonthStartDefault({ previousEnd: null, saleDay: TODAY })).toBe(TODAY);
    // Pressed Renew nine days after the month ended: still the old end date, the same value that is saved.
    const prefill = renewalPrefillOf({ id: "sep", businessName: "Dhana lakshmi", clientName: "", packageKey: "Plus Package", platforms: [], cycle: monthCycle("2026-09-06") } as unknown as SmmCampaign, TODAY);
    expect(prefill).toMatchObject({ nextStart: "2026-10-06", previousEnd: "2026-10-06", monthLabel: "September 2026" });
  });

  it("refuses a renewal starting before the old month ended, and says a later one in days", () => {
    expect(saleMonthStartCheck("2026-10-01", "2026-10-06").problem)
      .toBe("The last month runs until 5 Oct — the next month can't start before 6 Oct.");
    expect(saleMonthStartCheck("2026-10-06", "2026-10-06")).toEqual({ problem: "", note: "Straight after the last month — it ended 6 Oct." });
    expect(saleMonthStartCheck("2026-10-09", "2026-10-06")).toEqual({ problem: "", note: "3 days after the last month ended (6 Oct)." });
    expect(saleMonthStartCheck("2026-10-07", "2026-10-06").note).toBe("1 day after the last month ended (6 Oct).");
    expect(saleMonthStartCheck("", null).problem).toBe("Pick the day the month starts.");
    expect(saleMonthStartCheck("2026-09-01", null)).toEqual({ problem: "", note: "" });
  });

  it("carries the start into the month's input; a sale without one carries its sale day", () => {
    expect(inputFor("o1", { startDate: "2026-10-20" })).toMatchObject({ startDate: "2026-10-20", soldOn: TODAY });
    const legacy = inputFor("o1", {}, new Date("2026-10-03T09:00:00").getTime());
    expect(legacy.startDate).toBeUndefined();
    expect(legacy.soldOn).toBe("2026-10-03");
  });
});

describe("where the month is made", () => {
  it("a new client: on the sale's start; a sale without one: on the day it was sold", async () => {
    await smm.ensureCampaignForOrder(inputFor("o_new", { startDate: "2026-10-20" }));
    expect(read("smm_campaigns/o_new")!.cycle).toMatchObject({ startDate: "2026-10-20", endDate: "2026-11-20" });
    await smm.ensureCampaignForOrder(inputFor("o_old", {}, new Date("2026-10-03T09:00:00").getTime()));
    expect(read("smm_campaigns/o_old")!.cycle.startDate).toBe("2026-10-03");
  });

  it("a renewal recorded late with no start: on the old end date, never today", async () => {
    seedMonth("sep", "2026-09-06", "2026-10-06");
    await smm.ensureCampaignForOrder(inputFor("o_ren", { renewalOf: "sep" }));
    const next = read("smm_campaigns/o_ren")!;
    expect(next.cycle).toMatchObject({ startDate: "2026-10-06", endDate: "2026-11-06" });
    expect(next).toMatchObject({ renewalOf: "sep", monthNumber: 2 });
  });

  it("a renewal never starts before the month it renews has ended; a later start is kept", async () => {
    seedMonth("sep", "2026-09-06", "2026-10-06");
    await smm.ensureCampaignForOrder(inputFor("o_early", { renewalOf: "sep", startDate: "2026-10-01" }));
    expect(read("smm_campaigns/o_early")!.cycle.startDate).toBe("2026-10-06");
    mem.__reset();
    seedMonth("sep", "2026-09-06", "2026-10-06");
    await smm.ensureCampaignForOrder(inputFor("o_gap", { renewalOf: "sep", startDate: "2026-10-09" }));
    expect(read("smm_campaigns/o_gap")!.cycle).toMatchObject({ startDate: "2026-10-09", endDate: "2026-11-09" });
  });

  it("\"Create next renewal\" made late starts on the old end date; an earlier start is refused", async () => {
    seedMonth("sep", "2026-09-06", "2026-10-06");
    await expect(smm.createRenewalMonth({ previousCampaignId: "sep", actor: { uid: "kiran", name: "Kiran" }, startDate: "2026-10-01" }))
      .rejects.toThrow(/can't start before 6 Oct/);
    const { newCampaignId } = await smm.createRenewalMonth({ previousCampaignId: "sep", actor: { uid: "kiran", name: "Kiran" } });
    expect(read(`smm_campaigns/${newCampaignId}`)!.cycle).toMatchObject({ startDate: "2026-10-06", endDate: "2026-11-06" });
  });

  it("rebuilding a purged sale's order for its setup makes no month first (create: false)", async () => {
    await smm.ensureCampaignForOrder(inputFor("o_x", { renewalOf: "sep" }), { create: false });
    expect(read("smm_campaigns/o_x")).toBeUndefined();
    const lead = {
      id: "l2", assignedTo: "anil", phone: "+919876543210", displayName: "Dhana lakshmi",
      saleItems: [{
        category: "social_media_management", packageKey: "Plus Package", amount: 10000, verificationStatus: "verified",
        submittedAt: mem.Timestamp.fromMillis(new Date("2026-10-06T09:00:00").getTime()),
        smm: { platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final", renewalOf: "sep" },
      }],
    };
    mem.__seed("leads/l2", lead);
    await orders.upsertOrderForSale({ lead: lead as never, item: lead.saleItems[0] as never, itemIndex: 0, soldByName: "Anil", announce: false });
    expect(mem.__all("orders")).toHaveLength(1);
    expect(mem.__all("smm_campaigns")).toHaveLength(0);
    expect(sendNotification.mock.calls.map((c) => c[0].type)).not.toContain("smm_renewed");
  });
});

describe("a gone sale's period for the no-sale clash", () => {
  it("is its \"Month starts on\", not the day it was typed", async () => {
    const soldMs = new Date("2026-08-20T09:00:00").getTime();
    mem.__seed("leads/l3", {
      assignedTo: "anil", phone: "+919876543210", displayName: "Dhana lakshmi",
      saleItems: [{
        category: "social_media_management", packageKey: "Plus Package", amount: 10000, verificationStatus: "verified",
        submittedAt: mem.Timestamp.fromMillis(soldMs),
        smm: { platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final", startDate: "2026-09-06" },
      }],
    });
    // Sold on 20 Aug for a month starting 6 Sep: a no-sale month 1 Aug → 1 Sep does not clash with it…
    const before = await setup.noSaleMonthClashOf("+919876543210", monthCycle("2026-08-01"));
    expect(before.message).not.toMatch(/recorded a sale for these dates/);
    // …one on 10 Sep → 10 Oct does.
    expect((await setup.noSaleMonthClashOf("+919876543210", monthCycle("2026-09-10"))).message).toMatch(/recorded a sale for these dates \(6 Sep → 6 Oct 2026\)/);
  });
});
