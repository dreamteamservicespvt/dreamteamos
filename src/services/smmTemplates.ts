/**
 * Messages the team wrote once and wants to keep.
 *
 * Company-wide rather than per-member on purpose: the wording that works on a client is the team's
 * best asset, and a private template library means the newest member — the one who most needs the
 * good wording — is the one who has none. Anyone on the social-media side may add one; only the
 * person who wrote it, or an admin, may delete it.
 *
 * Small and bounded: a couple of dozen documents, read once when the composer opens.
 */
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import type { SmmTemplate, SmmTemplateKind } from "@/types/smm";

export const SMM_TEMPLATES = "smm_templates";

export async function fetchTemplates(): Promise<SmmTemplate[]> {
  try {
    const snap = await getDocs(query(collection(db, SMM_TEMPLATES), orderBy("updatedAt", "desc")));
    return snap.docs.map((d) => ({ ...(d.data() as SmmTemplate), id: d.id }));
  } catch (err) {
    // An empty library is a working composer — every message has a built-in default behind it.
    console.error("[smm] fetchTemplates:", err);
    return [];
  }
}

export async function saveTemplate(input: {
  kind: SmmTemplateKind;
  title: string;
  body: string;
  createdBy: string;
  createdByName: string;
}): Promise<void> {
  await addDoc(collection(db, SMM_TEMPLATES), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTemplate(id: string, patch: Partial<Pick<SmmTemplate, "title" | "body" | "kind">>): Promise<void> {
  await updateDoc(doc(db, SMM_TEMPLATES, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, SMM_TEMPLATES, id));
}
