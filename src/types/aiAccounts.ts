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
  action: "added" | "assigned" | "edited" | "disabled" | "enabled" | "password_changed";
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
  history?: AccountEvent[];
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
