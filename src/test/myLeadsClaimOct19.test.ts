import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Already in your leads" — and nothing in the list (owner, 2026-10-19, Kusuma, +919885719740).
 *
 * Resolving a duplicate freezes the loser's LEAD but never touched the number's LOCK, so the lock kept
 * naming a member whose list hides the lead. `claimNumber` now reads the lead its own lock holds: frozen →
 * say who has the number; gone → add the number fresh; working → "already yours" as before.
 * And the duplicate scan no longer fires every `in` query at once (it held the phone's connection ~50 s).
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));

import * as mem from "./memoryFirestore";
const { claimNumber } = await import("@/services/numberLock");

const me = { uid: "kusuma", name: "Kusuma" };
const PHONE = "+919885719740";
const LOCK = "numberLocks/919885719740";
const past = mem.Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);

const seedLock = (ownerLeadId: string | null) =>
  mem.__seed(LOCK, {
    phone: PHONE, ownerId: "kusuma", ownerName: "Kusuma", ownerLeadId,
    claimedAt: past, reserveExpiresAt: past, saleFrozen: false, saleFrozenUntil: null, timeline: [],
  });

beforeEach(() => mem.__reset());

describe("claimNumber on the member's own lock", () => {
  it("says who has the number when the lock's lead was frozen as a resolved duplicate", async () => {
    mem.__seed("leads/L1", { assignedTo: "kusuma", phone: PHONE, frozen: true, frozenReason: "duplicate_resolved", takenOverBy: "Ravi" });
    seedLock("L1");
    const res = await claimNumber({ user: me, phone: "9885719740" });
    expect(res).toEqual({ kind: "held_elsewhere", ownerName: "Ravi" });
    expect(mem.__all("leads")).toHaveLength(1); // nothing created
  });

  it("adds the number fresh when the lock's lead no longer exists", async () => {
    seedLock("gone");
    const res = await claimNumber({ user: me, phone: "9885719740", displayName: "Shop" });
    expect(res.kind).toBe("created");
    const leads = mem.__all("leads");
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ assignedTo: "kusuma", phone: PHONE, isCustomEntry: true, frozen: false });
    const lock = mem.__read(LOCK)!;
    expect(lock.ownerLeadId).toBe(leads[0].id);
    expect((lock.timeline as { note?: string }[]).at(-1)?.note).toMatch(/no longer existed/);
  });

  it("is still 'already yours' for a working lead, and for an old lock with no lead id", async () => {
    mem.__seed("leads/L1", { assignedTo: "kusuma", phone: PHONE, frozen: false });
    seedLock("L1");
    expect(await claimNumber({ user: me, phone: PHONE })).toEqual({ kind: "already_yours" });
    seedLock(null);
    expect(await claimNumber({ user: me, phone: PHONE })).toEqual({ kind: "already_yours" });
    expect(mem.__all("leads")).toHaveLength(1);
  });
});

describe("the duplicate scan", () => {
  it("keeps at most six queries in flight and still finds every duplicate", async () => {
    const fs = await import("firebase/firestore");
    const real = fs.getDocs;
    let inFlight = 0;
    let peak = 0;
    const spy = vi.spyOn(fs, "getDocs").mockImplementation(async (q: never) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return real(q);
    });
    const { findMemberDuplicates, DUPLICATE_SCAN_CONCURRENCY } = await import("@/services/duplicateLeads");
    const mine = Array.from({ length: 250 }, (_, i) => ({ id: `m${i}`, phone: `+91900000${String(i).padStart(4, "0")}` }));
    mine.forEach((l) => mem.__seed(`leads/${l.id}`, { assignedTo: "kusuma", phone: l.phone }));
    mem.__seed("leads/r1", { assignedTo: "ravi", phone: mine[7].phone, status: "answered" });
    mem.__seed("leads/r2", { assignedTo: "ravi", phone: mine[242].phone, status: "answered" });

    const map = await findMemberDuplicates(mine, "kusuma");
    expect(Object.keys(map).sort()).toEqual(["m242", "m7"]);
    expect(peak).toBeLessThanOrEqual(DUPLICATE_SCAN_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    spy.mockRestore();
  });
});
