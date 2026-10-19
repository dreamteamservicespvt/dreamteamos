import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Number requests (owner, 2026-10-19): a member asks for a number a colleague holds; the colleague or the
 * sales admin gives it (a sold number: the sales admin only). Giving it moves the number in one transaction —
 * the requester's hidden lead reopens, the holder's lead closes ("transferred"), the lock moves.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const notes: { userId: string; title: string; message: string }[] = [];
vi.mock("@/services/notifications", () => ({
  sendNotification: async (p: { userId: string; title: string; message: string }) => { notes.push(p); },
}));

import * as mem from "./memoryFirestore";
const svc = await import("@/services/numberRequests");
import { mayDecideNumberRequest, numberRequestId } from "@/utils/numberRequest";

const PHONE = "+919885719740";
const kusuma = { uid: "kusuma", name: "Kusuma" };
const REQ = numberRequestId(PHONE, "kusuma");

function seed({ sold = false } = {}) {
  mem.__seed("users/ravi", { uid: "ravi", name: "Ravi", role: "sales_member", createdBy: "sadmin" });
  mem.__seed("leads/K1", {
    assignedTo: "kusuma", phone: PHONE, displayName: "Sri Shop", notes: "called twice", status: "answered",
    frozen: true, frozenReason: "duplicate_resolved", takenOverBy: "another member",
  });
  mem.__seed("leads/R1", {
    assignedTo: "ravi", phone: PHONE, displayName: "Sri Shop", status: "answered", frozen: false,
    saleDone: sold, saleItems: sold ? [{ saleId: "R1_1", amount: 999 }] : [],
  });
  mem.__seed("numberLocks/919885719740", { phone: PHONE, ownerId: "kusuma", ownerName: "Kusuma", ownerLeadId: "K1", timeline: [] });
}

beforeEach(() => { mem.__reset(); notes.length = 0; svc.__resetNumberHolderCacheForTests(); });

describe("who holds a number", () => {
  it("names the colleague holding the live lead", async () => {
    seed();
    const h = await svc.findNumberHolder("9885719740", "kusuma");
    expect(h).toMatchObject({ uid: "ravi", name: "Ravi", leadId: "R1", hasSale: false, salesAdminId: "sadmin" });
  });
});

describe("asking for it", () => {
  it("writes one pending request and tells the holder and their sales admin", async () => {
    seed();
    const res = await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" });
    expect(res.kind).toBe("requested");
    expect(mem.__read(`number_requests/${REQ}`)).toMatchObject({ status: "pending", holderId: "ravi", requesterLeadId: "K1", salesAdminId: "sadmin" });
    expect(notes.map((n) => n.userId).sort()).toEqual(["ravi", "sadmin"]);
    const again = await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" });
    expect(again).toEqual({ kind: "already_pending", holderName: "Ravi" });
  });

  it("gives her own lead back at once when nobody else holds the number", async () => {
    seed();
    mem.__seed("leads/R1", { assignedTo: "ravi", phone: PHONE, frozen: true });
    const res = await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" });
    expect(res.kind).toBe("reopened");
    expect(mem.__read("leads/K1")).toMatchObject({ frozen: false, notes: "called twice" });
    expect(mem.__read("numberLocks/919885719740")).toMatchObject({ ownerId: "kusuma", ownerLeadId: "K1" });
  });
});

describe("deciding", () => {
  it("the holder gives an unsold number: her lead reopens, his closes, the lock moves", async () => {
    seed();
    await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" });
    const res = await svc.decideNumberRequest({ requestId: REQ, actor: { uid: "ravi", name: "Ravi", role: "sales_member" }, approve: true });
    expect(res.ok).toBe(true);
    expect(mem.__read("leads/K1")).toMatchObject({ frozen: false, notes: "called twice", assignedTo: "kusuma" });
    expect(mem.__read("leads/R1")).toMatchObject({ frozen: true, frozenReason: "transferred", takenOverBy: "Kusuma" });
    const lock = mem.__read("numberLocks/919885719740")!;
    expect(lock).toMatchObject({ ownerId: "kusuma", ownerLeadId: "K1", saleFrozen: false });
    expect((lock.timeline as { action: string }[]).at(-1)?.action).toBe("transferred");
    expect(mem.__read(`number_requests/${REQ}`)).toMatchObject({ status: "approved", decidedByName: "Ravi" });
    expect(notes.some((n) => n.userId === "kusuma" && /gave you/.test(n.message))).toBe(true);
  });

  it("a sold number: the holder cannot give it, the sales admin can — his sales stay on his lead", async () => {
    seed({ sold: true });
    await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" });
    const byHolder = await svc.decideNumberRequest({ requestId: REQ, actor: { uid: "ravi", name: "Ravi", role: "sales_member" }, approve: true });
    expect(byHolder.ok).toBe(false);
    expect(mem.__read("leads/R1")).toMatchObject({ frozen: false });
    const byAdmin = await svc.decideNumberRequest({ requestId: REQ, actor: { uid: "sadmin", name: "Admin", role: "sales_admin" }, approve: true });
    expect(byAdmin.ok).toBe(true);
    expect(mem.__read("leads/R1")).toMatchObject({ frozen: true, frozenReason: "transferred", saleItems: [{ saleId: "R1_1", amount: 999 }] });
    expect(notes.some((n) => n.userId === "ravi" && /sales stay yours/.test(n.message))).toBe(true);
  });

  it("decline changes nothing but the request, and she may ask again", async () => {
    seed();
    await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" });
    const res = await svc.decideNumberRequest({ requestId: REQ, actor: { uid: "ravi", name: "Ravi", role: "sales_member" }, approve: false });
    expect(res.ok).toBe(true);
    expect(mem.__read("leads/K1")).toMatchObject({ frozen: true });
    expect(mem.__read(`number_requests/${REQ}`)).toMatchObject({ status: "declined" });
    expect((await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: "K1" })).kind).toBe("requested");
  });

  it("makes her a new lead when she never had one", async () => {
    seed();
    await svc.requestNumber({ requester: kusuma, phone: PHONE, requesterLeadId: null });
    await svc.decideNumberRequest({ requestId: REQ, actor: { uid: "ravi", name: "Ravi", role: "sales_member" }, approve: true });
    const lock = mem.__read("numberLocks/919885719740")!;
    expect(lock.ownerLeadId).not.toBe("K1");
    expect(mem.__read(`leads/${lock.ownerLeadId}`)).toMatchObject({ assignedTo: "kusuma", phone: PHONE, frozen: false });
  });

  it("someone who is neither the holder nor an admin cannot decide", () => {
    const req = { status: "pending" as const, holderId: "ravi", holderHasSale: false };
    expect(mayDecideNumberRequest(req, { uid: "pavani", role: "sales_member" }).ok).toBe(false);
    expect(mayDecideNumberRequest(req, { uid: "x", role: "main_admin" }).ok).toBe(true);
    expect(mayDecideNumberRequest({ ...req, status: "approved" }, { uid: "x", role: "sales_admin" }).ok).toBe(false);
  });
});
