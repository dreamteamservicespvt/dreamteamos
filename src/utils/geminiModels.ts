/**
 * Which Gemini models the app asks, how hard each may think, what Google's errors mean, and what a member is
 * told when nothing can answer. Pure — the rotation that uses it is `services/geminiService.callWithFallback`.
 *
 * ── Why this exists (2026-10-10) ──────────────────────────────────────────────────────────────────
 * The owner: "sometimes prompts are not generating", with Google's raw
 * {"error":{"code":404,"message":"This model models/gemini-2.0-flash-lite is no longer available. …"}} on the
 * screen. Google shut gemini-2.0-flash and gemini-2.0-flash-lite down on 1 June 2026, but both were still in the
 * hard-coded list and asked again on every page load. Worse, the parallel calls of one ad run all moved ONE shared
 * "current model" pointer, so a call lost count of what it had tried, gave up while live models were left, and
 * showed whatever Google said last — on a busy free-tier day, a retired model's 404 or a 429's JSON. One "high
 * demand" answer also moved the whole session off gemini-2.5-flash for good, and a 429 whose retry delay happened
 * to contain the digits 404 retired a healthy model. The list, the reading of Google's errors and the messages now
 * live here, tested against the error bodies Google actually sent.
 */

/**
 * The models every Gemini call may use, best first. Each answered on the free tier with this project's keys on
 * 2026-10-10 (a live probe of every key and model):
 *  - gemini-2.5-flash — the model the pipeline's prompts and thinking budgets were tuned on (2026-09-29). Google
 *    has deprecated it and, since 2026-09-18, serves it only to projects that used it before: a newer key's
 *    project gets a 404 "no longer available to new users" and simply skips it (`not_for_key`).
 *  - gemini-3.8-flash, gemini-3.6-flash — the current Flash models, the successors Google names
 *    ("For any new projects, use … 3.5 Flash-Lite or 3.8 Flash").
 *  - gemini-3.5-flash-lite, gemini-2.5-flash-lite, gemini-3.1-flash-lite — the lite models: fastest, a step down
 *    in writing; reached only when every Flash model is used up or busy. (3.1 Flash-Lite shuts down 2027-05-07.)
 *  - gemini-flash-latest, gemini-flash-lite-latest — aliases Google keeps pointed at its current Flash and
 *    Flash-Lite (gemini-3.8-flash and gemini-3.5-flash-lite on 2026-10-10). They are never retired, so the list
 *    always ends on something alive, whatever Google shuts down next.
 * Not here: preview models (withdrawn without notice), and names Google already routes elsewhere
 * (gemini-3.5-flash → 3.6, gemini-3.7-flash → 3.8, gemini-3.1-flash-lite-preview → 3.1-flash-lite).
 */
export const GEMINI_MODELS: readonly string[] = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];

// ── How hard a call may think ────────────────────────────────────────────────────────────────────

/** fast — reading, formatting, splitting · standard — repairs, plans, frames · deep — writing and judging a script. */
export type Effort = 'fast' | 'standard' | 'deep';

/** What goes into a request's `thinkingConfig` (the SDK's own type is an enum; the API takes these strings). */
export interface GeminiThinking {
  thinkingBudget?: number;
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
}

/** gemini-2.5-flash takes a token budget (measured live on 2026-09-29: thinking was ~75% of a run's tokens). */
const THINKING_BUDGET: Record<Effort, number> = { fast: 0, standard: 768, deep: 1536 };
/**
 * The Gemini 3 Flash models take a level instead; gemini-2.5-flash answers a level with 400 "Thinking level is
 * not supported for this model" (live, 2026-10-10). Their own default is medium (3.8 / 3.6 Flash) — a call left
 * without one on a fallback model would think as long as 2.5 did before the 2026-09-29 speed work.
 */
const THINKING_LEVEL: Record<Effort, NonNullable<GeminiThinking['thinkingLevel']>> = { fast: 'MINIMAL', standard: 'LOW', deep: 'MEDIUM' };
/** …but gemini-3.8-flash has no MINIMAL ("Thinking level MINIMAL is not supported for this model", live 2026-10-10). */
const WITHOUT_MINIMAL = new Set(['gemini-3.8-flash', 'gemini-flash-latest']);

const takesBudget = (model: string) => /^gemini-2\.5-flash(?!-lite)/.test(model);
const takesLevel = (model: string) => /^gemini-3(\.\d+)?-flash(?!-lite)/.test(model) || model === 'gemini-flash-latest';

/**
 * The thinking setting for one call on one model, or undefined to leave the model's default. A call that names
 * no effort keeps the default, as before. The lite models get none: they already answer without (or with
 * minimal) thinking, and they are reached as fallbacks, where speed is the point.
 */
export const thinkingFor = (model: string, effort?: Effort): GeminiThinking | undefined => {
  if (!effort) return undefined;
  if (takesBudget(model)) return { thinkingBudget: THINKING_BUDGET[effort] };
  if (takesLevel(model)) {
    const level = THINKING_LEVEL[effort];
    return { thinkingLevel: level === 'MINIMAL' && WITHOUT_MINIMAL.has(model) ? 'LOW' : level };
  }
  return undefined;
};

// ── What Google's answer means ───────────────────────────────────────────────────────────────────

export type GeminiErrorKind =
  /** Google shut the model down — for every key (404 "This model models/x is no longer available"). */
  | 'retired'
  /** The model is not offered to this key's (newer) project (404 "… no longer available to new users"). */
  | 'not_for_key'
  /** The key itself is finished: invalid, expired, "reported as leaked", its project blocked. */
  | 'dead_key'
  /** 401 / 403 for this key on this model, the key otherwise alive. */
  | 'refused'
  /** 429: this key's requests for this model are used up — for a minute, or for the day. */
  | 'rate_limited'
  /** 5xx / "high demand": the model is overloaded for everybody right now. */
  | 'busy'
  /** 400: the model does not take the thinking setting that was sent. */
  | 'thinking_unsupported'
  /** 400: this model cannot do what the request asks ("… is not supported for this model"). */
  | 'model_cannot'
  /** The request never reached Google (offline, blocked). */
  | 'network'
  /** Anything else: the request itself is wrong, and no other key or model will help. */
  | 'fatal';

export interface GeminiErrorInfo {
  kind: GeminiErrorKind;
  /** The HTTP status, when Google answered. */
  status?: number;
  /** Google's own sentence (out of the JSON body), else the error's text. */
  message: string;
  /** rate_limited: how long Google asks to wait. */
  retryMs?: number;
  /** rate_limited: the day's free requests are gone (or the model has none on this project). */
  daily?: boolean;
  /** retired: the model Google says to use instead — for the console only. */
  successor?: string;
}

/** Google's error body: `{"error":{"code":404,"message":"…","status":"NOT_FOUND"}}`. */
interface GoogleErrorBody { error?: { code?: number; message?: string; status?: string } }

/** The JSON body inside an error's text — the SDK's message IS the body; older shapes put words before it. */
const bodyOf = (text: string): GoogleErrorBody | null => {
  const at = text.indexOf('{');
  if (at < 0) return null;
  try { return JSON.parse(text.slice(at)) as GoogleErrorBody; } catch { return null; }
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads one failed request. `model` is the model it asked — a 404 retires a model only when Google's sentence
 * names it, so a 404 about anything else (an endpoint, a file) can never put a healthy model away for a week.
 *
 * Only Google's status and its own words decide. The old checks searched the whole text for "404", "limit",
 * "invalid" and "500": a 429 whose retry delay read "14.404553s" retired a working model, and a 400 "invalid
 * argument" sent the request round every key.
 */
export const readGeminiError = (error: unknown, model = ''): GeminiErrorInfo => {
  const e = error as { message?: unknown; status?: unknown; statusCode?: unknown } | null | undefined;
  const text = String(e?.message ?? e ?? '');
  const body = bodyOf(text)?.error;
  const status = Number(e?.status ?? e?.statusCode ?? body?.code) || undefined;
  const code = String(body?.status ?? '');
  const message = String(body?.message ?? text).trim();
  const info = (kind: GeminiErrorKind, extra: Partial<GeminiErrorInfo> = {}): GeminiErrorInfo => ({ kind, status, message, ...extra });

  if (/API_KEY_INVALID|API key not valid|API_KEY_EXPIRED|API key expired|reported as leaked|SERVICE_DISABLED|has not been used in project|CONSUMER_SUSPENDED|has been suspended/i.test(text)) {
    return info('dead_key');
  }
  if (status === 400 && /thinking/i.test(message)) return info('thinking_unsupported');
  if (status === 404 || code === 'NOT_FOUND') {
    if (/new users/i.test(message)) return info('not_for_key');
    const namesTheModel = model
      ? new RegExp(`models/${escapeRegExp(model)}(?![\\w.-])`).test(message)
      : /models\/[\w.-]+/.test(message);
    if (namesTheModel) return info('retired', { successor: (message.match(/use models\/([\w.-]+)/i) || [])[1] });
    return info('model_cannot');
  }
  if (status === 429 || code === 'RESOURCE_EXHAUSTED') {
    const seconds = Number((text.match(/retry in ([\d.]+)\s*s/i) || text.match(/"retryDelay"\s*:\s*"([\d.]+)s"/) || [])[1]);
    return info('rate_limited', {
      retryMs: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : undefined,
      daily: /PerDay/i.test(text) || /limit:\s*0(?!\d)/.test(text),
    });
  }
  if (status === 401 || status === 403 || code === 'PERMISSION_DENIED' || code === 'UNAUTHENTICATED') return info('refused');
  if ((status !== undefined && status >= 500) || ['UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED'].includes(code)
    || (status === undefined && /overloaded|high demand/i.test(text))) {
    return info('busy');
  }
  if (status === 400 && /not supported|not enabled|unsupported/i.test(message) && /model/i.test(message)) return info('model_cannot');
  if (status === undefined && /failed to fetch|fetch failed|networkerror|network request failed|load failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(text)) {
    return info('network');
  }
  return info('fatal');
};

// ── Rests ────────────────────────────────────────────────────────────────────────────────────────

/**
 * When Google gives a project its daily free requests back: midnight Pacific time (12:30 PM in India while
 * California keeps summer time, 1:30 PM in winter). On the two days a year the clocks change it can be an hour
 * out — a call then asks one hour early (one failed request) or a remembered rest ends late, which the
 * "always ask at least once" rule in the call layer covers.
 */
export const nextQuotaReset = (now: number): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const sinceMidnight = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 + (now % 1000);
  return now - sinceMidnight + 24 * 3600 * 1000;
};

/**
 * How long a key rests from a model after a 429: until the daily reset when the day's requests are gone, else
 * the seconds Google asks for (2 s – 2 min; a minute when it names none).
 */
export const restAfter = (info: GeminiErrorInfo, now: number): number =>
  info.daily ? nextQuotaReset(now) - now : Math.min(Math.max(info.retryMs ?? 60_000, 2_000), 120_000);

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "41s", "12 min", "until 12:30 PM" — for the console. */
export const describeRest = (ms: number, now: number, formatTime: (ms: number) => string = clockTime): string =>
  ms < 90_000 ? `${Math.ceil(ms / 1000)}s` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `until ${formatTime(now + ms)}`;

// ── When nothing can answer ──────────────────────────────────────────────────────────────────────

export type GeminiUnavailableReason = 'no_keys' | 'no_models' | 'daily_limit' | 'rate_limit' | 'busy' | 'network' | 'unknown';

/**
 * Thrown when no key and model could answer a call. Its message is a sentence a member can act on, never
 * Google's JSON; the retry loops around a call stop on it (asking again a second later cannot help).
 */
export class GeminiUnavailableError extends Error {
  readonly reason: GeminiUnavailableReason;
  constructor(message: string, reason: GeminiUnavailableReason) {
    super(message);
    this.name = 'GeminiUnavailableError';
    this.reason = reason;
  }
}

export interface GeminiFailure {
  /** What Google answered to each request of the call, in order. */
  errors: GeminiErrorInfo[];
  /** Keys not known to be dead, of all keys. */
  workingKeys: number;
  totalKeys: number;
  /** Models not retired, of the list. */
  liveModels: number;
  models: readonly string[];
  now: number;
}

/** The error a call ends with when nothing could answer. */
export const geminiUnavailable = (f: GeminiFailure, formatTime: (ms: number) => string = clockTime): GeminiUnavailableError => {
  const saw = (kind: GeminiErrorKind) => f.errors.some(e => e.kind === kind);
  const keys = `${f.workingKeys} working API key${f.workingKeys === 1 ? '' : 's'}`;
  if (f.workingKeys === 0) {
    return new GeminiUnavailableError(
      `None of the ${f.totalKeys} Gemini API keys work any more — Google says they are invalid or were reported as leaked. `
      + `Put new keys in Vercel → Settings → Environment Variables (API_KEY_1, API_KEY_2, …) and redeploy.`, 'no_keys');
  }
  if (f.liveModels === 0) {
    return new GeminiUnavailableError(
      `Google has retired every Gemini model this app knows (${f.models.join(', ')}). The model list in `
      + `src/utils/geminiModels.ts needs updating.`, 'no_models');
  }
  if (f.errors.some(e => e.kind === 'rate_limited' && e.daily)) {
    return new GeminiUnavailableError(
      `Gemini's free daily limit is used up on all ${keys}, for every model the app can use. It resets at `
      + `${formatTime(nextQuotaReset(f.now))} (Google resets it at midnight Pacific time). Try again then, or add more API keys.`,
      'daily_limit');
  }
  if (saw('rate_limited') || saw('refused')) {
    return new GeminiUnavailableError(
      `Gemini is getting more requests than the free tier allows right now, on all ${keys} and every model. `
      + `Wait a minute and try again.`, 'rate_limit');
  }
  if (saw('busy')) {
    return new GeminiUnavailableError(
      `Google's Gemini servers are overloaded right now ("high demand") on every model the app can use. Wait a minute and try again.`,
      'busy');
  }
  if (saw('network')) {
    return new GeminiUnavailableError(
      `Could not reach Google's Gemini servers. Check the internet connection and try again.`, 'network');
  }
  const last = f.errors[f.errors.length - 1];
  return new GeminiUnavailableError(
    last ? `Gemini could not answer: ${last.message}` : `None of the ${keys} can use any of the Gemini models this app knows.`,
    'unknown');
};
