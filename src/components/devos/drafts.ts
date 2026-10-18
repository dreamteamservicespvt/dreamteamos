/**
 * Unsent answers kept in this browser — a convenience for this viewer only: an answer counts once it is SUBMITTED, which
 * the server records. Storage can be blocked (private windows), so every access is guarded and the forms work without it.
 *
 * ── Why every key carries the person ── On a shared browser the next person could see someone else's unsent work: a
 * weekly challenge has the same id for everyone on a track (`challenge_<week>`), and a pool question can be served to
 * several people (found in the browser test, 2026-10-18). Keys are `devos_draft_<uid>_<qid>` and
 * `devos_practical_<uid>_<taskId>`, and opening the Development OS removes every draft that is not the viewer's own
 * (`purgeOtherDrafts` — someone else's, or the older keys without a person).
 */
const PREFIXES = ["devos_draft_", "devos_practical_"] as const;
const itemKey = (uid: string, qid: string) => `devos_draft_${uid}_${qid}`;
const practicalKey = (uid: string, taskId: string) => `devos_practical_${uid}_${taskId}`;

export function readItemDraft(uid: string, qid: string): string {
  try { return localStorage.getItem(itemKey(uid, qid)) ?? ""; } catch { return ""; }
}

export function writeItemDraft(uid: string, qid: string, text: string): void {
  try {
    if (text) localStorage.setItem(itemKey(uid, qid), text);
    else localStorage.removeItem(itemKey(uid, qid));
  } catch { /* storage blocked */ }
}

export function readPracticalDraft<T extends object>(uid: string, taskId: string): Partial<T> {
  try {
    const v = JSON.parse(localStorage.getItem(practicalKey(uid, taskId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : {};
  } catch { return {}; }
}

export function writePracticalDraft(uid: string, taskId: string, fields: object | null): void {
  try {
    if (fields && Object.keys(fields).length) localStorage.setItem(practicalKey(uid, taskId), JSON.stringify(fields));
    else localStorage.removeItem(practicalKey(uid, taskId));
  } catch { /* storage blocked */ }
}

/** Remove every Development OS draft in this browser that is not this person's. */
export function purgeOtherDrafts(uid: string): void {
  try {
    const mine = PREFIXES.map((p) => `${p}${uid}_`);
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && PREFIXES.some((p) => k.startsWith(p)) && !mine.some((m) => k.startsWith(m))) drop.push(k);
    }
    for (const k of drop) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}
