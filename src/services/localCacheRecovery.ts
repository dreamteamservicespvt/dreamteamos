/**
 * Repairing local storage without the member ever being told to clear their browser.
 *
 * Firestore keeps its offline cache in IndexedDB. That database can become unusable for reasons
 * that have nothing to do with the app being wrong — a tab crashing mid-write, the browser evicting
 * data under storage pressure, two tabs racing for the multi-tab lock, private-mode restrictions,
 * an Android WebView reclaiming storage. Once it is broken every Firestore read fails, and the only
 * cure anyone knew was "clear your browser cache".
 *
 * Asking a sales member on a phone to clear site data is not a fix. This module makes the app do it
 * itself: when reads fail in the pattern that means "local storage is gone", the caches are dropped
 * and the page reloads once. Firestore rebuilds the cache from the server on the next run.
 *
 * ── Why it is careful about reloading ─────────────────────────────────────────────────────────
 * A reload loop is worse than the bug. So a repair happens at most once per browsing session, is
 * recorded in sessionStorage (which a reload preserves and a new tab does not), and only after
 * repeated trouble rather than a single blip — a passing network error must never cost someone
 * their unsaved work.
 */

const ATTEMPT_KEY = "dts_cache_repair_attempted";
/** Distinct failures before we accept it is not just a flaky network. */
const TROUBLE_THRESHOLD = 3;

let troubleCount = 0;
let repairing = false;

/** True when this browsing session has already tried a repair — we never loop. */
function alreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY) === "1";
  } catch {
    // No sessionStorage means no way to remember, so no way to guarantee a single attempt.
    return true;
  }
}

function markAttempted(): void {
  try { sessionStorage.setItem(ATTEMPT_KEY, "1"); } catch { /* nothing we can do */ }
}

/** Every IndexedDB database Firestore and Firebase Auth keep for this origin. */
async function deleteIndexedDbs(): Promise<void> {
  const known = [
    "firebaseLocalStorageDb",
    "firebase-heartbeat-database",
    "firebase-installations-database",
  ];

  // `databases()` is not in every browser; where it exists it catches the per-project Firestore
  // databases whose names embed the project id, which we would otherwise have to guess.
  let names = known;
  try {
    const anyIdb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (typeof anyIdb.databases === "function") {
      const listed = (await anyIdb.databases()).map((d) => d.name).filter((n): n is string => !!n);
      names = Array.from(new Set([...known, ...listed.filter((n) => /firestore|firebase/i.test(n))]));
    }
  } catch { /* fall back to the known list */ }

  await Promise.all(names.map((name) => new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      // `blocked` fires when another tab still holds the database. Resolving anyway is correct:
      // the reload below closes this tab's handles, and a half-done clean-up beats hanging here.
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  })));
}

/** Drops any Cache Storage entries too, so a stale app shell cannot survive the repair. */
async function deleteCacheStorage(): Promise<void> {
  try {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch { /* best effort */ }
}

/**
 * Called when something that should have worked did not, in a way that points at local storage.
 *
 * Individually these are unremarkable — networks drop. It is the repetition that means the cache
 * itself is broken, so the counter is what decides, not any single failure.
 */
export function reportCacheTrouble(reason: string): void {
  if (repairing || alreadyAttempted()) return;

  troubleCount += 1;
  if (troubleCount < TROUBLE_THRESHOLD) return;

  void repairLocalCaches(reason);
}

/**
 * Wipes the local caches and reloads once. Exported so a "something is wrong" UI can offer it as
 * a button — the same repair, asked for deliberately.
 */
export async function repairLocalCaches(reason: string): Promise<void> {
  if (repairing) return;
  repairing = true;
  markAttempted();

  console.warn(`[cache-recovery] repairing local storage (${reason})`);
  await deleteIndexedDbs();
  await deleteCacheStorage();

  // Reload from the network, not from the back/forward cache, so the app comes back clean.
  window.location.reload();
}

/** Test seam — resets the module's in-memory counters. */
export function __resetCacheRecoveryForTests(): void {
  troubleCount = 0;
  repairing = false;
}
