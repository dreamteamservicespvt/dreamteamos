/**
 * A past social-media month and its people (owner, 2026-10-05). On the in-memory Firestore with the
 * REAL services, so the months, links, jobs, chats and notifications really happen:
 *
 *   • a history month keeps the names of who did its work — their seats on every row and `watchers`,
 *     so it is in their Social Media and they may fill it in — but nobody gets a job card or a chat;
 *   • an EARLIER month added after a later one joins the client's run: it points forward, the later
 *     month points back, and the run is numbered on (Month 1 → 2 → 3) — the owner's team lists an old
 *     client's earlier months after the current one is on the board;
 *   • in a history month a post is marked posted without a recorded approval — but only with the day
 *     it went up; a running month keeps the approval rule;
 *   • "Edit setup" on a history month changes its record and people, never gives out jobs, and keeps
 *     its dates in the past;
 *   • the Social Media Team Lead may add a month that had no sale (not record a sale), and a month they
 *     give out puts their tech admin in the client chat.
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
const { canPublish, isoDay } = await import("@/utils/smmPlan");

const DAY = 86_400_000;
const iso = (days: number) => isoDay(new Date(Date.now() + days * DAY));
const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin" };
const RAVI_LEAD = { uid: "ravi", name: "Ravi", role: "tech_member", createdBy: "kiran" };
const ANIL = { uid: "anil", name: "Anil", createdBy: "sadmin" };
const ARJUN = { uid: "arjun", name: "Arjun" };
const DIVYA = { uid: "divya", name: "Divya" };
const TEAM = { creator: ARJUN, publisher: ARJUN, marketer: DIVYA, assistants: [] };
const NOBODY = { creator: null, publisher: null, marketer: null, assistants: [] };

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const jobs = () => mem.__all("work_assignments") as Record<string, any>[];
const notified = (type: string) => sendNotification.mock.calls.map((c) => c[0]).filter((p) => p.type === type);

/** A no-sale month for Javani Spiritual Hub from `start` to `end` days from today (end "" = a month on). */
function month(start: number, team: Record<string, unknown> = TEAM, actor: Record<string, unknown> = KIRAN, end = "") {
  return {
    phone: "98765 43210",
    seller: ANIL,
    packageKey: "Plus Package",
    platforms: ["instagram", "facebook"] as ("instagram" | "facebook")[],
    setup: {
      businessName: "Javani Spiritual Hub",
      commitments: { ai_ad: 2, poster: 2, real_video: 0 },
      startDate: iso(start),
      endDate: end,
      clipsPerVideo: 4,
      pageLinks: {},
      team: team as typeof TEAM,
    },
    actor: actor as typeof KIRAN,
  };
}

/** Days from today to a `yyyy-MM-dd`. */
const daysTo = (day: string) => Math.round((new Date(`${day}T12:00:00`).getTime() - Date.now()) / DAY);

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
  mem.__seed("users/kiran", { name: "Kiran", role: "tech_admin", isActive: true });
  mem.__seed("users/ravi", { name: "Ravi", role: "tech_member", smmLeader: true, createdBy: "kiran", isActive: true });
  mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", createdBy: "kiran", isActive: true });
  mem.__seed("users/divya", { name: "Divya", role: "tech_member", createdBy: "kiran", isActive: true });
});

describe("who may add a month that had no sale", () => {
  it("now includes the Social Media Team Lead — who still may not record a sale", () => {
    expect(pkg.canAddNoSaleMonth({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(pkg.canRecordSmmSaleForSeller({ role: "tech_member", smmLeader: true })).toBe(false);
    expect(pkg.canAddNoSaleMonth({ role: "tech_member" })).toBe(false);
    expect(pkg.canAddNoSaleMonth({ role: "sales_member" })).toBe(false);
    expect(pkg.canAddNoSaleMonth({ role: "tech_admin" })).toBe(true);
  });

  it("a running month the Team Lead adds puts their tech admin in the client chat", async () => {
    const result = await setup.addNoSaleMonth(month(-10, TEAM, RAVI_LEAD));
    expect(result.history).toBe(false);
    const room = read(`order_chats/${result.campaignId}`)!;
    expect(room.participants).toEqual(expect.arrayContaining(["arjun", "divya", "ravi", "kiran", "anil"]));
    expect(jobs().map((j) => j.assignedTo).sort()).toEqual(["arjun", "divya"]);
  });
});

describe("a history month keeps who did its work", () => {
  it("saves the people by name — seats, rows, watchers — with no job card, no chat, no work alert", async () => {
    const result = await setup.addNoSaleMonth(month(-70));
    expect(result).toMatchObject({ history: true, assign: null });
    const c = read(`smm_campaigns/${result.campaignId}`)!;
    expect(c).toMatchObject({ history: true, status: "completed", origin: "no_sale", amount: 0 });
    expect(c.team.creator).toMatchObject({ uid: "arjun" });
    expect(c.team.marketer).toMatchObject({ uid: "divya" });
    // In their Social Media (`watchers`) and on every row, so they can fill in what they made and posted.
    expect(c.watchers).toEqual(expect.arrayContaining(["anil", "arjun", "divya"]));
    expect(c.items.every((i: any) => i.makerUid === "arjun" && i.publisherUid === "arjun")).toBe(true);
    expect(jobs()).toHaveLength(0);
    expect(mem.__all("order_chats")).toHaveLength(0);
    expect(notified("work_assigned")).toHaveLength(0);
  });

  it("still takes a history month with nobody named", async () => {
    const result = await setup.addNoSaleMonth(month(-70, NOBODY));
    const c = read(`smm_campaigns/${result.campaignId}`)!;
    expect(c.team.creator).toBeNull();
    expect(c.watchers).toEqual(["anil"]);
  });

  it("does the same for a recorded sale set up after its dates", async () => {
    const soldMs = Date.now() - 70 * DAY;
    mem.__seed("leads/l1", {
      assignedTo: "anil", assignedBy: "sadmin", phone: "+919876543210", displayName: "Javani Spiritual Hub",
      status: "answered", notes: "", saleDone: true, lastUpdated: 0, createdAt: 0,
      saleItems: [{
        category: "social_media_management", packageKey: "Plus Package", amount: 15000,
        verificationStatus: "verified", submittedAt: mem.Timestamp.fromMillis(soldMs),
        requirement: { businessName: "Javani Spiritual Hub", businessWhatsapp: "+919876543210" },
        smm: { platforms: ["instagram"], commitments: { poster: 2, ai_ad: 2, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 15000, priceMode: "final" },
      }],
    });
    const result = await setup.setupSaleMonth({
      leadId: "l1", itemIndex: 0, actor: KIRAN,
      setup: { startDate: iso(-70), endDate: "", clipsPerVideo: 4, pageLinks: {}, team: TEAM },
    });
    expect(result.history).toBe(true);
    const c = read(`smm_campaigns/${result.campaignId}`)!;
    expect(c.team.creator).toMatchObject({ uid: "arjun" });
    expect(c.watchers).toEqual(expect.arrayContaining(["arjun", "divya"]));
    expect(jobs()).toHaveLength(0);
  });
});

describe("an earlier month added after a later one", () => {
  it("joins the client's run: it points forward, the later month points back, and the run is renumbered", async () => {
    // September (running) and October… the board already has the running month; August is added after.
    const sep = await setup.addNoSaleMonth(month(-20, TEAM));
    const sepCycle = read(`smm_campaigns/${sep.campaignId}`)!.cycle;
    expect(read(`smm_campaigns/${sep.campaignId}`)!.monthNumber).toBe(1);

    // August ends on the day September starts — back to back.
    const augStart = daysTo(pkg.addMonthsIso(sepCycle.startDate, -1));
    const aug = await setup.addNoSaleMonth(month(augStart, TEAM, KIRAN, sepCycle.startDate));
    expect(aug.history).toBe(true);
    const a = read(`smm_campaigns/${aug.campaignId}`)!;
    const s = read(`smm_campaigns/${sep.campaignId}`)!;
    expect(a.monthNumber).toBe(1);
    expect(a.renewal).toMatchObject({ state: "won", nextCampaignId: sep.campaignId });
    expect(s).toMatchObject({ renewalOf: aug.campaignId, monthNumber: 2 });

    // And July in front of August: everything after it moves on one.
    const julStart = daysTo(pkg.addMonthsIso(a.cycle.startDate, -1));
    const jul = await setup.addNoSaleMonth(month(julStart, NOBODY, KIRAN, a.cycle.startDate));
    expect(read(`smm_campaigns/${jul.campaignId}`)!.monthNumber).toBe(1);
    expect(read(`smm_campaigns/${aug.campaignId}`)!).toMatchObject({ monthNumber: 2, renewalOf: jul.campaignId });
    expect(read(`smm_campaigns/${sep.campaignId}`)!.monthNumber).toBe(3);
  });

  it("leaves a month further away alone — a client who came back after a gap starts a run of its own", async () => {
    const sep = await setup.addNoSaleMonth(month(-20, TEAM));
    const old = await setup.addNoSaleMonth(month(-140, NOBODY));
    expect(read(`smm_campaigns/${old.campaignId}`)!.renewal?.nextCampaignId ?? null).toBeNull();
    expect(read(`smm_campaigns/${sep.campaignId}`)!).toMatchObject({ monthNumber: 1 });
    expect(read(`smm_campaigns/${sep.campaignId}`)!.renewalOf ?? null).toBeNull();
  });
});

describe("filling in a history month's work", () => {
  it("marks a post posted without an approval — once it has the day it went up", async () => {
    const { campaignId } = await setup.addNoSaleMonth(month(-70));
    const item = read(`smm_campaigns/${campaignId}`)!.items[0];
    expect(canPublish(item, { history: true })).toBe(true);
    expect(canPublish(item)).toBe(false);

    await expect(smm.setItemStatus(campaignId, item.id, "posted", ARJUN)).rejects.toThrow(/day it went up/);
    await smm.updateItem(campaignId, item.id, { uploadDate: iso(-60), title: "Diwali offer" });
    await smm.setItemStatus(campaignId, item.id, "posted", ARJUN);
    const after = read(`smm_campaigns/${campaignId}`)!.items.find((i: any) => i.id === item.id);
    expect(after).toMatchObject({ status: "posted", uploadDate: iso(-60), publisherUid: "arjun" });
  });

  it("keeps the approval rule on a running month", async () => {
    const { campaignId } = await setup.addNoSaleMonth(month(-10));
    const item = read(`smm_campaigns/${campaignId}`)!.items[0];
    await smm.updateItem(campaignId, item.id, { uploadDate: iso(-2) });
    await expect(smm.setItemStatus(campaignId, item.id, "posted", ARJUN)).rejects.toThrow(/Record their approval first/);
  });
});

describe("Edit setup on a history month", () => {
  it("changes its record and its people — never a job — and keeps its dates in the past", async () => {
    const { campaignId } = await setup.addNoSaleMonth(month(-70, NOBODY));
    const c = read(`smm_campaigns/${campaignId}`)!;
    const base = {
      businessName: "Javani Spiritual Hub (old page)", startDate: c.cycle.startDate, endDate: c.cycle.endDate,
      clipsPerVideo: 4, pageLinks: {}, team: { ...NOBODY, creator: DIVYA, publisher: DIVYA },
    };
    expect(setup.historySetupProblem({ ...base, endDate: iso(2) }, iso(0))).toMatch(/stays in the past/);
    await expect(setup.applyHistorySetup(campaignId, { ...base, endDate: iso(2) }, KIRAN)).rejects.toThrow(/stays in the past/);

    await setup.applyHistorySetup(campaignId, base, KIRAN);
    const after = read(`smm_campaigns/${campaignId}`)!;
    expect(after).toMatchObject({ businessName: "Javani Spiritual Hub (old page)", history: true, status: "completed" });
    expect(after.team.creator).toMatchObject({ uid: "divya" });
    expect(after.watchers).toEqual(expect.arrayContaining(["divya", "anil"]));
    expect(jobs()).toHaveLength(0);
    expect(notified("work_assigned")).toHaveLength(0);
  });
});
