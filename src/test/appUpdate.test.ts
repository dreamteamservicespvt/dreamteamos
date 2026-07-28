import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkForUpdate, holdUpdates, onUpdateAvailable, pendingBuildId, RUNNING_BUILD_ID,
  safeToAutoApply, updatesHeld, __resetUpdateStateForTests,
} from "@/services/appUpdate";

/**
 * An installed PWA is not a page that gets reloaded — it is an app left open on a phone for weeks.
 * Nothing in a browser makes it fetch new code on its own, which is why members were uninstalling
 * and reinstalling to get updates. These pin the check that replaces that.
 */

const originalFetch = global.fetch;

function mockVersionEndpoint(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __resetUpdateStateForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("checkForUpdate", () => {
  it("reports the newer build id when the deployment has moved on", async () => {
    mockVersionEndpoint({ buildId: "build-200" });
    expect(await checkForUpdate()).toBe("build-200");
    expect(pendingBuildId()).toBe("build-200");
  });

  it("reports nothing when the running build is the deployed one", async () => {
    mockVersionEndpoint({ buildId: RUNNING_BUILD_ID });
    expect(await checkForUpdate()).toBeNull();
    expect(pendingBuildId()).toBeNull();
  });

  it("asks for a fresh copy, never a cached one", async () => {
    mockVersionEndpoint({ buildId: "build-200" });
    await checkForUpdate();
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+/);
    expect(init).toMatchObject({ cache: "no-store" });
  });

  /**
   * Being offline must never be mistaken for "you are up to date" in a way that breaks anything —
   * it simply means we keep running what we have.
   */
  it("stays quiet when the check cannot be made", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    expect(await checkForUpdate()).toBeNull();
    expect(pendingBuildId()).toBeNull();
  });

  it("ignores a malformed or missing version file", async () => {
    mockVersionEndpoint({ nope: true });
    expect(await checkForUpdate()).toBeNull();
    mockVersionEndpoint({ buildId: "x" }, false);
    expect(await checkForUpdate()).toBeNull();
  });

  it("clears a pending update once the app is running the deployed build", async () => {
    mockVersionEndpoint({ buildId: "build-200" });
    await checkForUpdate();
    expect(pendingBuildId()).toBe("build-200");

    mockVersionEndpoint({ buildId: RUNNING_BUILD_ID });
    await checkForUpdate();
    expect(pendingBuildId()).toBeNull();
  });
});

describe("onUpdateAvailable", () => {
  it("tells a listener as soon as a newer build appears", async () => {
    const seen: string[] = [];
    onUpdateAvailable((id) => seen.push(id));
    mockVersionEndpoint({ buildId: "build-200" });
    await checkForUpdate();
    expect(seen).toEqual(["build-200"]);
  });

  // A banner mounted after the check already ran must still show — otherwise the update is
  // discovered and then silently forgotten.
  it("fires immediately for a listener that arrives late", async () => {
    mockVersionEndpoint({ buildId: "build-200" });
    await checkForUpdate();

    const seen: string[] = [];
    onUpdateAvailable((id) => seen.push(id));
    expect(seen).toEqual(["build-200"]);
  });

  it("stops notifying once unsubscribed", async () => {
    const seen: string[] = [];
    const off = onUpdateAvailable((id) => seen.push(id));
    off();
    mockVersionEndpoint({ buildId: "build-200" });
    await checkForUpdate();
    expect(seen).toEqual([]);
  });
});

/**
 * A member who is signed in never passes the login screen, so the app has to be able to take a new
 * version on its own — but only when nothing on screen is still being worked on. These pin the
 * guard that decides that.
 */
describe("safeToAutoApply", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is safe on an idle page", () => {
    expect(safeToAutoApply()).toBe(true);
  });

  it("refuses while a screen is holding work in memory", () => {
    const release = holdUpdates();
    expect(updatesHeld()).toBe(true);
    expect(safeToAutoApply()).toBe(false);
    release();
    expect(safeToAutoApply()).toBe(true);
  });

  it("counts every hold, so one screen releasing does not free another", () => {
    const a = holdUpdates();
    const b = holdUpdates();
    a();
    expect(safeToAutoApply()).toBe(false);
    b();
    expect(safeToAutoApply()).toBe(true);
  });

  it("refuses while a dialog is open", () => {
    document.body.innerHTML = '<div role="dialog">Add Sale</div>';
    expect(safeToAutoApply()).toBe(false);
  });

  it("refuses while a field has been typed into", () => {
    document.body.innerHTML = '<input type="text" />';
    (document.querySelector("input") as HTMLInputElement).value = "half a phone number";
    expect(safeToAutoApply()).toBe(false);
  });

  it("ignores a field still showing what it started with", () => {
    document.body.innerHTML = '<input type="text" value="Telugu" />';
    expect(safeToAutoApply()).toBe(true);
  });

  it("ignores hidden, disabled and read-only fields", () => {
    document.body.innerHTML = '<input type="hidden" /><input disabled /><input readonly />';
    for (const el of Array.from(document.querySelectorAll("input"))) el.value = "x";
    expect(safeToAutoApply()).toBe(true);
  });
});
