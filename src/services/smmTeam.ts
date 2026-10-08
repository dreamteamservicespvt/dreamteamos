/**
 * The Social Media Team Lead's corrections to who is on her team (2026-10-08).
 *
 * The board fills the team in by itself from the Social Media months (utils/smmAttendance.smmTeamFromMonths). The
 * owner chose to let the lead correct it — add somebody who is in her meeting but on no month yet, take off
 * somebody who is on a month but not in her meeting — and keep that for next time. One small document for the
 * company, `app_settings/smm_team`: `added` / `removed` uid lists, written with arrayUnion / arrayRemove so two
 * people editing at once never overwrite each other's change. Under the staff catch-all rule, like
 * `app_settings/smm_history_hold`.
 *
 * A person on a month who is put back only leaves `removed`; a person added by hand who is taken off only leaves
 * `added` — so a later seat on a month is never hidden by an old "taken off" of somebody who was only ever added.
 */
import { arrayRemove, arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { NO_TEAM_EDITS, type SmmTeamEdits } from "@/utils/smmAttendance";

const teamDoc = () => doc(db, "app_settings", "smm_team");

const uidList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

/** Live: the lead's corrections. A missing document (nobody has edited yet) is no corrections. */
export function watchSmmTeamEdits(cb: (edits: SmmTeamEdits) => void): () => void {
  return onSnapshot(
    teamDoc(),
    (snap) => {
      const data = snap.exists() ? (snap.data() as { added?: unknown; removed?: unknown }) : {};
      cb({ added: uidList(data.added), removed: uidList(data.removed) });
    },
    (error) => {
      console.error("[smmTeam] listener failed:", error);
      cb(NO_TEAM_EDITS);
    },
  );
}

type Actor = { uid: string; name?: string };

const stamp = (by: Actor) => ({ updatedAt: serverTimestamp(), updatedByUid: by.uid, updatedByName: by.name || "" });

/** Put a person on the team: added by hand, or — if they are on a month — no longer taken off. */
export async function addToSmmTeam(uid: string, opts: { onMonths: boolean }, by: Actor): Promise<void> {
  await setDoc(
    teamDoc(),
    { ...(opts.onMonths ? {} : { added: arrayUnion(uid) }), removed: arrayRemove(uid), ...stamp(by) },
    { merge: true },
  );
}

/** Take a person off the team: forget a hand-added one; remember a month's one as taken off. */
export async function removeFromSmmTeam(uid: string, opts: { onMonths: boolean }, by: Actor): Promise<void> {
  await setDoc(
    teamDoc(),
    { added: arrayRemove(uid), ...(opts.onMonths ? { removed: arrayUnion(uid) } : {}), ...stamp(by) },
    { merge: true },
  );
}
