/**
 * The two things about writing a month that cannot be left to the UI.
 *
 * 1. **Nothing is posted without approval.** The buttons are hidden, but a hidden button is a
 *    convention and this is a business rule. It is enforced where the write happens.
 * 2. **Two people editing two different posts must not overwrite each other.** The plan is an array
 *    in one document, so a naive write from a stale copy silently loses somebody's afternoon. Every
 *    mutation re-reads inside the transaction and merges by id.
 *
 * Firestore is faked with a single in-memory document, which is enough to prove both: the fake's
 * transaction hands back whatever is stored *now*, exactly as the real one does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** The one campaign document, and the one order it writes its counters through to. */
const store: Record<string, any> = {};

const Timestamp = { now: () => ({ seconds: 1_770_000_000, toMillis: () => 1_770_000_000_000 }) };

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => {}) }));
vi.mock("firebase/firestore", () => ({
  // `doc(db, coll, id)` for a known path, and `doc(collectionRef)` for a generated one — the real
  // SDK supports both, and creating a direct month uses the second.
  doc: (a: any, coll?: string, id?: string) => {
    if (coll) return { id, path: `${coll}/${id}` };
    const generated = `auto_${Math.random().toString(36).slice(2, 8)}`;
    return { id: generated, path: `${a.path}/${generated}` };
  },
  collection: (_db: unknown, name: string) => ({ path: name }),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: () => "SERVER_TS",
  setDoc: async (ref: any, data: any) => { store[ref.path] = data; },
  updateDoc: async (ref: any, patch: any) => { store[ref.path] = { ...store[ref.path], ...patch }; },
  getDoc: async (ref: any) => ({
    exists: () => !!store[ref.path],
    id: ref.path.split("/")[1],
    data: () => store[ref.path],
  }),
  runTransaction: async (_db: unknown, fn: any) => fn({
    get: async (ref: any) => ({
      exists: () => !!store[ref.path],
      id: ref.path.split("/")[1],
      data: () => store[ref.path],
    }),
    update: (ref: any, patch: any) => { store[ref.path] = { ...store[ref.path], ...patch }; },
  }),
  Timestamp,
}));

const smm = await import("@/services/smm");
const { blankItem, cycleFromStart } = await import("@/utils/smmPlan");

const ACTOR = { uid: "tech1", name: "Kiran" };

function seed(items = 2) {
  const plan = Array.from({ length: items }, () => blankItem("poster", ["instagram"]));
  store["smm_campaigns/o1"] = {
    id: "o1", orderId: "o1", leadId: "l1", saleItemKey: "l1__0",
    clientPhone: "+919000000000", clientPhoneId: "919000000000",
    clientName: "Ravi", businessName: "Sri Lakshmi Jewellers",
    packageKey: "Pro", packageLabel: "Pro", amount: 20000,
    cycle: cycleFromStart("2026-09-01"),
    platforms: ["instagram"],
    commitments: { poster: items, ai_ad: 0, real_video: 0 },
    items: plan, ads: [], budgetPayments: [],
    team: { creator: null, publisher: null, marketer: null, assistants: [] },
    soldBy: "seller", soldByName: "Anita",
    watchers: ["seller"], status: "active", renewal: { state: "none" },
  };
  store["orders/o1"] = { id: "o1", status: "assigned", progress: null };
  return plan;
}

const campaign = () => store["smm_campaigns/o1"];
const itemById = (id: string) => campaign().items.find((i: any) => i.id === id);

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe("nothing goes up without the client's approval", () => {
  it("refuses to mark a post as posted before an approval is recorded", async () => {
    const [first] = seed();
    await expect(smm.setItemStatus("o1", first.id, "posted", ACTOR))
      .rejects.toThrow(/has not approved/i);
    expect(itemById(first.id).status).toBe("planned");
  });

  it("refuses to schedule it either", async () => {
    const [first] = seed();
    await expect(smm.setItemStatus("o1", first.id, "scheduled", ACTOR)).rejects.toThrow();
  });

  it("refuses when the client asked for changes rather than approving", async () => {
    const [first] = seed();
    await smm.requestApproval("o1", first.id);
    await smm.recordApproval("o1", first.id, { approved: false, note: "Change the colour" }, ACTOR);
    expect(itemById(first.id).status).toBe("changes_requested");
    await expect(smm.setItemStatus("o1", first.id, "posted", ACTOR)).rejects.toThrow();
  });

  it("allows it once the approval is on the record", async () => {
    const [first] = seed();
    await smm.requestApproval("o1", first.id);
    await smm.recordApproval("o1", first.id, { approved: true, note: "Looks good" }, ACTOR);
    await smm.setItemStatus("o1", first.id, "posted", ACTOR);
    expect(itemById(first.id).status).toBe("posted");
    expect(itemById(first.id).postedAt).toBeTruthy();
  });

  it("lets work move through the stages that are nobody's permission to give", async () => {
    const [first] = seed();
    await smm.setItemStatus("o1", first.id, "in_progress", ACTOR);
    expect(itemById(first.id).status).toBe("in_progress");
  });
});

describe("the approval trail", () => {
  it("stamps when we asked and keeps it when we ask again", async () => {
    const [first] = seed();
    await smm.requestApproval("o1", first.id);
    const asked = itemById(first.id).approval.askedAt;
    expect(asked).toBeTruthy();
    expect(itemById(first.id).approval.state).toBe("waiting");

    // Re-sending the same request must not restart the clock — the client has still had it since
    // the first time, and that is the number the monthly report quotes.
    await smm.requestApproval("o1", first.id);
    expect(itemById(first.id).approval.askedAt).toEqual(asked);
  });

  it("records every follow-up, with who made it", async () => {
    const [first] = seed();
    await smm.requestApproval("o1", first.id);
    await smm.addApprovalChase("o1", first.id, ACTOR, "Called");
    await smm.addApprovalChase("o1", first.id, ACTOR, "WhatsApp");
    expect(itemById(first.id).approval.chases).toHaveLength(2);
    expect(itemById(first.id).approval.chases[0].byName).toBe("Kiran");
    expect(itemById(first.id).approval.chases[1].via).toBe("WhatsApp");
  });

  it("names whoever recorded the client's answer", async () => {
    const [first] = seed();
    await smm.recordApproval("o1", first.id, { approved: true }, ACTOR);
    expect(itemById(first.id).approval.byName).toBe("Kiran");
    expect(itemById(first.id).approval.respondedAt).toBeTruthy();
  });
});

describe("two people, one document", () => {
  it("merges edits to different posts instead of one overwriting the other", async () => {
    const [a, b] = seed();
    // Both writes are issued from the same starting state; each re-reads inside its transaction.
    await Promise.all([
      smm.updateItem("o1", a.id, { title: "Kiran's post" }),
      smm.updateItem("o1", b.id, { title: "Divya's post" }),
    ]);
    expect(itemById(a.id).title).toBe("Kiran's post");
    expect(itemById(b.id).title).toBe("Divya's post");
  });

  it("leaves everything alone when a write changes nothing", async () => {
    const [a] = seed();
    const before = JSON.stringify(campaign().items);
    await smm.setItemStatus("o1", a.id, "planned", ACTOR);   // already planned
    expect(JSON.stringify(campaign().items)).toBe(before);
  });

  it("does nothing for an item that is no longer there", async () => {
    seed();
    await smm.updateItem("o1", "gone", { title: "x" });
    expect(campaign().items).toHaveLength(2);
  });
});

describe("the order's counters follow the plan", () => {
  it("writes derived targets and counts through, and switches off the order's own editor", async () => {
    const [a] = seed(2);
    await smm.recordApproval("o1", a.id, { approved: true }, ACTOR);
    await smm.setItemStatus("o1", a.id, "posted", ACTOR);

    const progress = store["orders/o1"].progress;
    expect(progress.kind).toBe("smm");
    expect(progress.derived).toBe(true);
    expect(progress.targets).toEqual({ ads: 0, posters: 2, posted: 2, stories: 2, campaigns: 0 });
    expect(progress.done.posters).toBe(1);
    expect(progress.done.posted).toBe(1);
  });
});

describe("extra work", () => {
  it("adds a piece outside the quota and tells the person who sold the month", async () => {
    seed();
    const { sendNotification } = await import("@/services/notifications");
    await smm.addItem("o1", { kind: "poster", title: "Bonus poster", extra: true }, ACTOR);

    const added = campaign().items[campaign().items.length - 1];
    expect(added.extra).toBe(true);
    expect(added.extraCharge).toBe("unbilled");
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: "seller",
      type: "smm_extra_work",
    }));
  });

  it("does not ring anybody for ordinary planned work", async () => {
    seed();
    const { sendNotification } = await import("@/services/notifications");
    vi.mocked(sendNotification).mockClear();
    await smm.addItem("o1", { kind: "poster", title: "Normal poster" }, ACTOR);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("settles an extra as charged or given", async () => {
    seed();
    await smm.addItem("o1", { kind: "poster", title: "Bonus", extra: true }, ACTOR);
    const added = campaign().items[campaign().items.length - 1];

    await smm.setExtraCharge("o1", added.id, "billed", 500);
    expect(itemById(added.id).extraAmount).toBe(500);

    // Giving it away clears the amount — "free, ₹500" is not a state anybody means.
    await smm.setExtraCharge("o1", added.id, "free");
    expect(itemById(added.id).extraCharge).toBe("free");
    expect(itemById(added.id).extraAmount).toBeNull();
  });
});

describe("who is on the month", () => {
  it("adds the team to the watchers so they can find it at all", async () => {
    seed();
    await smm.setCampaignTeam("o1", {
      creator: { uid: "tech1", name: "Kiran" },
      publisher: { uid: "tech2", name: "Divya" },
      marketer: null,
      assistants: [{ uid: "junior", name: "Sai" }],
    });
    expect(campaign().watchers.sort()).toEqual(["junior", "seller", "tech1", "tech2"]);
  });

  it("gives unassigned posts to the new seat holder and leaves claimed ones alone", async () => {
    const [a, b] = seed();
    await smm.assignItem("o1", a.id, "maker", { uid: "someone", name: "Already on it" });

    await smm.setCampaignTeam("o1", {
      creator: { uid: "tech1", name: "Kiran" },
      publisher: null, marketer: null, assistants: [],
    });

    expect(itemById(a.id).makerName).toBe("Already on it");
    expect(itemById(b.id).makerName).toBe("Kiran");
  });
});

describe("ads and the client's money", () => {
  it("keeps one report per day, so re-entering a day corrects it rather than doubling it", async () => {
    seed();
    await smm.addAdRun("o1", {
      name: "Dussehra", scope: { kind: "all", itemIds: [] },
      startDate: "2026-09-10", days: 3, dailyBudget: 300,
    });
    const runId = campaign().ads[0].id;

    await smm.saveAdDayReport("o1", runId, { date: "2026-09-10", leads: 5, spend: 300, costPerResult: 60, byName: "K" });
    await smm.saveAdDayReport("o1", runId, { date: "2026-09-10", leads: 8, spend: 300, costPerResult: 37.5, byName: "K" });

    expect(campaign().ads[0].reports).toHaveLength(1);
    expect(campaign().ads[0].reports[0].leads).toBe(8);
  });

  it("stores a moved day as an override and leaves the agreed figure untouched", async () => {
    seed();
    await smm.addAdRun("o1", {
      name: "Dussehra", scope: { kind: "all", itemIds: [] },
      startDate: "2026-09-10", days: 3, dailyBudget: 300,
    });
    const runId = campaign().ads[0].id;

    await smm.setDayBudget("o1", runId, "2026-09-11", 800);
    expect(campaign().ads[0].budgetByDay["2026-09-11"]).toBe(800);
    expect(campaign().ads[0].dailyBudget).toBe(300);

    // Setting a day back to the agreed figure drops the override rather than storing a duplicate.
    await smm.setDayBudget("o1", runId, "2026-09-11", 300);
    expect(campaign().ads[0].budgetByDay["2026-09-11"]).toBeUndefined();
  });

  it("records what the client put in, against a name", async () => {
    seed();
    await smm.addBudgetPayment("o1", { amount: 1000, method: "GPay" }, ACTOR);
    expect(campaign().budgetPayments[0]).toMatchObject({ amount: 1000, method: "GPay", byName: "Kiran" });
  });
});

describe("opening the month", () => {
  it("builds one row per committed piece, on the accounts that were sold", async () => {
    await smm.ensureCampaignForOrder({
      orderId: "o1", leadId: "l1", saleItemKey: "l1__0",
      clientPhone: "+919000000000", clientPhoneId: "919000000000",
      clientName: "Ravi", businessName: "Sri Lakshmi Jewellers",
      packageKey: "Pro Package", packageLabel: "Pro Package", amount: 20000,
      platforms: ["instagram", "facebook"],
      commitments: { poster: 8, ai_ad: 8, real_video: 2 },
      soldBy: "seller", soldByName: "Anita",
      startDate: "2026-09-01",
    });
    expect(campaign().items).toHaveLength(18);
    expect(campaign().cycle).toEqual({ month: "2026-09", startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(campaign().watchers).toEqual(["seller"]);
  });

  it("never rebuilds a plan the team has already been filling in", async () => {
    const input = {
      orderId: "o1", leadId: "l1", saleItemKey: "l1__0",
      clientPhone: "+919000000000", clientPhoneId: "919000000000",
      clientName: "Ravi", businessName: "Sri Lakshmi Jewellers",
      packageKey: "Pro Package", packageLabel: "Pro Package", amount: 20000,
      platforms: ["instagram"] as const,
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      soldBy: "seller", soldByName: "Anita",
      startDate: "2026-09-01",
    };
    await smm.ensureCampaignForOrder({ ...input, platforms: ["instagram"] });
    const first = campaign().items[0];
    await smm.updateItem("o1", first.id, { title: "Half-built" });

    // The sale is edited; `upsertOrderForSale` calls this again.
    await smm.ensureCampaignForOrder({ ...input, platforms: ["instagram"], clientName: "Ravi Kumar", amount: 18000 });

    expect(campaign().items[0].title).toBe("Half-built");
    expect(campaign().clientName).toBe("Ravi Kumar");   // descriptive fields do refresh
    expect(campaign().amount).toBe(18000);
  });
});


describe("a month that never came through a sale", () => {
  it("can be started by hand, with the same plan a sold month gets", async () => {
    const id = await smm.createDirectCampaign({
      clientName: "Meena",
      businessName: "Meena Boutique",
      clientPhone: "9876543210",
      packageKey: "Starter Package",
      packageLabel: "Starter Package",
      amount: 9000,
      platforms: ["instagram", "facebook"],
      commitments: { poster: 4, ai_ad: 4, real_video: 1 },
      startDate: "2026-09-01",
    }, ACTOR);

    const made = store[`smm_campaigns/${id}`];
    expect(made.origin).toBe("direct");
    expect(made.items).toHaveLength(9);
    expect(made.cycle).toEqual({ month: "2026-09", startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(made.status).toBe("active");
  });

  it("has no order behind it, and does not pretend otherwise", async () => {
    const id = await smm.createDirectCampaign({
      clientName: "Meena", businessName: "Meena Boutique", clientPhone: "9876543210",
      packageKey: "", packageLabel: "Custom month", amount: 5000,
      platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 },
      startDate: "2026-09-01",
    }, ACTOR);

    expect(store[`smm_campaigns/${id}`].orderId).toBe("");
    // Moving the plan must not throw trying to write counters onto an order that does not exist.
    const first = store[`smm_campaigns/${id}`].items[0];
    await expect(smm.setItemStatus(id, first.id, "in_progress", ACTOR)).resolves.toBeUndefined();
  });

  it("makes whoever started it the owner of the client conversation", async () => {
    const id = await smm.createDirectCampaign({
      clientName: "Meena", businessName: "Meena Boutique", clientPhone: "9876543210",
      packageKey: "", packageLabel: "Custom month", amount: 5000,
      platforms: ["instagram"], commitments: { poster: 1, ai_ad: 0, real_video: 0 },
      startDate: "2026-09-01",
    }, ACTOR);

    // Approvals still get chased, ad money still gets asked for, the renewal still gets pitched —
    // all of which belong to a person. A month owned by nobody is one the client goes quiet on.
    expect(store[`smm_campaigns/${id}`].soldBy).toBe("tech1");
    expect(store[`smm_campaigns/${id}`].createdByName).toBe("Kiran");
    expect(store[`smm_campaigns/${id}`].watchers).toContain("tech1");
  });

  it("normalises the client's number the same way every other screen does", async () => {
    const id = await smm.createDirectCampaign({
      clientName: "Meena", businessName: "", clientPhone: "9876543210",
      packageKey: "", packageLabel: "Custom month", amount: 5000,
      platforms: ["instagram"], commitments: { poster: 1, ai_ad: 0, real_video: 0 },
      startDate: "2026-09-01",
    }, ACTOR);

    expect(store[`smm_campaigns/${id}`].clientPhone).toBe("+919876543210");
    // A business nobody named is the client's own name — a blank headline is unusable on the board.
    expect(store[`smm_campaigns/${id}`].businessName).toBe("Meena");
  });
});
