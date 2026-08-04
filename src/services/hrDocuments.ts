import {
  addDoc, collection, deleteDoc, doc, getDocs, increment, onSnapshot, query, runTransaction,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { clearOfferDates, syncOfferDates } from "@/services/hr";
import { sendNotification } from "@/services/notifications";
import { formatDocumentRef, refCounterDocId, refYear } from "@/utils/documentRef";
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
const COUNTERS = "hr_counters";

/**
 * Take the next number in a document series, atomically.
 *
 * A transaction rather than a plain increment because two admins issuing an offer letter in the
 * same minute must not both be handed `0007`. One counter document per year holds a field per type,
 * so this costs one read and one write however many series are running.
 *
 * Returns null when the number cannot be allocated — a permissions problem, an offline browser.
 * The letter is then issued without a reference rather than not at all: a document that exists
 * with no reference can be given one later; a document that was never issued because a counter was
 * unreachable is a worse failure, and the admin has no idea why.
 */
const REFERENCE_TIMEOUT_MS = 6000;

export async function allocateReference(
  companyName: string,
  type: HrDocumentType,
  issuedOn: string,
): Promise<string | null> {
  const year = refYear(issuedOn);
  try {
    const allocate = runTransaction(db, async (tx) => {
      const ref = doc(db, COUNTERS, refCounterDocId(year));
      const snap = await tx.get(ref);
      const current = snap.exists() ? Number((snap.data() as Record<string, unknown>)[type] ?? 0) : 0;
      const next = (Number.isFinite(current) ? current : 0) + 1;
      tx.set(ref, { [type]: next, year, updatedAt: serverTimestamp() }, { merge: true });
      return next;
    });
    // A Firestore transaction on an offline or throttled client retries rather than failing, so
    // without this the Issue button would sit and spin with nothing to show for it. Six seconds,
    // then the letter goes out unnumbered — the document matters more than its reference.
    const seq = await Promise.race([
      allocate,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REFERENCE_TIMEOUT_MS)),
    ]);
    return seq === null ? null : formatDocumentRef(companyName, type, year, seq);
  } catch {
    return null;
  }
}

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

  /**
   * The offer letter's date IS "Offer issued on". Mirrored onto the employment record so the
   * lifecycle strip and the Documents tab stop being able to disagree about whether an offer went
   * out. `onlyIfUnset` so an admin who typed a deliberate date keeps it — the letter fills a blank,
   * it does not overrule a decision.
   */
  if (document.type === "offer_letter" && document.memberId) {
    await syncOfferDates(document.memberId, { offerIssuedOn: document.issuedOn }, { onlyIfUnset: true });
  }

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

  /**
   * Signing the offer letter IS the acceptance, so the record says so.
   *
   * This one is not `onlyIfUnset`: a signature carries its own date and is the strongest evidence
   * there is of when an offer was accepted. It overwrites a typed guess, which is the right way
   * round — an admin's estimate should give way to the day the employee actually signed.
   */
  if (document.type === "offer_letter" && document.memberId) {
    await syncOfferDates(document.memberId, { offerAcceptedOn: data.signedDate });
  }

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

/**
 * Delete an issued document. Signed ones carry a stronger warning in the UI before this runs.
 *
 * ── Why this also touches the employment record ───────────────────────────────────────────────
 * "Offer letter issued" and "Offer accepted" are two facts kept in two places: the letter itself,
 * and a pair of dates on the employment record that the hiring flow writes at the same moment it
 * writes the letter. The lifecycle strip reads either. Delete the letter and only half the fact
 * goes — the strip carries on saying the offer was issued and accepted while the Documents tab
 * says nothing was ever issued, and there is no way to tell which of the two is lying.
 *
 * So the dates go with the last offer letter, and only the last one: an admin who withdraws one of
 * two offer letters has not un-hired anybody. An admin who did mean to keep the date can type it
 * back into Employment terms, where it is theirs to set.
 */
export async function deleteDocument(document: HrDocument | string): Promise<void> {
  const id = typeof document === "string" ? document : document.id;
  if (!id) return;
  await deleteDoc(doc(db, COLLECTION, id));

  if (typeof document === "string" || document.type !== "offer_letter" || !document.memberId) return;
  try {
    const remaining = await getDocs(query(
      collection(db, COLLECTION),
      where("memberId", "==", document.memberId),
      where("type", "==", "offer_letter"),
    ));
    if (remaining.empty) await clearOfferDates(document.memberId);
  } catch {
    // The letter is gone either way. A record left with a stale date is a smaller wrong than a
    // delete that appears to have failed.
  }
}

/**
 * Swap the `Email:` line in a letter's frozen text.
 *
 * A letter is stored as text, not as fields, so correcting the address on one already issued means
 * a targeted rewrite of that one line. Deliberately narrow: it matches only the header line
 * `letterHead` writes, anchored to the start of a line, and leaves an email that appears anywhere
 * else in the body — inside a clause, in an address block — completely alone.
 *
 * Returns null when there is nothing to change, so callers can skip the write.
 */
export function replaceLetterEmail(bodyText: string, email: string): string | null {
  const line = `Email: ${email}`;
  const pattern = /^Email:.*$/m;
  if (!pattern.test(bodyText)) return null;
  const next = bodyText.replace(pattern, line);
  return next === bodyText ? null : next;
}

/** A document whose printed email is out of date and which may still be corrected. */
export function documentsNeedingEmailRefresh(docs: HrDocument[], email: string): HrDocument[] {
  if (!email.trim()) return [];
  return docs.filter((d) => {
    // Signed documents are records of what was actually signed. Rewriting one would change a page
    // somebody put their name to, so they are reported to the admin and never edited.
    if (d.status !== "issued") return false;
    return !!d.bodyText && replaceLetterEmail(d.bodyText, email) !== null;
  });
}

/** Signed documents still carrying a different address — shown to the admin, never rewritten. */
export function signedDocumentsWithStaleEmail(docs: HrDocument[], email: string): HrDocument[] {
  if (!email.trim()) return [];
  return docs.filter(
    (d) => d.status === "signed" && !!d.bodyText && replaceLetterEmail(d.bodyText, email) !== null,
  );
}

/**
 * Correct the printed email on every unsigned document this employee holds.
 *
 * The existing team's letters were all written before the personal email was collected, so they
 * carry the login address — an account the employee loses on their last day, which is one of the
 * two occasions the letter is most needed. Returns how many were rewritten.
 */
export async function refreshDocumentEmails(docs: HrDocument[], email: string): Promise<number> {
  const targets = documentsNeedingEmailRefresh(docs, email);
  let n = 0;
  for (const d of targets) {
    const bodyText = replaceLetterEmail(d.bodyText || "", email);
    if (!bodyText || !d.id) continue;
    await updateDoc(doc(db, COLLECTION, d.id), { bodyText, contactRefreshedAt: serverTimestamp() });
    n += 1;
  }
  return n;
}

/**
 * Record that the employee opened their document, once.
 *
 * "Issued" and "read" are different facts, and only the first of them was ever provable. The write
 * happens only on the first open and only for the employee themselves — an admin reviewing a
 * warning letter must not leave a trace that looks like the employee read it.
 */
export async function markViewed(document: HrDocument): Promise<void> {
  if (!document.id || document.firstViewedAt) return;
  try {
    await updateDoc(doc(db, COLLECTION, document.id), { firstViewedAt: serverTimestamp() });
  } catch { /* a lost read-receipt must never break opening the document */ }
}

/** Record that a copy was taken away. Counted, because "they downloaded it twice" is the question. */
export async function markDownloaded(id?: string): Promise<void> {
  if (!id) return;
  try {
    await updateDoc(doc(db, COLLECTION, id), {
      lastDownloadedAt: serverTimestamp(),
      downloadCount: increment(1),
    });
  } catch { /* the download already happened; failing to note it changes nothing for the user */ }
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
