/**
 * Problem-Solving families (MSRS §6 dim 5: identify root causes and develop effective solutions):
 *   • root_cause_table — an incident log where exactly ONE factor separates the failures from the successes (checked in
 *                        code), with red herrings; also "which next step would confirm it" (a controlled test, never a
 *                        guess — the brief §5.5: a correct diagnosis vs a plausible but unverified guess);
 *   • bottleneck       — a pipeline's slowest stage limits the whole output; what one more person changes.
 */
import type { Rng } from "../../core/rng.js";
import type { Difficulty, TrackId } from "../../core/types.js";
import { PEOPLE, hints, key, nearNumbers, singleChoice, table, type Family, type GenContext, type Generated } from "../kit.js";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ═══ Root cause from a log ══════════════════════════════════════════════════════════════════════

interface Attr { name: string; values: string[]; describe: (v: string) => string }
interface CauseSetting { intro: string; row: string; fail: string; ok: string; attrs: Attr[]; person: string }

const CAUSES: Record<string, CauseSetting> = {
  render_failures: {
    intro: "The studio's render log for the week (practice data). Some renders failed.", row: "Render", fail: "Failed", ok: "OK", person: "the editor",
    attrs: [
      { name: "Flow account", values: ["Account A", "Account B", "Account C"], describe: (v) => `renders on ${v}` },
      { name: "Clip length", values: ["6 s", "8 s", "10 s"], describe: (v) => `${v} clips` },
      { name: "Language", values: ["Telugu", "English", "Hindi"], describe: (v) => `${v} voice-overs` },
      { name: "Time", values: ["Morning", "Afternoon", "Evening"], describe: (v) => `renders started in the ${v.toLowerCase()}` },
    ],
  },
  upload_failures: {
    intro: "Upload attempts to the client Drive this week (practice data). Some uploads failed.", row: "Upload", fail: "Failed", ok: "Done", person: "the uploader",
    attrs: [
      { name: "Network", values: ["Office Wi-Fi", "Mobile data", "Home Wi-Fi"], describe: (v) => `uploads over ${v.toLowerCase()}` },
      { name: "File size", values: ["< 100 MB", "100–500 MB", "> 500 MB"], describe: (v) => `files of ${v}` },
      { name: "Browser", values: ["Chrome", "Edge", "Firefox"], describe: (v) => `uploads from ${v}` },
      { name: "Folder", values: ["Shared", "Personal", "Client"], describe: (v) => `uploads into the ${v.toLowerCase()} folder` },
    ],
  },
  lost_leads: {
    intro: "Last month's interested leads and what happened (practice data).", row: "Lead", fail: "Lost", ok: "Won", person: "the salesperson",
    attrs: [
      { name: "Source", values: ["Facebook ad", "Referral", "Old list"], describe: (v) => `leads from the ${v.toLowerCase()}` },
      { name: "First call", values: ["Within 1 hour", "Same day", "Next day"], describe: (v) => `leads first called ${v.toLowerCase()}` },
      { name: "Caller", values: ["Ravi", "Divya", "Teja"], describe: (v) => `leads called by ${v}` },
      { name: "Day", values: ["Mon–Tue", "Wed–Thu", "Fri–Sat"], describe: (v) => `leads that came in on ${v}` },
    ],
  },
  no_answers: {
    intro: "Today's call attempts (practice data). Many calls were not answered.", row: "Call", fail: "No answer", ok: "Answered", person: "the caller",
    attrs: [
      { name: "Time slot", values: ["10–12", "12–2", "2–4", "4–6"], describe: (v) => `calls made ${v}` },
      { name: "List", values: ["Old list", "New list"], describe: (v) => `calls to the ${v.toLowerCase()}` },
      { name: "Caller", values: ["Swathi", "Naveen", "Pooja"], describe: (v) => `calls by ${v}` },
      { name: "Business type", values: ["Shop", "Clinic", "School"], describe: (v) => `calls to a ${v.toLowerCase()}` },
    ],
  },
  late_invoices: {
    intro: "Invoices sent this month and whether they went out on time (practice data).", row: "Invoice", fail: "Late", ok: "On time", person: "the accounts assistant",
    attrs: [
      { name: "Prepared by", values: ["Madhavi", "Gopi", "Anusha"], describe: (v) => `invoices prepared by ${v}` },
      { name: "Client type", values: ["New", "Returning"], describe: (v) => `invoices for ${v.toLowerCase()} clients` },
      { name: "Approver", values: ["Manager", "Owner"], describe: (v) => `invoices approved by the ${v.toLowerCase()}` },
      { name: "Raised on", values: ["Mon–Tue", "Wed–Thu", "Fri–Sat"], describe: (v) => `invoices raised on ${v}` },
    ],
  },
  payroll_errors: {
    intro: "This month's payslips and whether they were correct (practice data).", row: "Payslip", fail: "Error", ok: "Correct", person: "the payroll clerk",
    attrs: [
      { name: "Team", values: ["Sales", "Studio", "Office"], describe: (v) => `${v.toLowerCase()} team payslips` },
      { name: "Attendance from", values: ["App", "Paper sheet"], describe: (v) => `payslips whose attendance came from the ${v.toLowerCase()}` },
      { name: "Joined", values: ["This month", "Earlier"], describe: (v) => `people who joined ${v.toLowerCase()}` },
      { name: "Pay type", values: ["Fixed", "Incentive"], describe: (v) => `${v.toLowerCase()} pay` },
    ],
  },
};

const CAUSE_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["lost_leads", "no_answers"],
  technical: ["render_failures", "upload_failures"],
  admin: ["late_invoices", "payroll_errors"],
};

interface LogRow { vals: string[]; failed: boolean }

/** Every (attribute, value) that is present in ALL failures and in NO success. */
function separators(rows: LogRow[], nAttr: number): [number, string][] {
  const out: [number, string][] = [];
  for (let a = 0; a < nAttr; a++) {
    const failVals = new Set(rows.filter((r) => r.failed).map((r) => r.vals[a]));
    if (failVals.size !== 1) continue;
    const v = [...failVals][0];
    if (!rows.some((r) => !r.failed && r.vals[a] === v)) out.push([a, v]);
  }
  return out;
}

function buildLog(rng: Rng, s: CauseSetting, d: Difficulty): { rows: LogRow[]; cause: [number, string]; herring: [number, string] | null; attrs: Attr[] } {
  const attrs = rng.sample(s.attrs, d <= 2 ? 3 : 4);
  const n = d <= 2 ? 6 : d <= 4 ? 7 : 8;
  for (let guard = 0; guard < 400; guard++) {
    const ca = rng.int(0, attrs.length - 1);
    const cv = rng.pick(attrs[ca].values);
    const failures = rng.int(2, Math.max(2, Math.floor(n / 2)));
    const rows: LogRow[] = [];
    for (let i = 0; i < n; i++) {
      const failed = i < failures;
      const vals = attrs.map((a, ai) => {
        if (ai === ca) return failed ? cv : rng.pick(a.values.filter((v) => v !== cv));
        return rng.pick(a.values);
      });
      rows.push({ vals, failed });
    }
    const seps = separators(rows, attrs.length);
    if (seps.length !== 1 || seps[0][0] !== ca) continue;
    // A red herring for harder logs: another value in most (not all) failures that also appears in a success.
    let herring: [number, string] | null = null;
    for (let a = 0; a < attrs.length && !herring; a++) {
      if (a === ca) continue;
      for (const v of attrs[a].values) {
        const inFail = rows.filter((r) => r.failed && r.vals[a] === v).length;
        const inOk = rows.filter((r) => !r.failed && r.vals[a] === v).length;
        if (inFail >= Math.max(2, failures - 1) && inOk >= 1) { herring = [a, v]; break; }
      }
    }
    if (d >= 3 && !herring) continue;
    return { rows: rng.shuffle(rows), cause: [ca, cv], herring, attrs };
  }
  throw new Error("log did not settle");
}

const rootCause: Family = {
  id: "root_cause_table",
  version: "1",
  dims: ["problem", "logical"],
  open: false,
  forms: ["cause", "next_step"],
  settings: CAUSE_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = CAUSES[ctx.setting];
    const { rows, cause, herring, attrs } = buildLog(rng, s, d);
    const tbl = table(["#", ...attrs.map((a) => a.name), "Result"], rows.map((r, i) => [i + 1, ...r.vals, r.failed ? s.fail : s.ok]));
    const scenario = `${s.intro}\n\n${tbl}`;
    const causeText = attrs[cause[0]].describe(cause[1]);
    if (ctx.form === "cause") {
      const correct = cap(causeText);
      const others: string[] = [];
      if (herring) others.push(cap(attrs[herring[0]].describe(herring[1])));
      for (const [ai, a] of attrs.entries()) for (const v of a.values) {
        if (ai === cause[0] && v === cause[1]) continue;
        if (rows.some((r) => r.failed && r.vals[ai] === v)) others.push(cap(a.describe(v)));
      }
      const opts = singleChoice(rng, correct, [...new Set(others)]);
      const failN = rows.filter((r) => r.failed).length;
      return {
        type: "mcq", scenario, question: `Which factor best explains the ${s.fail.toLowerCase()} results?`, options: opts.options,
        key: key({
          correct: [opts.index],
          explanation: `All ${failN} ${s.fail.toLowerCase()} rows have ${attrs[cause[0]].name} = ${cause[1]}, and no ${s.ok.toLowerCase()} row has it. ${herring ? `${cap(attrs[herring[0]].describe(herring[1]))} appear in most failures too, but also in a row that worked — so they cannot be the cause on their own.` : "Every other factor appears in both kinds of rows."}`,
          hints: hints(`For one factor at a time, ask: does every ${s.fail.toLowerCase()} row share a value that no ${s.ok.toLowerCase()} row has?`, "A factor that also shows up in a row that worked cannot be the whole story."),
        }),
        objective: "Find the root cause from evidence, not from the most common factor.", gap: "evidence",
      };
    }
    const other = attrs.find((_, i) => i !== cause[0])!;
    const correct = `Run the next ${s.row.toLowerCase()} with only "${attrs[cause[0]].name}" changed from ${cause[1]}, keep everything else the same, and compare`;
    const distract = [
      `Change "${attrs[cause[0]].name}" and "${other.name}" together on the next ${s.row.toLowerCase()} to fix it faster`,
      `Wait until there are more failures before testing anything`,
      `Ask ${s.person} to be more careful next time`,
      `Change every setting at once so the problem goes away`,
    ];
    const opts = singleChoice(rng, correct, distract);
    return {
      type: "mcq", scenario: `${scenario}\n\nThe team suspects ${causeText}.`, question: "Which next step would best CONFIRM the cause?", options: opts.options,
      key: key({
        correct: [opts.index],
        explanation: `Changing ONE factor and keeping the rest the same shows whether that factor really causes it. Changing several things at once fixes nothing you can explain; waiting or blaming tests nothing.`,
        hints: hints("A good test changes one thing at a time.", "Which option would tell you for sure, whatever the result?"),
      }),
      objective: "Confirm a suspected cause with a controlled test.", gap: "evidence",
    };
  },
};

// ═══ Bottleneck ═════════════════════════════════════════════════════════════════════════════════

interface Stage { name: string; unitPerPerson: [number, number] }
interface PipeSetting { what: string; per: string; stages: Stage[] }

const PIPES: Record<string, PipeSetting> = {
  ad_pipeline: { what: "finished ads", per: "day", stages: [
    { name: "Script writing", unitPerPerson: [5, 9] }, { name: "Frame generation", unitPerPerson: [3, 6] },
    { name: "Clip rendering", unitPerPerson: [2, 5] }, { name: "Editing", unitPerPerson: [3, 6] }, { name: "Review", unitPerPerson: [8, 14] } ] },
  poster_pipeline: { what: "finished posters", per: "day", stages: [
    { name: "Brief reading", unitPerPerson: [10, 16] }, { name: "Prompt writing", unitPerPerson: [6, 10] },
    { name: "Image generation", unitPerPerson: [4, 8] }, { name: "Text and logo layout", unitPerPerson: [5, 9] }, { name: "Approval", unitPerPerson: [12, 20] } ] },
  deal_pipeline: { what: "closed sales", per: "week", stages: [
    { name: "Calling", unitPerPerson: [20, 40] }, { name: "Sending samples", unitPerPerson: [15, 30] },
    { name: "Quoting", unitPerPerson: [8, 16] }, { name: "Closing visits", unitPerPerson: [4, 9] } ] },
  renewal_pipeline: { what: "renewals", per: "week", stages: [
    { name: "Report preparation", unitPerPerson: [5, 10] }, { name: "Renewal calls", unitPerPerson: [8, 15] },
    { name: "Payment follow-up", unitPerPerson: [6, 12] }, { name: "Next-month setup", unitPerPerson: [4, 8] } ] },
  invoice_pipeline: { what: "invoices sent", per: "day", stages: [
    { name: "Preparing", unitPerPerson: [8, 15] }, { name: "Checking", unitPerPerson: [10, 18] },
    { name: "Approving", unitPerPerson: [12, 25] }, { name: "Sending", unitPerPerson: [20, 40] } ] },
  hiring_pipeline: { what: "new joiners onboarded", per: "month", stages: [
    { name: "Screening", unitPerPerson: [10, 20] }, { name: "Interviews", unitPerPerson: [4, 8] },
    { name: "Offer letters", unitPerPerson: [6, 12] }, { name: "Joining paperwork", unitPerPerson: [3, 7] } ] },
};

const PIPE_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["deal_pipeline", "renewal_pipeline"],
  technical: ["ad_pipeline", "poster_pipeline"],
  admin: ["invoice_pipeline", "hiring_pipeline"],
};

const bottleneck: Family = {
  id: "bottleneck",
  version: "1",
  dims: ["problem", "decision"],
  open: false,
  forms: ["which", "output", "improve"],
  settings: PIPE_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = PIPES[ctx.setting];
    for (let guard = 0; guard < 200; guard++) {
      const withPeople = d >= 2;
      const stages = s.stages.map((st) => {
        const rate = rng.int(st.unitPerPerson[0], st.unitPerPerson[1]);
        const people = withPeople ? rng.int(1, 3) : 1;
        return { name: st.name, rate, people, cap: rate * people };
      });
      const sorted = [...stages].sort((a, b) => a.cap - b.cap);
      if (sorted[0].cap === sorted[1].cap) continue;
      if (ctx.form === "which" && d >= 2) {
        // The trap: the stage with the slowest PER-PERSON rate must not be the bottleneck.
        const slowestRate = [...stages].sort((a, b) => a.rate - b.rate)[0];
        if (slowestRate === sorted[0]) continue;
      }
      const after = sorted[0].cap + sorted[0].rate;
      const improved = Math.min(after, sorted[1].cap);
      if (ctx.form === "improve" && d >= 4 && improved === after) continue; // make the next bottleneck matter
      const rows = stages.map((st) => (withPeople ? [st.name, st.people, `${st.rate} per person`] : [st.name, `${st.cap} per ${s.per}`]));
      const tbl = table(withPeople ? ["Stage", "People", `Each person per ${s.per}`] : ["Stage", `Capacity per ${s.per}`], rows);
      const scenario = `Every ${s.what.replace(/s$/, "")} passes through each stage in order (practice data).\n\n${tbl}`;
      const capList = stages.map((st) => `${st.name} ${withPeople ? `${st.people} × ${st.rate} = ` : ""}${st.cap}`).join("; ");
      const h = hints(`A stage can pass on at most (people × each person's rate) per ${s.per}.`, "The whole line can never go faster than its slowest stage.");
      if (ctx.form === "which") {
        const opts = singleChoice(rng, sorted[0].name, rng.shuffle(stages.filter((x) => x !== sorted[0])).map((x) => x.name));
        return {
          type: "mcq", scenario, question: "Which stage limits how many get finished?", options: opts.options,
          key: key({ correct: [opts.index], explanation: `Capacity per ${s.per}: ${capList}. ${sorted[0].name} is the lowest at ${sorted[0].cap}, so it is the bottleneck.`, hints: h }),
          objective: "Find the constraint that limits a whole process.", gap: "calculation",
        };
      }
      if (ctx.form === "output") {
        return {
          type: "numeric", scenario, question: `At most how many ${s.what} can the team finish per ${s.per}?`, unit: "",
          key: key({ value: sorted[0].cap, tolerance: 0, explanation: `Capacity per ${s.per}: ${capList}. The slowest stage sets the pace: ${sorted[0].cap}.`, hints: h }),
          objective: "Find the constraint that limits a whole process.", gap: "calculation",
        };
      }
      const who = rng.pick(PEOPLE);
      return {
        type: "numeric", scenario: `${scenario}\n\n${who} joins the ${sorted[0].name.toLowerCase()} stage and works at the same rate as the others there.`,
        question: `Now at most how many ${s.what} can the team finish per ${s.per}?`, unit: "",
        key: key({
          value: improved, tolerance: 0,
          explanation: `${sorted[0].name} rises from ${sorted[0].cap} to ${after}. ${improved < after ? `Now ${sorted[1].name} (${sorted[1].cap}) is the slowest stage, so the output is ${improved}.` : `It is still the slowest stage, so the output is ${improved}.`}`,
          hints: hints("Add one person's rate to that stage.", "Then check again which stage is now the slowest — the bottleneck can move."),
        }),
        objective: "Predict how a change moves the constraint.", gap: "calculation",
      };
    }
    throw new Error("pipeline did not settle");
  },
};

export const PROBLEM_FAMILIES: Family[] = [rootCause, bottleneck];
export { nearNumbers };
