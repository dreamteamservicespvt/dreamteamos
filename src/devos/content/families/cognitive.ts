/**
 * Cognitive Ability families (MSRS §6 dim 1: understand information and apply it to a new situation):
 *   • rule_application — a short rule set is given, then one case to work out (price, approver, credits, deduction…);
 *   • data_table       — read a small table and compare RATES (the row with the biggest count is rarely the best rate).
 * The rule sets echo how DTS works (packages, the 10% discount authority, Flow credits per clip length, half-day leave,
 * GST) but every scenario is a practice case: names and numbers are invented (MSRS §13.1).
 */
import type { Rng } from "../../core/rng.js";
import type { Difficulty, TrackId } from "../../core/types.js";
import { BUSINESSES, PEOPLE, hints, key, nearNumbers, rupees, singleChoice, table, type Family, type GenContext, type Generated } from "../kit.js";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

interface RuleCase { rules: string[]; caseText: string; answer: number; unit: string; mistakes: number[]; working: string; question: string; choiceLabel?: (v: number) => string }

// ── Rule sets ─────────────────────────────────────────────────────────────────────────────────

function packagePrice(rng: Rng, d: Difficulty): RuleCase {
  const types = [{ name: "wishes video", base: 2999 }, { name: "promotional video", base: 4999 }];
  const t = rng.pick(types);
  const clips = d >= 2 ? rng.int(4, 8) : 4;
  const lang = d >= 2 && rng.chance(0.6);
  const rush = d >= 3 && rng.chance(0.7);
  const returning = d >= 4 && rng.chance(0.7);
  const gst = d >= 5;
  const rules = [`A ${types[0].name} costs ${rupees(2999)} and a ${types[1].name} ${rupees(4999)}, each with 4 clips.`];
  if (d >= 2) rules.push(`Each clip beyond 4 adds ${rupees(600)}.`, `A voice-over in a second language adds ${rupees(500)}.`);
  if (d >= 3) rules.push("Delivery in under 48 hours adds a rush fee of 20% of the price so far.");
  if (d >= 4) rules.push("A returning client gets 10% off — but never off the rush fee.");
  if (gst) rules.push("Finally, 18% GST is added to the whole amount.");
  const extra = Math.max(0, clips - 4) * 600;
  const sub = t.base + extra + (lang ? 500 : 0);
  const rushFee = rush ? Math.round(sub * 0.2) : 0;
  const disc = returning ? Math.round(sub * 0.1) : 0;
  let total = sub + rushFee - disc;
  const beforeTax = total;
  if (gst) total = Math.round(total * 1.18);
  const client = rng.pick(BUSINESSES);
  const bits = [`a ${t.name} with ${clips} clips`];
  if (d >= 2) bits.push(lang ? "a second-language voice-over" : "one language only");
  if (d >= 3) bits.push(rush ? "delivery tomorrow (under 48 hours)" : "delivery in 5 days");
  if (d >= 4) bits.push(returning ? "they ordered from us last year" : "a first-time client");
  const mistakes = [
    total - (gst ? Math.round(extra * 1.18) : extra),
    returning ? (gst ? Math.round((sub + rushFee) * 0.9 * 1.18) : Math.round((sub + rushFee) * 0.9)) : total + 500,
    rush ? (gst ? Math.round((t.base * 1.2 + extra + (lang ? 500 : 0) - disc) * 1.18) : Math.round(t.base * 1.2 + extra + (lang ? 500 : 0) - disc)) : total + 600,
    gst ? beforeTax : total - 600,
  ];
  const steps = [`base ${rupees(t.base)}`];
  if (extra) steps.push(`+ ${rupees(extra)} for ${clips - 4} extra clip${clips - 4 > 1 ? "s" : ""}`);
  if (lang) steps.push(`+ ${rupees(500)} second language = ${rupees(sub)}`);
  if (rushFee) steps.push(`rush 20% of ${rupees(sub)} = ${rupees(rushFee)}`);
  if (disc) steps.push(`returning-client 10% of ${rupees(sub)} (not the rush fee) = −${rupees(disc)}`);
  if (gst) steps.push(`${rupees(beforeTax)} + 18% GST = ${rupees(total)}`);
  return {
    rules, caseText: `${client} wants ${bits.join(", ")}.`, answer: total, unit: "₹", mistakes,
    working: `${steps.join("; ")}. Final price: ${rupees(total)}.`, question: "What is the final price?", choiceLabel: rupees,
  };
}

function discountRoute(rng: Rng, d: Difficulty): RuleCase & { routeOptions: string[]; routeIndex: number } {
  const review = d >= 2 && rng.chance(0.6);
  const referral = d >= 3 && rng.chance(0.6);
  const earned = review || referral ? 10 : 0;
  const extraChoices = d >= 4 ? [5, 10, 15, 20, 25] : [5, 8, 10, 12, 15];
  let extra = rng.pick(extraChoices);
  if (d >= 5 && rng.chance(0.5)) extra = rng.pick([10, 20]) - earned; // a boundary case: exactly 10% or 20% in total
  extra = Math.max(0, extra);
  const total = earned + extra;
  const route = total <= 10 ? 0 : total <= 20 ? 1 : total <= 30 ? 2 : 3;
  const routes = ["The salesperson alone", "The sales admin", "The main admin", "It is not allowed"];
  const rules = [
    "A salesperson may give up to 10% discount on their own.",
    "Above 10% and up to 20%, the sales admin must approve.",
    "Above 20% and up to 30%, the main admin must approve; above 30% is never allowed.",
  ];
  if (d >= 2) rules.push("An earned discount (a Google review OR a referral) is worth 10%. Having both still counts as 10% — they do not stack.");
  if (d >= 2) rules.push("An earned discount and an extra discount add up.");
  const facts: string[] = [];
  if (review) facts.push("left a Google review");
  if (referral) facts.push("was referred by another client");
  const who = rng.pick(PEOPLE);
  const caseText = `${who} is closing a sale with ${rng.pick(BUSINESSES)}${facts.length ? `, who ${facts.join(" and ")}` : ""}. ${extra ? `${who} wants to add an extra ${extra}% discount.` : `${who} adds no extra discount beyond what the client earned.`}`;
  return {
    rules, caseText, answer: total, unit: "%", mistakes: [earned * (review && referral ? 2 : 1) + extra, extra, total + 10],
    working: `Earned discount: ${earned}%${review && referral ? " (review and referral do not stack)" : ""}. Extra: ${extra}%. Total ${total}% → ${routes[route].toLowerCase()}${route < 3 ? " decides" : ""}.`,
    question: "Who must approve this discount?",
    routeOptions: routes,
    routeIndex: route,
  };
}

const RATES: Record<number, number> = { 4: 7, 6: 10, 8: 12, 10: 15 };

function flowCredits(rng: Rng, d: Difficulty): RuleCase & { left: number } {
  const lengths = d <= 2 ? [8] : d === 3 ? [8, 6] : [4, 6, 8, 10];
  const groups = rng.sample(lengths, Math.min(lengths.length, d <= 2 ? 1 : d === 3 ? 2 : 3)).map((len) => ({ len, count: rng.int(2, d >= 4 ? 6 : 4) }));
  const rerenders = d >= 2 ? rng.int(1, 3) : 0;
  const rerenderLen = groups[0].len;
  const total = groups.reduce((s, g) => s + g.count * RATES[g.len], 0) + rerenders * RATES[rerenderLen];
  const left = Math.max(40, total + rng.int(-25, 30));
  const rules = ["Flow charges per clip by length: 4 s = 7 credits, 6 s = 10, 8 s = 12, 10 s = 15.", "A clip rendered again costs its full credits again."];
  const job = groups.map((g) => `${g.count} clip${g.count > 1 ? "s" : ""} of ${g.len} s`).join(", ");
  const caseText = `A job needs ${job}.${rerenders ? ` ${rerenders} of the ${rerenderLen}-second clip${rerenders > 1 ? "s have" : " has"} to be rendered again after the client's change.` : ""} The Flow account has ${left} credits left.`;
  const parts = groups.map((g) => `${g.count} × ${RATES[g.len]} = ${g.count * RATES[g.len]}`);
  if (rerenders) parts.push(`re-renders ${rerenders} × ${RATES[rerenderLen]} = ${rerenders * RATES[rerenderLen]}`);
  return {
    rules, caseText, answer: total, unit: "credits",
    mistakes: [total - rerenders * RATES[rerenderLen], groups.reduce((s, g) => s + g.count, 0) * 12 + rerenders * 12, total + RATES[rerenderLen]],
    working: `${parts.join("; ")}. Total ${total} credits; ${left >= total ? `${left - total} left after the job` : `short by ${total - left}`}.`,
    question: "How many credits does the whole job use?", left,
  };
}

function specLookup(rng: Rng, d: Difficulty): RuleCase {
  const secs = rng.pick(d <= 2 ? [20, 30, 45] : [40, 48, 55, 64, 75, 88]);
  const rules = [
    "Instagram Reel: 9:16, up to 90 s.",
    "YouTube Shorts: 9:16, up to 60 s.",
    "Facebook feed: 1:1 or 4:5, up to 120 s.",
    "WhatsApp Status: 9:16, up to 30 s per status — a longer video is split into several statuses.",
  ];
  const answer = Math.ceil(secs / 30);
  return {
    rules, caseText: `A client's finished ad is ${secs} seconds long and must go on WhatsApp Status without cutting anything.`,
    answer, unit: "statuses", mistakes: [Math.floor(secs / 30) || 2, answer + 1, Math.round(secs / 30) === answer ? answer + 2 : Math.round(secs / 30)],
    working: `Each status holds 30 s: ${secs} ÷ 30 = ${(secs / 30).toFixed(2)}, rounded UP → ${answer} statuses.`,
    question: "How many WhatsApp statuses does it need?",
  };
}

function leaveDeduction(rng: Rng, d: Difficulty): RuleCase {
  const rate = rng.pick([500, 600, 650, 700, 750]);
  const salary = rate * 26;
  const full = rng.int(1, d >= 3 ? 4 : 3);
  const half = d >= 2 ? rng.int(0, 3) : 0;
  const comp = d >= 4 ? rng.int(0, 1) : 0;
  const unapproved = d >= 5 ? rng.int(1, 2) : 0;
  const rules = ["Each month has 2 days of paid leave.", "A half-day leave counts as half a day.", "Leave beyond the 2 days is unpaid; one unpaid day costs the monthly salary ÷ 26."];
  if (d >= 4) rules.push("A comp-off day (earned by working on a holiday) cancels one unpaid day.");
  if (d >= 5) rules.push("An absence without approved leave costs 1.5 × the day's pay.");
  const leaveDays = full + half * 0.5;
  const unpaid = Math.max(0, Math.max(0, leaveDays - 2) - comp);
  const deduction = Math.round(unpaid * rate + unapproved * 1.5 * rate);
  const who = rng.pick(PEOPLE);
  const parts = [`${full} full-day leave${full > 1 ? "s" : ""}`];
  if (half) parts.push(`${half} half-day leave${half > 1 ? "s" : ""}`);
  if (comp) parts.push("1 comp-off day earned");
  if (unapproved) parts.push(`${unapproved} absence${unapproved > 1 ? "s" : ""} without approved leave`);
  return {
    rules, caseText: `${who} earns ${rupees(salary)} a month. This month: ${parts.join(", ")}.`, answer: deduction, unit: "₹",
    mistakes: [Math.round(leaveDays * rate), Math.round(Math.max(0, full - 2) * rate + unapproved * 1.5 * rate), deduction + rate],
    working: `Leave taken: ${leaveDays} day${leaveDays === 1 ? "" : "s"}; beyond the allowance: ${Math.max(0, leaveDays - 2)}${comp ? `, minus 1 comp-off = ${unpaid}` : ""}. Day rate ${rupees(salary)} ÷ 26 = ${rupees(rate)}. Deduction: ${unpaid} × ${rupees(rate)}${unapproved ? ` + ${unapproved} × 1.5 × ${rupees(rate)}` : ""} = ${rupees(deduction)}.`,
    question: "How much is deducted from the salary this month?", choiceLabel: rupees,
  };
}

function gstInvoice(rng: Rng, d: Difficulty): RuleCase {
  const amount = rng.pick([4999, 5900, 11800, 7500, 2360, 9440, 15000]);
  const inclusive = d >= 2 && rng.chance(0.6);
  const discount = d >= 4 ? rng.pick([0.05, 0.1]) : 0;
  const rules = ["GST is 18%.", "'Plus GST' means 18% is added on top of the price.", "'Including GST' means the tax is already inside: tax = price × 18 ÷ 118.", "Round to the nearest rupee."];
  if (discount) rules.push("A discount is taken off the price before any tax is worked out.");
  const price = Math.round(amount * (1 - discount));
  const tax = inclusive ? Math.round((price * 18) / 118) : Math.round(price * 0.18);
  const q = inclusive ? "How much GST is inside the price?" : "What is the total the client pays?";
  const answer = inclusive ? tax : price + tax;
  return {
    rules, caseText: `An invoice for ${rng.pick(BUSINESSES)} is for ${rupees(amount)} ${inclusive ? "including GST" : "plus GST"}${discount ? `, with a ${discount * 100}% discount` : ""}.`,
    answer, unit: "₹",
    mistakes: inclusive ? [Math.round(price * 0.18), Math.round(amount * 18 / 118), tax + 18] : [Math.round(amount * 1.18), price, Math.round(price * 1.18) + 100],
    working: inclusive
      ? `${discount ? `After the discount: ${rupees(price)}. ` : ""}Tax inside = ${rupees(price)} × 18 ÷ 118 = ${rupees(tax)}.`
      : `${discount ? `After the discount: ${rupees(price)}. ` : ""}${rupees(price)} + 18% (${rupees(tax)}) = ${rupees(price + tax)}.`,
    question: q, choiceLabel: rupees,
  };
}

const RULE_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["package_price", "discount_route"],
  technical: ["flow_credits", "spec_lookup"],
  admin: ["leave_deduction", "gst_invoice"],
};

const ruleApplication: Family = {
  id: "rule_application",
  version: "1",
  dims: ["cognitive", "learning"],
  open: false,
  forms: ["compute", "choose"],
  settings: RULE_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const intro = "Read these rules carefully — they apply only to this case:";
    if (ctx.setting === "discount_route") {
      const c = discountRoute(rng, d);
      if (ctx.form === "choose") {
        const opts = singleChoice(rng, c.routeOptions[c.routeIndex], c.routeOptions.filter((_, i) => i !== c.routeIndex));
        return {
          type: "mcq", scenario: `${intro}\n${c.rules.map((r) => `- ${r}`).join("\n")}\n\n${c.caseText}`, question: c.question,
          options: opts.options, key: key({ correct: [opts.index], explanation: c.working, hints: hints("First work out the TOTAL discount.", "Check whether the earned discounts stack before you add the extra.") }),
          objective: "Apply a newly stated rule set correctly to a case.", gap: "reading",
        };
      }
      return {
        type: "numeric", scenario: `${intro}\n${c.rules.map((r) => `- ${r}`).join("\n")}\n\n${c.caseText}`, question: "What is the client's total discount, in percent?", unit: "%",
        key: key({ value: c.answer, tolerance: 0, explanation: c.working, hints: hints("List each discount the client qualifies for.", "Two earned discounts still count once.") }),
        objective: "Apply a newly stated rule set correctly to a case.", gap: "reading",
      };
    }
    const build = { package_price: packagePrice, flow_credits: flowCredits, spec_lookup: specLookup, leave_deduction: leaveDeduction, gst_invoice: gstInvoice }[ctx.setting];
    if (!build) throw new Error(`unknown setting ${ctx.setting}`);
    const c = build(rng, d);
    const scenario = `${intro}\n${c.rules.map((r) => `- ${r}`).join("\n")}\n\n${c.caseText}`;
    const h = hints("Go through the rules in order and note which ones apply to this case.", "Write the working as a running total — check each rule against the case once more at the end.");
    if (ctx.form === "choose") {
      const label = c.choiceLabel ?? ((v: number) => `${v} ${c.unit}`);
      const distract = nearNumbers(rng, c.answer, c.mistakes, c.unit === "₹" ? 100 : 1).map(label);
      const opts = singleChoice(rng, label(c.answer), distract);
      return { type: "mcq", scenario, question: c.question, options: opts.options, key: key({ correct: [opts.index], explanation: c.working, hints: h }), objective: "Apply a newly stated rule set correctly to a case.", gap: "calculation" };
    }
    return {
      type: "numeric", scenario, question: c.question, unit: c.unit,
      key: key({ value: c.answer, tolerance: c.unit === "₹" ? 1 : 0, explanation: c.working, hints: h }),
      objective: "Apply a newly stated rule set correctly to a case.", gap: "calculation",
    };
  },
};

// ── Data tables ────────────────────────────────────────────────────────────────────────────────

interface TableSetting { rowWord: string; labels: (rng: Rng, n: number) => string[]; totalCol: string; partCol: string; metric: string; higherBetter: boolean; totalRange: [number, number]; rateRange: [number, number] }

const TABLES: Record<string, TableSetting> = {
  member_funnel: { rowWord: "salesperson", labels: (r, n) => r.sample(PEOPLE, n), totalCol: "Calls answered", partCol: "Sales", metric: "sales per answered call", higherBetter: true, totalRange: [40, 140], rateRange: [0.04, 0.22] },
  source_funnel: { rowWord: "lead source", labels: (r, n) => r.sample(["Old call list", "Facebook ad", "Referral", "Walk-in", "Instagram", "Justdial", "Pamphlet"], n), totalCol: "Leads", partCol: "Sold", metric: "share of leads sold", higherBetter: true, totalRange: [30, 260], rateRange: [0.03, 0.3] },
  model_quality: { rowWord: "Flow account", labels: (r, n) => r.sample(["Account A", "Account B", "Account C", "Account D", "Account E", "Account F"], n), totalCol: "Clips made", partCol: "Clips rejected", metric: "rejection rate", higherBetter: false, totalRange: [30, 160], rateRange: [0.04, 0.3] },
  member_delivery: { rowWord: "team member", labels: (r, n) => r.sample(PEOPLE, n), totalCol: "Jobs", partCol: "Delivered on time", metric: "on-time rate", higherBetter: true, totalRange: [12, 60], rateRange: [0.55, 0.97] },
  weekly_invoices: { rowWord: "week", labels: (_r, n) => [...Array(n).keys()].map((i) => `Week ${i + 1}`), totalCol: "Invoices issued", partCol: "Paid within 7 days", metric: "share paid within 7 days", higherBetter: true, totalRange: [15, 70], rateRange: [0.3, 0.9] },
  team_attendance: { rowWord: "team", labels: (r, n) => r.sample(["Sales A", "Sales B", "Studio", "Social Media", "Accounts", "Front office"], n), totalCol: "Person-days scheduled", partCol: "Absent days", metric: "absence rate", higherBetter: false, totalRange: [60, 240], rateRange: [0.02, 0.14] },
};

const TABLE_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["member_funnel", "source_funnel"],
  technical: ["model_quality", "member_delivery"],
  admin: ["weekly_invoices", "team_attendance"],
};

interface Row { label: string; total: number; part: number; rate: number }

function buildRows(rng: Rng, s: TableSetting, n: number, trap: boolean): Row[] {
  for (let guard = 0; guard < 200; guard++) {
    const labels = s.labels(rng, n);
    const rows = labels.map((label) => {
      const total = rng.int(s.totalRange[0], s.totalRange[1]);
      const rate = s.rateRange[0] + rng.next() * (s.rateRange[1] - s.rateRange[0]);
      const part = Math.max(1, Math.round(total * rate));
      return { label, total, part, rate: part / total };
    });
    const best = [...rows].sort((a, b) => (s.higherBetter ? b.rate - a.rate : a.rate - b.rate));
    if (Math.abs(best[0].rate - best[1].rate) < 0.02) continue; // a clear winner
    if (new Set(rows.map((r) => Math.round(r.rate * 100))).size !== rows.length) continue; // distinct whole percents
    const mostPart = [...rows].sort((a, b) => b.part - a.part)[0];
    if (trap && (mostPart === best[0] || (!s.higherBetter && [...rows].sort((a, b) => a.part - b.part)[0] === best[0]))) continue;
    return rows;
  }
  throw new Error("table did not settle");
}

const dataTable: Family = {
  id: "data_table",
  version: "1",
  dims: ["cognitive", "critical"],
  open: false,
  forms: ["best_rate", "rate_value", "supported"],
  settings: TABLE_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = TABLES[ctx.setting];
    const n = d <= 2 ? 4 : d <= 4 ? 5 : 6;
    const rows = buildRows(rng, s, n, d >= 2);
    const tbl = table([cap(s.rowWord), s.totalCol, s.partCol], rows.map((r) => [r.label, r.total, r.part]));
    const scenario = `Last month's numbers (practice data):\n\n${tbl}`;
    const ranked = [...rows].sort((a, b) => (s.higherBetter ? b.rate - a.rate : a.rate - b.rate));
    const pc = (r: Row) => `${Math.round(r.rate * 1000) / 10}%`;
    const rateList = rows.map((r) => `${r.label} ${r.part}/${r.total} = ${pc(r)}`).join("; ");
    const h = hints(`The ${s.metric} is ${s.partCol.toLowerCase()} ÷ ${s.totalCol.toLowerCase()} — not the biggest number in a column.`, "Work the rate out for every row before choosing.");
    if (ctx.form === "best_rate") {
      const word = s.higherBetter ? "best (highest)" : "best (lowest)";
      const opts = singleChoice(rng, ranked[0].label, rng.shuffle(ranked.slice(1)).map((r) => r.label));
      return {
        type: "mcq", scenario, question: `Which ${s.rowWord} has the ${word} ${s.metric}?`, options: opts.options,
        key: key({ correct: [opts.index], explanation: `${cap(s.metric)}: ${rateList}. ${ranked[0].label} is best at ${pc(ranked[0])}.`, hints: h }),
        objective: "Turn raw counts into the right comparison.", gap: "calculation",
      };
    }
    if (ctx.form === "rate_value") {
      const r = rng.pick(rows);
      const v = Math.round(r.rate * 1000) / 10;
      return {
        type: "numeric", scenario, question: `What is ${r.label}'s ${s.metric}, in percent (one decimal place is fine)?`, unit: "%",
        key: key({ value: v, tolerance: 0.6, explanation: `${r.part} ÷ ${r.total} = ${(r.part / r.total).toFixed(4)} → ${v}%.`, hints: h }),
        objective: "Turn raw counts into the right comparison.", gap: "calculation",
      };
    }
    const [a, b] = rng.sample(rows, 2);
    const better = (x: Row, y: Row) => (s.higherBetter ? x.rate > y.rate : x.rate < y.rate);
    const truth = better(a, b) ? `${a.label} has a better ${s.metric} than ${b.label}.` : `${b.label} has a better ${s.metric} than ${a.label}.`;
    const mostPart = [...rows].sort((x, y) => y.part - x.part)[0];
    const wrong = [
      better(a, b) ? `${b.label} has a better ${s.metric} than ${a.label}.` : `${a.label} has a better ${s.metric} than ${b.label}.`,
      mostPart !== ranked[0] ? `${mostPart.label} has the best ${s.metric} because it has the most ${s.partCol.toLowerCase()}.` : `${ranked[1].label} has the best ${s.metric}.`,
      `Every ${s.rowWord} has a ${s.metric} above ${Math.round(Math.max(...rows.map((r) => r.rate)) * 100) + 5}%.`,
      `${ranked[ranked.length - 1].label} has the best ${s.metric}.`,
    ];
    const opts = singleChoice(rng, truth, wrong);
    return {
      type: "mcq", scenario, question: "Which statement does the table support?", options: opts.options,
      key: key({ correct: [opts.index], explanation: `${cap(s.metric)}: ${rateList}. Only "${truth}" matches.`, hints: h }),
      objective: "Turn raw counts into the right comparison.", gap: "evidence",
    };
  },
};

export const COGNITIVE_FAMILIES: Family[] = [ruleApplication, dataTable];
