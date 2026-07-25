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
 * lose, which is the login screen. Detection is automatic; the moment of applying it is the
 * member's.
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
}
