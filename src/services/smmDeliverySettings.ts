/**
 * SMM Delivery Control's switch and numbers — `app_settings/smm_delivery` (2026-10-15; types and the why in
 * `types/smmDelivery`, rules in `utils/smmDeliverySettings`).
 *
 * One document for the whole company, read live by whoever shows Delivery Control (one listener, one
 * document — no query). Written only by the tech admin and the main admin: the switch (`setSmmDeliveryMode`)
 * and the numbers (`saveSmmDeliveryTunables`), each in a transaction against the document as the database
 * holds it. Turning it OFF needs a reason, and every main admin but the one who did it is told (the owner's
 * decision 14). Who is signed in is read from the auth store, as `services/smm` reads it for the view-only
 * lead — the same question the Firestore rule asks (`docs/firestore-rules.md`, `app_settings`).
 */
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { useAuthStore } from "@/store/authStore";
import {
  SMM_DELIVERY_ADMIN_ONLY, canManageSmmDelivery, mergeTunables, modeChangeProblem, parseSmmDeliverySettings,
  tunablesInputProblem, tunablesProblem, withSwitch,
} from "@/utils/smmDeliverySettings";
import type { AppUser } from "@/types";
import type { SmmDeliveryMode, SmmDeliverySettings, SmmDeliveryTunables } from "@/types/smmDelivery";

export const SMM_DELIVERY_DOC = ["app_settings", "smm_delivery"] as const;
const settingsRef = () => doc(db, ...SMM_DELIVERY_DOC);

/** The settings, live. `exists` is false while nobody has saved any (the defaults are in force). */
export function watchSmmDeliverySettings(
  onChange: (settings: SmmDeliverySettings, meta: { exists: boolean; fromCache: boolean }) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    settingsRef(),
    (snap) => onChange(parseSmmDeliverySettings(snap.exists() ? snap.data() : null), {
      exists: snap.exists(),
      fromCache: !!snap.metadata?.fromCache,
    }),
    (err) => onError?.(err as Error),
  );
}

export async function fetchSmmDeliverySettings(): Promise<SmmDeliverySettings> {
  const snap = await getDoc(settingsRef());
  return parseSmmDeliverySettings(snap.exists() ? snap.data() : null);
}

/** The signed-in admin who may change it — refused with a sentence the screen can show. */
function signedInManager(): AppUser {
  const user = useAuthStore.getState().user;
  if (!user || !canManageSmmDelivery(user)) throw new Error(SMM_DELIVERY_ADMIN_ONLY);
  return user;
}

/**
 * Off / Preview / Live. Off needs a reason (≥ 5 characters); the owner is told. Setting the mode it already
 * has writes nothing. Returns the settings as saved.
 */
export async function setSmmDeliveryMode(mode: SmmDeliveryMode, reason?: string | null): Promise<SmmDeliverySettings> {
  const user = signedInManager();
  const problem = modeChangeProblem(mode, reason, user);
  if (problem) throw new Error(problem);
  const why = (reason || "").trim();
  const at = Date.now();

  const { saved, changed } = await runTransaction(db, async (tx) => {
    const snap = await tx.get(settingsRef());
    const current = parseSmmDeliverySettings(snap.exists() ? snap.data() : null);
    if (snap.exists() && current.mode === mode) return { saved: current, changed: false };
    const history = withSwitch(current.history, { mode, at, byUid: user.uid, byName: user.name, reason: mode === "off" ? why : null });
    const patch = {
      mode,
      history,
      offReason: mode === "off" ? why : null,
      offAt: mode === "off" ? serverTimestamp() : null,
      offByUid: mode === "off" ? user.uid : null,
      offByName: mode === "off" ? user.name : null,
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByName: user.name,
    };
    tx.set(settingsRef(), patch, { merge: true });
    return {
      saved: { ...current, mode, history, offReason: patch.offReason, offByUid: patch.offByUid, offByName: patch.offByName, updatedByUid: user.uid, updatedByName: user.name },
      changed: true,
    };
  });

  if (changed && mode === "off") await tellOwnerItWasTurnedOff(user, why, at);
  return saved;
}

/**
 * Every active main admin but the one who turned it off — "the owner is told". Never fatal: the switch is
 * already off; a failed notice is logged, not thrown.
 */
async function tellOwnerItWasTurnedOff(by: AppUser, reason: string, at: number): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "main_admin")));
    const owners = snap.docs.filter((d) => d.id !== by.uid && (d.data() as AppUser).isActive !== false).map((d) => d.id);
    await Promise.all(owners.map((uid) => sendNotification({
      userId: uid,
      type: "smm_delivery_off",
      title: "SMM Delivery Control turned off",
      message: `${by.name} turned off SMM Delivery Control: "${reason}". No weekly plans or alerts run until it is turned back on.`,
      link: "/smm",
      dedupeKey: `smm_delivery_off_${at}_${uid}`,
      meta: { byUid: by.uid, reason },
    }).catch((err) => console.warn("[smmDelivery] owner notice failed:", err))));
  } catch (err) {
    console.warn("[smmDelivery] owner lookup failed:", err);
  }
}

/**
 * The numbers: the pilot group, the deadline hour, the checkpoints, the quiet hours, the ladder. Only the
 * given parts change; every number must be in its range and the steps in order (`tunablesProblem`).
 * Returns the settings as saved.
 */
export async function saveSmmDeliveryTunables(patch: Partial<SmmDeliveryTunables>): Promise<SmmDeliverySettings> {
  const user = signedInManager();
  const inputProblem = tunablesInputProblem(patch);
  if (inputProblem) throw new Error(inputProblem);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(settingsRef());
    const current = parseSmmDeliverySettings(snap.exists() ? snap.data() : null);
    const next = mergeTunables(current, patch);
    const problem = tunablesProblem(next);
    if (problem) throw new Error(problem);
    tx.set(settingsRef(), {
      // A first save writes the mode in force too, so the document says what everybody already sees.
      ...(snap.exists() ? {} : { mode: current.mode }),
      ...next,
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByName: user.name,
    }, { merge: true });
    return { ...current, ...next, updatedByUid: user.uid, updatedByName: user.name };
  });
}
