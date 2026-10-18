/**
 * India-day helpers for the Development OS (CLAUDE.md §28: never `toISOString().slice(0, 10)`; the server runs in
 * UTC, so every day here is computed in Asia/Kolkata = UTC+5:30, which has no daylight saving).
 *
 * Days are `yyyy-MM-dd` strings and day arithmetic is UTC-calendar arithmetic on them (no time zone involved).
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

/** The India day of an instant. */
export function istDay(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour of the day in India (0–23) of an instant. */
export function istHour(ms: number): number {
  return new Date(ms + IST_OFFSET_MS).getUTCHours();
}

/** The instant of `hh:mm` India time on `day`. */
export function istAt(day: string, hour: number, minute = 0): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS;
}

/** End of the India day (23:59:59.999). */
export function istEndOfDay(day: string): number {
  return istAt(day, 0) + DAY_MS - 1;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The India time of an instant as people say it: "11 PM", "11:30 PM", "midnight" (the end of a day). */
export function timeLabel(ms: number): string {
  const t = new Date(ms + IST_OFFSET_MS);
  const h = t.getUTCHours();
  const m = t.getUTCMinutes();
  if ((h === 23 && m === 59) || (h === 0 && m === 0)) return "midnight";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-10-19" → "19 Oct" — a stored day as people read it (screens and task titles never show raw ISO days). */
export function dayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : day;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday of the week holding `day`. */
export function mondayOf(day: string): string {
  const wd = weekdayOf(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

/** Week key = the week's Monday. */
export const weekKeyOf = (day: string): string => mondayOf(day);

export interface WorkdayContext {
  workDays: number[];
  holidays: ReadonlySet<string> | null;
}

/** A company working day: a configured weekday and not a holiday (`holidays/{day}`). */
export function isWorkday(day: string, ctx: WorkdayContext): boolean {
  if (!ctx.workDays.includes(weekdayOf(day))) return false;
  return !(ctx.holidays && ctx.holidays.has(day));
}

/** The last working day of the week holding `day` (falls back to the week's Saturday). */
export function lastWorkdayOfWeek(day: string, ctx: WorkdayContext): string {
  const monday = mondayOf(day);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(monday, i);
    if (isWorkday(d, ctx)) return d;
  }
  return addDays(monday, 5);
}

/** The previous working day before `day` (at most 14 days back). */
export function previousWorkday(day: string, ctx: WorkdayContext): string | null {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(day, -i);
    if (isWorkday(d, ctx)) return d;
  }
  return null;
}

/** "Mon 19 Oct" */
export function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${wd} ${d} ${mon}`;
}
