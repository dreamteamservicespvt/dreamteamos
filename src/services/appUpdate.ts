/**
 * Noticing that a new version has been deployed, and taking it.
 *
 * An installed PWA is not a web page that gets reloaded — it is an app someone opens on a phone and
 * leaves open for weeks. Nothing in a browser makes such an app fetch new code on its own, which is
 * why members were uninstalling and reinstalling to get updates.
 *
 * So the app checks for itself. Each build is stamped with an id that is both compiled into the
 * bundle and written to /version.json; when the two differ, a newer build is live.
 *
 * ── Why this does not simply reload ───────────────────────────────────────────────────────────
 * Because reloading throws away whatever is on screen, and in this app that can be forty minutes of
 * work — a generated set of prompts held in memory, a half-filled sale. The normal workflow even
 * involves leaving the app (copy a prompt, go to the image generator, come back), so "reload when
 * they return" would destroy work at exactly the wrong moment.
 *
 * The update is therefore always OFFERED, never forced — except where there is provably nothing to
 * lose. Detection is automatic; the moment of applying it is the member's.
 *
 * ── What "provably nothing to lose" has to cover ──────────────────────────────────────────────
 * It used to mean only the login screen, and that turned out to be almost nobody: sign-in persists,
 * so a member who installed the app months ago never sees the login screen again. Their only route
 * to a new version was the banner — and dismissing it silenced it permanently, so one stray tap on
 * the X left that phone on an old build for weeks. That is the "the app isn't updating" report.
 *
 * So there are now two safe moments instead of one, and dismissing is a snooze rather than a mute:
 *
 *   1. The login screen, as before.
 *   2. Coming back to an app that has been in the background long enough that nothing on screen is
 *      still being worked on — and only when nothing has ASKED to be left alone.
 *
 * `holdUpdates` is that asking. A screen holding work in memory rather than in the DOM — the ad
 * generator above all — registers a hold for as long as it is open, and no automatic reload happens
 * while any hold is live. `safeToAutoApply` adds a generic guard on top for everything else: a
 * dirty form field or an open dialog also means someone is mid-task.
 */

/** Compiled in by vite.config.ts. */
declare const __BUILD_ID__: string;

export const RUNNING_BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

/** How often to look. Cheap — one tiny uncached JSON file. */
const POLL_MS = 60_000;

type UpdateListener = (deployedBuildId: string) => void;

let listeners: UpdateListener[] = [];
let pending: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

/** Live reasons not to reload on our own. A screen registers one while it holds unsaved work. */
const holds = new Set<symbol>();

/**
 * "Do not reload underneath me." Returns the release; call it when the work is no longer at risk.
 *
 * Used by screens whose state lives in memory rather than in form fields, where the generic
 * dirty-input check below cannot see it. The ad generator is the reason this exists: forty minutes
 * of generated prompts sit in React state and would vanish on a reload without a trace.
 */
export function holdUpdates(): () => void {
  const token = Symbol("update-hold");
  holds.add(token);
  return () => { holds.delete(token); };
}

/** Whether anything has asked not to be reloaded. */
export function updatesHeld(): boolean {
  return holds.size > 0;
}

/**
 * Whether reloading right now would provably lose nothing.
 *
 * Deliberately generic rather than a list of screens: a dirty input, a half-typed textarea or an
 * open dialog all mean someone is mid-task, whatever page they are on. A new screen added later
 * inherits the protection without anyone remembering to opt in.
 */
export function safeToAutoApply(): boolean {
  if (updatesHeld()) return false;
  if (typeof document === "undefined") return true;

  // An open dialog is a task in progress — a modal is never idle furniture.
  if (document.querySelector('[role="dialog"], dialog[open]')) return false;

  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  for (const field of Array.from(fields)) {
    if (field.type === "hidden" || field.disabled || field.readOnly) continue;
    // Typed into and not yet what it started as: unsaved.
    if (field.value && field.value !== field.defaultValue) return false;
  }
  return true;
}

/** The newer build id, once one has been seen. Null while we are up to date. */
export function pendingBuildId(): string | null {
  return pending;
}

/** Notifies when a newer build appears. Fires immediately if one is already known. */
export function onUpdateAvailable(listener: UpdateListener): () => void {
  listeners.push(listener);
  if (pending) listener(pending);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

/**
 * Asks the server what the current build is.
 *
 * `cache: "no-store"` plus a cache-busting query is belt and braces: the header rules in
 * vercel.json already forbid caching this file, but a proxy or an aggressive WebView that ignored
 * them would defeat the whole mechanism, and this check is the thing that has to be trustworthy.
 */
export async function checkForUpdate(): Promise<string | null> {
  // In dev there is no deployed build to compare against.
  if (RUNNING_BUILD_ID === "dev") return null;

  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;

    const { buildId } = await res.json();
    if (typeof buildId !== "string" || !buildId) return null;
    if (buildId === RUNNING_BUILD_ID) {
      pending = null;
      return null;
    }

    pending = buildId;
    listeners.forEach((l) => l(buildId));
    return buildId;
  } catch {
    // Offline, or the file is not there. Nothing to do — we simply keep running what we have.
    return null;
  }
}

/**
 * Loads the new build.
 *
 * The service worker is refreshed first: an installed app can be holding an older worker, and
 * telling it to step aside means the reload is served by the newest one. The reload itself goes to
 * a cache-busted URL so no intermediate cache can hand back the old index.html — the exact failure
 * that made reinstalling the app the only cure.
 */
export async function applyUpdate(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.waiting?.postMessage("SKIP_WAITING");
        await reg.update().catch(() => { /* not fatal */ });
      }
    }
  } catch { /* not fatal — the reload below is what matters */ }

  try {
    // Any Cache Storage entry from an older worker would otherwise outlive the update.
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* best effort */ }

  window.location.replace(`${window.location.pathname}?v=${Date.now()}${window.location.hash}`);
}

/**
 * Begins watching: on an interval, and whenever the app comes back to the foreground.
 *
 * The visibility check is the one that matters on a phone, where the interval is throttled or
 * stopped entirely while the app is in the background — returning to the app is the moment a
 * member is most likely to accept an update, and the moment it is most likely to be stale.
 */
export function startUpdateWatch(): () => void {
  if (started) return () => {};
  started = true;

  void checkForUpdate();
  timer = setInterval(() => { void checkForUpdate(); }, POLL_MS);

  const onVisible = () => { if (document.visibilityState === "visible") void checkForUpdate(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}

/** Test seam. */
export function __resetUpdateStateForTests(): void {
  listeners = [];
  pending = null;
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
  holds.clear();
}
