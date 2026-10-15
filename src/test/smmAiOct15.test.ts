/**
 * SMM Delivery Control, phase 5 — the AI layer's pure rules (`utils/smmAiRules`, 2026-10-15).
 *
 * The AI writes words only; these tests hold the checks every answer passes before anybody sees it:
 *   • parsing — unknown pieces and second answers dropped, fenced / wrapped JSON read, everything trimmed and
 *     capped (title 60, idea 200, caption 400, ≤ 8 hashtags each with a #);
 *   • facts — no phone number, price, percentage, offer or other number the team never wrote;
 *   • repeats — no exact repeat of the last two months' titles (or another piece's);
 *   • festivals — kept only inside the piece's own week, on the calendar, not past, not on a fixed piece, once;
 *   • briefs — counts come from placeholders; a number the model typed must be one it was given;
 *   • fallbacks — blank titles + the week's main festival; plain briefs, summaries and the client message;
 *   • the cache keys (Monday of the week / the day) and the storage that never throws.
 * Lakshmi Jewellers' month (Thu 15 Oct → 15 Nov 2026, `smmDeliveryFixtures`): W1 15–21 Oct (Dasara on Tue 20),
 * W2 22–28 Oct, W3 29 Oct – 4 Nov (only Karva Chauth — a regional day from elsewhere), W4 5–14 Nov (Diwali on
 * Sun 8 Nov).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planMonth } from "@/utils/smmCadence";
import { FESTIVALS, FESTIVALS_2027, FESTIVAL_CALENDAR } from "@/utils/festivals";
import { posterOccasionCalendar } from "@/utils/posterOccasions";
import {
  SMM_AI_LIMITS, capText, checkClientUpdateLines, checkFestival, assembleClientUpdate, dayLabel, dayLabelTe,
  extractJson, factsFromText, factsOfMonth, fallbackClientUpdate, fallbackMorningBrief, fallbackReasonsSummary,
  fallbackTaskSuggestions, fallbackWeekBrief, festivalCandidates, festivalRank, fillBrief, keepVerifiedSentences,
  mergeSuggestions, mondayOf, monthTitlesToAvoid, morningBriefCacheKey, morningPhrases, normalizeHashtags,
  orderBriefTasks, parseTaskSuggestions, pastTitlesOf, readBriefCache, reasonSide, reasonsNumbers, splitCaptionHashtags,
  titleKey, titleTasksOf, unverifiedClaims, weekBriefCacheKey, weekBriefNumbers, writeBriefCache, cleanAcceptedEntry,
  type SmmTitleTask,
} from "@/utils/smmAiRules";
import { month, piece } from "./smmDeliveryFixtures";

const TODAY = "2026-10-15";

/** Lakshmi's month: 4 videos + 4 posters (1 + 1 a week), ids v1–v4 / s1–s4. */
function lakshmi(over: Record<string, unknown> = {}, items?: ReturnType<typeof piece>[]) {
  return month({
    commitments: { ai_ad: 4, poster: 4, real_video: 0 },
    items: items ?? [
      piece({ id: "v1" }), piece({ id: "v2" }), piece({ id: "v3" }), piece({ id: "v4" }),
      piece({ id: "s1", kind: "poster" }), piece({ id: "s2", kind: "poster" }), piece({ id: "s3", kind: "poster" }), piece({ id: "s4", kind: "poster" }),
    ],
    ...over,
  });
}
const planOf = (m: ReturnType<typeof month>) => planMonth(m, { today: TODAY, holidays: null });
const tasksOf = (m: ReturnType<typeof month>) => titleTasksOf(m, planOf(m), { today: TODAY });
const ctxOf = (m: ReturnType<typeof month>, pastTitles: string[] = []) => ({ tasks: tasksOf(m), pastTitles, facts: factsOfMonth(m), today: TODAY });

describe("which pieces get a suggestion", () => {
  it("lists every counted piece not live yet, by week, with its week's dates and festivals", () => {
    const tasks = tasksOf(lakshmi());
    expect(tasks.map((t) => `${t.week}:${t.itemId}`)).toEqual(["1:v1", "1:s1", "2:v2", "2:s2", "3:v3", "3:s3", "4:v4", "4:s4"]);
    const w1 = tasks[0];
    expect([w1.weekStart, w1.weekEnd, w1.type, w1.clips]).toEqual(["2026-10-15", "2026-10-21", "ai_video", 4]);
    expect(w1.festivals.map((f) => f.date)).toContain("2026-10-20");
    expect(w1.festivals.find((f) => f.date === "2026-10-20")?.name).toBe("Dussehra / Vijayadashami (Dasara)");
  });

  it("leaves out posted pieces, rows beyond the promise, pieces moved out, and keeps only asked ids", () => {
    const m = lakshmi({}, [
      piece({ id: "v1", status: "posted", uploadDate: "2026-10-16" }), piece({ id: "v2" }), piece({ id: "v3" }), piece({ id: "v4" }), piece({ id: "v5" }),
    ]);
    const plan = planOf(m);
    expect(plan.uncounted).toContain("v5");
    const ids = titleTasksOf(m, { ...plan, movedOut: ["v4"] }, { today: TODAY }).map((t) => t.itemId);
    expect(ids).toEqual(["v2", "v3"]);
    expect(titleTasksOf(m, plan, { today: TODAY, itemIds: ["v3", "v5"] }).map((t) => t.itemId)).toEqual(["v3"]);
  });

  it("knows a person's own title, and gives a fixed piece no festival", () => {
    const m = lakshmi({}, [
      piece({ id: "v1", title: "Founder story" }),
      piece({ id: "v2", plan: { week: 1, fixedDate: "2026-10-17", fixedReason: "client_asked", by: "u" } }),
      piece({ id: "v3" }), piece({ id: "v4" }),
    ]);
    const tasks = tasksOf(m);
    const v1 = tasks.find((t) => t.itemId === "v1")!;
    const v2 = tasks.find((t) => t.itemId === "v2")!;
    expect([v1.currentTitle, v1.personTitle]).toEqual(["Founder story", true]);
    expect(v2.fixed).toBe("client_asked");
    expect(v2.festivals).toEqual([]);
  });

  it("never offers a festival already past, or before a first month's first post day", () => {
    const week = { start: "2026-10-15", end: "2026-10-21" };
    expect(festivalCandidates(week, "2026-10-20").map((f) => f.date).every((d) => d >= "2026-10-20")).toBe(true);
    expect(festivalCandidates(week, "2026-10-22")).toEqual([]);
  });

  it("never offers a regional day from elsewhere or an eve (Karva Chauth, Bhai Dooj, Christmas Eve)", () => {
    expect(festivalCandidates({ start: "2026-10-29", end: "2026-11-04" }).map((f) => f.name)).not.toContain("Karva Chauth");
    const w = festivalCandidates({ start: "2026-11-05", end: "2026-11-14" }).map((f) => f.name);
    expect(w).toContain("Diwali / Lakshmi Puja (Deepavali)");
    expect(w).not.toContain("Bhai Dooj");
    expect(w).not.toContain("Govardhan Puja");
    expect(festivalCandidates({ start: "2026-12-22", end: "2026-12-28" }).map((f) => f.name)).toEqual(["National Farmers' Day", "Christmas"]);
  });
});

describe("reading the model's answer", () => {
  it("drops pieces it was not asked about and a second answer for one piece; reads fenced JSON", () => {
    const m = lakshmi();
    const reply = "Here you go:\n```json\n" + JSON.stringify({ tasks: [
      { itemId: "v1", title: "Gold that glows", idea: "Close-ups of new bangles.", caption: "New bangles are in!", hashtags: ["#Gold"] },
      { itemId: "v1", title: "Second answer", idea: "x" },
      { itemId: "zzz", title: "Not asked" },
    ] }) + "\n```";
    const { suggestions, dropped } = parseTaskSuggestions(reply, ctxOf(m));
    expect(suggestions.map((s) => [s.itemId, s.title, s.week])).toEqual([["v1", "Gold that glows", 1]]);
    expect(dropped.join(" | ")).toMatch(/second answer for v1/);
    expect(dropped.join(" | ")).toMatch(/not asked about \(zzz\)/);
  });

  it("reads a bare list or { suggestions }, and drops an answer with nothing usable", () => {
    const m = lakshmi();
    expect(parseTaskSuggestions([{ itemId: "s1", title: "Shine on" }], ctxOf(m)).suggestions[0].title).toBe("Shine on");
    expect(parseTaskSuggestions({ suggestions: [{ itemId: "s1", title: "Shine on" }] }, ctxOf(m)).suggestions).toHaveLength(1);
    expect(parseTaskSuggestions({ tasks: [{ itemId: "s1", title: "  " }] }, ctxOf(m)).suggestions).toEqual([]);
    expect(parseTaskSuggestions("not json at all", ctxOf(m)).suggestions).toEqual([]);
    expect(extractJson('blah {"tasks": []} blah')).toEqual({ tasks: [] });
  });

  it("trims and caps every field: title 60 at a word, idea 200, caption 400, ≤ 8 hashtags each with a #", () => {
    const m = lakshmi();
    const long = "Lakshmi Jewellers brings you the finest handcrafted temple jewellery collection for every celebration";
    const { suggestions } = parseTaskSuggestions({ tasks: [{
      itemId: "v1", title: `  **"${long}."**  `, idea: "A ".repeat(150), caption: "Shine bright. ".repeat(40),
      hashtags: ["gold", "#Gold", "#temple jewellery", "#1234", "##Bridal", "#a", "#b", "#c", "#d", "#e", "#f", "#g"],
    }] }, ctxOf(m));
    const s = suggestions[0];
    expect(s.title.length).toBeLessThanOrEqual(SMM_AI_LIMITS.title);
    expect(s.title).toBe("Lakshmi Jewellers brings you the finest handcrafted temple");
    expect(s.idea.length).toBeLessThanOrEqual(SMM_AI_LIMITS.idea);
    expect(s.caption.length).toBeLessThanOrEqual(SMM_AI_LIMITS.caption);
    expect(s.caption.endsWith(".")).toBe(true);
    expect(s.hashtags).toHaveLength(8);
    expect(s.hashtags.slice(0, 4)).toEqual(["#gold", "#templejewellery", "#Bridal", "#a"]);
    expect(s.hashtags.every((h) => h.startsWith("#") && !/\s/.test(h))).toBe(true);
  });

  it("moves hashtags written inside the caption into the list", () => {
    expect(splitCaptionHashtags("Shine this Diwali! #Diwali #Gold")).toEqual({ caption: "Shine this Diwali!", hashtags: ["#Diwali", "#Gold"] });
    const { suggestions } = parseTaskSuggestions({ tasks: [{ itemId: "s1", title: "Diwali glow", caption: "Shine this Diwali! #Diwali", hashtags: ["#Gold"] }] }, ctxOf(lakshmi()));
    expect(suggestions[0].caption).toBe("Shine this Diwali!");
    expect(suggestions[0].hashtags).toEqual(["#Gold", "#Diwali"]);
  });
});

describe("verified facts — nothing the team never wrote", () => {
  const none = factsFromText("");
  it("names phone numbers, prices, percentages, offer words and other numbers", () => {
    expect(unverifiedClaims("Call 98480 12345 today", none)).toEqual(expect.arrayContaining([expect.stringMatching(/phone number/)]));
    expect(unverifiedClaims("Only ₹999 a gram", none)).toEqual(expect.arrayContaining(["price ₹999"]));
    expect(unverifiedClaims("Flat 20% off this week", none)).toEqual(expect.arrayContaining(["percentage 20%", 'offer word "flat / up to"']));
    expect(unverifiedClaims("Grand Diwali offer", none)).toEqual(['offer word "offer"']);
    expect(unverifiedClaims("Trusted for 25 years", none)).toEqual(["number 25"]);
    expect(unverifiedClaims("3 ways to style a necklace", none)).toEqual([]);
    expect(unverifiedClaims("Diwali 2026 collection", none, ["2026"])).toEqual([]);
  });

  it("allows exactly what the team's notes say — and nothing more", () => {
    const facts = factsFromText("Diwali offer: 10% off making charges. Call 98480 12345.");
    expect(unverifiedClaims("Diwali offer — 10% off making charges", facts)).toEqual([]);
    expect(unverifiedClaims("Call 98480 12345", facts)).toEqual([]);
    expect(unverifiedClaims("Now 15% off", facts)).toEqual(["percentage 15%"]);
    expect(unverifiedClaims("Free gift with every purchase", facts)).toEqual(['offer word "free"']);
  });

  it("drops only the sentences with an invented claim; blanks a title with one", () => {
    expect(keepVerifiedSentences("Our bangles shine. Get 50% off today! Visit us.", none)).toEqual({ text: "Our bangles shine. Visit us.", dropped: ["percentage 50%"] });
    const { suggestions, dropped } = parseTaskSuggestions({ tasks: [
      { itemId: "v1", title: "Mega sale at Lakshmi", idea: "Show the new bridal set. Prices from ₹4,999.", caption: "Visit us today. Call 98765 12345!" },
    ] }, ctxOf(lakshmi()));
    expect(suggestions[0].title).toBe("");
    expect(suggestions[0].idea).toBe("Show the new bridal set.");
    expect(suggestions[0].caption).toBe("Visit us today.");
    expect(dropped.join(" ")).toMatch(/offer word "sale"/);
  });

  it("reads the month's facts from what the team typed on its pieces", () => {
    const m = lakshmi({}, [piece({ id: "v1", title: "Diwali offer", notes: "10% off making charges till 9 Nov" }), piece({ id: "v2" })]);
    const facts = factsOfMonth(m);
    expect(facts.numbers).toEqual(expect.arrayContaining(["10", "9"]));
    const { suggestions } = parseTaskSuggestions({ tasks: [{ itemId: "v2", title: "10% off making charges", idea: "The Diwali offer, told simply." }] }, ctxOf(m));
    expect(suggestions[0].title).toBe("10% off making charges");
    expect(suggestions[0].idea).toBe("The Diwali offer, told simply.");
  });

  it("drops a hashtag that makes an offer, run together or not", () => {
    const { suggestions } = parseTaskSuggestions({ tasks: [{ itemId: "s1", title: "Bridal sets", hashtags: ["#DiwaliOffer", "#diwalidiscount", "#Bridal", "#Gold99"] }] }, ctxOf(lakshmi()));
    expect(suggestions[0].hashtags).toEqual(["#Bridal"]);
  });

  it("never names a town the team did not write (the live run tagged Hyderabad for a client nobody placed)", () => {
    expect(unverifiedClaims("The best jewellers in Hyderabad", none)).toEqual(["place name Hyderabad"]);
    const { suggestions } = parseTaskSuggestions({ tasks: [{ itemId: "s1", title: "Bridal sets", caption: "Visit our Vijayawada showroom. Shine on!", hashtags: ["#HyderabadJewellery", "#kakinadagold", "#Bridal"] }] }, ctxOf(lakshmi()));
    expect(suggestions[0].hashtags).toEqual(["#Bridal"]);
    expect(suggestions[0].caption).toBe("Shine on!");
    const placed = lakshmi({}, [piece({ id: "s1", kind: "poster", notes: "Main Road, Kakinada" })]);
    expect(parseTaskSuggestions({ tasks: [{ itemId: "s1", title: "Kakinada's favourite", hashtags: ["#KakinadaGold"] }] }, ctxOf(placed)).suggestions[0])
      .toMatchObject({ title: "Kakinada's favourite", hashtags: ["#KakinadaGold"] });
  });
});

describe("no repeats", () => {
  it("blanks a title the client had in the last two months, ignoring case and punctuation", () => {
    const { suggestions } = parseTaskSuggestions({ tasks: [
      { itemId: "v1", title: "Diwali Sparkle!", idea: "x idea" },
      { itemId: "s1", title: "Fresh arrivals" },
      { itemId: "v2", title: "fresh arrivals", idea: "Walk past the new arrivals shelf." },
    ] }, ctxOf(lakshmi(), ["diwali sparkle"]));
    expect(suggestions.map((s) => [s.itemId, s.title])).toEqual([["v1", ""], ["s1", "Fresh arrivals"], ["v2", ""]]);
    expect(titleKey("Diwali — Sparkle!!")).toBe(titleKey("diwali sparkle"));
  });

  it("collects the last two months' titles before this one (plan titles too), each once", () => {
    const months = [
      { id: "m-3", cycle: { startDate: "2026-07-15" }, status: "completed", items: [{ title: "Too old" }] },
      { id: "m-2", cycle: { startDate: "2026-08-15" }, status: "completed", items: [{ title: "Monsoon gold" }, { title: "", plan: { title: "Teej special" } }] },
      { id: "m0", cycle: { startDate: "2026-09-15" }, status: "renewed", items: [{ title: "Founder story" }, { title: "founder story" }] },
      { id: "m1", cycle: { startDate: "2026-10-15" }, status: "active", items: [{ title: "This month" }] },
      { id: "m9", cycle: { startDate: "2026-09-01" }, status: "deleted", items: [{ title: "Deleted month" }] },
      { id: "m2", cycle: { startDate: "2026-11-15" }, status: "active", items: [{ title: "Next month" }] },
    ];
    expect(pastTitlesOf(months as never, { id: "m1", cycle: { startDate: "2026-10-15" } } as never)).toEqual(["Founder story", "Monsoon gold", "Teej special"]);
    expect(monthTitlesToAvoid(lakshmi({}, [piece({ id: "a", title: "Kept" }), piece({ id: "b", title: "Asked" })]), ["b"])).toEqual(["Kept"]);
  });
});

describe("festivals — only inside the piece's own week", () => {
  const tasks = () => tasksOf(lakshmi());
  const t = (id: string) => tasks().find((x) => x.itemId === id)!;

  it("keeps a festival inside the week under the calendar's own name", () => {
    expect(checkFestival(t("s1"), { name: "Dasara", date: "2026-10-20" }, new Set())).toEqual({ name: "Dussehra / Vijayadashami (Dasara)", date: "2026-10-20" });
    expect(checkFestival(t("s4"), { name: "Deepavali", date: "2026-11-08" }, new Set())).toEqual({ name: "Diwali / Lakshmi Puja (Deepavali)", date: "2026-11-08" });
  });

  it("drops one outside the week, one not on the calendar, a wrong name, and one on a fixed piece", () => {
    expect(checkFestival(t("s2"), { name: "Diwali", date: "2026-11-08" }, new Set())).toBeNull();
    expect(checkFestival(t("s1"), { name: "Lakshmi Day", date: "2026-10-17" }, new Set())).toBeNull();
    expect(checkFestival(t("s1"), { name: "Christmas", date: "2026-10-20" }, new Set())).toBeNull();
    const fixed: SmmTitleTask = { ...t("s1"), fixed: "client_asked" };
    expect(checkFestival(fixed, { name: "Dasara", date: "2026-10-20" }, new Set())).toBeNull();
  });

  it("gives each festival day to one piece only, in the parsed answer too", () => {
    const { suggestions } = parseTaskSuggestions({ tasks: [
      { itemId: "v1", title: "Dasara blessings", festival: { name: "Dasara", date: "2026-10-20" } },
      { itemId: "s1", title: "Vijayadashami gold", festival: { name: "Vijayadashami", date: "2026-10-20" } },
      { itemId: "s2", title: "Wrong week", festival: { name: "Diwali", date: "2026-11-08" } },
    ] }, ctxOf(lakshmi()));
    expect(suggestions.map((s) => s.festival?.date ?? null)).toEqual(["2026-10-20", null, null]);
  });

  it("ranks the Telugu states' main festivals first and never auto-places a regional day from elsewhere", () => {
    expect(festivalRank({ name: "Dussehra / Vijayadashami (Dasara)", date: "2026-10-20" })).toBe(0);
    expect(festivalRank({ name: "Diwali / Lakshmi Puja (Deepavali)", date: "2026-11-08" })).toBe(0);
    expect(festivalRank({ name: "Dhanteras", date: "2026-11-06" })).toBe(1);
    expect(festivalRank({ name: "Karva Chauth", date: "2026-10-29" })).toBe(2);
    expect(festivalRank({ name: "Christmas Eve", date: "2026-12-24" })).toBe(2);
    expect(festivalRank({ name: "World Food Day", date: "2026-10-16" })).toBe(2);
  });
});

describe("the fallback — blank titles, the week's main festival", () => {
  it("leaves every text blank and puts Dasara and Diwali on that week's poster, nothing on Karva Chauth's week", () => {
    const out = fallbackTaskSuggestions(tasksOf(lakshmi()));
    expect(out.every((s) => !s.title && !s.idea && !s.caption && s.hashtags.length === 0)).toBe(true);
    expect(out.filter((s) => s.festival).map((s) => [s.itemId, s.festival!.date])).toEqual([["s1", "2026-10-20"], ["s4", "2026-11-08"]]);
  });

  it("never moves a festival onto a piece the team dated or a fixed piece", () => {
    const m = lakshmi({}, [
      piece({ id: "v1" }), piece({ id: "s1", kind: "poster", uploadDate: "2026-10-17" }),
      piece({ id: "v2" }), piece({ id: "s2", kind: "poster" }), piece({ id: "v3" }), piece({ id: "s3", kind: "poster" }), piece({ id: "v4" }), piece({ id: "s4", kind: "poster" }),
    ]);
    const out = fallbackTaskSuggestions(tasksOf(m));
    expect(out.find((s) => s.itemId === "s1")?.festival).toBeNull();
    expect(out.find((s) => s.itemId === "v1")?.festival?.date).toBe("2026-10-20");
  });

  it("merges: the AI's answers kept, the rest blank — no second festival in a week where the AI placed one", () => {
    const tasks = tasksOf(lakshmi());
    const ai = [
      { itemId: "v1", week: 1 as const, title: "Dasara wishes", idea: "", caption: "", hashtags: [], festival: { name: "Dussehra / Vijayadashami (Dasara)", date: "2026-10-20" } },
      { itemId: "v2", week: 2 as const, title: "Dasara wishes", idea: "", caption: "", hashtags: [], festival: null },
    ];
    const { suggestions, answered } = mergeSuggestions(tasks, ai);
    expect(answered).toBe(2);
    expect(suggestions).toHaveLength(8);
    expect(suggestions.find((s) => s.itemId === "s1")?.festival).toBeNull();
    expect(suggestions.find((s) => s.itemId === "v2")?.title).toBe("");
    expect(suggestions.find((s) => s.itemId === "s4")?.festival?.date).toBe("2026-11-08");
  });

  it("cleans a person's accepted row without fact-checking it", () => {
    expect(cleanAcceptedEntry({ itemId: "v1", title: `  ${"x".repeat(70)} `, idea: "10% off, as agreed", caption: "a\n\n\n\nb", hashtags: "#Gold gold #gold", festival: { name: "Dasara", date: "2026-10-20" } }))
      .toEqual({ itemId: "v1", title: "x".repeat(60), idea: "10% off, as agreed", caption: "a\n\nb", hashtags: ["#Gold"], festival: { name: "Dasara", date: "2026-10-20" } });
    expect(normalizeHashtags("#a, #b #a")).toEqual(["#a", "#b"]);
    expect(capText("One two three four", 9)).toBe("One two");
  });
});

describe("numbers in briefs are code's", () => {
  const values = { tasks: 6, clients: 3, late: 1 };

  it("fills the placeholders", () => {
    expect(fillBrief("{tasks} tasks across { clients } clients — {late} late.", values).text).toBe("6 tasks across 3 clients — 1 late.");
  });

  it("rejects a placeholder it was not given, a number it was not given, or a broken brace", () => {
    expect(fillBrief("{tasks} tasks, {overdue} overdue", values).problem).toMatch(/unknown placeholder \{overdue\}/);
    expect(fillBrief("{tasks} tasks, 2 are late", values).problem).toMatch(/not given \(2\)/);
    expect(fillBrief("You have five tasks today", values).problem).toMatch(/five tasks/);
    expect(fillBrief("You have three clients today", values).text).toBe("You have three clients today");
    expect(fillBrief("{tasks} tasks {", values).problem).toMatch(/broken/);
  });

  it("accepts a number that agrees, and the days it was given; words like 'one of' are not counts", () => {
    expect(fillBrief("6 tasks — {late} late. One of them is Lakshmi's, send it by Sat 24 Oct.", values, { allowNumbers: [24] }).text)
      .toBe("6 tasks — 1 late. One of them is Lakshmi's, send it by Sat 24 Oct.");
  });

  it("needs a placeholder when there is something to count, and names the first client when asked", () => {
    expect(fillBrief("A busy week ahead.", values, { requireAny: true }).problem).toBe("no placeholder used");
    expect(fillBrief("A calm week.", { tasks: 0 }, { requireAny: true }).text).toBe("A calm week.");
    expect(fillBrief("{tasks} tasks — start with Ravi's poster.", values, { mustMention: "Lakshmi Jewellers" }).problem).toMatch(/does not name/);
    expect(fillBrief("{tasks} tasks — start with Lakshmi's video.", values, { mustMention: "Lakshmi Jewellers" }).text).toBe("6 tasks — start with Lakshmi's video.");
  });
});

describe("the plain briefs", () => {
  const tasks = [
    { clientName: "Sri Sai Silks", type: "poster", title: "", deadlineDay: "2026-10-28", state: "on_track" },
    { clientName: "Lakshmi Jewellers", type: "ai_video", title: "Dasara", deadlineDay: "2026-10-21", state: "checkpoint_missed", nextStep: "make", nextDay: "2026-10-24" },
    { clientName: "Ravi Motors", type: "real_video", title: "", deadlineDay: "2026-10-17", state: "late", nextStep: "footage", nextDay: "2026-10-16" },
    { clientName: "Ravi Motors", type: "poster", title: "", deadlineDay: "2026-10-28", state: "on_track", nextStep: "approve", nextDay: "2026-10-27" },
    { clientName: "Lakshmi Jewellers", type: "poster", title: "", deadlineDay: "2026-10-21", state: "done" },
  ];

  it("orders the week most urgent first and counts it", () => {
    expect(orderBriefTasks(tasks).map((t) => t.state)).toEqual(["late", "checkpoint_missed", "on_track", "on_track"]);
    expect(weekBriefNumbers({ tasks })).toEqual({ tasks: 4, clients: 3, late: 1, dueToday: 0, waiting: 2, done: 1 });
  });

  it("writes the week brief in words with the code's numbers", () => {
    expect(fallbackWeekBrief({ uid: "u", name: "Ravi Kumar", today: TODAY, tasks })).toBe(
      "4 tasks across 3 clients this week. Do Ravi Motors' real video first — get the footage by Fri 16 Oct. 1 is already late. 2 are waiting on the client.",
    );
    expect(fallbackWeekBrief({ uid: "u", name: "Ravi", today: TODAY, tasks: [] })).toBe("Ravi, nothing is on your list this week.");
    expect(fallbackWeekBrief({ uid: "u", name: "Ravi", today: TODAY, tasks: [tasks[4]] })).toBe("Ravi, your week is clear — all 1 task done.");
  });

  it("writes the morning brief: late first, zeros left out, unknown keys in words", () => {
    expect(morningPhrases({ dueToday: 3, late: 2, waitingOnClient: 1, nextWeek: 0, approvals_pending: 2 }).map((p) => p.phrase))
      .toEqual(["2 late", "3 due today", "1 waiting on the client", "2 approvals pending"]);
    expect(fallbackMorningBrief({ uid: "u", name: "Priya Reddy", role: "tech_member", today: TODAY, numbers: { late: 2, dueToday: 3 }, top: ["Lakshmi Jewellers · AI video · late"] }))
      .toBe("Good morning, Priya. Today: 2 late, 3 due today. Start with Lakshmi Jewellers · AI video · late.");
    expect(fallbackMorningBrief({ uid: "u", name: "Priya", role: "tech_member", today: TODAY, numbers: { late: 0 } })).toBe("Good morning, Priya. Nothing is late or due today.");
  });

  it("splits the late reasons into the client's and the team's", () => {
    const reasons = [
      { clientName: "Lakshmi", type: "ai_video", step: "approved", reason: "Client not answering", byName: "Sita" },
      { clientName: "Ravi Motors", type: "real_video", step: "footage", reason: "Client not answering", byName: "Sita" },
      { clientName: "Lakshmi", type: "poster", step: "send", reason: "flow_credits", byName: "Ravi" },
      { clientName: "Sai Silks", type: "poster", step: "", reason: "Waiting for client approval", byName: "Priya" },
    ];
    expect(reasons.map(reasonSide)).toEqual(["client", "client", "team", "client"]);
    expect(reasonsNumbers(reasons)).toMatchObject({ total: 4, client: 3, team: 1, notSent: 1, notApproved: 1, noFootage: 1, notPosted: 0 });
    expect(fallbackReasonsSummary({ label: "This week", reasons })).toBe(
      'This week: 4 delays — 3 waited on clients, 1 was the team\'s. Clients: most often "Client not answering" (2). Team: most often "flow credits" (1).',
    );
    expect(fallbackReasonsSummary({ label: "October", reasons: [] })).toBe("October: no late reasons recorded.");
  });
});

describe("the client's WhatsApp update", () => {
  const input = {
    clientName: "Lakshmi", week: 2,
    live: [{ title: "Dasara wishes", type: "ai_video", links: ["https://instagram.com/p/abc"] }],
    coming: [{ title: "Bridal sets", type: "poster", day: "2026-10-27" }],
    waitingOnClient: [{ title: "Showroom tour", type: "real_video", since: "2026-10-20" }],
  };

  it("builds the lists in code — exact titles, links and days — in English and Telugu", () => {
    const en = fallbackClientUpdate(input);
    expect(en).toContain("Hello Lakshmi garu 🙏");
    expect(en).toContain("• Dasara wishes (video)\n  https://instagram.com/p/abc");
    expect(en).toContain("• Bridal sets (poster) — Tue 27 Oct");
    expect(en).toContain("• Showroom tour (real video) — please send the footage");
    expect(en.endsWith("— Dream Team Services")).toBe(true);
    const te = fallbackClientUpdate(input, "te");
    expect(te).toContain("నమస్కారం Lakshmi గారు");
    expect(te).toContain("• Bridal sets (పోస్టర్) — 27 Oct (మంగళ)");
    expect(te).toContain("https://instagram.com/p/abc");
  });

  it("keeps the AI's two lines only when clean: the right script, no link, no number but the week, no offer", () => {
    const good = { opening: "Hello Lakshmi garu, here is your week 2 update.", closing: "Please reply with your approval when you can. Thank you!" };
    expect(checkClientUpdateLines(JSON.stringify(good), input, "en")).toEqual(good);
    expect(checkClientUpdateLines(JSON.stringify({ ...good, opening: "Hello! 3 posts went live." }), input, "en")).toBeNull();
    expect(checkClientUpdateLines(JSON.stringify({ ...good, closing: "See www.example.com" }), input, "en")).toBeNull();
    expect(checkClientUpdateLines(JSON.stringify({ ...good, closing: "Ask us about our Diwali offer!" }), input, "en")).toBeNull();
    expect(checkClientUpdateLines(JSON.stringify(good), input, "te")).toBeNull();
    const te = { opening: "నమస్కారం Lakshmi గారు, వారం 2 అప్‌డేట్ ఇదిగో.", closing: "ధన్యవాదాలు!" };
    expect(checkClientUpdateLines(JSON.stringify(te), input, "te")).toEqual(te);
    expect(assembleClientUpdate(input, good, "en")).toContain("https://instagram.com/p/abc");
  });

  it("formats days the way people read them", () => {
    expect([dayLabel("2026-10-24"), dayLabelTe("2026-10-24"), dayLabel("not a day")]).toEqual(["Sat 24 Oct", "24 Oct (శని)", ""]);
  });
});

describe("the briefs' cache", () => {
  it("keys the week brief by the Monday of today's week, the morning brief by the day", () => {
    expect(mondayOf("2026-10-15")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(weekBriefCacheKey("ravi", "2026-10-18")).toBe("dts_smm_week_brief_ravi_2026-10-12");
    expect(morningBriefCacheKey("ravi", "2026-10-15")).toBe("dts_smm_morning_ravi_2026-10-15");
  });

  it("reads and writes without ever throwing, and clears the person's older entries", () => {
    const store = new Map<string, string>([["dts_smm_morning_ravi_2026-10-14", "{}"], ["dts_smm_morning_priya_2026-10-14", "{}"]]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k), key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
    writeBriefCache(storage, "dts_smm_morning_ravi_2026-10-15", { text: "Good morning.", usedAi: true }, "dts_smm_morning_ravi_");
    expect(readBriefCache(storage, "dts_smm_morning_ravi_2026-10-15")).toEqual({ text: "Good morning.", usedAi: true });
    expect([...store.keys()].sort()).toEqual(["dts_smm_morning_priya_2026-10-14", "dts_smm_morning_ravi_2026-10-15"]);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(readBriefCache(broken, "k")).toBeNull();
    expect(() => writeBriefCache(broken, "k", { text: "x", usedAi: true })).not.toThrow();
    expect(readBriefCache({ getItem: () => "not json", setItem: () => undefined }, "k")).toBeNull();
    expect(readBriefCache(null, "k")).toBeNull();
  });
});

describe("2027 festival dates (added for months that run into 2027)", () => {
  it("are the same festivals in the same shape, all in 2027, sorted — and the 2026 list keeps one entry per name", () => {
    const names2026 = new Set(FESTIVALS.map((f) => f.name));
    expect(FESTIVALS_2027.length).toBeGreaterThanOrEqual(60);
    expect(FESTIVALS_2027.every((f) => names2026.has(f.name) && f.date.startsWith("2027-") && !!f.cat)).toBe(true);
    expect([...FESTIVALS_2027.map((f) => f.date)].sort()).toEqual(FESTIVALS_2027.map((f) => f.date));
    // The sales dropdowns key their options by name — a second year must not repeat a name there.
    expect(new Set(FESTIVALS.map((f) => f.name)).size).toBe(FESTIVALS.length);
    expect(FESTIVAL_CALENDAR).toHaveLength(FESTIVALS.length + FESTIVALS_2027.length);
  });

  it("carry the Telugu states' dates", () => {
    const on = (name: string) => FESTIVALS_2027.find((f) => f.name === name)?.date;
    expect([on("Makar Sankranti"), on("Ugadi"), on("Ram Navami"), on("Ganesh Chaturthi"), on("Dussehra / Vijayadashami"), on("Diwali / Lakshmi Puja")])
      .toEqual(["2027-01-15", "2027-04-07", "2027-04-15", "2027-09-04", "2027-10-09", "2027-10-29"]);
  });

  it("reach the poster calendar (Bathukamma dated from 2027's Navratri) and the AI's weeks", () => {
    const cal = posterOccasionCalendar(2027);
    expect(cal.find((o) => o.name === "Makar Sankranti (Sankranthi)")?.date).toBe("2027-01-15");
    expect(cal.find((o) => o.name.startsWith("Bathukamma"))?.date).toBe("2027-09-29");
    expect(cal.find((o) => o.name === "Saddula Bathukamma")?.date).toBe("2027-10-07");
    // A month from 20 Dec 2026: week 4 is 10–19 Jan 2027, and Sankranthi lands on that week's poster.
    const m = lakshmi({ cycle: { month: "2026-12", startDate: "2026-12-20", endDate: "2027-01-20" } });
    const tasks = titleTasksOf(m, planMonth(m, { today: "2026-12-20", holidays: null }), { today: "2026-12-20" });
    const w4 = tasks.filter((t) => t.week === 4);
    expect(w4[0].festivals.map((f) => f.name)).toContain("Makar Sankranti (Sankranthi)");
    const out = fallbackTaskSuggestions(tasks);
    expect(out.find((s) => s.itemId === "s4")?.festival).toEqual({ name: "Makar Sankranti (Sankranthi)", date: "2027-01-15" });
  });
});

describe("the file stays alias-free (the phase-6 server may reuse the templates)", () => {
  it("imports nothing through @/", () => {
    const src = readFileSync(resolve(__dirname, "../utils/smmAiRules.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\//);
  });
});
