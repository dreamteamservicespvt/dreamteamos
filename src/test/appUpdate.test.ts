import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkForUpdate, onUpdateAvailable, pendingBuildId, RUNNING_BUILD_ID, __resetUpdateStateForTests } from "@/services/appUpdate";

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
