/**
 * A social-media month's DATES — when a month starts, the one check every change of its dates passes,
 * which month a piece dated elsewhere belongs to, and the months whose dates need a person's eye
 * (2026-10-15). Pure: no Firestore, no React — the services and the screens both ask here.
 *
 * ── Why one check for every way a month's dates change ──────────────────────────────────────────
 * The owner's Dhana lakshmi month: its posts were dated 13 Aug – 9 Sep, and "Edit setup" moved the month
 * to 6 Oct → 6 Nov. Nothing objected — four different writers changed a month's dates (`applyMonthSetup`,
 * `applyHistorySetup`, `saveMonthSetup`, and `setupSaleMonth`'s history branch, which wrote `cycle`
 * straight onto the document) and not one of them looked at what was attached to the month: its posts,
 * or the client's other months. Every one of them now asks `monthDatesCheck`, with the month as the
 * database holds it, before the write:
 *   • two months of one client never share a day (ends are exclusive — the end date is the renewal day,
 *     the next month's first day, so back-to-back months do not overlap) → refused, naming the other month;
 *   • a post whose day would fall outside the new dates is never left there silently → the screen lists
 *     them and the call must carry the confirmation, piece by piece (`confirmedOutside`);
 *   • a locked month (ended, filed or history) may only be corrected within the past — the rule
 *     "Manage historical record" always had, now also for a month that was never set up before.
 *
 * ── When a month starts (owner, 2026-10-15) ─────────────────────────────────────────────────────
 * "The SALE FORM asks when the month starts." A renewal starts on the old month's END DATE — always, even
 * when it is recorded late — so the client stays on the same date every month; a new client starts on the
 * day of the sale; the salesperson may change it. Nothing uses "today" as a month's start any more.
 */
import { addDays, daysBetween, dayToDate, isOwnDay, isPosted, postedDayOf } from "@/utils/smmPlan";
import { cycleRangeLabel, cyclesOverlap, isMonthLocked, monthLabel, ownDaysLabel, shortDayLabel, splitByMonthDates } from "@/utils/smmPackage";
import type { SmmCampaign, SmmContentItem, SmmContentKind, SmmCycle } from "@/types/smm";

type Dates = Pick<SmmCycle, "startDate" | "endDate">;
type MonthRef = Pick<SmmCampaign, "id" | "cycle" | "status"> & Partial<Pick<SmmCampaign, "businessName" | "clientName" | "monthNumber">>;

const gone = (m: Pick<SmmCampaign, "status"> | null | undefined) => !m || m.status === "removed" || m.status === "deleted";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Month 2 · September 2026 (6 Sep → 6 Oct 2026)" — a month named in a sentence. */
export function monthNameOf(m: MonthRef): string {
  const n = m.monthNumber ? `Month ${m.monthNumber} · ` : "";
  return `${n}${monthLabel(m.cycle.startDate)} (${cycleRangeLabel(m.cycle)})`;
}

/* ── The sale form's "Month starts on" ─────────────────────────────────────────────────────────── */

/**
 * Where "Month starts on" opens: the renewed month's end date (its renewal day) for a renewal, else the
 * day of the sale. A renewal recorded late still opens on the old end date — the owner's rule; the
 * salesperson moves it when the client really had a gap.
 */
export function saleMonthStartDefault(p: { previousEnd?: string | null; saleDay: string }): string {
  return p.previousEnd && dayToDate(p.previousEnd) ? p.previousEnd : p.saleDay;
}

/**
 * Whether a typed "Month starts on" can be saved — `problem` refuses it in a sentence; `note` is said
 * under the field. A renewal may not start before the month it renews has ended (its end date): the two
 * would share days. A later start is allowed and said: "3 days after the last month ended (6 Oct)".
 */
export function saleMonthStartCheck(start: string, previousEnd?: string | null): { problem: string; note: string } {
  if (!dayToDate(start)) return { problem: "Pick the day the month starts.", note: "" };
  if (!previousEnd || !dayToDate(previousEnd)) return { problem: "", note: "" };
  if (start < previousEnd) {
    return {
      problem: `The last month runs until ${shortDayLabel(addDays(previousEnd, -1))} — the next month can't start before ${shortDayLabel(previousEnd)}.`,
      note: "",
    };
  }
  const gap = daysBetween(previousEnd, start);
  if (gap === 0) return { problem: "", note: `Straight after the last month — it ended ${shortDayLabel(previousEnd)}.` };
  return { problem: "", note: `${plural(gap, "day", "days")} after the last month ended (${shortDayLabel(previousEnd)}).` };
}

/* ── The one check on a change of a month's dates ─────────────────────────────────────────────── */

/** A piece whose day would fall outside a month's new dates. */
export interface OutsidePiece {
  id: string;
  title: string;
  kind: SmmContentKind;
  /** The day it is on: its upload date, else — once posted — the day it was marked posted. */
  day: string;
  posted: boolean;
  /** It was on one of the month's own days before the change (false: it was already outside). */
  wasInside: boolean;
}

export interface MonthDatesVerdict {
  /** The dates differ from the month's own (always true for a month that does not exist yet). */
  changed: boolean;
  /** The sentence that refuses the change, or "" when it may be saved. */
  problem: string;
  /** The client's other month these dates would share days with. */
  overlap: { id: string; name: string } | null;
  /** Refused because the month is locked and the dates reach today or later. */
  locked: boolean;
  /** Every piece outside the new dates (sorted by day). */
  outside: OutsidePiece[];
  /** Those of them the call did not confirm — the reason for `problem` when it is about the posts. */
  unconfirmed: OutsidePiece[];
}

/** The sentence a locked month is refused with — the same words "Manage historical record" always used. */
export const LOCKED_MONTH_DATES =
  "This completed month is locked to preserve its history and cannot be edited to represent a renewal. Create a new month for the next period.";

/** The day a piece is on, for the dates check: its upload date, else (posted) the day it was marked posted. */
export function pieceDayOf(item: Pick<SmmContentItem, "uploadDate" | "postedAt" | "status">): string | null {
  if (item.uploadDate) return item.uploadDate;
  return item.status === "posted" ? postedDayOf(item) : null;
}

/** "Diwali offer (9 Oct)" — one piece in a sentence. */
function pieceWords(p: OutsidePiece): string {
  return `${p.title.trim() || "Untitled post"} (${shortDayLabel(p.day)})`;
}

/**
 * "These 3 posts will be outside the month's dates (6 Sep – 5 Oct): Diwali offer (9 Oct), … Keep the new
 * dates anyway?" — the question the setup screens ask before the call carries the confirmation.
 */
export function outsideQuestion(pieces: OutsidePiece[], next: Dates): string {
  if (pieces.length === 0) return "";
  const shown = pieces.slice(0, 6).map(pieceWords).join(", ");
  const more = pieces.length > 6 ? ` and ${pieces.length - 6} more` : "";
  const head = pieces.length === 1 ? "This post will be" : `These ${pieces.length} posts will be`;
  return `${head} outside the month's dates (${ownDaysLabel(next)}): ${shown}${more}. Keep the new dates anyway?`;
}

/**
 * The check every change of a month's dates passes (see the banner). `month` is the month as stored —
 * null for a month about to be created; `others` the client's other months (`fetchClientMonths`; gone
 * ones and the month itself are skipped); `confirmedOutside` the ids of the pieces the person agreed to
 * leave outside the new dates. Nothing is checked when the dates do not change.
 */
export function monthDatesCheck(input: {
  month: (Pick<SmmCampaign, "id" | "cycle" | "status" | "history"> & { items?: SmmContentItem[] }) | null;
  next: Dates;
  others: MonthRef[];
  today: string;
  confirmedOutside?: readonly string[] | null;
}): MonthDatesVerdict {
  const { month, next, today } = input;
  const none: MonthDatesVerdict = { changed: false, problem: "", overlap: null, locked: false, outside: [], unconfirmed: [] };
  if (!dayToDate(next.startDate)) return { ...none, changed: true, problem: "Pick the day the month starts." };
  if (!dayToDate(next.endDate) || next.endDate <= next.startDate) {
    return { ...none, changed: true, problem: "The month must end after it starts." };
  }
  const changed = !month?.cycle || month.cycle.startDate !== next.startDate || month.cycle.endDate !== next.endDate;
  if (!changed) return none;

  // A locked month is corrected within the past only — its renewal day (the end date) today or earlier.
  const locked = !!month && isMonthLocked(month, today) && next.endDate > today;

  const clash = input.others.find((o) => o.id !== month?.id && !gone(o) && !!o.cycle && cyclesOverlap(o.cycle, { month: "", ...next }));
  const overlap = clash ? { id: clash.id, name: monthNameOf(clash) } : null;

  const confirmed = new Set(input.confirmedOutside || []);
  const outside: OutsidePiece[] = [];
  for (const item of month?.items || []) {
    const day = pieceDayOf(item);
    if (!day || isOwnDay(next, day)) continue;
    outside.push({
      id: item.id,
      title: item.title || "",
      kind: item.kind,
      day,
      posted: isPosted(item),
      wasInside: !!month?.cycle && isOwnDay(month.cycle, day),
    });
  }
  outside.sort((a, b) => a.day.localeCompare(b.day));
  const unconfirmed = outside.filter((p) => !confirmed.has(p.id));

  const problem = locked
    ? LOCKED_MONTH_DATES
    : overlap
      ? `These dates overlap the client's ${overlap.name} — two months can't share a day. Change the dates, or correct that month's dates first.`
      : unconfirmed.length > 0
        ? outsideQuestion(outside, next)
        : "";
  return { changed, problem, overlap, locked, outside, unconfirmed };
}

/* ── Which months make one client's run ──────────────────────────────────────────────────────── */

/** The longest gap one month may leave before the next and still be continued by it (Month N → N+1). */
export const RUN_GAP_DAYS = 7;

/**
 * Does a month starting `nextStart` continue one that ends (renews) `prevEnd`? Only FORWARD (2026-10-15):
 * it starts on that end date or up to a week after it. It used to be "a week apart either way", so a month
 * starting up to seven days BEFORE the previous one ended — the two sharing days — was linked as its
 * renewal; such dates are now refused outright (`monthDatesCheck`, overlap).
 */
export function continuesInto(prevEnd: string | null | undefined, nextStart: string | null | undefined): boolean {
  if (!prevEnd || !nextStart || !dayToDate(prevEnd) || !dayToDate(nextStart)) return false;
  const gap = daysBetween(prevEnd, nextStart);
  return gap >= 0 && gap <= RUN_GAP_DAYS;
}

/* ── Pieces dated in another month of the same client ─────────────────────────────────────────── */

/**
 * The client's other month that covers this piece's day, when the piece is dated outside its own month —
 * where "Move to Month N" sends it. Null when it sits on its own month's days, has no day, or no other
 * month of the client covers that day.
 */
export function moveTargetFor(
  item: Pick<SmmContentItem, "uploadDate" | "postedAt" | "status">,
  month: Pick<SmmCampaign, "id" | "cycle">,
  clientMonths: MonthRef[],
): MonthRef | null {
  const day = pieceDayOf(item);
  if (!day || !month.cycle || isOwnDay(month.cycle, day)) return null;
  return clientMonths.find((m) => m.id !== month.id && !gone(m) && !!m.cycle && isOwnDay(m.cycle, day)) || null;
}

/** "Move to Month 3 (6 Oct – 5 Nov)" — the button's words. */
export function moveTargetLabel(target: MonthRef): string {
  return `Move to ${target.monthNumber ? `Month ${target.monthNumber}` : monthLabel(target.cycle.startDate)} (${ownDaysLabel(target.cycle)})`;
}

/**
 * A row nobody has touched: not extra work, not carried in, still planned, no title, no date, never sent to
 * the client, no notes — the only kind a count may drop, and the place a piece moved in may take.
 */
export function isUntouchedRow(i: SmmContentItem): boolean {
  return !i.extra && !i.carriedFrom && i.status === "planned" && !i.title?.trim() && !i.uploadDate
    && (!i.approval || i.approval.state === "not_sent") && !i.notes?.trim();
}

/* ── Months to check (the admins' list on the board) ──────────────────────────────────────────── */

export interface MonthToCheck {
  id: string;
  name: string;
  /** Each a sentence: "9 posts are dated outside 6 Oct – 5 Nov", "Overlaps …", "Starts 3 days after …". */
  reasons: string[];
}

/**
 * The months on the board whose dates need a person's eye — how the owner finds the months damaged before
 * the dates check existed (the Dhana lakshmi month). From the months already in hand (the overseer's live
 * list), no read: a month with pieces dated outside its own days, a client whose months share days, and a
 * linked pair (renewal → next month) whose next month does not start on the renewal day. Worst first.
 */
export function monthsToCheck(months: SmmCampaign[], _today?: string): MonthToCheck[] {
  const live = months.filter((m) => !gone(m) && !!m.cycle?.startDate);
  const byId = new Map(live.map((m) => [m.id, m]));
  const out = new Map<string, MonthToCheck>();
  const add = (m: SmmCampaign, reason: string) => {
    const row = out.get(m.id) || { id: m.id, name: m.businessName || m.clientName || "A client", reasons: [] };
    if (!row.reasons.includes(reason)) row.reasons.push(reason);
    out.set(m.id, row);
  };

  for (const m of live) {
    const outside = splitByMonthDates((m.items || []).filter((i) => !i.extra), m.cycle).outside.length;
    if (outside > 0) add(m, `${plural(outside, "post is", "posts are")} dated outside ${ownDaysLabel(m.cycle)}`);
  }

  for (let a = 0; a < live.length; a += 1) {
    for (let b = a + 1; b < live.length; b += 1) {
      const x = live[a];
      const y = live[b];
      if (!x.clientPhoneId || x.clientPhoneId !== y.clientPhoneId) continue;
      if (!cyclesOverlap(x.cycle, y.cycle)) continue;
      add(x, `Shares days with ${monthNameOf(y)}`);
      add(y, `Shares days with ${monthNameOf(x)}`);
    }
  }

  for (const m of live) {
    const nextId = m.renewal?.nextCampaignId;
    const next = nextId ? byId.get(nextId) : null;
    if (!next || next.cycle.startDate === m.cycle.endDate) continue;
    const gap = daysBetween(m.cycle.endDate, next.cycle.startDate);
    add(next, gap > 0
      ? `Starts ${plural(gap, "day", "days")} after ${monthNameOf(m)} ended — a gap between linked months`
      : `Starts before ${monthNameOf(m)} ended — linked months share days`);
  }

  return [...out.values()].sort((p, q) => q.reasons.length - p.reasons.length || p.name.localeCompare(q.name));
}
