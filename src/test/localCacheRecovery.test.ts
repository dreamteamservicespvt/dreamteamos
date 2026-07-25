import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportCacheTrouble, __resetCacheRecoveryForTests } from "@/services/localCacheRecovery";

/**
 * The repair that replaces "clear your browser cache".
 *
 * A reload loop would be worse than the bug it fixes, so the two things that matter here are that
 * a passing blip never triggers a repair, and that a repair happens at most once per session.
 */

const deleted: string[] = [];
let reloads = 0;

beforeEach(() => {
  __resetCacheRecoveryForTests();
  deleted.length = 0;
  reloads = 0;
  sessionStorage.clear();

  vi.stubGlobal("indexedDB", {
    deleteDatabase: (name: string) => {
      deleted.push(name);
      const req: Record<string, unknown> = {};
      // The real API is event-driven; fire on the next tick as the browser would.
      setTimeout(() => (req.onsuccess as (() => void) | undefined)?.(), 0);
      return req;
    },
    databases: async () => [{ name: "firestore/[DEFAULT]/dts-manager/main" }],
  });

  vi.stubGlobal("caches", { keys: async () => ["shell-v1"], delete: async () => true });

  // jsdom forbids assigning location.reload, so the whole object is replaced.
  const loc = { ...window.location, reload: () => { reloads += 1; } };
  Object.defineProperty(window, "location", { value: loc, writable: true, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Waits for the repair's async database deletions to settle. */
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("reportCacheTrouble", () => {
  it("ignores a one-off failure — networks drop, and that is not a broken cache", async () => {
    reportCacheTrouble("blip");
    await settle();
    expect(reloads).toBe(0);
    expect(deleted).toEqual([]);
  });

  it("ignores two failures — it is the repetition that means something", async () => {
    reportCacheTrouble("one");
    reportCacheTrouble("two");
    await settle();
    expect(reloads).toBe(0);
  });

  it("repairs once the failures look like a broken cache, not a bad moment", async () => {
    reportCacheTrouble("one");
    reportCacheTrouble("two");
    reportCacheTrouble("three");
    await settle();
    expect(reloads).toBe(1);
  });

  it("clears the Firestore and Firebase databases it can find", async () => {
    reportCacheTrouble("one");
    reportCacheTrouble("two");
    reportCacheTrouble("three");
    await settle();
    expect(deleted).toContain("firebaseLocalStorageDb");
    expect(deleted).toContain("firestore/[DEFAULT]/dts-manager/main");
  });

  /**
   * The guard that makes this safe to ship: sessionStorage survives the reload, so an app that
   * comes back still broken asks a human rather than reloading forever.
   */
  it("never repairs twice in one session", async () => {
    reportCacheTrouble("one");
    reportCacheTrouble("two");
    reportCacheTrouble("three");
    await settle();
    expect(reloads).toBe(1);

    __resetCacheRecoveryForTests();
    reportCacheTrouble("four");
    reportCacheTrouble("five");
    reportCacheTrouble("six");
    await settle();
    expect(reloads).toBe(1);
  });

  it("records the attempt where a reload cannot erase it", async () => {
    reportCacheTrouble("one");
    reportCacheTrouble("two");
    reportCacheTrouble("three");
    await settle();
    expect(sessionStorage.getItem("dts_cache_repair_attempted")).toBe("1");
  });
});
