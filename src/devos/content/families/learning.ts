/**
 * Learning Agility family (MSRS §6 dim 3: learn something unfamiliar and use it on a new task).
 * Each item TEACHES a small method in the scenario — a code format, a scoring framework, a mapping — and then asks
 * for it to be applied to a case the text did not show. Harder items add exceptions to the method.
 */
import type { Rng } from "../../core/rng.js";
import type { Difficulty, TrackId } from "../../core/types.js";
import { BUSINESSES, PEOPLE, hints, key, singleChoice, type Family, type GenContext, type Generated } from "../kit.js";

type Item = Omit<Generated, "objective" | "gap" | "teaches">;

// ── Job codes (technical) ─────────────────────────────────────────────────────────────────────

const LANGS: [string, string][] = [["TEL", "Telugu"], ["ENG", "English"], ["HIN", "Hindi"], ["TAM", "Tamil"]];

function jobCode(rng: Rng, d: Difficulty, form: string): Item {
  const rules = [
    "Studio job codes look like TEL-32-V2-R.",
    "The first part is the language: TEL Telugu, ENG English, HIN Hindi, TAM Tamil.",
    "The number is the total length in seconds; every clip is 8 seconds.",
    "V and a number is the version: V1 is the first cut, and each client change adds 1.",
  ];
  if (d >= 2) rules.push("An R at the end means a rush job.");
  if (d >= 4) rules.push("A job with two languages joins them with a plus: TEL+ENG-32-V1 (it is still ONE video length; each language is rendered separately).");
  const [code, lang] = rng.pick(LANGS);
  const [code2, lang2] = rng.pick(LANGS.filter((l) => l[0] !== code));
  const clips = rng.int(2, 8);
  const ver = rng.int(1, 5);
  const rush = d >= 2 && rng.chance(0.5);
  const dual = d >= 4 && rng.chance(0.6);
  const codeStr = `${code}${dual ? `+${code2}` : ""}-${clips * 8}-V${ver}${rush ? "-R" : ""}`;
  const scenario = `Read this new convention:\n${rules.map((r) => `- ${r}`).join("\n")}`;
  if (form === "decode") {
    const renders = dual ? clips * 2 : clips;
    const answer = d >= 4 ? renders : d >= 3 ? ver - 1 : clips;
    const question = d >= 4 ? `For job ${codeStr}, how many 8-second clips must be rendered in total?` : d >= 3 ? `Job ${codeStr}: how many client changes has it had so far?` : `Job ${codeStr}: how many 8-second clips does it have?`;
    return {
      type: "numeric", scenario, question, unit: "",
      key: key({
        value: answer, tolerance: 0,
        explanation: d >= 4 ? `${clips * 8} s ÷ 8 = ${clips} clips${dual ? `, rendered once per language (${lang} and ${lang2}) = ${renders}` : ""}.` : d >= 3 ? `V${ver} means ${ver - 1} change${ver - 1 === 1 ? "" : "s"} after the first cut (V1).` : `${clips * 8} seconds ÷ 8 seconds per clip = ${clips} clips.`,
        hints: hints("Split the code at the dashes and name each part.", "Use only the rules above — not what you would guess."),
      }),
    };
  }
  const desc = `a ${clips * 8}-second ${lang}${dual ? ` and ${lang2}` : ""} video${rush ? " needed urgently (rush)" : ""}, after ${ver - 1} client change${ver - 1 === 1 ? "" : "s"}`;
  const wrong = [
    `${code}${dual ? `+${code2}` : ""}-${clips}-V${ver}${rush ? "-R" : ""}`,
    `${code}${dual ? `+${code2}` : ""}-${clips * 8}-V${ver - 1 || 2}${rush ? "-R" : ""}`,
    `${code}${dual ? `+${code2}` : ""}-${clips * 8}-V${ver}${rush ? "" : "-R"}`,
    `${code2}-${clips * 8}-V${ver}${rush ? "-R" : ""}`,
  ];
  const o = singleChoice(rng, codeStr, wrong.filter((w) => w !== codeStr));
  return {
    type: "mcq", scenario, question: `Which code describes ${desc}?`, options: o.options,
    key: key({ correct: [o.index], explanation: `Language ${code}${dual ? `+${code2}` : ""}, length ${clips * 8} s, version V${ver} (first cut + ${ver - 1}), ${rush ? "R for rush" : "no R"} → ${codeStr}.`, hints: hints("Build the code part by part, in the order the rules give.", "Count the version from V1, not from V0.") }),
  };
}

// ── PACE lead score (sales) ───────────────────────────────────────────────────────────────────

const PAIN = ["no clear problem", "a small problem", "a real problem (falling footfall)", "an urgent problem (a new competitor next door)"];
const AUTH = ["is not the decision-maker", "decides together with a partner", "decides alone"];
const CASH = ["has no budget now", "has a small budget", "has a budget for this month", "has already set money aside"];
const EXPIRY = ["no deadline", "wants it this season", "needs it before a date this week"];

function paceScore(rng: Rng, d: Difficulty, form: string): Item {
  const rules = [
    "PACE scores a lead: Pain 0–3, Authority 0–2, Cash 0–3, Expiry (deadline) 0–2.",
    "HOT = a total of 7 or more AND Pain at least 2.",
    "WARM = a total of 4 to 6 (or 7+ without enough Pain).",
    "COLD = a total of 3 or less.",
  ];
  if (d >= 3) rules.push("Exception: if Authority is 0, the lead can be at most WARM.");
  if (d >= 5) rules.push("Exception: an Expiry of 2 adds 1 extra point to the total.");
  let p: number, a: number, c: number, e: number;
  do {
    p = rng.int(0, 3); a = rng.int(0, 2); c = rng.int(0, 3); e = rng.int(0, 2);
  } while (d >= 3 && rng.chance(0.4) && a !== 0);
  const total = p + a + c + e + (d >= 5 && e === 2 ? 1 : 0);
  let label = total >= 7 && p >= 2 ? "HOT" : total >= 4 ? "WARM" : "COLD";
  if (d >= 3 && a === 0 && label === "HOT") label = "WARM";
  const who = rng.pick(PEOPLE);
  const biz = rng.pick(BUSINESSES);
  const scenario = `Read this new lead-scoring method:\n${rules.map((r) => `- ${r}`).join("\n")}\n\n${who}'s call notes on ${biz}: the owner has ${PAIN[p]}, ${AUTH[a]}, ${CASH[c]}, and has ${EXPIRY[e]}.`;
  const working = `Pain ${p} (${PAIN[p]}), Authority ${a}, Cash ${c}, Expiry ${e}${d >= 5 && e === 2 ? " (+1 extra)" : ""} → total ${total}.`;
  if (form === "decode") {
    return {
      type: "numeric", scenario, question: "What is this lead's PACE total?", unit: "points",
      key: key({ value: total, tolerance: 0, explanation: working, hints: hints("Map each phrase in the notes to its score (the lists start at 0).", d >= 5 ? "Do not forget the Expiry bonus rule." : "Add the four scores.") }),
    };
  }
  const o = singleChoice(rng, label, ["HOT", "WARM", "COLD"].filter((x) => x !== label), [], 3);
  return {
    type: "mcq", scenario, question: "How should this lead be labelled?", options: o.options,
    key: key({ correct: [o.index], explanation: `${working} ${label === "WARM" && total >= 7 ? (a === 0 && d >= 3 ? "Authority is 0, so at most WARM." : "Pain is below 2, so not HOT.") : ""} → ${label}.`, hints: hints("Score each of the four parts first.", "Then check the exceptions before you label it.") }),
  };
}

// ── Objection map (sales) ────────────────────────────────────────────────────────────────────

const OBJECTIONS: { type: string; quotes: string[]; response: string }[] = [
  { type: "Price", quotes: ["It's too costly for a small shop like mine.", "Another agency quoted much less."], response: "Show the value per customer reached and offer the advance + balance plan" },
  { type: "Timing", quotes: ["Call me after the festival season.", "Right now the shop is too busy for this."], response: "Offer a start date and a reminder, and send one sample to keep it warm" },
  { type: "Trust", quotes: ["How do I know the video will look good?", "I've been cheated by an agency before."], response: "Share two local sample ads and a client's phone number for a reference" },
  { type: "Need", quotes: ["My customers already know my shop.", "I don't think ads work for my business."], response: "Show one result from a similar local business and ask about their slow days" },
];

function objectionMap(rng: Rng, d: Difficulty, form: string): Item {
  const rows = OBJECTIONS.map((o) => `- ${o.type}: ${o.response}.`).join("\n");
  const extra = d >= 3 ? "\n- If a client gives TWO objections, answer the one they said FIRST." : "";
  const obj = rng.pick(OBJECTIONS);
  const second = rng.pick(OBJECTIONS.filter((o) => o !== obj));
  const quote = d >= 3 ? `"${rng.pick(obj.quotes)} And honestly, ${rng.pick(second.quotes).replace(/^./, (c) => c.toLowerCase())}"` : `"${rng.pick(obj.quotes)}"`;
  const scenario = `Your team uses this objection map (new to you):\n${rows}${extra}\n\nA client says: ${quote}`;
  if (form === "decode") {
    const o = singleChoice(rng, obj.type, OBJECTIONS.filter((x) => x !== obj).map((x) => x.type));
    return {
      type: "mcq", scenario, question: "Which objection type should you answer?", options: o.options,
      key: key({ correct: [o.index], explanation: `"${quote.slice(1, 40)}…" is a ${obj.type} objection${d >= 3 ? ` (said first, so it comes before the ${second.type} one)` : ""}.`, hints: hints("Match the client's words to one of the four types.", d >= 3 ? "Two objections: the rule says which one to answer." : "Price is about money; Need is about whether ads help at all.") }),
    };
  }
  const o = singleChoice(rng, obj.response, OBJECTIONS.filter((x) => x !== obj).map((x) => x.response));
  return {
    type: "mcq", scenario, question: "According to the map, what should you do?", options: o.options,
    key: key({ correct: [o.index], explanation: `This is a ${obj.type} objection, so the map says: ${obj.response.toLowerCase()}.`, hints: hints("First decide the type, then read across the map.", "Do not answer with your usual habit — use the map.") }),
  };
}

// ── Document codes (admin) ────────────────────────────────────────────────────────────────────

const DEPTS: [string, string][] = [["ACC", "Accounts"], ["HR", "HR"], ["OPS", "Operations"], ["SAL", "Sales"]];
const TYPES: [string, string][] = [["INV", "invoice"], ["PO", "purchase order"], ["LTR", "letter"], ["RPT", "report"]];

function docCode(rng: Rng, d: Difficulty, form: string): Item {
  const rules = [
    "Every office file is named YYYY-MM-DEPT-TYPE-SEQ, e.g. 2026-10-ACC-INV-007.",
    "DEPT: ACC Accounts, HR HR, OPS Operations, SAL Sales.",
    "TYPE: INV invoice, PO purchase order, LTR letter, RPT report.",
    "SEQ is a 3-digit running number for that department in that month, starting at 001.",
  ];
  if (d >= 3) rules.push("A corrected file keeps its name and adds -C1, -C2 … for each correction.");
  if (d >= 5) rules.push("Files for April–June use the financial year quarter instead of the month: 2026-Q1.");
  const [dc, dn] = rng.pick(DEPTS);
  const [tc, tn] = rng.pick(TYPES);
  const month = d >= 5 && rng.chance(0.5) ? rng.int(4, 6) : rng.int(7, 12);
  const year = 2026;
  const seq = rng.int(1, 40);
  const corr = d >= 3 ? rng.int(0, 2) : 0;
  const quarter = month >= 4 && month <= 6;
  const period = quarter && d >= 5 ? `${year}-Q1` : `${year}-${String(month).padStart(2, "0")}`;
  const name = `${period}-${dc}-${tc}-${String(seq).padStart(3, "0")}${corr ? `-C${corr}` : ""}`;
  const monthName = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month];
  const scenario = `Read the new file-naming rule:\n${rules.map((r) => `- ${r}`).join("\n")}`;
  const suffix = seq % 100 >= 11 && seq % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][seq % 10] ?? "th");
  const desc = `the ${seq}${suffix} ${tn} of ${dn} in ${monthName} ${year}${corr ? `, corrected ${corr} time${corr > 1 ? "s" : ""}` : ""}`;
  if (form === "encode") {
    const wrong = [
      `${year}-${String(month).padStart(2, "0")}-${tc}-${dc}-${String(seq).padStart(3, "0")}${corr ? `-C${corr}` : ""}`,
      `${period}-${dc}-${tc}-${seq}${corr ? `-C${corr}` : ""}`,
      `${period}-${dc}-${tc}-${String(seq).padStart(3, "0")}${corr ? "" : "-C1"}`,
      quarter && d >= 5 ? `${year}-${String(month).padStart(2, "0")}-${dc}-${tc}-${String(seq).padStart(3, "0")}${corr ? `-C${corr}` : ""}` : `${year}-${String(month).padStart(2, "0")}-${dc}-${tc}-${String(seq + 1).padStart(3, "0")}`,
    ];
    const o = singleChoice(rng, name, wrong.filter((w) => w !== name));
    return {
      type: "mcq", scenario, question: `What is the correct name for ${desc}?`, options: o.options,
      key: key({ correct: [o.index], explanation: `${period} · ${dc} (${dn}) · ${tc} (${tn}) · ${String(seq).padStart(3, "0")}${corr ? ` · -C${corr}` : ""} → ${name}.`, hints: hints("Build the name in the rule's order: period, department, type, number.", "The number always has three digits.") }),
    };
  }
  const q = d >= 3 && corr ? "How many times has this file been corrected?" : "What is this file's running number (as a plain number)?";
  return {
    type: "numeric", scenario, question: `A file is named ${name}. ${q}`, unit: "",
    key: key({ value: d >= 3 && corr ? corr : seq, tolerance: 0, explanation: `In ${name}, ${d >= 3 && corr ? `-C${corr} means ${corr} correction${corr > 1 ? "s" : ""}` : `the running number is ${String(seq).padStart(3, "0")} = ${seq}`}.`, hints: hints("Split the name at the dashes and label each part with the rule.", "Leading zeros do not change the number.") }),
  };
}

// ── Priority matrix (admin / all) ─────────────────────────────────────────────────────────────

const TASKS: { text: string; urgent: boolean; impact: boolean; legal?: boolean }[] = [
  { text: "File the GST return due tomorrow", urgent: true, impact: true, legal: true },
  { text: "Reply to a vendor asking about next year's rates", urgent: false, impact: false },
  { text: "Fix the payroll error before salaries go out today", urgent: true, impact: true },
  { text: "Plan the new joiner training for next month", urgent: false, impact: true },
  { text: "Order printer paper (two packs left)", urgent: true, impact: false },
  { text: "Renew the shop licence that expires in 3 weeks", urgent: false, impact: true, legal: true },
  { text: "Sort old visiting cards", urgent: false, impact: false },
  { text: "Book a cab for a client visit this afternoon", urgent: true, impact: false },
];

const TECH_TASKS: typeof TASKS = [
  { text: "Re-render the clip that blocks today's client delivery", urgent: true, impact: true },
  { text: "Remove a client's photos from the shared folder after their contract ended", urgent: false, impact: true, legal: true },
  { text: "Rename last month's export files", urgent: false, impact: false },
  { text: "Write a how-to for the new frame prompt template", urgent: false, impact: true },
  { text: "Reply to a teammate asking which font the poster used", urgent: true, impact: false },
  { text: "Top up Flow credits before tonight's render batch", urgent: true, impact: true },
  { text: "Try a new transition effect you saw online", urgent: false, impact: false },
  { text: "Copy today's files to the backup drive before the laptop goes for repair in an hour", urgent: true, impact: false },
];

function priorityMatrix(rng: Rng, d: Difficulty, tasks: typeof TASKS = TASKS): Item {
  const rules = [
    "Do now: urgent AND high impact.",
    "Schedule: not urgent but high impact.",
    "Delegate: urgent but low impact.",
    "Drop: neither urgent nor high impact.",
  ];
  if (d >= 3) rules.push("Exception: anything with a legal deadline is 'Do now', whatever else is true.");
  const t = rng.pick(d >= 3 ? tasks : tasks.filter((x) => !x.legal));
  let bucket = t.urgent && t.impact ? "Do now" : !t.urgent && t.impact ? "Schedule" : t.urgent ? "Delegate" : "Drop";
  if (d >= 3 && t.legal) bucket = "Do now";
  const scenario = `The office uses a new priority matrix:\n${rules.map((r) => `- ${r}`).join("\n")}\n\nTask: "${t.text}". (Urgent: ${t.urgent ? "yes" : "no"}; high impact: ${t.impact ? "yes" : "no"}${t.legal ? "; it has a legal deadline" : ""}.)`;
  const o = singleChoice(rng, bucket, ["Do now", "Schedule", "Delegate", "Drop"].filter((b) => b !== bucket));
  return {
    type: "mcq", scenario, question: "Where does this task go?", options: o.options,
    key: key({ correct: [o.index], explanation: `${t.urgent ? "Urgent" : "Not urgent"} and ${t.impact ? "high" : "low"} impact → ${t.legal && d >= 3 && !(t.urgent && t.impact) ? "normally another box, but the legal-deadline exception makes it" : ""} ${bucket}.`.replace(/\s+/g, " "), hints: hints("Answer the two questions first: urgent? high impact?", d >= 3 ? "Then check the exception." : "Then read the matching rule.") }),
  };
}

const LEARN_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["pace_score", "objection_map"],
  technical: ["job_code", "priority_matrix_tech"],
  admin: ["doc_code", "priority_matrix"],
};

const learnAndApply: Family = {
  id: "learn_and_apply",
  version: "1",
  dims: ["learning", "cognitive"],
  open: false,
  forms: ["decode", "encode"],
  settings: LEARN_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d, form, setting } = ctx;
    const made: Item = setting === "job_code" ? jobCode(rng, d, form)
      : setting === "pace_score" ? paceScore(rng, d, form)
      : setting === "objection_map" ? objectionMap(rng, d, form)
      : setting === "doc_code" ? docCode(rng, d, form)
      : priorityMatrix(rng, d, setting === "priority_matrix_tech" ? TECH_TASKS : TASKS);
    return { ...made, objective: "Learn an unfamiliar method and apply it correctly to a new case.", gap: "reading", teaches: true };
  },
};

export const LEARNING_FAMILIES: Family[] = [learnAndApply];
