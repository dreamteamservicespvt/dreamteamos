/**
 * SMM Delivery Control — the AI layer's prompts (2026-10-15, phase 5; `.claude/rules/smm.md` §9.9).
 *
 * ── What these prompts may and may not do ───────────────────────────────────────────────────────
 * The weekly rules (`utils/smmCadence`) fix every count, week and deadline; the AI writes WORDS only:
 *   • the titles prompt — a title, the idea, a caption and hashtags per piece, and (optionally) one of the
 *     festivals listed for that piece's own week;
 *   • the brief prompts — a member's week, a person's morning, a reasons summary — sentences around
 *     placeholders ({late}) that code fills, so a count can never be wrong;
 *   • the client update prompt — only the opening and closing lines of a WhatsApp message; the lists of
 *     posts, links and days between them are built by code.
 * Every answer is JSON and is checked in `utils/smmAiRules` (caps, facts, repeats, festival placement,
 * numbers) — a prompt asking nicely is not a guarantee; the check is.
 *
 * ── Who reads the output ────────────────────────────────────────────────────────────────────────
 * The team at Dream Team Services (Kakinada, Andhra Pradesh) and its clients: small local businesses in
 * Andhra Pradesh and Telangana. Plain English for the team; the client message in English or Telugu.
 */
import {
  SMM_AI_LIMITS, dayLabel, stepWords, typeMetaOf,
  type ClientWeeklyUpdateInput, type MemberWeekBriefInput, type MorningBriefInput, type ReasonsSummaryInput,
  type SmmBriefTask, type SmmTitleTask,
} from "@/utils/smmAiRules";

/* ── Titles, ideas, captions ─────────────────────────────────────────────────────────────────────── */

export const SMM_TITLES_SYSTEM_PROMPT = `You plan social media posts for small local businesses in Andhra Pradesh and Telangana (Telugu-speaking South India). You work for Dream Team Services, the digital-marketing agency that makes and posts them.

For EACH task you are given, write:
- "title": what the team sees on its board — at most ${SMM_AI_LIMITS.title} characters, plain English, specific to this business, no hashtags, no emoji, no quotes.
- "idea": one or two sentences (at most ${SMM_AI_LIMITS.idea} characters) — what the piece shows and its one message, so a team member can make it.
- "caption": the caption ready to post (at most ${SMM_AI_LIMITS.caption} characters) — warm, simple English; for a festival greeting you may add ONE short Telugu line in Telugu script. No hashtags inside the caption.
- "hashtags": up to ${SMM_AI_LIMITS.hashtags} hashtags, each starting with #, no spaces.
- "festival": null, or one festival copied EXACTLY (name and date) from that task's own FESTIVALS list.

RULES — follow every one:
1. Use only what you are told about the business: its name and the notes the team wrote. Work out the kind of business from those; if it is unclear, keep the ideas about the business itself (its service, its people, why customers trust it, visiting it).
2. NEVER invent offers, discounts, "free" anything, sales, prices, percentages, phone numbers, addresses, a town, city or area (not in hashtags either — you do not know where the business is), years in business, awards, customer counts, ratings or any other number or claim. If the notes give an offer, a place or a number, you may use exactly that and nothing more.
3. Do not reuse any title listed under AVOID, and do not give two tasks the same title or the same idea.
4. Kinds: "AI video" = an AI-made video ad of the given length (a presenter or scenes); "Poster" = one designed image; "Real video" = a video the client films at their own place — say what to film; "Extra" = extra work the client asked for — follow its notes.
5. Festivals: theme a task for a festival ONLY when that task lists it, use each festival at most once in your whole answer, and give it to the best-fitting task of that week (usually a poster or a video). Leave every other task about the business. A task marked "fixed date" takes no festival.
6. Do not move, schedule or count anything — the dates and the number of tasks are already decided.
7. Answer with JSON only, exactly this shape, one entry per task, using each task's itemId:
{"tasks":[{"itemId":"…","title":"…","idea":"…","caption":"…","hashtags":["#…"],"festival":{"name":"…","date":"yyyy-MM-dd"}}]}
Use "festival": null when the task gets no festival.`;

export interface SmmTitlesPromptInput {
  businessName: string;
  clientName?: string | null;
  platforms?: readonly string[] | null;
  monthStart?: string | null;
  monthEnd?: string | null;
  tasks: readonly SmmTitleTask[];
  avoid: readonly string[];
  /** Everything the team typed on the month (titles and notes) — the facts the model may use. */
  teamNotes?: string | null;
}

const taskLine = (t: SmmTitleTask): string => {
  const meta = typeMetaOf(t.type);
  const parts = [
    `- itemId: ${t.itemId}`,
    `  kind: ${meta.label}${t.type === "ai_video" && t.clips ? ` (${t.clips} clips, about ${t.clips * 8} seconds)` : ""}`,
    `  week: ${t.week ? `${t.week} (${dayLabel(t.weekStart)} – ${dayLabel(t.weekEnd)})` : "outside the weekly count"}`,
    t.deadlineDay ? `  due: ${dayLabel(t.deadlineDay)}${t.fixed ? ` (fixed date — ${t.fixed === "extra" ? "extra work" : t.fixed === "festival" ? "a festival post" : "the client asked for it"})` : ""}` : "",
    t.postDay ? `  planned post day: ${dayLabel(t.postDay)}` : "",
    t.currentTitle ? `  current title: ${t.currentTitle}` : "",
    t.notes ? `  notes from the team: ${t.notes}` : "",
    `  FESTIVALS: ${t.fixed ? "none (fixed date)" : t.festivals.length ? t.festivals.map((f) => `${f.name} (${f.date})`).join("; ") : "none"}`,
  ];
  return parts.filter(Boolean).join("\n");
};

export function smmTitlesUserPrompt(input: SmmTitlesPromptInput): string {
  const lines = [
    `BUSINESS: ${input.businessName || "the client's business"}${input.clientName && input.clientName !== input.businessName ? ` (owner / contact: ${input.clientName})` : ""}`,
    input.platforms?.length ? `ACCOUNTS: ${input.platforms.join(", ")}` : "",
    input.monthStart && input.monthEnd ? `THIS MONTH: ${dayLabel(input.monthStart)} – ${dayLabel(input.monthEnd)}` : "",
    "",
    `WHAT THE TEAM WROTE ABOUT THIS MONTH (the only facts you may use):\n${(input.teamNotes || "").trim() || "(nothing yet — use the business name only)"}`,
    "",
    `AVOID — titles this client already had (do not repeat them):\n${input.avoid.length ? input.avoid.map((t) => `- ${t}`).join("\n") : "(none)"}`,
    "",
    `TASKS (${input.tasks.length}):`,
    ...input.tasks.map(taskLine),
    "",
    "Write the JSON now.",
  ];
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/* ── Briefs: sentences around placeholders ───────────────────────────────────────────────────────── */

export const SMM_BRIEF_SYSTEM_PROMPT = `You write short, friendly, practical work briefs for the social media team of Dream Team Services, a digital-marketing agency in Andhra Pradesh, India.

RULES:
1. Every count MUST be written as its placeholder in curly braces, exactly as listed (for example {late}). Never write a count yourself, in digits or in words. The app fills the placeholders in.
   Each placeholder IS a number (its value is shown beside it): put it straight before its noun — "{late} late", "{dueToday} due today", "{team} of them the team's" — and make the words agree with that value ("1 task", "2 tasks"; "1 delay was", "2 delays were"). Never write "which is {late}". Leave out a count whose value is 0 unless saying "nothing is late" helps.
2. You may copy a day such as "Sat 24 Oct" or a client's name exactly as given. Do not invent any other number, date, task or name.
3. Start with what matters most. Plain English, no emoji, no markdown, no bullet points, at most 3 sentences and about 300 characters.
4. Answer with JSON only: {"text":"…"}`;

const briefTaskLine = (t: SmmBriefTask, i: number): string => {
  const meta = typeMetaOf(t.type);
  const when = t.nextStep && t.nextDay ? `next: ${stepWords(t.nextStep)} by ${dayLabel(t.nextDay)}` : t.deadlineDay ? `due ${dayLabel(t.deadlineDay)}` : "";
  return `${i + 1}. ${t.clientName} — ${meta.label}${t.title ? ` "${t.title}"` : ""} — ${t.state.replace(/_/g, " ")}${when ? ` — ${when}` : ""}`;
};

/** The member's week. `ordered` is the rules' order (most urgent first); the brief must start with the first. */
export function memberWeekBriefPrompt(input: MemberWeekBriefInput, ordered: readonly SmmBriefTask[], values: Record<string, number>): string {
  return [
    `Write ${input.name || "the member"}'s brief for this week (today is ${dayLabel(input.today)}).`,
    "",
    "PLACEHOLDERS (use them for every count):",
    `{tasks} = ${values.tasks} tasks still to do this week`,
    `{clients} = ${values.clients} clients those tasks are for`,
    `{late} = ${values.late} already late`,
    `{dueToday} = ${values.dueToday} due today`,
    `{waiting} = ${values.waiting} waiting on the client`,
    "",
    "THE TASKS, most urgent first (the order is decided — tell them to start with task 1 and name its client):",
    ...ordered.slice(0, 12).map(briefTaskLine),
    ordered.length > 12 ? `… and ${ordered.length - 12} more` : "",
    "",
    'Example shape: "{tasks} tasks across {clients} clients this week — do Lakshmi\'s video first and send it by Sat 24 Oct. {late} already late."',
  ].filter((l) => l !== "" || true).join("\n");
}

const ROLE_WORDS: Record<string, string> = {
  tech_member: "a team member who makes and posts the content",
  tech_team_leader: "a tech team leader who watches everyone's work",
  tech_admin: "the tech admin who runs production",
  main_admin: "the owner",
  sales_member: "a salesperson who gets client approvals and footage, bills extra work and renews clients",
  sales_admin: "the sales admin",
};

/** A person's morning: their counts as placeholders, and the most urgent items as given. */
export function morningBriefPrompt(input: MorningBriefInput, phrases: readonly { key: string; n: number; phrase: string }[]): string {
  const role = ROLE_WORDS[input.role] || input.role || "a team member";
  return [
    `Write ${input.name || "the person"}'s morning brief for ${dayLabel(input.today)}. They are ${role}.`,
    "",
    "PLACEHOLDERS (use them for every count):",
    ...(phrases.length ? phrases.map((p) => `{${p.key}} = ${p.n} (${p.phrase.replace(/^\d+\s*/, "")})`) : ["(nothing is late or due — say so)"]),
    "",
    input.top?.length ? `MOST URGENT (copy as given):\n${input.top.slice(0, 5).map((t) => `- ${t}`).join("\n")}` : "",
    "",
    "Begin with a short good-morning by first name, then what matters most first (anything late, then due today), then where to start.",
  ].join("\n");
}

/** A summary of the late reasons: client delays vs team delays. */
export function reasonsSummaryPrompt(input: ReasonsSummaryInput, values: Record<string, number>): string {
  return [
    `Summarise why work was late in "${input.label}" for the admins, in two or three sentences: how many delays were the CLIENTS' (approval or footage late) and how many the TEAM's (not sent, not posted), the most common reasons on each side, and one practical next step. Fair and factual — no blame words.`,
    "",
    "PLACEHOLDERS (use them for every count):",
    `{total} = ${values.total} late reasons`,
    `{client} = ${values.client} the clients' delays`,
    `{team} = ${values.team} the team's delays`,
    `{notSent} = ${values.notSent} not sent to the client in time`,
    `{notApproved} = ${values.notApproved} approval late`,
    `{noFootage} = ${values.noFootage} footage late`,
    `{notPosted} = ${values.notPosted} approved but not posted`,
    "",
    "THE REASONS:",
    ...input.reasons.slice(0, 40).map((r) => `- ${r.clientName} · ${typeMetaOf(r.type).label} · missed: ${r.step} · "${r.reason}"${r.note ? ` (${r.note})` : ""} · by ${r.byName}`),
  ].join("\n");
}

/* ── The client's WhatsApp update: two lines only ────────────────────────────────────────────────── */

export const SMM_CLIENT_UPDATE_SYSTEM_PROMPT = `You write the opening and closing lines of a short weekly WhatsApp update that Dream Team Services, a digital-marketing agency in Andhra Pradesh, sends to its social media clients — small local business owners.

RULES:
1. The app puts the list of this week's posts, links and days BETWEEN your two lines. Do not write any list, title, link, number, date or price yourself — the only number you may write is the week number given.
2. Polite and warm, the way a Telugu business is addressed: the client's name with "garu" (in Telugu script: "గారు"). Short: the opening at most ${SMM_AI_LIMITS.opening} characters, the closing at most ${SMM_AI_LIMITS.closing}.
3. No promises, no offers, no sales talk.
4. Answer with JSON only: {"opening":"…","closing":"…"}`;

export function clientUpdatePrompt(input: ClientWeeklyUpdateInput, language: "en" | "te"): string {
  const waiting = input.waitingOnClient?.length || 0;
  return [
    `CLIENT: ${input.clientName || "the client"}`,
    `WEEK: ${input.week}`,
    `LANGUAGE: ${language === "te" ? "Telugu — write both lines in Telugu script (simple everyday Telugu; words like video, poster, approval may stay in English letters)" : "English"}`,
    `THIS WEEK: ${input.live?.length || 0 ? "some posts went live" : "nothing went live yet"}; ${input.coming?.length ? "more are coming" : "nothing else is scheduled"}; ${waiting ? "we are WAITING ON THE CLIENT for approval or footage — the closing line must politely ask them to reply" : "nothing is waiting on the client"}.`,
    "",
    "Opening: greet them by name and say this is this week's update. Closing: thank them (and, if we are waiting on them, ask them kindly to reply).",
  ].join("\n");
}
