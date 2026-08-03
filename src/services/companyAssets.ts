/**
 * The two marks that belong to the company rather than to a person: the CEO's signature and the
 * rubber stamp.
 *
 * An admin's own signature already lives on their user record and signs what they personally
 * issue. These are different: the ID card every employee carries is signed by the company, not by
 * whichever admin happened to open the page, and a stamp is the company's mark whoever presses it.
 * Storing them per-admin would mean the same card printed two different signatures depending on
 * who looked at it.
 *
 * One document, `company_settings/main`, readable by anyone signed in and written by admins.
 */
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";

const COLLECTION = "company_settings";
const DOC_ID = "main";

export interface CompanyAssets {
  /** Photographed off paper, printed on every ID card above "Authorised Signatory". */
  ceoSignatureUrl?: string | null;
  ceoName?: string | null;
  ceoDesignation?: string | null;
  /** The company seal, laid over the signature block of issued letters. */
  stampUrl?: string | null;
  updatedAt?: unknown;
  updatedByName?: string | null;
}

export const EMPTY_COMPANY_ASSETS: CompanyAssets = {};

export function watchCompanyAssets(cb: (assets: CompanyAssets) => void): () => void {
  return onSnapshot(
    doc(db, COLLECTION, DOC_ID),
    (snap) => cb(snap.exists() ? (snap.data() as CompanyAssets) : EMPTY_COMPANY_ASSETS),
    // A failed read must not blank an ID card that was rendering fine a moment ago.
    () => cb(EMPTY_COMPANY_ASSETS),
  );
}

export async function fetchCompanyAssets(): Promise<CompanyAssets> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
    return snap.exists() ? (snap.data() as CompanyAssets) : EMPTY_COMPANY_ASSETS;
  } catch {
    return EMPTY_COMPANY_ASSETS;
  }
}

/** Merge, never overwrite: the stamp and the signature are set by different people, months apart. */
export async function saveCompanyAssets(patch: Partial<CompanyAssets>, byName: string): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, DOC_ID),
    { ...patch, updatedAt: serverTimestamp(), updatedByName: byName },
    { merge: true },
  );
}
