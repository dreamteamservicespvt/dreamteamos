/**
 * Sales → Tech on one permanent saleId (owner, 2026-10-08). On the in-memory Firestore with the REAL
 * services — sales, orders, work assignment, chat, notifications — so every transaction, listener-free
 * read and notification document really happens.
 *
 * The owner's report: "editing a sale creates duplicate sales for Tech", "deleted unassigned sales still
 * appear for Tech members", "sales are not synchronizing correctly". Their test, end to end:
 *   CREATE → EDIT → ASSIGN → EDIT → DELETE UNASSIGNED → DELETE ASSIGNED
 *   • UNASSIGNED + DELETE = permanently gone everywhere;
 *   • ASSIGNED + DELETE = blocked;
 *   • ASSIGNED + EDIT = same saleId, assignment kept, a popup for the tech admin, team leader and member;
 *   • EDIT never creates a duplicate sale.
 * Plus every way the old code made a duplicate or an orphan: an edit saved after an earlier sale was
 * deleted, a job made for a sale deleted a moment before, a second job for one ad, a lead deleted with
 * its sales, an approval written over an edit, a penalty on the wrong sale.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));

const mem = await import("./memoryFirestore");
const sales = await import("@/services/sales");
const orders = await import("@/services/orders");
const workAssign = await import("@/services/workAssign");
const { saleIdOf, orderIdOfSaleId } = await import("@/utils/saleIdentity");
import type { Lead, Order, SaleDetail, WorkAssignment } from "@/types";

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const all = (col: string) => mem.__all(col) as Record<string, any>[];
const leadItems = (leadId: string) => ((read(`leads/${leadId}`)?.saleItems || []) as SaleDetail[]);
const order = (id: string) => (read(`orders/${id}`) ? ({ ...read(`orders/${id}`), id } as Order) : null);

const SELLER = { soldByName: "Anil", salesAdminId: "sadmin" };

/** A promotional ad as the sale form builds it. */
function sale(over: Partial<SaleDetail> = {}): SaleDetail {
  return {
    category: "promotional",
    packageKey: "30 Seconds + Poster",
    amount: 999,
    verificationStatus: "pending",
    paymentScreenshotUrl: "https://img/pay.png",
    requirement: {
      businessName: "Sri Sai Silks", businessWhatsapp: "+919876543210", language: "Telugu",
      modelGender: "female", attireType: "traditional", aspectRatio: "9:16", notes: "Show the new arrivals",
    },
    ...over,
  } as SaleDetail;
}

function seedPeople() {
  mem.__seed("users/tadmin", { uid: "tadmin", role: "tech_admin", name: "Kiran", isActive: true });
  mem.__seed("users/tlead", { uid: "tlead", role: "tech_team_leader", name: "Lakshmi", createdBy: "tadmin", isActive: true });
  mem.__seed("users/ravi", { uid: "ravi", role: "tech_member", name: "Ravi", createdBy: "tadmin", isActive: true });
  mem.__seed("users/anil", { uid: "anil", role: "sales_member", name: "Anil", createdBy: "sadmin", isActive: true });
}

function seedLead(id = "lead1", items: SaleDetail[] = []) {
  mem.__seed(`leads/${id}`, {
    assignedTo: "anil", phone: "+919876543210", displayName: "Sri Sai Silks", realName: "Srinivas",
    status: "answered", saleDone: items.length > 0, saleItems: items,
  });
}

async function leadOf(id = "lead1"): Promise<Lead> {
  return { ...(read(`leads/${id}`) as Lead), id };
}

/** Assign an order to Ravi, as both Work Assign pages do. */
function assign(o: Order | null, assignedTo = "ravi", uniqueId = "P001") {
  return workAssign.createWorkAssignment({
    assignedTo, assignedToName: "Ravi", assignerUid: "tadmin", assignerName: "Kiran", techAdminUid: "tadmin",
    category: "promotional", duration: "30 sec", clipCount: 4, pricePerUnit: 120, uniqueId,
    businessName: o?.businessName || "Sri Sai Silks", businessWhatsapp: o?.clientPhone || "",
    modelGender: "female", attireType: "traditional", aspectRatio: "9:16", language: "Telugu",
    order: o,
  });
}

/** Edit as the sale form does: the copy it opened on, and the copy it built on Save. */
function edit(leadId: string, base: SaleDetail, index: number, change: (s: SaleDetail) => SaleDetail) {
  return sales.updateSale({
    leadId, saleId: saleIdOf(leadId, base, index), base, next: change(base),
    editor: { uid: "anil", name: "Anil" }, ...SELLER,
  });
}

beforeEach(() => {
  mem.__reset();
  sales.__resetOrphanChecksForTests();
  // The push call in sendNotification is fire-and-forget; keep it off the network.
  globalThis.fetch = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
  seedPeople();
});

describe("the owner's test: CREATE → EDIT → ASSIGN → EDIT → DELETE UNASSIGNED → DELETE ASSIGNED", () => {
  it("keeps one sale, one order and one job the whole way, and deletes only what nobody started", async () => {
    seedLead();

    // ── CREATE — one sale, its order, its chat, the tech side's bell (one row per person) ──
    const created = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const saleId = created.saleId;
    const orderId = orderIdOfSaleId(saleId);
    expect(created.orderId).toBe(orderId);
    expect(leadItems("lead1")).toHaveLength(1);
    expect(leadItems("lead1")[0].saleId).toBe(saleId);
    expect(order(orderId)).toMatchObject({ status: "unassigned", saleId, saleVerified: false, businessName: "Sri Sai Silks" });
    expect(read(`order_chats/${orderId}`)).toBeTruthy();
    expect(read(`notifications/order_new_${orderId}_tadmin`)).toMatchObject({ userId: "tadmin", link: "/tech-admin/orders" });
    expect(read(`notifications/order_new_${orderId}_tlead`)).toMatchObject({ userId: "tlead", link: "/team-leader/orders" });

    // ── EDIT (nobody on it yet) — the same sale and order, nobody interrupted ──
    const base1 = leadItems("lead1")[0];
    const r1 = await edit("lead1", base1, 0, (s) => ({
      ...s, requirement: { ...s.requirement!, businessName: "Sri Sai Silks & Sarees", language: "English" },
    }));
    expect(r1).toMatchObject({ changed: true, hasWork: false, orderId });
    expect(leadItems("lead1")).toHaveLength(1);
    expect(leadItems("lead1")[0]).toMatchObject({ saleId, requirement: { businessName: "Sri Sai Silks & Sarees" } });
    expect(leadItems("lead1")[0].editLog?.at(-1)?.changes).toEqual(
      expect.arrayContaining(["Language: Telugu → English", "Business: Sri Sai Silks → Sri Sai Silks & Sarees"]),
    );
    expect(all("orders")).toHaveLength(1);
    expect(order(orderId)).toMatchObject({ status: "unassigned", businessName: "Sri Sai Silks & Sarees" });
    expect(all("notifications").filter((n) => n.type === "sale_edited")).toHaveLength(0);

    // ── ASSIGN — the job and the order's "assigned" together ──
    const job = await assign(order(orderId));
    expect(read(`work_assignments/${job.id}`)).toMatchObject({ orderId, saleId, assignedTo: "ravi", language: "Telugu" });
    expect(order(orderId)).toMatchObject({ status: "assigned", workAssignmentId: job.id, assignedTo: "ravi" });

    // ── EDIT (assigned) — same saleId, assignment kept, the job follows, three popups ──
    const base2 = leadItems("lead1")[0];
    const r2 = await edit("lead1", base2, 0, (s) => ({
      ...s, amount: 1299, requirement: { ...s.requirement!, language: "Hindi", notes: "Add the Diwali offer" },
    }));
    expect(r2).toMatchObject({ changed: true, hasWork: true, orderId });
    expect(leadItems("lead1")).toHaveLength(1);
    expect(all("orders")).toHaveLength(1);
    expect(all("work_assignments")).toHaveLength(1);
    expect(order(orderId)).toMatchObject({ status: "assigned", workAssignmentId: job.id, assignedTo: "ravi", amount: 1299 });
    expect(read(`work_assignments/${job.id}`)).toMatchObject({
      status: "assigned", assignedTo: "ravi", language: "Hindi", requirementNotes: "Add the Diwali offer",
    });
    const edited = all("notifications").filter((n) => n.type === "sale_edited");
    expect(edited.map((n) => n.userId).sort()).toEqual(["ravi", "tadmin", "tlead"]);
    const forMember = edited.find((n) => n.userId === "ravi")!;
    const forAdmin = edited.find((n) => n.userId === "tadmin")!;
    expect(forMember.message).toMatch(/Language: English → Hindi/);
    expect(forMember.message).not.toMatch(/₹|Amount/); // members never see the price
    expect(forMember.link).toBe("/tech/my-work");
    expect(forAdmin.meta.changes).toEqual(expect.arrayContaining(["Amount: ₹999 → ₹1,299"]));
    expect(forAdmin.link).toBe("/tech-admin/work-assign/ravi");
    expect(edited.find((n) => n.userId === "tlead")!.link).toBe("/team-leader/work-assign/ravi");

    // ── DELETE UNASSIGNED — a second sale nobody started: gone everywhere ──
    const second = await sales.recordSale({
      leadId: "lead1", item: sale({ category: "wishes", packageKey: "1 Minute + Poster", amount: 1499 }), ...SELLER,
    });
    expect(order(second.orderId)).toBeTruthy();
    const gone = await sales.deleteSale({ leadId: "lead1", saleId: second.saleId });
    expect(gone).toMatchObject({ deleted: true, noSalesLeft: false });
    expect(leadItems("lead1").map((s) => s.saleId)).toEqual([saleId]);
    expect(order(second.orderId)).toBeNull();
    expect(read(`order_chats/${second.orderId}`)).toBeUndefined();
    expect(read(`notifications/order_new_${second.orderId}_tadmin`)).toBeUndefined();
    expect(read(`notifications/order_new_${second.orderId}_tlead`)).toBeUndefined();

    // ── DELETE ASSIGNED — blocked; nothing touched ──
    await expect(sales.deleteSale({ leadId: "lead1", saleId })).rejects.toMatchObject({ code: "sale_has_work" });
    expect(leadItems("lead1").map((s) => s.saleId)).toEqual([saleId]);
    expect(order(orderId)).toMatchObject({ status: "assigned", workAssignmentId: job.id });
    expect(read(`work_assignments/${job.id}`)).toBeTruthy();
    expect(read(`order_chats/${orderId}`)).toBeTruthy();
  });
});

describe("create", () => {
  it("saving the same sale twice (a retry) records it once", async () => {
    seedLead();
    const item = sale({ submittedAt: mem.Timestamp.fromMillis(1_790_000_000_123) });
    const a = await sales.recordSale({ leadId: "lead1", item, ...SELLER });
    const b = await sales.recordSale({ leadId: "lead1", item, ...SELLER });
    expect(a.saleId).toBe("lead1_1790000000123");
    expect(b.saleId).toBe(a.saleId);
    expect(leadItems("lead1")).toHaveLength(1);
    expect(all("orders")).toHaveLength(1);
  });

  it("two DIFFERENT sales recorded in the same millisecond are both kept, each with its own id", async () => {
    seedLead();
    const at = mem.Timestamp.fromMillis(1_790_000_000_500);
    const a = await sales.recordSale({ leadId: "lead1", item: sale({ submittedAt: at }), ...SELLER });
    const b = await sales.recordSale({ leadId: "lead1", item: sale({ submittedAt: at, category: "wishes", packageKey: "1 Minute + Poster" }), ...SELLER });
    expect(a.saleId).toBe("lead1_1790000000500");
    expect(b.saleId).toBe("lead1_1790000000501");
    expect(leadItems("lead1").map((s) => s.category)).toEqual(["promotional", "wishes"]);
    expect(all("orders").map((o) => o.id).sort()).toEqual(["o_lead1_1790000000500", "o_lead1_1790000000501"]);
  });

  it("writes neither the sale nor an order when the lead is gone", async () => {
    await expect(sales.recordSale({ leadId: "nope", item: sale(), ...SELLER })).rejects.toMatchObject({ code: "lead_missing" });
    expect(all("orders")).toHaveLength(0);
  });
});

describe("edit never makes a second sale", () => {
  it("an edit form opened before an earlier sale was deleted still saves THAT sale (by id, not position)", async () => {
    seedLead();
    const x = await sales.recordSale({ leadId: "lead1", item: sale({ amount: 499, packageKey: "15 Seconds + Poster" }), ...SELLER });
    const y = await sales.recordSale({ leadId: "lead1", item: sale({ category: "cinematic", packageKey: "30 Seconds + Poster", amount: 1999 }), ...SELLER });
    // The form is opened on Y, which sits at position 1 …
    const baseY = leadItems("lead1")[1];
    // … and X (position 0) is deleted while it is open.
    await sales.deleteSale({ leadId: "lead1", saleId: x.saleId });
    const r = await edit("lead1", baseY, 1, (s) => ({ ...s, requirement: { ...s.requirement!, notes: "Shoot at the new branch" } }));
    expect(r.changed).toBe(true);
    expect(leadItems("lead1")).toHaveLength(1);
    expect(leadItems("lead1")[0]).toMatchObject({ saleId: y.saleId, category: "cinematic", requirement: { notes: "Shoot at the new branch" } });
    expect(all("orders").map((o) => o.id)).toEqual([y.orderId]);
  });

  it("an approval or a payment saved while the form was open survives the edit", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const base = leadItems("lead1")[0];
    // Meanwhile: the sales admin approves it, and the member collects a balance.
    await sales.mutateSaleItems("lead1", [s.saleId], (it) => ({ ...it, verificationStatus: "verified", verifiedAt: mem.Timestamp.now() }));
    await sales.mutateSaleItems("lead1", [s.saleId], (it) => ({ ...it, partialPayment: true, payments: [{ id: "p0", amount: 500, collectedAt: mem.Timestamp.now() }, { id: "p1", amount: 499, collectedAt: mem.Timestamp.now() }] }));
    await edit("lead1", base, 0, (b) => ({ ...b, requirement: { ...b.requirement!, businessAddress: "Main Road, Kakinada" } }));
    const saved = leadItems("lead1")[0];
    expect(saved.verificationStatus).toBe("verified");
    expect(saved.payments?.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(saved.requirement?.businessAddress).toBe("Main Road, Kakinada");
  });

  it("refuses to change the service of a sale the tech team has started — and writes nothing", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    await assign(order(s.orderId));
    const before = JSON.stringify(read("leads/lead1"));
    await expect(edit("lead1", leadItems("lead1")[0], 0, (b) => ({ ...b, category: "website", packageKey: "Basic" })))
      .rejects.toMatchObject({ code: "service_locked" });
    expect(JSON.stringify(read("leads/lead1"))).toBe(before);
  });

  it("an edit of a sale that was deleted meanwhile is refused, not saved as a new one", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const base = leadItems("lead1")[0];
    await sales.deleteSale({ leadId: "lead1", saleId: s.saleId });
    await expect(edit("lead1", base, 0, (b) => ({ ...b, amount: 1500 }))).rejects.toMatchObject({ code: "sale_missing" });
    expect(leadItems("lead1")).toHaveLength(0);
    expect(all("orders")).toHaveLength(0);
  });

  it("an older sale (no saleId stored) keeps its order id and gets its id stamped", async () => {
    const legacy = sale({ submittedAt: mem.Timestamp.fromMillis(1_780_000_000_000) });
    seedLead("lead1", [legacy]);
    await orders.upsertOrderForSale({ lead: await leadOf(), item: legacy, itemIndex: 0, soldByName: "Anil" });
    expect(order("o_lead1_1780000000000")).toBeTruthy();
    await edit("lead1", leadItems("lead1")[0], 0, (b) => ({ ...b, amount: 1100 }));
    expect(leadItems("lead1")[0].saleId).toBe("lead1_1780000000000");
    expect(all("orders").map((o) => o.id)).toEqual(["o_lead1_1780000000000"]);
    expect(order("o_lead1_1780000000000")!.amount).toBe(1100);
  });
});

describe("assigning", () => {
  it("never makes a job for a sale deleted a moment earlier", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const stale = order(s.orderId); // the Assign form opened on this
    await sales.deleteSale({ leadId: "lead1", saleId: s.saleId });
    await expect(assign(stale)).rejects.toMatchObject({ name: "AssignmentRefusedError", code: "sale_gone" });
    expect(all("work_assignments")).toHaveLength(0);
    expect(all("orders")).toHaveLength(0);
  });

  it("never gives one ad two jobs (two people, or a double tap)", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const stale = order(s.orderId);
    const first = await assign(stale, "ravi", "P001");
    await expect(assign(stale, "ravi", "P002")).rejects.toMatchObject({ code: "already_assigned" });
    expect(all("work_assignments").map((w) => w.id)).toEqual([first.id]);
  });

  it("a job unassigned frees the order for the next person", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const first = await assign(order(s.orderId));
    await workAssign.unassignWork({ assignmentId: first.id, assignedTo: "ravi", orderId: s.orderId, chatId: s.orderId });
    const second = await assign(order(s.orderId), "ravi", "P002");
    expect(order(s.orderId)).toMatchObject({ status: "assigned", workAssignmentId: second.id });
  });

  it("a sale whose job the order lost track of still cannot be deleted", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    mem.__seed("work_assignments/stray", { orderId: s.orderId, assignedTo: "ravi", uniqueId: "P009", status: "assigned" } as Partial<WorkAssignment>);
    await expect(sales.deleteSale({ leadId: "lead1", saleId: s.saleId })).rejects.toMatchObject({ code: "sale_has_work" });
    expect(leadItems("lead1")).toHaveLength(1);
  });
});

describe("deleting a lead deletes its sales — everywhere — or nothing", () => {
  it("removes the lead with its unassigned sales' orders and chats", async () => {
    seedLead("lead2");
    const s = await sales.recordSale({ leadId: "lead2", item: sale(), ...SELLER });
    const r = await sales.deleteLeadWithSales("lead2");
    expect(r).toEqual({ deleted: true, removedSales: 1 });
    expect(read("leads/lead2")).toBeUndefined();
    expect(order(s.orderId)).toBeNull();
    expect(read(`order_chats/${s.orderId}`)).toBeUndefined();
  });

  it("refuses while the tech team is working on one of its sales", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    await assign(order(s.orderId));
    await expect(sales.deleteLeadWithSales("lead1")).rejects.toMatchObject({ code: "sale_has_work" });
    expect(read("leads/lead1")).toBeTruthy();
    expect(order(s.orderId)).toBeTruthy();
  });
});

describe("Sales Approvals and the other writers", () => {
  it("revoking an approval keeps the sale's order on the tech side, marked unapproved", async () => {
    seedLead();
    const s = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    const { lead, changed } = await sales.mutateSaleItems("lead1", [s.saleId], (it) => ({ ...it, verificationStatus: "verified" }));
    await orders.upsertOrderForSale({ lead, item: changed[0].item, itemIndex: changed[0].index, soldByName: "Anil", saleVerified: true });
    expect(order(s.orderId)!.saleVerified).toBe(true);
    const back = await sales.mutateSaleItems("lead1", [s.saleId], (it) => ({ ...it, verificationStatus: "pending" }));
    await orders.markOrderSaleUnverified({ lead: back.lead, item: back.changed[0].item, itemIndex: back.changed[0].index, soldByName: "Anil" });
    expect(order(s.orderId)).toMatchObject({ status: "unassigned", saleVerified: false });
  });

  it("a penalty lands on its own sale after an earlier sale was deleted", async () => {
    seedLead();
    const x = await sales.recordSale({ leadId: "lead1", item: sale({ amount: 499 }), ...SELLER });
    const y = await sales.recordSale({ leadId: "lead1", item: sale({ amount: 1999, category: "cinematic" }), ...SELLER });
    await sales.deleteSale({ leadId: "lead1", saleId: x.saleId });
    // Y's order still says it sat at position 1 — the penalty must find Y by its id.
    expect(order(y.orderId)!.saleItemIndex).toBe(1);
    await orders.addOrderPenalty({
      order: order(y.orderId)!, clips: 2, ratePerClip: 100, clipType: "eight_sec" as never,
      actor: { uid: "anil", name: "Anil", role: "sales_member" },
    });
    expect(leadItems("lead1")).toHaveLength(1);
    expect(leadItems("lead1")[0]).toMatchObject({ saleId: y.saleId, penaltyTotal: 200 });
  });
});

describe("orders whose sale is gone leave the queue (cleanup on open)", () => {
  it("removes waiting orders with no sale behind them — and nothing else", async () => {
    seedLead();
    const live = await sales.recordSale({ leadId: "lead1", item: sale(), ...SELLER });
    // Left by the old deletes: a lead deleted with its sale, and a sale removed from a lead.
    mem.__seed("orders/o_ghostlead_1", { leadId: "ghostlead", status: "unassigned", saleSubmittedAtMs: 1, workAssignmentId: null });
    mem.__seed("order_chats/o_ghostlead_1", { orderId: "o_ghostlead_1", clientReady: false });
    mem.__seed("orders/o_lead1_5", { leadId: "lead1", status: "unassigned", saleSubmittedAtMs: 5, workAssignmentId: null });
    // An order somebody is working on is never touched, sale or no sale.
    mem.__seed("orders/o_lead1_7", { leadId: "lead1", status: "assigned", saleSubmittedAtMs: 7, workAssignmentId: "w7" });
    const queue = all("orders").map((o) => ({ ...o, id: o.id }) as Order);
    const removed = await sales.healOrphanOrdersOnOpen(queue);
    expect(removed).toBe(2);
    expect(all("orders").map((o) => o.id).sort()).toEqual([live.orderId, "o_lead1_7"].sort());
    expect(read("order_chats/o_ghostlead_1")).toBeUndefined();
    // Once a session.
    expect(await sales.healOrphanOrdersOnOpen(queue)).toBe(0);
  });
});
