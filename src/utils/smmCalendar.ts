/**
 * A client's social media as a calendar — a normal calendar, one calendar month per page, across every
 * month we ran for them (2026-10-05; redrawn twice that day for the owner).
 *
 * ── Why normal calendar months (third version) ────────────────────────────────────────────────
 * 1. The first version paged by calendar month but drew six stage colours, hatching and small icons —
 *    "confusing; even an uneducated person must understand it".
 * 2. The second paged by the CLIENT's months ("Month 2 · 5 Sep – 5 Oct", "‹ Month 1"). A client with one
 *    month in the app then had nothing to switch to, and the owner found "no option to change the month".
 * 3. So (owner's choice, with mockups) it pages like any phone calendar — ‹ September · October 2026 ·
 *    November ›, Today, a list of every month — and keeps the second version's three marks. The client's
 *    months are drawn ON the days ("Month 2 starts", "Month 2 ends") and named above the grid. The arrows
 *    stop at the first and last calendar months that hold anything of the client's. The three counts are
 *    the posts on the days of the month on screen — what you count is what you see.
 *
 * ── Three marks, nothing else ─────────────────────────────────────────────────────────────────
 * The first version used the section's six stage colours, hatching and small icons — all of which need
 * explaining. A day now shows at most three marks, each a shape AND a colour AND a word (colour alone
 * fails a colour-blind reader): ✔ green POSTED, ✖ red NOT POSTED (its day has passed), ◷ grey COMING UP.
 * Where a piece is in the making — with the client, being made — is said in words when the day is opened.
 *
 * ── Which day a post sits on: its UPLOAD date (owner, 2026-10-05) ─────────────────────────────
 * Every piece sits on its upload date (`uploadDate`, the Content list's UPLOAD column), posted or not.
 * The second version put a POSTED piece on the day it was marked posted (`postedAt`); the team marked
 * all nine posts of a month posted on one day, so the whole month piled onto 5 Oct and its planned days
 * were empty. The day it was marked posted is still said in words when the day is opened ("Posted on
 * 5 Oct (it was planned for 15 Aug)"). Only a posted piece never given an upload date falls back to that
 * day; a piece with neither is listed under the calendar, on the pages of its month. A piece whose date
 * lies outside its month shows on that date's page — the arrows reach that far.
 *
 * ── Who sees which months ─────────────────────────────────────────────────────────────────────
 * Exactly the months the viewer can already open (owner, 2026-10-05): an overseer sees every month; a
 * member or a salesperson the months they are on or sold (`watchers`, `soldBy`).
 *
 * Pure — no Firestore, no React — like `smmPlan` and `smmPackage`, whose rules it reuses.
 */
import { addDays, daysBetween, dayToDate, isPosted, isSmmOverseer, isWaitingOnClient } from "@/utils/smmPlan";
import { cyclePhase, monthLabel, shortDayLabel, type SmmPhase } from "@/utils/smmPackage";
import { postedDay } from "@/utils/smmDashboard";
import { SMM_CONTENT_KINDS, type SmmCampaign, type SmmContentItem, type SmmContentKind } from "@/types/smm";

/* ── Days and weeks ─────────────────────────────────────────────────────────────────────────── */

/** Monday first — the week this team plans in. */
export const CAL_WEEKDAYS: { short: string; letter: string; long: string }[] = [
  { short: "Mon", letter: "M", long: "Monday" },
  { short: "Tue", letter: "T", long: "Tuesday" },
  { short: "Wed", letter: "W", long: "Wednesday" },
  { short: "Thu", letter: "T", long: "Thursday" },
  { short: "Fri", letter: "F", long: "Friday" },
  { short: "Sat", letter: "S", long: "Saturday" },
  { short: "Sun", letter: "S", long: "Sunday" },
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];

/** "2026-10" — the calendar month a `yyyy-MM-dd` day is in. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

/** "October 2026". */
export function monthTitle(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return y && m >= 1 && m <= 12 ? `${MONTHS_LONG[m - 1]} ${y}` : "";
}

/** "Oct" — what the ‹ and › buttons say. */
export function monthShort(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return m >= 1 && m <= 12 ? MONTHS_SHORT[m - 1] : "";
}

/** The calendar month `n` months after `ym` (before it, when `n` is negative). */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** A calendar month's first and last day. */
export function monthBounds(ym: string): { first: string; last: string } {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return { first: `${ym}-01`, last: `${ym}-${String(days).padStart(2, "0")}` };
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(iso: string): number {
  const d = dayToDate(iso);
  return d ? (d.getDay() + 6) % 7 : 0;
}

/** "Tuesday, 13 October 2026" — the day panel's heading and a day's spoken name. */
export function longDayLabel(iso: string): string {
  const d = dayToDate(iso);
  return d ? `${CAL_WEEKDAYS[weekdayIndex(iso)].long}, ${d.getDate()} ${monthLabel(iso)}` : "";
}

/** "Sep 2026" — the short name of the calendar month a day is in. */
export function shortMonthYear(iso: string): string {
  const d = dayToDate(iso);
  return d ? `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : "";
}

/** "5 Sep – 5 Oct 2026" (or "20 Dec 2026 – 20 Jan 2027" across a year). */
export function rangeLabel(from: string, to: string): string {
  const a = dayToDate(from);
  const b = dayToDate(to);
  if (!a || !b) return "";
  const left = `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : ""}`;
  return `${left} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}

/** Whole weeks, Monday first, from the week holding `from` to the week holding `to`. */
export function weekGrid(from: string, to: string): string[] {
  if (!dayToDate(from) || !dayToDate(to) || to < from) return [];
  const first = addDays(from, -weekdayIndex(from));
  const last = addDays(to, 6 - weekdayIndex(to));
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 7 * 12; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ── Which months, and whose ────────────────────────────────────────────────────────────────── */

export interface CalendarViewer {
  uid: string;
  role?: string;
  smmLeader?: boolean;
}

/** The months a person can already open — see the header. Removed and deleted months are gone for all. */
export function canSeeSmmMonth(c: Pick<SmmCampaign, "watchers" | "soldBy" | "status">, viewer: CalendarViewer | null | undefined): boolean {
  if (!viewer?.uid || c.status === "removed" || c.status === "deleted") return false;
  if (isSmmOverseer(viewer)) return true;
  return !!c.watchers?.includes(viewer.uid) || c.soldBy === viewer.uid;
}

/**
 * Which client a month belongs to — the client's number, the key every month of theirs shares. A month
 * with no number on it (a very old direct month) is a client of its own.
 */
export const clientKeyOf = (c: Pick<SmmCampaign, "id" | "clientPhoneId">): string =>
  c.clientPhoneId ? c.clientPhoneId : `month:${c.id}`;

/** The client's months that can be drawn, first to last. */
export function clientMonths(months: SmmCampaign[]): SmmCampaign[] {
  return months
    .filter((c) => c.cycle?.startDate && c.status !== "removed" && c.status !== "deleted")
    .sort((a, b) => a.cycle.startDate.localeCompare(b.cycle.startDate) || a.id.localeCompare(b.id));
}

/** "Month 2" — the month's own number, as its page shows it. */
export const monthName = (c: Pick<SmmCampaign, "monthNumber">): string => `Month ${c.monthNumber || 1}`;

/* ── The client's posts ─────────────────────────────────────────────────────────────────────── */

/**
 * Where a piece stands.
 *   posted — went live;  late — past its day, its month still running;  missed — its month is over and
 *   it never went live;  planned — today or still to come;  undated — no day given yet, month running.
 */
export type CalendarEntryState = "posted" | "late" | "missed" | "planned" | "undated";

/** The three marks a day can show (see the header). */
export type DayMark = "posted" | "notPosted" | "coming";

export const DAY_MARKS: { key: DayMark; label: string }[] = [
  { key: "posted", label: "Posted" },
  { key: "notPosted", label: "Not posted" },
  { key: "coming", label: "Coming up" },
];

export interface CalendarEntry {
  /** Unique across the client's months — two months can hold pieces with the same id. */
  key: string;
  item: SmmContentItem;
  monthId: string;
  /** The day it sits on: its upload date; for a posted piece with none, the day it went live. Null: no day at all. */
  day: string | null;
  plannedDay: string | null;
  /**
   * The day somebody pressed Posted (`postedAt` is stamped then — services/smm), which is not always the
   * day it went live: a month's posts are often ticked off together later. Null when not posted, or
   * posted before the stamp existed. Used only for a posted piece that has no upload date.
   */
  markedDay: string | null;
  state: CalendarEntryState;
  mark: DayMark;
}

export type CalendarKind = SmmContentKind | "all";

export const markOf = (state: CalendarEntryState): DayMark =>
  state === "posted" ? "posted" : state === "late" || state === "missed" ? "notPosted" : "coming";

function entryOf(c: SmmCampaign, item: SmmContentItem, today: string): CalendarEntry {
  const posted = isPosted(item);
  const stamped = posted ? postedDay({ postedAt: item.postedAt, uploadDate: null }) : null;
  const plannedDay = item.uploadDate || null;
  const monthOver = c.cycle.endDate < today || c.status !== "active";
  let state: CalendarEntryState;
  if (posted) state = "posted";
  else if (monthOver) state = "missed";
  else if (!plannedDay) state = "undated";
  else state = plannedDay < today ? "late" : "planned";
  return {
    key: `${c.id}:${item.id}`,
    item,
    monthId: c.id,
    day: plannedDay || stamped,
    plannedDay,
    markedDay: stamped,
    state,
    mark: markOf(state),
  };
}

const byTimeThenTitle = (a: CalendarEntry, b: CalendarEntry) =>
  (a.item.uploadTime || "99:99").localeCompare(b.item.uploadTime || "99:99")
  || (a.item.title || "").localeCompare(b.item.title || "");

/** One of the client's months, as the calendar names it. */
export interface CalendarClientMonth {
  id: string;
  /** "Month 2". */
  name: string;
  startDate: string;
  endDate: string;
  phase: SmmPhase;
  /** Recorded after it ended: what went up was not tracked here. */
  history: boolean;
}

/** Everything the calendar draws for one client, worked out once. */
export interface ClientRun {
  /** Their months, first to last. */
  months: CalendarClientMonth[];
  /** Every piece of every month, after the kind filter. */
  entries: CalendarEntry[];
  /** The first and last calendar months that hold anything of theirs — where ‹ and › stop. */
  first: string;
  last: string;
}

/**
 * Gather a client's months and pieces. `kind` narrows it to posters, AI videos or real videos. A history
 * month's unposted rows are left out: they are the blank plan the record was built with, not work anybody
 * owed here. Null when there is no month to draw.
 */
export function buildClientRun(campaigns: SmmCampaign[], today: string, kind: CalendarKind = "all"): ClientRun | null {
  const list = clientMonths(campaigns);
  if (list.length === 0) return null;
  const months: CalendarClientMonth[] = list.map((c) => {
    const startDate = c.cycle.startDate;
    const endDate = c.cycle.endDate && c.cycle.endDate >= startDate ? c.cycle.endDate : startDate;
    return {
      id: c.id, name: monthName(c), startDate, endDate,
      phase: cyclePhase({ month: "", startDate, endDate }, today), history: !!c.history,
    };
  });
  let from = months[0].startDate;
  let to = months.reduce((max, m) => (m.endDate > max ? m.endDate : max), months[0].endDate);
  const entries: CalendarEntry[] = [];
  for (const c of list) {
    for (const item of c.items || []) {
      if (kind !== "all" && item.kind !== kind) continue;
      if (c.history && !isPosted(item)) continue;
      const entry = entryOf(c, item, today);
      entries.push(entry);
      if (entry.day && entry.day < from) from = entry.day;
      if (entry.day && entry.day > to) to = entry.day;
    }
  }
  return { months, entries, first: monthOf(from), last: monthOf(to) };
}

/** The client's month a day is in — on a handover day (one month's last, the next's first), the new one. */
export function clientMonthOn(months: CalendarClientMonth[], day: string): CalendarClientMonth | null {
  let found: CalendarClientMonth | null = null;
  for (const m of months) if (m.startDate <= day && day <= m.endDate) found = m;
  return found;
}

/** A client's month starting or ending on a day of the page. */
export interface MonthMarker {
  kind: "start" | "end";
  month: CalendarClientMonth;
}

/** One calendar month of a client, laid out. */
export interface CalendarPage {
  /** "2026-10". */
  ym: string;
  /** "October 2026". */
  title: string;
  /** Whole weeks, Monday first, covering the month; the days of the months around it are drawn empty. */
  days: string[];
  /** The month's own days that have posts, each day's posts by time. */
  byDay: Map<string, CalendarEntry[]>;
  /** The posts on the month's days, by mark — the three counts. */
  counts: Record<DayMark, number>;
  /** The client's months that run on any day of this one, or own a post drawn on it. */
  months: CalendarClientMonth[];
  /** Posts of those months that were never given a day — listed under the calendar. */
  undated: CalendarEntry[];
  /** Where a client's month starts or ends on this page — an end before a start on a handover day. */
  markers: Map<string, MonthMarker[]>;
}

/** Lay one calendar month (`yyyy-MM`) of the client out. */
export function calendarPage(run: ClientRun, ym: string): CalendarPage {
  const { first, last } = monthBounds(ym);
  const running = new Set(run.months.filter((m) => m.startDate <= last && m.endDate >= first).map((m) => m.id));
  // A month whose post is dated outside it (an upload date typed a month early) is named on that page too.
  const owning = new Set(run.entries.filter((e) => e.day && monthOf(e.day) === ym).map((e) => e.monthId));
  const months = run.months.filter((m) => running.has(m.id) || owning.has(m.id));
  const byDay = new Map<string, CalendarEntry[]>();
  const counts: Record<DayMark, number> = { posted: 0, notPosted: 0, coming: 0 };
  const undated: CalendarEntry[] = [];
  for (const entry of run.entries) {
    if (!entry.day) {
      if (running.has(entry.monthId)) undated.push(entry);
      continue;
    }
    if (monthOf(entry.day) !== ym) continue;
    counts[entry.mark] += 1;
    const list = byDay.get(entry.day) || [];
    list.push(entry);
    byDay.set(entry.day, list);
  }
  for (const list of byDay.values()) list.sort(byTimeThenTitle);
  undated.sort((a, b) => a.monthId.localeCompare(b.monthId) || (a.item.title || "").localeCompare(b.item.title || ""));

  const markers = new Map<string, MonthMarker[]>();
  const mark = (day: string, marker: MonthMarker) => {
    if (monthOf(day) !== ym) return;
    const list = markers.get(day) || [];
    list.push(marker);
    markers.set(day, list);
  };
  for (const m of months) mark(m.endDate, { kind: "end", month: m });
  for (const m of months) mark(m.startDate, { kind: "start", month: m });

  return { ym, title: monthTitle(ym), days: weekGrid(first, last), byDay, counts, months, undated, markers };
}

/**
 * The client's month a piece belongs to, when its day falls outside that month — else null. Said on the
 * piece ("Its date is outside Month 1 · 6 Sep – 6 Oct") so a date typed a month early is easy to spot.
 */
export function outsideItsMonth(run: Pick<ClientRun, "months">, entry: CalendarEntry): CalendarClientMonth | null {
  if (!entry.day) return null;
  const own = run.months.find((m) => m.id === entry.monthId);
  return own && (entry.day < own.startDate || entry.day > own.endDate) ? own : null;
}

/** Keep a calendar month inside the stretch the arrows can reach. */
const clampMonth = (ym: string, run: Pick<ClientRun, "first" | "last">): string =>
  ym < run.first ? run.first : ym > run.last ? run.last : ym;

/**
 * The calendar month the calendar opens on. The month it is about — the page's own month when there is
 * one, else the month running today (the new one on a handover day), else the client's latest — shown on
 * today's page while it runs, else on the page holding the middle of it (5 Aug – 5 Sep opens on August).
 */
export function openingMonth(run: ClientRun, today: string, focusId?: string | null): string {
  const focus = focusId ? run.months.find((m) => m.id === focusId) : undefined;
  const target = focus || clientMonthOn(run.months, today) || run.months[run.months.length - 1];
  const runsToday = target.startDate <= today && today <= target.endDate;
  const middle = addDays(target.startDate, Math.floor(daysBetween(target.startDate, target.endDate) / 2));
  return clampMonth(monthOf(runsToday ? today : middle), run);
}

/**
 * The day picked when a page opens: today when it is on the page and part of the client's run; else the
 * page's first day with posts; else the first day of a client's month on it; else the 1st.
 */
export function openingDay(run: Pick<ClientRun, "months">, page: CalendarPage, today: string): string {
  if (monthOf(today) === page.ym && (page.byDay.has(today) || clientMonthOn(run.months, today))) return today;
  const busy = [...page.byDay.keys()].sort();
  if (busy[0]) return busy[0];
  const { first } = monthBounds(page.ym);
  const start = page.months[0]?.startDate;
  return start && start > first ? start : first;
}

/** A day's marks, counted — what its cell shows when there is no room for names. */
export function dayMarks(entries: CalendarEntry[]): { mark: DayMark; count: number }[] {
  return DAY_MARKS
    .map(({ key }) => ({ mark: key, count: entries.filter((e) => e.mark === key).length }))
    .filter((m) => m.count > 0);
}

/** "Running now" / "Finished" / "Starts in 3 days" — where the month is, in two words. */
export function phaseLabel(cal: Pick<CalendarClientMonth, "phase" | "startDate" | "history">, today: string): string {
  if (cal.history) return "Added after it ended";
  if (cal.phase === "running") return "Running now";
  if (cal.phase === "ended") return "Finished";
  const d = daysBetween(today, cal.startDate);
  return d === 1 ? "Starts tomorrow" : `Starts in ${d} days`;
}

/* ── A piece in words ───────────────────────────────────────────────────────────────────────── */

/** What a piece is called on the calendar: its title, else what kind it is ("Poster"). */
export const entryTitle = (item: Pick<SmmContentItem, "title" | "kind">): string =>
  item.title?.trim() || SMM_CONTENT_KINDS.find((k) => k.key === item.kind)?.singular || "Post";

/** One plain sentence on where a piece stands and when. */
export function entryNote(e: CalendarEntry, today: string): string {
  switch (e.state) {
    case "posted":
      // The upload date, the same day the piece is drawn on (see the header) — never the day Posted was pressed.
      if (e.plannedDay) return `Posted on ${shortDayLabel(e.plannedDay)}`;
      if (e.markedDay) return `Marked posted on ${shortDayLabel(e.markedDay)} — no upload date was given`;
      return "Posted — no date was given";
    case "late":
    case "missed":
      return e.plannedDay ? `Not posted — it was due on ${shortDayLabel(e.plannedDay)}` : "Not posted — no date was given";
    case "undated":
      return "No date given yet";
    default: {
      const d = daysBetween(today, e.plannedDay!);
      return d === 0 ? "To be posted today" : d === 1 ? "To be posted tomorrow" : `To be posted on ${shortDayLabel(e.plannedDay)}`;
    }
  }
}

/** Where a piece not yet posted is held up, in words — or null. */
export function waitingNote(item: SmmContentItem): string | null {
  if (isPosted(item)) return null;
  if (item.approval?.state === "changes") return "The client asked for changes";
  if (isWaitingOnClient(item)) return "Waiting for the client's approval";
  if (item.status === "in_progress") return "Being made";
  if (item.status === "approved" || item.status === "scheduled") return "Approved by the client — ready to post";
  return null;
}

/* ── The clients to pick from (the board's Calendar view) ───────────────────────────────────── */

export interface CalendarClient {
  key: string;
  name: string;
  clientName: string;
  phone: string;
  /** The month the client is in now, or their latest. */
  current: SmmCampaign;
  /** How many of their months are in the list given. */
  months: number;
  running: boolean;
}

/** One entry per client, A to Z, from the months the viewer has in front of them. */
export function calendarClients(campaigns: SmmCampaign[]): CalendarClient[] {
  const groups = new Map<string, SmmCampaign[]>();
  for (const c of campaigns) {
    if (c.status === "removed" || c.status === "deleted" || !c.cycle?.startDate) continue;
    const key = clientKeyOf(c);
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.cycle.startDate.localeCompare(a.cycle.startDate));
      const running = sorted.filter((c) => c.status === "active" && !c.history);
      const current = running[0] || sorted[0];
      return {
        key,
        name: current.businessName || current.clientName || current.clientPhone || "Client",
        clientName: current.clientName || "",
        phone: current.clientPhone || "",
        current,
        months: list.length,
        running: running.length > 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
