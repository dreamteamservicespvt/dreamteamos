/**
 * The occasions a poster can be themed for, dated, so the picker can offer what is coming UP.
 *
 * ── Why this is not the wishes list ───────────────────────────────────────────────────────────
 * `WISHES_OCCASION_GROUPS` (utils/festivals) is what greeting VIDEOS are sold for — birthdays,
 * weddings, shop openings — and it carries no dates. A poster is nearly always made for the next
 * festival or "day" on the calendar, and the question the member is really asking is "what is
 * coming up that this client should post for?". That needs dates, and it needs the observance
 * days businesses actually post for (Engineers' Day, Doctors' Day, Teachers' Day) which no
 * festival list carries.
 *
 * ── Where the dates come from ─────────────────────────────────────────────────────────────────
 *  - Lunar festivals: the dated company calendar (`FESTIVALS`, 2026). Their dates move every
 *    year, so they are only offered for the years that calendar covers — never guessed.
 *  - Fixed-date days (Independence Day, Engineers' Day, Christmas…): computed for any year.
 *  - Relative days (Mother's Day = second Sunday of May…): computed for any year.
 *
 * When the calendar runs out the picker still offers every fixed and relative day, and the
 * "type another festival" box is always there — the list saves typing, it never limits choice.
 */
import { FESTIVALS } from "./festivals";

export interface PosterOccasion {
  /** The name the prompt and the brief carry, e.g. "Ganesh Chaturthi (Vinayaka Chavithi)". */
  name: string;
  /** ISO YYYY-MM-DD. */
  date: string;
  note?: string;
}

/**
 * The Telugu / South-Indian names the team's clients use, shown beside the calendar name.
 *
 * The calendar says "Ganesh Chaturthi"; a client in Kakinada says "Vinayaka Chavithi". Both are
 * printed so the member recognises it and the image model is given the name the poster greets in.
 */
const REGIONAL_ALIASES: Record<string, string> = {
  "Ganesh Chaturthi": "Vinayaka Chavithi",
  "Makar Sankranti": "Sankranthi",
  "Dussehra / Vijayadashami": "Dasara",
  "Ram Navami": "Sri Rama Navami",
  "Krishna Janmashtami": "Krishnashtami",
  "Diwali / Lakshmi Puja": "Deepavali",
};

/** Observances on the same date every year. Month is 1-based. */
const FIXED_DAYS: { month: number; day: number; name: string; note?: string }[] = [
  { month: 1, day: 1, name: "New Year" },
  { month: 1, day: 12, name: "National Youth Day", note: "Swami Vivekananda Jayanti" },
  { month: 1, day: 15, name: "Indian Army Day" },
  { month: 1, day: 26, name: "Republic Day" },
  { month: 2, day: 14, name: "Valentine's Day" },
  { month: 2, day: 28, name: "National Science Day" },
  { month: 3, day: 8, name: "International Women's Day" },
  { month: 4, day: 7, name: "World Health Day" },
  { month: 5, day: 1, name: "Labour Day / May Day" },
  { month: 5, day: 11, name: "National Technology Day" },
  { month: 6, day: 5, name: "World Environment Day" },
  { month: 6, day: 21, name: "International Yoga Day" },
  { month: 7, day: 1, name: "National Doctors' Day" },
  { month: 7, day: 1, name: "Chartered Accountants' Day" },
  { month: 8, day: 15, name: "Independence Day" },
  { month: 8, day: 29, name: "National Sports Day" },
  { month: 9, day: 5, name: "Teachers' Day" },
  { month: 9, day: 15, name: "Engineers' Day", note: "Sir M. Visvesvaraya Jayanti" },
  { month: 9, day: 27, name: "World Tourism Day" },
  { month: 9, day: 29, name: "World Heart Day" },
  { month: 10, day: 2, name: "Gandhi Jayanti" },
  { month: 10, day: 16, name: "World Food Day" },
  { month: 11, day: 14, name: "Children's Day" },
  { month: 12, day: 23, name: "National Farmers' Day" },
  { month: 12, day: 25, name: "Christmas" },
  { month: 12, day: 31, name: "New Year's Eve" },
];

/** Observances on the Nth weekday of a month. `weekday` 0 = Sunday. */
const RELATIVE_DAYS: { month: number; weekday: number; nth: number; name: string }[] = [
  { month: 5, weekday: 0, nth: 2, name: "Mother's Day" },
  { month: 6, weekday: 0, nth: 3, name: "Father's Day" },
  { month: 8, weekday: 0, nth: 1, name: "Friendship Day" },
];

/**
 * Telangana's Bathukamma, dated from the calendar's own Navratri entries rather than typed in: it
 * begins the day before Sharad Navratri (Mahalaya Amavasya) and ends on Durga Ashtami (Saddula).
 */
function bathukammaFor(year: number): PosterOccasion[] {
  const navratri = FESTIVALS.find((f) => f.date.startsWith(`${year}-`) && f.name === "Sharad Navratri begins");
  const ashtami = FESTIVALS.find((f) => f.date.startsWith(`${year}-`) && f.name.startsWith("Durga Ashtami"));
  const out: PosterOccasion[] = [];
  if (navratri) {
    const d = new Date(`${navratri.date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    out.push({ name: "Bathukamma (Engili Pula)", date: isoDate(d), note: "Telangana — begins" });
  }
  if (ashtami) out.push({ name: "Saddula Bathukamma", date: ashtami.date, note: "Telangana" });
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return isoDate(new Date(year, month - 1, 1 + offset + (nth - 1) * 7));
}

/** The display name with its regional alias, when it has one. */
export function withRegionalAlias(name: string): string {
  const alias = REGIONAL_ALIASES[name];
  return alias ? `${name} (${alias})` : name;
}

/** Every dated occasion in one year, sorted by date, one entry per name per day. */
export function posterOccasionCalendar(year: number): PosterOccasion[] {
  const all: PosterOccasion[] = [
    ...FESTIVALS
      .filter((f) => f.date.startsWith(`${year}-`))
      .map((f) => ({ name: withRegionalAlias(f.name), date: f.date, note: f.note })),
    ...bathukammaFor(year),
    ...FIXED_DAYS.map((d) => ({ name: d.name, date: `${year}-${pad(d.month)}-${pad(d.day)}`, note: d.note })),
    ...RELATIVE_DAYS.map((d) => ({ name: d.name, date: nthWeekday(year, d.month, d.weekday, d.nth) })),
  ];

  // The company calendar already lists several fixed days (Republic Day, Christmas…). The first
  // one seen wins, and the calendar comes first, so its note is the one kept.
  const seen = new Set<string>();
  const unique = all.filter((o) => {
    const key = `${o.date}|${o.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // "New Year's Eve" and "New Year" are different days; "Christmas Eve" stays alongside Christmas.
  return unique.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export interface UpcomingOccasion extends PosterOccasion {
  /** Whole days from today: 0 = today, 1 = tomorrow. */
  daysAway: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * What is coming up, soonest first: today through `withinDays` ahead.
 *
 * Spans a year boundary — in December the list carries on into January of the next year.
 */
export function upcomingPosterOccasions(today: Date = new Date(), withinDays = 120): UpcomingOccasion[] {
  const start = startOfDay(today);
  const end = start.getTime() + withinDays * MS_PER_DAY;
  const years = [start.getFullYear(), start.getFullYear() + 1];
  return years
    .flatMap((y) => posterOccasionCalendar(y))
    .map((o) => {
      const at = new Date(`${o.date}T00:00:00`).getTime();
      return { ...o, daysAway: Math.round((at - start.getTime()) / MS_PER_DAY), at };
    })
    .filter((o) => o.at >= start.getTime() && o.at <= end)
    .map(({ at: _at, ...rest }) => rest);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "in 3 days" / "today" / "tomorrow". */
export function daysAwayLabel(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

/** "Engineers' Day — Sep 15 (Tue) · in 4 days" — one option in the picker. */
export function upcomingOccasionLabel(o: UpcomingOccasion): string {
  const d = new Date(`${o.date}T00:00:00`);
  return `${o.name} — ${MONTHS[d.getMonth()]} ${d.getDate()} (${DAYS[d.getDay()]}) · ${daysAwayLabel(o.daysAway)}`;
}
