import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(),
  setDoc: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), query: vi.fn(), where: vi.fn(),
  orderBy: vi.fn(), limit: vi.fn(), serverTimestamp: vi.fn(), increment: vi.fn(),
  arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));

import { PRESENCE_FRESH_MS, PRESENCE_HEARTBEAT_MS, isViewerPresent } from "@/services/orderChat";
import { clearWorkUnlocks, isWorkUnlocked, rememberWorkUnlock } from "@/utils/workUnlock";

/**
 * Why a member stopped being told about their client's messages.
 *
 * Presence used to be membership of `activeUsers`: added when the room opened, removed when it
 * closed. On a phone the removal frequently never ran — swiping the app away, the OS reclaiming
 * it, or losing signal all skip `beforeunload`. The member stayed listed as present for ever, and
 * "already looking" is exactly what suppresses the push, so every later message from that client
 * went silently into a badge nobody was watching.
 */
describe("chat presence", () => {
  const NOW = 1_800_000_000_000;

  it("counts a recent heartbeat as present", () => {
    expect(isViewerPresent({ activeAt: { u1: NOW - 10_000 } }, "u1", NOW)).toBe(true);
  });

  it("expires on its own, so a killed app cannot silence notifications for ever", () => {
    // The bug: `activeUsers` still says present, and nothing will ever remove it.
    const room = { activeUsers: ["u1"], activeAt: { u1: NOW - PRESENCE_FRESH_MS - 1 } };
    expect(isViewerPresent(room, "u1", NOW)).toBe(false);
  });

  it("beats faster than it expires, so one lost write is not a false absence", () => {
    expect(PRESENCE_HEARTBEAT_MS * 2).toBeLessThanOrEqual(PRESENCE_FRESH_MS);
  });

  it("treats leaving — a zeroed stamp — as long gone", () => {
    expect(isViewerPresent({ activeUsers: [], activeAt: { u1: 0 } }, "u1", NOW)).toBe(false);
  });

  it("falls back to the old flag for a room written before heartbeats existed", () => {
    // Behaviour is unchanged for anyone mid-conversation across the deploy; the next open heals it.
    expect(isViewerPresent({ activeUsers: ["u1"] }, "u1", NOW)).toBe(true);
    expect(isViewerPresent({ activeUsers: ["u2"] }, "u1", NOW)).toBe(false);
  });

  it("is false for somebody who was never in the room, and for no room at all", () => {
    expect(isViewerPresent({}, "u1", NOW)).toBe(false);
    expect(isViewerPresent(null, "u1", NOW)).toBe(false);
  });

  it("judges each viewer separately, including the customer", () => {
    const room = { activeAt: { u1: NOW - 1_000, client: NOW - PRESENCE_FRESH_MS - 1 } };
    expect(isViewerPresent(room, "u1", NOW)).toBe(true);
    expect(isViewerPresent(room, "client", NOW)).toBe(false);
  });
});

/**
 * One code per job, asked once. It gated two doors with the same four digits, so a member
 * answering a customer typed them to read the message, again to open the generator, and again the
 * next time the client wrote — a prompt that protects nothing the first one did.
 */
describe("remembering a proven access code", () => {
  beforeEach(() => localStorage.clear());

  it("asks the first time and never again for that job", () => {
    expect(isWorkUnlocked("u1", "job1")).toBe(false);
    rememberWorkUnlock("u1", "job1");
    expect(isWorkUnlocked("u1", "job1")).toBe(true);
  });

  it("still asks for a different job", () => {
    rememberWorkUnlock("u1", "job1");
    expect(isWorkUnlocked("u1", "job2")).toBe(false);
  });

  it("does not hand one member's unlocked jobs to the next person on a shared phone", () => {
    rememberWorkUnlock("u1", "job1");
    expect(isWorkUnlocked("u2", "job1")).toBe(false);
  });

  it("is forgotten on sign-out", () => {
    rememberWorkUnlock("u1", "job1");
    clearWorkUnlocks();
    expect(isWorkUnlocked("u1", "job1")).toBe(false);
  });

  it("is safe with nothing to identify the person or the job", () => {
    rememberWorkUnlock(undefined, "job1");
    expect(isWorkUnlocked(undefined, "job1")).toBe(false);
    expect(isWorkUnlocked("u1", undefined)).toBe(false);
  });

  it("keeps the most recent jobs when the list is capped", () => {
    for (let i = 0; i < 320; i++) rememberWorkUnlock("u1", `job${i}`);
    expect(isWorkUnlocked("u1", "job319")).toBe(true);
    // Evicted — 300 jobs back is long finished, and the cost of being wrong is one prompt.
    expect(isWorkUnlocked("u1", "job0")).toBe(false);
  });

  it("survives junk in storage rather than throwing on every open", () => {
    localStorage.setItem("dts_unlocked_work", "not json");
    expect(isWorkUnlocked("u1", "job1")).toBe(false);
    rememberWorkUnlock("u1", "job1");
    expect(isWorkUnlocked("u1", "job1")).toBe(true);
  });
});
