/**
 * Social Media Management, 2026-10-03 — on the in-memory Firestore, so restores, transactions,
 * jobs and notifications really happen:
 *
 *   • an old sale whose order was removed and month deleted is SET UP again: its own order comes back,
 *     no second sale appears on the salesperson's lead, and the jobs carry the month's video length;
 *   • a purged order is rebuilt from the sale without ringing the "new order" bell;
 *   • dates already over make history: no jobs, order filed as delivered;
 *   • assigning is idempotent: no duplicate cards, an untouched card is withdrawn, a started one kept;
 *   • a renewal sale continues the month before it, with the same team given their jobs straight away;
 *   • months close once their dates are over and somebody decided; unposted pieces move forward;
 *   • a number another salesperson holds is refused, naming them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));
vi.mock("@/services/orderChat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/orderChat")>()),
  ensureSaleOrderChat: vi.fn(async () => undefined),
  attachAssignmentToChat: vi.fn(async () => undefined),
  createOrderChat: vi.fn(async () => undefined),
  detachAssignmentFromChat: vi.fn(async () => undefined),
  deleteOrderChat: vi.fn(async () => undefined),
}));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const setup = await import("@/services/smmSetup");
const { monthCycle } = await import("@/utils/smmPackage");
const { blankItem, isoDay } = await import("@/utils/smmPlan");
import type { SmmCampaign } from "@/types/smm";

const DAY = 86_400_000;
const iso = (days: number) => isoDay(new Date(Date.now() + days * DAY));
const SOLD_MS = Date.now() - 10 * DAY;
const ORDER_ID = `o_l1_${SOLD_MS}`;
const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin" };
const ARJUN = { uid: "arjun", name: "Arjun" };
const DIVYA = { uid: "divya", name: "Divya" };
const TEAM = { creator: ARJUN, publisher: ARJUN, marketer: DIVYA, assistants: [] };

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const jobs = () => mem.__all("work_assignments") as Record<string, any>[];
const notified = (type: string) => sendNotification.mock.calls.map((c) => c[0]).filter((p) => p.type === type);

function seedPeople() {
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
  mem.__seed("users/kiran", { name: "Kiran", role: "tech_admin", isActive: true });
  mem.__seed("users/lead1", { name: "Sravani", role: "tech_team_leader", createdBy: "kiran", isActive: true });
  mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", createdBy: "kiran", isActive: true });
  mem.__seed("users/divya", { name: "Divya", role: "tech_member", createdBy: "kiran", isActive: true });
}

function seedSale() {
  mem.__seed("leads/l1", {
    assignedTo: "anil", assignedBy: "sadmin", phone: "+919876543210", displayName: "Sri Sai Silks",
    status: "answered", notes: "", saleDone: true, lastUpdated: 0, createdAt: 0,
    saleItems: [{
      category: "social_media_management", packageKey: "Starter Package", amount: 10000,
      verificationStatus: "verified", submittedAt: mem.Timestamp.fromMillis(SOLD_MS),
      requirement: { businessName: "Sri Sai Silks", businessWhatsapp: "+919876543210" },
      smm: {
        platforms: ["instagram", "facebook"], commitments: { poster: 4, ai_ad: 4, real_video: 0 },
        addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final", clipsPerVideo: 6,
      },
    }],
  });
}

function seedOrder(over: Record<string, unknown> = {}, id = ORDER_ID) {
  mem.__seed(`orders/${id}`, {
    clientPhone: "+919876543210", clientPhoneId: "919876543210", businessName: "Sri Sai Silks",
    clientName: "Sri Sai Silks", category: "social_media_management", packageKey: "Starter Package",
    amount: 10000, leadId: "l1", saleItemIndex: 0, saleItemKey: "l1__0", saleSubmittedAtMs: SOLD_MS,
    soldBy: "anil", soldByName: "Anil", salesAdminId: "sadmin", promise: null, status: "unassigned",
    progress: {
      kind: "smm", targets: { ads: 4, posters: 4, posted: 8, stories: 0, campaigns: 4 },
      done: { ads: 0, posters: 0, posted: 0, stories: 0, campaigns: 0 },
      tracks: {}, completedTracks: [], log: [],
    },
    workAssignmentId: null,
    ...over,
  });
}

function campaignDoc(over: Partial<SmmCampaign> & { id: string }): SmmCampaign {
  return {
    orderId: "", leadId: "l1", saleItemKey: "l1__0", origin: "sale",
    clientPhone: "+919876543210", clientPhoneId: "919876543210", clientName: "Sri Sai Silks", businessName: "Sri Sai Silks",
    packageKey: "Starter Package", packageLabel: "Starter Package", amount: 10000,
    cycle: monthCycle(iso(-5)), platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 },
    items: [], ads: [], budgetPayments: [], team: { creator: null, publisher: null, marketer: null, assistants: [] },
    soldBy: "anil", soldByName: "Anil", watchers: ["anil"], status: "active", renewal: { state: "none" },
    ...over,
  } as SmmCampaign;
}

const SETUP = { startDate: iso(-10), endDate: "", clipsPerVideo: 6, pageLinks: { instagram: "@srisaisilks" }, team: TEAM };

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  seedPeople();
});

describe("setting up a sale that is already on a salesperson's lead", () => {
  it("brings back its own removed order and replaces its deleted month — never a second sale", async () => {
    seedSale();
    seedOrder({ status: "deleted", deleted: true });
    mem.__seed(`smm_campaigns/${ORDER_ID}`, { ...campaignDoc({ id: ORDER_ID, orderId: ORDER_ID }), status: "deleted", items: [blankItem("poster", ["instagram"])] });

    const result = await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN });
    expect(result).toMatchObject({ campaignId: ORDER_ID, history: false });

    const order = read(`orders/${ORDER_ID}`)!;
    expect(order.deleted).toBe(false);
    expect(order.status).toBe("assigned");
    expect(order.promise.presetKey).toBe("smm_month");

    const month = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(month.status).toBe("active");
    expect(month.cycle.startDate).toBe(iso(-10));
    expect(month.clipsPerVideo).toBe(6);
    expect(month.items).toHaveLength(8); // a fresh plan: 4 posters + 4 videos
    expect(month.team.creator.uid).toBe("arjun");
    expect(month.pageLinks).toEqual({ instagram: "@srisaisilks" });
    expect(month.setupByName).toBe("Kiran");

    // One card per person, at the month's length, linked to the month.
    const all = jobs();
    expect(all).toHaveLength(2);
    const arjun = all.find((j) => j.assignedTo === "arjun")!;
    expect(arjun.tracks).toEqual(["ad_creation", "social_upload"]);
    expect(arjun.clipCount).toBe(6);
    expect(arjun.duration).toBe("48s");
    expect(arjun.smmCampaignId).toBe(ORDER_ID);
    expect(arjun.orderId).toBe(ORDER_ID);

    // The salesperson's sale is untouched: still one sale, so still one commission.
    expect((read("leads/l1")!.saleItems as unknown[]).length).toBe(1);
    expect(notified("smm_month_setup").map((n) => n.userId)).toEqual(["anil"]);
  });

  it("rebuilds a purged order from the sale without announcing it as a new order", async () => {
    seedSale();
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN });
    expect(read(`orders/${ORDER_ID}`)!.status).toBe("assigned");
    expect(read(`smm_campaigns/${ORDER_ID}`)!.status).toBe("active");
    expect(sendNotification.mock.calls.some((c) => String(c[0].type).startsWith("order_new"))).toBe(false);
  });

  it("records a month whose dates are over as history — no jobs, order filed as delivered", async () => {
    seedSale();
    seedOrder({ status: "deleted", deleted: true });
    const result = await setup.setupSaleMonth({
      leadId: "l1", itemIndex: 0, actor: KIRAN,
      setup: { ...SETUP, startDate: iso(-90), endDate: iso(-60), team: { creator: null, publisher: null, marketer: null, assistants: [] } },
    });
    expect(result.history).toBe(true);
    const month = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(month.history).toBe(true);
    // The client's only month: on hold on the board until it is renewed (owner, 2026-10-05).
    expect(month.status).toBe("active");
    expect(result.onHold).toBe(true);
    expect(read(`orders/${ORDER_ID}`)!.status).toBe("verified");
    expect(jobs()).toHaveLength(0);
  });

  it("refuses a sale the sales admin rejected", async () => {
    seedSale();
    const lead = read("leads/l1")!;
    mem.__seed("leads/l1", { ...lead, saleItems: [{ ...lead.saleItems[0], verificationStatus: "rejected" }] });
    await expect(setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN })).rejects.toThrow(/rejected/i);
  });
});

describe("assigning is one path, and idempotent", () => {
  it("never duplicates a card, withdraws an untouched one, keeps a started one", async () => {
    seedSale();
    seedOrder();
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN });
    expect(jobs()).toHaveLength(2);
    // A month is worked from its own page, not My Work (2026-10-04): the alert opens the month.
    expect(notified("work_assigned").map((n) => n.link)).toEqual([`/smm/${ORDER_ID}`, `/smm/${ORDER_ID}`]);

    // The same setup again: nothing new.
    await setup.applyMonthSetup(ORDER_ID, SETUP, KIRAN);
    expect(jobs()).toHaveLength(2);

    // Everything to Divya: Arjun's card was never opened, so it is taken back and he is told.
    await setup.applyMonthSetup(ORDER_ID, { ...SETUP, team: { creator: DIVYA, publisher: DIVYA, marketer: DIVYA, assistants: [] } }, KIRAN);
    expect(jobs().map((j) => j.assignedTo)).toEqual(["divya"]);
    expect(jobs()[0].tracks).toEqual(["ad_creation", "social_upload", "digital_marketing"]);
    expect(notified("work_unassigned").map((n) => n.userId)).toEqual(["arjun"]);
    expect(notified("work_unassigned")[0].link).toBe("/smm");

    // Divya has started; moving the month back to Arjun keeps her card for a person to decide.
    const divyaJob = jobs()[0];
    mem.__seed(`work_assignments/${divyaJob.id}`, { ...divyaJob, status: "in_progress", sessions: [{ openedAt: "x", durationSeconds: 60 }], totalDurationSeconds: 60 });
    await setup.applyMonthSetup(ORDER_ID, SETUP, KIRAN);
    expect(jobs().map((j) => j.assignedTo).sort()).toEqual(["arjun", "divya"]);
    expect(read(`orders/${ORDER_ID}`)!.assignedTo).toBe("arjun");
  });

  it("follows a change of video length on the open jobs", async () => {
    seedSale();
    seedOrder();
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN });
    await setup.applyMonthSetup(ORDER_ID, { ...SETUP, clipsPerVideo: 4 }, KIRAN);
    expect(jobs().every((j) => j.clipCount === 4 && j.duration === "32s")).toBe(true);
  });
});

describe("a renewal continues the month before it", () => {
  it("starts on the old end date, carries the team and video length, and gives the same people their jobs", async () => {
    const prev = campaignDoc({
      id: "o_prev", orderId: "o_prev", cycle: monthCycle(iso(-28)), clipsPerVideo: 6,
      team: { creator: ARJUN, publisher: ARJUN, marketer: DIVYA, assistants: [] },
      setupByUid: "kiran", setupByName: "Kiran", pageLinks: { instagram: "@srisaisilks" },
    });
    mem.__seed("smm_campaigns/o_prev", prev as unknown as Record<string, unknown>);
    seedOrder({ leadId: "l1", saleItemKey: "l1__1", packageKey: "Plus Package", amount: 15000 }, "o_new");

    await smm.ensureCampaignForOrder({
      orderId: "o_new", leadId: "l1", saleItemKey: "l1__1",
      clientPhone: "+919876543210", clientPhoneId: "919876543210", clientName: "Sri Sai Silks", businessName: "Sri Sai Silks",
      packageKey: "Plus Package", packageLabel: "Plus Package", amount: 15000,
      platforms: ["instagram", "facebook", "youtube"], commitments: { poster: 6, ai_ad: 6, real_video: 0 },
      soldBy: "anil", soldByName: "Anil", renewalOf: "o_prev",
    });

    const next = read("smm_campaigns/o_new")!;
    expect(next.renewalOf).toBe("o_prev");
    expect(next.monthNumber).toBe(2);
    expect(next.cycle.startDate).toBe(prev.cycle.endDate);
    expect(next.clipsPerVideo).toBe(6);
    expect(next.pageLinks).toEqual({ instagram: "@srisaisilks" });
    expect(next.team.creator.uid).toBe("arjun");
    expect(next.items).toHaveLength(12);

    const old = read("smm_campaigns/o_prev")!;
    expect(old.renewal.state).toBe("won");
    expect(old.renewal.nextCampaignId).toBe("o_new");
    expect(old.status).toBe("active"); // its own last day has not passed — it still owes its posts

    const newJobs = jobs().filter((j) => j.orderId === "o_new");
    expect(newJobs.map((j) => j.assignedTo).sort()).toEqual(["arjun", "divya"]);
    expect(newJobs.every((j) => j.clipCount === 6 && j.assignedBy === "kiran")).toBe(true);
    expect(notified("smm_renewed").map((n) => n.userId).sort()).toEqual(["kiran", "lead1"]);
  });
});

describe("closing months and carrying work forward", () => {
  it("files ended months that have a decision, and leaves an undecided one in front of people", async () => {
    const ended = monthCycle(iso(-40));
    const won = campaignDoc({ id: "c_won", cycle: ended, renewal: { state: "won", nextCampaignId: "c_next" } });
    const lost = campaignDoc({ id: "c_lost", cycle: ended, renewal: { state: "lost" } });
    const open = campaignDoc({ id: "c_open", cycle: ended });
    for (const c of [won, lost, open]) mem.__seed(`smm_campaigns/${c.id}`, c as unknown as Record<string, unknown>);

    await smm.closeEndedMonthsOnOpen([won, lost, open], isoDay(new Date()));
    expect(read("smm_campaigns/c_won")!.status).toBe("renewed");
    expect(read("smm_campaigns/c_lost")!.status).toBe("lapsed");
    expect(read("smm_campaigns/c_open")!.status).toBe("active");
  });

  it("marks an ended month that is not renewing as lapsed straight away", async () => {
    mem.__seed("smm_campaigns/c1", campaignDoc({ id: "c1", cycle: monthCycle(iso(-40)) }) as unknown as Record<string, unknown>);
    await smm.setRenewal("c1", "lost", KIRAN);
    expect(read("smm_campaigns/c1")!.status).toBe("lapsed");
  });

  it("moves unposted pieces into the next month, where they are still owed", async () => {
    const p1 = { ...blankItem("poster", ["instagram"]), id: "p1", status: "posted" };
    const p2 = { ...blankItem("poster", ["instagram"]), id: "p2", title: "Diwali offer" };
    const p3 = { ...blankItem("ai_ad", ["instagram"]), id: "p3" };
    mem.__seed("smm_campaigns/prev", campaignDoc({ id: "prev", cycle: monthCycle(iso(-40)), commitments: { poster: 2, ai_ad: 1, real_video: 0 }, items: [p1, p2, p3] as never }) as unknown as Record<string, unknown>);
    mem.__seed("smm_campaigns/next", campaignDoc({ id: "next", commitments: { poster: 2, ai_ad: 0, real_video: 0 }, items: [blankItem("poster", ["instagram"]), blankItem("poster", ["instagram"])] }) as unknown as Record<string, unknown>);

    const moved = await smm.moveUnpostedToMonth("prev", "next", ["p1", "p2", "p3"], KIRAN);
    expect(moved).toBe(2); // the posted one stays where it was posted
    const prev = read("smm_campaigns/prev")!;
    const next = read("smm_campaigns/next")!;
    expect(prev.items.map((i: { id: string }) => i.id)).toEqual(["p1"]);
    expect(prev.carriedOut.map((c: { itemId: string }) => c.itemId)).toEqual(["p2", "p3"]);
    expect(prev.commitments).toEqual({ poster: 2, ai_ad: 1, real_video: 0 }); // what it owed is not rewritten
    expect(next.items).toHaveLength(4);
    expect(next.commitments).toEqual({ poster: 3, ai_ad: 1, real_video: 0 });
    expect(next.items.find((i: { id: string }) => i.id === "p2").carriedFrom.campaignId).toBe("prev");
  });
});

describe("renaming a month", () => {
  it("renames the month and its jobs, and a later edit of the sale does not undo it", async () => {
    seedSale();
    seedOrder();
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN });

    expect(await setup.renameMonth(ORDER_ID, "  Sri Sai Silks   Official ")).toBe(true);
    const month = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(month.businessName).toBe("Sri Sai Silks Official");
    expect(month.businessNameEdited).toBe(true);
    expect(jobs().every((j) => j.businessName === "Sri Sai Silks Official")).toBe(true);
    expect(await setup.renameMonth(ORDER_ID, "Sri Sai Silks Official")).toBe(false); // nothing to change
    await expect(setup.renameMonth(ORDER_ID, "   ")).rejects.toThrow(/name/i);

    // The salesperson edits the sale; the month keeps the tech side's name, the price still follows.
    await smm.ensureCampaignForOrder({
      orderId: ORDER_ID, leadId: "l1", saleItemKey: "l1__0", clientPhone: "+919876543210", clientPhoneId: "919876543210",
      clientName: "Sri Sai Silks", businessName: "Sri Sai Silks", packageKey: "Starter Package", packageLabel: "Starter Package",
      amount: 9500, platforms: ["instagram"], commitments: { poster: 4, ai_ad: 4, real_video: 0 }, soldBy: "anil", soldByName: "Anil",
    });
    expect(read(`smm_campaigns/${ORDER_ID}`)!.businessName).toBe("Sri Sai Silks Official");
    expect(read(`smm_campaigns/${ORDER_ID}`)!.amount).toBe(9500);
  });

  it("takes the name typed at setup", async () => {
    seedSale();
    seedOrder({ status: "deleted", deleted: true });
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: { ...SETUP, businessName: "SSS Instagram" }, actor: KIRAN });
    const month = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(month.businessName).toBe("SSS Instagram");
    expect(month.businessNameEdited).toBe(true);
    expect(jobs().every((j) => j.businessName === "SSS Instagram")).toBe(true);
  });
});

describe("changing what a month owes", () => {
  it("adds rows for more, and removes only untouched rows for fewer", async () => {
    const worked = { ...blankItem("ai_ad", ["instagram"]), id: "w1", title: "Founder story" };
    const blank = [1, 2, 3].map((n) => ({ ...blankItem("ai_ad", ["instagram"]), id: `b${n}` }));
    mem.__seed("smm_campaigns/c1", campaignDoc({
      id: "c1", commitments: { poster: 0, ai_ad: 4, real_video: 0 }, items: [worked, ...blank] as never,
      team: { creator: ARJUN, publisher: null, marketer: null, assistants: [] },
    }) as unknown as Record<string, unknown>);

    await smm.setMonthCommitments("c1", { poster: 2, ai_ad: 6, real_video: 0 });
    let c = read("smm_campaigns/c1")!;
    expect(c.commitments).toEqual({ poster: 2, ai_ad: 6, real_video: 0 });
    expect(c.items.filter((i: { kind: string }) => i.kind === "ai_ad")).toHaveLength(6);
    expect(c.items.filter((i: { kind: string }) => i.kind === "poster")).toHaveLength(2);
    expect(c.items.find((i: { kind: string }) => i.kind === "poster").makerUid).toBe("arjun");

    // Down to one video: the worked row stays, blank rows go.
    await smm.setMonthCommitments("c1", { poster: 2, ai_ad: 1, real_video: 0 });
    c = read("smm_campaigns/c1")!;
    const videos = c.items.filter((i: { kind: string }) => i.kind === "ai_ad");
    expect(videos.map((i: { id: string }) => i.id)).toEqual(["w1"]);
    expect(c.commitments.ai_ad).toBe(1);
  });

  it("is set from the setup form, for a month set up again and for one already running", async () => {
    seedSale();
    seedOrder({ status: "deleted", deleted: true });
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, actor: KIRAN, setup: { ...SETUP, commitments: { ai_ad: 6, poster: 2, real_video: 0 } } });
    let c = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(c.commitments).toEqual({ poster: 2, ai_ad: 6, real_video: 0 });
    expect(c.items).toHaveLength(8);

    await setup.applyMonthSetup(ORDER_ID, { ...SETUP, commitments: { ai_ad: 8, poster: 8, real_video: 1 } }, KIRAN);
    c = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(c.commitments).toEqual({ poster: 8, ai_ad: 8, real_video: 1 });
    expect(c.items).toHaveLength(17);
    // The order's counters follow the plan.
    expect(read(`orders/${ORDER_ID}`)!.progress.targets.ads).toBe(9);
  });

  it("refuses a month that owes nothing", () => {
    expect(setup.setupProblem({ ...SETUP, startDate: iso(0), commitments: { ai_ad: 0, poster: 0, real_video: 0 } }, iso(0)))
      .toMatch(/at least one/);
  });
});

describe("undoing a delete", () => {
  it("brings a sold month back from its tombstone with its plan intact", async () => {
    seedSale();
    seedOrder();
    await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: SETUP, actor: KIRAN });
    const before = (await smm.fetchCampaign(ORDER_ID))!;
    await smm.deleteCampaign(before, KIRAN);
    expect(read(`smm_campaigns/${ORDER_ID}`)!.status).toBe("deleted");

    await smm.undoDeleteCampaign(before);
    const back = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(back.status).toBe("active");
    expect(back.deletedAt).toBeNull();
    expect(back.items).toHaveLength(8);
    expect(back.team.creator.uid).toBe("arjun");
  });

  it("writes an erased direct month back whole", async () => {
    const direct = campaignDoc({ id: "d1", orderId: "", origin: "direct", items: [blankItem("poster", ["instagram"])] });
    mem.__seed("smm_campaigns/d1", direct as unknown as Record<string, unknown>);
    const before = (await smm.fetchCampaign("d1"))!;
    await smm.deleteCampaign(before, KIRAN);
    expect(read("smm_campaigns/d1")).toBeUndefined();
    await smm.undoDeleteCampaign(before);
    expect(read("smm_campaigns/d1")!.items).toHaveLength(1);
    expect(read("smm_campaigns/d1")!.status).toBe("active");
  });
});

describe("finding what a number already has, and whose it is", () => {
  it("lists the sale with where its month stands", async () => {
    seedSale();
    seedOrder({ status: "deleted", deleted: true });
    const records = await setup.findSmmSalesForPhone("98765 43210");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ leadId: "l1", itemIndex: 0, sellerName: "Anil", orderId: ORDER_ID, state: "removed" });
    expect(setup.canSetUpSale(records[0].state)).toBe(true);
  });

  it("refuses a number another salesperson is holding, and names them", async () => {
    seedSale();
    mem.__seed("numberLocks/919876543210", {
      phone: "+919876543210", ownerId: "anil", ownerName: "Anil", ownerLeadId: "l1",
      claimedAt: mem.Timestamp.now(), reserveExpiresAt: mem.Timestamp.fromMillis(Date.now() + DAY),
      saleFrozen: false, saleFrozenUntil: null, saleById: null, saleByName: null, timeline: [],
    });
    const other = await setup.leadForSeller({ seller: { uid: "ravi", name: "Ravi" }, phone: "9876543210", displayName: "X", actor: KIRAN });
    expect(other.ok).toBe(false);
    expect("message" in other && other.message).toMatch(/Anil/);

    const own = await setup.leadForSeller({ seller: { uid: "anil", name: "Anil" }, phone: "9876543210", displayName: "X", actor: KIRAN });
    expect("lead" in own && own.lead.id).toBe("l1");
  });
});
