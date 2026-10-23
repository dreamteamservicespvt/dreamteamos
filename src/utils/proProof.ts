/**
 * Pro proof — the pure rules behind "is this Flow account really Google AI Pro?" (2026-10-23).
 *
 * ── Why ──
 * Every Flow credit the team counts on comes from a Google AI Pro account (the Jio offer). Nothing in the
 * app knew whether an account really is Pro: an offer that was never activated looks exactly like one
 * that was, until a member opens Flow and finds no credits. So each account now carries a screenshot of
 * its Google Account page (https://myaccount.google.com — the "Pro" badge, the FULL email and Google's
 * address bar in one picture; the Gemini account menu cuts a long email short, so it cannot prove which
 * account it is). The tech admin or a team leader looks at it next to the card's email and confirms it.
 *
 * Before a picture is sent the app reads it (services/aiAccounts.readProProofImage) and compares what it
 * read with the account — that is advice for the reviewer, never a decision: a person always confirms.
 * The same picture sent for two accounts is caught by its hash.
 *
 * No React, no Firestore — tested in src/test/proProofOct23.test.tsx.
 */
import type { AppUser } from "@/types";
import type { FlowAccount, ProProofReading, ProProofStatus, ProProofVerdict } from "@/types/aiAccounts";

/** Where the proof is taken: the Google Account home page. */
export const PRO_PROOF_PAGE = "https://myaccount.google.com/";

/** The page opened in THIS account — `authuser` picks it when several accounts are signed in on one Chrome. */
export function proProofPageUrl(email: string): string {
  return `${PRO_PROOF_PAGE}?authuser=${encodeURIComponent(email.trim())}`;
}

export type ProProofState = "none" | ProProofStatus;

export function proProofStateOf(account: Pick<FlowAccount, "proProof">): ProProofState {
  return account.proProof?.status || "none";
}

/** The card's pill: what each state says and its colour. */
export const PRO_PROOF_STATE: Record<ProProofState, { label: string; tone: string }> = {
  none: { label: "Not sent", tone: "bg-muted text-muted-foreground" },
  submitted: { label: "Waiting for check", tone: "bg-info/15 text-info" },
  confirmed: { label: "Pro confirmed", tone: "bg-success/15 text-success" },
  rejected: { label: "Sent back", tone: "bg-destructive/15 text-destructive" },
};

/** What the app's reading says, for the reviewer. */
export const PRO_PROOF_VERDICT: Record<ProProofVerdict, { label: string; tone: string }> = {
  match: { label: "Email and Pro match", tone: "text-success" },
  mismatch: { label: "Does not match", tone: "text-destructive" },
  unclear: { label: "Could not read all of it", tone: "text-warning" },
  unchecked: { label: "Not read by the app", tone: "text-muted-foreground" },
};

/** The reasons a reviewer picks from when sending a proof back (they can also type their own). */
export const SEND_BACK_REASONS = [
  "Another account's screenshot — the email is not this account's",
  "No Pro badge — this account is not on Google AI Pro",
  "The email is cut off or cannot be read",
  "Not the Google Account page — take it on myaccount.google.com",
] as const;

/** Who checks proofs and confirms Pro: the tech admin and the team leaders (and the main admin). */
export function canReviewProProof(user: Pick<AppUser, "role"> | null | undefined): boolean {
  return user?.role === "tech_admin" || user?.role === "tech_team_leader" || user?.role === "main_admin";
}

/**
 * Who may send a proof for an account: its own people (whoever added, opened or uses it) and the
 * reviewers. A confirmed proof is replaced only by a reviewer — a member cannot swap the picture behind
 * a confirmation.
 */
export function canSendProProof(
  user: Pick<AppUser, "uid" | "role"> | null | undefined,
  account: Pick<FlowAccount, "visibleTo" | "proProof">,
): boolean {
  if (!user?.uid) return false;
  if (canReviewProProof(user)) return true;
  if (!(account.visibleTo || []).includes(user.uid)) return false;
  return proProofStateOf(account) !== "confirmed";
}

/**
 * Gmail ignores dots and capitals, so "Chaitanya.Rao@gmail.com" and "chaitanyarao@gmail.com" are one
 * account; any other domain is compared as written (lower-case).
 */
export function sameEmail(a: string, b: string): boolean {
  const norm = (e: string) => {
    const [user = "", domain = ""] = e.trim().toLowerCase().split("@");
    if (domain === "gmail.com" || domain === "googlemail.com") return `${user.split("+")[0].replace(/\./g, "")}@gmail.com`;
    return `${user}@${domain}`;
  };
  return !!a.trim() && !!b.trim() && norm(a) === norm(b);
}

/** The first `{…}` in a model's reply, parsed — a fenced or chatty reply still reads. */
function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const yesNo = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);

/**
 * Turns the reader's reply into a verdict for THIS account. A mismatch needs a reason the reviewer can
 * see (another email, no Pro badge); anything the reader could not see is `unclear`, never a match.
 */
export function proProofReadingFrom(reply: string | null | undefined, accountEmail: string): ProProofReading {
  const raw = reply ? firstJsonObject(reply) : null;
  if (!raw) return { verdict: "unclear", email: "", pro: null, accountPage: null, note: "The app could not read this picture." };
  const email = typeof raw.email === "string" && raw.email.includes("@") ? raw.email.trim() : "";
  const pro = yesNo(raw.pro);
  const accountPage = yesNo(raw.accountPage);
  if (email && !sameEmail(email, accountEmail)) {
    return { verdict: "mismatch", email, pro, accountPage, note: `Shows another email: ${email}` };
  }
  if (pro === false) return { verdict: "mismatch", email, pro, accountPage, note: "No Pro badge in the picture." };
  if (!email) return { verdict: "unclear", email, pro, accountPage, note: "The full email cannot be read in the picture." };
  if (pro !== true) return { verdict: "unclear", email, pro, accountPage, note: "The Pro badge cannot be seen." };
  return {
    verdict: "match", email, pro, accountPage,
    note: accountPage === false ? "Email and Pro match, but it is not the Google Account page." : "The email and the Pro badge match this account.",
  };
}

/** When the reader could not be reached — the proof still goes; the reviewer just looks without advice. */
export const UNCHECKED_READING: ProProofReading = {
  verdict: "unchecked", email: "", pro: null, accountPage: null, note: "The app could not read it just now — check it by eye.",
};

/** Another account this exact picture was already sent for (by its hash), or null. */
export function duplicateProofOf(hash: string, accounts: FlowAccount[], selfId: string): FlowAccount | null {
  if (!hash) return null;
  return accounts.find((a) => a.id !== selfId && a.proProof?.imageHash === hash) || null;
}

export interface ProProofCounts {
  /** Accounts that need a proof (disabled ones do not). */
  total: number;
  none: number;
  submitted: number;
  confirmed: number;
  rejected: number;
  /** Proof sent at all: waiting + confirmed + sent back. */
  sent: number;
}

/** The four numbers, over accounts still in use — a disabled account needs no proof. */
export function proProofCounts(accounts: FlowAccount[]): ProProofCounts {
  const counts: ProProofCounts = { total: 0, none: 0, submitted: 0, confirmed: 0, rejected: 0, sent: 0 };
  for (const a of accounts) {
    if (a.status === "disabled") continue;
    counts.total += 1;
    counts[proProofStateOf(a)] += 1;
  }
  counts.sent = counts.submitted + counts.confirmed + counts.rejected;
  return counts;
}

export interface MemberProProofRow extends ProProofCounts {
  uid: string;
  name: string;
}

/**
 * Each person's numbers, by the accounts they OPENED (the owner — the same count as their target),
 * worst first: the most still to send or fix on top, so the leader knows whom to chase.
 */
export function memberProProofRows(accounts: FlowAccount[]): MemberProProofRow[] {
  const byOwner = new Map<string, { name: string; accounts: FlowAccount[] }>();
  for (const a of accounts) {
    const row = byOwner.get(a.ownerId) || { name: a.ownerName, accounts: [] };
    row.accounts.push(a);
    byOwner.set(a.ownerId, row);
  }
  return [...byOwner.entries()]
    .map(([uid, { name, accounts: own }]) => ({ uid, name, ...proProofCounts(own) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => (b.none + b.rejected) - (a.none + a.rejected) || a.name.localeCompare(b.name));
}

/**
 * The accounts a person still has to send a proof for, in the order "Send next proof" walks them: the
 * ones sent back first (they were told what to fix), then the ones never sent, oldest first.
 */
export function proProofToSend(accounts: FlowAccount[], uid: string): FlowAccount[] {
  const rank = (a: FlowAccount) => (proProofStateOf(a) === "rejected" ? 0 : 1);
  return accounts
    .filter((a) => a.ownerId === uid && a.status !== "disabled" && ["none", "rejected"].includes(proProofStateOf(a)))
    .sort((a, b) => rank(a) - rank(b) || (a.createdOn || "9999").localeCompare(b.createdOn || "9999") || a.email.localeCompare(b.email));
}

/**
 * The reviewer's queue: proofs waiting for a check. The ones the app flagged (another email, no Pro, the
 * same picture twice) come first — they need a person most — then the rest, oldest first.
 */
export function proProofReviewQueue(accounts: FlowAccount[]): FlowAccount[] {
  const flagged = (a: FlowAccount) => (a.proProof?.reading?.verdict === "mismatch" || a.proProof?.duplicateOf ? 0 : 1);
  return accounts
    .filter((a) => a.status !== "disabled" && proProofStateOf(a) === "submitted")
    .sort((a, b) => flagged(a) - flagged(b) || (a.proProof!.submittedAt - b.proProof!.submittedAt));
}

/** The instruction the screenshot reader is given — it returns only what it can SEE. */
export const PRO_PROOF_READER_PROMPT = [
  "This is a screenshot a person took to prove a Google account is on the Google AI Pro plan.",
  "Read only what is visible in the picture. Do not guess.",
  'Answer with JSON only: {"email": string, "pro": boolean, "accountPage": boolean}.',
  '"email": the full email address of the signed-in Google account as shown in the picture, exactly as written; "" if no full email is readable (cut off with "…" counts as not readable).',
  '"pro": true when the account shows a "Pro" badge or "Google AI Pro" plan; false when the account is shown and has no such badge.',
  '"accountPage": true when it is the Google Account page (myaccount.google.com, the "Google Account" title).',
].join("\n");
