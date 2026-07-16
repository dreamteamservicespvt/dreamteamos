import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";

export type AgreementStatus = "sent" | "signed";

export interface Agreement {
  id?: string;
  memberId: string;
  memberName: string;
  memberPhone?: string;
  memberRole?: string;
  sentBy: string;
  sentByName: string;
  sentByRole: string;
  title: string;
  bodyText: string; // raw pasted text (placeholders auto-filled at render time)
  status: AgreementStatus;
  signatureUrl?: string; // Cloudinary URL of the drawn/uploaded signature
  signedName?: string;
  signedDate?: string; // yyyy-MM-dd
  signedAt?: Timestamp;
  createdAt: Timestamp;
}

/** Extract a human title from the pasted text (first non-empty line, trimmed). */
export function extractTitle(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "Agreement";
  return line.length > 90 ? line.slice(0, 90) + "…" : line;
}

/** Admin / lead sends an agreement to a member. */
export async function sendAgreement(a: Omit<Agreement, "id" | "status" | "createdAt">, memberLink: string): Promise<string> {
  const ref = await addDoc(collection(db, "agreements"), {
    ...a,
    status: "sent" as AgreementStatus,
    createdAt: serverTimestamp(),
  });
  await sendNotification({
    userId: a.memberId,
    type: "agreement",
    title: "New Agreement to Sign",
    message: `${a.sentByName} sent you "${a.title}". Please review and sign it in your profile.`,
    link: memberLink,
  });
  return ref.id;
}

/** Member signs the agreement (locks it). */
export async function signAgreement(
  agreement: Agreement,
  data: { signatureUrl: string; signedName: string; signedDate: string },
): Promise<void> {
  if (!agreement.id) return;
  await updateDoc(doc(db, "agreements", agreement.id), {
    status: "signed" as AgreementStatus,
    signatureUrl: data.signatureUrl,
    signedName: data.signedName,
    signedDate: data.signedDate,
    signedAt: serverTimestamp(),
  });
  // Let the sender know it was signed.
  await sendNotification({
    userId: agreement.sentBy,
    type: "agreement_signed",
    title: "Agreement Signed",
    message: `${agreement.memberName} signed "${agreement.title}".`,
  });
}

/** Delete a sent agreement (admin action — confirmed in the UI; signed ones get a stronger warning). */
export async function deleteAgreement(agreementId: string): Promise<void> {
  await deleteDoc(doc(db, "agreements", agreementId));
}

/** Live list of a member's agreements (for their profile). */
export function watchMemberAgreements(memberId: string, cb: (list: Agreement[]) => void): () => void {
  const q = query(collection(db, "agreements"), where("memberId", "==", memberId));
  return onSnapshot(
    q,
    (snap) => cb(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Agreement)))),
    () => cb([]),
  );
}

/** Live list of agreements a given admin/lead has sent. */
export function watchSentAgreements(sentBy: string, cb: (list: Agreement[]) => void): () => void {
  const q = query(collection(db, "agreements"), where("sentBy", "==", sentBy));
  return onSnapshot(
    q,
    (snap) => cb(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Agreement)))),
    () => cb([]),
  );
}

function sortByCreated(list: Agreement[]): Agreement[] {
  return list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ── Per-category bulk templates ──────────────────────────────────────────────
// One remembered template per admin per category (full_time / part_time), so the
// admin doesn't have to re-paste the same agreement text on every bulk send.

export async function saveAgreementTemplate(adminUid: string, category: string, bodyText: string): Promise<void> {
  await setDoc(doc(db, "agreement_templates", `${adminUid}_${category}`), {
    adminUid,
    category,
    bodyText,
    updatedAt: serverTimestamp(),
  });
}

export async function loadAgreementTemplate(adminUid: string, category: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, "agreement_templates", `${adminUid}_${category}`));
    return (snap.exists() ? (snap.data().bodyText as string) : "") || "";
  } catch {
    return "";
  }
}
