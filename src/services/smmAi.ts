/**
 * SMM Delivery Control — the AI layer (2026-10-15, phase 5 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── What it does ────────────────────────────────────────────────────────────────────────────────
 *   • `suggestWeekTasks`  — a title, idea, caption + hashtags draft for each piece of a client's month (and a
 *     festival from that piece's own week); a PERSON accepts them (`AiTitlesPanel` → the page's onAccept →
 *     `services/smmDelivery.acceptPlanSuggestions`). The weekly rules have already fixed every count, week and
 *     deadline; the AI never sets or moves one.
 *   • `memberWeekBrief`   — "6 tasks across 3 clients — do Lakshmi's video first, send it by Sat 24 Oct";
 *     once per person per calendar week (localStorage).
 *   • `morningBrief`      — the person's morning in two or three sentences; once per person per day.
 *   • `reasonsSummary`    — the late reasons: client delays vs team delays.
 *   • `clientWeeklyUpdate`— a WhatsApp draft for the salesperson to copy: the AI writes the opening and the
 *     closing; the lists of posts, links and days are code (so no link or day can be wrong).
 *
 * ── Why it never throws and never blocks ────────────────────────────────────────────────────────
 * 11 of the 30 Gemini keys were dead on 2026-10-10 and the free tier refuses calls on a busy day. Every
 * function here returns `{ …, usedAi, problem? }`: when Gemini fails, is slow (a time limit below) or answers
 * something the checks in `utils/smmAiRules` throw away, the plain template / the blank titles come back
 * instead, with `problem` saying why in a sentence. Alerts and the rules never wait for any of it.
 *
 * ── Why it is loaded lazily ─────────────────────────────────────────────────────────────────────
 * It imports `geminiService` (the largest chunk in the build, ≈850 KB). Nothing imports this file eagerly: the
 * Delivery Control parts (`components/smm/control/ai/*`) `import()` it on first use, so the classic Social
 * Media pages — and Delivery Control itself until an AI part runs — never download Gemini.
 *
 * Every Gemini call goes through `callGeminiWithFallback` (the one key / model rotation, `ai-ads.md` §17.3)
 * and states its effort: the titles are `standard` (they are written, not read); the briefs, the reasons
 * summary and the client lines are `fast` (they only put given facts into sentences).
 */
import { callGeminiWithFallback } from "@/services/geminiService";
import type { Effort } from "@/utils/geminiModels";
import {
  SMM_CLIENT_UPDATE_SYSTEM_PROMPT, SMM_BRIEF_SYSTEM_PROMPT, SMM_TITLES_SYSTEM_PROMPT,
  clientUpdatePrompt, memberWeekBriefPrompt, morningBriefPrompt, reasonsSummaryPrompt, smmTitlesUserPrompt,
} from "@/services/prompts/smmDelivery";
import {
  assembleClientUpdate, checkClientUpdateLines, dayLabel, extractJson, factsOfMonth, fallbackClientUpdate,
  fallbackMorningBrief, fallbackReasonsSummary, fallbackTaskSuggestions, fallbackWeekBrief, fillBrief, fingerprint,
  mergeSuggestions, monthTitlesToAvoid, morningBriefCacheKey, morningBriefCachePrefix, morningPhrases, numbersInMaterial,
  orderBriefTasks, parseTaskSuggestions, readBriefCache, reasonsNumbers, stepWords, titleTasksOf,
  weekBriefCacheKey, weekBriefCachePrefix, weekBriefNumbers, writeBriefCache,
  type ClientWeeklyUpdateInput, type MemberWeekBriefInput, type MorningBriefInput, type ReasonsSummaryInput,
  type SmmTaskSuggestion, type SmmTitleTask,
} from "@/utils/smmAiRules";
import { ownDaysOf, type SmmDeliveryMonth, type SmmMonthPlan } from "@/utils/smmCadence";

export type { SmmTaskSuggestion } from "@/utils/smmAiRules";

/* ── One Gemini request, with a time limit ───────────────────────────────────────────────────────── */

/** How long a screen waits before it shows the plain text instead (the call layer itself may wait 75 s). */
export const SMM_AI_TIMEOUT_MS = { titles: 75_000, brief: 40_000 } as const;

class SmmAiTimeout extends Error {
  constructor() {
    super("Gemini took too long to answer.");
    this.name = "SmmAiTimeout";
  }
}

async function askGemini(system: string, text: string, effort: Effort, timeoutMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SmmAiTimeout()), timeoutMs);
  });
  try {
    const response = await Promise.race([
      callGeminiWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
        config: { systemInstruction: system, responseMimeType: "application/json" },
      }), { effort }),
      timeout,
    ]);
    return response?.text || "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The sentence a person reads when the AI did not answer — the call layer's own (it is always a sentence). */
export function problemOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return "Gemini did not answer.";
  if (/No API keys configured/i.test(msg)) return "Gemini is not set up on this site (no API keys).";
  return msg.length > 240 ? `${msg.slice(0, 237)}…` : msg;
}

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * A brief that failed is not asked again for ten minutes in this tab (every page change would otherwise
 * re-ask a Gemini that is down); a refresh asks anyway.
 */
const FAILED_FOR_MS = 10 * 60_000;
const failedAt = new Map<string, number>();
const recentlyFailed = (key: string) => (failedAt.get(key) ?? 0) > Date.now() - FAILED_FOR_MS;

/** The summaries' answers for this session, by their input — the same input is not asked twice. */
const memo = new Map<string, { text: string; usedAi: boolean }>();

/* ── Titles, ideas, captions ─────────────────────────────────────────────────────────────────────── */

/** Pieces per Gemini request: a week's pieces stay together (its festivals), requests run side by side. */
const TITLES_PER_REQUEST = 12;

function chunkByWeek(tasks: readonly SmmTitleTask[]): SmmTitleTask[][] {
  const weeks = new Map<string, SmmTitleTask[]>();
  for (const t of tasks) {
    const k = String(t.week ?? "none");
    weeks.set(k, [...(weeks.get(k) || []), t]);
  }
  const chunks: SmmTitleTask[][] = [];
  let current: SmmTitleTask[] = [];
  for (const group of weeks.values()) {
    if (current.length && current.length + group.length > TITLES_PER_REQUEST) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export interface SuggestWeekTasksInput {
  month: SmmDeliveryMonth;
  plan: SmmMonthPlan;
  /** Only these pieces (the next week's list at a week start); else every piece not live yet. */
  itemIds?: string[];
  /** The client's last two months' titles (`smmAiRules.pastTitlesOf` over `smm.fetchClientMonths`). */
  pastTitles: string[];
  /** yyyy-MM-dd, India time. */
  today: string;
}

/**
 * Suggestions for the month's pieces. Never throws: on any failure every asked piece comes back with blank
 * texts (left for a person) and the week's festival where there is one, `usedAi: false` and the reason.
 */
export async function suggestWeekTasks(input: SuggestWeekTasksInput): Promise<{ suggestions: SmmTaskSuggestion[]; usedAi: boolean; problem?: string }> {
  let tasks: SmmTitleTask[] = [];
  try {
    tasks = titleTasksOf(input.month, input.plan, { today: input.today, itemIds: input.itemIds });
  } catch (err) {
    console.warn("SMM AI: the month could not be read for titles.", err);
    return { suggestions: [], usedAi: false, problem: "This month's plan could not be read." };
  }
  if (!tasks.length) return { suggestions: [], usedAi: false };
  try {
    const facts = factsOfMonth(input.month);
    const avoid = [...(input.pastTitles || []), ...monthTitlesToAvoid(input.month, tasks.map((t) => t.itemId))];
    const own = ownDaysOf(input.month.cycle);
    const prompt = (chunk: SmmTitleTask[]) => smmTitlesUserPrompt({
      businessName: input.month.businessName || input.month.clientName,
      clientName: input.month.clientName,
      platforms: input.month.platforms,
      monthStart: own?.start ?? null,
      monthEnd: own?.lastDay ?? null,
      tasks: chunk,
      avoid,
      teamNotes: facts.text,
    });
    const answers = await Promise.allSettled(chunkByWeek(tasks).map(async (chunk) => {
      const reply = await askGemini(SMM_TITLES_SYSTEM_PROMPT, prompt(chunk), "standard", SMM_AI_TIMEOUT_MS.titles);
      const parsed = parseTaskSuggestions(reply, { tasks: chunk, pastTitles: avoid, facts, today: input.today });
      if (parsed.dropped.length) console.info("SMM AI: parts of the titles answer were not used:", parsed.dropped);
      return parsed.suggestions;
    }));
    const ai = answers.flatMap((a) => (a.status === "fulfilled" ? a.value : []));
    const failed = answers.find((a): a is PromiseRejectedResult => a.status === "rejected");
    if (!ai.length) {
      return {
        suggestions: fallbackTaskSuggestions(tasks),
        usedAi: false,
        problem: failed ? problemOf(failed.reason) : "Gemini's answer could not be used.",
      };
    }
    const merged = mergeSuggestions(tasks, ai);
    return {
      suggestions: merged.suggestions,
      usedAi: true,
      problem: merged.answered < tasks.length
        ? `Gemini wrote ${merged.answered} of ${tasks.length} — the rest are left blank for you.${failed ? ` (${problemOf(failed.reason)})` : ""}`
        : undefined,
    };
  } catch (err) {
    console.warn("SMM AI: titles fell back to blank.", err);
    return { suggestions: fallbackTaskSuggestions(tasks), usedAi: false, problem: problemOf(err) };
  }
}

/* ── Briefs ──────────────────────────────────────────────────────────────────────────────────────── */

export interface SmmBriefResult {
  text: string;
  usedAi: boolean;
  problem?: string;
}

/** Options every brief takes: `fresh` ignores the cache and the ten-minute failure pause (the refresh button). */
export interface SmmBriefOptions {
  fresh?: boolean;
}

/**
 * The member's week across all their clients — the rules' order (late, due today, behind a checkpoint,
 * then by day), the AI's sentences, the code's counts. Cached once per person per calendar week.
 */
export async function memberWeekBrief(input: MemberWeekBriefInput, opts: SmmBriefOptions = {}): Promise<SmmBriefResult> {
  let plain = "";
  try {
    plain = fallbackWeekBrief(input);
    const key = weekBriefCacheKey(input.uid, input.today);
    if (!opts.fresh) {
      const cached = readBriefCache(storage(), key);
      if (cached) return cached;
      if (recentlyFailed(key)) return { text: plain, usedAi: false };
    }
    const ordered = orderBriefTasks(input.tasks);
    if (!ordered.length) return { text: plain, usedAi: false };
    const values = weekBriefNumbers(input);
    const material = ordered.flatMap((t) => [t.clientName, t.title, dayLabel(t.deadlineDay), dayLabel(t.nextDay ?? null), stepWords(t.nextStep)]);
    try {
      const reply = await askGemini(SMM_BRIEF_SYSTEM_PROMPT, memberWeekBriefPrompt(input, ordered, values), "fast", SMM_AI_TIMEOUT_MS.brief);
      const json = extractJson(reply) as { text?: unknown } | null;
      const filled = fillBrief(json?.text, values, { allowNumbers: numbersInMaterial(material), requireAny: true, mustMention: ordered[0].clientName });
      if (filled.text) {
        const result = { text: filled.text, usedAi: true };
        writeBriefCache(storage(), key, result, weekBriefCachePrefix(input.uid));
        failedAt.delete(key);
        return result;
      }
      console.info(`SMM AI: the week brief was not used — ${filled.problem}.`);
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: "Gemini's brief could not be used." };
    } catch (err) {
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: problemOf(err) };
    }
  } catch (err) {
    console.warn("SMM AI: the week brief fell back to plain.", err);
    return { text: plain || "Your week's tasks are below.", usedAi: false, problem: problemOf(err) };
  }
}

/** The person's morning: counts by code, sentences by the AI. Cached once per person per day. */
export async function morningBrief(input: MorningBriefInput, opts: SmmBriefOptions = {}): Promise<SmmBriefResult> {
  let plain = "";
  try {
    plain = fallbackMorningBrief(input);
    const key = morningBriefCacheKey(input.uid, input.today);
    if (!opts.fresh) {
      const cached = readBriefCache(storage(), key);
      if (cached) return cached;
      if (recentlyFailed(key)) return { text: plain, usedAi: false };
    }
    const phrases = morningPhrases(input.numbers || {});
    const values: Record<string, number> = Object.fromEntries(phrases.map((p) => [p.key, p.n]));
    try {
      const reply = await askGemini(SMM_BRIEF_SYSTEM_PROMPT, morningBriefPrompt(input, phrases), "fast", SMM_AI_TIMEOUT_MS.brief);
      const json = extractJson(reply) as { text?: unknown } | null;
      const filled = fillBrief(json?.text, values, { allowNumbers: numbersInMaterial([...(input.top || []), dayLabel(input.today)]), requireAny: true });
      if (filled.text) {
        const result = { text: filled.text, usedAi: true };
        writeBriefCache(storage(), key, result, morningBriefCachePrefix(input.uid));
        failedAt.delete(key);
        return result;
      }
      console.info(`SMM AI: the morning brief was not used — ${filled.problem}.`);
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: "Gemini's brief could not be used." };
    } catch (err) {
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: problemOf(err) };
    }
  } catch (err) {
    console.warn("SMM AI: the morning brief fell back to plain.", err);
    return { text: plain || "Good morning.", usedAi: false, problem: problemOf(err) };
  }
}

/** Client delays vs team delays, in two or three sentences (remembered for this session by its input). */
export async function reasonsSummary(input: ReasonsSummaryInput, opts: SmmBriefOptions = {}): Promise<SmmBriefResult> {
  let plain = "";
  try {
    plain = fallbackReasonsSummary(input);
    const reasons = Array.isArray(input?.reasons) ? input.reasons : [];
    if (!reasons.length) return { text: plain, usedAi: false };
    const key = `reasons:${fingerprint(input)}`;
    if (!opts.fresh) {
      const known = memo.get(key);
      if (known) return known;
      if (recentlyFailed(key)) return { text: plain, usedAi: false };
    }
    const values = reasonsNumbers(reasons);
    const material = reasons.flatMap((r) => [r.clientName, r.reason, r.note, r.byName]).concat(input.label);
    try {
      const reply = await askGemini(SMM_BRIEF_SYSTEM_PROMPT, reasonsSummaryPrompt(input, values), "fast", SMM_AI_TIMEOUT_MS.brief);
      const json = extractJson(reply) as { text?: unknown } | null;
      const filled = fillBrief(json?.text, values, { allowNumbers: numbersInMaterial(material), requireAny: true, max: 480 });
      if (filled.text) {
        const result = { text: filled.text, usedAi: true };
        memo.set(key, result);
        failedAt.delete(key);
        return result;
      }
      console.info(`SMM AI: the reasons summary was not used — ${filled.problem}.`);
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: "Gemini's summary could not be used." };
    } catch (err) {
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: problemOf(err) };
    }
  } catch (err) {
    console.warn("SMM AI: the reasons summary fell back to plain.", err);
    return { text: plain || "The late reasons are listed below.", usedAi: false, problem: problemOf(err) };
  }
}

/**
 * The client's weekly WhatsApp draft: the AI's opening and closing (in English or Telugu) around the
 * code's lists. Plain template when the AI fails or writes a link, a number, an offer or the wrong script.
 */
export async function clientWeeklyUpdate(input: ClientWeeklyUpdateInput, opts: SmmBriefOptions = {}): Promise<SmmBriefResult> {
  const language = input?.language === "te" ? "te" : "en";
  let plain = "";
  try {
    plain = fallbackClientUpdate(input, language);
    const key = `client:${language}:${fingerprint(input)}`;
    if (!opts.fresh) {
      const known = memo.get(key);
      if (known) return known;
      if (recentlyFailed(key)) return { text: plain, usedAi: false };
    }
    try {
      const reply = await askGemini(SMM_CLIENT_UPDATE_SYSTEM_PROMPT, clientUpdatePrompt(input, language), "fast", SMM_AI_TIMEOUT_MS.brief);
      const lines = checkClientUpdateLines(reply, input, language);
      if (lines) {
        const result = { text: assembleClientUpdate(input, lines, language), usedAi: true };
        memo.set(key, result);
        failedAt.delete(key);
        return result;
      }
      console.info("SMM AI: the client update's lines were not used (a link, a number, an offer or the wrong script).");
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: "Gemini's lines could not be used." };
    } catch (err) {
      failedAt.set(key, Date.now());
      return { text: plain, usedAi: false, problem: problemOf(err) };
    }
  } catch (err) {
    console.warn("SMM AI: the client update fell back to plain.", err);
    return { text: plain || "Hello! Here is this week's update.", usedAi: false, problem: problemOf(err) };
  }
}

/** For tests: forget the session memo and the failure pauses. */
export function resetSmmAiMemo(): void {
  memo.clear();
  failedAt.clear();
}
