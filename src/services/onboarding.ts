import {
  collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { todayIso } from "@/utils/hrPolicy";
import { buildInviteLetters } from "@/utils/onboardingLetters";
import type { AppUser } from "@/types";
import type { InviteDraft, OnboardingInvite } from "@/types/onboarding";

/**
 * The admin's side of a pending hire.
 *
 * Creating an invite is the only moment the letters are written; from here on this module only
 * reads them back and, if it comes to it, cancels the invite. Everything the candidate does goes
 * through the serverless endpoint instead — see services/onboardingGuest.
 */

const COLLECTION = "onboarding_invites";

/**
 * A link id short enough to survive being pasted into WhatsApp, long enough not to be guessed.
 *
 * 10 characters from a 32-symbol alphabet is a little over 50 bits — an attacker who could try a
 * thousand links a second would still be at it long after the offer expired. The alphabet drops
 * the characters people mis-read aloud (0/O, 1/I/l), because these links get read down a phone.
 */
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function randomValues(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function newInviteId(): string {
  return Array.from(randomValues(10), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

/** Four digits, uniformly distributed — `Math.random()` is not what guards a salary. */
export function newAccessCode(): string {
  return Array.from(randomValues(4), (b) => String(b % 10)).join("");
}

export interface CreateInviteInput {
  draft: InviteDraft;
  /** The admin creating it — their stored signature signs both letters. */
  signatory: AppUser;
  /** Printed under their signature. Their own designation, or the department's default. */
  designation: string;
}

export interface CreatedInvite {
  id: string;
  accessCode: string;
  /** The full link, ready to be shared. */
  url: string;
}

/** The public URL a candidate opens. Same origin as the app they will eventually log in to. */
export const inviteUrl = (id: string): string => `${window.location.origin}/join/${id}`;

/**
 * Write the invite and freeze both letters onto it.
 *
 * The signature is required, not optional: a letter issued without one goes out with an empty
 * signature line, which is worse than no letter at all. The dialog blocks on this too, but the
 * check belongs here as well — this is the function that decides what a candidate will read.
 */
export async function createInvite({ draft, signatory, designation }: CreateInviteInput): Promise<CreatedInvite> {
  if (!signatory.signatureUrl) {
    throw new Error("no_signature");
  }
  const id = newInviteId();
  const accessCode = newAccessCode();
  const issuedOn = todayIso();
  const { offer, joining } = buildInviteLetters({
    draft,
    signatory: { name: signatory.name, designation },
    issuedOn,
  });

  const invite: Omit<OnboardingInvite, "createdAt"> & { createdAt: unknown } = {
    ...draft,
    id,
    accessCode,
    failedAttempts: 0,
    lockedUntil: 0,
    email: draft.email.trim().toLowerCase(),
    offerLetter: offer,
    joiningLetter: joining,
    issuedById: signatory.uid,
    issuedByName: signatory.name,
    issuedByDesignation: designation,
    issuedOn,
    companySignatureUrl: signatory.signatureUrl,
    status: "sent",
    createdAt: serverTimestamp(),
    createdBy: signatory.uid,
  };

  await setDoc(doc(db, COLLECTION, id), invite);
  return { id, accessCode, url: inviteUrl(id) };
}

/**
 * Live invites raised by one admin.
 *
 * Scoped by `createdBy` for the same reason My Team is: an admin manages the people they hired.
 * Completed invites are kept rather than deleted — the person they became is in the team list, and
 * the invite is the record of how they got there — but the UI stops listing them.
 */
export function watchMyInvites(adminUid: string, cb: (list: OnboardingInvite[]) => void): () => void {
  if (!adminUid) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, COLLECTION), where("createdBy", "==", adminUid)),
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id } as OnboardingInvite)).sort(newestFirst)),
    () => cb([]),
  );
}

const createdSeconds = (i: OnboardingInvite): number =>
  (i.createdAt as { seconds?: number } | null)?.seconds ?? 0;

const newestFirst = (a: OnboardingInvite, b: OnboardingInvite): number => createdSeconds(b) - createdSeconds(a);

/** Still waiting on the candidate — what the pending list shows. */
export const isOpen = (i: OnboardingInvite): boolean => i.status === "sent" || i.status === "offer_accepted";

/**
 * Cancel an invite.
 *
 * Kept as a status rather than a delete: an offer that was withdrawn is a fact worth being able to
 * point at later, and the link must start refusing rather than start 404-ing, so the candidate is
 * told to contact the team instead of assuming they mistyped it.
 */
export async function revokeInvite(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: "revoked", updatedAt: serverTimestamp() });
}

/**
 * How many offers this admin has raised this calendar year — the next offer letter number.
 *
 * A count, not a stored counter: two admins raising an offer in the same second would both read
 * the same counter anyway, and the number is a suggestion the admin can overtype. Getting it
 * approximately right without a transaction is the correct trade for a filing reference.
 */
export async function nextOfferSequence(adminUid: string): Promise<number> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where("createdBy", "==", adminUid)));
    const year = String(new Date().getFullYear());
    const thisYear = snap.docs.filter((d) => (d.data().issuedOn as string | undefined)?.startsWith(year));
    return thisYear.length + 1;
  } catch {
    return 1;
  }
}

/** The WhatsApp message that carries the link and the code together. */
export function buildInviteMessage(params: {
  name: string;
  designation: string;
  url: string;
  code: string;
  companyName: string;
}): string {
  const { name, designation, url, code, companyName } = params;
  return [
    `🎉 *Congratulations, ${name}!*`,
    ``,
    `We would like to welcome you to *${companyName}* as *${designation}*.`,
    ``,
    `Please open the link below to read your offer letter, sign it, and get your login for our platform.`,
    ``,
    `🔗 ${url}`,
    `🔒 *Your code:* ${code}`,
    ``,
    `The link will ask for the code before it shows you anything. Please do not share either with anyone else.`,
  ].join("\n");
}
