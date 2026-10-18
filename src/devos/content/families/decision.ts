/**
 * Decision-Making families (MSRS §6 dim 7: choose effectively under constraints, uncertainty and trade-offs):
 *   • prioritize_value — limited hours, several options with value × chance; the best SET is found by exhaustive search
 *                        and, on harder items, differs from "biggest deal first" and "safest first";
 *   • weighted_choice  — a decision matrix with weights; harder items add a must-have that knocks out the top scorer.
 */
import type { Rng } from "../../core/rng.js";
import type { Difficulty, TrackId } from "../../core/types.js";
import { BUSINESSES, hints, key, rupees, singleChoice, table, type Family, type GenContext, type Generated } from "../kit.js";

// ═══ Expected value under a time budget ════════════════════════════════════════════════════════

interface ValueSetting { intro: (h: number) => string; itemWord: string; labels: (rng: Rng, n: number) => string[]; valueWord: string; money: boolean; range: [number, number] }

const VALUE: Record<string, ValueSetting> = {
  prospects: { intro: (h) => `You have ${h} hours of calling and visits left this week. Each prospect needs the hours shown; the chance is how likely they are to buy if you work on them.`, itemWord: "prospect", labels: (r, n) => r.sample(BUSINESSES, n), valueWord: "Deal value", money: true, range: [3, 30] },
  renewals: { intro: (h) => `You have ${h} hours this week for renewal follow-ups. Each client needs the hours shown; the chance is how likely they are to renew if you follow up.`, itemWord: "client", labels: (r, n) => r.sample(BUSINESSES, n), valueWord: "Monthly value", money: true, range: [4, 25] },
  fixes: { intro: (h) => `You have ${h} hours before the weekly release. Each fix needs the hours shown; the chance is how likely it is to work; the value is how many client complaints it would stop.`, itemWord: "fix", labels: (r, n) => r.sample(["Logo placement check", "Voice-over length guard", "Faster frame prompts", "Auto file naming", "Credit warning", "Drive upload retry", "Preview link fix"], n), valueWord: "Complaints stopped", money: false, range: [2, 20] },
  automations: { intro: (h) => `You have ${h} hours to set up automations this month. Each takes the hours shown; the chance is how likely it is to work reliably; the value is hours saved per month.`, itemWord: "automation", labels: (r, n) => r.sample(["Auto-reply on WhatsApp", "Drive folder per client", "Daily credit report", "Invoice reminder", "Render queue alert", "Script template filler"], n), valueWord: "Hours saved / month", money: false, range: [3, 24] },
  projects: { intro: (h) => `The office has ${h} hours of staff time this month for improvement projects. Each takes the hours shown; the chance is how likely it is to succeed; the value is the monthly saving.`, itemWord: "project", labels: (r, n) => r.sample(["Digital leave forms", "Vendor rate review", "Expense photo receipts", "Shared holiday calendar", "Payroll checklist", "Filing system clean-up"], n), valueWord: "Monthly saving", money: true, range: [2, 18] },
  purchases: { intro: (h) => `You have ${h} thousand rupees of budget this quarter. Each purchase costs the amount shown; the chance is how likely it is to deliver the benefit; the value is hours saved per month.`, itemWord: "purchase", labels: (r, n) => r.sample(["Second monitor set", "Label printer", "Better router", "Scanner", "UPS backup", "Laptop stand set"], n), valueWord: "Hours saved / month", money: false, range: [2, 16] },
};

const VALUE_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["prospects", "renewals"],
  technical: ["fixes", "automations"],
  admin: ["projects", "purchases"],
};

interface Opt { label: string; value: number; chance: number; hours: number; ev: number }

function subsets<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let m = 1; m < 1 << xs.length; m++) out.push(xs.filter((_, i) => m & (1 << i)));
  return out;
}

const fmtValue = (s: ValueSetting, v: number) => (s.money ? rupees(v * 1000) : String(v));
const setName = (xs: Opt[]) => xs.map((x) => x.label).sort().join(" + ");

const prioritizeValue: Family = {
  id: "prioritize_value",
  version: "1",
  dims: ["decision"],
  open: false,
  forms: ["best_set", "first_one"],
  settings: VALUE_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = VALUE[ctx.setting];
    const n = d <= 2 ? 3 : d <= 4 ? 4 : 5;
    for (let guard = 0; guard < 300; guard++) {
      const labels = s.labels(rng, n);
      const opts: Opt[] = labels.map((label) => {
        const value = rng.int(s.range[0], s.range[1]);
        const chance = rng.pick([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
        const hours = rng.int(2, 9);
        return { label, value, chance, hours, ev: Math.round(value * chance * 100) / 100 };
      });
      const budget = Math.max(...opts.map((o) => o.hours)) + rng.int(2, 6);
      const head = s.money ? `${s.valueWord}` : s.valueWord;
      const tbl = table([s.itemWord[0].toUpperCase() + s.itemWord.slice(1), head, "Chance", ctx.setting === "purchases" ? "Cost (₹ thousand)" : "Hours"],
        opts.map((o) => [o.label, fmtValue(s, o.value), `${Math.round(o.chance * 100)}%`, o.hours]));
      const scenario = `${s.intro(budget)}\n\n${tbl}`;
      const evList = opts.map((o) => `${o.label}: ${fmtValue(s, o.value)} × ${Math.round(o.chance * 100)}% = ${s.money ? rupees(o.ev * 1000) : o.ev}`).join("; ");
      if (ctx.form === "first_one") {
        const perHour = [...opts].sort((a, b) => b.ev / b.hours - a.ev / a.hours);
        if (perHour[0].ev / perHour[0].hours - perHour[1].ev / perHour[1].hours < 0.05 * (perHour[0].ev / perHour[0].hours)) continue;
        const biggest = [...opts].sort((a, b) => b.value - a.value)[0];
        if (d >= 3 && biggest === perHour[0]) continue;
        const o = singleChoice(rng, perHour[0].label, rng.shuffle(opts.filter((x) => x !== perHour[0])).map((x) => x.label), [], Math.min(4, n));
        return {
          type: "mcq", scenario, question: `If you can only start one ${s.itemWord} today, which gives the most expected value per hour?`, options: o.options,
          key: key({ correct: [o.index], explanation: `Expected value = value × chance: ${evList}. Per hour: ${perHour.map((x) => `${x.label} ${(x.ev / x.hours).toFixed(2)}`).join(", ")}. ${perHour[0].label} is best per hour.`, hints: hints("Multiply each value by its chance first.", "Then divide by the hours it takes.") }),
          objective: "Prioritise by expected value per unit of time.", gap: "tradeoff",
        };
      }
      const feasible = subsets(opts).filter((ss) => ss.reduce((h, x) => h + x.hours, 0) <= budget);
      const ranked = feasible.map((ss) => ({ ss, ev: Math.round(ss.reduce((v, x) => v + x.ev, 0) * 100) / 100 })).sort((a, b) => b.ev - a.ev);
      if (ranked.length < 4 || ranked[0].ev - ranked[1].ev < 0.4) continue;
      const greedy = (key2: (x: Opt) => number) => {
        const pick: Opt[] = [];
        let h = 0;
        for (const x of [...opts].sort((a, b) => key2(b) - key2(a))) if (h + x.hours <= budget) { pick.push(x); h += x.hours; }
        return pick;
      };
      const byValue = greedy((x) => x.value);
      const byChance = greedy((x) => x.chance);
      if (d >= 3 && setName(byValue) === setName(ranked[0].ss)) continue;
      const distract = [setName(byValue), setName(byChance), ...ranked.slice(1, 6).map((r) => setName(r.ss))].filter((x) => x !== setName(ranked[0].ss));
      const o = singleChoice(rng, setName(ranked[0].ss), [...new Set(distract)]);
      return {
        type: "mcq", scenario, question: `Which combination should you choose to get the most expected value within the ${ctx.setting === "purchases" ? "budget" : "hours"}?`, options: o.options,
        key: key({ correct: [o.index], explanation: `Expected value = value × chance: ${evList}. Of every combination that fits in ${budget}, ${setName(ranked[0].ss)} adds up to the most (${s.money ? rupees(ranked[0].ev * 1000) : ranked[0].ev}). Taking the biggest value first gives ${setName(byValue)} instead.`, hints: hints("Work out value × chance for each option.", `List the combinations that fit within ${budget} and add up their expected values.`) }),
        objective: "Choose the best set of options under a limit.", gap: "tradeoff",
      };
    }
    throw new Error("value puzzle did not settle");
  },
};

// ═══ Weighted decision matrix ══════════════════════════════════════════════════════════════════

interface MatrixSetting { intro: string; options: string[]; criteria: string[]; mustHave: { criterion: string; min: number; text: string } }

const MATRIX: Record<string, MatrixSetting> = {
  package_pick: { intro: "A school owner asks which package to start with. You score each package from 1 (poor) to 5 (great) on what she cares about.", options: ["Poster pack", "Wishes video", "Promotional video", "Monthly social media"], criteria: ["Fits budget", "Reach", "Speed to launch", "Builds repeat visits"], mustHave: { criterion: "Fits budget", min: 3, text: "She will not stretch the budget: 'Fits budget' must be 3 or more." } },
  offer_pick: { intro: "You must choose this month's festival offer for clients. Each offer is scored 1–5 on what the team agreed matters.", options: ["Free extra clip", "Bundle with poster", "Early-bird price", "Referral reward"], criteria: ["Margin kept", "Easy to explain", "Pulls new clients", "Delivery load"], mustHave: { criterion: "Margin kept", min: 3, text: "The owner's rule: 'Margin kept' must be 3 or more." } },
  ai_tool: { intro: "The studio must pick one AI image tool for frames. Each tool is scored 1–5.", options: ["Tool P", "Tool Q", "Tool R", "Tool S"], criteria: ["Image quality", "Cost", "Speed", "Data safety"], mustHave: { criterion: "Data safety", min: 3, text: "Client photos are uploaded, so 'Data safety' must be 3 or more." } },
  storage_pick: { intro: "The team must choose where finished videos are stored. Each option is scored 1–5.", options: ["Shared Drive", "External disk", "Paid cloud folder", "Each laptop"], criteria: ["Reliability", "Cost", "Easy sharing", "Backup safety"], mustHave: { criterion: "Backup safety", min: 3, text: "Losing a client's files is not acceptable: 'Backup safety' must be 3 or more." } },
  vendor_pick: { intro: "The office must choose a printing vendor for the year. Each vendor is scored 1–5.", options: ["Vendor 1", "Vendor 2", "Vendor 3", "Vendor 4"], criteria: ["Price", "Quality", "On-time delivery", "Payment terms"], mustHave: { criterion: "On-time delivery", min: 3, text: "Festival orders cannot be late: 'On-time delivery' must be 3 or more." } },
  schedule_pick: { intro: "The office must pick a new working-hours plan. Each plan is scored 1–5 by the team leads.", options: ["9–6 for all", "Two shifts", "Flexible start", "Six short days"], criteria: ["Client coverage", "Staff preference", "Cost", "Meeting overlap"], mustHave: { criterion: "Client coverage", min: 3, text: "Clients call all day: 'Client coverage' must be 3 or more." } },
};

const MATRIX_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["package_pick", "offer_pick"],
  technical: ["ai_tool", "storage_pick"],
  admin: ["vendor_pick", "schedule_pick"],
};

function weightsFor(rng: Rng, k: number): number[] {
  for (;;) {
    const w = [...Array(k)].map(() => rng.int(1, 6));
    const total = w.reduce((a, b) => a + b, 0);
    const pct = w.map((x) => Math.round((x / total) * 20) * 5);
    const sum = pct.reduce((a, b) => a + b, 0);
    pct[pct.indexOf(Math.max(...pct))] += 100 - sum;
    if (pct.every((x) => x >= 10)) return pct;
  }
}

const weightedChoice: Family = {
  id: "weighted_choice",
  version: "1",
  dims: ["decision", "critical"],
  open: false,
  forms: ["best", "best_with_must"],
  settings: MATRIX_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = MATRIX[ctx.setting];
    const useMust = ctx.form === "best_with_must";
    const k = d <= 2 ? 3 : 4;
    const criteria = s.criteria.slice(0, k).includes(s.mustHave.criterion) ? s.criteria.slice(0, k) : [...s.criteria.slice(0, k - 1), s.mustHave.criterion];
    const mustIdx = criteria.indexOf(s.mustHave.criterion);
    for (let guard = 0; guard < 400; guard++) {
      const w = weightsFor(rng, k);
      const opts = s.options.map((name) => ({ name, scores: criteria.map(() => rng.int(1, 5)) }));
      const total = (o: { scores: number[] }) => o.scores.reduce((t, sc, i) => t + sc * w[i], 0) / 100;
      const ranked = [...opts].sort((a, b) => total(b) - total(a));
      if (total(ranked[0]) - total(ranked[1]) < 0.15) continue;
      let winner = ranked[0];
      if (useMust) {
        if (ranked[0].scores[mustIdx] >= s.mustHave.min) continue; // the top scorer must fail the must-have
        const allowed = ranked.filter((o) => o.scores[mustIdx] >= s.mustHave.min);
        if (allowed.length < 2 || total(allowed[0]) - total(allowed[1]) < 0.15) continue;
        winner = allowed[0];
      }
      // Harder: the simple sum of scores must point elsewhere (weights matter).
      const simple = [...opts].sort((a, b) => b.scores.reduce((x, y) => x + y, 0) - a.scores.reduce((x, y) => x + y, 0));
      if (d >= 3 && simple[0] === winner) continue;
      const tbl = table(["Option", ...criteria.map((c, i) => `${c} (${w[i]}%)`)], opts.map((o) => [o.name, ...o.scores]));
      const scenario = `${s.intro}\n\n${tbl}${useMust ? `\n\n${s.mustHave.text}` : ""}`;
      const list = opts.map((o) => `${o.name} ${total(o).toFixed(2)}`).join(", ");
      const o = singleChoice(rng, winner.name, rng.shuffle(opts.filter((x) => x !== winner)).map((x) => x.name));
      return {
        type: "mcq", scenario, question: useMust ? "Which option should be chosen?" : "Which option has the best weighted score?", options: o.options,
        key: key({
          correct: [o.index],
          explanation: `Weighted score = Σ score × weight: ${list}.${useMust ? ` ${ranked[0].name} scores highest but fails the must-have (${s.mustHave.criterion} ${ranked[0].scores[mustIdx]} < ${s.mustHave.min}), so the best ALLOWED option is ${winner.name}.` : ` ${winner.name} is highest.`}`,
          hints: hints("Multiply each score by its weight and add them up for each option.", useMust ? "Cross out any option that fails the must-have BEFORE comparing totals." : "Do not just add the scores — the weights change the answer."),
        }),
        objective: "Decide with explicit criteria and constraints.", gap: "tradeoff",
      };
    }
    throw new Error("matrix did not settle");
  },
};

export const DECISION_FAMILIES: Family[] = [prioritizeValue, weightedChoice];
export type { Difficulty };
