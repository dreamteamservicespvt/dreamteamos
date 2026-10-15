/**
 * SMM Delivery Control — the SUPERVISOR's rules: who is alerted, about what, how loudly, and when to stay
 * quiet (2026-10-15, phase 1 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── What it is for ──────────────────────────────────────────────────────────────────────────────
 * `utils/smmCadence` gives every piece a week, a deadline and checkpoints. This file looks at every month
 * at one moment and says which alerts are due: the owner of a piece when its checkpoint is missed, on its
 * deadline day and after it; the Social Media Team Lead and the tech team leaders one working day later;
 * the tech admin and the main admin two working days later; the salesperson and the sales admin for the
 * client's side (approvals, footage, extra work to bill); the marketer for the ad reports; the tech admin
 * for a month nobody is on. Each alert names the TYPE of work in words (🎬 AI VIDEO, 🖼 POSTER …).
 *
 * ── What keeps it from becoming noise (the plan's pre-mortem — every rule below is required) ────
 *   • Alerts are answered, never closed — and an answer quiets them: "Do it now" / "Need more time"
 *     (`eta`), "Blocked" (`blocker`, which then chases whoever must clear it, and expires after 24 h
 *     unless they confirm it), a late reason, a lead's / admin's "I'm on it" (4 h, `smm_alert_state`).
 *   • The Starting line: lateness that already existed when a month was switched on never escalates.
 *   • Leave-aware: nobody away today is alerted; the lead / sales admin gets "away — reassign?" instead.
 *   • Quiet hours (20:00–09:00, Sundays, holidays): only critical alerts may take the screen; escalation
 *     days start at 09:00, so a critical never lands at midnight.
 *   • Capacity first: an overloaded person → ONE admin alert to rebalance, and their early warnings held.
 *   • One alert per person per piece (one person in two seats), worst first; one key per alert and day
 *     (`smm_alert_<subject>_<level>_<stamp>_<uid>`) so the server and every app agree what was sent.
 *   • It never writes. Off → nothing at all; Preview → everything computed, nothing delivered.
 *   • Each month is checked on its own: a broken month is reported, never stops the others.
 *
 * Written without the `@/` alias: the server checker (`api/smm-monitor.ts`, phase 6) runs it as is.
 * Its RUNTIME relative imports end in `.js` (phase 6): Vercel transpiles each `.ts` file on its own into Node
 * ESM (package.json "type": "module"), and Node ESM finds no file for "./smmCadence" — only for
 * "./smmCadence.js". Vite, Vitest, esbuild and tsc ("bundler") all map the `.js` back to the `.ts`.
 * `import type` lines are erased and need nothing. A test (`smmServerCheckerOct15`) holds every file the
 * server loads to this.
 */
import type { SmmContentItem } from "../types/smm";
import type { SmmBlockerKind, SmmDeliverySettings, SmmEtaKind, SmmItemEta, SmmPlanWeek } from "../types/smmDelivery";
import { DEFAULT_SMM_DELIVERY } from "./smmDeliverySettings.js";
import {
  addDaysIso, crowdedWeeks, daysFrom, goLiveAt, isIsoDay, isWorkingDay, istDay, istMinuteOfDay, istMoment, monthRunsOn,
  nthWorkingDayAfter, planMonth, SMM_STATUS_RANK, taskProgress, toMs, weekKey, weekdayOf,
  type SmmDeliveryItem, type SmmDeliveryMonth, type SmmHolidays, type SmmMonthPlan, type SmmPlannedTask, type SmmTaskProgress,
} from "./smmCadence.js";

/* ── The words ────────────────────────────────────────────────────────────────────────────────── */

export type SmmAlertType =
  | "ai_video" | "poster" | "real_video" | "extra" | "approval" | "posting" | "footage" | "ad_report" | "billing" | "setup" | "report";

/** How every alert names its work — icon + word, never a colour alone. ("📝 REPORT" is kept for the monthly report, later.) */
export const SMM_ALERT_TYPES: Record<SmmAlertType, { icon: string; label: string }> = {
  ai_video: { icon: "🎬", label: "AI VIDEO" },
  poster: { icon: "🖼", label: "POSTER" },
  real_video: { icon: "📹", label: "REAL VIDEO" },
  extra: { icon: "⭐", label: "EXTRA" },
  approval: { icon: "✅", label: "APPROVAL" },
  posting: { icon: "📤", label: "POSTING" },
  footage: { icon: "🎞", label: "FOOTAGE" },
  ad_report: { icon: "📊", label: "AD REPORT" },
  billing: { icon: "🧾", label: "BILLING" },
  setup: { icon: "🛠", label: "SETUP" },
  report: { icon: "📝", label: "REPORT" },
};

/**
 * notice — the bell only · watch — early warning on the Today screen, never a full screen ·
 * amber / full / red / critical — full screens, rising. Only `critical` passes quiet hours.
 */
export type SmmAlertLevel = "notice" | "watch" | "amber" | "full" | "red" | "critical";

export const SMM_ALERT_LEVEL_RANK: Record<SmmAlertLevel, number> = { notice: 0, watch: 1, amber: 2, full: 3, red: 4, critical: 5 };

export const isFullScreenLevel = (level: SmmAlertLevel) => SMM_ALERT_LEVEL_RANK[level] >= SMM_ALERT_LEVEL_RANK.amber;

export type SmmAlertAudience = "owner" | "salesperson" | "sales_admin" | "lead" | "admin" | "marketer";

export type SmmAlertReason =
  | "week_start"
  | "watch"
  | "checkpoint_missed"
  | "deadline_today"
  | "deadline_passed"
  | "lead_told"
  | "lead_escalation"
  | "admin_escalation"
  | "approval_waiting"
  | "approval_not_responding"
  | "client_keeps_changing"
  | "footage_missing"
  | "ad_report_missing"
  | "ad_not_started"
  | "extra_unbilled"
  | "month_unstaffed"
  | "nobody_owns"
  | "owner_away"
  | "blocked"
  | "overloaded"
  | "plan_impossible";

/** Why an alert is not on the screen now. */
export type SmmAlertHold = "preview" | "pilot" | "quiet_hours" | "away" | "capacity";

export interface SmmAlert {
  /** The once key: `smm_alert_<subject>_<level>_<stamp>_<uid>` — one notification per key, ever. */
  key: string;
  /** What it is about: a piece id, a week key (`<month>_w2`), a month id, an ad run … */
  subject: string;
  uid: string;
  name: string;
  audience: SmmAlertAudience;
  level: SmmAlertLevel;
  type: SmmAlertType;
  reason: SmmAlertReason;
  campaignId: string;
  clientName: string;
  itemIds: string[];
  week: SmmPlanWeek | null;
  /** "🎬 AI VIDEO · Lakshmi Jewellers". */
  title: string;
  /** One plain sentence. */
  message: string;
  deadlineAt: number | null;
  fullScreen: boolean;
  critical: boolean;
  /** Shown / sent now. False in Preview, outside the pilot group, in quiet hours (non-critical), or while away. */
  deliverNow: boolean;
  heldBecause: SmmAlertHold | null;
}

/* ── The people ───────────────────────────────────────────────────────────────────────────────── */

/** Today, as the alerts need it: at work, in the working half of a half day, away, or not known (→ at work). */
export type SmmPresence = "working" | "half_in" | "away" | "unknown";

export interface SmmMonitorPerson {
  uid: string;
  name: string;
  role?: string;
  smmLeader?: boolean;
  isActive?: boolean;
  presence?: SmmPresence;
}

/**
 * Today's attendance (the Attendance board's `smmAttendance.todayStatusOf` kinds) as presence. Leave,
 * absence and a day off are away; a half day is alerted only while the person is checked in (their
 * working half); "not checked in yet" and "no check-in record" (team leaders) are at work.
 */
export function presenceFromToday(kind: string, opts: { checkedIn?: boolean; checkedOut?: boolean } = {}): SmmPresence {
  switch (kind) {
    case "present":
      return opts.checkedOut ? "away" : "working";
    // A half day (worked half, or half-day leave): alerted only in the working half — while checked in.
    // A "half" mark is itself a check-in for half the day.
    case "half":
    case "half_leave":
    case "half_leave_asked":
      if (opts.checkedOut) return "away";
      return opts.checkedIn || kind === "half" ? "half_in" : "away";
    case "leave":
    case "leave_asked":
    case "absent":
    case "holiday":
      return "away";
    case "not_in":
    case "unknown":
      return "working";
    default:
      return "unknown";
  }
}

const atWork = (p: SmmMonitorPerson | undefined) => !p || p.presence !== "away";

/** A lead's / admin's answer on an alert that is not their own piece (`smm_alert_state/{uid}`). */
export type SmmAlertAnswerKind = "on_it" | "escalate" | "remind" | "called" | "whatsapp";

export interface SmmAlertAnswer {
  kind: SmmAlertAnswerKind;
  /** ms */
  at: number;
}

export interface SmmMonitorInput {
  /** ms — the server's time, or a sane device clock. */
  now: number;
  months: readonly SmmDeliveryMonth[];
  settings?: SmmDeliverySettings;
  holidays: SmmHolidays;
  people: readonly SmmMonitorPerson[];
  /** uid → subject → their latest answer. */
  answers?: Readonly<Record<string, Readonly<Record<string, SmmAlertAnswer>>>>;
  /** Used for a month with no `delivery.baselineAt` (Preview, the rehearsal). Absent → `now`. */
  baselineAt?: number;
}

export interface SmmStartingLineEntry {
  campaignId: string;
  clientName: string;
  itemId: string;
  type: SmmPlannedTask["type"];
  title: string;
  week: SmmPlanWeek | null;
  deadlineDay: string | null;
}

export interface SmmMonitorResult {
  alerts: SmmAlert[];
  plans: SmmMonthPlan[];
  /** Pieces already late when their month was switched on — never escalated (plan a catch-up or keep as pending). */
  startingLine: SmmStartingLineEntry[];
  /** Months that could not be checked, and why (each in its own try/catch). */
  errors: { campaignId: string; message: string }[];
  /** Pieces each person makes this week, across clients. */
  load: Record<string, number>;
}

/* ── Small rules ─────────────────────────────────────────────────────────────────────────────── */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Quiet hours: from `fromHour` to `toHour` (across midnight), Sundays and company holidays, India time. */
export function isQuietTime(now: number, q: SmmDeliverySettings["quietHours"], holidays: SmmHolidays): boolean {
  const day = istDay(now);
  if (q.sundays && weekdayOf(day) === 0) return true;
  if (q.holidays && holidays?.has(day)) return true;
  const m = istMinuteOfDay(now);
  const from = q.fromHour * 60;
  const to = q.toHour * 60;
  return from > to ? m >= from || m < to : m >= from && m < to;
}

/** A "Blocked" answer still quiets the owner: confirmed by whoever must clear it, or not yet expired. */
export function blockerActive(item: SmmDeliveryItem, now: number): boolean {
  const b = item.blocker;
  if (!b) return false;
  return !!b.confirmedByUid || now < (toMs(b.expiresAt) ?? 0);
}

/** Who must clear a block. */
export function blockerClearer(kind: SmmBlockerKind): SmmAlertAudience {
  if (kind === "client_approval" || kind === "client_footage" || kind === "page_access") return "salesperson";
  if (kind === "flow_credits") return "admin";
  return "lead";
}

/**
 * Whether "Do it now" (focus) or "Need more time" may be given, and until when. Focus: `focusMinutes` of
 * quiet, given once and renewed once a day. More time: today only, never past the deadline, at most
 * `moreTimePerTask` per piece. Neither after the deadline — then the answer is a reason.
 */
export function etaCheck(args: {
  kind: SmmEtaKind;
  eta: SmmItemEta | null | undefined;
  now: number;
  deadlineAt: number | null;
  settings?: SmmDeliverySettings;
}): { problem: string; until: number | null } {
  const s = args.settings || DEFAULT_SMM_DELIVERY;
  const today = istDay(args.now);
  if (args.deadlineAt != null && args.now >= args.deadlineAt) return { problem: "Its deadline has passed — say why it is late instead.", until: null };
  if (args.kind === "focus") {
    const used = args.eta?.day === today ? args.eta.focusUsed || 0 : 0;
    if (used >= 2) return { problem: "\"Do it now\" was already renewed once today.", until: null };
    const until = args.now + s.ladder.focusMinutes * 60_000;
    return { problem: "", until: args.deadlineAt != null ? Math.min(until, args.deadlineAt) : until };
  }
  const used = args.eta?.moreTimeUsed || 0;
  if (used >= s.ladder.moreTimePerTask) return { problem: `More time was already given ${used} time${used === 1 ? "" : "s"} on this piece.`, until: null };
  const endOfToday = istMoment(today, s.quietHours.fromHour > s.quietHours.toHour ? s.quietHours.fromHour : 20);
  const until = args.deadlineAt != null ? Math.min(endOfToday, args.deadlineAt) : endOfToday;
  if (until <= args.now) return { problem: "The working day is over — say why it is late instead.", until: null };
  return { problem: "", until };
}

const REASSIGN_ADMINS = ["tech_admin", "main_admin"];

/** A piece reassigned `reassignsBeforeAdmin` times already: the next move needs an admin (no ping-pong). */
export function reassignCheck(
  item: Pick<SmmDeliveryItem, "reassigns">,
  user: { role?: string } | null | undefined,
  settings?: SmmDeliverySettings,
): string {
  const limit = (settings || DEFAULT_SMM_DELIVERY).ladder.reassignsBeforeAdmin;
  if ((item.reassigns?.length || 0) >= limit && !REASSIGN_ADMINS.includes(user?.role || "")) {
    return `This piece was already reassigned ${limit} times — only the tech admin or the main admin can move it again.`;
  }
  return "";
}

/** The end of the first working day after `at` — a reassigned piece's new owner is quiet until then (a fresh lead time). */
function graceAfter(at: number, holidays: SmmHolidays, deadlineHour: number): number {
  return istMoment(nthWorkingDayAfter(istDay(at), 1, holidays), deadlineHour);
}

/**
 * Whether the screen may be taken now: the data must have synced within `freshMinutes`, and the device
 * clock must agree with the server's (a phone set a day ahead must not call everything late).
 * "" when it may; "stale" / "clock" otherwise (the screens then say "Showing 10:42 data — alerts paused").
 */
export function screenProblem(args: { deviceNow: number; serverNow?: number | null; syncedAt?: number | null; freshMinutes: number }): "" | "stale" | "clock" {
  if (args.serverNow != null && Math.abs(args.deviceNow - args.serverNow) > 5 * 60_000) return "clock";
  if (args.syncedAt == null || args.deviceNow - args.syncedAt > args.freshMinutes * 60_000) return "stale";
  return "";
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "-");

export const smmAlertKey = (subject: string, level: SmmAlertLevel, stamp: string, uid: string) =>
  `smm_alert_${safe(subject)}_${level}_${safe(stamp)}_${safe(uid)}`;

const shortDay = (day: string) => {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(day.slice(5, 7)) - 1];
  const w = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayOf(day)];
  return `${w} ${Number(day.slice(8, 10))} ${m}`;
};

const hourLabel = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

const pieceWords = (t: SmmPlannedTask, item: SmmContentItem) => {
  const named = (t.title || "").trim();
  const kind = t.type === "extra" ? `extra work${item.title ? ` (${item.title})` : ""}` : t.type === "ai_video" ? "video" : t.type === "poster" ? "poster" : "real video";
  return named && t.type !== "extra" ? `the ${kind} "${named}"` : `the ${kind}`;
};

/* ── The monitor ──────────────────────────────────────────────────────────────────────────────── */

interface Draft {
  subject: string;
  stamp: string;
  uid: string;
  audience: SmmAlertAudience;
  level: SmmAlertLevel;
  type: SmmAlertType;
  reason: SmmAlertReason;
  campaignId: string;
  clientName: string;
  itemIds: string[];
  week: SmmPlanWeek | null;
  message: string;
  deadlineAt: number | null;
  held?: SmmAlertHold | null;
}

const TECH_ADMINS = ["tech_admin", "main_admin"];

/**
 * Every alert due at `input.now`, plus each month's plan and its Starting line. Pure: it reads, never
 * writes — the caller (the app's alert host, phase 4; the server checker, phase 6) delivers.
 */
export function monitorSmm(input: SmmMonitorInput): SmmMonitorResult {
  const settings = input.settings || DEFAULT_SMM_DELIVERY;
  const result: SmmMonitorResult = { alerts: [], plans: [], startingLine: [], errors: [], load: {} };
  if (settings.mode === "off") return result;

  const now = input.now;
  const today = istDay(now);
  const minute = istMinuteOfDay(now);
  const L = settings.ladder;
  const holidays = input.holidays;
  const people = new Map(input.people.map((p) => [p.uid, p]));
  const active = input.people.filter((p) => p.isActive !== false);
  const byRole = (roles: string[]) => active.filter((p) => roles.includes(p.role || ""));
  const leads = active.filter((p) => p.smmLeader || p.role === "tech_team_leader");
  const techAdmins = byRole(TECH_ADMINS);
  const answerOf = (uid: string, subject: string) => input.answers?.[uid]?.[subject];
  const onIt = (uid: string, subject: string) => {
    const a = answerOf(uid, subject);
    return !!a && a.kind === "on_it" && now - a.at < L.onItHours * HOUR_MS;
  };
  const dayStart = (day: string) => istMoment(day, settings.quietHours.toHour);
  const drafts: Draft[] = [];
  const add = (d: Draft) => drafts.push(d);
  const toAll = (list: SmmMonitorPerson[], d: Omit<Draft, "uid">) => list.forEach((p) => add({ ...d, uid: p.uid }));
  const nobodyMonths = new Map<string, { clientName: string; itemIds: string[] }>();
  const makerLoad = new Map<string, number>();
  const capacityHeld = new Set<string>();

  for (const month of input.months) {
    try {
      const plan = planMonth(month, { today, holidays, settings });
      result.plans.push(plan);
      if (plan.exclusion || plan.problem === "bad_dates" || plan.problem === "too_short") continue;
      if (!monthRunsOn(month, today)) continue; // upcoming: nothing is due before its first day
      const clientName = plan.name;
      const base = { campaignId: month.id, clientName };
      const team = month.team;
      const hasTeam = !!(team?.creator?.uid || team?.publisher?.uid || team?.marketer?.uid);
      if (!hasTeam) {
        toAll(techAdmins, {
          ...base, subject: `${month.id}_setup`, stamp: today, audience: "admin", level: "full", type: "setup", reason: "month_unstaffed",
          itemIds: [], week: null, deadlineAt: null, message: `${clientName}'s month has started and nobody is on it — set up its team.`,
        });
        continue;
      }
      const baseline = toMs(month.delivery?.baselineAt) ?? input.baselineAt ?? now;
      const items = new Map((month.items || []).map((i) => [i.id, i]));
      const salesperson = month.soldBy ? people.get(month.soldBy) : undefined;
      const salesAdmins = month.salesAdminId && people.get(month.salesAdminId)
        ? [people.get(month.salesAdminId)!].filter((p) => p.isActive !== false)
        : byRole(["sales_admin"]);
      const weekStarts = new Map<string, { week: SmmPlanWeek; itemIds: string[]; type: SmmAlertType }>();
      const marketer = team?.marketer?.uid ? people.get(team.marketer.uid) : undefined;

      // ── Finished pieces: extra work to bill, a video whose ad has not started ────────────────────
      const doneAlerts = (task: SmmPlannedTask, item: SmmDeliveryItem, p: SmmTaskProgress) => {
        const liveAt = p.liveAt;
        if (liveAt == null) return;
        const one = { ...base, itemIds: [task.itemId], week: task.week, deadlineAt: null };
        if (task.extra && item.extraCharge !== "billed" && item.extraCharge !== "free") {
          const due = liveAt + L.extraUnbilledDays * DAY_MS;
          if (now >= due && due >= baseline && month.soldBy) {
            add({ ...one, subject: task.itemId, stamp: "bill", uid: month.soldBy, audience: "salesperson", level: "full", type: "billing", reason: "extra_unbilled",
              message: `${clientName}: the extra work "${item.title || "extra"}" went live ${L.extraUnbilledDays}+ days ago and is not billed — bill it or mark it free.`,
              held: atWork(salesperson) ? null : "away" });
          }
        }
        if (item.kind === "ai_ad") {
          // Every video gets an ad campaign (the package's `campaigns` = its videos); a run for all videos covers it.
          const due = liveAt + L.adCampaignStartDays * DAY_MS;
          const covered = (month.ads || []).some((r) => r.status !== "planned" && (r.scope?.itemIds?.includes(task.itemId) || r.scope?.kind === "ai_ad" || r.scope?.kind === "all"));
          if (!covered && now >= due && due >= baseline && team?.marketer?.uid && marketer?.isActive !== false) {
            add({ ...one, subject: `${task.itemId}_ad`, stamp: "start", uid: team.marketer.uid, audience: "marketer", level: "full", type: "ad_report", reason: "ad_not_started",
              message: `${clientName}: the video "${task.title || "video"}" went live ${L.adCampaignStartDays}+ days ago and its ad has not started.`,
              held: atWork(marketer) ? null : "away" });
          }
        }
      };

      for (const task of plan.tasks) {
        const item = items.get(task.itemId);
        if (!item) continue;
        const p = taskProgress(task, item, now);
        const typeOfStep = (): SmmAlertType => (p.step === "post" ? "posting" : p.step === "approve" ? "approval" : p.step === "footage" ? "footage" : task.type);
        const piece = pieceWords(task, item);
        const one = { ...base, itemIds: [task.itemId], week: task.week, deadlineAt: task.deadlineAt };

        if (p.state === "done") {
          doneAlerts(task, item, p);
          continue;
        }
        if (p.state === "uncounted" || p.state === "unscheduled" || p.state === "not_due" || p.state === "pending_client") continue;
        if (task.deadlineAt != null && task.deadlineAt < baseline) {
          // A manager already kept it as that month's pending work (phase 3) — it leaves the list.
          if (item.startingLine?.decision !== "pending") {
            result.startingLine.push({ ...base, itemId: task.itemId, type: task.type, title: task.title, week: task.week, deadlineDay: task.deadlineDay });
          }
          continue;
        }
        const missedNow = task.checkpoints.filter((cp) => cp.at >= baseline && p.missed.includes(cp.step));
        const deadlineWords = task.deadlineDay ? `${shortDay(task.deadlineDay)}, ${hourLabel(settings.deadlineHour)}` : "";

        if (p.step === "make" || p.step === "post") {
          const ownerUid = p.step === "make" ? task.makerUid : task.publisherUid;
          const owner = ownerUid ? people.get(ownerUid) : undefined;
          if (p.step === "make" && ownerUid && task.week && task.counted && istDay(now) >= (task.weekStart || "")) {
            const wk = plan.weeks[task.week - 1];
            if (wk && wk.start <= today && today <= wk.deadlineDay) makerLoad.set(ownerUid, (makerLoad.get(ownerUid) || 0) + 1);
          }
          if (!ownerUid || owner?.isActive === false) {
            const n = nobodyMonths.get(month.id) || { clientName, itemIds: [] };
            n.itemIds.push(task.itemId);
            nobodyMonths.set(month.id, n);
          } else {
            const reassign = [...(item.reassigns || [])].reverse().find((r) => r.toUid === ownerUid && r.seat === (p.step === "make" ? "maker" : "publisher"));
            const quiet = blockerActive(item, now)
              || ((toMs(item.eta?.until) ?? 0) > now)
              || (!!reassign && now < graceAfter(reassign.at, holidays, settings.deadlineHour));
            const answeredLate = (item.lateReasons || []).some((r) => task.deadlineAt != null && r.at >= task.deadlineAt);
            let d: Draft | null = null;
            if (p.state === "late" && task.deadlineAt != null) {
              if (!answeredLate) {
                // Asked again every `repeatHours`, counted from the start of each working day (9–11, 11–1 …).
                const slot = Math.max(0, Math.floor((now - Math.max(task.deadlineAt, dayStart(today))) / (L.repeatHours * HOUR_MS)));
                d = { ...one, subject: task.itemId, stamp: `${today}r${slot}`, uid: ownerUid, audience: "owner", level: "red", type: typeOfStep(), reason: "deadline_passed",
                  message: `${clientName}: ${piece} was due ${deadlineWords} and is not live. Do it now, or say why it is late.` };
              }
              toAll(leads.filter((l) => l.uid !== ownerUid), { ...one, subject: task.itemId, stamp: task.deadlineDay!, audience: "lead", level: "notice", type: typeOfStep(), reason: "lead_told",
                message: `${clientName}: ${piece} (${owner?.name || "its owner"}) missed its deadline, ${deadlineWords}.` });
            } else if (p.state === "due_today" && minute >= L.deadlineDayHour * 60) {
              d = { ...one, subject: task.itemId, stamp: today, uid: ownerUid, audience: "owner", level: "full", type: typeOfStep(), reason: "deadline_today",
                message: `${clientName}: ${piece} must be live today by ${hourLabel(settings.deadlineHour)}.` };
            } else if (p.step === "make" && missedNow.some((cp) => cp.step === "send")) {
              d = { ...one, subject: task.itemId, stamp: today, uid: ownerUid, audience: "owner", level: "amber", type: typeOfStep(), reason: "checkpoint_missed",
                message: `${clientName}: ${piece} should have been sent to the client by now — the week ends ${deadlineWords}.` };
            } else if (p.step === "make" && p.state === "on_track") {
              const wk = task.week ? plan.weeks[task.week - 1] : null;
              if (wk && wk.workingDays[0] === today) {
                const key = `${weekKey(month.id, wk.week)}|${ownerUid}`;
                const ws = weekStarts.get(key) || { week: wk.week, itemIds: [], type: task.type };
                ws.itemIds.push(task.itemId);
                weekStarts.set(key, ws);
              }
              const next = p.nextCheckpoint;
              if (next && next.step === "send" && item.status === "planned" && next.day <= nthWorkingDayAfter(today, 1, holidays)) {
                d = { ...one, subject: task.itemId, stamp: today, uid: ownerUid, audience: "owner", level: "watch", type: typeOfStep(), reason: "watch",
                  message: `${clientName}: ${piece} is not started and must be sent to the client by ${shortDay(next.day)}.` };
              }
            }
            if (d) {
              if (quiet && d.level !== "watch") d = null;
              else if (!atWork(owner)) {
                d.held = "away";
                if (isFullScreenLevel(d.level)) {
                  toAll(leads.filter((l) => l.uid !== ownerUid), { ...one, subject: task.itemId, stamp: today, audience: "lead", level: "amber", type: d.type, reason: "owner_away",
                    message: `${owner?.name || "Its owner"} is away today — ${clientName}: ${piece} needs somebody. Reassign?` });
                }
              }
            }
            if (d) add(d);
          }
          // The ladder above the owner, by working days after the deadline — from 09:00, never at midnight.
          if (p.state === "late" && task.deadlineDay && task.deadlineAt != null) {
            const leadAt = Math.max(task.deadlineAt, dayStart(nthWorkingDayAfter(task.deadlineDay, L.leadAfterWorkingDays, holidays)));
            const adminAtRaw = Math.max(task.deadlineAt, dayStart(nthWorkingDayAfter(task.deadlineDay, L.adminAfterWorkingDays, holidays)));
            // A lead's "I'm on it" after the deadline holds the admins back for `onItHours` too (no lead ↔ admin ping-pong).
            const leadOnItAt = Math.max(0, ...leads.map((l) => answerOf(l.uid, task.itemId)).filter((a) => a?.kind === "on_it" && a.at >= task.deadlineAt!).map((a) => a!.at));
            const adminAt = leadOnItAt ? Math.max(adminAtRaw, leadOnItAt + L.onItHours * HOUR_MS) : adminAtRaw;
            const escalated = leads.some((l) => answerOf(l.uid, task.itemId)?.kind === "escalate");
            const who = owner?.name || "nobody";
            if (now >= leadAt && leadAt >= baseline) {
              toAll(leads.filter((l) => l.uid !== ownerUid && !onIt(l.uid, task.itemId) && atWork(l)), { ...one, subject: task.itemId, stamp: `esc_${task.deadlineDay}`, audience: "lead", level: "red", type: typeOfStep(), reason: "lead_escalation",
                message: `${clientName}: ${piece} (${who}) is late since ${deadlineWords}.` });
            }
            if ((now >= adminAt && adminAt >= baseline) || escalated) {
              toAll(techAdmins.filter((a) => !onIt(a.uid, task.itemId)), { ...one, subject: task.itemId, stamp: `adm_${task.deadlineDay}`, audience: "admin", level: "critical", type: typeOfStep(), reason: "admin_escalation",
                message: `${clientName}: ${piece} (${who}) is late since ${deadlineWords}${escalated ? " — the team lead escalated it" : ""}.` });
            }
          }
          if (blockerActive(item, now) && item.blocker) {
            const clearer = blockerClearer(item.blocker.kind);
            const list = clearer === "salesperson" ? (salesperson ? [salesperson] : salesAdmins) : clearer === "admin" ? techAdmins : leads;
            toAll(list.filter((x) => x.uid !== item.blocker!.byUid), { ...one, subject: task.itemId, stamp: `blk_${today}`, audience: clearer, level: "amber", type: typeOfStep(), reason: "blocked",
              message: `${item.blocker.byName || "The owner"} is blocked on ${clientName}: ${piece} — ${blockWords(item.blocker.kind)}${item.blocker.note ? ` (${item.blocker.note})` : ""}.` });
          }
        } else if (p.step === "approve") {
          const asked = p.sentAt;
          if (asked != null) {
            const fromDay = istDay(Math.max(asked, baseline));
            const waiting = daysFrom(fromDay, today);
            const chaseDays = L.clientChaseDays.filter((d) => d >= L.approvalSalespersonDays);
            const days = chaseDays.length ? chaseDays : [L.approvalSalespersonDays];
            const reached = [...days].reverse().find((d) => waiting >= d);
            const chasedSince = (d: number) => (item.approval?.chases || []).some((c) => (toMs(c.at) ?? 0) >= istMoment(addDaysIso(fromDay, d), 0));
            if (reached != null && month.soldBy && !chasedSince(reached) && !onIt(month.soldBy, task.itemId)) {
              const d: Draft = { ...one, subject: task.itemId, stamp: `c${reached}`, uid: month.soldBy, audience: "salesperson", level: "full", type: "approval", reason: "approval_waiting",
                message: `${clientName} has not approved ${piece} for ${waiting} days — call or WhatsApp them.` };
              if (!atWork(salesperson)) {
                d.held = "away";
                toAll(salesAdmins, { ...one, subject: task.itemId, stamp: `away_${today}`, audience: "sales_admin", level: "amber", type: "approval", reason: "owner_away",
                  message: `${salesperson?.name || "The salesperson"} is away today — ${clientName}'s approval of ${piece} is waiting ${waiting} days.` });
              }
              add(d);
            }
            if (waiting >= L.approvalSalesAdminDays) {
              toAll(salesAdmins.filter((a) => !onIt(a.uid, task.itemId)), { ...one, subject: task.itemId, stamp: "sa", audience: "sales_admin", level: "full", type: "approval", reason: "approval_waiting",
                message: `${clientName} has not approved ${piece} for ${waiting} days (salesperson ${month.soldByName || "—"}).` });
            }
            if (waiting > days[days.length - 1]) {
              toAll(salesAdmins.filter((a) => !onIt(a.uid, task.itemId)), { ...one, subject: task.itemId, stamp: "nr", audience: "sales_admin", level: "red", type: "approval", reason: "approval_not_responding",
                message: `${clientName} is not responding — ${piece} has waited ${waiting} days for approval.` });
            }
          }
          const revisions = item.revisions || 0;
          if (revisions > L.revisionsBeforeWarning) {
            const msg = { ...one, subject: task.itemId, stamp: `rev${revisions}`, level: "notice" as const, type: "approval" as const, reason: "client_keeps_changing" as const,
              message: `${clientName} keeps changing ${piece} — ${revisions} rounds of changes so far.` };
            if (month.soldBy) add({ ...msg, uid: month.soldBy, audience: "salesperson" });
            toAll(techAdmins, { ...msg, audience: "admin" });
          }
        } else if (p.step === "footage") {
          const cp = task.checkpoints.find((c) => c.step === "footage");
          if (cp && now >= cp.at && cp.at >= baseline) {
            if (month.soldBy && !onIt(month.soldBy, task.itemId)) {
              const d: Draft = { ...one, subject: task.itemId, stamp: today, uid: month.soldBy, audience: "salesperson", level: "full", type: "footage", reason: "footage_missing",
                message: `${clientName} has not sent the footage for ${piece} — it was due ${shortDay(cp.day)}. Collect it today.` };
              if (!atWork(salesperson)) d.held = "away";
              add(d);
            }
            const saAt = Math.max(cp.at, dayStart(nthWorkingDayAfter(cp.day, L.footageSalesAdminDays, holidays)));
            if (now >= saAt) {
              toAll(salesAdmins.filter((a) => !onIt(a.uid, task.itemId)), { ...one, subject: task.itemId, stamp: "sa", audience: "sales_admin", level: "full", type: "footage", reason: "footage_missing",
                message: `${clientName}'s footage for ${piece} is still missing (salesperson ${month.soldByName || "—"}).` });
            }
          }
        }
      }

      for (const [key, ws] of weekStarts) {
        const uid = key.split("|")[1];
        const wk = plan.weeks[ws.week - 1];
        add({ ...base, subject: weekKey(month.id, ws.week), stamp: wk.start, uid, audience: "owner", level: "notice", type: ws.type, reason: "week_start",
          itemIds: ws.itemIds, week: ws.week, deadlineAt: wk.deadlineAt,
          message: `${clientName} · Week ${ws.week} of 4: ${ws.itemIds.length} piece${ws.itemIds.length === 1 ? "" : "s"} to make — deadline ${shortDay(wk.deadlineDay)}, ${hourLabel(settings.deadlineHour)}.` });
      }

      // Ads: yesterday's report by `adReportHour`.
      for (const run of month.ads || []) {
        if (run.status !== "running" || !isIsoDay(run.startDate)) continue;
        const yesterday = addDaysIso(today, -1);
        const end = addDaysIso(run.startDate, Math.max(1, Number(run.days) || 1) - 1);
        if (yesterday < run.startDate || yesterday > end) continue;
        if ((run.reports || []).some((r) => r.date === yesterday)) continue;
        const due = istMoment(today, L.adReportHour);
        if (now < due || due < baseline) continue;
        if (!team?.marketer?.uid || marketer?.isActive === false) {
          const n = nobodyMonths.get(month.id) || { clientName, itemIds: [] };
          nobodyMonths.set(month.id, n);
          continue;
        }
        const d: Draft = { ...base, subject: run.id, stamp: today, uid: team.marketer.uid, audience: "marketer", level: "full", type: "ad_report", reason: "ad_report_missing",
          itemIds: [], week: null, deadlineAt: due, message: `${clientName}: yesterday's report for the ad "${run.name}" is not in — it was due by ${hourLabel(L.adReportHour)}.` };
        if (!atWork(marketer)) d.held = "away";
        add(d);
      }

      // A week that cannot fit (more than two posts a day left): ONE admin alert to rebalance.
      for (const crowded of crowdedWeeks(plan)) {
        const wk = plan.weeks[crowded.week - 1];
        if (today > wk.deadlineDay || today < addDaysIso(wk.start, -7)) continue;
        toAll(techAdmins, { ...base, subject: `${weekKey(month.id, crowded.week)}_crowded`, stamp: wk.start, audience: "admin", level: "amber", type: "setup", reason: "plan_impossible",
          itemIds: [], week: crowded.week, deadlineAt: wk.deadlineAt,
          message: `${clientName} · Week ${crowded.week}: ${crowded.tasks} pieces in ${crowded.workingDays} working day${crowded.workingDays === 1 ? "" : "s"} — more than two a day. Move some to another week.` });
      }
    } catch (e) {
      result.errors.push({ campaignId: month?.id || "?", message: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const [campaignId, n] of nobodyMonths) {
    toAll(techAdmins, { campaignId, clientName: n.clientName, subject: `${campaignId}_nobody`, stamp: today, audience: "admin", level: "amber", type: "setup", reason: "nobody_owns",
      itemIds: n.itemIds, week: null, deadlineAt: null,
      message: `${n.clientName}: ${n.itemIds.length ? `${n.itemIds.length} piece${n.itemIds.length === 1 ? "" : "s"} due` : "work due"} with nobody to do it (an empty seat or somebody deactivated) — reassign.` });
  }

  // Capacity: more than the weekly limit → ONE admin alert per person a day, and that person's early warnings held.
  for (const [uid, n] of makerLoad) {
    result.load[uid] = n;
    if (n <= L.weeklyLoadLimit) continue;
    capacityHeld.add(uid);
    const name = people.get(uid)?.name || "Somebody";
    toAll(techAdmins.filter((a) => a.uid !== uid), { campaignId: "", clientName: "", subject: `load_${uid}`, stamp: today, audience: "admin", level: "amber", type: "setup", reason: "overloaded",
      itemIds: [], week: null, deadlineAt: null, message: `${name} has ${n} pieces to make this week (the limit is ${L.weeklyLoadLimit}) — give some to somebody else.` });
  }

  // A lead's / admin's "I'm on it" quiets everything addressed to them about that subject for `onItHours`.
  const kept = drafts.filter((d) => d.audience === "owner" || !onIt(d.uid, d.subject));
  result.alerts = finish(kept, { settings, now, holidays, people, capacityHeld });
  return result;
}

function blockWords(kind: SmmBlockerKind): string {
  return {
    client_approval: "waiting for the client's approval",
    client_footage: "waiting for the client's footage",
    page_access: "no access to the client's page",
    flow_credits: "out of Flow credits",
    on_leave: "on leave",
    other: "something else",
  }[kind];
}

/** One alert per person per subject (the worst), the delivery decision, the key. */
function finish(
  drafts: Draft[],
  ctx: { settings: SmmDeliverySettings; now: number; holidays: SmmHolidays; people: Map<string, SmmMonitorPerson>; capacityHeld: Set<string> },
): SmmAlert[] {
  const best = new Map<string, Draft>();
  for (const d of drafts) {
    // One per person per subject — a person in two seats, or told and then escalated, gets the worst one.
    const k = `${d.uid}|${d.campaignId}|${d.subject}`;
    const prev = best.get(k);
    if (!prev || SMM_ALERT_LEVEL_RANK[d.level] > SMM_ALERT_LEVEL_RANK[prev.level]) best.set(k, d);
  }
  const quiet = isQuietTime(ctx.now, ctx.settings.quietHours, ctx.holidays);
  const pilot = ctx.settings.pilotUids;
  const out: SmmAlert[] = [];
  for (const d of best.values()) {
    let level = d.level;
    let held: SmmAlertHold | null = d.held || null;
    if (ctx.capacityHeld.has(d.uid) && d.audience === "owner" && (d.reason === "checkpoint_missed" || d.reason === "watch")) {
      level = "watch";
      held = held || "capacity";
    }
    const critical = level === "critical";
    if (!held && ctx.settings.mode === "preview") held = "preview";
    if (!held && pilot.length && !pilot.includes(d.uid)) held = "pilot";
    if (!held && quiet && !critical) held = "quiet_hours";
    const t = SMM_ALERT_TYPES[d.type];
    out.push({
      key: smmAlertKey(d.subject, level, d.stamp, d.uid),
      subject: d.subject, uid: d.uid, name: ctx.people.get(d.uid)?.name || "", audience: d.audience, level, type: d.type, reason: d.reason,
      campaignId: d.campaignId, clientName: d.clientName, itemIds: d.itemIds, week: d.week,
      title: `${t.icon} ${t.label}${d.clientName ? ` · ${d.clientName}` : ""}`, message: d.message, deadlineAt: d.deadlineAt,
      fullScreen: isFullScreenLevel(level), critical, deliverNow: !held, heldBecause: held,
    });
  }
  return out.sort(worstFirst);
}

/** Worst level first, then the earliest deadline, then by client. */
export function worstFirst(a: SmmAlert, b: SmmAlert): number {
  return SMM_ALERT_LEVEL_RANK[b.level] - SMM_ALERT_LEVEL_RANK[a.level]
    || (a.deadlineAt ?? Infinity) - (b.deadlineAt ?? Infinity)
    || a.clientName.localeCompare(b.clientName);
}

/**
 * What one person's full screen shows now: every full-screen alert delivered to them, worst first, on ONE
 * screen (the Monday storm is one screen, not ten). The main admin's is one combined critical screen.
 */
export function screenFor(uid: string, alerts: readonly SmmAlert[], role?: string): { alerts: SmmAlert[]; level: SmmAlertLevel | null; combined: boolean } {
  const mine = alerts.filter((a) => a.uid === uid && a.fullScreen && a.deliverNow).sort(worstFirst);
  return { alerts: mine, level: mine[0]?.level || null, combined: role === "main_admin" && mine.length > 0 };
}

/* ── The 30-day rehearsal ─────────────────────────────────────────────────────────────────────── */

/** A piece as it stood at `t`, from its own stamps: what happened after `t` is undone. */
export function itemAsOf(item: SmmDeliveryItem, t: number): SmmDeliveryItem | null {
  const created = toMs(item.createdAt);
  if (item.extra && created != null && created > t) return null;
  const original = SMM_STATUS_RANK[item.status] ?? 0;
  let rank = original;
  const posted = toMs(item.postedAt) ?? (item.status === "posted" ? goLiveAt(item) : null);
  if (rank >= 4 && posted != null && posted > t) rank = 3;
  const responded = toMs(item.approval?.respondedAt);
  if (rank >= 3 && item.approval?.state === "approved" && responded != null && responded > t) rank = 2;
  const sent = toMs(item.madeAt) ?? toMs(item.approval?.askedAt);
  if (rank >= 2 && sent != null && sent > t) rank = 1;
  const started = toMs(item.startedAt);
  if (rank >= 1 && started != null && started > t) rank = 0;
  const at = (v: { at?: unknown }) => (toMs(v.at) ?? 0) <= t;
  const out: SmmDeliveryItem = {
    ...item,
    lateReasons: (item.lateReasons || []).filter(at),
    reassigns: (item.reassigns || []).filter(at),
    moves: (item.moves || []).filter(at),
    eta: item.eta && (toMs(item.eta.at) ?? 0) <= t ? item.eta : null,
    blocker: item.blocker && (toMs(item.blocker.since) ?? 0) <= t ? item.blocker : null,
    footage: item.footage && item.footage.state === "received" && (toMs(item.footage.at) ?? 0) > t ? { ...item.footage, state: "needed" } : item.footage,
    approval: { ...(item.approval || { state: "not_sent" }), chases: (item.approval?.chases || []).filter(at) },
  };
  if (rank !== original) {
    out.status = (["planned", "in_progress", "awaiting_approval", "approved", "scheduled", "posted"] as const)[rank];
    if (rank < 5) out.postedAt = null;
    if (rank < 3 && out.approval.state === "approved") out.approval = { ...out.approval, state: rank === 2 ? "waiting" : "not_sent", respondedAt: null };
    if (rank < 2) out.approval = { ...out.approval, state: "not_sent", askedAt: null };
  }
  return out;
}

/** A month as it stood at `t`. */
export function monthAsOf(month: SmmDeliveryMonth, t: number): SmmDeliveryMonth {
  const day = istDay(t);
  return {
    ...month,
    items: (month.items || []).map((i) => itemAsOf(i, t)).filter((i): i is SmmDeliveryItem => !!i),
    ads: (month.ads || []).map((r) => ({ ...r, reports: (r.reports || []).filter((rep) => (toMs(rep.at) ?? istMoment(addDaysIso(rep.date, 1), 9)) <= t && rep.date < day) })),
  };
}

export interface SmmRehearsalDay {
  uid: string;
  name: string;
  day: string;
  /** Full screens the person would have seen that day (new alerts arriving together = one screen). */
  screens: number;
  /** Full-screen alerts on them. */
  alerts: number;
}

export interface SmmRehearsalReport {
  fromDay: string;
  days: number;
  /** The settings' target: full screens per person per day. */
  target: number;
  /** Every person-day with at least one full screen, worst first. */
  personDays: SmmRehearsalDay[];
  /** Person-days above the target. */
  overTarget: number;
  totalScreens: number;
  totalAlerts: number;
  byType: Partial<Record<SmmAlertType, number>>;
  byReason: Partial<Record<SmmAlertReason, number>>;
}

/**
 * The supervisor replayed over `days` days from `fromDay`, every `stepMinutes` between `fromHour` and
 * `toHour` (India time), on the months as their stamps say they stood, as if Live for everybody from the
 * first moment and nobody ever answered (the worst case). Presence is ignored (everybody at work).
 * Counts the full screens each person would have had a day — the target is `maxFullScreenPerDay` (3).
 * It changes nothing. Pieces with no stamps (older ones) count as done on time, as in `taskProgress`.
 */
export function rehearseSmm(
  input: Omit<SmmMonitorInput, "now" | "baselineAt">,
  opts: { fromDay: string; days?: number; stepMinutes?: number; fromHour?: number; toHour?: number },
): SmmRehearsalReport {
  const days = Math.max(1, Math.min(62, Math.floor(opts.days ?? 30)));
  const step = Math.max(10, Math.floor(opts.stepMinutes ?? 30));
  const fromHour = opts.fromHour ?? 9;
  const toHour = opts.toHour ?? 20;
  const settings: SmmDeliverySettings = { ...(input.settings || DEFAULT_SMM_DELIVERY), mode: "live", pilotUids: [] };
  const baselineAt = istMoment(opts.fromDay, fromHour);
  const people = input.people.map((p) => ({ ...p, presence: "working" as SmmPresence }));
  const seen = new Set<string>();
  const perDay = new Map<string, SmmRehearsalDay>();
  const report: SmmRehearsalReport = {
    fromDay: opts.fromDay, days, target: settings.ladder.maxFullScreenPerDay, personDays: [], overTarget: 0, totalScreens: 0, totalAlerts: 0, byType: {}, byReason: {},
  };
  for (let d = 0; d < days; d++) {
    const day = addDaysIso(opts.fromDay, d);
    for (let m = fromHour * 60; m <= toHour * 60; m += step) {
      const t = istMoment(day, 0, m);
      const months = input.months.map((mo) => ({ ...monthAsOf(mo, t), delivery: null }));
      const { alerts } = monitorSmm({ ...input, people, settings, months, now: t, baselineAt, answers: {} });
      const fresh = new Map<string, number>();
      for (const a of alerts) {
        if (!a.fullScreen || !a.deliverNow || seen.has(a.key)) continue;
        seen.add(a.key);
        fresh.set(a.uid, (fresh.get(a.uid) || 0) + 1);
        report.totalAlerts += 1;
        report.byType[a.type] = (report.byType[a.type] || 0) + 1;
        report.byReason[a.reason] = (report.byReason[a.reason] || 0) + 1;
      }
      for (const [uid, n] of fresh) {
        const k = `${uid}|${day}`;
        const row = perDay.get(k) || { uid, name: input.people.find((p) => p.uid === uid)?.name || "", day, screens: 0, alerts: 0 };
        row.screens += 1;
        row.alerts += n;
        perDay.set(k, row);
        report.totalScreens += 1;
      }
    }
  }
  report.personDays = [...perDay.values()].sort((a, b) => b.screens - a.screens || b.alerts - a.alerts || a.day.localeCompare(b.day));
  report.overTarget = report.personDays.filter((r) => r.screens > report.target).length;
  return report;
}

/** Re-exported for the screens that only import the monitor. */
export { isWorkingDay };
