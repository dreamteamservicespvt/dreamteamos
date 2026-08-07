import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolve } from "node:path";

/**
 * The service worker, driven directly.
 *
 * It is the one piece of this app that runs outside React, has no types, and cannot be reached by
 * any other test — and it decides whether a member gets one alert for a call or three. The file is
 * evaluated here with the handful of globals it actually uses, and the events it listens for are
 * dispatched by hand.
 *
 * What is being pinned: an alert is announced ONCE. The page and the worker both hear every push,
 * and both used to announce it — a member with the app open got the ringing popup, a system
 * notification, and a chime from the bell, for one incoming call.
 */

type Handler = (event: unknown) => void;

interface FakeClient {
  id: string;
  visibilityState: "visible" | "hidden";
  focused: boolean;
  posted: unknown[];
  postMessage: (m: unknown) => void;
  focus: () => Promise<FakeClient>;
}

function makeClient(id: string, visibilityState: "visible" | "hidden"): FakeClient {
  const c: FakeClient = {
    id,
    visibilityState,
    focused: false,
    posted: [],
    postMessage(m: unknown) { c.posted.push(m); },
    async focus() { c.focused = true; return c; },
  };
  return c;
}

/** Load the worker fresh, with the globals it touches, and hand back the levers to pull. */
function loadWorker(windows: FakeClient[]) {
  const handlers: Record<string, Handler[]> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];

  const self = {
    addEventListener: (type: string, fn: Handler) => { (handlers[type] ||= []).push(fn); },
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
  };

  const clients = {
    matchAll: () => Promise.resolve(windows),
    openWindow: (url: string) => { opened.push(url); return Promise.resolve(null); },
  };

  const firebase = { initializeApp: () => {} };
  const importScripts = () => {};
  const caches = { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };

  /*
    The worker is a plain script written for a service-worker global scope, so it cannot be
    imported — it references `self`, `clients` and `importScripts`, none of which exist here. It is
    evaluated with those supplied as parameters instead.

    The source is this repository's own file at a fixed path, read at test time. Nothing outside
    the repo, and nothing from a test fixture, is ever evaluated.
  */
  const source = readFileSync(resolve(__dirname, "../../public/firebase-messaging-sw.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("self", "clients", "firebase", "importScripts", "caches", source)(
    self, clients, firebase, importScripts, caches,
  );

  /** Fire an event and wait for whatever it passed to waitUntil. */
  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    const full = { ...event, waitUntil: (p: Promise<unknown>) => { waits.push(p); } };
    (handlers[type] || []).forEach((fn) => fn(full));
    await Promise.all(waits);
  };

  return { fire, shown, opened, handlers };
}

const push = (data: Record<string, string>) => ({
  data: { json: () => ({ data }) },
});

const CALL = { type: "voice_call", title: "Incoming call from Sharma Electronics", body: "tap to answer", callDocId: "call-1", link: "/tech/my-work?call=call-1" };
const MESSAGE = { type: "chat_message", title: "Sharma Electronics sent a message", body: "hello", link: "/tech/my-work?chat=c1" };

beforeEach(() => { vi.clearAllMocks(); });

describe("a push arriving while the app is on screen", () => {
  it("shows no notification for a call — the ringing popup is already there", async () => {
    const windows = [makeClient("w1", "visible")];
    const w = loadWorker(windows);
    await w.fire("push", push(CALL));
    expect(w.shown).toHaveLength(0);
  });

  it("tells the page instead, so nothing is lost", async () => {
    const windows = [makeClient("w1", "visible")];
    const w = loadWorker(windows);
    await w.fire("push", push(CALL));
    expect(windows[0].posted).toEqual([{ type: "push-received", data: CALL }]);
  });

  it("stays quiet for a message too — the conversation is open in front of them", async () => {
    const windows = [makeClient("w1", "visible")];
    const w = loadWorker(windows);
    await w.fire("push", push(MESSAGE));
    expect(w.shown).toHaveLength(0);
  });
});

describe("a push arriving when nobody is looking", () => {
  it("shows the notification when every window is hidden", async () => {
    // A tab left open behind three others is not "on screen"; a reply there still needs an alert.
    const w = loadWorker([makeClient("w1", "hidden")]);
    await w.fire("push", push(CALL));
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0].title).toBe(CALL.title);
  });

  it("shows the notification when the app is not open at all", async () => {
    const w = loadWorker([]);
    await w.fire("push", push(MESSAGE));
    expect(w.shown).toHaveLength(1);
  });

  it("gives a call Answer and Decline, and makes it stay put until dealt with", async () => {
    const w = loadWorker([]);
    await w.fire("push", push(CALL));
    const o = w.shown[0].options as Record<string, unknown>;
    expect(o.requireInteraction).toBe(true);
    expect(o.actions).toEqual([
      { action: "accept", title: "Answer" },
      { action: "decline", title: "Decline" },
    ]);
  });

  it("collapses repeat alerts for one call into a single notification", async () => {
    const w = loadWorker([]);
    await w.fire("push", push(CALL));
    await w.fire("push", push(CALL));
    // Two pushes, same tag — the browser replaces rather than stacking, so the member sees one.
    expect(w.shown).toHaveLength(2);
    expect(w.shown[0].options.tag).toBe(w.shown[1].options.tag);
    expect(w.shown[0].options.tag).toBe("call-call-1");
  });

  it("does not let a message pretend to be a call", async () => {
    const w = loadWorker([]);
    await w.fire("push", push(MESSAGE));
    const o = w.shown[0].options as Record<string, unknown>;
    expect(o.requireInteraction).toBe(false);
    expect(o.actions).toEqual([]);
  });
});

describe("tapping the notification", () => {
  const clicked = (data: Record<string, string>, action = "") => ({
    action,
    notification: { data, close: () => {} },
  });

  it("focuses the window that is already open rather than opening a second one", async () => {
    // Opening a new window means a cold boot — sign-in, listeners, the lot — while the caller
    // waits. Focusing keeps the answer inside the seconds a call actually has.
    const windows = [makeClient("w1", "hidden")];
    const w = loadWorker(windows);
    await w.fire("notificationclick", clicked(CALL));
    expect(windows[0].focused).toBe(true);
    expect(w.opened).toHaveLength(0);
  });

  it("tells that window where the tap was meant to go", async () => {
    const windows = [makeClient("w1", "hidden")];
    const w = loadWorker(windows);
    await w.fire("notificationclick", clicked(CALL));
    expect(windows[0].posted).toEqual([
      { type: "notification-click", link: CALL.link, callDocId: "call-1" },
    ]);
  });

  it("opens a window only when there is none to focus", async () => {
    const w = loadWorker([]);
    await w.fire("notificationclick", clicked(CALL));
    expect(w.opened).toEqual([CALL.link]);
  });

  it("declines from the lock screen without bringing the app to the front", async () => {
    const windows = [makeClient("w1", "hidden")];
    const w = loadWorker(windows);
    await w.fire("notificationclick", clicked(CALL, "decline"));
    expect(windows[0].posted).toEqual([{ type: "call-decline", callDocId: "call-1" }]);
    expect(windows[0].focused).toBe(false);
    expect(w.opened).toHaveLength(0);
  });
});

/**
 * The push payload itself, as the two senders build it.
 *
 * ── The doubled banner ────────────────────────────────────────────────────────────────────────
 * Both senders used to attach a `webpush.notification` block alongside the `data`. A push carrying
 * a `notification` block is displayed by the browser AUTOMATICALLY — and the service worker above
 * also listens for the raw `push` event and calls `showNotification` itself. Both fired for the
 * same push, so one incoming call arrived as two identical banners.
 *
 * Read from the source rather than by invoking the handlers: these are Vercel functions that pull
 * in firebase-admin at module load, and the thing worth pinning is one line of payload shape.
 */
describe("the push payload", () => {
  const senders = [
    ["api/send-notification.ts", readFileSync("api/send-notification.ts", "utf8")],
    ["api/order-chat.ts", readFileSync("api/order-chat.ts", "utf8")],
  ] as const;

  it.each(senders)("%s sends data-only web pushes, with no notification block", (_name, src) => {
    // The service worker builds a better one from `data` — Answer/Decline actions, a call
    // vibration, requireInteraction, and a tag that coalesces repeats for one call.
    const webpushBlocks = src.match(/webpush:\s*\{[\s\S]*?\n\s*\}/g) || [];
    expect(webpushBlocks.length).toBeGreaterThan(0);
    for (const block of webpushBlocks) {
      expect(block).not.toMatch(/notification\s*:/);
    }
  });

  it.each(senders)("%s still sends the data the worker renders from", (_name, src) => {
    expect(src).toMatch(/title,/);
    expect(src).toMatch(/channelId,/);
    expect(src).toMatch(/callDocId/);
  });
});
