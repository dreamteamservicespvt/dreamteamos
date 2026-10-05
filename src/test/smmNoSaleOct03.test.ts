/**
 * A social-media month that had no sale (2026-10-03) — a client the company was serving before sales
 * were recorded in the app. On the in-memory Firestore with the REAL chat service, so the month, its
 * jobs, its shared room and its notifications really happen:
 *
 *   • a running month: no lead, no order, amount 0 — so no revenue figure or commission can see it;
 *     it is in the salesperson's login (watchers); everyone on it gets ONE job, all in ONE client
 *     chat with the salesperson in it, carrying the month's length and deadline; the salesperson is
 *     told it is not counted;
 *   • dates already over make history: no jobs, no room — on hold on the board while nothing follows it
 *     (2026-10-05; it was filed as finished);
 *   • refused: a month that has not started, no salesperson, dates on a month the client has, dates a
 *     recorded sale covers (even one whose month was deleted), and any month after a recorded sale;
 *   • back-to-back months are not an overlap, and the second is month 2;
 *   • a month's job never adopts the client's next sale waiting in the queue;
 *   • the salesperson's Renew of it is a sale — month 2, the same team given their jobs;
 *   • a month started directly before all this gets job cards now too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const setup = await import("@/services/smmSetup");
const { assignSmmMonth } = await import("@/services/smmAssign");
const pkg = await import("@/utils/smmPackage");
const { isoDay } = await import("@/utils/smmPlan");

const DAY = 86_400_000;
const iso = (days: number) => isoDay(new Date(Date.now() + days * DAY));
const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin" };
const ANIL = { uid: "anil", name: "Anil", createdBy: "sadmin" };
const ARJUN = { uid: "arjun", name: "Arjun" };
const DIVYA = { uid: "divya", name: "Divya" };
const TEAM = { creator: ARJUN, publisher: ARJUN, marketer: DIVYA, assistants: [] };
const NOBODY = { creator: null, publisher: null, marketer: null, assistants: [] };

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const jobs = () => mem.__all("work_assignments") as Record<string, any>[];
const notified = (type: string) => sendNotification.mock.calls.map((c) => c[0]).filter((p) => p.type === type);

/** A no-sale month for Lakshmi Jewellers, starting `start` days from today. */
function month(start: number, over: Record<string, unknown> = {}) {
  return {
    phone: "98765 43210",
    seller: ANIL,
    packageKey: "Starter Package",
    platforms: ["instagram", "facebook"] as ("instagram" | "facebook")[],
    setup: {
      businessName: "Lakshmi Jewellers",
      commitments: { ai_ad: 4, poster: 4, real_video: 0 },
      startDate: iso(start),
      endDate: "",
      clipsPerVideo: 6,
      pageLinks: { instagram: "@lakshmi" },
      team: start < -40 ? NOBODY : TEAM,
    },
    actor: KIRAN,
    ...over,
  };
}

/** A social-media sale Anil recorded in the app `daysAgo` days ago, on lead l1. */
function seedSale(daysAgo: number) {
  const soldMs = Date.now() - daysAgo * DAY;
  mem.__seed("leads/l1", {
    assignedTo: "anil", assignedBy: "sadmin", phone: "+919876543210", displayName: "Lakshmi Jewellers",
    status: "answered", notes: "", saleDone: true, lastUpdated: 0, createdAt: 0,
    saleItems: [{
      category: "social_media_management", packageKey: "Starter Package", amount: 10000,
      verificationStatus: "verified", submittedAt: mem.Timestamp.fromMillis(soldMs),
      requirement: { businessName: "Lakshmi Jewellers", businessWhatsapp: "+919876543210" },
      smm: { platforms: ["instagram"], commitments: { poster: 4, ai_ad: 4, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final" },
    }],
  });
  return `o_l1_${soldMs}`;
}

function seedOrder(id: string, over: Record<string, unknown> = {}) {
  mem.__seed(`orders/${id}`, {
    clientPhone: "+919876543210", clientPhoneId: "919876543210", businessName: "Lakshmi Jewellers",
    clientName: "Lakshmi Jewellers", category: "social_media_management", packageKey: "Starter Package",
    amount: 10000, leadId: "l9", saleItemIndex: 0, saleItemKey: "l9__0", saleSubmittedAtMs: Date.now(),
    soldBy: "anil", soldByName: "Anil", salesAdminId: "sadmin", promise: null, status: "unassigned",
    workAssignmentId: null,
    ...over,
  });
}

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
  mem.__seed("users/kiran", { name: "Kiran", role: "tech_admin", isActive: true });
  mem.__seed("users/lead1", { name: "Sravani", role: "tech_team_leader", createdBy: "kiran", isActive: true });
  mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", createdBy: "kiran", isActive: true });
  mem.__seed("users/divya", { name: "Divya", role: "tech_member", createdBy: "kiran", isActive: true });
});

describe("the rules of a month with no sale", () => {
  it("knows one, and names its salesperson without claiming a sale", () => {
    expect(pkg.isNoSaleMonth({ origin: "no_sale" })).toBe(true);
    expect(pkg.isNoSaleMonth({ origin: "sale" })).toBe(false);
    expect(pkg.sellerLineOf({ origin: "no_sale", soldByName: "Anil" })).toBe("salesperson Anil");
    expect(pkg.sellerLineOf({ origin: "sale", soldByName: "Anil" })).toBe("sold by Anil");
    expect(pkg.sellerLineOf({ origin: undefined, soldByName: "Anil" })).toBe("sold by Anil");
    expect(pkg.sellerLineOf({ origin: "direct", soldByName: "Kiran" })).toBe("added by Kiran");
  });

  it("treats back-to-back months as not overlapping", () => {
    const a = pkg.monthCycle("2026-08-03");
    expect(pkg.cyclesOverlap(a, pkg.monthCycle(a.endDate))).toBe(false);
    expect(pkg.cyclesOverlap(a, pkg.monthCycle("2026-08-20"))).toBe(true);
    expect(pkg.cyclesOverlap(a, pkg.monthCycle("2026-08-05", "2026-08-10"))).toBe(true);
    expect(pkg.cyclesOverlap(a, pkg.monthCycle("2026-07-01", "2026-08-03"))).toBe(false);
  });

  it("is for the tech admin, team leader, main admin and (2026-10-05) the Social Media Team Lead", () => {
    expect(pkg.canAddNoSaleMonth({ role: "tech_admin" })).toBe(true);
    expect(pkg.canAddNoSaleMonth({ role: "tech_team_leader" })).toBe(true);
    expect(pkg.canAddNoSaleMonth({ role: "main_admin" })).toBe(true);
    // The owner, 2026-10-05: the lead lists an old client's earlier months — but still records no sale.
    expect(pkg.canAddNoSaleMonth({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(pkg.canRecordSmmSaleForSeller({ role: "tech_member", smmLeader: true })).toBe(false);
    expect(pkg.canAddNoSaleMonth({ role: "tech_member" })).toBe(false);
    expect(pkg.canAddNoSaleMonth({ role: "sales_member" })).toBe(false);
  });

  it("says why it cannot be added: number, salesperson, a month that has not started", () => {
    const today = "2026-10-03";
    expect(pkg.noSaleMonthProblem({ phone: "98765", sellerUid: "anil", startDate: today }, today)).toMatch(/10-digit/);
    expect(pkg.noSaleMonthProblem({ phone: "+919876543210", sellerUid: "", startDate: today }, today)).toMatch(/salesperson/);
    expect(pkg.noSaleMonthProblem({ phone: "+919876543210", sellerUid: "anil", startDate: "2026-10-04" }, today)).toMatch(/hasn't started/);
    expect(pkg.noSaleMonthProblem({ phone: "+919876543210", sellerUid: "anil", startDate: today }, today)).toBe("");
  });
});

describe("adding a month that had no sale", () => {
  it("is the salesperson's month in nobody's figures, and gives the team one job each in one chat", async () => {
    const result = await setup.addNoSaleMonth(month(-10));
    expect(result.history).toBe(false);
    const id = result.campaignId;

    const c = read(`smm_campaigns/${id}`)!;
    expect(c).toMatchObject({
      origin: "no_sale", orderId: "", leadId: "", saleItemKey: "", amount: 0,
      soldBy: "anil", soldByName: "Anil", salesAdminId: "sadmin", createdBy: "kiran", status: "active",
      businessName: "Lakshmi Jewellers", clientPhone: "+919876543210", clientPhoneId: "919876543210",
      packageKey: "Starter Package", packageLabel: "Starter Package", clipsPerVideo: 6, monthNumber: 1,
      pageLinks: { instagram: "@lakshmi" }, setupByUid: "kiran",
    });
    expect(c.cycle).toEqual(pkg.monthCycle(iso(-10)));
    expect(c.items).toHaveLength(8);
    // In the salesperson's login: their Social Media page reads `watchers`.
    expect(c.watchers).toEqual(expect.arrayContaining(["anil", "arjun", "divya"]));

    // No sale anywhere — nothing on any lead, no order — so no revenue, leaderboard or commission sees it.
    expect(mem.__all("leads")).toHaveLength(0);
    expect(mem.__all("orders")).toHaveLength(0);

    // One job each, in the month's one room, at the month's length and deadline.
    const js = jobs();
    expect(js.map((j) => j.assignedTo).sort()).toEqual(["arjun", "divya"]);
    for (const j of js) {
      expect(j).toMatchObject({ smmCampaignId: id, chatId: id, clipCount: 6, duration: "48s", businessWhatsapp: "+919876543210", category: "social_media_management" });
      expect(j.orderId).toBeUndefined();
      expect(j.promise?.presetKey).toBe("smm_month");
    }
    expect(mem.__all("order_chats")).toHaveLength(1);
    const room = read(`order_chats/${id}`)!;
    expect(room.clientReady).toBe(true);
    expect(room.orderId).toBeUndefined();
    expect(room.soldByUid).toBe("anil");
    expect(room.participants).toEqual(expect.arrayContaining(["arjun", "divya", "kiran", "anil"]));
    expect(room.memberUid).toBe("arjun"); // the maker is who the client talks to

    expect(notified("work_assigned").map((n) => n.userId).sort()).toEqual(["arjun", "divya"]);
    const told = notified("smm_month_setup").filter((n) => n.userId === "anil");
    expect(told).toHaveLength(1);
    expect(told[0].message).toMatch(/not counted in your sales or commission/);
  });

  it("records a month whose dates are over as history — no jobs, no room, on hold until it is renewed", async () => {
    const result = await setup.addNoSaleMonth(month(-70));
    expect(result).toMatchObject({ history: true, assign: null, onHold: true });
    const c = read(`smm_campaigns/${result.campaignId}`)!;
    // Nothing follows it, so it stays on the board on hold (owner, 2026-10-05) — it was filed as finished.
    expect(c).toMatchObject({ origin: "no_sale", amount: 0, history: true, status: "active", setupByUid: "kiran" });
    expect(jobs()).toHaveLength(0);
    expect(mem.__all("order_chats")).toHaveLength(0);
    const told = notified("smm_month_setup");
    expect(told.map((n) => n.userId)).toEqual(["anil"]);
    expect(told[0].message).toMatch(/not counted/);
  });

  it("refuses a month that has not started, and one with no salesperson", async () => {
    await expect(setup.addNoSaleMonth(month(2))).rejects.toThrow(/hasn't started/);
    await expect(setup.addNoSaleMonth(month(-10, { seller: { uid: "", name: "" } }))).rejects.toThrow(/salesperson/);
    expect(mem.__all("smm_campaigns")).toHaveLength(0);
  });

  it("refuses dates on a month the client already has; the month right after it is month 2", async () => {
    const first = await setup.addNoSaleMonth(month(-75));
    const firstCycle = read(`smm_campaigns/${first.campaignId}`)!.cycle;

    await expect(setup.addNoSaleMonth(month(-60))).rejects.toThrow(/already has a month on these dates/);

    const nextStart = Math.round((new Date(`${firstCycle.endDate}T12:00:00`).getTime() - Date.now()) / DAY);
    const second = await setup.addNoSaleMonth(month(nextStart));
    const s = read(`smm_campaigns/${second.campaignId}`)!;
    expect(s.cycle.startDate).toBe(firstCycle.endDate);
    expect(s).toMatchObject({ monthNumber: 2, renewalOf: first.campaignId });
    expect(read(`smm_campaigns/${first.campaignId}`)!.renewal).toMatchObject({ state: "won", nextCampaignId: second.campaignId });
  });

  it("refuses dates a recorded sale covers, even one whose month was deleted — that sale is set up instead", async () => {
    const orderId = seedSale(10);
    seedOrder(orderId, { status: "deleted", deleted: true, leadId: "l1" });
    mem.__seed(`smm_campaigns/${orderId}`, {
      orderId, origin: "sale", clientPhone: "+919876543210", clientPhoneId: "919876543210", businessName: "Lakshmi Jewellers",
      cycle: pkg.monthCycle(iso(-10)), status: "deleted", items: [], soldBy: "anil", soldByName: "Anil", watchers: ["anil"],
    });
    await expect(setup.addNoSaleMonth(month(-5))).rejects.toThrow(/Set up this sale/);
    expect(mem.__all("smm_campaigns")).toHaveLength(1);
  });

  it("refuses any month after a recorded sale — that is the salesperson's renewal — but takes one before it", async () => {
    seedSale(70);
    await expect(setup.addNoSaleMonth(month(-20))).rejects.toThrow(/renewal — Anil records it with Renew/);
    const before = await setup.addNoSaleMonth(month(-140));
    expect(before.history).toBe(true);
  });

  it("never adopts the client's next sale waiting in the queue", async () => {
    seedOrder("o_wait");
    const result = await setup.addNoSaleMonth(month(-10));
    expect(jobs().every((j) => !j.orderId && j.smmCampaignId === result.campaignId)).toBe(true);
    expect(read("orders/o_wait")!.status).toBe("unassigned");
  });
});

describe("after a month with no sale", () => {
  it("the salesperson's Renew is a sale: month 2, from its last day, with the same team given their jobs", async () => {
    const first = await setup.addNoSaleMonth(month(-25));
    const firstCycle = read(`smm_campaigns/${first.campaignId}`)!.cycle;
    seedOrder("o_new");
    mem.__seed("order_chats/o_new", { orderId: "o_new", clientReady: false, participants: ["anil"], status: "open" });

    await smm.ensureCampaignForOrder({
      orderId: "o_new", leadId: "l9", saleItemKey: "l9__0",
      clientPhone: "+919876543210", clientPhoneId: "919876543210", clientName: "Lakshmi Jewellers", businessName: "Lakshmi Jewellers",
      packageKey: "Starter Package", packageLabel: "Starter Package", amount: 10000,
      platforms: ["instagram", "facebook"], commitments: { poster: 4, ai_ad: 4, real_video: 0 },
      soldBy: "anil", soldByName: "Anil", renewalOf: first.campaignId,
    });

    const next = read("smm_campaigns/o_new")!;
    expect(next).toMatchObject({ origin: "sale", amount: 10000, monthNumber: 2, renewalOf: first.campaignId, clipsPerVideo: 6 });
    expect(next.cycle.startDate).toBe(firstCycle.endDate);
    expect(read(`smm_campaigns/${first.campaignId}`)!.renewal).toMatchObject({ state: "won", nextCampaignId: "o_new" });

    const renewalJobs = jobs().filter((j) => j.orderId === "o_new");
    expect(renewalJobs.map((j) => j.assignedTo).sort()).toEqual(["arjun", "divya"]);
    expect(renewalJobs.every((j) => j.assignedBy === "kiran" && j.chatId === "o_new")).toBe(true);
    // Due at the end of the month it runs, not on the sale form's promise of a day.
    expect(read("orders/o_new")!.promise.presetKey).toBe("smm_month");
    expect(renewalJobs.every((j) => j.promise?.presetKey === "smm_month")).toBe(true);
  });

  it("keeps a month's deadline, and an extension, when the sale is approved or edited later", async () => {
    const soldMs = Date.now() - 2 * DAY;
    const item = {
      category: "social_media_management", packageKey: "Starter Package", amount: 10000, verificationStatus: "pending",
      submittedAt: mem.Timestamp.fromMillis(soldMs),
      promise: { presetKey: "smm_1d", label: "1 day", hours: 24, source: "preset", startAt: mem.Timestamp.fromMillis(soldMs), dueAt: mem.Timestamp.fromMillis(soldMs + DAY) },
      requirement: { businessName: "Lakshmi Jewellers", businessWhatsapp: "+919876543210" },
      smm: { platforms: ["instagram"], commitments: { poster: 4, ai_ad: 4, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final" },
    };
    const lead = { id: "l9", assignedTo: "anil", phone: "+919876543210", displayName: "Lakshmi Jewellers", saleItems: [item] };
    const id = `o_l9_${soldMs}`;
    seedOrder(id, { leadId: "l9", status: "assigned", promise: { presetKey: "smm_month", label: "by 3 Nov", hours: 720 } });
    const { upsertOrderForSale } = await import("@/services/orders");
    await upsertOrderForSale({ lead: lead as never, item: item as never, itemIndex: 0, soldByName: "Anil", salesAdminId: "sadmin", saleVerified: true });
    expect(read(`orders/${id}`)!.promise.presetKey).toBe("smm_month");
    expect(read(`orders/${id}`)!.saleVerified).toBe(true);

    // An order whose one extension was used keeps it too.
    mem.__seed(`orders/${id}`, { ...read(`orders/${id}`), promise: { presetKey: "smm_1d", label: "2 days (extended)", hours: 48, extension: { hours: 24, by: "arjun" } } });
    await upsertOrderForSale({ lead: lead as never, item: item as never, itemIndex: 0, soldByName: "Anil", salesAdminId: "sadmin", saleVerified: true });
    expect(read(`orders/${id}`)!.promise.extension).toMatchObject({ hours: 24 });

    // A plain sale promise still follows the sale.
    mem.__seed(`orders/${id}`, { ...read(`orders/${id}`), promise: { presetKey: "old", label: "3 days", hours: 72 } });
    await upsertOrderForSale({ lead: lead as never, item: item as never, itemIndex: 0, soldByName: "Anil", salesAdminId: "sadmin", saleVerified: true });
    expect(read(`orders/${id}`)!.promise.presetKey).toBe("smm_1d");
  });

  it("a month started directly before all this gets job cards too, in one room", async () => {
    mem.__seed("smm_campaigns/c_direct", {
      orderId: "", leadId: "", saleItemKey: "", origin: "direct", createdBy: "kiran", createdByName: "Kiran",
      clientPhone: "+919812345678", clientPhoneId: "919812345678", clientName: "Fresh Bakes", businessName: "Fresh Bakes",
      packageKey: "", packageLabel: "Custom month", amount: 8000, cycle: pkg.monthCycle(iso(-3)),
      platforms: ["instagram"], commitments: { ai_ad: 2, poster: 2, real_video: 0 }, items: [], ads: [], budgetPayments: [],
      team: NOBODY, soldBy: "kiran", soldByName: "Kiran", watchers: ["kiran"], status: "active", renewal: { state: "none" },
    });
    const result = await assignSmmMonth({ campaignId: "c_direct", team: TEAM, assigner: { uid: "kiran", name: "Kiran", role: "tech_admin" } });
    expect(result.created.map((c) => c.uid).sort()).toEqual(["arjun", "divya"]);
    expect(jobs().every((j) => j.smmCampaignId === "c_direct" && j.chatId === "c_direct" && !j.orderId)).toBe(true);
    expect(read("order_chats/c_direct")!.soldByUid).toBeUndefined();
  });
});
