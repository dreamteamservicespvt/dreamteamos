import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { HR_DOCUMENT_LABELS } from "@/types/hr";
import type { HrDocument, HrDocumentType } from "@/types/hr";

/**
 * Issued HR paperwork: `hr_documents`.
 *
 * Its own collection, unlike the rest of the lifecycle, for three reasons that all point the same
 * way: there are many per employee, they are immutable once issued, and they are queried across a
 * whole team ("who still hasn't signed their NDA?"). It deliberately mirrors `agreements` — same
 * chunked `in` watchers, same signing flow — so the two feel like one feature to whoever uses them.
 *
 * The company's signature is applied at issue time from the signatory's stored image; the
 * employee's is applied when they sign. A document therefore always carries the company's mark
 * and, once signed, both.
 */

const COLLECTION = "hr_documents";

export interface IssueDocumentInput {
  document: Omit<HrDocument, "id" | "createdAt" | "status">;
  /** Where the member should be sent to read and sign it. */
  memberLink?: string;
}

/** Issue a document to an employee and tell them it is waiting. Returns the new document id. */
export async function issueDocument({ document, memberLink }: IssueDocumentInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...document,
    status: "issued" as const,
    createdAt: serverTimestamp(),
  });
  try {
    await sendNotification({
      userId: document.memberId,
      type: "hr_document",
      title: document.requiresEmployeeSignature ? "Document to sign" : "New document issued",
      message: document.requiresEmployeeSignature
        ? `${document.issuedByName} sent you your ${HR_DOCUMENT_LABELS[document.type]}. Please review and sign it in your profile.`
        : `${document.issuedByName} issued your ${HR_DOCUMENT_LABELS[document.type]}. You can view and download it from your profile.`,
      ...(memberLink ? { link: memberLink } : {}),
      dedupeKey: `hr_doc_${ref.id}`,
    });
  } catch {
    // Issuing is the part that must not fail — a missed notification is recoverable, a lost
    // document is not.
  }
  return ref.id;
}

/** The employee signs. Locks the document and tells the issuer it came back signed. */
export async function signDocument(
  document: HrDocument,
  data: { signatureUrl: string; signedName: string; signedDate: string },
): Promise<void> {
  if (!document.id) return;
  await updateDoc(doc(db, COLLECTION, document.id), {
    status: "signed" as const,
    employeeSignatureUrl: data.signatureUrl,
    signedName: data.signedName,
    signedDate: data.signedDate,
    signedAt: serverTimestamp(),
  });
  try {
    await sendNotification({
      userId: document.issuedById,
      type: "hr_document_signed",
      title: "Document signed",
      message: `${document.memberName} signed their ${HR_DOCUMENT_LABELS[document.type]}.`,
      dedupeKey: `hr_doc_signed_${document.id}`,
    });
  } catch { /* notification is best-effort */ }
}

/**
 * The employee declines to sign, with a reason.
 *
 * Worth having rather than leaving them stuck on "awaiting signature" forever: an employee who
 * disagrees with a warning letter or a revised term needs a way to say so on the record.
 */
export async function declineDocument(document: HrDocument, reason: string): Promise<void> {
  if (!document.id) return;
  await updateDoc(doc(db, COLLECTION, document.id), {
    status: "declined" as const,
    declinedReason: reason || null,
    declinedAt: serverTimestamp(),
  });
  try {
    await sendNotification({
      userId: document.issuedById,
      type: "hr_document_declined",
      title: "Document not signed",
      message: `${document.memberName} did not sign their ${HR_DOCUMENT_LABELS[document.type]}${reason ? `: ${reason}` : "."}`,
      dedupeKey: `hr_doc_declined_${document.id}`,
    });
  } catch { /* notification is best-effort */ }
}

/** Delete an issued document. Signed ones carry a stronger warning in the UI before this runs. */
export async function deleteDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Seconds since epoch for a Firestore timestamp field, 0 while a serverTimestamp is unresolved. */
const createdSeconds = (d: HrDocument): number => (d.createdAt as { seconds?: number } | null)?.seconds ?? 0;

/** Newest first. Falls back to the printed date so a just-written document still sorts sanely. */
const sortByIssued = (list: HrDocument[]): HrDocument[] =>
  list.sort((a, b) => {
    const byCreated = createdSeconds(b) - createdSeconds(a);
    return byCreated !== 0 ? byCreated : (b.issuedOn || "").localeCompare(a.issuedOn || "");
  });

const mapDocs = (docs: { id: string; data: () => Record<string, unknown> }[]): HrDocument[] =>
  docs.map((d) => ({ id: d.id, ...d.data() } as HrDocument));

/** Live list of one employee's documents — their own profile, and the admin's Documents tab. */
export function watchMemberDocuments(memberId: string, cb: (list: HrDocument[]) => void): () => void {
  if (!memberId) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, COLLECTION), where("memberId", "==", memberId)),
    (snap) => cb(sortByIssued(mapDocs(snap.docs))),
    () => cb([]),
  );
}

/**
 * Live documents for a whole team, in chunked `in` queries — the same shape `agreements` uses,
 * so a team-wide "who is missing what" view costs one read per document and nothing per member.
 */
export function watchTeamDocuments(memberUids: string[], cb: (list: HrDocument[]) => void): () => void {
  const ids = [...new Set(memberUids)].filter(Boolean);
  if (ids.length === 0) { cb([]); return () => {}; }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const results = new Map<number, HrDocument[]>();
  const emit = () => cb(sortByIssued([...results.values()].flat()));
  const unsubs = chunks.map((chunk, idx) =>
    onSnapshot(
      query(collection(db, COLLECTION), where("memberId", "in", chunk)),
      (snap) => { results.set(idx, mapDocs(snap.docs)); emit(); },
      () => { results.set(idx, []); emit(); },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Which document types this employee already has signed — drives the onboarding checklist. */
export function signedTypes(docs: HrDocument[]): HrDocumentType[] {
  return [...new Set(docs.filter((d) => d.status === "signed").map((d) => d.type))];
}

/** Documents still waiting on the employee's signature. */
export function pendingSignature(docs: HrDocument[]): HrDocument[] {
  return docs.filter((d) => d.requiresEmployeeSignature && d.status === "issued");
}
