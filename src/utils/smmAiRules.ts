/**
 * SMM Delivery Control — the AI layer's RULES (2026-10-15, phase 5 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why the AI only writes words ────────────────────────────────────────────────────────────────
 * The owner's plan: "The RULES fix the counts and deadlines; the AI never sets or moves a deadline or a
 * count." The weekly rules (`utils/smmCadence`) decide which piece sits in which week and when each is due.
 * Gemini is asked only for what a person would otherwise type — a title, the idea, a caption and hashtags —
 * and may propose a festival from THAT week's calendar. Everything it says is checked here before anybody
 * sees it:
 *   • only pieces we asked about (an unknown itemId is dropped, a second answer for one piece too);
 *   • trimmed and capped — title 60, idea 200, caption 400 characters, at most 8 hashtags, each with a #;
 *   • no phone number, price, percentage, offer or other number the team never wrote. "Verified facts" are
 *     what the team typed on the month (its pieces' titles and notes) — the same rule as `utils/businessFacts`:
 *     what the member TYPED is ground truth, what a model writes is checked against it. A sentence with an
 *     invented claim is dropped; a title with one is left blank;
 *   • no exact repeat of a title the client had in the last two months (or another piece of this month);
 *   • a festival is kept only when its date is inside that piece's week, the piece has no fixed date of its
 *     own, the day is on the calendar the poster picker uses (`utils/posterOccasions`, which reads
 *     `utils/festivals.FESTIVAL_CALENDAR` — 2026 and 2027), it is not already past, and no other piece took it.
 *
 * ── Why the numbers in a brief are inserted by code ─────────────────────────────────────────────
 * A brief that says "2 late" when 3 are late is worse than no brief: people stop trusting the screen. The
 * model writes the sentences AROUND placeholders ({late}, {tasks}); code fills them in. A number the model
 * typed itself (in digits, or "three tasks") must equal one it was given, or the whole text is thrown away
 * for the plain template (`fillBrief`).
 *
 * ── Why every fallback lives here ───────────────────────────────────────────────────────────────
 * 11 of the 30 Gemini keys were dead on 2026-10-10, and a busy free-tier day refuses calls. Nothing in
 * Delivery Control may wait for the AI: every function has a plain template that reads well with the numbers
 * on its own (`fallbackWeekBrief`, `fallbackMorningBrief`, `fallbackReasonsSummary`, `fallbackClientUpdate`),
 * and the titles fall back to BLANK — left for a person — plus the week's festival when there is one.
 *
 * Pure: no React, no Firestore, no Gemini (that is `services/smmAi.ts`). Written without the `@/` alias like
 * the weekly rules it builds on, so the phase-6 server checker can reuse the templates.
 */
import type { SmmCampaign, SmmContentItem } from "../types/smm";
import type { SmmFixedReason, SmmItemPlan, SmmPlanWeek } from "../types/smmDelivery";
import { addDaysIso, festivalsInWeek, isIsoDay, weekdayOf } from "./smmCadence";
import type { SmmDeliveryMonth, SmmMonthPlan, SmmTaskType } from "./smmCadence";
import { posterOccasionCalendar } from "./posterOccasions";
import type { PosterOccasion } from "./posterOccasions";
import { FESTIVAL_CALENDAR } from "./festivals";
import { digitsOf, findPhoneNumbers, phoneKey } from "./businessFacts";

/* ── What the AI may suggest for one piece ───────────────────────────────────────────────────────── */

export interface SmmFestivalPick {
  name: string;
  /** yyyy-MM-dd */
  date: string;
}

/**
 * One piece's suggestion. `week` is the RULES' week (never the model's). Blank strings mean "left for a
 * person" — the fallback, or a field the checks threw away.
 */
export interface SmmTaskSuggestion {
  itemId: string;
  week: 1 | 2 | 3 | 4 | null;
  title: string;
  idea: string;
  caption: string;
  hashtags: string[];
  festival: { name: string; date: string } | null;
}

/** The caps every suggestion is cut to (and what the prompt asks for). */
export const SMM_AI_LIMITS = {
  title: 60,
  idea: 200,
  caption: 400,
  hashtags: 8,
  hashtagLength: 40,
  /** Past titles passed to the model — the last two months of a Ultra client is about 60. */
  pastTitles: 80,
  /** A brief's text, after the numbers are filled in. */
  brief: 420,
  /** The client update's two AI lines. */
  opening: 220,
  closing: 200,
} as const;

/** How each kind of piece is named on screen and in the messages. */
export const SMM_TASK_TYPE_META: Record<SmmTaskType, { icon: string; label: string; word: string; te: string }> = {
  ai_video: { icon: "🎬", label: "AI video", word: "video", te: "వీడియో" },
  poster: { icon: "🖼", label: "Poster", word: "poster", te: "పోస్టర్" },
  real_video: { icon: "📹", label: "Real video", word: "real video", te: "రియల్ వీడియో" },
  extra: { icon: "⭐", label: "Extra", word: "extra work", te: "అదనపు పని" },
};

/** "snake_case" / "camelCase" → "snake case" / "camel case". */
export function humanize(key: string): string {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The type's icon and words. Takes the rules' type (`ai_video`), the stored kind (`ai_ad`) or anything a
 * caller passes — an unknown type keeps its own words, with no icon.
 */
export function typeMetaOf(type: string | null | undefined): { icon: string; label: string; word: string; te: string } {
  const t = String(type || "").trim();
  const key = (t === "ai_ad" ? "ai_video" : t) as SmmTaskType;
  if (SMM_TASK_TYPE_META[key]) return SMM_TASK_TYPE_META[key];
  const words = humanize(t) || "piece";
  return { icon: "", label: words.charAt(0).toUpperCase() + words.slice(1), word: words, te: words };
}

/* ── Days, as people read them ───────────────────────────────────────────────────────────────────── */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_TE = ["ఆది", "సోమ", "మంగళ", "బుధ", "గురు", "శుక్ర", "శని"];

/** "Sat 24 Oct" — of the date itself, whatever the device's time zone. "" for anything that is not a day. */
export function dayLabel(day: string | null | undefined): string {
  if (!isIsoDay(day)) return "";
  return `${DAYS[weekdayOf(day)]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** "24 Oct (శని)" — the Telugu message's day. */
export function dayLabelTe(day: string | null | undefined): string {
  if (!isIsoDay(day)) return "";
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} (${DAYS_TE[weekdayOf(day)]})`;
}

/** The Monday of the calendar week `day` falls in (a Sunday belongs to the week that started the Monday before). */
export function mondayOf(day: string): string {
  const wd = weekdayOf(day);
  return addDaysIso(day, wd === 0 ? -6 : 1 - wd);
}

/* ── Text hygiene ────────────────────────────────────────────────────────────────────────────────── */

// Control characters (keeping tab and newline). Braced escapes with the `u` flag (CLAUDE.md §28) — matching
// them is the point, so the lint rule against control characters in a regex does not apply.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u{0}-\u{8}\u{B}\u{C}\u{E}-\u{1F}\u{7F}]/gu;

/**
 * A model's string made presentable: markdown marks, control characters and wrapping quotes removed,
 * spaces collapsed. `multiline` keeps line breaks (a caption), else everything is one line.
 */
export function tidyText(value: unknown, opts: { multiline?: boolean } = {}): string {
  let s = typeof value === "string" ? value : value == null ? "" : String(value);
  s = s.replace(CONTROL, "").replace(/\r\n?/g, "\n").replace(/\*\*|__|`/g, "");
  s = opts.multiline
    ? s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n")
    : s.replace(/\s+/g, " ");
  s = s.trim();
  // "\"Diwali sparkle\"" → Diwali sparkle — a whole value wrapped in quotes.
  const wrapped = /^["'“‘](.*)["'”’]$/su.exec(s);
  if (wrapped && !/["“”]/u.test(wrapped[1])) s = wrapped[1].trim();
  return s;
}

/**
 * Cut to `max` characters at a sentence end when one is close, else at a word — never mid-word, never a
 * dangling comma or dash. No "…": a title or caption cut short must still read as written.
 */
export function capText(text: string, max: number): string {
  const s = (text || "").trim();
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("।"), head.lastIndexOf("\n"));
  let cut = sentenceEnd >= max * 0.6 ? s.slice(0, sentenceEnd + 1) : "";
  if (!cut) {
    const space = head.lastIndexOf(" ");
    cut = space > max * 0.4 ? s.slice(0, space) : s.slice(0, max);
  }
  return cut.replace(/[\s,;:–—-]+$/u, "").trim();
}

/** How two titles are compared: case, punctuation and spacing ignored ("Diwali Sparkle!" = "diwali sparkle"). */
export function titleKey(title: string | null | undefined): string {
  return String(title || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

/* ── Verified facts ──────────────────────────────────────────────────────────────────────────────── */

/** What the team typed on the month — the only source a number, price or offer may come from. */
export interface SmmVerifiedFacts {
  text: string;
  /** Phone keys (`businessFacts.phoneKey`) of the numbers in the text. */
  phones: string[];
  /** Every digit run in the text, commas removed ("1,499" → "1499"). */
  numbers: string[];
}

const DIGIT_RUN = /\d[\d,]*(?:\.\d+)?/g;
const numberRuns = (text: string): string[] => [...String(text || "").matchAll(DIGIT_RUN)].map((m) => m[0].replace(/,/g, "").replace(/\.0+$/, ""));

/** Facts from any text the team wrote (titles, notes, a brief). */
export function factsFromText(text: string): SmmVerifiedFacts {
  const t = String(text || "");
  return {
    text: t,
    phones: [...new Set(findPhoneNumbers(t).map((p) => p.key))],
    numbers: [...new Set(numberRuns(t))],
  };
}

/** The month's facts: every piece's title and notes, as the team typed them. */
export function factsOfMonth(month: Pick<SmmCampaign, "items">): SmmVerifiedFacts {
  const items = Array.isArray(month?.items) ? month.items : [];
  return factsFromText(items.map((i) => [i.title, i.notes].filter(Boolean).join(" — ")).filter(Boolean).join("\n"));
}

/**
 * Words that make an offer. Each is allowed only when the team's own text uses it too ("Diwali offer" in the
 * notes lets the caption say "offer" — never a number the notes do not have).
 */
const OFFER_WORDS: { re: RegExp; word: string }[] = [
  { re: /\bdiscounts?\b/i, word: "discount" },
  { re: /\boffers?\b/i, word: "offer" },
  { re: /\bcash\s?back\b/i, word: "cashback" },
  { re: /\bcoupons?\b/i, word: "coupon" },
  { re: /\bfree\b/i, word: "free" },
  { re: /\bsale\b/i, word: "sale" },
  { re: /\bdeals?\b/i, word: "deal" },
  { re: /\bcombo\b/i, word: "combo" },
  { re: /\bbuy\s+\w+\s+get\b|\bbogo\b/i, word: "buy … get" },
  { re: /\b(?:flat|up\s?to)\s+(?:₹|rs\.?\s*)?\d/i, word: "flat / up to" },
  { re: /\bemi\b/i, word: "EMI" },
  { re: /\b(?:lowest|best|cheapest)\s+prices?\b/i, word: "price claim" },
  { re: /ఆఫర్/u, word: "ఆఫర్" },
  { re: /డిస్కౌంట్/u, word: "డిస్కౌంట్" },
  { re: /తగ్గింపు/u, word: "తగ్గింపు" },
  { re: /ఉచిత/u, word: "ఉచిత" },
];

/**
 * Towns, cities and states a model likes to add ("#HyderabadJewellery") — the business's place is not known
 * to the AI unless the team wrote it, so a place name is a claim like any other (live run, 2026-10-15: three
 * of eight answers tagged Hyderabad for a client whose town nobody had given).
 */
const PLACES = "hyderabad|secunderabad|vijayawada|visakhapatnam|vizag|kakinada|rajahmundry|rajamahendravaram|guntur|nellore|tirupati|kurnool|kadapa|anantapur|ongole|eluru|bhimavaram|machilipatnam|srikakulam|vizianagaram|chittoor|amaravati|warangal|karimnagar|khammam|nizamabad|nalgonda|mahbubnagar|andhra|telangana|chennai|bengaluru|bangalore|mumbai|delhi|kolkata|pune";
const PLACE_WORDS = new RegExp(String.raw`\b(${PLACES})\b`, "gi");
/** The same names inside a run-together hashtag ("#hyderabadjewellery"). */
const PLACE_IN_TAG = new RegExp(`(${PLACES})`, "i");

/** The strongest offer words, matched inside a run-together hashtag. */
const OFFER_IN_TAG = /offer|discount|cashback|coupon/i;

const PRICE = /(?:₹|\brs\.?|\binr\b|\brupees?\b)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:\/-|₹|\brs\b\.?|\brupees?\b)/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s*(?:%|\bper\s?cent\b)/gi;

/**
 * What in `text` is not backed by the facts, in words — [] when it is clean. `allowNumbers` are numbers the
 * context gives anyway (the week, the festival's day, a video's length, the year); they never excuse a price,
 * a percentage or a phone number.
 */
export function unverifiedClaims(text: string, facts: SmmVerifiedFacts, allowNumbers: Iterable<string | number> = []): string[] {
  const t = String(text || "");
  if (!t) return [];
  const problems: string[] = [];
  const factText = facts.text || "";
  const factNumbers = new Set(facts.numbers);
  for (const p of findPhoneNumbers(t)) if (!facts.phones.includes(p.key)) problems.push(`phone number ${p.display}`);
  const priced = new Set<string>();
  for (const m of t.matchAll(PRICE)) {
    const n = (m[1] || m[2] || "").replace(/,/g, "");
    priced.add(n);
    if (!factNumbers.has(n)) problems.push(`price ${m[0].trim()}`);
  }
  for (const m of t.matchAll(PERCENT)) {
    priced.add(m[1]);
    if (!factNumbers.has(m[1])) problems.push(`percentage ${m[0].trim()}`);
  }
  for (const { re, word } of OFFER_WORDS) if (re.test(t) && !re.test(factText)) problems.push(`offer word "${word}"`);
  const factLower = factText.toLowerCase();
  for (const m of t.matchAll(PLACE_WORDS)) if (!factLower.includes(m[1].toLowerCase())) problems.push(`place name ${m[1]}`);
  const allowed = new Set([...factNumbers, ...[...allowNumbers].map((n) => String(n))]);
  const phoneDigits = findPhoneNumbers(t).map((p) => p.key);
  for (const n of numberRuns(t)) {
    if (priced.has(n) || allowed.has(n)) continue;
    if (phoneDigits.some((k) => k === phoneKey(digitsOf(n)))) continue; // already reported as a phone number
    if (/^\d$/.test(n) || n === "10") continue; // "3 ways", "a 10-second hook": small counts are not claims
    problems.push(`number ${n}`);
  }
  return [...new Set(problems)];
}

/**
 * The sentences of `text` that make no unverified claim, in order; the others are dropped (and named in
 * `dropped`). Line breaks are kept.
 */
export function keepVerifiedSentences(text: string, facts: SmmVerifiedFacts, allowNumbers: Iterable<string | number> = []): { text: string; dropped: string[] } {
  const allow = [...allowNumbers];
  const dropped: string[] = [];
  const lines = String(text || "").split("\n").map((line) => {
    const sentences = line.split(/(?<=[.!?।])\s+/u).filter((s) => s.trim());
    const kept = sentences.filter((s) => {
      const bad = unverifiedClaims(s, facts, allow);
      if (bad.length) dropped.push(...bad);
      return !bad.length;
    });
    return kept.join(" ");
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), dropped: [...new Set(dropped)] };
}

/**
 * Hashtags from whatever the model sent (a list, or one string), each "#word" with no spaces, letters (any
 * script), digits and _ only, never only digits, at most `SMM_AI_LIMITS.hashtagLength` long, each once, at
 * most eight.
 */
export function normalizeHashtags(input: unknown): string[] {
  // One list entry is one hashtag ("#temple jewellery" → #templejewellery) unless it holds several "#"s; a
  // string is split at spaces and commas.
  const raw: string[] = Array.isArray(input)
    ? input.filter((x): x is string => typeof x === "string")
      .flatMap((x) => ((x.match(/#/g) || []).length > 1 ? x.split(/[\s,]+/) : [x.replace(/[\s,]+/g, "")]))
    : typeof input === "string" ? input.split(/[\s,]+/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const body = r.replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
    if (!body || /^\d+$/.test(body) || body.length + 1 > SMM_AI_LIMITS.hashtagLength) continue;
    const key = body.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${body}`);
    if (out.length === SMM_AI_LIMITS.hashtags) break;
  }
  return out;
}

/** Hashtags written inside a caption, taken out (they have their own list) — "… today! #Diwali #Gold" → "… today!". */
export function splitCaptionHashtags(caption: string): { caption: string; hashtags: string[] } {
  const tags = [...String(caption || "").matchAll(/(^|\s)#([\p{L}\p{M}\p{N}_]+)/gu)].map((m) => `#${m[2]}`);
  const rest = String(caption || "").replace(/(^|\s)#[\p{L}\p{M}\p{N}_]+/gu, "$1").replace(/[ \t]{2,}/g, " ")
    .split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { caption: rest, hashtags: tags };
}

/* ── Which pieces get a suggestion ───────────────────────────────────────────────────────────────── */

/** One piece as the title prompt and its checks see it. */
export interface SmmTitleTask {
  itemId: string;
  type: SmmTaskType;
  week: SmmPlanWeek | null;
  weekStart: string | null;
  weekEnd: string | null;
  deadlineDay: string | null;
  fixed: SmmFixedReason | null;
  /** The team's own date, else the plan's suggestion. */
  postDay: string | null;
  /** The team gave the piece its date — a festival is not moved onto it by the fallback. */
  teamDated: boolean;
  /** What the board shows today (the piece's title, else an accepted plan title). */
  currentTitle: string;
  /** A title a PERSON typed on the piece — never overwritten unless they tick it. */
  personTitle: boolean;
  notes: string;
  /** An AI video's clips (8 s each) — the idea's length. */
  clips: number | null;
  /** The festivals the piece may be themed for: its own week's, not past, none for a fixed piece. */
  festivals: SmmFestivalPick[];
}

const calendarCache = new Map<number, PosterOccasion[]>();
const calendarOf = (year: number): PosterOccasion[] => {
  let c = calendarCache.get(year);
  if (!c) {
    c = posterOccasionCalendar(year);
    calendarCache.set(year, c);
  }
  return c;
};

/**
 * The dated occasions inside a week (`smmCadence.festivalsInWeek` over the poster calendar of every year the
 * week touches), from `notBefore` on — a festival already past, or before a first month's first post day,
 * cannot be posted for. A regional day from elsewhere and an eve are not offered (`festivalRank` …
 * `ELSEWHERE`): the clients are in Andhra Pradesh and Telangana, and in the live run (2026-10-15) the AI themed
 * a jeweller's poster for Karva Chauth because it was on the list.
 */
export function festivalCandidates(week: { start: string; end: string }, notBefore: string | null = null): SmmFestivalPick[] {
  if (!isIsoDay(week?.start) || !isIsoDay(week?.end)) return [];
  const years = [...new Set([Number(week.start.slice(0, 4)), Number(week.end.slice(0, 4))])];
  const all = years.flatMap((y) => calendarOf(y));
  const seen = new Set<string>();
  return festivalsInWeek(week, all)
    .filter((o) => !notBefore || o.date >= notBefore)
    .filter((o) => !isElsewhere(o.name))
    .filter((o) => {
      const k = `${o.date}|${titleKey(o.name)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((o) => ({ name: o.name, date: o.date }));
}

const TYPE_ORDER: Record<SmmTaskType, number> = { ai_video: 0, poster: 1, real_video: 2, extra: 3 };

/**
 * The pieces a "Suggest titles" asks about: every piece the plan counts (and extra work) that is not live
 * yet — of those, exactly `itemIds` when given (the next week's list at a week start). A row beyond the
 * promise (uncounted) and a piece moved out of the month (`plan.movedOut`) are never asked about. Ordered
 * by week, then type, then due day.
 */
export function titleTasksOf(
  month: Pick<SmmDeliveryMonth, "items" | "clipsPerVideo">,
  plan: Pick<SmmMonthPlan, "tasks" | "weeks" | "firstPostDay"> & { movedOut?: readonly string[] | null },
  opts: { today: string; itemIds?: readonly string[] | null },
): SmmTitleTask[] {
  const items = new Map((Array.isArray(month?.items) ? month.items : []).map((i) => [i.id, i]));
  const want = opts.itemIds ? new Set(opts.itemIds) : null;
  const movedOut = new Set(Array.isArray(plan?.movedOut) ? plan.movedOut : []);
  const notBefore = [opts.today, plan.firstPostDay].filter(isIsoDay).sort().pop() || null;
  const clipsRaw = Math.floor(Number(month?.clipsPerVideo));
  const monthClips = Number.isFinite(clipsRaw) && clipsRaw >= 1 ? Math.min(15, clipsRaw) : 4;
  const out: SmmTitleTask[] = [];
  for (const t of Array.isArray(plan?.tasks) ? plan.tasks : []) {
    const item = items.get(t.itemId);
    if (!item || item.status === "posted" || movedOut.has(t.itemId)) continue;
    if (!(t.counted || t.extra) || (want && !want.has(t.itemId))) continue;
    const week = t.week ? plan.weeks.find((w) => w.week === t.week) || null : null;
    const personTitle = !!(item.title || "").trim();
    out.push({
      itemId: t.itemId, type: t.type, week: t.week, weekStart: week?.start || null, weekEnd: week?.end || null,
      deadlineDay: t.deadlineDay, fixed: t.fixed, postDay: t.postDay || t.suggestedDate || null, teamDated: t.source === "date",
      currentTitle: (t.title || "").trim(), personTitle, notes: tidyText(item.notes || ""),
      clips: t.type === "ai_video" ? monthClips : null,
      festivals: week && !t.fixed ? festivalCandidates(week, notBefore) : [],
    });
  }
  return out.sort((a, b) => (a.week ?? 9) - (b.week ?? 9) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    || (a.deadlineDay || "9").localeCompare(b.deadlineDay || "9"));
}

type TitledItem = Pick<SmmContentItem, "title"> & { plan?: Pick<SmmItemPlan, "title"> | null };
const titlesOf = (items: readonly TitledItem[] | null | undefined): string[] =>
  (Array.isArray(items) ? items : []).flatMap((i) => [i.title, i.plan?.title]).map((t) => (t || "").trim()).filter(Boolean);

/**
 * The titles the client had in the `count` months before this one (by start date; this month itself and
 * removed / deleted months left out), each once — so ideas don't repeat (the owner's guardrail).
 */
export function pastTitlesOf(
  months: readonly (Pick<SmmCampaign, "id" | "cycle" | "status"> & { items?: readonly TitledItem[] | null })[],
  current: Pick<SmmCampaign, "id" | "cycle">,
  count = 2,
): string[] {
  const start = current?.cycle?.startDate || "";
  const before = (Array.isArray(months) ? months : [])
    .filter((m) => m && m.id !== current?.id && m.status !== "removed" && m.status !== "deleted")
    .filter((m) => (m.cycle?.startDate || "") < start || !start)
    .sort((a, b) => (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || ""))
    .slice(0, count);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of before.flatMap((m) => titlesOf(m.items))) {
    const k = titleKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, SMM_AI_LIMITS.pastTitles);
}

/** This month's own titles on pieces NOT being asked about — a suggestion must not repeat them either. */
export function monthTitlesToAvoid(month: Pick<SmmCampaign, "items">, askedIds: readonly string[]): string[] {
  const asked = new Set(askedIds);
  return titlesOf((Array.isArray(month?.items) ? month.items : []).filter((i) => !asked.has(i.id)) as TitledItem[]);
}

/* ── Festivals ───────────────────────────────────────────────────────────────────────────────────── */

const GENERIC_WORDS = new Set(["day", "days", "festival", "puja", "pooja", "jayanti", "national", "international", "world", "begins", "eve", "the"]);
const occasionWords = (s: string) => titleKey(s).split(" ").filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));

/** "Deepavali" names "Diwali / Lakshmi Puja (Deepavali)"; "Dasara" names "Dussehra / Vijayadashami (Dasara)". */
export function sameOccasion(a: string, b: string): boolean {
  const ka = titleKey(a).replace(/\s+/g, "");
  const kb = titleKey(b).replace(/\s+/g, "");
  if (!ka || !kb) return false;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const wb = new Set(occasionWords(b));
  return occasionWords(a).some((w) => wb.has(w));
}

/**
 * The festival a suggestion may carry for this piece, or null: the piece has no fixed date, the date is
 * inside its week and on its candidate list under a matching name (the calendar's own spelling is kept), and
 * no other piece took that day (`taken`, updated here).
 */
export function checkFestival(task: Pick<SmmTitleTask, "fixed" | "weekStart" | "weekEnd" | "festivals">, raw: unknown, taken: Set<string>): SmmFestivalPick | null {
  if (!raw || task.fixed || !task.weekStart || !task.weekEnd) return null;
  let name = "";
  let date = "";
  if (typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    name = tidyText(r.name);
    date = tidyText(r.date);
  } else if (typeof raw === "string") {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(raw);
    date = m ? m[1] : "";
    name = tidyText(raw.replace(/\(?\d{4}-\d{2}-\d{2}\)?/, ""));
  }
  if (!isIsoDay(date) || date < task.weekStart || date > task.weekEnd || taken.has(date)) return null;
  const match = task.festivals.find((f) => f.date === date && (!name || sameOccasion(name, f.name)));
  if (!match || !name) return null;
  taken.add(date);
  return { name: match.name, date: match.date };
}

// The occasions the team's clients post for most (Andhra Pradesh / Telangana) — the ONLY ones the plain
// fallback places. The AI may still choose any other day on the list (Durga Ashtami, Engineers' Day for a
// college) when it fits the business; the fallback cannot judge fit, so it stays with these.
const MAJOR = /sankranthi|sankranti|ugadi|rama navami|ram navami|vinayaka|ganesh chaturthi|dasara|dussehra|deepavali|diwali|krishnashtami|janmashtami|shivaratri|\bholi\b|raksha bandhan|christmas|new year|independence day|republic day|gandhi jayanti|women's day|\beid\b|bakrid|good friday|easter|hanuman jayanti|akshaya tritiya|karthika/i;
// Regional days from outside the Telugu states (Pongal is the same day as Sankranthi), Holika Dahan (Holi is
// the post), Muharram (a day of mourning, not a greeting).
const ELSEWHERE = /lohri|uttarayan|bihu|vishu|onam|chhath|karva chauth|hornbill|gudi padwa|baisakhi|vaisakhi|rath yatra|kabirdas|maharana pratap|parsi|karthigai|holika|govardhan|bhai dooj|muharram|pongal/i;
const CALENDAR_CATS = new Set(["Hindu", "National", "Christian", "Islamic", "Sikh", "Buddhist", "Jain"]);

/** A regional day from elsewhere (Karva Chauth, Lohri, Onam …) or an eve — never offered to the AI or placed. */
export const isElsewhere = (name: string): boolean => /\beve\b/i.test(name) || ELSEWHERE.test(name);

/**
 * 0 = a major occasion here (the only rank the plain fallback places), 1 = another day on the company's
 * festival calendar, 2 = an observance day, or a regional day from elsewhere / an eve (those two are not even
 * offered to the AI — `isElsewhere`).
 */
export function festivalRank(f: { name: string; date?: string | null }): 0 | 1 | 2 {
  const name = String(f?.name || "");
  if (isElsewhere(name)) return 2;
  if (MAJOR.test(name)) return 0;
  const lower = name.toLowerCase();
  const onCalendar = FESTIVAL_CALENDAR.find((x) => x.date === f?.date && lower.startsWith(x.name.toLowerCase()));
  return onCalendar && CALENDAR_CATS.has(onCalendar.cat) ? 1 : 2;
}

/* ── Reading the model's titles ──────────────────────────────────────────────────────────────────── */

/** The JSON in a model's answer: as it is, inside a ``` fence, or between the first bracket and the last. */
export function extractJson(text: unknown): unknown {
  if (text && typeof text === "object") return text;
  const s = String(text ?? "").trim();
  if (!s) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const candidates = [fenced?.[1], s];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch { /* try the brackets */ }
    const open = c.search(/[[{]/);
    const close = Math.max(c.lastIndexOf("}"), c.lastIndexOf("]"));
    if (open >= 0 && close > open) {
      try {
        return JSON.parse(c.slice(open, close + 1));
      } catch { /* next */ }
    }
  }
  return null;
}

/** Numbers a piece's text may carry: the week, the year(s), its festivals' day and year, a video's clips and seconds. */
export function contextNumbers(task: Pick<SmmTitleTask, "week" | "festivals" | "clips" | "weekStart">, today: string): string[] {
  const out = new Set<string>();
  const y = Number((isIsoDay(today) ? today : task.weekStart || "2026").slice(0, 4));
  [y, y + 1].forEach((n) => out.add(String(n)));
  if (task.week) out.add(String(task.week));
  for (const f of task.festivals) {
    out.add(String(Number(f.date.slice(8, 10))));
    out.add(f.date.slice(0, 4));
  }
  if (task.clips) {
    out.add(String(task.clips));
    out.add(String(task.clips * 8));
  }
  return [...out];
}

export interface SmmSuggestionContext {
  tasks: readonly SmmTitleTask[];
  /** Titles to avoid: the last two months', and this month's other pieces'. */
  pastTitles: readonly string[];
  facts: SmmVerifiedFacts;
  today: string;
}

/**
 * The model's answer, checked (see the header): one suggestion per asked piece at most, in the order given;
 * an answer that is blank after the checks is no answer (the fallback fills it). `dropped` names what was
 * thrown away — for the console and the tests, never shown as an error.
 */
export function parseTaskSuggestions(reply: unknown, ctx: SmmSuggestionContext): { suggestions: SmmTaskSuggestion[]; dropped: string[] } {
  const json = extractJson(reply);
  const list: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object"
      ? (["tasks", "suggestions", "items", "pieces"].map((k) => (json as Record<string, unknown>)[k]).find(Array.isArray) as unknown[]) || []
      : [];
  const asked = new Map(ctx.tasks.map((t) => [t.itemId, t]));
  const avoid = new Set(ctx.pastTitles.map(titleKey).filter(Boolean));
  const usedTitles = new Set<string>();
  const takenFestivals = new Set<string>();
  const seen = new Set<string>();
  const dropped: string[] = [];
  const suggestions: SmmTaskSuggestion[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const itemId = typeof e.itemId === "string" ? e.itemId.trim() : typeof e.id === "string" ? e.id.trim() : "";
    const task = asked.get(itemId);
    if (!task) {
      dropped.push(`an answer for a piece not asked about (${itemId || "no id"})`);
      continue;
    }
    if (seen.has(itemId)) {
      dropped.push(`a second answer for ${itemId}`);
      continue;
    }
    seen.add(itemId);
    const allow = contextNumbers(task, ctx.today);

    let title = capText(tidyText(e.title).replace(/^#+\s*/, "").replace(/[.。]+$/u, ""), SMM_AI_LIMITS.title);
    const titleProblems = unverifiedClaims(title, ctx.facts, allow);
    if (titleProblems.length) {
      dropped.push(`${itemId} title: ${titleProblems.join(", ")}`);
      title = "";
    }
    const key = titleKey(title);
    if (key && (avoid.has(key) || usedTitles.has(key))) {
      dropped.push(`${itemId} title repeats "${title}"`);
      title = "";
    }
    if (titleKey(title)) usedTitles.add(titleKey(title));

    const idea = keepVerifiedSentences(tidyText(e.idea), ctx.facts, allow);
    if (idea.dropped.length) dropped.push(`${itemId} idea: ${idea.dropped.join(", ")}`);

    const split = splitCaptionHashtags(tidyText(e.caption, { multiline: true }));
    const caption = keepVerifiedSentences(split.caption, ctx.facts, allow);
    if (caption.dropped.length) dropped.push(`${itemId} caption: ${caption.dropped.join(", ")}`);

    const hashtags = normalizeHashtags([...normalizeHashtags(e.hashtags), ...split.hashtags])
      .filter((h) => {
        // "#DiwaliOffer" is read as "Diwali Offer"; "#diwalioffer" is caught by the substring test.
        const words = h.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
        const bad = unverifiedClaims(words, ctx.facts, allow);
        if (OFFER_IN_TAG.test(h) && !OFFER_IN_TAG.test(ctx.facts.text)) bad.push("an offer");
        const place = PLACE_IN_TAG.exec(h)?.[1];
        if (place && !ctx.facts.text.toLowerCase().includes(place.toLowerCase())) bad.push(`place name ${place}`);
        if (bad.length) dropped.push(`${itemId} hashtag ${h}: ${bad.join(", ")}`);
        return !bad.length;
      });

    const festival = checkFestival(task, e.festival, takenFestivals);
    if (e.festival && !festival) dropped.push(`${itemId} festival not in its week / not on the calendar`);

    const s: SmmTaskSuggestion = {
      itemId, week: task.week, title, idea: capText(idea.text, SMM_AI_LIMITS.idea), caption: capText(caption.text, SMM_AI_LIMITS.caption),
      hashtags, festival,
    };
    if (!s.title && !s.idea && !s.caption && !s.hashtags.length && !s.festival) {
      dropped.push(`${itemId}: nothing usable`);
      continue;
    }
    suggestions.push(s);
  }
  // In the order the pieces were asked.
  const order = new Map(ctx.tasks.map((t, i) => [t.itemId, i]));
  suggestions.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));
  return { suggestions, dropped };
}

/* ── The fallback for titles ─────────────────────────────────────────────────────────────────────── */

const FESTIVAL_TYPE_PREFERENCE: Record<SmmTaskType, number> = { poster: 0, ai_video: 1, real_video: 2, extra: 9 };

/**
 * When the AI could not answer: every title left BLANK for a person, and — the one thing the rules can do
 * alone — the week's main festival placed on one piece of that week (a poster first, then a video; never a
 * fixed piece or one the team dated; one festival per week, each day once; only a major occasion here,
 * `festivalRank` 0 — fit for a particular trade is the AI's or a person's call). `taken` holds festival days
 * already used (by the AI's answers).
 */
export function fallbackTaskSuggestions(tasks: readonly SmmTitleTask[], taken: Set<string> = new Set()): SmmTaskSuggestion[] {
  const out = tasks.map((t): SmmTaskSuggestion => ({ itemId: t.itemId, week: t.week, title: "", idea: "", caption: "", hashtags: [], festival: null }));
  const byWeek = new Map<string, number[]>();
  tasks.forEach((t, i) => {
    if (!t.weekStart) return;
    const list = byWeek.get(t.weekStart) || [];
    list.push(i);
    byWeek.set(t.weekStart, list);
  });
  for (const indexes of byWeek.values()) {
    const first = tasks[indexes[0]];
    const festival = [...first.festivals]
      .filter((f) => festivalRank(f) === 0 && !taken.has(f.date))
      .sort((a, b) => festivalRank(a) - festivalRank(b) || a.date.localeCompare(b.date))[0];
    if (!festival) continue;
    const pick = indexes
      .filter((i) => !tasks[i].fixed && !tasks[i].teamDated && tasks[i].type !== "extra" && tasks[i].festivals.some((f) => f.date === festival.date))
      .sort((a, b) => FESTIVAL_TYPE_PREFERENCE[tasks[a].type] - FESTIVAL_TYPE_PREFERENCE[tasks[b].type]
        || Number(tasks[a].personTitle) - Number(tasks[b].personTitle))[0];
    if (pick == null) continue;
    out[pick].festival = { name: festival.name, date: festival.date };
    taken.add(festival.date);
  }
  return out;
}

/**
 * Every asked piece gets one suggestion: the AI's when it answered, else the fallback's. The fallback never
 * places a festival in a week where the AI placed one, nor on a day it used; a title two separate answers
 * share is kept once.
 */
export function mergeSuggestions(tasks: readonly SmmTitleTask[], ai: readonly SmmTaskSuggestion[]): { suggestions: SmmTaskSuggestion[]; answered: number } {
  const byId = new Map(ai.map((s) => [s.itemId, s]));
  const taken = new Set(ai.map((s) => s.festival?.date).filter((d): d is string => !!d));
  const aiWeeks = new Set(ai.filter((s) => s.festival).map((s) => tasks.find((t) => t.itemId === s.itemId)?.weekStart).filter(Boolean));
  const missing = tasks.filter((t) => !byId.has(t.itemId));
  const fallback = new Map(fallbackTaskSuggestions(missing.filter((t) => !aiWeeks.has(t.weekStart)), taken).map((s) => [s.itemId, s]));
  const usedTitles = new Set<string>();
  let answered = 0;
  const suggestions = tasks.map((t) => {
    const a = byId.get(t.itemId);
    if (a) answered += 1;
    const s = a ? { ...a } : fallback.get(t.itemId) || { itemId: t.itemId, week: t.week, title: "", idea: "", caption: "", hashtags: [], festival: null };
    const k = titleKey(s.title);
    if (k && usedTitles.has(k)) s.title = "";
    else if (k) usedTitles.add(k);
    return s;
  });
  return { suggestions, answered };
}

/** A person's edited row, made safe to save: trimmed and capped (a person's words are not fact-checked). */
export function cleanAcceptedEntry(e: { itemId: string; title: string; idea: string; caption: string; hashtags: unknown; festival: SmmFestivalPick | null }) {
  return {
    itemId: e.itemId,
    title: capText(tidyText(e.title), SMM_AI_LIMITS.title),
    idea: capText(tidyText(e.idea), SMM_AI_LIMITS.idea),
    caption: capText(tidyText(e.caption, { multiline: true }), SMM_AI_LIMITS.caption),
    hashtags: normalizeHashtags(e.hashtags),
    festival: e.festival && isIsoDay(e.festival.date) && tidyText(e.festival.name) ? { name: tidyText(e.festival.name), date: e.festival.date } : null,
  };
}

/* ── Numbers in briefs: placeholders filled by code ──────────────────────────────────────────────── */

const PLACEHOLDER = /\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/g;
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const COUNTED_WORD = new RegExp(String.raw`\b(${Object.keys(NUMBER_WORDS).join("|")})\s+(?:[a-z]+\s+)?(tasks?|pieces?|videos?|posters?|clients?|days?|approvals?|items?|posts?|reels?|delays?|reasons?|late|due|people|members?|extras?|reports?)\b`, "gi");

/** Every number in the material a prompt was given (dates like "Sat 24 Oct", "7 PM") — the model may copy them. */
export function numbersInMaterial(texts: Iterable<string | null | undefined>): number[] {
  const out = new Set<number>();
  for (const t of texts) for (const m of String(t || "").matchAll(/\d+/g)) out.add(Number(m[0]));
  return [...out];
}

/**
 * The model's brief with its placeholders filled. Null (with the reason) when it used a placeholder it was
 * not given, wrote a number that is not one it was given (in digits, or "three tasks"), left a brace, used no
 * placeholder at all while there were numbers to say (`requireAny`), or is empty.
 */
export function fillBrief(
  raw: unknown,
  values: Record<string, number>,
  opts: { allowNumbers?: Iterable<number>; requireAny?: boolean; max?: number; mustMention?: string | null } = {},
): { text: string | null; problem: string | null } {
  const s = tidyText(raw);
  if (!s) return { text: null, problem: "empty" };
  const used = [...s.matchAll(PLACEHOLDER)].map((m) => m[1]);
  const unknown = used.filter((k) => !(k in values));
  if (unknown.length) return { text: null, problem: `unknown placeholder {${unknown[0]}}` };
  if (opts.requireAny && !used.length && Object.values(values).some((v) => v > 0)) return { text: null, problem: "no placeholder used" };
  const allowed = new Set<number>([...Object.values(values), ...(opts.allowNumbers ? [...opts.allowNumbers] : [])]);
  const bare = s.replace(PLACEHOLDER, " ");
  for (const m of bare.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!allowed.has(Number(m[0]))) return { text: null, problem: `a number it was not given (${m[0]})` };
  }
  for (const m of bare.matchAll(COUNTED_WORD)) {
    const n = NUMBER_WORDS[m[1].toLowerCase()];
    if (!allowed.has(n)) return { text: null, problem: `a number it was not given ("${m[0]}")` };
  }
  const filled = s.replace(PLACEHOLDER, (_, k: string) => String(values[k]));
  if (/[{}]/.test(filled)) return { text: null, problem: "a broken placeholder" };
  if (opts.mustMention && titleKey(opts.mustMention)) {
    // The brief must start where the rules start: it names the first task's client (all of it, or one of
    // its words — "Lakshmi" for "Lakshmi Jewellers").
    const k = titleKey(filled);
    const want = titleKey(opts.mustMention);
    const words = want.split(" ").filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
    if (!k.includes(want) && !words.some((w) => k.includes(w))) return { text: null, problem: `it does not name ${opts.mustMention}` };
  }
  return { text: capText(filled, opts.max ?? SMM_AI_LIMITS.brief), problem: null };
}

/* ── The member's week brief ─────────────────────────────────────────────────────────────────────── */

export interface SmmBriefTask {
  clientName: string;
  type: string;
  title: string;
  deadlineDay: string | null;
  /** `smmCadence.SmmTaskState` (done / late / due_today / checkpoint_missed / on_track / not_due / pending_client …). */
  state: string;
  /** What is next (make / send / approve / post / footage …). */
  nextStep?: string | null;
  /** By when (the next checkpoint's day). */
  nextDay?: string | null;
}

export interface MemberWeekBriefInput {
  uid: string;
  name: string;
  /** yyyy-MM-dd, India time. */
  today: string;
  tasks: SmmBriefTask[];
}

export interface MorningBriefInput {
  uid: string;
  name: string;
  role: string;
  today: string;
  /** The page's counts, by key (late, dueToday, dueThisWeek, waitingOnClient, needsYou, approvalsWaiting …). */
  numbers: Record<string, number>;
  /** The most urgent items, already worded ("Lakshmi Jewellers · AI video · late"). */
  top?: string[];
}

export interface SmmReasonEntry {
  clientName: string;
  type: string;
  /** The checkpoint that was missed — footage / send / approved / live (or make / approve / post). */
  step: string;
  reason: string;
  note?: string | null;
  byName: string;
}

export interface ReasonsSummaryInput {
  label: string;
  reasons: SmmReasonEntry[];
}

export interface ClientWeeklyUpdateInput {
  clientName: string;
  week: number;
  language?: "en" | "te";
  live: { title: string; type: string; links: string[] }[];
  coming: { title: string; type: string; day: string | null }[];
  waitingOnClient: { title: string; type: string; since: string | null }[];
}

const STATE_RANK: Record<string, number> = {
  late: 0, due_today: 1, checkpoint_missed: 2, on_track: 3, not_due: 4, pending_client: 5, unscheduled: 6, uncounted: 7, done: 9,
};
const rankOf = (state: string) => STATE_RANK[state] ?? 5;

/** The tasks still to do, most urgent first: late, due today, behind a checkpoint, then by the next day. */
export function orderBriefTasks(tasks: readonly SmmBriefTask[]): SmmBriefTask[] {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((t) => t && t.state !== "done" && t.state !== "uncounted")
    .slice()
    .sort((a, b) => rankOf(a.state) - rankOf(b.state)
      || (a.nextDay || a.deadlineDay || "9").localeCompare(b.nextDay || b.deadlineDay || "9")
      || (a.clientName || "").localeCompare(b.clientName || ""));
}

/** The counts a week brief says — what the placeholders are filled with. */
export function weekBriefNumbers(input: Pick<MemberWeekBriefInput, "tasks">): Record<"tasks" | "clients" | "late" | "dueToday" | "waiting" | "done", number> {
  const all = Array.isArray(input?.tasks) ? input.tasks : [];
  const open = orderBriefTasks(all);
  return {
    tasks: open.length,
    clients: new Set(open.map((t) => (t.clientName || "").trim().toLowerCase())).size,
    late: open.filter((t) => t.state === "late").length,
    dueToday: open.filter((t) => t.state === "due_today").length,
    waiting: open.filter((t) => t.state === "pending_client" || t.nextStep === "approve" || t.nextStep === "approved" || t.nextStep === "footage").length,
    done: all.filter((t) => t?.state === "done").length,
  };
}

const STEP_WORDS: Record<string, string> = {
  footage: "get the footage", make: "send it to the client", send: "send it to the client", approve: "get it approved",
  approved: "get it approved", post: "post it", live: "post it",
};
/** "send it to the client" for a step key; "" for none. */
export const stepWords = (step: string | null | undefined): string => STEP_WORDS[String(step || "")] || (step ? humanize(step) : "");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Lakshmi's" / "Lakshmi Jewellers'". */
export const possessive = (name: string) => {
  const n = (name || "the client").trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
};
const firstName = (name: string) => (name || "").trim().split(/\s+/)[0] || "there";

/** "6 tasks across 3 clients this week. Do Lakshmi's video first — send it to the client by Sat 24 Oct. 1 is already late." */
export function fallbackWeekBrief(input: MemberWeekBriefInput): string {
  const open = orderBriefTasks(input?.tasks || []);
  const n = weekBriefNumbers(input);
  if (!open.length) {
    return n.done ? `${firstName(input?.name)}, your week is clear — all ${plural(n.done, "task")} done.` : `${firstName(input?.name)}, nothing is on your list this week.`;
  }
  const first = open[0];
  const what = `${possessive(first.clientName)} ${typeMetaOf(first.type).word}`;
  const when = first.nextStep && first.nextDay && dayLabel(first.nextDay)
    ? ` — ${stepWords(first.nextStep)} by ${dayLabel(first.nextDay)}`
    : first.deadlineDay && dayLabel(first.deadlineDay) ? ` — due ${dayLabel(first.deadlineDay)}` : "";
  const parts = [
    `${plural(n.tasks, "task")} across ${plural(n.clients, "client")} this week.`,
    `Do ${what} first${when}.`,
  ];
  if (n.late) parts.push(`${n.late} ${n.late === 1 ? "is" : "are"} already late.`);
  else if (n.dueToday) parts.push(`${n.dueToday} ${n.dueToday === 1 ? "is" : "are"} due today.`);
  if (n.waiting) parts.push(`${n.waiting} ${n.waiting === 1 ? "is" : "are"} waiting on the client.`);
  return parts.join(" ");
}

/* ── The morning brief ───────────────────────────────────────────────────────────────────────────── */

/** How the morning brief words each count it knows (singular, plural); unknown keys are said in plain words. */
export const MORNING_LABELS: Record<string, [string, string]> = {
  late: ["late", "late"],
  dueToday: ["due today", "due today"],
  checkpointMissed: ["behind a checkpoint", "behind a checkpoint"],
  dueThisWeek: ["due this week", "due this week"],
  waitingOnClient: ["waiting on the client", "waiting on clients"],
  nextWeek: ["for next week", "for next week"],
  needsYou: ["needs you", "need you"],
  nobodyOwns: ["with nobody on it", "with nobody on them"],
  approvalsWaiting: ["approval waiting", "approvals waiting"],
  footageToCollect: ["footage to collect", "footage pieces to collect"],
  footageMissing: ["footage missing", "footage pieces missing"],
  extrasToBill: ["extra to bill", "extras to bill"],
  extrasUnbilled: ["extra unbilled", "extras unbilled"],
  reportsDue: ["report due", "reports due"],
  escalated: ["escalated to you", "escalated to you"],
};
const MORNING_ORDER = Object.keys(MORNING_LABELS);

/** The non-zero counts in the order the brief says them (late first), each worded: "2 late", "1 approval waiting". */
export function morningPhrases(numbers: Record<string, number>): { key: string; n: number; phrase: string }[] {
  return Object.entries(numbers || {})
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort(([a], [b]) => (MORNING_ORDER.indexOf(a) + 1 || 99) - (MORNING_ORDER.indexOf(b) + 1 || 99))
    .map(([key, v]) => {
      const n = Math.round(v);
      const label = MORNING_LABELS[key];
      return { key, n, phrase: `${n} ${label ? label[n === 1 ? 0 : 1] : humanize(key)}` };
    });
}

/** "Good morning, Ravi. Today: 2 late, 3 due today, 1 waiting on the client. Start with Lakshmi Jewellers · AI video · late." */
export function fallbackMorningBrief(input: MorningBriefInput): string {
  const hello = `Good morning, ${firstName(input?.name)}.`;
  const phrases = morningPhrases(input?.numbers || {});
  const top = (input?.top || []).map((t) => tidyText(t)).filter(Boolean)[0];
  if (!phrases.length) return `${hello} Nothing is late or due today.${top ? ` Next up: ${top}.` : ""}`;
  return `${hello} Today: ${phrases.map((p) => p.phrase).join(", ")}.${top ? ` Start with ${top}.` : ""}`;
}

/* ── The reasons summary ─────────────────────────────────────────────────────────────────────────── */

/** Whose delay a reason is: the client's (approval, footage) or the team's (not sent, not posted). */
export function reasonSide(r: Pick<SmmReasonEntry, "step" | "reason">): "client" | "team" {
  const step = String(r?.step || "").toLowerCase();
  if (["footage", "approved", "approve", "approval"].includes(step)) return "client";
  if (["send", "make", "live", "post"].includes(step)) return "team";
  return /client|customer|approval|footage|not answering|no reply/i.test(String(r?.reason || "")) ? "client" : "team";
}

/** The counts a reasons summary says. */
export function reasonsNumbers(reasons: readonly SmmReasonEntry[]): Record<"total" | "client" | "team" | "notSent" | "notApproved" | "noFootage" | "notPosted", number> {
  const list = Array.isArray(reasons) ? reasons : [];
  const step = (r: SmmReasonEntry) => String(r.step || "").toLowerCase();
  return {
    total: list.length,
    client: list.filter((r) => reasonSide(r) === "client").length,
    team: list.filter((r) => reasonSide(r) === "team").length,
    notSent: list.filter((r) => step(r) === "send" || step(r) === "make").length,
    notApproved: list.filter((r) => step(r) === "approved" || step(r) === "approve").length,
    noFootage: list.filter((r) => step(r) === "footage").length,
    notPosted: list.filter((r) => step(r) === "live" || step(r) === "post").length,
  };
}

const commonest = (list: readonly SmmReasonEntry[]): { reason: string; n: number } | null => {
  const counts = new Map<string, { reason: string; n: number }>();
  for (const r of list) {
    // A coded reason ("client_not_answering") is said in words; a typed one as typed.
    const raw = String(r?.reason || "");
    const reason = tidyText(/^[a-z0-9_]+$/.test(raw) ? humanize(raw) : raw);
    if (!reason) continue;
    const k = reason.toLowerCase();
    const c = counts.get(k) || { reason, n: 0 };
    c.n += 1;
    counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0] || null;
};

/** "This week: 5 delays — 3 waited on clients, 2 were the team's. Clients: most often "not answering" (2). Team: "Flow credits" (1)." */
export function fallbackReasonsSummary(input: ReasonsSummaryInput): string {
  const label = tidyText(input?.label) || "These weeks";
  const reasons = Array.isArray(input?.reasons) ? input.reasons : [];
  if (!reasons.length) return `${label}: no late reasons recorded.`;
  const n = reasonsNumbers(reasons);
  const parts = [`${label}: ${plural(n.total, "delay")} — ${n.client} waited on ${n.client === 1 ? "the client" : "clients"}, ${n.team} ${n.team === 1 ? "was" : "were"} the team's.`];
  const c = commonest(reasons.filter((r) => reasonSide(r) === "client"));
  const t = commonest(reasons.filter((r) => reasonSide(r) === "team"));
  if (c) parts.push(`Clients: most often "${c.reason}" (${c.n}).`);
  if (t) parts.push(`Team: most often "${t.reason}" (${t.n}).`);
  return parts.join(" ");
}

/* ── The client's weekly WhatsApp update ─────────────────────────────────────────────────────────── */

const TELUGU = /[\u{0C00}-\u{0C7F}]/u;
const URL_RE = /\bhttps?:\/\/|\bwww\.|\.(?:com|in|net|org)\b/i;

/** The lists between the opening and the closing — built by code, so every title, link and day is exact. */
export function clientUpdateSections(input: ClientWeeklyUpdateInput, language: "en" | "te" = input?.language || "en"): string {
  const te = language === "te";
  const typeWord = (type: string) => (te ? typeMetaOf(type).te : typeMetaOf(type).word);
  const name = (title: string, type: string) => tidyText(title) || (te ? typeMetaOf(type).te : typeMetaOf(type).label);
  const blocks: string[] = [];
  const live = (input?.live || []).filter(Boolean);
  if (live.length) {
    blocks.push([
      te ? "✅ ఈ వారం పోస్ట్ అయ్యాయి:" : "✅ Live now:",
      ...live.map((l) => {
        const links = (l.links || []).map((x) => tidyText(x)).filter(Boolean);
        return `• ${name(l.title, l.type)} (${typeWord(l.type)})${links.length ? `\n  ${links.join("\n  ")}` : ""}`;
      }),
    ].join("\n"));
  }
  const coming = (input?.coming || []).filter(Boolean);
  if (coming.length) {
    blocks.push([
      te ? "🗓 త్వరలో రాబోతున్నవి:" : "🗓 Coming up:",
      ...coming.map((c) => {
        const day = te ? dayLabelTe(c.day) : dayLabel(c.day);
        return `• ${name(c.title, c.type)} (${typeWord(c.type)})${day ? ` — ${day}` : ""}`;
      }),
    ].join("\n"));
  }
  const waiting = (input?.waitingOnClient || []).filter(Boolean);
  if (waiting.length) {
    blocks.push([
      te ? "⏳ మీ నుండి కావాలి:" : "⏳ Waiting on you:",
      ...waiting.map((w) => {
        const real = typeMetaOf(w.type).word === "real video";
        const ask = te ? (real ? "వీడియో క్లిప్స్ పంపండి" : "మీ అప్రూవల్ పంపండి") : real ? "please send the footage" : "please send your approval";
        return `• ${name(w.title, w.type)} (${typeWord(w.type)}) — ${ask}`;
      }),
    ].join("\n"));
  }
  return blocks.join("\n\n");
}

const clientNameOf = (input: Pick<ClientWeeklyUpdateInput, "clientName">) => tidyText(input?.clientName) || "Sir/Madam";

/** The plain message: greeting, the lists, a thank-you — in English or Telugu. */
export function fallbackClientUpdate(input: ClientWeeklyUpdateInput, language: "en" | "te" = input?.language || "en"): string {
  const te = language === "te";
  const name = clientNameOf(input);
  const week = Math.max(1, Math.round(Number(input?.week) || 1));
  const opening = te
    ? `నమస్కారం ${name} గారు 🙏\nఈ వారం (వారం ${week}) మీ సోషల్ మీడియా అప్‌డేట్:`
    : `Hello ${name} garu 🙏\nHere is this week's social media update (week ${week}):`;
  const sections = clientUpdateSections(input, language);
  const waiting = (input?.waitingOnClient || []).length > 0;
  const closing = te
    ? waiting ? "పైన ఉన్నవాటికి మీ రిప్లై కోసం ఎదురుచూస్తున్నాం. ధన్యవాదాలు!" : "ధన్యవాదాలు!"
    : waiting ? "Please reply when you can — we'll go ahead as soon as we hear from you. Thank you!" : "Thank you!";
  const body = sections || (te ? "ఈ వారం పని అనుకున్నట్లుగా జరుగుతోంది." : "This week's work is on track.");
  return `${opening}\n\n${body}\n\n${closing}\n— Dream Team Services`;
}

/**
 * The AI's two lines, checked: the right script for the language, no link, no number but the week, no offer,
 * short. Null when either line fails — the plain lines are used instead.
 */
export function checkClientUpdateLines(reply: unknown, input: ClientWeeklyUpdateInput, language: "en" | "te" = input?.language || "en"): { opening: string; closing: string } | null {
  const json = extractJson(reply);
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const opening = tidyText(r.opening, { multiline: true });
  const closing = tidyText(r.closing, { multiline: true });
  const week = String(Math.max(1, Math.round(Number(input?.week) || 1)));
  const ok = (line: string, max: number) => {
    if (!line || line.length > max || URL_RE.test(line)) return false;
    if (language === "te" ? !TELUGU.test(line) : !/[A-Za-z]/.test(line)) return false;
    if ([...line.matchAll(/\d+/g)].some((m) => m[0] !== week)) return false;
    if (OFFER_WORDS.some(({ re }) => re.test(line))) return false;
    return !/[{}]/.test(line);
  };
  if (!ok(opening, SMM_AI_LIMITS.opening) || !ok(closing, SMM_AI_LIMITS.closing)) return null;
  return { opening, closing };
}

/** The AI's opening and closing around the code's lists. */
export function assembleClientUpdate(input: ClientWeeklyUpdateInput, lines: { opening: string; closing: string }, language: "en" | "te" = input?.language || "en"): string {
  const sections = clientUpdateSections(input, language);
  const body = sections || (language === "te" ? "ఈ వారం పని అనుకున్నట్లుగా జరుగుతోంది." : "This week's work is on track.");
  return `${lines.opening}\n\n${body}\n\n${lines.closing}\n— Dream Team Services`;
}

/* ── The briefs' cache (localStorage, per person) ────────────────────────────────────────────────── */

/** One week brief per person per calendar week (the Monday of `today`). */
export const weekBriefCacheKey = (uid: string, today: string) => `dts_smm_week_brief_${uid}_${mondayOf(today)}`;
/** One morning brief per person per day. */
export const morningBriefCacheKey = (uid: string, today: string) => `dts_smm_morning_${uid}_${today}`;

type StorageLike = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem" | "key" | "length">>;

/** A cached AI brief, or null — never throws (private mode, a full or blocked storage, a broken value). */
export function readBriefCache(storage: StorageLike | null | undefined, key: string): { text: string; usedAi: boolean } | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { text?: unknown; usedAi?: unknown };
    return typeof v?.text === "string" && v.text.trim() ? { text: v.text, usedAi: v.usedAi === true } : null;
  } catch {
    return null;
  }
}

/**
 * Keeps an AI brief, and removes the same person's older ones under `prefix` (a year of mornings would
 * otherwise pile up). Never throws.
 */
export function writeBriefCache(storage: StorageLike | null | undefined, key: string, value: { text: string; usedAi: boolean }, prefix?: string): void {
  try {
    if (!storage) return;
    if (prefix && typeof storage.key === "function" && typeof storage.removeItem === "function") {
      const old: string[] = [];
      for (let i = 0; i < (storage.length || 0); i++) {
        const k = storage.key(i);
        if (k && k !== key && k.startsWith(prefix)) old.push(k);
      }
      old.forEach((k) => storage.removeItem!(k));
    }
    storage.setItem(key, JSON.stringify({ text: value.text, usedAi: value.usedAi, at: Date.now() }));
  } catch { /* private mode / full storage: the brief is simply asked again */ }
}

/** The prefix of a person's cached week briefs / morning briefs (for `writeBriefCache`'s clean-up). */
export const weekBriefCachePrefix = (uid: string) => `dts_smm_week_brief_${uid}_`;
export const morningBriefCachePrefix = (uid: string) => `dts_smm_morning_${uid}_`;

/** A stable fingerprint of an input, for the session memo of the summaries (order of keys kept as given). */
export function fingerprint(value: unknown): string {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return String(Math.random());
  }
}
