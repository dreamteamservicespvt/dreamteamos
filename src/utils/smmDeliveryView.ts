/**
 * SMM Delivery Control — what the new screen SHOWS, as pure rules (2026-10-15, phase 2 of the plan in
 * `.claude/rules/smm.md` §9.9).
 *
 * ── Why a view model ────────────────────────────────────────────────────────────────────────────
 * Six roles open the same page and each needs a different cut of the same months: a tech member their own
 * pieces, the Social Media Team Lead everyone's (acting only on her own), the team leaders and admins everyone's
 * plus "Needs you", a salesperson the client's side (approvals, footage, extras to bill, reports, renewals), the
 * sales admin what was escalated to them. Every cut is built here from ONE pass of the weekly rules
 * (`smmCadence.planMonth` + `taskProgress`) and the supervisor (`smmMonitor.monitorSmm`), so the tiles, the
 * Today cards, the Weeks grid, the Team cards and the Alerts log can never disagree. Nothing here reads
 * Firestore, React or the clock — the caller passes `now`.
 *
 * ── The owner's look (dts-owner-ui-preference) ─────────────────────────────────────────────────
 * Every status is a MARK + a WORD + a colour, never a colour alone: ✔ done · ◷ coming · ⚠ at risk · ✖ late ·
 * ⏸ client. One card per client-week, worst first; no charts.
 */
import type { SmmContentKind } from "../types/smm";
import type { SmmDeliverySettings, SmmPlanWeek } from "../types/smmDelivery";
import {
  addDaysIso, daysFrom, istDay, istHour, monthRunsOn, planMonth, taskProgress, toMs, weekdayOf, onTimeSummary,
  type SmmDeliveryItem, type SmmDeliveryMonth, type SmmHolidays, type SmmMonthPlan, type SmmOnTimeSummary, type SmmPlannedTask,
  type SmmTaskProgress, type SmmTaskType, type SmmWeek,
} from "./smmCadence";
import { liveSinceAt } from "./smmDeliveryBaseline";
import {
  monitorSmm, SMM_ALERT_TYPES, type SmmAlert, type SmmMonitorPerson, type SmmMonitorResult, type SmmStartingLineEntry,
} from "./smmMonitor";

/* ── Who is looking (`utils/smmControlAccess`, kept light for the classic page) ─────────────────── */

export { canOpenControl, canSeeControlButton, controlViewOf, coveredByDelivery, type SmmControlView, type SmmControlViewer } from "./smmControlAccess";
import { controlViewOf, type SmmControlView, type SmmControlViewer } from "./smmControlAccess";

export type SmmControlTab = "today" | "weeks" | "plan" | "team" | "start" | "log" | "settings";

/** The tabs per role (the plan's table). Everyone lands on Today. */
export function tabsFor(view: SmmControlView): SmmControlTab[] {
  switch (view) {
    case "member":
    case "salesperson":
      return ["today", "weeks", "plan", "log"];
    case "lead":
      return ["today", "weeks", "plan", "team", "start", "log"];
    case "team_leader":
    case "admin":
      return ["today", "weeks", "plan", "team", "start", "log", "settings"];
    case "sales_admin":
      return ["today", "weeks", "plan", "team", "log"];
  }
}

export const SMM_TAB_LABELS: Record<SmmControlTab, string> = {
  today: "Today", weeks: "Weeks", plan: "Client plan", team: "Team", start: "Starting line", log: "Alerts log", settings: "Settings",
};

/** Managers: switch on, re-plan, move out of a month, reassign, decide the Starting line. */
export const isControlManager = (view: SmmControlView | null) => view === "admin" || view === "team_leader";

/** On-time % — the tech admin and the main admin only (owner's decision 13). */
export const seesOnTimePercent = (view: SmmControlView | null) => view === "admin";

/* ── Words ────────────────────────────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed 28 Oct". */
export function dayWords(day: string | null | undefined): string {
  if (!day || day.length < 10) return "—";
  return `${DAYS[weekdayOf(day)]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** "7 PM". */
export function hourWords(h: number): string {
  return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
}

/** "10:42 AM" in India time. */
export function timeWords(ms: number): string {
  const d = new Date(ms + 330 * 60_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** "Wed 28 Oct, 7 PM" for a deadline instant. */
export function deadlineWords(day: string | null | undefined, at: number | null | undefined): string {
  if (!day || at == null) return "no deadline";
  const h = istHour(at);
  const m = Math.round(((at + 330 * 60_000) % 3_600_000) / 60_000);
  return `${dayWords(day)}, ${m ? timeWords(at) : hourWords(h)}`;
}

export const TASK_TYPE_WORDS: Record<SmmTaskType, { icon: string; label: string; noun: string }> = {
  ai_video: { icon: SMM_ALERT_TYPES.ai_video.icon, label: SMM_ALERT_TYPES.ai_video.label, noun: "video" },
  poster: { icon: SMM_ALERT_TYPES.poster.icon, label: SMM_ALERT_TYPES.poster.label, noun: "poster" },
  real_video: { icon: SMM_ALERT_TYPES.real_video.icon, label: SMM_ALERT_TYPES.real_video.label, noun: "real video" },
  extra: { icon: SMM_ALERT_TYPES.extra.icon, label: SMM_ALERT_TYPES.extra.label, noun: "extra work" },
};

/** The five marks (shape + word; the screen adds the colour). */
export type SmmMark = "done" | "coming" | "risk" | "late" | "client";

export const SMM_MARKS: Record<SmmMark, { glyph: string; word: string }> = {
  done: { glyph: "✔", word: "Done" },
  coming: { glyph: "◷", word: "Coming" },
  risk: { glyph: "⚠", word: "At risk" },
  late: { glyph: "✖", word: "Late" },
  client: { glyph: "⏸", word: "Client" },
};

export function markOf(p: SmmTaskProgress): SmmMark {
  if (p.state === "done") return "done";
  if (p.state === "late") return "late";
  if (p.state === "pending_client") return "client";
  if (p.state === "checkpoint_missed" || p.state === "due_today") return "risk";
  if (p.waitingOnClient) return "client";
  return "coming";
}

const STEP_WORDS: Record<NonNullable<SmmTaskProgress["step"]>, string> = {
  footage: "Collect the footage from the client",
  make: "Make it and send it to the client",
  approve: "Get the client's approval",
  post: "Post it",
};

const CHECKPOINT_WORDS: Record<string, string> = {
  footage: "Footage in by",
  send: "Send to the client by",
  approved: "Approved by",
  live: "Live by",
};

/** "Late — was due Wed 28 Oct, 7 PM", "Due today by 7 PM", "Send to the client by Sat 24 Oct" … */
export function stateWords(task: SmmPlannedTask, p: SmmTaskProgress, deadlineHour: number): string {
  switch (p.state) {
    case "done":
      return p.onTime === false ? "Live — after its deadline" : "Live";
    case "late":
      return `Late — was due ${deadlineWords(task.deadlineDay, task.deadlineAt)}`;
    case "due_today":
      return `Due today by ${task.deadlineAt != null ? timeWords(task.deadlineAt) : hourWords(deadlineHour)}`;
    case "checkpoint_missed":
      return `Behind — should have been ${p.firstMissed === "send" ? "sent to the client" : p.firstMissed === "approved" ? "approved" : p.firstMissed === "footage" ? "in (footage)" : "live"} by now`;
    case "pending_client":
      return "Pending — client didn't send the footage";
    case "uncounted":
      return "Beyond the promise — not counted";
    case "unscheduled":
      return "No needed-by date yet";
    case "not_due":
      return `Starts ${dayWords(task.weekStart)}`;
    default:
      return p.waitingOnClient ? "Waiting for the client" : "On track";
  }
}

export function nextWords(p: SmmTaskProgress): string {
  if (!p.step) return "";
  const cp = p.nextCheckpoint;
  const step = STEP_WORDS[p.step];
  if (!cp) return step;
  return `${step} — ${CHECKPOINT_WORDS[cp.step] || "by"} ${dayWords(cp.day)}`;
}

/* ── One piece, read ──────────────────────────────────────────────────────────────────────────── */

export interface SmmTaskRow {
  key: string;
  month: SmmDeliveryMonth;
  plan: SmmMonthPlan;
  task: SmmPlannedTask;
  item: SmmDeliveryItem;
  progress: SmmTaskProgress;
  mark: SmmMark;
  /** "🎬 AI VIDEO". */
  typeLabel: string;
  /** The piece's own title, the accepted AI title, or "Video 2". */
  title: string;
  state: string;
  next: string;
  /** Whose the next step is (maker / publisher), or the salesperson for the client's side. */
  ownerUid: string | null;
  ownerName: string;
  /** No owner for the step it is on (an empty seat), or the owner is deactivated. */
  nobody: boolean;
  /** The viewer makes or posts it. */
  mine: boolean;
}

const KIND_ORDER: Record<SmmContentKind, number> = { ai_ad: 0, poster: 1, real_video: 2 };

function titleOf(task: SmmPlannedTask, n: number): string {
  const t = (task.title || "").trim();
  if (t) return t;
  const noun = TASK_TYPE_WORDS[task.type].noun;
  return `${noun[0].toUpperCase()}${noun.slice(1)} ${n}`;
}

function rowsOfMonth(
  month: SmmDeliveryMonth,
  plan: SmmMonthPlan,
  now: number,
  viewerUid: string,
  inactive: ReadonlySet<string>,
  deadlineHour: number,
): SmmTaskRow[] {
  const items = new Map((month.items || []).map((i) => [i.id, i]));
  const counter: Record<string, number> = {};
  const rows: SmmTaskRow[] = [];
  for (const task of plan.tasks) {
    const item = items.get(task.itemId);
    if (!item) continue;
    counter[task.type] = (counter[task.type] || 0) + 1;
    const p = taskProgress(task, item, now);
    const ownerUid = p.step === "make" ? task.makerUid : p.step === "post" ? task.publisherUid : p.stepOwner === "salesperson" ? month.soldBy || null : null;
    const ownerName = p.step === "make" ? task.makerName || "" : p.step === "post" ? task.publisherName || "" : p.stepOwner === "salesperson" ? month.soldByName || "the salesperson" : "";
    const nobody = (p.step === "make" || p.step === "post") && (!ownerUid || inactive.has(ownerUid));
    const t = TASK_TYPE_WORDS[task.type];
    rows.push({
      key: `${month.id}:${task.itemId}`, month, plan, task, item, progress: p, mark: markOf(p),
      typeLabel: `${t.icon} ${task.type === "extra" ? `${t.label}${item.title ? ` · ${item.title}` : ""}` : t.label}`,
      title: titleOf(task, counter[task.type]), state: stateWords(task, p, deadlineHour), next: nextWords(p),
      ownerUid, ownerName, nobody,
      mine: task.makerUid === viewerUid || task.publisherUid === viewerUid,
    });
  }
  return rows;
}

/* ── The board ────────────────────────────────────────────────────────────────────────────────── */

export interface SmmControlInput {
  months: readonly SmmDeliveryMonth[];
  settings: SmmDeliverySettings;
  holidays: SmmHolidays;
  now: number;
  viewer: SmmControlViewer;
  people?: readonly SmmMonitorPerson[];
  answers?: SmmMonitorResultAnswers;
  /** Live: when it went Live — the starting point of months not switched on yet. Preview: absent (= now). */
  liveSince?: number | null;
}

type SmmMonitorResultAnswers = Parameters<typeof monitorSmm>[0]["answers"];

export interface SmmMonthView {
  month: SmmDeliveryMonth;
  plan: SmmMonthPlan;
  rows: SmmTaskRow[];
  /** Running today (not upcoming, not ended). */
  running: boolean;
  /** Its current week (1–4) today, or null outside its days. */
  currentWeek: SmmPlanWeek | null;
  /** Switched on (its plan saved). */
  switchedOn: boolean;
  late: number;
  risk: number;
  client: number;
  done: number;
  counted: number;
  /** Worst first: late, at risk, waiting, the rest; excluded months last. */
  rank: number;
}

export interface SmmControlBoard {
  now: number;
  today: string;
  view: SmmControlView | null;
  months: SmmMonthView[];
  /** Every piece the viewer may see, scoped to their role. */
  rows: SmmTaskRow[];
  monitor: SmmMonitorResult;
  /**
   * The alerts the screens LIST (Needs you, the Alerts log). Live: the monitor's own. Preview: the same months judged as
   * if each had been switched on from its first day — "who would get what" — because switching on NOW (the monitor's
   * own Preview answer, which the Starting line shows) never escalates anything already late, which left the Preview
   * log empty while the Late tile counted pieces (browser check, 2026-10-15).
   */
  alerts: SmmAlert[];
  /** The alerts the viewer would get / gets right now, worst first. */
  myAlerts: SmmAlert[];
}

/** The month's own week today, or null. */
function currentWeekOf(plan: SmmMonthPlan, today: string): SmmPlanWeek | null {
  return plan.weeks.find((w) => today >= w.start && today <= w.end)?.week ?? null;
}

/**
 * Which pieces a viewer sees on Today / Weeks: a member their own (maker or publisher), a salesperson the
 * months they sold, everyone else every month they can see (the caller already passes only those months).
 */
export function rowInScope(row: SmmTaskRow, view: SmmControlView | null, uid: string): boolean {
  if (view === "member") return row.mine || row.month.team?.creator?.uid === uid || row.month.team?.publisher?.uid === uid;
  if (view === "salesperson") return row.month.soldBy === uid;
  return true;
}

export function buildControlBoard(input: SmmControlInput): SmmControlBoard {
  const today = istDay(input.now);
  const view = controlViewOf(input.viewer);
  const inactive = new Set((input.people || []).filter((p) => p.isActive === false).map((p) => p.uid));
  const monitor = monitorSmm({
    now: input.now, months: input.months, settings: input.settings, holidays: input.holidays,
    people: input.people || [{ uid: input.viewer.uid, name: input.viewer.name || "", role: input.viewer.role, smmLeader: input.viewer.smmLeader }],
    answers: input.answers, baselineAt: input.liveSince ?? undefined,
  });
  const months: SmmMonthView[] = [];
  const rows: SmmTaskRow[] = [];
  for (const month of input.months) {
    let plan: SmmMonthPlan;
    try {
      plan = monitor.plans.find((p) => p.campaignId === month.id) || planMonth(month, { today, holidays: input.holidays, settings: input.settings });
    } catch {
      continue;
    }
    const mRows = rowsOfMonth(month, plan, input.now, input.viewer.uid, inactive, input.settings.deadlineHour);
    const scoped = mRows.filter((r) => rowInScope(r, view, input.viewer.uid));
    if (view === "member" && !scoped.length) continue;
    const counted = scoped.filter((r) => r.task.counted);
    const late = scoped.filter((r) => r.mark === "late").length;
    const risk = scoped.filter((r) => r.mark === "risk").length;
    const client = scoped.filter((r) => r.mark === "client").length;
    const done = counted.filter((r) => r.mark === "done").length;
    const excluded = !!plan.exclusion || plan.problem === "bad_dates" || plan.problem === "too_short";
    months.push({
      month, plan, rows: scoped, running: monthRunsOn(month, today), currentWeek: currentWeekOf(plan, today),
      switchedOn: !!toMs(month.delivery?.baselineAt), late, risk, client, done, counted: counted.length,
      rank: excluded ? 1e9 : -(late * 1000 + risk * 100 + client * 10),
    });
    rows.push(...scoped);
  }
  months.sort((a, b) => a.rank - b.rank || (a.plan.name || "").localeCompare(b.plan.name || ""));
  const listed = input.settings.mode === "live" ? monitor.alerts : monitorSmm({
    now: input.now, months: input.months, settings: input.settings, holidays: input.holidays,
    people: input.people || [{ uid: input.viewer.uid, name: input.viewer.name || "", role: input.viewer.role, smmLeader: input.viewer.smmLeader }],
    answers: input.answers, baselineAt: 1,
  }).alerts;
  const myAlerts = listed.filter((a) => a.uid === input.viewer.uid);
  return { now: input.now, today, view, months, rows, monitor, alerts: listed, myAlerts };
}

/* ── Today: one card per client-week ─────────────────────────────────────────────────────────── */

export type SmmTodayGroup = "late" | "ends_today" | "checkpoint" | "client" | "this_week" | "next_week" | "no_date" | "done";

export const SMM_TODAY_GROUPS: { key: SmmTodayGroup; label: string; hint: string }[] = [
  { key: "ends_today", label: "Week ends today", hint: "Their week's deadline is today" },
  { key: "late", label: "Late (week ended)", hint: "Past their deadline and not live" },
  { key: "checkpoint", label: "Checkpoint missed", hint: "Behind inside the week — the deadline is still ahead" },
  { key: "this_week", label: "This week", hint: "On track" },
  { key: "next_week", label: "Next week", hint: "Starts soon" },
  { key: "client", label: "Waiting on client", hint: "Approval or footage — the salesperson chases" },
  { key: "no_date", label: "Extra work with no date", hint: "Give it a needed-by date" },
  { key: "done", label: "Done", hint: "Every piece live" },
];

export interface SmmWeekCard {
  key: string;
  month: SmmDeliveryMonth;
  plan: SmmMonthPlan;
  /** Null for the "no date" card of a month's undated extra work. */
  week: SmmWeek | null;
  rows: SmmTaskRow[];
  group: SmmTodayGroup;
  live: number;
  total: number;
  /** Whole days from today to the deadline day (negative when past). */
  daysLeft: number | null;
  /** "Lakshmi Jewellers · Week 2 of 4 · deadline Wed 28 Oct, 7 PM · 2 days left · 0 of 2 live". */
  heading: string;
}

const isOpen = (r: SmmTaskRow) => r.mark !== "done" && r.progress.state !== "uncounted";

function cardGroup(rows: SmmTaskRow[], week: SmmWeek, today: string, nextStart: string | null): SmmTodayGroup {
  const open = rows.filter(isOpen);
  if (!open.length) return "done";
  if (open.some((r) => r.mark === "late")) return "late";
  if (week.deadlineDay === today || open.some((r) => r.progress.state === "due_today")) return "ends_today";
  if (open.some((r) => r.mark === "risk")) return "checkpoint";
  if (open.every((r) => r.mark === "client")) return "client";
  if (today >= week.start && today <= week.end) return "this_week";
  if (nextStart && week.start === nextStart) return "next_week";
  return today < week.start ? "next_week" : "this_week";
}

export function daysLeftWords(n: number | null): string {
  if (n == null) return "";
  if (n === 0) return "today";
  if (n === 1) return "1 day left";
  if (n > 1) return `${n} days left`;
  return n === -1 ? "1 day late" : `${-n} days late`;
}

/**
 * The Today cards: for each month, every week with unfinished work up to next week (earlier weeks only when
 * something is still open — late), the current and last week when all done (collapsed under Done), and a "no
 * date" card for undated extra work. Rows beyond the promise and weeks further ahead are left to the Weeks tab.
 */
export function todayCards(board: SmmControlBoard, opts: { rowFilter?: (r: SmmTaskRow) => boolean } = {}): SmmWeekCard[] {
  const today = board.today;
  const cards: SmmWeekCard[] = [];
  for (const mv of board.months) {
    if (mv.plan.exclusion) continue;
    const rows = mv.rows.filter((r) => r.progress.state !== "uncounted" && (!opts.rowFilter || opts.rowFilter(r)));
    if (!rows.length) continue;
    const cur = mv.currentWeek;
    const weeks = mv.plan.weeks;
    const nextWeek = weeks.find((w) => w.start > today) || null;
    for (const w of weeks) {
      const wRows = rows.filter((r) => r.task.week === w.week);
      if (!wRows.length) continue;
      const open = wRows.filter(isOpen);
      const past = w.end < today;
      const isCur = cur === w.week;
      const isNext = nextWeek?.week === w.week && w.start > today;
      if (past && !open.length && !(cur && w.week === cur - 1)) continue;
      if (!past && !isCur && !isNext) continue;
      const group = cardGroup(wRows, w, today, nextWeek?.start || null);
      const live = wRows.filter((r) => r.mark === "done").length;
      const daysLeft = daysFrom(today, w.deadlineDay);
      const name = mv.plan.name;
      cards.push({
        key: `${mv.month.id}_w${w.week}`, month: mv.month, plan: mv.plan, week: w, rows: sortRows(wRows), group, live, total: wRows.length, daysLeft,
        heading: `${name} · Week ${w.week} of 4 · deadline ${deadlineWords(w.deadlineDay, w.deadlineAt)} · ${daysLeftWords(daysLeft)} · ${live} of ${wRows.length} live`,
      });
    }
    const undated = rows.filter((r) => r.progress.state === "unscheduled" && isOpen(r));
    if (undated.length) {
      cards.push({
        key: `${mv.month.id}_nodate`, month: mv.month, plan: mv.plan, week: null, rows: undated, group: "no_date", live: 0, total: undated.length, daysLeft: null,
        heading: `${mv.plan.name} · Extra work with no date · ${undated.length} piece${undated.length === 1 ? "" : "s"}`,
      });
    }
  }
  const order = SMM_TODAY_GROUPS.map((g) => g.key);
  return cards.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)
    || (a.daysLeft ?? 99) - (b.daysLeft ?? 99)
    || a.plan.name.localeCompare(b.plan.name));
}

const MARK_RANK: Record<SmmMark, number> = { late: 0, risk: 1, client: 2, coming: 3, done: 4 };

export function sortRows(rows: SmmTaskRow[]): SmmTaskRow[] {
  return [...rows].sort((a, b) => MARK_RANK[a.mark] - MARK_RANK[b.mark]
    || (a.task.deadlineAt ?? Infinity) - (b.task.deadlineAt ?? Infinity)
    || KIND_ORDER[a.task.kind] - KIND_ORDER[b.task.kind]);
}

/* ── Tiles ────────────────────────────────────────────────────────────────────────────────────── */

export type SmmTileKey =
  | "needs_you" | "late" | "due_week" | "next_week" | "client" | "nobody"
  | "approvals" | "footage" | "extras" | "reports" | "escalated";

export interface SmmTile {
  key: SmmTileKey;
  label: string;
  count: number;
  /** Pieces the tile filters Today to (null: the tile is about alerts / months, not pieces). */
  filter: ((r: SmmTaskRow) => boolean) | null;
  tone: "late" | "risk" | "client" | "neutral" | "done";
}

const isThisWeek = (r: SmmTaskRow, today: string) => {
  const w = r.task.week ? r.plan.weeks[r.task.week - 1] : null;
  return !!w && today >= w.start && today <= w.end;
};
const isNextWeek = (r: SmmTaskRow, today: string) => {
  const next = r.plan.weeks.find((w) => w.start > today);
  return !!next && r.task.week === next.week;
};

export const isExtraToBill = (r: SmmTaskRow) =>
  r.task.extra && r.mark === "done" && r.item.extraCharge !== "billed" && r.item.extraCharge !== "free";

/** The last week of a running month: the monthly report and the renewal call are due. */
export const reportDue = (mv: SmmMonthView, today: string) => mv.running && mv.currentWeek === 4 && !mv.plan.exclusion && today >= (mv.plan.weeks[3]?.start || "");

export function tilesFor(board: SmmControlBoard): SmmTile[] {
  const { today, view } = board;
  // Only months that are chased — an On hold month's open piece is not "late" work on Today (browser check, 2026-10-15).
  const rows = tileRows(board);
  const open = rows.filter(isOpen);
  const count = (f: (r: SmmTaskRow) => boolean) => open.filter(f).length;
  const late = (r: SmmTaskRow) => r.mark === "late";
  const dueWeek = (r: SmmTaskRow) => r.mark !== "late" && isThisWeek(r, today) && r.progress.state !== "not_due";
  const nextWk = (r: SmmTaskRow) => isNextWeek(r, today);
  const client = (r: SmmTaskRow) => r.mark === "client";
  const nobody = (r: SmmTaskRow) => r.nobody;
  const approvals = (r: SmmTaskRow) => r.progress.step === "approve";
  const footage = (r: SmmTaskRow) => r.progress.step === "footage";
  const needsYou = board.myAlerts.filter((a) => a.level !== "watch" && a.level !== "notice");
  const escalated = board.myAlerts.filter((a) => a.audience === "sales_admin" && a.level !== "notice");
  switch (view) {
    case "member":
    case "lead":
      return [
        { key: "late", label: "Late", count: count(late), filter: late, tone: "late" },
        { key: "due_week", label: "Due this week", count: count(dueWeek), filter: dueWeek, tone: "risk" },
        { key: "next_week", label: "Next week", count: count(nextWk), filter: nextWk, tone: "neutral" },
        { key: "client", label: "Waiting on client", count: count(client), filter: client, tone: "client" },
      ];
    case "team_leader":
    case "admin":
      return [
        { key: "needs_you", label: "Needs you", count: needsYou.length, filter: null, tone: needsYou.length ? "late" : "done" },
        { key: "late", label: "Late", count: count(late), filter: late, tone: "late" },
        { key: "due_week", label: "Due this week", count: count(dueWeek), filter: dueWeek, tone: "risk" },
        { key: "client", label: "Waiting on client", count: count(client), filter: client, tone: "client" },
        { key: "nobody", label: "Nobody owns", count: count(nobody), filter: nobody, tone: "late" },
      ];
    case "salesperson":
      return [
        { key: "approvals", label: "Approvals waiting", count: count(approvals), filter: approvals, tone: "client" },
        { key: "footage", label: "Footage to collect", count: count(footage), filter: footage, tone: "client" },
        { key: "extras", label: "Extras to bill", count: rows.filter(isExtraToBill).length, filter: isExtraToBill, tone: "risk" },
        { key: "reports", label: "Reports due", count: board.months.filter((m) => reportDue(m, today)).length, filter: null, tone: "neutral" },
      ];
    case "sales_admin":
      return [
        { key: "escalated", label: "Escalated to you", count: escalated.length, filter: null, tone: escalated.length ? "late" : "done" },
        { key: "approvals", label: "Approvals waiting", count: count(approvals), filter: approvals, tone: "client" },
        { key: "footage", label: "Footage missing", count: count((r) => footage(r) && r.progress.missed.includes("footage")), filter: (r) => footage(r) && r.progress.missed.includes("footage"), tone: "late" },
        { key: "extras", label: "Extras unbilled", count: rows.filter(isExtraToBill).length, filter: isExtraToBill, tone: "risk" },
      ];
    default:
      return [];
  }
}

/** The pieces the tiles count and filter: every row of a chased month (not on hold, ended, history or broken). */
export function tileRows(board: SmmControlBoard): SmmTaskRow[] {
  return board.months.filter((m) => !m.plan.exclusion && m.plan.weeks.length).flatMap((m) => m.rows)
    .filter((r) => r.progress.state !== "uncounted");
}

/** The salesperson's Today: only the client's side of their months (approvals, footage, extras to bill). */
export const isClientJob = (r: SmmTaskRow) => r.progress.step === "approve" || r.progress.step === "footage" || isExtraToBill(r) || r.progress.state === "pending_client";

/* ── Weeks: one row per client, four week cells ──────────────────────────────────────────────── */

export interface SmmWeekCell {
  week: SmmWeek;
  /** "2 + 2" — counted pieces per kind (videos + posters (+ real videos)). */
  counts: string;
  due: string;
  marks: { mark: SmmMark; label: string; itemId: string; extra: boolean }[];
  extras: number;
  current: boolean;
  /** Promised pieces of this week with no row to work on. */
  missing: number;
}

export function weekCells(mv: SmmMonthView, today: string): SmmWeekCell[] {
  return mv.plan.weeks.map((w) => {
    const rows = mv.rows.filter((r) => r.task.week === w.week && r.progress.state !== "uncounted");
    const counted = rows.filter((r) => r.task.counted);
    const per = (k: SmmContentKind) => counted.filter((r) => r.task.kind === k).length;
    const parts = [per("ai_ad"), per("poster")];
    if (per("real_video")) parts.push(per("real_video"));
    return {
      week: w,
      counts: parts.join(" + "),
      due: `due ${dayWords(w.deadlineDay)}`,
      marks: sortRows(rows).map((r) => ({ mark: r.mark, label: `${r.typeLabel} · ${r.title} — ${SMM_MARKS[r.mark].word}`, itemId: r.task.itemId, extra: r.task.extra })),
      extras: rows.filter((r) => r.task.extra).length,
      current: today >= w.start && today <= w.end,
      missing: mv.plan.missing.filter((m) => m.week === w.week).reduce((s, m) => s + m.count, 0),
    };
  });
}

/* ── Team ─────────────────────────────────────────────────────────────────────────────────────── */

export interface SmmTeamCard {
  uid: string;
  name: string;
  clients: string[];
  due: number;
  late: number;
  waiting: number;
  /** Pieces they make this week (across clients) and the limit. */
  load: number;
  limit: number;
  onTime: SmmOnTimeSummary;
  /** What they answered today (late reasons, more time, blocks), newest first. */
  answersToday: string[];
}

export function teamCards(board: SmmControlBoard, settings: SmmDeliverySettings, names: (uid: string) => string): SmmTeamCard[] {
  const byUid = new Map<string, SmmTeamCard>();
  const card = (uid: string, name: string) => {
    let c = byUid.get(uid);
    if (!c) {
      c = { uid, name: names(uid) || name || "Someone", clients: [], due: 0, late: 0, waiting: 0, load: board.monitor.load[uid] || 0, limit: settings.ladder.weeklyLoadLimit, onTime: onTimeSummary([]), answersToday: [] };
      byUid.set(uid, c);
    }
    return c;
  };
  const progressOf = new Map<string, SmmTaskProgress[]>();
  for (const mv of board.months) {
    if (mv.plan.exclusion) continue;
    const t = mv.month.team;
    for (const seat of [t?.creator, t?.publisher, t?.marketer, ...(t?.assistants || [])]) {
      if (seat?.uid) {
        const c = card(seat.uid, seat.name);
        if (!c.clients.includes(mv.plan.name)) c.clients.push(mv.plan.name);
      }
    }
    for (const r of mv.rows) {
      for (const uid of [r.task.makerUid, r.task.publisherUid]) {
        if (!uid) continue;
        const c = card(uid, uid === r.task.makerUid ? r.task.makerName || "" : r.task.publisherName || "");
        if (!c.clients.includes(mv.plan.name)) c.clients.push(mv.plan.name);
        progressOf.set(uid, [...(progressOf.get(uid) || []), r.progress]);
      }
      if (r.ownerUid && (r.progress.step === "make" || r.progress.step === "post")) {
        const c = card(r.ownerUid, r.ownerName);
        if (r.mark === "late") c.late += 1;
        else if (isThisWeek(r, board.today) && isOpen(r)) c.due += 1;
      }
      if (r.mark === "client") {
        for (const uid of [r.task.makerUid]) if (uid) card(uid, "").waiting += 1;
      }
      for (const lr of r.item.lateReasons || []) {
        if (istDay(toMs(lr.at) ?? 0) === board.today) card(lr.byUid, lr.byName).answersToday.push(`${r.plan.name}: ${lr.reason}${lr.note ? ` — ${lr.note}` : ""}`);
      }
      const eta = r.item.eta;
      if (eta && istDay(toMs(eta.at) ?? 0) === board.today) card(eta.byUid, eta.byName).answersToday.push(`${r.plan.name}: ${eta.kind === "focus" ? "Doing it now" : "Asked for more time"}`);
      const b = r.item.blocker;
      if (b && istDay(toMs(b.since) ?? 0) === board.today) card(b.byUid, b.byName).answersToday.push(`${r.plan.name}: Blocked — ${b.kind.replace(/_/g, " ")}`);
    }
  }
  for (const [uid, list] of progressOf) {
    const c = byUid.get(uid);
    if (c) c.onTime = onTimeSummary(list);
  }
  return [...byUid.values()].sort((a, b) => b.late - a.late || b.due - a.due || a.name.localeCompare(b.name));
}

/* ── The Starting line ────────────────────────────────────────────────────────────────────────── */

export interface SmmStartingRow extends SmmStartingLineEntry {
  row: SmmTaskRow | null;
}

export function startingLineRows(board: SmmControlBoard): SmmStartingRow[] {
  const byKey = new Map(board.rows.map((r) => [`${r.month.id}:${r.task.itemId}`, r]));
  return board.monitor.startingLine
    .map((e) => ({ ...e, row: byKey.get(`${e.campaignId}:${e.itemId}`) || null }))
    .filter((e) => !e.row?.item.startingLine);
}

/* ── The Alerts log ───────────────────────────────────────────────────────────────────────────── */

export interface SmmLogLine {
  at: number;
  kind: "alert" | "answer";
  type: string;
  clientName: string;
  person: string;
  level: string;
  text: string;
  /** For an alert: held and why ("Preview — would get", "Quiet hours" …), or delivered now. */
  status: string;
  solvedAt: number | null;
  campaignId: string;
  itemId: string | null;
}

const HOLD_WORDS: Record<string, string> = {
  preview: "Preview — would get",
  pilot: "Not in the pilot group",
  quiet_hours: "Held — quiet hours",
  away: "Held — away today",
  capacity: "Held — too much work this week",
};

/**
 * The log: every alert the supervisor raises NOW (in Preview: who WOULD get what), then every answer people
 * recorded on the pieces, newest first. An answer's "solved" is when its piece went live.
 */
export function alertLog(board: SmmControlBoard, opts: { onlyUid?: string; salesSide?: boolean } = {}): SmmLogLine[] {
  const lines: SmmLogLine[] = [];
  const alerts = board.alerts.filter((a) => (!opts.onlyUid || a.uid === opts.onlyUid)
    && (!opts.salesSide || a.audience === "salesperson" || a.audience === "sales_admin"));
  for (const a of alerts) {
    if (a.level === "watch") continue;
    lines.push({
      at: board.now, kind: "alert", type: a.title.split(" · ")[0], clientName: a.clientName, person: a.name || a.uid, level: a.level, text: a.message,
      status: a.deliverNow ? "Shown now" : HOLD_WORDS[a.heldBecause || ""] || "Held", solvedAt: null, campaignId: a.campaignId, itemId: a.itemIds[0] || null,
    });
  }
  for (const r of board.rows) {
    if (opts.onlyUid && !r.mine && r.month.soldBy !== opts.onlyUid) continue;
    const solved = r.progress.liveAt;
    const base = { kind: "answer" as const, type: r.typeLabel.split(" · ")[0], clientName: r.plan.name, level: "answer", status: solved ? "Live" : "Open", solvedAt: solved, campaignId: r.month.id, itemId: r.task.itemId };
    for (const lr of r.item.lateReasons || []) lines.push({ ...base, at: toMs(lr.at) ?? 0, person: lr.byName, text: `${r.title}: ${lr.reason}${lr.note ? ` — ${lr.note}` : ""}` });
    if (r.item.eta) lines.push({ ...base, at: toMs(r.item.eta.at) ?? 0, person: r.item.eta.byName, text: `${r.title}: ${r.item.eta.kind === "focus" ? "Do it now" : "Need more time"} (until ${timeWords(r.item.eta.until)})` });
    if (r.item.blocker) lines.push({ ...base, at: toMs(r.item.blocker.since) ?? 0, person: r.item.blocker.byName, text: `${r.title}: Blocked — ${r.item.blocker.kind.replace(/_/g, " ")}${r.item.blocker.note ? ` (${r.item.blocker.note})` : ""}` });
    for (const m of r.item.moves || []) lines.push({ ...base, at: toMs(m.at) ?? 0, person: m.byName, text: `${r.title}: moved from week ${m.fromWeek} to ${m.toWeek === "out" ? "the next month" : `week ${m.toWeek}`} — ${m.reason}` });
    for (const ra of r.item.reassigns || []) lines.push({ ...base, at: toMs(ra.at) ?? 0, person: ra.byName, text: `${r.title}: ${ra.seat === "maker" ? "making" : "posting"} given to somebody else` });
    if (r.item.approvalProof) lines.push({ ...base, at: r.item.approvalProof.at, person: r.item.approvalProof.byName, text: `${r.title}: client ${r.item.approvalProof.approved ? "approved" : "asked for changes"} (${r.item.approvalProof.who}, ${r.item.approvalProof.via.replace("_", " ")})` });
  }
  return lines.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "alert" ? -1 : 1) || b.at - a.at);
}

/** One sentence on top of the log: client delays vs team delays (no charts). */
export function delaySummary(board: SmmControlBoard): string {
  const late = board.rows.filter((r) => r.progress.blame && r.progress.state !== "done" || (r.progress.onTime === false));
  const client = late.filter((r) => r.progress.blame === "client").length;
  const team = late.filter((r) => r.progress.blame === "team").length;
  const pub = late.filter((r) => r.progress.blame === "publisher").length;
  const pending = board.rows.filter((r) => r.progress.state === "pending_client").length;
  if (!client && !team && !pub && !pending) return "Nothing late so far — every checkpoint was met.";
  const parts: string[] = [];
  if (team) parts.push(`${team} because the team had not sent it to the client in time`);
  if (pub) parts.push(`${pub} approved but not posted in time`);
  if (client) parts.push(`${client} because the client was slow to approve or send footage`);
  if (pending) parts.push(`${pending} pending — the client never sent the footage (not counted against the team)`);
  return `Late or behind: ${parts.join("; ")}.`;
}

/* ── The month's header sentence ──────────────────────────────────────────────────────────────── */

export function monthSentence(mv: SmmMonthView, today: string): string {
  const p = mv.plan;
  if (p.exclusion === "on_hold") return "On hold — the month ended without a renewal decision. No production alerts; the salesperson renews.";
  if (p.exclusion) return "This month is not chased.";
  if (p.problem === "bad_dates") return "Its dates are missing or wrong — fix them in the classic Edit setup.";
  if (p.problem === "too_short") return "It is shorter than 22 days, so it has no weeks.";
  const own = p.weeks.length ? { start: p.weeks[0].start, end: p.weeks[3].end } : null;
  if (own && today < own.start) return `Starts ${dayWords(own.start)}.`;
  if (mv.late) return `${mv.late} piece${mv.late === 1 ? " is" : "s are"} late${mv.risk ? `, ${mv.risk} behind inside the week` : ""}.`;
  if (mv.risk) return `${mv.risk} piece${mv.risk === 1 ? " is" : "s are"} behind inside the week — the deadline is still ahead.`;
  if (mv.client) return `On track — ${mv.client} waiting for the client.`;
  if (mv.counted && mv.done === mv.counted) return "Every promised piece is live.";
  return "On track.";
}

/** "Day 12 of 31". */
export function dayOfMonth(plan: SmmMonthPlan, today: string): string {
  if (!plan.weeks.length) return "";
  const start = plan.weeks[0].start;
  const last = plan.weeks[3].end;
  const total = daysFrom(start, last) + 1;
  const n = daysFrom(start, today) + 1;
  if (n < 1) return `Starts in ${1 - n} day${1 - n === 1 ? "" : "s"}`;
  if (n > total) return `Ended (${total} days)`;
  return `Day ${n} of ${total}`;
}

/** The days the planner needs holidays for: from 7 days before the earliest month's start to the latest end. */
export function holidayWindow(months: readonly SmmDeliveryMonth[], today: string): { from: string; to: string } {
  let from = addDaysIso(today, -40);
  let to = addDaysIso(today, 40);
  for (const m of months) {
    const s = m.cycle?.startDate;
    const e = m.cycle?.endDate;
    if (s && s < from && s > addDaysIso(today, -70)) from = s;
    if (e && e > to && e < addDaysIso(today, 70)) to = e;
  }
  return { from, to };
}

/**
 * Live since: when Delivery Control last went Live — the starting point of months not switched on yet. The same
 * rule the server checker uses (`utils/smmDeliveryBaseline.liveSinceAt`); null outside Live (the supervisor then
 * uses "now": Preview shows what switching on now would do).
 */
export function liveSinceOf(settings: SmmDeliverySettings, now: number = Date.now()): number | null {
  return liveSinceAt(settings, now);
}
