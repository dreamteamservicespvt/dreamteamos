/**
 * Critical Thinking families (MSRS §6 dim 4: evaluate information, assumptions, claims and evidence):
 *   • claim_check        — does the data support, contradict, or not settle a claim? (rates vs totals, two changes at once,
 *                          tiny samples); also "which extra data would test it";
 *   • fact_or_assumption — which statement goes beyond what was actually said.
 * MSRS §5.4 of the brief: justified uncertainty ("not enough information") is a correct answer when it is the truth.
 */
import type { Rng } from "../../core/rng.js";
import type { TrackId } from "../../core/types.js";
import { PEOPLE, hints, key, singleChoice, table, type Family, type GenContext, type Generated } from "../kit.js";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ═══ Claim check ═════════════════════════════════════════════════════════════════════════════════

interface ClaimSetting {
  groupWord: string;
  groups: [string, string];
  total: string;
  success: string;
  rate: string;
  higherBetter: boolean;
  change: string;
  confound: string;
  controlTest: string;
  weakTests: string[];
  range: [number, number];
}

const CLAIMS: Record<string, ClaimSetting> = {
  campaign_claim: {
    groupWord: "month", groups: ["September", "October"], total: "calls answered", success: "sales", rate: "sales per answered call", higherBetter: true,
    change: "the new opening script", confound: "the team also started calling after 5 PM, when owners are free",
    controlTest: "Compare a week where ONLY the new script was used against a week where ONLY the calling time changed",
    weakTests: ["Ask the salespeople whether they like the new script", "Count how many calls were made in total last year", "Check which salesperson made the most calls in October"],
    range: [80, 220],
  },
  caller_claim: {
    groupWord: "salesperson", groups: ["Ravi", "Divya"], total: "calls answered", success: "sales", rate: "sales per answered call", higherBetter: true,
    change: "Ravi's habit of sending a sample video before the call", confound: "Ravi was given the referral leads this month while Divya got the old list",
    controlTest: "Compare both salespeople on the SAME lead source over the same weeks",
    weakTests: ["Ask Ravi how confident he felt on his calls", "Count how many WhatsApp messages each sent in total", "Check who joined the company earlier"],
    range: [50, 160],
  },
  model_claim: {
    groupWord: "Flow account", groups: ["Account A", "Account B"], total: "clips made", success: "clips rejected", rate: "rejection rate", higherBetter: false,
    change: "Account B's newer prompt template", confound: "Account B was used mostly for simple poster animations this week",
    controlTest: "Run the same set of jobs through both accounts with only the prompt template different",
    weakTests: ["Ask the editor which account feels faster", "Count the total credits each account has left", "Check which account was created first"],
    range: [40, 150],
  },
  vendor_claim: {
    groupWord: "tool", groups: ["Old editor", "New editor"], total: "videos exported", success: "exports that failed", rate: "failure rate", higherBetter: false,
    change: "the new editor", confound: "the office internet was upgraded in the same week the new editor was installed",
    controlTest: "Export the same videos on the same internet connection with each editor",
    weakTests: ["Read the reviews on the vendor's own website", "Ask which editor has the nicer screen", "Check how much each editor costs per year"],
    range: [30, 120],
  },
  process_claim: {
    groupWord: "month", groups: ["August", "September"], total: "invoices issued", success: "invoices paid within 7 days", rate: "share paid within 7 days", higherBetter: true,
    change: "the new WhatsApp payment reminder", confound: "September also had the festival season, when clients pay faster",
    controlTest: "Send the reminder to half of the clients in the same month and compare the two halves",
    weakTests: ["Ask the accounts team whether they like sending reminders", "Count all invoices issued since January", "Check which client paid the largest amount"],
    range: [30, 110],
  },
  policy_claim: {
    groupWord: "quarter", groups: ["April–June", "July–September"], total: "person-days scheduled", success: "absent days", rate: "absence rate", higherBetter: false,
    change: "the new half-day leave option", confound: "the monsoon fell in July–September",
    controlTest: "Compare the same months of two years, before and after the half-day option",
    weakTests: ["Ask the managers whether the rule is fair", "Count how many people joined this year", "Check which team has the biggest office"],
    range: [500, 1200],
  },
};

const CLAIM_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["campaign_claim", "caller_claim"],
  technical: ["model_claim", "vendor_claim"],
  admin: ["process_claim", "policy_claim"],
};

type ClaimKind = "true_rate" | "false_rate" | "count_trap" | "confound" | "small_sample";

const VERDICTS = ["Supported by the data", "Contradicted by the data", "Not enough information to decide"] as const;

const claimCheck: Family = {
  id: "claim_check",
  version: "1",
  dims: ["critical"],
  open: false,
  forms: ["verdict", "best_test"],
  settings: CLAIM_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = CLAIMS[ctx.setting];
    const kinds: Record<number, ClaimKind[]> = { 1: ["true_rate", "false_rate"], 2: ["false_rate", "count_trap", "true_rate"], 3: ["count_trap", "confound"], 4: ["confound", "small_sample", "count_trap"], 5: ["confound", "small_sample"] };
    const kind: ClaimKind = ctx.form === "best_test" ? rng.pick(["confound", "small_sample"] as ClaimKind[]) : rng.pick(kinds[d]);
    const small = kind === "small_sample";
    const [g0, g1] = s.groups;
    let t0: number, t1: number, s0: number, s1: number;
    for (let guard = 0; ; guard++) {
      if (guard > 200) throw new Error("claim data did not settle");
      t0 = small ? rng.int(4, 9) : rng.int(s.range[0], s.range[1]);
      t1 = small ? rng.int(4, 9) : rng.int(s.range[0], s.range[1]);
      const lo = s.higherBetter ? 0.05 : 0.04;
      const hi = s.higherBetter ? 0.3 : 0.25;
      s0 = Math.max(small ? 0 : 1, Math.round(t0 * (lo + rng.next() * (hi - lo))));
      s1 = Math.max(small ? 0 : 1, Math.round(t1 * (lo + rng.next() * (hi - lo))));
      if (small) { s0 = rng.int(0, 2); s1 = s0 + rng.int(1, 2); if (s1 > t1) continue; }
      const r0 = s0 / t0;
      const r1 = s1 / t1;
      if (Math.abs(r0 - r1) < 0.03 && !small) continue;
      if (kind === "count_trap" && !((s1 > s0 && r1 < r0) || (s0 > s1 && r0 < r1))) continue;
      break;
    }
    const r0 = s0 / t0;
    const r1 = s1 / t1;
    const pc = (x: number) => `${Math.round(x * 1000) / 10}%`;
    const better1 = s.higherBetter ? r1 > r0 : r1 < r0; // group 1 did better
    const winner = better1 ? g1 : g0;
    const loser = better1 ? g0 : g1;
    let claim: string;
    let verdict: (typeof VERDICTS)[number];
    let why: string;
    const rates = `${g0}: ${s0}/${t0} = ${pc(r0)}; ${g1}: ${s1}/${t1} = ${pc(r1)}`;
    if (kind === "true_rate") {
      claim = `${winner} had a better ${s.rate} than ${loser}.`;
      verdict = VERDICTS[0];
      why = `${cap(s.rate)}: ${rates}. ${winner} is better, so the claim holds.`;
    } else if (kind === "false_rate") {
      claim = `${loser} had a better ${s.rate} than ${winner}.`;
      verdict = VERDICTS[1];
      why = `${cap(s.rate)}: ${rates}. ${winner} is actually better, so the data contradicts the claim.`;
    } else if (kind === "count_trap") {
      const moreCount = s1 > s0 ? g1 : g0;
      claim = s.higherBetter
        ? `${moreCount} had more ${s.success}, so ${moreCount} had the better ${s.rate}.`
        : `${moreCount === g1 ? g0 : g1} had fewer ${s.success}, so it had the better ${s.rate}.`;
      const claimedBetter = s.higherBetter ? moreCount : (moreCount === g1 ? g0 : g1);
      verdict = claimedBetter === winner ? VERDICTS[0] : VERDICTS[1];
      why = `Totals mislead when the ${s.total} differ. ${cap(s.rate)}: ${rates}. ${winner} is better${claimedBetter === winner ? " — the claim is right, though for the wrong reason" : ", so the claim is wrong"}.`;
    } else if (kind === "confound") {
      claim = `${cap(s.change)} caused ${winner === g1 ? `${g1}'s` : `the difference in`} ${s.rate}.`;
      verdict = VERDICTS[2];
      why = `The rates differ (${rates}), but two things changed at the same time: ${s.change}, and ${s.confound}. The data cannot say which one made the difference.`;
    } else {
      claim = `${winner}'s ${s.rate} is clearly better, so it will stay better.`;
      verdict = VERDICTS[2];
      why = `Only ${t0} and ${t1} ${s.total} were counted (${rates}). One or two results either way would flip the comparison — too few to decide.`;
    }
    const context = kind === "confound" ? ` Between the two ${s.groupWord}s, ${s.change} was introduced, and ${s.confound}.` : kind === "small_sample" ? " These are the first few days only." : "";
    const scenario = `Practice data for two ${s.groupWord}s.${context}\n\n${table([cap(s.groupWord), cap(s.total), cap(s.success)], [[g0, t0, s0], [g1, t1, s1]])}`;
    if (ctx.form === "best_test") {
      const correct = kind === "confound" ? s.controlTest : `Collect results over many more ${s.total} before comparing`;
      const opts = singleChoice(rng, correct, [...s.weakTests, kind === "confound" ? "Collect results over a few more days in exactly the same way" : s.controlTest]);
      return {
        type: "mcq", scenario: `${scenario}\n\nSomeone claims: "${claim}"`, question: "Which extra information would best test this claim?",
        options: opts.options,
        key: key({ correct: [opts.index], explanation: `${why} ${kind === "confound" ? "Only a comparison that changes one thing at a time separates the two causes." : "A bigger sample shows whether the gap is real or chance."}`, hints: hints("What else could explain the difference?", "Pick the test that rules out the other explanation, not one that just adds opinions.") }),
        objective: "Find the evidence that would actually test a claim.", gap: "evidence",
      };
    }
    const opts = singleChoice(rng, verdict, VERDICTS.filter((v) => v !== verdict), [], 3);
    return {
      type: "mcq", scenario: `${scenario}\n\nSomeone claims: "${claim}"`, question: "How does the data relate to the claim?",
      options: opts.options,
      key: key({ correct: [opts.index], explanation: why, hints: hints(`Work out the ${s.rate} for each ${s.groupWord} — not just the totals.`, "Ask: did anything else change? Is the sample big enough?") }),
      objective: "Judge whether evidence supports a claim.", gap: verdict === VERDICTS[2] ? "assumption" : "evidence",
    };
  },
};

// ═══ Fact or assumption ══════════════════════════════════════════════════════════════════════════

interface FactBank { story: (name: string) => string; facts: string[]; assumptions: string[] }

const FACTS: Record<string, FactBank> = {
  client_call_notes: {
    story: (n) => `${n}'s notes from a call with a jewellery shop owner: "He liked the sample video we sent. He asked the price of a 4-clip promotional video. His son runs the shop's Instagram page. He wants to decide after Diwali. He did not mention discounts."`,
    facts: ["The owner liked the sample video.", "He asked about the price of a 4-clip promotional video.", "His son runs the shop's Instagram page.", "He wants to decide after Diwali."],
    assumptions: ["He will buy after Diwali.", "His son has to approve the purchase.", "The price is too high for him.", "He is not interested in a discount.", "He has already chosen another agency."],
  },
  lost_deal_notes: {
    story: (n) => `${n} wrote after a lost deal: "The restaurant owner said our quote was ₹2,000 more than another agency's. She said our sample was better. She asked if we could match the price. We said we could not go below our approved price."`,
    facts: ["Our quote was ₹2,000 more than another agency's.", "She said our sample was better.", "She asked whether we could match the price.", "We did not go below our approved price."],
    assumptions: ["She chose the other agency only because of price.", "The other agency's work is worse.", "She would have paid if we had called again.", "She will come back next month.", "Her budget is exactly the other agency's price."],
  },
  bug_report: {
    story: (n) => `${n} logged a client complaint: "The client says the logo looks blurry on her phone. We exported the clip at 1080×1920. She watched it after we sent it on WhatsApp. On the editor's laptop the same file looks sharp."`,
    facts: ["The client says the logo looks blurry on her phone.", "The clip was exported at 1080×1920.", "She watched it after it was sent on WhatsApp.", "The file looks sharp on the editor's laptop."],
    assumptions: ["WhatsApp compression made the logo blurry.", "Her phone screen is damaged.", "The export settings were wrong.", "The logo file we used was low quality.", "She watched it with a slow internet connection."],
  },
  tool_review: {
    story: (n) => `${n} tried a new AI image tool for one week: "It made 40 frames. 31 were usable without edits. It costs ₹1,500 a month. It does not keep a history of prompts. The vendor says it is the fastest tool on the market."`,
    facts: ["It made 40 frames in the week.", "31 frames were usable without edits.", "It costs ₹1,500 a month.", "It does not keep a history of prompts."],
    assumptions: ["It is the fastest tool on the market.", "It would make 31 usable frames out of 40 every week.", "It is better than our current tool.", "The missing prompt history will cause mistakes.", "The team will like using it."],
  },
  policy_update: {
    story: (n) => `${n}'s note to the office: "From November, leave must be asked for 2 days ahead. Last month 6 leave requests came on the same day they were needed. The manager said this made planning hard. Emergencies can still be reported by phone."`,
    facts: ["From November, leave must be asked for 2 days ahead.", "Last month 6 leave requests came on the day they were needed.", "The manager said same-day requests made planning hard.", "Emergencies can still be reported by phone."],
    assumptions: ["Same-day leave caused late deliveries last month.", "Everyone will follow the new rule.", "Most same-day requests were not real emergencies.", "The rule will reduce leave taken.", "Other offices already use this rule."],
  },
  vendor_quote: {
    story: (n) => `${n} collected a printing quote: "The vendor quoted ₹6 per pamphlet for 2,000 pamphlets. Delivery takes 4 working days. The price includes GST. They printed for us once last year."`,
    facts: ["The vendor quoted ₹6 per pamphlet for 2,000 pamphlets.", "Delivery takes 4 working days.", "The quoted price includes GST.", "They printed for us once last year."],
    assumptions: ["Their print quality is good.", "They will deliver on time.", "₹6 is the cheapest price available.", "Last year's order went well.", "They can print 5,000 at the same price."],
  },
};

const FACT_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["client_call_notes", "lost_deal_notes"],
  technical: ["bug_report", "tool_review"],
  admin: ["policy_update", "vendor_quote"],
};

const factOrAssumption: Family = {
  id: "fact_or_assumption",
  version: "1",
  dims: ["critical"],
  open: false,
  forms: ["find_assumption", "find_fact"],
  settings: FACT_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 4,
  generate(ctx: GenContext): Generated {
    const { rng } = ctx;
    const bank = FACTS[ctx.setting];
    const who = rng.pick(PEOPLE);
    const scenario = bank.story(who);
    if (ctx.form === "find_assumption") {
      const correct = rng.pick(bank.assumptions);
      const opts = singleChoice(rng, correct, rng.shuffle(bank.facts));
      return {
        type: "mcq", scenario, question: "Which statement is an ASSUMPTION — not stated in the note?", options: opts.options,
        key: key({ correct: [opts.index], explanation: `"${correct}" may be true, but nothing in the note says it. The other three are written in the note itself.`, hints: hints("For each statement, find the words in the note that say it.", "An assumption sounds likely but has no sentence behind it.") }),
        objective: "Separate stated facts from assumptions.", gap: "assumption",
      };
    }
    const correct = rng.pick(bank.facts);
    const opts = singleChoice(rng, correct, rng.shuffle(bank.assumptions));
    return {
      type: "mcq", scenario, question: "Which statement is a FACT the note actually states?", options: opts.options,
      key: key({ correct: [opts.index], explanation: `Only "${correct}" is written in the note. The others are guesses that may or may not be true.`, hints: hints("Look for the statement you can point to in the note word for word.", "Words like 'will', 'because' or 'better' often signal a guess.") }),
      objective: "Separate stated facts from assumptions.", gap: "assumption",
    };
  },
};

export const CRITICAL_FAMILIES: Family[] = [claimCheck, factOrAssumption];
export const __claimKindsForTests: ClaimKind[] = ["true_rate", "false_rate", "count_trap", "confound", "small_sample"];
export type { Rng };
