/**
 * "On hold" and the month the board could not show (owner, 2026-10-05). On the in-memory Firestore with
 * the REAL services, so the months, links, transactions and the one-time record really happen:
 *
 *   • the owner's AIRAVATH: "Add a month that had no sale" said "already has a month on these dates (25 Aug
 *     → 4 Oct 2026)" while the board showed no such month — a history month was filed under Finished the
 *     moment it was added. The refusal now names the month it clashes with (`SmmMonthClashError.monthId`);
 *   • "if the social is not renewal then keep it as hold": a month whose last day has passed with no renewal
 *     decision is on hold — a history month too, when nothing follows it — and stays on the board until it
 *     is renewed (filed as renewed) or the client is not renewing (filed as not renewed);
 *   • a history month that a later month of the client follows — back to back or after a gap — is filed;
 *   • history months filed before this are put back on hold once, for the whole company.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const setup = await import("@/services/smmSetup");
const pkg = await import("@/utils/smmPackage");
const { isoDay } = await import("@/utils/smmPlan");
const { monthGlance } = await import("@/utils/smmGlance");
import type { SmmCampaign } from "@/types/smm";

const DAY = 86_400_000;
const TODAY = isoDay(new Date());
const iso = (days: number) => isoDay(new Date(Date.now() + days * DAY));
const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin" };
const ANIL = { uid: "anil", name: "Anil", createdBy: "sadmin" };
const NOBODY = { creator: null, publisher: null, marketer: null, assistants: [] };
const ARJUN = { uid: "arjun", name: "Arjun" };

const read = (path: string) => mem.__read(path) as Record<string, unknown> | undefined;
const asMonth = (id: string) => ({ ...read(`smm_campaigns/${id}`), id }) as SmmCampaign;

/** A no-sale month for AIRAVATH from `start` days from today, to `end` days ("" = a month on). */
function noSale(start: number, end: number | "" = "", team: Record<string, unknown> = NOBODY) {
  return {
    phone: "98765 43210",
    seller: ANIL,
    packageKey: "Starter Package",
    platforms: ["instagram"] as "instagram"[],
    setup: {
      businessName: "AIRAVATH",
      commitments: { ai_ad: 4, poster: 4, real_video: 0 },
      startDate: iso(start),
      endDate: end === "" ? "" : iso(end),
      clipsPerVideo: 4,
      pageLinks: {},
      team: team as typeof NOBODY,
    },
    actor: KIRAN,
  };
}

/** A month document written straight into the store — for the sweep and the one-time record. */
function seedMonth(over: Partial<SmmCampaign> & { id: string }): SmmCampaign {
  const c = {
    orderId: "", leadId: "", saleItemKey: "", origin: "no_sale",
    clientPhone: "+919876543210", clientPhoneId: "919876543210", clientName: "AIRAVATH", businessName: "AIRAVATH",
    packageKey: "Starter Package", packageLabel: "Starter Package", amount: 0,
    cycle: pkg.monthCycle(iso(-70)), platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 },
    items: [], ads: [], budgetPayments: [], team: NOBODY,
    soldBy: "anil", soldByName: "Anil", watchers: ["anil"], status: "active", renewal: { state: "none" },
    ...over,
  } as SmmCampaign;
  mem.__seed(`smm_campaigns/${c.id}`, c as unknown as Record<string, unknown>);
  return c;
}

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  smm.__resetHistoryHoldCheckForTests();
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
  mem.__seed("users/kiran", { name: "Kiran", role: "tech_admin", isActive: true });
  mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", createdBy: "kiran", isActive: true });
});

describe("the rules of On hold", () => {
  const ended = { month: "2026-08", startDate: "2026-08-25", endDate: "2026-10-04" };
  const base = { status: "active" as const, cycle: ended, renewal: { state: "none" as const } };

  it("is a month past its last day with no renewal decision", () => {
    expect(pkg.isOnHold(base, "2026-10-05")).toBe(true);
    expect(pkg.isOnHold(base, "2026-10-04")).toBe(false); // its last day — still running
    expect(pkg.isOnHold({ ...base, renewal: { state: "pitched" } }, "2026-10-05")).toBe(true); // a pitch is no decision
    expect(pkg.isOnHold({ ...base, renewal: { state: "won", nextCampaignId: "n" } }, "2026-10-05")).toBe(false);
    expect(pkg.isOnHold({ ...base, renewal: { state: "lost" } }, "2026-10-05")).toBe(false);
    expect(pkg.isOnHold({ ...base, status: "completed" }, "2026-10-05")).toBe(false);
  });

  it("files a history month by what follows it", () => {
    expect(pkg.historyFiling(null, false)).toBe("active");
    expect(pkg.historyFiling(null, true)).toBe("completed");
    expect(pkg.historyFiling({ state: "won", nextCampaignId: "n" }, false)).toBe("completed");
    expect(pkg.historyFiling({ state: "lost" }, false)).toBe("lapsed");
  });

  it("offers Renew on a history month on hold, and files it once decided", () => {
    const held = { ...base, history: true } as unknown as SmmCampaign;
    expect(pkg.renewalDue(held, "2026-10-05")).toBe(true);
    expect(pkg.closingStatus(held, "2026-10-05")).toBeNull();
    expect(pkg.closingStatus({ ...held, renewal: { state: "won", nextCampaignId: "n" } }, "2026-10-05")).toBe("renewed");
    expect(pkg.closingStatus({ ...held, renewal: { state: "lost" } }, "2026-10-05")).toBe("lapsed");
    // A filed history month is not due — and a history month never counts down before it ends.
    expect(pkg.renewalDue({ ...held, status: "completed" } as SmmCampaign, "2026-10-05")).toBe(false);
    expect(pkg.renewalDue(held, "2026-10-02")).toBe(false);
  });

  it("finds the history months on hold that a later month of the same client follows", () => {
    const m = (id: string, start: string, over: Partial<SmmCampaign> = {}) => ({
      id, clientPhoneId: "91", status: "active", history: true, renewal: { state: "none" },
      cycle: pkg.monthCycle(start), ...over,
    }) as SmmCampaign;
    const june = m("june", "2026-06-01");
    const aug = m("aug", "2026-08-25");
    const other = m("other", "2026-09-01", { clientPhoneId: "92" });
    const gone = m("gone", "2026-09-10", { status: "deleted" });
    expect(pkg.historyMonthsFollowed([june, aug, other], "2026-10-05").map((c) => c.id)).toEqual(["june"]);
    expect(pkg.historyMonthsFollowed([june, gone], "2026-10-05")).toEqual([]);
  });
});

describe("the owner's AIRAVATH — a month the board could not show", () => {
  it("is on hold on the board, not filed away, when it is the client's only month", async () => {
    const result = await setup.addNoSaleMonth(noSale(-41, -1)); // 25 Aug → 4 Oct, added on 5 Oct
    expect(result).toMatchObject({ history: true, onHold: true });
    const c = asMonth(result.campaignId);
    expect(c).toMatchObject({ history: true, status: "active", origin: "no_sale" });
    expect(pkg.isOnHold(c, TODAY)).toBe(true);
    expect(monthGlance(c, TODAY)).toMatchObject({ status: "on_hold", label: "On hold" });
    expect(monthGlance(c, TODAY).reason).toMatch(/not renewed yet$/);
    // Its salesperson is told it waits for their Renew.
    const told = sendNotification.mock.calls.map((x) => x[0]).find((n) => n.type === "smm_month_setup")!;
    expect(told.message).toMatch(/on hold until you renew it/);
  });

  it("refuses an overlapping month — and names the month, to open it instead of hunting for it", async () => {
    const first = await setup.addNoSaleMonth(noSale(-41, -1));
    const again = setup.addNoSaleMonth(noSale(-42, -11)); // 24 Aug → 24 Sep
    await expect(again).rejects.toBeInstanceOf(setup.SmmMonthClashError);
    await expect(again).rejects.toMatchObject({ monthId: first.campaignId });
    await expect(again).rejects.toThrow(/already has a month on these dates/);
    await expect(again).rejects.toThrow(/Edit setup/);
    // The string form the form's checks use says the same.
    const { message, monthId } = await setup.noSaleMonthClashOf("98765 43210", pkg.monthCycle(iso(-42), iso(-11)));
    expect(monthId).toBe(first.campaignId);
    expect(await setup.noSaleMonthClash("98765 43210", pkg.monthCycle(iso(-42), iso(-11)))).toBe(message);
  });

  it("is reached through the same query the board's lookup now runs", async () => {
    const first = await setup.addNoSaleMonth(noSale(-41, -1));
    const months = await smm.fetchClientMonths("919876543210");
    expect(months.map((m) => m.id)).toEqual([first.campaignId]);
    // No sale is behind it — the sales list alone used to say the number was empty.
    expect(await setup.findSmmSalesForPhone("98765 43210")).toEqual([]);
  });
});

describe("a history month and what follows it", () => {
  it("is filed when the client's later month already exists — after a gap too", async () => {
    const later = await setup.addNoSaleMonth(noSale(-20, "", { ...NOBODY, creator: ARJUN }));
    const old = await setup.addNoSaleMonth(noSale(-140)); // months before, with a gap
    expect(asMonth(old.campaignId).status).toBe("completed");
    expect(old.onHold).toBe(false);
    expect(asMonth(later.campaignId).status).toBe("active");
  });

  it("leaves hold when the client's next month is added — renewed back to back, filed after a gap", async () => {
    const june = await setup.addNoSaleMonth(noSale(-130));
    expect(asMonth(june.campaignId).status).toBe("active");
    // August, after a gap: June is filed — the client's run went on.
    const aug = await setup.addNoSaleMonth(noSale(-70));
    expect(asMonth(june.campaignId).status).toBe("completed");
    expect(asMonth(aug.campaignId).status).toBe("active");
    // September, straight after August: August is renewed and points forward.
    const augEnd = asMonth(aug.campaignId).cycle.endDate;
    const daysTo = Math.round((new Date(`${augEnd}T12:00:00`).getTime() - Date.now()) / DAY);
    const sep = await setup.addNoSaleMonth(noSale(daysTo, "", { ...NOBODY, creator: ARJUN }));
    expect(asMonth(aug.campaignId)).toMatchObject({ status: "renewed", renewal: { state: "won", nextCampaignId: sep.campaignId } });
  });

  it("an earlier month added in front of one on hold is filed; the later one stays on hold", async () => {
    const aug = await setup.addNoSaleMonth(noSale(-50));
    const augStart = asMonth(aug.campaignId).cycle.startDate;
    const julStart = pkg.addMonthsIso(augStart, -1);
    const daysTo = Math.round((new Date(`${julStart}T12:00:00`).getTime() - Date.now()) / DAY);
    const jul = await setup.addNoSaleMonth({ ...noSale(daysTo), setup: { ...noSale(daysTo).setup, endDate: augStart } });
    expect(asMonth(jul.campaignId)).toMatchObject({ status: "completed", renewal: { nextCampaignId: aug.campaignId } });
    expect(asMonth(aug.campaignId)).toMatchObject({ status: "active", renewalOf: jul.campaignId, monthNumber: 2 });
    expect(pkg.isOnHold(asMonth(aug.campaignId), TODAY)).toBe(true);
  });

  it("goes to Finished as not renewed when the salesperson says the client is not renewing", async () => {
    const { campaignId } = await setup.addNoSaleMonth(noSale(-60));
    await smm.setRenewal(campaignId, "lost", { uid: "anil", name: "Anil" });
    expect(asMonth(campaignId).status).toBe("lapsed");
  });

  it("comes back on hold when the month after it goes away with its sale", async () => {
    seedMonth({ id: "h1", history: true, status: "completed", renewal: { state: "won", nextCampaignId: "gone1" } });
    await smm.unlinkRenewal("h1", "gone1", { notify: false });
    expect(asMonth("h1")).toMatchObject({ status: "active", renewal: { state: "none", nextCampaignId: null } });
  });
});

describe("the board's sweep", () => {
  it("files a history month on hold once a later month of the client is on the board, and a decided one", async () => {
    const held = seedMonth({ id: "held", history: true, cycle: pkg.monthCycle(iso(-70)) });
    const later = seedMonth({ id: "later", cycle: pkg.monthCycle(iso(-5)), origin: "sale" });
    const won = seedMonth({ id: "won", clientPhoneId: "911", history: true, renewal: { state: "won", nextCampaignId: "x" } });
    const alone = seedMonth({ id: "alone", clientPhoneId: "912", history: true });
    await smm.closeEndedMonthsOnOpen([held, later, won, alone], TODAY);
    expect(asMonth("held").status).toBe("completed");
    expect(asMonth("won").status).toBe("renewed");
    expect(asMonth("alone").status).toBe("active"); // still on hold — nothing decided, nothing after it
    expect(asMonth("later").status).toBe("active");
  });

  it("leaves a month that ran in the app on hold — its renewal is the salesperson's to decide", async () => {
    const ran = seedMonth({ id: "ran", origin: "sale", cycle: pkg.monthCycle(iso(-70)) });
    const later = seedMonth({ id: "later", origin: "sale", cycle: pkg.monthCycle(iso(-5)) });
    await smm.closeEndedMonthsOnOpen([ran, later], TODAY);
    expect(asMonth("ran").status).toBe("active");
  });
});

describe("history months filed before On hold existed", () => {
  it("are put back on hold once — unless the client's run went on after them", async () => {
    seedMonth({ id: "air", history: true, status: "completed" });                       // alone → on hold
    seedMonth({ id: "jun", clientPhoneId: "911", history: true, status: "completed", cycle: pkg.monthCycle(iso(-130)) });
    seedMonth({ id: "sep", clientPhoneId: "911", status: "active", cycle: pkg.monthCycle(iso(-5)) }); // jun is followed
    seedMonth({ id: "lost", clientPhoneId: "913", history: true, status: "completed", renewal: { state: "lost" } });
    seedMonth({ id: "linked", clientPhoneId: "914", history: true, status: "completed", renewal: { state: "won", nextCampaignId: "z" } });

    expect(await smm.holdUnrenewedHistoryOnOpen({ uid: "kiran", name: "Kiran" })).toBe(1);
    expect(asMonth("air").status).toBe("active");
    expect(asMonth("jun").status).toBe("completed");
    expect(asMonth("lost").status).toBe("completed");
    expect(asMonth("linked").status).toBe("completed");
    expect(read("app_settings/smm_history_hold")).toMatchObject({ checked: 2, moved: 1, byUid: "kiran" });

    // Once for the company: the record stops it, in this session and the next.
    seedMonth({ id: "air2", clientPhoneId: "915", history: true, status: "completed" });
    expect(await smm.holdUnrenewedHistoryOnOpen({ uid: "kiran", name: "Kiran" })).toBe(0);
    smm.__resetHistoryHoldCheckForTests();
    expect(await smm.holdUnrenewedHistoryOnOpen({ uid: "kiran", name: "Kiran" })).toBe(0);
    expect(asMonth("air2").status).toBe("completed");
  });
});
