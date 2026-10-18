/**
 * Execution & Adaptability families (MSRS §6 dim 10: turn plans into results and adjust when requirements change):
 *   • schedule_adapt    — a day's plan, then a change: how far over, which task can move without breaking anything,
 *                         and the right order when tasks depend on each other (an "order" item);
 *   • requirement_check — the brief vs what was delivered, detail by detail (one wrong digit counts).
 */
import type { Rng } from "../../core/rng.js";
import type { Difficulty, TrackId } from "../../core/types.js";
import { BUSINESSES, PEOPLE, hints, key, singleChoice, type Family, type GenContext, type Generated } from "../kit.js";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ═══ Re-plan after a change ═════════════════════════════════════════════════════════════════════

interface TaskDef { name: string; hours: number[]; mustToday: boolean; after?: string }
interface DaySetting { intro: (who: string) => string; tasks: TaskDef[]; changes: { text: string; task: string; addHours: number }[]; tieRule: string }

const DAYS: Record<string, DaySetting> = {
  studio_day: {
    intro: (w) => `${w} has one ad to deliver today and works alone, one task at a time, from 10:00. The client needs it by 18:00.`,
    tasks: [
      { name: "Write the voice-over script", hours: [1, 1.5], mustToday: true },
      { name: "Generate the frames", hours: [1.5, 2], mustToday: true, after: "Write the voice-over script" },
      { name: "Render the clips in Flow", hours: [2, 2.5], mustToday: true, after: "Generate the frames" },
      { name: "Edit and add the bottom label", hours: [1, 1.5], mustToday: true, after: "Render the clips in Flow" },
      { name: "Make the matching poster", hours: [1, 1.5], mustToday: false, after: "Generate the frames" },
      { name: "Tidy last week's Drive folder", hours: [0.5, 1], mustToday: false },
    ],
    changes: [{ text: "At 11:00 the client adds one more clip: rendering now takes 1.5 hours longer.", task: "Render the clips in Flow", addHours: 1.5 }, { text: "The client asks for a Telugu AND an English voice-over: the script takes 1 hour longer.", task: "Write the voice-over script", addHours: 1 }],
    tieRule: "When two tasks are both ready, do the one the client will see first.",
  },
  fix_day: {
    intro: (w) => `${w} must fix a broken upload process today, working alone from 10:00; the team needs it by 17:00.`,
    tasks: [
      { name: "Reproduce the failure", hours: [0.5, 1], mustToday: true },
      { name: "Check the logs", hours: [1, 1.5], mustToday: true, after: "Reproduce the failure" },
      { name: "Apply the fix", hours: [1, 2], mustToday: true, after: "Check the logs" },
      { name: "Test with three real files", hours: [1, 1.5], mustToday: true, after: "Apply the fix" },
      { name: "Write the how-to note", hours: [1, 1.5], mustToday: false, after: "Apply the fix" },
      { name: "Clean old test files", hours: [0.5, 1], mustToday: false },
    ],
    changes: [{ text: "The logs turn out to be split across two accounts: checking them takes 1.5 hours longer.", task: "Check the logs", addHours: 1.5 }],
    tieRule: "When two tasks are both ready, do the one that unblocks the team first.",
  },
  field_day: {
    intro: (w) => `${w} has a day of client work from 10:00, one task at a time, and must be back for the 18:00 team review.`,
    tasks: [
      { name: "Call to confirm today's visits", hours: [0.5, 1], mustToday: true },
      { name: "Visit the jewellery shop", hours: [1.5, 2], mustToday: true, after: "Call to confirm today's visits" },
      { name: "Visit the restaurant", hours: [1.5, 2], mustToday: true, after: "Call to confirm today's visits" },
      { name: "Record both sales in the app", hours: [0.5, 1], mustToday: true, after: "Visit the restaurant" },
      { name: "Drop pamphlets at the market", hours: [1, 1.5], mustToday: false },
      { name: "Update the old lead list", hours: [1, 1.5], mustToday: false },
    ],
    changes: [{ text: "The jewellery shop owner asks you to wait for his son: that visit takes 1.5 hours longer.", task: "Visit the jewellery shop", addHours: 1.5 }],
    tieRule: "When two tasks are both ready, do the one with the earlier appointment first.",
  },
  followup_day: {
    intro: (w) => `${w} spends the afternoon on follow-ups from 13:00, one task at a time, until 18:00.`,
    tasks: [
      { name: "Send renewal reports to three clients", hours: [1, 1.5], mustToday: true },
      { name: "Call the clients after the reports", hours: [1, 1.5], mustToday: true, after: "Send renewal reports to three clients" },
      { name: "Record the renewals", hours: [0.5, 1], mustToday: true, after: "Call the clients after the reports" },
      { name: "Plan next week's calls", hours: [1, 1.5], mustToday: false },
      { name: "Write a client testimonial post", hours: [0.5, 1], mustToday: false },
    ],
    changes: [{ text: "One client wants a detailed report: the reports take 1 hour longer.", task: "Send renewal reports to three clients", addHours: 1 }],
    tieRule: "When two tasks are both ready, do the one closest to a payment first.",
  },
  month_end: {
    intro: (w) => `${w} closes the month today from 10:00, one task at a time; payroll must be ready by 18:00.`,
    tasks: [
      { name: "Collect attendance corrections", hours: [1, 1.5], mustToday: true },
      { name: "Approve pending leave", hours: [0.5, 1], mustToday: true },
      { name: "Run payroll", hours: [1.5, 2], mustToday: true, after: "Collect attendance corrections" },
      { name: "Check every payslip", hours: [1, 1.5], mustToday: true, after: "Run payroll" },
      { name: "File last month's receipts", hours: [1, 1.5], mustToday: false },
      { name: "Update the vendor list", hours: [0.5, 1], mustToday: false },
    ],
    changes: [{ text: "Three people send late attendance corrections: collecting them takes 1.5 hours longer.", task: "Collect attendance corrections", addHours: 1.5 }],
    tieRule: "When two tasks are both ready, do the one payroll depends on first.",
  },
  event_prep: {
    intro: (w) => `${w} prepares tomorrow's client event from 11:00, one task at a time, until 17:00.`,
    tasks: [
      { name: "Confirm the guest list", hours: [1, 1.5], mustToday: true },
      { name: "Print the name badges", hours: [0.5, 1], mustToday: true, after: "Confirm the guest list" },
      { name: "Book the projector", hours: [0.5, 1], mustToday: true },
      { name: "Send the reminder message", hours: [0.5, 1], mustToday: true, after: "Confirm the guest list" },
      { name: "Design table cards", hours: [1, 1.5], mustToday: false },
      { name: "Order extra snacks", hours: [0.5], mustToday: false },
    ],
    changes: [{ text: "Ten more guests are added: confirming the list takes 1 hour longer.", task: "Confirm the guest list", addHours: 1 }],
    tieRule: "When two tasks are both ready, do the one the guests need first.",
  },
};

const DAY_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["field_day", "followup_day"],
  technical: ["studio_day", "fix_day"],
  admin: ["month_end", "event_prep"],
};

const hh = (h: number) => `${h} h`;

function windowHours(intro: string): number {
  const m = /from (\d{1,2}):00.*?(?:by|until|the) (\d{1,2}):00/.exec(intro);
  return m ? Number(m[2]) - Number(m[1]) : 8;
}

const scheduleAdapt: Family = {
  id: "schedule_adapt",
  version: "1",
  dims: ["execution", "decision"],
  open: false,
  forms: ["over_by", "move_one", "order"],
  settings: DAY_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = DAYS[ctx.setting];
    const who = rng.pick(PEOPLE);
    const intro = s.intro(who);
    const window = windowHours(intro);
    for (let guard = 0; guard < 300; guard++) {
      const tasks = s.tasks.map((t) => ({ ...t, h: rng.pick(t.hours) }));
      if (ctx.form === "order") {
        const must = tasks.filter((t) => t.mustToday).slice(0, d <= 2 ? 3 : 4);
        const names = new Set(must.map((t) => t.name));
        const deps = must.map((t) => ({ ...t, after: t.after && names.has(t.after) ? t.after : undefined }));
        // A unique valid order: dependencies first, then the tie rule (the listed order).
        const order: typeof deps = [];
        const left = [...deps];
        while (left.length) {
          const ready = left.filter((t) => !t.after || order.some((o) => o.name === t.after));
          if (!ready.length) break;
          const next = ready[0];
          order.push(next);
          left.splice(left.indexOf(next), 1);
        }
        if (order.length !== deps.length) continue;
        const shown = rng.shuffle(deps);
        const correctOrder = order.map((t) => shown.indexOf(t));
        const lines = shown.map((t) => `- ${t.name} (${hh(t.h)})${t.after ? ` — only after "${t.after}"` : ""}`).join("\n");
        return {
          type: "order",
          scenario: `${intro}\nToday's tasks:\n${lines}\n\n${s.tieRule}`,
          question: "Put the tasks in the order they should be done (first at the top).",
          options: shown.map((t) => t.name),
          key: key({
            order: correctOrder,
            explanation: `${order.map((t, i) => `${i + 1}. ${t.name}`).join("  ")} — every task comes after the one it needs, and when two were ready the rule decided: ${s.tieRule.toLowerCase()}`,
            hints: hints("Start with the tasks that need nothing else first.", "Whenever two tasks are ready together, apply the rule in the last line."),
          }),
          objective: "Sequence work by its dependencies.", gap: "incomplete",
        };
      }
      const change = rng.pick(s.changes);
      const changed = tasks.map((t) => (t.name === change.task ? { ...t, h: t.h + change.addHours } : t));
      const included = changed.filter((t) => t.mustToday || d <= 2 || rng.chance(0.75));
      const total = included.reduce((a, t) => a + t.h, 0);
      const over = Math.round((total - window) * 10) / 10;
      if (over <= 0) continue;
      const lines = included.map((t) => `- ${t.name}: ${hh(tasks.find((x) => x.name === t.name)!.h)}${t.mustToday ? "" : " (can wait until tomorrow)"}${t.after ? ` — needs "${t.after}" first` : ""}`).join("\n");
      const scenario = `${intro}\nThe plan:\n${lines}\n\nChange: ${change.text}`;
      if (ctx.form === "over_by") {
        return {
          type: "numeric", scenario, question: "After the change, by how many hours does the plan run past the deadline if nothing is moved?", unit: "hours",
          key: key({ value: over, tolerance: 0.01, explanation: `Hours after the change: ${included.map((t) => `${t.h}`).join(" + ")} = ${total} h. Time available: ${window} h. Over by ${over} h.`, hints: hints("Add the hours of every task, using the new time for the changed task.", "Compare with the hours between the start time and the deadline.") }),
          objective: "Re-plan when a requirement changes.", gap: "calculation",
        };
      }
      const needed = new Set(included.filter((t) => t.after).map((t) => t.after!));
      const movable = included.filter((t) => !t.mustToday && t.h >= over && !needed.has(t.name));
      if (movable.length !== 1) continue;
      const correct = movable[0];
      const tooShort = included.filter((t) => !t.mustToday && t.h < over);
      const prereq = included.filter((t) => needed.has(t.name));
      const mustOnes = included.filter((t) => t.mustToday && !needed.has(t.name));
      const distract = [...tooShort, ...prereq, ...mustOnes].map((t) => t.name);
      const o = singleChoice(rng, correct.name, rng.shuffle([...new Set(distract)]));
      return {
        type: "mcq", scenario, question: "Which ONE task should move to tomorrow so the deadline is still met?", options: o.options,
        key: key({
          correct: [o.index],
          explanation: `The plan is now ${over} h over. Only "${correct.name}" can wait, frees at least ${over} h (${correct.h} h), and is not needed by another task. ${tooShort.length ? `"${tooShort[0].name}" can wait but frees too little. ` : ""}Tasks marked for today, or needed by others, cannot move.`,
          hints: hints("First work out how many hours over the plan now is.", "The task you move must be optional, long enough, and not needed by any other task."),
        }),
        objective: "Re-plan when a requirement changes.", gap: "tradeoff",
      };
    }
    throw new Error("schedule did not settle");
  },
};

// ═══ Brief vs delivery ══════════════════════════════════════════════════════════════════════════

interface Req { name: string; brief: string; ok: string; bad: string }

function phone(rng: Rng): [string, string] {
  const digits = `9${rng.int(100000000, 999999999)}`;
  const i = rng.int(5, 8);
  const swapped = digits.slice(0, i) + digits[i + 1] + digits[i] + digits.slice(i + 2);
  const fmt = (x: string) => `${x.slice(0, 5)} ${x.slice(5)}`;
  return [fmt(digits), fmt(swapped === digits ? `${digits.slice(0, 9)}${(Number(digits[9]) + 1) % 10}` : swapped)];
}

const REQUIREMENTS: Record<string, (rng: Rng) => { intro: string; reqs: Req[] }> = {
  ad_delivery: (rng) => {
    const clips = rng.pick([2, 3, 4, 6]);
    const lang = rng.pick(["Telugu", "English", "Hindi"]);
    const other = rng.pick(["Telugu", "English", "Hindi"].filter((x) => x !== lang));
    const ratio = rng.pick(["9:16", "16:9", "1:1"]);
    const [p, pBad] = phone(rng);
    return { intro: `The brief for ${rng.pick(BUSINESSES)}'s ad, and the export report of what was delivered.`, reqs: [
      { name: "Voice-over language", brief: lang, ok: lang, bad: other },
      { name: "Length", brief: `${clips} clips × 8 s = ${clips * 8} s`, ok: `${clips * 8} s`, bad: `${(clips - 1) * 8} s` },
      { name: "Aspect ratio", brief: ratio, ok: ratio, bad: ratio === "9:16" ? "16:9" : "9:16" },
      { name: "Logo position", brief: "Top-right, every clip", ok: "Top-right, every clip", bad: "Top-right, clips 1–2 only" },
      { name: "Phone number in the last clip", brief: p, ok: p, bad: pBad },
      { name: "Shop address in the last clip", brief: "Main Road, near the bus stand", ok: "Main Road, near the bus stand", bad: "Not shown" },
    ] };
  },
  poster_delivery: (rng) => {
    const [p, pBad] = phone(rng);
    const offer = rng.pick(["Flat 20% off", "Buy 1 Get 1", "Free delivery"]);
    return { intro: `The brief for ${rng.pick(BUSINESSES)}'s festival poster, and what was delivered.`, reqs: [
      { name: "Size", brief: "1080 × 1350 px", ok: "1080 × 1350 px", bad: "1080 × 1080 px" },
      { name: "Offer text", brief: offer, ok: offer, bad: offer === "Flat 20% off" ? "Flat 25% off" : "Flat 20% off" },
      { name: "Phone number", brief: p, ok: p, bad: pBad },
      { name: "Logo", brief: "Bottom-centre", ok: "Bottom-centre", bad: "Missing" },
      { name: "Language", brief: "Telugu headline, English details", ok: "Telugu headline, English details", bad: "English only" },
      { name: "Valid till", brief: "31 October", ok: "31 October", bad: "30 October" },
    ] };
  },
  sale_record: (rng) => {
    const [p, pBad] = phone(rng);
    const amt = rng.pick([4999, 2999, 7999]);
    return { intro: "What the sales rules require in a recorded sale, and what was entered.", reqs: [
      { name: "Client phone", brief: `+91 ${p}`, ok: `+91 ${p}`, bad: `+91 ${pBad}` },
      { name: "Package", brief: "Promotional video, 4 clips", ok: "Promotional video, 4 clips", bad: "Promotional video, 3 clips" },
      { name: "Amount", brief: `₹${amt.toLocaleString("en-IN")}`, ok: `₹${amt.toLocaleString("en-IN")}`, bad: `₹${(amt - 1000).toLocaleString("en-IN")}` },
      { name: "Advance paid", brief: "Screenshot attached", ok: "Screenshot attached", bad: "No screenshot" },
      { name: "Delivery promise", brief: "On or after the sale day", ok: "2 days after the sale", bad: "1 day BEFORE the sale" },
      { name: "Client's requirement notes", brief: "Written", ok: "Written in full", bad: "Empty" },
    ] };
  },
  proposal_check: (rng) => {
    const price = rng.pick([4999, 5999, 9999]);
    return { intro: `What every proposal must contain, and the proposal about to be sent to ${rng.pick(BUSINESSES)}.`, reqs: [
      { name: "Price matches the package list", brief: `₹${price.toLocaleString("en-IN")}`, ok: `₹${price.toLocaleString("en-IN")}`, bad: `₹${(price - 500).toLocaleString("en-IN")}` },
      { name: "Valid until", brief: "A date within 15 days", ok: "10 days from today", bad: "45 days from today" },
      { name: "GST mentioned", brief: "Yes", ok: "Yes — plus 18% GST", bad: "Not mentioned" },
      { name: "Sample link", brief: "Working link", ok: "Working link", bad: "Link to a deleted video" },
      { name: "Delivery time", brief: "Stated in days", ok: "5 working days", bad: "\"Soon\"" },
      { name: "Contact person", brief: "Name and phone", ok: "Name and phone", bad: "Name only" },
    ] };
  },
  invoice_fields: (rng) => {
    const n = rng.int(10, 99);
    return { intro: "What a valid invoice must show, and the draft invoice.", reqs: [
      { name: "Invoice number format", brief: "DTS/26-27/00NN", ok: `DTS/26-27/00${n}`, bad: `DTS-26/27-${n}` },
      { name: "Client GSTIN", brief: "15 characters", ok: "36ABCDE1234F1Z5", bad: "36ABCDE1234F1Z" },
      { name: "Place of supply", brief: "State name and code", ok: "Andhra Pradesh (37)", bad: "Not given" },
      { name: "Tax shown", brief: "CGST + SGST lines", ok: "CGST 9% + SGST 9%", bad: "One line: GST 18%" },
      { name: "Invoice date", brief: "Today", ok: "Today", bad: "Tomorrow" },
      { name: "Total in words", brief: "Matches the figure", ok: "Matches the figure", bad: "One hundred rupees short" },
    ] };
  },
  leave_form: (rng) => {
    const who = rng.pick(PEOPLE);
    return { intro: `The office's rules for a leave request, and ${who}'s request.`, reqs: [
      { name: "Asked in advance", brief: "At least 2 days before", ok: "3 days before", bad: "The same morning" },
      { name: "Dates", brief: "From and to dates", ok: "Both given", bad: "Only the start date" },
      { name: "Reason", brief: "One line", ok: "Family function", bad: "Empty" },
      { name: "Handover", brief: "Name of the person covering", ok: "Named", bad: "Not named" },
      { name: "Half or full day", brief: "Marked", ok: "Full day", bad: "Not marked" },
      { name: "Manager", brief: "Their own team leader", ok: "Their own team leader", bad: "Another team's leader" },
    ] };
  },
};

const REQ_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["sale_record", "proposal_check"],
  technical: ["ad_delivery", "poster_delivery"],
  admin: ["invoice_fields", "leave_form"],
};

const requirementCheck: Family = {
  id: "requirement_check",
  version: "1",
  dims: ["execution", "cognitive"],
  open: false,
  forms: ["unmet", "count_met"],
  settings: REQ_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const { intro, reqs: all } = REQUIREMENTS[ctx.setting](rng);
    const reqs = rng.sample(all, d <= 2 ? 4 : d <= 4 ? 5 : 6);
    const faults = ctx.form === "unmet" ? 1 : rng.int(1, Math.min(3, d <= 2 ? 1 : d - 1));
    // Hard items hide the fault in a detail (a digit, a date) rather than an obvious "missing".
    const subtle = reqs.filter((r) => /\d/.test(r.bad) && r.bad !== "Not shown");
    const faultySet = new Set<Req>(d >= 4 && subtle.length ? rng.sample(subtle, Math.min(faults, subtle.length)) : rng.sample(reqs, faults));
    while (faultySet.size < faults) faultySet.add(rng.pick(reqs));
    const lines = reqs.map((r) => `| ${r.name} | ${r.brief} | ${faultySet.has(r) ? r.bad : r.ok} |`).join("\n");
    const scenario = `${intro}\n\n| Requirement | Required | Delivered |\n| --- | --- | --- |\n${lines}`;
    const met = reqs.length - faultySet.size;
    if (ctx.form === "count_met") {
      return {
        type: "numeric", scenario, question: `How many of the ${reqs.length} requirements are fully met?`, unit: "",
        key: key({ value: met, tolerance: 0, explanation: `Not met: ${[...faultySet].map((r) => `${r.name} (${r.bad} vs ${r.brief})`).join("; ")}. So ${met} of ${reqs.length} are met.`, hints: hints("Compare each line character by character — numbers and dates especially.", "Count only the lines where 'Delivered' fully matches 'Required'.") }),
        objective: "Verify work against requirements before calling it done.", gap: "incomplete",
      };
    }
    const bad = [...faultySet][0];
    const o = singleChoice(rng, bad.name, rng.shuffle(reqs.filter((r) => r !== bad)).map((r) => r.name));
    return {
      type: "mcq", scenario, question: "Which requirement is NOT met?", options: o.options,
      key: key({ correct: [o.index], explanation: `${bad.name}: required "${bad.brief}", delivered "${bad.bad}". Every other line matches.`, hints: hints("Check every line, not just the obvious ones.", "Read numbers digit by digit.") }),
      objective: "Verify work against requirements before calling it done.", gap: "incomplete",
    };
  },
};

export const EXECUTION_FAMILIES: Family[] = [scheduleAdapt, requirementCheck];
export const __dayWindow = windowHours;
export type { Difficulty, Rng };
export { cap };
