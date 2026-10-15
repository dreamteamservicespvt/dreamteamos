/**
 * SMM Delivery Control (2026-10-15, `.claude/rules/smm.md` §9.9) — the company-wide switch and the
 * numbers it runs on, in ONE document: `app_settings/smm_delivery`.
 *
 * ── What it is for ──────────────────────────────────────────────────────────────────────────────
 * The owner: "Social media management is happening, but the work is not done … we have to inform them
 * manually every time." Delivery Control divides each client's month into weekly tasks with a deadline at
 * each week's end, and escalates in full-screen alerts until the work is done. This document holds what the
 * admins may tune — the deadline hour, the checkpoints inside a week, the quiet hours, the escalation
 * ladder — and the switch itself:
 *   • `off`     — nothing runs; the classic Social Media works exactly as before;
 *   • `preview` — the new screens show what WOULD happen; nothing is saved, nobody is alerted;
 *   • `live`    — plans are saved and the alerts run.
 * A missing document is `preview` with every default (`utils/smmDeliverySettings.DEFAULT_SMM_DELIVERY`).
 *
 * Only the tech admin and the main admin change it, and turning it OFF needs a reason the owner is told
 * (owner's decision 14). The server checker (phase 6) writes only `lastRunAt` + `lastRunSummary`, its heartbeat.
 * Read and written through `services/smmDeliverySettings`; numbers checked by `utils/smmDeliverySettings`.
 */

export type SmmDeliveryMode = "off" | "preview" | "live";

/**
 * The checkpoints inside a week — each is a number of WORKING days before the week's deadline (Mon–Sat,
 * company holidays skipped). The deadline stays the week's end; these only warn early.
 */
export interface SmmDeliveryCheckpoints {
  /** An AI video sent to the client for approval. */
  sendVideo: number;
  /** A long video (`clipsPerVideo` at or above `longVideoClips`) gets this many more days. */
  longVideoExtraDays: number;
  longVideoClips: number;
  /** A poster sent to the client. */
  sendPoster: number;
  /** A real video sent to the client. */
  sendRealVideo: number;
  /** The real video's footage in hand — the salesperson collects it from the client. */
  footage: number;
  /** The client's approval in. */
  approved: number;
}

/** Hours (24 h, India time) in which only critical alerts may take the screen. */
export interface SmmDeliveryQuietHours {
  /** From this hour in the evening … */
  fromHour: number;
  /** … until this hour the next morning. */
  toHour: number;
  /** All Sunday is quiet. */
  sundays: boolean;
  /** An announced company holiday (`holidays/{date}`) is quiet. */
  holidays: boolean;
}

/** The escalation ladder and the limits that keep it from looping (the plan's defaults). */
export interface SmmDeliveryLadder {
  /** On the deadline day, at this hour, the owner of unfinished tasks gets a full screen. */
  deadlineDayHour: number;
  /** After the deadline, the owner is asked again every this many hours until they answer. */
  repeatHours: number;
  /** Working days after the deadline that the Social Media Team Lead and the tech team leaders are alerted. */
  leadAfterWorkingDays: number;
  /** Working days after the deadline that the tech admin and the main admin are alerted. */
  adminAfterWorkingDays: number;
  /** Days an approval may wait before the salesperson is alerted … */
  approvalSalespersonDays: number;
  /** … and before the sales admin is. */
  approvalSalesAdminDays: number;
  /** Working days after the footage checkpoint that the sales admin is alerted. */
  footageSalesAdminDays: number;
  /** The marketer's daily ad report is due by this hour. */
  adReportHour: number;
  /** Days after a video went live by which its ad campaign should have started. */
  adCampaignStartDays: number;
  /** Days extra work may stay unbilled after it went live before the salesperson is alerted. */
  extraUnbilledDays: number;
  /** "Do it now" — minutes of quiet, renewable once. */
  focusMinutes: number;
  /** "I'm on it" (a lead or an admin) — hours of quiet. */
  onItHours: number;
  /** A "Blocked" answer expires after this many hours unless the person who must clear it confirms it. */
  blockHours: number;
  /** "Need more time" — at most this many per task (today only, never past the deadline). */
  moreTimePerTask: number;
  /** Reassigns a team leader may make before an admin must (the next one needs an admin). */
  reassignsBeforeAdmin: number;
  /** Revisions before the salesperson and an admin are told "the client keeps changing". */
  revisionsBeforeWarning: number;
  /** Days on which an unanswered client is chased; after the last, "not responding" goes to the sales admin. */
  clientChaseDays: number[];
  /** The rehearsal's target: full-screen alerts per person per day. */
  maxFullScreenPerDay: number;
  /** A full screen only on data synced within this many minutes. */
  freshMinutes: number;
  /**
   * Pieces one person can make in a week across all their clients. Above it the admins get ONE
   * "rebalance" alert and that person's early-warning screens are held back (capacity check, 2026-10-15).
   */
  weeklyLoadLimit: number;
}

/** One change of the switch, kept on the document (the latest 20). */
export interface SmmDeliverySwitch {
  mode: SmmDeliveryMode;
  /** ms */
  at: number;
  byUid: string;
  byName: string;
  /** Why — required when turning it off. */
  reason?: string | null;
}

export interface SmmDeliverySettings {
  mode: SmmDeliveryMode;
  /** The pilot group: while it is not empty, only these people get alerts in Live. */
  pilotUids: string[];
  /** A week's deadline: its last working day at this hour (24 h, India time). */
  deadlineHour: number;
  checkpoints: SmmDeliveryCheckpoints;
  quietHours: SmmDeliveryQuietHours;
  ladder: SmmDeliveryLadder;
  /** While off: why, when and who (cleared when it is turned back on). */
  offReason?: string | null;
  offAt?: unknown;
  offByUid?: string | null;
  offByName?: string | null;
  /** The switch's history, newest last (at most 20). */
  history?: SmmDeliverySwitch[];
  updatedAt?: unknown;
  updatedByUid?: string | null;
  updatedByName?: string | null;
  /** The server checker's heartbeat (phase 6). Written by the server only. */
  lastRunAt?: unknown;
  /**
   * What the server checker's last run did (phase 6, `api/smm-monitor.ts`), written with `lastRunAt` after
   * every SUCCESSFUL run — a run that fails writes neither, so a stale `lastRunAt` is how Settings knows the
   * supervisor stopped. Absent until the first run; read leniently (`parseSmmDeliverySettings` → null when
   * unreadable).
   */
  lastRunSummary?: SmmDeliveryRunSummary | null;
}

/**
 * One run of the server checker (phase 6). `months` = active months read; `alerts` = alerts the supervisor
 * computed (delivered or held); `delivered` = notifications newly written this run (each key once, ever);
 * `errors` = months that could not be checked + reads that failed + notifications or pushes that failed;
 * `deferred` = alerts left for the next run because the time budget ran out; `pushed` = push messages FCM
 * accepted; `ms` = how long the run took.
 */
export interface SmmDeliveryRunSummary {
  /** ms */
  at: number;
  mode: SmmDeliveryMode;
  months: number;
  alerts: number;
  delivered: number;
  errors: number;
  ms: number;
  deferred?: number;
  pushed?: number;
}

/** What an admin edits in Settings (the switch has its own call). */
export type SmmDeliveryTunables = Pick<SmmDeliverySettings, "pilotUids" | "deadlineHour" | "checkpoints" | "quietHours" | "ladder">;

/* ── On a piece and on a month (phase 1 reads them; phase 3 writes them) ────────────────────────
 * All optional and absent on every piece written before Delivery Control: absent means "no plan
 * saved, no answer given", and the rules (`utils/smmCadence`, `utils/smmMonitor`) then work from the
 * piece as the classic board keeps it. They live here, not on `SmmContentItem` in `types/smm`, while
 * the feature is being built; a piece is read as `SmmContentItem & SmmDeliveryItemFields`.
 * Times written by Delivery Control are ms numbers; a Firestore Timestamp is read too.
 * Every history list is capped at `SMM_DELIVERY_ITEM_HISTORY_LIMIT` (the 1 MiB document limit — a month
 * already holds thirty pieces and the ad reports). */

/** One of the four weeks of a client's month (W1 = days 1–7 from the start … W4 = day 22 → the day before the end date). */
export type SmmPlanWeek = 1 | 2 | 3 | 4;

/** Why a piece has a date of its own instead of its week's end. */
export type SmmFixedReason = "festival" | "extra" | "client_asked";

/** The plan saved on a piece when its month is switched on. The classic `uploadDate` is never written by the planner. */
export interface SmmItemPlan {
  week: SmmPlanWeek;
  /** A soft post day the plan suggests (Mon–Sat, spread across the week). */
  suggestedDate?: string | null;
  /** A date that IS the deadline: a festival post, extra work's needed-by day, or a day the client asked for. */
  fixedDate?: string | null;
  fixedReason?: SmmFixedReason | null;
  /** The AI's title, once a person accepted it (phase 5). */
  title?: string | null;
  /** The AI's one-line idea and caption draft + hashtags, accepted with the title (phase 5). The classic
   *  `notes` / caption fields are never written by the planner — the team copies what it wants. */
  idea?: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
  plannedAt?: unknown;
  /** "auto" = the planner wrote it (only these are ever re-planned, and only on purpose); otherwise who placed it. */
  by: "auto" | string;
}

/** A piece moved to another week (needs a reason; the lead is told) or out of the month (admins only). */
export interface SmmItemMove {
  fromWeek: SmmPlanWeek;
  toWeek: SmmPlanWeek | "out";
  reason: string;
  at: number;
  byUid: string;
  byName: string;
}

/** What a "Blocked" answer says is in the way — and so who must clear it. */
export type SmmBlockerKind = "client_approval" | "client_footage" | "page_access" | "flow_credits" | "on_leave" | "other";

export interface SmmItemBlocker {
  kind: SmmBlockerKind;
  note?: string | null;
  since: number;
  byUid: string;
  byName: string;
  /** `since` + the ladder's `blockHours`; after it the block no longer quiets the owner unless it was confirmed. */
  expiresAt: number;
  /** The person who must clear it said it is real — it then holds until it is cleared. */
  confirmedByUid?: string | null;
  confirmedAt?: number | null;
}

/** "Do it now" (a short quiet, renewable once a day) or "Need more time" (today only, never past the deadline). */
export type SmmEtaKind = "focus" | "more_time";

export interface SmmItemEta {
  kind: SmmEtaKind;
  /** Quiet until then (ms). */
  until: number;
  at: number;
  /** The India-time day it was given on — "Do it now" renews once per day. */
  day: string;
  byUid: string;
  byName: string;
  /** "Do it now" given on `day`. */
  focusUsed?: number;
  /** "Need more time" given on this piece, ever (at most the ladder's `moreTimePerTask`). */
  moreTimeUsed?: number;
}

/** A checkpoint of a piece's week, in the order they fall. */
export type SmmLateStep = "footage" | "send" | "approved" | "live";

/** A one-tap "why not done" (the alert's answer, or the check-out step). */
export interface SmmItemLateReason {
  step: SmmLateStep;
  reason: string;
  note?: string | null;
  /** An optional new time the person gives (ms). */
  newTime?: number | null;
  at: number;
  byUid: string;
  byName: string;
}

/** A real video's footage — collected from the client by the salesperson. */
export type SmmFootageState = "needed" | "received" | "unusable" | "pending_client";

export interface SmmItemFootage {
  state: SmmFootageState;
  link?: string | null;
  at?: number | null;
  byName?: string | null;
}

/** A piece given to somebody else. The new owner gets a fresh lead time; the next after `reassignsBeforeAdmin` needs an admin. */
export interface SmmItemReassign {
  seat: "maker" | "publisher";
  fromUid?: string | null;
  toUid: string;
  at: number;
  byUid: string;
  byName: string;
}

export interface SmmDeliveryItemFields {
  plan?: SmmItemPlan | null;
  moves?: SmmItemMove[];
  /** First moved to "Being made" (stamped by `setItemStatus`). */
  startedAt?: unknown;
  /** First sent to the client for approval (stamped by `requestApproval`) — the "sent" checkpoint reads it. */
  madeAt?: unknown;
  blocker?: SmmItemBlocker | null;
  eta?: SmmItemEta | null;
  lateReasons?: SmmItemLateReason[];
  footage?: SmmItemFootage | null;
  /** Changes the client asked for so far. */
  revisions?: number;
  reassigns?: SmmItemReassign[];
  /** "Posted" with no link: why (decision 9). */
  noLinkReason?: string | null;
  /** How the client's approval was recorded from Delivery Control (phase 3): who said yes, how, and an
   *  optional screenshot — the classic `approval` keeps the decision itself. */
  approvalProof?: SmmApprovalProof | null;
  /** A piece already late when its month was switched on (the Starting line), and what a manager decided:
   *  a catch-up week (its plan moved, ≤ 2 weeks ahead) or kept as that month's pending work. Absent = undecided. */
  startingLine?: { decision: "catch_up" | "pending"; at: number; byUid: string; byName: string } | null;
}

/** How a client's answer reached us — the piece sheet's "Record approval: who + how + a screenshot". */
export type SmmApprovalVia = "whatsapp" | "call" | "in_person" | "client_chat" | "other";

export interface SmmApprovalProof {
  approved: boolean;
  /** Who at the client said it ("Lakshmi garu", "the manager"). */
  who: string;
  via: SmmApprovalVia;
  screenshotUrl?: string | null;
  at: number;
  byUid: string;
  byName: string;
}

/* ── `smm_alert_state/{uid}` — a person's answers on alerts that are not their own pieces ─────────
 * The Social Media Team Lead is view-only on months she is not on (2026-10-12), so her "I'm on it" /
 * "Escalate" / "Remind" cannot be written onto the month. A lead's, an admin's, a salesperson's or a
 * marketer's answer goes here, keyed by the alert's subject (a piece id, a week key, a month id, an ad
 * run id). Only the person writes their own document; the supervisor (the app and the server checker)
 * reads every one (a lead's Escalate brings the admins in at once). Entries older than
 * `SMM_ALERT_STATE_KEEP_DAYS` are dropped on the next write. */
export interface SmmAlertStateEntry {
  kind: "on_it" | "escalate" | "remind" | "called" | "whatsapp";
  /** ms */
  at: number;
  byName?: string | null;
  note?: string | null;
}

export interface SmmAlertStateDoc {
  answers: Record<string, SmmAlertStateEntry>;
  updatedAt?: unknown;
}

export const SMM_ALERT_STATE_KEEP_DAYS = 14;

/** On a month: when it was switched on. Lateness that already existed at `baselineAt` never escalates (the Starting line). */
export interface SmmMonthDelivery {
  activatedAt: number;
  activatedByName: string;
  baselineAt: number;
  rule: "front_back_v1";
}

export const SMM_DELIVERY_ITEM_HISTORY_LIMIT = 10;
