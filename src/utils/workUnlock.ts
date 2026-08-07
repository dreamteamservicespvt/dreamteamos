/**
 * Remembering that somebody has already proved they know a job's access code.
 *
 * ── The problem ───────────────────────────────────────────────────────────────────────────────
 * Every job carries a four-digit code, and it gates two doors: the generator and the client chat.
 * It was asked for on EVERY open — so a member answering a customer typed the same four digits to
 * read the message, again to reply after switching to the job, and again the next time the client
 * wrote. On a job somebody works all day that is dozens of times for a code they demonstrably
 * already know, which is friction with no security left in it: the third prompt protects nothing
 * the first one did not.
 *
 * ── What it is and is not ─────────────────────────────────────────────────────────────────────
 * The code exists so a member opens the job they were actually given, and so a shared or borrowed
 * device does not hand a stranger a customer's conversation. Asking once per person, per job, per
 * device keeps both of those. It is not a secret worth re-proving on a timer, and it was never a
 * server-side authorisation — Firestore rules decide who may read what, and they are unchanged.
 *
 * ── Why it is scoped by uid ───────────────────────────────────────────────────────────────────
 * Keyed on the person as well as the job, so signing out and signing in as somebody else on a
 * shared phone starts from zero rather than inheriting the last member's unlocked jobs.
 */

const KEY = "dts_unlocked_work";

/** Everything this browser has unlocked, as `${uid}:${assignmentId}`. */
function readAll(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    // Private mode, a full quota, or somebody's hand-edited JSON — ask for the code, no harm done.
    return [];
  }
}

const entry = (uid: string, assignmentId: string) => `${uid}:${assignmentId}`;

/** Has this person already opened this job on this device? */
export function isWorkUnlocked(uid: string | undefined, assignmentId: string | undefined): boolean {
  if (!uid || !assignmentId) return false;
  return readAll().includes(entry(uid, assignmentId));
}

/**
 * Record a correct code.
 *
 * Capped at the most recent 300, oldest dropped first. Without a bound this grows for the life of
 * the install; 300 is far more jobs than anyone holds at once, so the cap can only ever evict
 * something long finished — and the cost of being wrong is one prompt.
 */
export function rememberWorkUnlock(uid: string | undefined, assignmentId: string | undefined): void {
  if (!uid || !assignmentId) return;
  const key = entry(uid, assignmentId);
  const all = readAll().filter((v) => v !== key);
  all.push(key);
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-300)));
  } catch { /* not being remembered just means being asked again */ }
}

/** Forget everything this device has unlocked — used when somebody signs out. */
export function clearWorkUnlocks(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
