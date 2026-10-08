/**
 * The Invoice Builder's two settings documents (2026-10-08):
 *   invoice_settings/access    `{ teamLeadersEnabled }` — the team-leader switch (Tech / Main Admin)
 *   invoice_settings/defaults  bank details, terms, notes and GST settings a new invoice starts with
 *
 * Its own small file, apart from `services/invoices`, because the sidebar listens to the switch for
 * team leaders: the sidebar is in the app's first bundle, and importing the whole invoice service
 * there would ship the invoice engine to every member of staff on every page load.
 */
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { UserRole } from "@/types";
import type { InvoiceAccessSettings, InvoiceDefaults } from "@/types/invoice";

const SETTINGS = "invoice_settings";

interface Actor {
  uid: string;
  name: string;
  role: UserRole;
}

/** Firestore refuses `undefined`; strip it from plain objects (sentinels untouched). */
function clean<T>(value: T): T {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = clean(v);
    return out as T;
  }
  return value;
}

export function watchInvoiceAccess(onData: (s: InvoiceAccessSettings) => void): () => void {
  return onSnapshot(
    doc(db, SETTINGS, "access"),
    (snap) => onData(snap.exists() ? (snap.data() as InvoiceAccessSettings) : {}),
    // A failed read reads as "off" — never as "on". The rules make the same decision on the server.
    () => onData({}),
  );
}

export async function setTeamLeadersEnabled(enabled: boolean, actor: Actor): Promise<void> {
  await setDoc(doc(db, SETTINGS, "access"), {
    teamLeadersEnabled: enabled,
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.name || "",
  }, { merge: true });
}

export function watchInvoiceDefaults(onData: (d: InvoiceDefaults) => void): () => void {
  return onSnapshot(
    doc(db, SETTINGS, "defaults"),
    (snap) => onData(snap.exists() ? (snap.data() as InvoiceDefaults) : {}),
    () => onData({}),
  );
}

/** Merge, never overwrite: payment details and the terms are saved from different sections. */
export async function saveInvoiceDefaults(patch: Partial<InvoiceDefaults>, actor: Actor): Promise<void> {
  await setDoc(doc(db, SETTINGS, "defaults"), clean({
    ...patch,
    updatedAt: serverTimestamp(),
    updatedByName: actor.name || "",
  }), { merge: true });
}
