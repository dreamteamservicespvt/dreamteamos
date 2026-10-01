/**
 * Flow Accounts — the Google AI Pro accounts the tech team makes videos with, and the paid ChatGPT /
 * Grok accounts the team shares.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 * A Jio offer gives 18 months of Google AI Pro, and with it 1,000 Flow credits a month — the credits
 * every AI video clip is made with. The tech team is building a pool of these accounts (30 per member,
 * by a deadline), and the credits are spent ad by ad. Without one place to record them, nobody knew
 * how many accounts existed, whose they were, which one a member was on, or how many credits were
 * left this month. Every credit spent is recorded against the ad it was spent on.
 *
 * Collections: `flow_accounts` (doc id = the account email, so the same account can never be added
 * twice), `flow_credit_logs`, `paid_accounts`, and the settings doc `app_settings/flow_accounts`.
 * See docs/firestore-rules.md — these hold readable passwords.
 */
import type { UserRole } from "./index";

/** Blocked = Google locked or suspended it. Expired is never stored — it is read off the date. */
export type FlowAccountStatus = "active" | "blocked";

/** One thing that happened to an account, for the "who added / who assigned" history. */
export interface FlowAccountEvent {
  /** ms since epoch. */
  at: number;
  by: string;
  byName: string;
  kind: "added" | "assigned" | "unassigned" | "edited" | "blocked" | "unblocked";
  to?: string;
  toName?: string;
}

export interface FlowAccount {
  id: string;
  /** Lower-cased. Also the document id's source — see utils/flowAccounts flowAccountDocId. */
  email: string;
  /** Readable on purpose — the team logs in with it. Shown masked until asked for. */
  password: string;
  /** The phone number the account's sign-in / 2-step code goes to (the Jio number), "+91…". */
  authPhone: string;
  /** yyyy-MM-dd — the day the account (and its 18-month offer) began. */
  createdOn: string;
  /** yyyy-MM-dd — createdOn + the offer's validity (18 months). Stored so lists can sort by it. */
  expiresOn: string;
  /** Credits the account receives each month (1,000 on Google AI Pro). */
  monthlyCredits: number;
  status: FlowAccountStatus;

  /** Who added it — the member whose drive target it counts toward. */
  addedBy: string;
  addedByName: string;
  addedByRole: UserRole;

  /** Who holds it now, when that is someone other than the one who added it. */
  assignedTo: string | null;
  assignedToName?: string;
  assignedBy?: string;
  assignedByName?: string;
  assignedAt?: number;

  /** Everyone who may see it: who added it and who holds it — the member query's array-contains. */
  memberIds: string[];
  /** The tech admin whose team this account belongs to — the managers' query. */
  teamAdminId: string;

  /** The member currently making videos on it ("I'm using this account now"). */
  inUseBy: string | null;
  inUseByName?: string;
  inUseSince?: number;

  /**
   * Credits spent, per credit month — keyed by the month's first day (yyyy-MM-dd), because an
   * account's month starts on the day of the month it was created, like its subscription.
   */
  used: Record<string, number>;
  history: FlowAccountEvent[];
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** How many clips of each length an ad used. */
export interface FlowClipCounts {
  s10: number;
  s8: number;
  s6: number;
  s4: number;
}

/** One spend of credits on one account — usually one ad, recorded when it is marked complete. */
export interface FlowCreditLog {
  id: string;
  accountId: string;
  accountEmail: string;
  /** Who spent the credits. */
  userId: string;
  userName: string;
  teamAdminId: string;
  /** The job the credits were spent on, when there was one. */
  assignmentId?: string;
  uniqueId?: string;
  businessName?: string;
  category?: string;
  clips: FlowClipCounts;
  /** What the clips cost by the price list. */
  calculated: number;
  /** What was actually spent — the member may correct the calculation. */
  credits: number;
  /** True when `credits` differs from `calculated`. */
  manual: boolean;
  note?: string;
  /** The account's credit month this spend belongs to (its first day, yyyy-MM-dd). */
  cycle: string;
  /** yyyy-MM-dd the credits were spent. */
  date: string;
  /** yyyy-MM — the calendar month, for listing a month of spending. */
  month: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  editedBy?: string;
  editedByName?: string;
}

/** What a job records once its Flow credits are in — see services/flowAccounts logFlowCredits. */
export interface WorkFlowCredits {
  total: number;
  logIds: string[];
  /** ms since epoch. */
  recordedAt: number;
  recordedBy: string;
  /** The ad was made without Flow (another tool), said explicitly rather than left blank. */
  none?: boolean;
  noneReason?: string;
}

/** The drive's target and the price list — editable by the tech admin and team leader. */
export interface FlowSettings {
  /** Accounts each tech member must add. */
  targetPerMember: number;
  /** Accounts a member is asked to add per day. */
  dailyGoal: number;
  /** yyyy-MM-dd the drive started. */
  driveStart: string;
  /** yyyy-MM-dd the target must be met by. */
  driveDeadline: string;
  /** Credits a new account receives each month. */
  monthlyCredits: number;
  /** How long the offer lasts, in months. */
  validityMonths: number;
  /** Credits one clip of each length costs. */
  clipCosts: FlowClipCounts;
}

export type PaidPlatform = "chatgpt" | "grok" | "other";

/** A paid account shared by the team — ChatGPT for frames and posters, Grok for animation clips. */
export interface PaidAccount {
  id: string;
  platform: PaidPlatform;
  /** What the team calls it — "ChatGPT Plus #1". */
  label: string;
  email: string;
  password: string;
  plan?: string;
  /** yyyy-MM-dd the subscription renews or ends. */
  renewsOn?: string;
  notes?: string;
  assignees: { uid: string; name: string }[];
  /** The member query's array-contains. */
  assigneeIds: string[];
  teamAdminId: string;
  addedBy: string;
  addedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
