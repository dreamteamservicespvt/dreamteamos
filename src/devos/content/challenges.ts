/**
 * Weekly practical challenges (MSRS §7, FR-031, FR-045): role-specific work done on the job (or a realistic
 * simulation), submitted as structured evidence and graded against a rubric by two AI judges. Completion needs the
 * evidence — an AI's say-so is never enough (FR-031): required fields, links and checklists are checked in code first.
 */
import type { DimensionId, EvidenceRequirement, RubricCriterion, TrackId } from "../core/types.js";

export interface ChallengeDef {
  id: string;
  track: TrackId;
  title: string;
  dims: DimensionId[];
  brief: string;
  evidence: EvidenceRequirement[];
  criteria: RubricCriterion[];
  exemplar: string;
}

const C = (id: string, label: string, weight: number, a0: string, a2: string, a4: string, critical = false): RubricCriterion =>
  ({ id, label, weight, anchors: { 0: a0, 2: a2, 4: a4 }, ...(critical ? { critical: true } : {}) });
const T = (id: string, label: string, hint?: string): EvidenceRequirement => ({ id, kind: "text", label, required: true, hint });
const L = (id: string, label: string, required = false): EvidenceRequirement => ({ id, kind: "link", label, required });
const N = (id: string, label: string): EvidenceRequirement => ({ id, kind: "number", label, required: true });
const K = (id: string, label: string, items: string[]): EvidenceRequirement => ({ id, kind: "checklist", label, required: true, items });

export const CHALLENGES: readonly ChallengeDef[] = [
  // ── Sales ──
  {
    id: "sales_followup_plan", track: "sales", title: "This week's follow-up plan", dims: ["decision", "execution"],
    brief: "Take 6 real leads from your list who said 'call later' or showed interest. Plan this week: the order you'll follow them up in and why, the channel (call / WhatsApp / visit), what you will say or show, and the day. On Wednesday, update the plan for whatever changed (a lead postponed, a new hot lead).",
    evidence: [T("plan", "Your plan: lead (no full names needed), order, channel, what you'll say, day"), T("change", "Wednesday update: what changed and how you adjusted"), N("results", "Follow-ups completed by Saturday"), K("checks", "Before you submit", ["Every lead has a day", "Ordered by value and likelihood, not by habit", "No discount beyond my authority"])],
    criteria: [C("priority", "Sensible priority", 25, "No order or reason", "An order with a weak reason", "Ordered by value × likelihood with a clear reason"), C("specific", "Specific actions", 20, "Vague ('follow up')", "Some specifics", "Channel, message and day for each lead"), C("adapt", "Adapted to change", 20, "No update", "Updated without reasons", "Re-planned sensibly for what changed"), C("honest", "Within authority and honest", 20, "Promises beyond authority", "Unclear offers", "Offers only what is allowed", true), C("done", "Followed through", 15, "Nothing done", "Some done", "Done as planned, results reported")],
    exemplar: "Order: 1) Krishna Real Estate (₹15k, asked for a demo) — visit Tue with two samples; 2) Sai Dental (₹6k, very keen) — call Mon 11 AM to book… Wednesday: Raja Sarees postponed to after Diwali → moved to the 28th; new hot lead Star Fitness → slotted Thu. Results: 5 of 6 done, 2 quotes sent, 1 sale.",
  },
  {
    id: "sales_objections", track: "sales", title: "Three objections, handled", dims: ["communication", "emotional"],
    brief: "From this week's calls, write down three real objections (price, timing, trust or need — no client names). For each: the client's words, what you answered, and what happened. Then write how you would answer each one better next time.",
    evidence: [T("o1", "Objection 1: their words → your answer → result"), T("o2", "Objection 2"), T("o3", "Objection 3"), T("better", "How you'd answer better next time")],
    criteria: [C("real", "Real, specific objections", 20, "Generic or invented", "Somewhat specific", "Concrete words from real calls"), C("answer", "Answers address the real concern", 25, "Argues or ignores the concern", "Partly addresses it", "Acknowledges and answers the actual concern"), C("honest", "Honest — nothing beyond authority", 20, "Over-promises", "Vague promises", "Only honest, allowed offers", true), C("reflect", "Learns from it", 25, "No reflection", "Generic reflection", "A specific better answer for each"), C("clear", "Clear writing", 10, "Hard to follow", "Followable", "Clear and concise")],
    exemplar: "1) 'Too costly for my shop' → I showed the cost per customer reached and offered advance + balance → booked a second call. Better: open with a similar local shop's result first…",
  },
  {
    id: "sales_renewal_message", track: "sales", title: "A renewal that sells itself", dims: ["communication", "critical"],
    brief: "Pick one social-media client due for renewal soon. Write the renewal message you will send: what was delivered last month (use the real numbers from their month), one improvement for next month, and a clear call to action. Send it, and report the client's reply.",
    evidence: [T("message", "The message you sent (client name removed)"), T("numbers", "The month's real numbers you used (posts, reach, leads)"), T("reply", "The client's reply / outcome")],
    criteria: [C("facts", "Uses real results", 25, "No numbers or made-up claims", "Some numbers", "Specific, true numbers from the month", true), C("value", "Shows value clearly", 25, "Just asks to pay", "Some value", "Clear value for the client's business"), C("next", "One concrete improvement", 20, "None", "Vague", "One specific improvement for next month"), C("cta", "Clear call to action", 20, "No ask", "Vague ask", "A clear, easy next step with a date"), C("tone", "Respectful tone", 10, "Pushy", "Neutral", "Warm and professional")],
    exemplar: "Hello Sir, in October we posted 8 times; your reels reached 4,200 people and brought 11 enquiries… For November we'll add one customer-story reel each week. Shall I renew from 6 Nov? Reply YES and I'll share the payment link.",
  },
  {
    id: "sales_pipeline_review", track: "sales", title: "Find your biggest leak", dims: ["problem", "critical"],
    brief: "Review your last 30 calls in the app: how many answered, interested, quoted, sold. Find the stage where most leads drop, give the evidence, and pick ONE change to test next week. Report the result.",
    evidence: [N("calls", "Calls reviewed"), T("funnel", "Counts at each stage"), T("leak", "Where most drop off, with evidence"), T("test", "The one change you tested and its result")],
    criteria: [C("data", "Uses the real numbers", 25, "No numbers", "Partial numbers", "A full stage-by-stage count", true), C("diagnosis", "Correct diagnosis", 25, "Guess", "Plausible but unsupported", "The leak supported by the numbers"), C("test", "A focused test", 20, "No test", "Several changes at once", "One change, tested fairly"), C("result", "Reports the result honestly", 20, "No result", "Result without numbers", "Result with numbers, good or bad"), C("next", "Next step", 10, "None", "Vague", "A clear next step")],
    exemplar: "30 calls → 18 answered → 9 interested → 4 quoted → 1 sold. Biggest drop: interested → quoted (9 → 4)… Test: send a sample within 1 hour of interest. Result: 4 of 6 got quotes (vs 4 of 9).",
  },
  // ── Technical ──
  {
    id: "tech_prerender_checklist", track: "technical", title: "A checklist that catches mistakes", dims: ["execution", "problem"],
    brief: "Write a pre-render checklist for festival ads (at least 6 checks: phone number, address, spelling, logo, language, length…). Use it on your next real job before rendering and report what it caught and how many credits / minutes it saved.",
    evidence: [T("checklist", "Your checklist"), T("job", "The job you used it on (job id, e.g. P1234)"), T("caught", "What it caught (or 'nothing' — be honest)"), N("minutes", "Minutes the check took")],
    criteria: [C("complete", "Covers the real failure points", 25, "Fewer than 3 relevant checks", "Some important checks missing", "All common failure points covered"), C("used", "Actually used on a real job", 25, "Not used", "Used partly", "Used fully, with the job named", true), C("evidence", "Honest evidence of the result", 20, "No result", "Result without detail", "Exactly what it caught or that it caught nothing"), C("cost", "Cost / benefit stated", 15, "Not stated", "Rough", "Time spent vs re-renders avoided"), C("improve", "Improves the checklist", 15, "No change", "Vague", "A specific improvement after using it")],
    exemplar: "Checklist: 1) phone number digit by digit vs the brief; 2) address spelling; 3) logo file = original PNG; 4) Telugu script reads naturally; 5) 4 clips × 8 s; 6) 9:16… Used on P2231: caught the phone number 98480 12354 → 12345 before rendering, saving one re-render (12 credits).",
  },
  {
    id: "tech_prompt_fix", track: "technical", title: "Fix a prompt that failed", dims: ["learning", "problem"],
    brief: "Take a frame or clip prompt that gave a bad result this week. Diagnose why (which words caused it), write the improved prompt, run it, and describe the new result.",
    evidence: [T("before", "The original prompt (shortened is fine)"), T("problem", "What went wrong in the result"), T("cause", "Why — which part of the prompt caused it"), T("after", "The improved prompt"), T("result", "What the new result looked like")],
    criteria: [C("diagnosis", "Finds the cause", 30, "Blames the tool", "A guess", "Points to the exact words that caused it"), C("fix", "Targeted fix", 25, "Rewrote everything", "Several changes", "A targeted change to the cause"), C("verify", "Verified the result", 25, "Not run", "Run without comparison", "Run and compared with the original", true), C("lesson", "Reusable lesson", 20, "None", "Vague", "A rule the team can reuse")],
    exemplar: "Before: '…a woman holding the product, logo visible…' → the logo was warped on the product. Cause: asking the model to draw the logo. After: 'leave a clean space top-right for the logo' and add the logo in editing. Result: clean frame; logo sharp.",
  },
  {
    id: "tech_tool_compare", track: "technical", title: "Compare two ways, then decide", dims: ["decision", "critical"],
    brief: "Pick one task (posters, frames, captions, subtitles…) and try it two ways (two tools, two models or two methods) on the same input. Compare on 3 criteria with real results, then recommend one for the team with its risk.",
    evidence: [T("task", "The task and the two ways"), T("results", "Results on each criterion (with numbers where possible)"), T("decision", "Your recommendation and its main risk"), L("samples", "Link to the two outputs (Drive)")],
    criteria: [C("fair", "Fair comparison", 25, "Different inputs", "Mostly fair", "Same input, same criteria"), C("evidence", "Real results", 25, "Opinions only", "Some evidence", "Measured results for each criterion", true), C("tradeoffs", "Trade-offs named", 20, "None", "One side only", "Trade-offs of both"), C("decision", "Clear recommendation", 20, "None", "Hedged", "Clear choice with the risk and how to reduce it"), C("clarity", "Clear write-up", 10, "Hard to follow", "Followable", "Short and clear")],
    exemplar: "Task: festival poster from the same brief. A: Gemini image, B: ChatGPT image. Text accuracy: A 3/5 posters correct, B 5/5. Time: A 6 min, B 9 min… Recommend B for text-heavy posters; risk: slower on busy days → use A for photo-only posters.",
  },
  {
    id: "tech_trouble_log", track: "technical", title: "A problem you solved, documented", dims: ["problem", "communication"],
    brief: "Document one real technical problem you solved this week: the symptom, the evidence you gathered, the root cause, the fix, how you verified it, and how to prevent it. Write it so a new teammate could follow it.",
    evidence: [T("symptom", "Symptom"), T("evidence", "Evidence you collected"), T("cause", "Root cause"), T("fix", "Fix"), T("verify", "How you verified it"), T("prevent", "How to prevent it")],
    criteria: [C("evidence", "Evidence before the fix", 25, "Jumped to a fix", "Some evidence", "Evidence that separates the possible causes"), C("cause", "Root cause, not symptom", 25, "Symptom only", "A plausible cause", "A confirmed root cause"), C("verify", "Verified", 20, "Not verified", "Partly", "Clearly verified", true), C("prevent", "Prevention", 15, "None", "Vague", "A specific prevention step"), C("clear", "A teammate could follow it", 15, "Unclear", "Mostly clear", "Clear step by step")],
    exemplar: "Symptom: uploads over 500 MB failed at ~80%. Evidence: small files fine; the same file failed on Wi-Fi, worked on mobile data. Cause: the router's session timeout… Fix: upload large files via the wired PC. Verified: 5 of 5 large uploads succeeded. Prevent: note added to the Drive guide.",
  },
  // ── Admin ──
  {
    id: "admin_process_map", track: "admin", title: "Map a process, find the slow step", dims: ["problem", "execution"],
    brief: "Pick one office process (e.g. invoice → payment, leave request → payroll). Map every step with who does it and how long it takes (use real cases from this week). Find the slowest step, propose one fix, try it if you can, and report.",
    evidence: [T("process", "The process and its steps (who, how long)"), T("cases", "The real cases you timed"), T("slowest", "The slowest step and why"), T("fix", "Your fix and what happened when you tried it")],
    criteria: [C("map", "Complete map", 20, "Steps missing", "Mostly complete", "Every step with owner and time"), C("data", "Real timings", 25, "No data", "Rough estimates", "Timed real cases", true), C("bottleneck", "Finds the real bottleneck", 25, "Guess", "Plausible", "Supported by the timings"), C("fix", "A practical fix", 20, "None", "Vague", "Specific and tried (or a clear plan to try)"), C("clear", "Clear write-up", 10, "Hard to follow", "Followable", "Short and clear")],
    exemplar: "Invoice → payment: prepare (Madhavi, 20 min) → check (Gopi, waits 1–2 days) → approve (manager, same day) → send (5 min)… Slowest: checking waits for Gopi's Friday batch. Fix: check daily at 4 PM. Tried this week: 6 invoices checked within a day.",
  },
  {
    id: "admin_report_summary", track: "admin", title: "Five lines for the owner", dims: ["cognitive", "communication"],
    brief: "Take one of this week's reports (attendance, expenses or invoices). Summarize it for the owner in at most 5 bullet points: the facts that matter, one risk, and one recommended action.",
    evidence: [T("source", "Which report and its key numbers"), T("summary", "Your 5 bullet points"), T("action", "The recommended action and why")],
    criteria: [C("facts", "Right facts, correctly", 30, "Wrong numbers", "Mostly right", "Correct, important numbers", true), C("selection", "Picks what matters", 25, "Lists everything", "Some noise", "Only what the owner needs"), C("risk", "Names a risk", 15, "None", "Vague", "A specific risk"), C("action", "One clear action", 20, "None", "Vague", "One specific action with a reason"), C("brief", "Within 5 bullets", 10, "Far over", "Slightly over", "Within the limit")],
    exemplar: "• Absences: 9 days this week vs 4 last week — 6 of them in the studio. • … Risk: two festival deliveries next week need the studio at full strength. Action: confirm next week's leave plan with the studio leader by Monday.",
  },
  {
    id: "admin_week_plan", track: "admin", title: "Plan the week, then adapt", dims: ["decision", "execution"],
    brief: "Plan next week's office work (payroll inputs, invoices, vendor calls, events…) with days and owners. Mid-week something will change (a leave, an urgent client request) — record the change and how you re-planned, and report what got done.",
    evidence: [T("plan", "Monday's plan (task, owner, day)"), T("change", "What changed mid-week and how you re-planned"), T("done", "What got done by Saturday")],
    criteria: [C("plan", "A realistic plan", 25, "No plan", "Loose plan", "Tasks, owners and days that fit the week"), C("priority", "Right priorities", 20, "Random", "Mostly sensible", "Deadlines and impact first"), C("adapt", "Adapted well", 25, "No change", "Changed without reasons", "Re-planned sensibly and told people"), C("result", "Honest result", 20, "Not reported", "Partly", "What was done and what slipped, honestly", true), C("clear", "Clear", 10, "Unclear", "Followable", "Clear")],
    exemplar: "Mon: attendance corrections (me) … Wed: Anusha on leave → moved vendor calls to Fri, invoices to Gopi … Done: payroll inputs ✓, 9 of 10 invoices ✓, vendor calls moved to next Mon (told the vendor).",
  },
  {
    id: "admin_vendor_choice", track: "admin", title: "Choose a vendor with evidence", dims: ["decision", "critical"],
    brief: "For one real purchase (printing, stationery, internet, repairs…), get at least two quotes, compare them on price, delivery, quality and terms, and recommend one with its risk.",
    evidence: [T("quotes", "The quotes (vendor, price, delivery, terms)"), T("compare", "Your comparison"), T("decision", "Recommendation and its main risk"), L("proof", "Link to the quotes (photo / PDF)")],
    criteria: [C("quotes", "Real quotes", 25, "None", "One", "Two or more real quotes", true), C("compare", "Fair comparison", 25, "Price only", "Some criteria", "Price, delivery, quality and terms"), C("decision", "Clear recommendation", 20, "None", "Hedged", "Clear choice with reasons"), C("risk", "Risk and mitigation", 20, "None", "Risk only", "Risk and how to reduce it"), C("clear", "Clear", 10, "Unclear", "Followable", "Clear")],
    exemplar: "V1 ₹6/page, 4 days, paid on delivery; V2 ₹5/page, 7 days, 50% advance… Recommend V1 for the festival order (deadline in 6 days); risk: higher price → negotiate ₹5.5 for orders above 2,000 pages.",
  },
];

export const CHALLENGE_BY_ID: ReadonlyMap<string, ChallengeDef> = new Map(CHALLENGES.map((c) => [c.id, c]));

/** The next unseen challenge for a person: their own track first, then the others (a transfer). */
export function nextChallenge(track: TrackId, seen: readonly string[]): ChallengeDef | null {
  const own = CHALLENGES.filter((c) => c.track === track && !seen.includes(c.id));
  if (own.length) return own[0];
  return CHALLENGES.find((c) => !seen.includes(c.id)) ?? null;
}
