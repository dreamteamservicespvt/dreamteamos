/**
 * One checked way to change a month's dates, and what hangs off a month's dates (2026-10-15) — on the
 * in-memory Firestore with the REAL services, the clock on 15 Oct 2026.
 *
 *   • the owner's Dhana lakshmi month: posts dated 13 Aug – 9 Sep were silently moved with the month to
 *     6 Oct → 6 Nov through Edit setup. Every path that changes a month's dates now passes ONE check
 *     (utils/smmMonthDates.monthDatesCheck via services/smm.assertMonthDates): no overlap with the client's
 *     other months (back-to-back is fine), no post left outside the new dates without the person confirming
 *     it piece by piece, a locked month only within the past — first setup included;
 *   • Add SMM sale on a sale whose month exists goes through it too, and filing that month as history takes
 *     back its untouched jobs (started ones kept, and said);
 *   • a month's deadline keeps an extension already used; the extension box opens on 3 days for a month;
 *   • a month's jobs carry the month's deadline (with or without an order) and are dated on its first day;
 *   • the run links forward only; pieces moved forward lose their old dates (kept in their notes) and show as
 *     "moved", not "not live"; a post dated in another month of the client moves there; Months to check.
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
  detachAssignmentFromChat: vi.fn(async () => undefined),
  deleteOrderChat: vi.fn(async () => undefined),
  joinMonthRoom: vi.fn(async () => undefined),
}));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const setup = await import("@/services/smmSetup");
const assign = await import("@/services/smmAssign");
const { monthDatesCheck, monthsToCheck, continuesInto, moveTargetFor, moveTargetLabel, isUntouchedRow } = await import("@/utils/smmMonthDates");
const { keepUsedExtension, defaultExtensionHours, extendPromise, promiseDueMs } = await import("@/utils/promiseSla");
const { toneCounts } = await import("@/utils/smmPackage");
const { monthGlance } = await import("@/utils/smmGlance");
const { blankItem } = await import("@/utils/smmPlan");
const { useAuthStore } = await import("@/store/authStore");
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const TODAY = "2026-10-15";
const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin" };
const ARJUN = { uid: "arjun", name: "Arjun" };
const TEAM = { creator: ARJUN, publisher: ARJUN, marketer: null, assistants: [] };
const PHONE_ID = "919876543210";

/* eslint-disable @typescript-eslint/no-explicit-any -- stored documents are read loosely, as in the other memory-store tests */
const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const jobs = () => mem.__all("work_assignments") as Record<string, any>[];
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A post, dated `day`, posted or not. */
function post(id: string, title: string, day: string | null, posted = true, over: Partial<SmmContentItem> = {}): SmmContentItem {
  return {
    ...blankItem("poster", ["instagram"]),
    id, title, uploadDate: day, uploadTime: "10:00",
    status: posted ? "posted" : "planned",
    approval: { state: posted ? "approved" : "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
    ...over,
  };
}

/** A month on the board, written straight to the store. */
function seedMonth(id: string, start: string, end: string, items: SmmContentItem[], over: Partial<SmmCampaign> = {}) {
  mem.__seed(`smm_campaigns/${id}`, {
    orderId: "", leadId: "", saleItemKey: "", origin: "no_sale", clientPhone: "+919876543210", clientPhoneId: PHONE_ID,
    clientName: "Dhana lakshmi", businessName: "Dhana lakshmi", packageKey: "Plus Package", packageLabel: "Plus Package",
    amount: 0, cycle: { month: start.slice(0, 7), startDate: start, endDate: end }, platforms: ["instagram"],
    commitments: { poster: items.filter((i) => !i.extra).length, ai_ad: 0, real_video: 0 }, items, ads: [], budgetPayments: [],
    team: TEAM, soldBy: "anil", soldByName: "Anil", salesAdminId: "sadmin", watchers: ["anil", "arjun"], status: "active",
    renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null }, clipsPerVideo: 4, pageLinks: null,
    renewalOf: null, monthNumber: 1, setupAt: mem.Timestamp.now(), setupByName: "Kiran", setupByUid: "kiran",
    ...over,
  });
}

/** The owner's month as it was found: saved 6 Oct → 6 Nov, posts dated 13 Aug – 9 Sep and Dussehra on 9 Oct. */
const DHANA_POSTS = [
  post("p1", "Gold offer", "2026-08-13"),
  post("p2", "Silver week", "2026-08-20"),
  post("p3", "Bridal set", "2026-09-02"),
  post("p4", "Temple jewellery", "2026-09-09"),
  post("p5", "Dussehra offers", "2026-10-09"),
];

const setupOf = (start: string, end = "", over: Record<string, unknown> = {}) => ({
  businessName: "Dhana lakshmi", startDate: start, endDate: end, clipsPerVideo: 4, pageLinks: {}, team: TEAM, ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  mem.__reset();
  sendNotification.mockClear();
  useAuthStore.setState({ user: null } as never);
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
  mem.__seed("users/kiran", { name: "Kiran", role: "tech_admin", isActive: true });
  mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", createdBy: "kiran", isActive: true });
});
afterEach(() => { vi.useRealTimers(); useAuthStore.setState({ user: null } as never); });

/* ── The pure check ──────────────────────────────────────────────────────────────────────────── */

describe("monthDatesCheck — the one check on a change of a month's dates", () => {
  const month = {
    id: "m", status: "active" as const, history: false,
    cycle: { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" }, items: DHANA_POSTS,
  };

  it("lists every post outside the new dates, marks the ones that were inside before, and needs them confirmed by id", () => {
    const v = monthDatesCheck({ month, next: { startDate: "2026-09-06", endDate: "2026-10-06" }, others: [], today: TODAY });
    expect(v.changed).toBe(true);
    expect(v.outside.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p5"]); // 9 Sep is inside 6 Sep – 5 Oct
    expect(v.outside.find((p) => p.id === "p5")).toMatchObject({ wasInside: true, posted: true, day: "2026-10-09" });
    expect(v.outside.find((p) => p.id === "p1")).toMatchObject({ wasInside: false });
    expect(v.problem).toMatch(/^These 4 posts will be outside the month's dates \(6 Sep – 5 Oct\): Gold offer \(13 Aug\).*Keep the new dates anyway\?$/);
    // Confirmed — but only for the pieces the screen showed; a piece outside since is asked about again.
    expect(monthDatesCheck({ month, next: { startDate: "2026-09-06", endDate: "2026-10-06" }, others: [], today: TODAY, confirmedOutside: ["p1", "p2", "p3", "p5"] }).problem).toBe("");
    expect(monthDatesCheck({ month, next: { startDate: "2026-09-06", endDate: "2026-10-06" }, others: [], today: TODAY, confirmedOutside: ["p1", "p2", "p3"] }).unconfirmed.map((p) => p.id)).toEqual(["p5"]);
  });

  it("asks nothing when the dates do not change", () => {
    expect(monthDatesCheck({ month, next: month.cycle, others: [], today: TODAY })).toMatchObject({ changed: false, problem: "" });
  });

  it("refuses an overlap with the client's other month, naming it — back-to-back months do not overlap", () => {
    const other = { id: "oct", status: "active" as const, monthNumber: 2, cycle: { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" } };
    const bare = { ...month, id: "sep", items: [] };
    const overlapping = monthDatesCheck({ month: bare, next: { startDate: "2026-09-08", endDate: "2026-10-08" }, others: [other], today: TODAY });
    expect(overlapping.overlap).toMatchObject({ id: "oct" });
    expect(overlapping.problem).toMatch(/overlap the client's Month 2 · October 2026 \(6 Oct → 6 Nov 2026\)/);
    // Ends on the day the other starts: its renewal day IS that month's first day — no shared day.
    expect(monthDatesCheck({ month: bare, next: { startDate: "2026-09-06", endDate: "2026-10-06" }, others: [other], today: TODAY }).problem).toBe("");
    // Gone months never clash.
    expect(monthDatesCheck({ month: bare, next: { startDate: "2026-09-08", endDate: "2026-10-08" }, others: [{ ...other, status: "deleted" as const }], today: TODAY }).problem).toBe("");
  });

  it("keeps a locked month in the past — on its first setup too", () => {
    const locked = { ...month, items: [], history: true, cycle: { month: "2026-08", startDate: "2026-08-06", endDate: "2026-09-06" } };
    expect(monthDatesCheck({ month: locked, next: { startDate: "2026-10-06", endDate: "2026-11-06" }, others: [], today: TODAY }))
      .toMatchObject({ locked: true, problem: expect.stringMatching(/locked to preserve its history/) });
    expect(monthDatesCheck({ month: locked, next: { startDate: "2026-08-10", endDate: "2026-09-10" }, others: [], today: TODAY }).problem).toBe("");
  });

  it("refuses dates that do not make a month", () => {
    expect(monthDatesCheck({ month: null, next: { startDate: "", endDate: "" }, others: [], today: TODAY }).problem).toMatch(/Pick the day/);
    expect(monthDatesCheck({ month: null, next: { startDate: "2026-10-06", endDate: "2026-10-01" }, others: [], today: TODAY }).problem).toMatch(/end after it starts/);
  });
});

/* ── The services: every path through it ─────────────────────────────────────────────────────── */

describe("Edit setup — the root cause of the Dhana lakshmi month", () => {
  it("refuses to move a month away from its posts without asking, and saves once every listed post is confirmed", async () => {
    // The day of the damage: 1 Oct, the month 6 Sep → 6 Oct running with its posts (dated a month early but one).
    vi.setSystemTime(new Date("2026-10-01T10:00:00"));
    seedMonth("dl", "2026-09-06", "2026-10-06", DHANA_POSTS.slice(0, 4), { businessName: "Old name" });
    const err = await setup.applyMonthSetup("dl", setupOf("2026-10-06"), KIRAN).catch((e) => e);
    expect(err).toBeInstanceOf(smm.SmmMonthDatesError);
    expect(err.verdict.unconfirmed.map((p: { id: string }) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(err.verdict.unconfirmed.find((p: { id: string }) => p.id === "p4").wasInside).toBe(true);
    // Nothing was written: not the dates, not the name, no jobs.
    expect(read("smm_campaigns/dl")).toMatchObject({ businessName: "Old name", cycle: { startDate: "2026-09-06" } });
    expect(jobs()).toHaveLength(0);
    // Confirmed piece by piece: saved.
    await setup.applyMonthSetup("dl", { ...setupOf("2026-10-06"), confirmedOutside: ["p1", "p2", "p3", "p4"] }, KIRAN);
    expect(read("smm_campaigns/dl")!.cycle).toMatchObject({ startDate: "2026-10-06", endDate: "2026-11-06" });
  });

  it("never sets an ended month up live — on its first setup too (no setupAt)", async () => {
    seedMonth("old", "2026-08-10", "2026-09-10", [], { setupAt: null });
    await expect(setup.applyMonthSetup("old", setupOf("2026-10-06"), KIRAN)).rejects.toThrow(/locked to preserve its history/);
    expect(read("smm_campaigns/old")!.cycle.startDate).toBe("2026-08-10");
  });

  it("repairs the month as found (6 Oct → 6 Nov) back to 6 Sep → 6 Oct once its posts left outside are confirmed", async () => {
    seedMonth("dl", "2026-10-06", "2026-11-06", DHANA_POSTS);
    const err = await setup.applyMonthSetup("dl", setupOf("2026-09-06"), KIRAN).catch((e) => e);
    expect(err).toBeInstanceOf(smm.SmmMonthDatesError);
    const ids = err.verdict.outside.map((p: { id: string }) => p.id);
    expect(ids).toEqual(["p1", "p2", "p3", "p5"]);
    await setup.applyMonthSetup("dl", { ...setupOf("2026-09-06"), confirmedOutside: ids }, KIRAN);
    expect(read("smm_campaigns/dl")!.cycle).toMatchObject({ startDate: "2026-09-06", endDate: "2026-10-06" });
  });

  it("refuses dates that overlap the client's other month, naming it", async () => {
    seedMonth("sep", "2026-09-06", "2026-10-06", []);
    seedMonth("oct", "2026-10-06", "2026-11-06", [], { monthNumber: 2 });
    await expect(setup.applyMonthSetup("oct", setupOf("2026-10-01"), KIRAN))
      .rejects.toThrow(/overlap the client's Month 1 · September 2026 \(6 Sep → 6 Oct 2026\)/);
    expect(read("smm_campaigns/oct")!.cycle.startDate).toBe("2026-10-06");
  });

  it("Manage historical record goes through the same check", async () => {
    seedMonth("aug", "2026-08-06", "2026-09-06", [post("a1", "Old post", "2026-08-20")], { history: true });
    seedMonth("sep", "2026-09-06", "2026-10-06", []);
    await expect(setup.applyHistorySetup("aug", setupOf("2026-08-20"), KIRAN)).rejects.toThrow(/overlap the client's Month 1 · September 2026/);
    const err = await setup.applyHistorySetup("aug", setupOf("2026-07-01", "2026-08-01"), KIRAN).catch((e) => e);
    expect(err).toBeInstanceOf(smm.SmmMonthDatesError);
    expect(err.verdict.unconfirmed.map((p: { id: string }) => p.id)).toEqual(["a1"]);
  });

  it("saveMonthSetup itself refuses — inside its transaction, against the month as stored", async () => {
    seedMonth("dl", "2026-10-06", "2026-11-06", DHANA_POSTS);
    await expect(smm.saveMonthSetup("dl", {
      cycle: { month: "2026-11", startDate: "2026-11-06", endDate: "2026-12-06" }, clipsPerVideo: 4, pageLinks: null,
      setupByName: "Kiran", setupByUid: "kiran",
    })).rejects.toBeInstanceOf(smm.SmmMonthDatesError);
  });
});

describe("Add SMM sale on a sale whose month exists", () => {
  const SOLD_MS = new Date("2026-08-06T10:00:00").getTime();
  const ORDER_ID = `o_l1_${SOLD_MS}`;
  function seedSale() {
    mem.__seed("leads/l1", {
      assignedTo: "anil", assignedBy: "sadmin", phone: "+919876543210", displayName: "Dhana lakshmi", status: "answered",
      saleDone: true, saleItems: [{
        category: "social_media_management", packageKey: "Plus Package", amount: 10000, verificationStatus: "verified",
        submittedAt: mem.Timestamp.fromMillis(SOLD_MS), requirement: { businessName: "Dhana lakshmi" },
        smm: { platforms: ["instagram"], commitments: { poster: 5, ai_ad: 0, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final" },
      }],
    });
    mem.__seed(`orders/${ORDER_ID}`, {
      clientPhone: "+919876543210", clientPhoneId: PHONE_ID, businessName: "Dhana lakshmi", clientName: "Dhana lakshmi",
      category: "social_media_management", packageKey: "Plus Package", amount: 10000, leadId: "l1", saleItemIndex: 0,
      saleItemKey: "l1__0", soldBy: "anil", soldByName: "Anil", salesAdminId: "sadmin", promise: null, status: "assigned",
      workAssignmentId: "job_a",
    });
  }

  it("files it as history through the check, takes back its untouched job and keeps a started one (and says so)", async () => {
    seedSale();
    seedMonth(ORDER_ID, "2026-10-06", "2026-11-06", DHANA_POSTS, { orderId: ORDER_ID, origin: "sale", leadId: "l1", amount: 10000 });
    mem.__seed("work_assignments/job_a", { assignedTo: "arjun", status: "assigned", sessions: [], totalDurationSeconds: 0, smmCampaignId: ORDER_ID, orderId: ORDER_ID, category: "social_media_management" });
    mem.__seed("work_assignments/job_d", { assignedTo: "divya", status: "in_progress", sessions: [{}], totalDurationSeconds: 300, smmCampaignId: ORDER_ID, orderId: ORDER_ID, category: "social_media_management" });

    // Without the posts confirmed: refused before anything is written.
    const err = await setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: setupOf("2026-09-06"), actor: KIRAN }).catch((e) => e);
    expect(err).toBeInstanceOf(smm.SmmMonthDatesError);
    expect(read(`smm_campaigns/${ORDER_ID}`)!.history).toBeFalsy();

    const result = await setup.setupSaleMonth({
      leadId: "l1", itemIndex: 0, actor: KIRAN,
      setup: { ...setupOf("2026-09-06"), confirmedOutside: err.verdict.outside.map((p: { id: string }) => p.id) },
    });
    expect(result.history).toBe(true);
    const c = read(`smm_campaigns/${ORDER_ID}`)!;
    expect(c).toMatchObject({ history: true, cycle: { startDate: "2026-09-06", endDate: "2026-10-06" } });
    expect(read("work_assignments/job_a")).toBeUndefined();
    expect(read("work_assignments/job_d")).toBeDefined();
    expect(result.historyJobs!.withdrawn.map((w) => w.uid)).toEqual(["arjun"]);
    expect(result.historyJobs!.keptStarted.map((k) => k.uid)).toEqual(["divya"]);
    // The order no longer points at the job taken back.
    expect(read(`orders/${ORDER_ID}`)).toMatchObject({ status: "verified", workAssignmentId: "job_d" });
  });

  it("refuses a new month for a gone sale on dates another month of the client holds", async () => {
    seedSale();
    mem.__seed(`smm_campaigns/${ORDER_ID}`, { status: "deleted", clientPhoneId: PHONE_ID, cycle: { month: "2026-08", startDate: "2026-08-06", endDate: "2026-09-06" }, items: [] });
    seedMonth("other", "2026-08-06", "2026-09-06", []);
    await expect(setup.setupSaleMonth({ leadId: "l1", itemIndex: 0, setup: setupOf("2026-08-10"), actor: KIRAN }))
      .rejects.toThrow(/overlap the client's Month 1 · August 2026/);
  });
});

/* ── Deadlines ───────────────────────────────────────────────────────────────────────────────── */

describe("a month's deadline", () => {
  it("keeps an extension already used, and the later due date", () => {
    const first = smm.monthPromise({ month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" });
    const extended = extendPromise(first, { hours: 72, uid: "kiran", name: "Kiran", role: "tech_admin" });
    const again = keepUsedExtension(smm.monthPromise({ month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" }), extended);
    expect(again.extension).toMatchObject({ byName: "Kiran" });
    expect(promiseDueMs(again)).toBe(promiseDueMs(extended));
    // A new month end later than the extended day wins — the extension is still marked used.
    const later = keepUsedExtension(smm.monthPromise({ month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-20" }), extended);
    expect(promiseDueMs(later)).toBeGreaterThan(promiseDueMs(extended));
    expect(later.extension).toBeTruthy();
    // Nothing used: the new deadline as it is.
    expect(keepUsedExtension(first, null)).toBe(first);
  });

  it("opens the extension box on three days for a month, the promise's own length for anything else", () => {
    expect(defaultExtensionHours(smm.monthPromise({ month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" }))).toBe(72);
    expect(defaultExtensionHours({ presetKey: "promotional_24h", hours: 24 })).toBe(24);
    expect(extendPromise(smm.monthPromise({ month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" }),
      { uid: "k", name: "K", role: "tech_admin" }).extension!.hours).toBe(72);
  });

  it("saving the setup again does not drop an extension on the order or a job", async () => {
    seedMonth("m1", "2026-10-06", "2026-11-06", [], { orderId: "o_m1", origin: "sale" });
    const extended = extendPromise(smm.monthPromise({ month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" }),
      { hours: 72, uid: "kiran", name: "Kiran", role: "tech_admin" });
    mem.__seed("orders/o_m1", { status: "assigned", promise: extended, clientPhoneId: PHONE_ID, category: "social_media_management" });
    mem.__seed("work_assignments/j1", { assignedTo: "arjun", status: "in_progress", sessions: [{}], totalDurationSeconds: 60, smmCampaignId: "m1", orderId: "o_m1", category: "social_media_management", promise: extended, tracks: ["ad_creation", "social_upload"], clipCount: 4, duration: "32s" });
    await setup.applyMonthSetup("m1", setupOf("2026-10-06"), KIRAN);
    expect(read("orders/o_m1")!.promise.extension).toMatchObject({ byName: "Kiran" });
    expect(read("work_assignments/j1")!.promise.extension).toMatchObject({ byName: "Kiran" });
  });

  it("a month with no order gives its jobs the month's deadline, dated on its first day when it starts later", async () => {
    seedMonth("next", "2026-10-20", "2026-11-20", [], { team: { creator: null, publisher: null, marketer: null, assistants: [] } });
    await assign.assignSmmMonth({ campaignId: "next", team: TEAM, assigner: { uid: "kiran", name: "Kiran", role: "tech_admin" } });
    const [job] = jobs();
    expect(job.promise).toMatchObject({ presetKey: "smm_month", label: "by 19 Nov" });
    expect(job.date).toBe("2026-10-20");
  });

  it("Orders → Assign jobs on a sold month still on the sale's promise puts the month's on the order and its jobs", async () => {
    seedMonth("o_s1", "2026-10-10", "2026-11-10", [], { orderId: "o_s1", origin: "sale", team: { creator: null, publisher: null, marketer: null, assistants: [] } });
    mem.__seed("orders/o_s1", {
      status: "unassigned", category: "social_media_management", clientPhone: "+919876543210", clientPhoneId: PHONE_ID,
      businessName: "Dhana lakshmi", soldBy: "anil", promise: { presetKey: "promotional_24h", label: "24 hours", hours: 24, source: "preset", startAt: mem.Timestamp.now(), dueAt: mem.Timestamp.now() },
    });
    await assign.assignSmmMonth({ campaignId: "o_s1", team: TEAM, assigner: { uid: "kiran", name: "Kiran", role: "tech_admin" } });
    expect(read("orders/o_s1")!.promise.presetKey).toBe("smm_month");
    expect(jobs()[0].promise.presetKey).toBe("smm_month");
    expect(jobs()[0].date).toBe(TODAY);
  });
});

/* ── The run, moved pieces, a post dated in another month ────────────────────────────────────── */

describe("the client's run links forward only", () => {
  it("continues on the old end date or up to a week after — never a month starting before the last one ended", () => {
    expect(continuesInto("2026-10-06", "2026-10-06")).toBe(true);
    expect(continuesInto("2026-10-06", "2026-10-13")).toBe(true);
    expect(continuesInto("2026-10-06", "2026-10-14")).toBe(false);
    expect(continuesInto("2026-10-06", "2026-10-01")).toBe(false); // was linked (abs ≤ 7) before 2026-10-15
  });
});

describe("pieces carried into the next month", () => {
  it("lose their old dates (kept in the notes), and the old month shows them as moved, not 'not live'", async () => {
    seedMonth("sep", "2026-09-06", "2026-10-06", [post("u1", "Navratri reel", "2026-09-28", false), post("d1", "Done", "2026-09-10")], { renewal: { state: "won", nextCampaignId: "oct", at: null, byName: null, note: null } });
    seedMonth("oct", "2026-10-06", "2026-11-06", [], { renewalOf: "sep", monthNumber: 2 });
    expect(await smm.moveUnpostedToMonth("sep", "oct", ["u1"], KIRAN)).toBe(1);
    const moved = read("smm_campaigns/oct")!.items.find((i: SmmContentItem) => i.id === "u1");
    expect(moved).toMatchObject({ uploadDate: null, uploadTime: null, carriedFrom: { campaignId: "sep" } });
    expect(moved.notes).toMatch(/it was dated 28 Sep, 10:00/);
    const sep = read("smm_campaigns/sep") as SmmCampaign;
    expect(toneCounts(sep, TODAY)).toMatchObject({ moved: 1, unplanned: 0, total: 1 });
    expect(monthGlance({ ...sep, id: "sep" }, TODAY).reason).toMatch(/1 post moved to the next month/);
    expect(monthGlance({ ...sep, id: "sep" }, TODAY).reason).not.toMatch(/not live/);
  });
});

describe("a post dated in another month of the same client", () => {
  it("is offered the month that covers its date", () => {
    const sep = { id: "sep", status: "active" as const, cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" } };
    const oct = { id: "oct", status: "active" as const, monthNumber: 2, cycle: { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" } };
    expect(moveTargetFor(post("p5", "Dussehra offers", "2026-10-09"), sep, [sep, oct])?.id).toBe("oct");
    expect(moveTargetLabel(oct)).toBe("Move to Month 2 (6 Oct – 5 Nov)");
    expect(moveTargetFor(post("p4", "Inside", "2026-09-09"), sep, [sep, oct])).toBeNull();
    expect(moveTargetFor(post("p0", "Nowhere", "2026-12-01"), sep, [sep, oct])).toBeNull();
  });

  it("moves whole — posted, with its links and approval — taking an empty row's place; the old month gets an empty row back", async () => {
    const dussehra = post("p5", "Dussehra offers", "2026-10-09", true, { postUrls: { instagram: "https://ig/p5" } });
    seedMonth("sep", "2026-09-06", "2026-10-06", [post("p4", "Temple jewellery", "2026-09-09"), dussehra]);
    seedMonth("oct", "2026-10-06", "2026-11-06", [{ ...blankItem("poster", ["instagram"]), id: "blank1" }, post("x", "Other", "2026-10-20", false)], { monthNumber: 2 });
    const done = await smm.movePieceToMonth("sep", "oct", "p5", KIRAN);
    expect(done).toMatchObject({ replacedBlank: true, toLabel: "October 2026" });
    const oct = read("smm_campaigns/oct") as SmmCampaign;
    expect(oct.items.map((i) => i.id)).toEqual(["p5", "x"]);
    expect(oct.items[0]).toMatchObject({ status: "posted", postUrls: { instagram: "https://ig/p5" }, approval: { state: "approved" }, uploadDate: "2026-10-09" });
    expect(oct.items[0].notes).toMatch(/Moved from September 2026 by Kiran/);
    const sep = read("smm_campaigns/sep") as SmmCampaign;
    expect(sep.items.map((i) => i.id)).not.toContain("p5");
    expect(sep.items).toHaveLength(2);
    expect(isUntouchedRow(sep.items[1])).toBe(true);
  });

  it("is a managing write: refused for a member, and to another client's month", async () => {
    seedMonth("sep", "2026-09-06", "2026-10-06", [post("p5", "Dussehra offers", "2026-10-09")]);
    seedMonth("oct", "2026-10-06", "2026-11-06", [], { monthNumber: 2 });
    seedMonth("else", "2026-10-06", "2026-11-06", [], { clientPhoneId: "910000000000" });
    await expect(smm.movePieceToMonth("sep", "else", "p5", KIRAN)).rejects.toThrow(/same client/);
    useAuthStore.setState({ user: { uid: "arjun", name: "Arjun", role: "tech_member" } } as never);
    await expect(smm.movePieceToMonth("sep", "oct", "p5", { uid: "arjun", name: "Arjun" })).rejects.toThrow(/Only the tech admin, a team leader or the main admin/);
    useAuthStore.setState({ user: { uid: "ravi", name: "Ravi", role: "tech_member", smmLeader: true } } as never);
    await expect(smm.movePieceToMonth("sep", "oct", "p5", { uid: "ravi", name: "Ravi" })).rejects.toThrow(/View only/);
    expect((read("smm_campaigns/sep") as SmmCampaign).items.map((i) => i.id)).toEqual(["p5"]);
  });
});

describe("Months to check", () => {
  it("lists months with posts outside their days, a client's overlapping months and a gap between linked months", () => {
    const base = (id: string, start: string, end: string, over: Partial<SmmCampaign> = {}) => ({
      id, status: "active", clientPhoneId: PHONE_ID, businessName: id, items: [], commitments: { poster: 0, ai_ad: 0, real_video: 0 },
      cycle: { month: start.slice(0, 7), startDate: start, endDate: end }, renewal: { state: "none" }, ...over,
    }) as unknown as SmmCampaign;
    const list = monthsToCheck([
      base("Dhana", "2026-10-06", "2026-11-06", { items: DHANA_POSTS }),
      base("A1", "2026-08-01", "2026-09-01", { clientPhoneId: "911", renewal: { state: "won", nextCampaignId: "A2" } as never }),
      base("A2", "2026-09-05", "2026-10-05", { clientPhoneId: "911", monthNumber: 2 }),
      base("Fine", "2026-10-01", "2026-11-01", { clientPhoneId: "912" }),
    ], TODAY);
    const names = list.map((m) => m.name);
    expect(names).toContain("Dhana");
    expect(list.find((m) => m.name === "Dhana")!.reasons[0]).toBe("4 posts are dated outside 6 Oct – 5 Nov");
    expect(list.find((m) => m.name === "A2")!.reasons[0]).toMatch(/Starts 4 days after August 2026 \(1 Aug → 1 Sep 2026\) ended/);
    expect(names).not.toContain("Fine");
    // Two of one client's months on the same days.
    const overlap = monthsToCheck([base("X", "2026-10-01", "2026-11-01"), base("Y", "2026-10-15", "2026-11-15")], TODAY);
    expect(overlap.map((m) => m.reasons[0])).toEqual([expect.stringMatching(/Shares days with/), expect.stringMatching(/Shares days with/)]);
  });
});
