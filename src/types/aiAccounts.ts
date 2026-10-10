/**
 * AI Accounts — the tech team's Google Flow accounts (Veo video credits) and the paid ChatGPT / Grok
 * accounts, tracked in one place (2026-10-01).
 *
 * ── The Flow campaign this was built for ─────────────────────────────────────────────────────
 * A Jio offer gives an 18-month Google AI Pro plan, and with it 1000 Flow credits a month. Every tech
 * member opens 30 such accounts by the deadline (two a day), the tech admin and team leaders add their
 * own backups, and every ad's video clips are charged to the account the member is using. Credits are
 * entered after each ad (clips × seconds), so the team always knows what is left, where.
 *
 * ── How the data is split ────────────────────────────────────────────────────────────────────
 *  • `flow_accounts/{email}`        — the account, its holder and its running usage. The id IS the
 *                                     normalised email, so the same account can never be added twice.
 *  • `flow_account_secrets/{email}` — the password, apart, so a list never carries passwords and the
 *                                     Firestore rules can close it to everyone but the people who use it.
 *  • `flow_usage/{auto}`            — one row per ad (or manual entry) per account: the ledger. The
 *                                     account's `usedByCycle` is the running total of these rows, kept
 *                                     in the same batch, so lists read one document per account.
 *  • `paid_accounts/{auto}` + `paid_account_secrets/{id}` — ChatGPT / Grok / other paid logins,
 *                                     assigned to members; no credit maths.
 *  • `app_settings/flow_accounts`   — the numbers: credits per clip length, monthly credits, validity,
 *                                     the target and its deadline.
 *  • `gemini_api_keys/{email}`      — the Gemini API key made in that Flow account (2026-10-10), apart
 *                                     like a password; the account carries only `apiKey` (its status).
 *
 * Every field added later stays optional: absent means the default.
 */
import type { UserRole } from "./index";

/** Clip lengths Flow charges for, in seconds. 8 is the default — it is what the generator plans. */
export type FlowClipSeconds = 4 | 6 | 8 | 10;
export const FLOW_CLIP_SECONDS: FlowClipSeconds[] = [4, 6, 8, 10];

export type FlowAccountStatus = "active" | "disabled";

/** Something that happened to an account — shown as its history ("assigned to Ravi by Kiran"). */
export interface AccountEvent {
  /** ms since epoch. */
  at: number;
  action: "added" | "assigned" | "edited" | "disabled" | "enabled" | "password_changed"
    | "api_key_added" | "api_key_replaced" | "api_key_removed";
  byId: string;
  byName: string;
  /** For "assigned": who had it, and who has it now. */
  fromId?: string;
  fromName?: string;
  toId?: string;
  toName?: string;
}

export interface FlowAccount {
  /** The normalised (lower-case) email — also the document id. */
  id: string;
  email: string;
  /** The phone number the account verifies its login with (the Jio number). */
  phone: string;
  /** The day the Google account was created — yyyy-MM-dd. Credits reset on this day each month. */
  createdOn: string;
  /** createdOn + validity (18 months) — yyyy-MM-dd. Worked out in code, never typed. */
  expiresOn: string;
  /** Credits each monthly cycle (1000). */
  monthlyCredits: number;
  /** Who entered it. */
  addedBy: string;
  addedByName: string;
  addedByRole: UserRole;
  /** Whose account it is in the target count — the member who opened it (or the admin's backup). */
  ownerId: string;
  ownerName: string;
  /** Who uses it now. The owner, unless an admin or leader assigned it to someone else. */
  holderId: string;
  holderName: string;
  /** Everyone allowed to see it besides the managers: the one who added it, the owner and the holder. */
  visibleTo: string[];
  /** The tech admin whose team this account belongs to — every manager query is scoped on it. */
  teamAdminId: string;
  status: FlowAccountStatus;
  /** Credits used, by cycle start date (yyyy-MM-dd) — the running total of the usage ledger. */
  usedByCycle?: Record<string, number>;
  lastUsedAt?: number;
  lastUsedByName?: string;
  notes?: string;
  /**
   * The Gemini API key made in this Google account — only that it exists and how it stands, never the
   * key itself (that is in `gemini_api_keys/{id}`, read on Show/Copy). Absent = no key yet (2026-10-10).
   */
  apiKey?: ApiKeySummary;
  history?: AccountEvent[];
  createdAt?: any;
  updatedAt?: any;
}

// ── Gemini API keys (2026-10-10) ──────────────────────────────────────────────────────────────────
// Every Flow account is a Google account, and each can make one free Gemini API key in AI Studio (in a
// project called "aiads"). A free key is its own project's quota, so a key from every account is a large
// pool for DTS AdGen's prompt generation. Members add the key on the account's card; the tech admin
// lists, checks, copies and downloads them (as a .env for Vercel) and labels the ones deployed "in use".
// AdGen itself still reads its keys from the environment (API_KEY_1 … API_KEY_30) — the owner deploys them.

/** Where a key stands: Google answered it, refused it (invalid / leaked / disabled), or was not reached. */
export type ApiKeyStatus = "working" | "failed" | "unchecked";

/** What the account list carries about its key — enough for the card and the counts, never the key. */
export interface ApiKeySummary {
  /** A one-way fingerprint of the key (utils/geminiKeys) — how the same key pasted twice is caught. */
  fingerprint: string;
  status: ApiKeyStatus;
  /** Google's own words when it refused the key ("Your API key was reported as leaked…"). */
  message?: string;
  /** ms since epoch. */
  addedAt: number;
  addedByName?: string;
  checkedAt?: number;
}

/** gemini_api_keys/{flow account id} — the key itself, read only by the tech admin and the account's people. */
export interface GeminiApiKey {
  /** = the Flow account's id (its lower-case email): one key per account. */
  id: string;
  accountId: string;
  accountEmail: string;
  key: string;
  fingerprint: string;
  /** Whose Flow account it is — the person the tech admin's list is grouped by. */
  ownerId: string;
  ownerName: string;
  /** Who pasted it (the owner, nearly always), and when (ms). */
  addedById: string;
  addedByName: string;
  addedAt: number;
  /** The tech admin whose team the account belongs to — the admin's list is scoped on it. */
  teamAdminId: string;
  status: ApiKeyStatus;
  statusMessage?: string;
  checkedAt?: number;
  /** The tech admin's label: this key is deployed to AdGen (pasted into Vercel). A new key starts false. */
  inUse?: boolean;
  inUseAt?: number;
  inUseByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

/** One line of a credit entry: this many clips of this length. */
export interface FlowClipRow {
  seconds: FlowClipSeconds;
  count: number;
}

export interface FlowUsageEntry {
  id: string;
  accountId: string;
  accountEmail: string;
  /** Who used the credits. */
  userId: string;
  userName: string;
  teamAdminId: string;
  /** The job the credits were spent on, when it was a job. */
  assignmentId?: string;
  uniqueId?: string;
  businessName?: string;
  rows: FlowClipRow[];
  /** Σ count × credits for that length, at the rates when it was entered. */
  credits: number;
  /** The account's credit cycle the entry counts in — its start date, yyyy-MM-dd. */
  cycleStart: string;
  /** The day it was entered — yyyy-MM-dd — and its month (yyyy-MM), which the history is queried by. */
  date: string;
  month: string;
  source: "completion" | "manual";
  note?: string;
  createdAt?: any;
  updatedAt?: any;
  editedById?: string;
  editedByName?: string;
}

export interface FlowSettings {
  /** Credits per clip, by its length in seconds. */
  clipCredits: Record<FlowClipSeconds, number>;
  monthlyCredits: number;
  /** How long an account lasts from its creation date. */
  validityMonths: number;
  /** Accounts each member must open… */
  targetPerMember: number;
  /** …from this day… */
  campaignStart: string;
  /** …by this day (yyyy-MM-dd)… */
  deadline: string;
  /** …at this pace. */
  dailyTarget: number;
}

export type PaidProvider = "chatgpt" | "grok" | "other";

export interface PaidAccount {
  id: string;
  provider: PaidProvider;
  /** What the team calls it — "ChatGPT Plus #2". */
  label: string;
  email: string;
  /** What it is used for, or the plan name. */
  plan?: string;
  notes?: string;
  /** When the subscription renews — yyyy-MM-dd. */
  renewsOn?: string;
  /** The members it is assigned to. */
  assignedTo: string[];
  /** Their names, by uid, for lists. */
  assignedNames?: Record<string, string>;
  teamAdminId: string;
  addedBy: string;
  addedByName: string;
  history?: AccountEvent[];
  createdAt?: any;
  updatedAt?: any;
}

/** A password, kept apart from the account it opens (see the note at the top). */
export interface AccountSecret {
  password: string;
  updatedAt?: any;
  updatedById?: string;
}
