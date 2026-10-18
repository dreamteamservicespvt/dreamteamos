/**
 * Logical Reasoning families (MSRS §6 dim 2): ordering puzzles, conditional reasoning, number patterns.
 * Answers are computed by exhaustive search / evaluation — a clue set is accepted only when the asked fact is forced.
 */
import type { Rng } from "../../core/rng.js";
import type { Difficulty, TrackId } from "../../core/types.js";
import { BUSINESSES, ORDINAL, PEOPLE, PROJECT_NAMES, hints, key, nearNumbers, singleChoice, type Family, type GenContext, type Generated } from "../kit.js";

// ═══ 1. Ordering puzzle ═════════════════════════════════════════════════════════════════════════

interface OrderSetting { intro: (n: number) => string; unit: string; verb: string; pool: "biz" | "people" | "projects" }

const ORDER_SETTINGS: Record<string, OrderSetting> = {
  call_list: { intro: (n) => `${n} leads must be called this morning, one after another.`, unit: "call", verb: "is called", pool: "biz" },
  demo_visits: { intro: (n) => `A salesperson will visit ${n} shops today to show sample ads, one visit at a time.`, unit: "visit", verb: "is visited", pool: "biz" },
  followup_queue: { intro: (n) => `${n} clients are waiting for a follow-up WhatsApp message; they are sent one by one.`, unit: "follow-up", verb: "gets its follow-up", pool: "biz" },
  renewal_calls: { intro: (n) => `${n} social-media clients are due for renewal and get one renewal call each, in turn.`, unit: "renewal call", verb: "gets the renewal call", pool: "biz" },
  render_queue: { intro: (n) => `${n} ad projects are queued to render in Flow, one at a time.`, unit: "render", verb: "is rendered", pool: "projects" },
  upload_order: { intro: (n) => `${n} finished videos are uploaded to the team Drive one after another.`, unit: "upload", verb: "is uploaded", pool: "projects" },
  review_queue: { intro: (n) => `The team leader reviews ${n} handed-in jobs, one by one.`, unit: "review", verb: "is reviewed", pool: "projects" },
  frame_batch: { intro: (n) => `${n} frame sets are generated in ChatGPT, one set at a time.`, unit: "frame set", verb: "is generated", pool: "projects" },
  meeting_slots: { intro: (n) => `The manager has ${n} one-to-one meetings today, back to back.`, unit: "meeting", verb: "is met", pool: "people" },
  invoice_batch: { intro: (n) => `${n} invoices are prepared today, one at a time.`, unit: "invoice", verb: "is invoiced", pool: "biz" },
  payroll_checks: { intro: (n) => `${n} team members' attendance is checked before payroll, one by one.`, unit: "check", verb: "is checked", pool: "people" },
  vendor_calls: { intro: (n) => `${n} vendors are called for quotes this afternoon, one call each.`, unit: "vendor call", verb: "is called", pool: "biz" },
};

const ORDER_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["call_list", "demo_visits", "followup_queue", "renewal_calls"],
  technical: ["render_queue", "upload_order", "review_queue", "frame_batch"],
  admin: ["meeting_slots", "invoice_batch", "payroll_checks", "vendor_calls"],
};

type Perm = number[]; // pos[entity] = position (0-based)

function allPerms(n: number): Perm[] {
  const out: Perm[] = [];
  const rec = (arr: number[], used: boolean[]) => {
    if (arr.length === n) {
      const pos = new Array(n);
      arr.forEach((e, i) => (pos[e] = i));
      out.push(pos);
      return;
    }
    for (let e = 0; e < n; e++) if (!used[e]) { used[e] = true; arr.push(e); rec(arr, used); arr.pop(); used[e] = false; }
  };
  rec([], new Array(n).fill(false));
  return out;
}

interface Clue { kind: string; text: string; test: (p: Perm) => boolean; sig: string }

function entityPool(rng: Rng, pool: OrderSetting["pool"], n: number): string[] {
  if (pool === "people") return rng.sample(PEOPLE, n);
  if (pool === "projects") return rng.sample(PROJECT_NAMES, n).map((p) => `the ${p}`);
  return rng.sample(BUSINESSES, n);
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function makeClue(rng: Rng, kinds: string[], H: Perm, E: string[], s: OrderSetting): Clue | null {
  const n = H.length;
  const kind = rng.pick(kinds);
  const at = (pos: number) => H.indexOf(pos);
  if (kind === "pos") {
    const e = rng.int(0, n - 1);
    return { kind, sig: `pos${e}`, text: `${cap(E[e])} is the ${ORDINAL[H[e] + 1]} ${s.unit}.`, test: (p) => p[e] === H[e] };
  }
  if (kind === "notpos") {
    const e = rng.int(0, n - 1);
    const k = rng.pick([...Array(n).keys()].filter((x) => x !== H[e]));
    return { kind, sig: `np${e}${k}`, text: `${cap(E[e])} is not the ${ORDINAL[k + 1]} ${s.unit}.`, test: (p) => p[e] !== k };
  }
  if (kind === "before") {
    const [a, b] = rng.sample([...Array(n).keys()], 2).sort((x, y) => H[x] - H[y]);
    return { kind, sig: `b${a}${b}`, text: `${cap(E[a])} ${s.verb} before ${E[b]}.`, test: (p) => p[a] < p[b] };
  }
  if (kind === "rightbefore") {
    const k = rng.int(0, n - 2);
    const a = at(k);
    const b = at(k + 1);
    return { kind, sig: `rb${a}${b}`, text: `${cap(E[a])} ${s.verb} immediately before ${E[b]}.`, test: (p) => p[b] === p[a] + 1 };
  }
  if (kind === "between") {
    const trio = rng.sample([...Array(n).keys()], 3).sort((x, y) => H[x] - H[y]);
    const [a, b, c] = rng.chance(0.5) ? trio : [trio[2], trio[1], trio[0]];
    return { kind, sig: `bt${a}${b}${c}`, text: `${cap(E[b])} comes somewhere between ${E[a]} and ${E[c]}.`, test: (p) => Math.min(p[a], p[c]) < p[b] && p[b] < Math.max(p[a], p[c]) };
  }
  if (kind === "apart") {
    const pairs: [number, number][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (Math.abs(H[a] - H[b]) > 1) pairs.push([a, b]);
    if (!pairs.length) return null;
    const [a, b] = rng.pick(pairs);
    return { kind, sig: `ap${a}${b}`, text: `${cap(E[a])} and ${E[b]} are not next to each other.`, test: (p) => Math.abs(p[a] - p[b]) > 1 };
  }
  return null;
}

const ORDER_KINDS: Record<Difficulty, string[]> = {
  1: ["pos", "before", "before"],
  2: ["pos", "before", "notpos", "before"],
  3: ["before", "rightbefore", "notpos", "pos"],
  4: ["before", "rightbefore", "between", "apart", "notpos"],
  5: ["before", "rightbefore", "between", "apart", "notpos"],
};

function orderText(order: number[], E: string[]) {
  return order.map((e) => E[e]).join(" → ");
}

const orderPuzzle: Family = {
  id: "order_puzzle",
  version: "1",
  dims: ["logical"],
  open: false,
  forms: ["kth", "position_of", "must"],
  settings: ORDER_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = ORDER_SETTINGS[ctx.setting];
    const n = d <= 2 ? 4 : d === 3 ? 5 : d === 4 ? 5 : 6;
    const E = entityPool(rng, s.pool, n);
    const perms = allPerms(n);
    const H = rng.pick(perms);
    const k = d <= 2 ? rng.int(0, n - 1) : rng.int(1, n - 2);
    const target = rng.int(0, n - 1);
    const goal = (cands: Perm[]): boolean => {
      if (ctx.form === "kth") return new Set(cands.map((p) => p.indexOf(k))).size === 1;
      if (ctx.form === "position_of") return new Set(cands.map((p) => p[target])).size === 1;
      return cands.length <= (d <= 2 ? 1 : 4);
    };
    let cands = perms;
    const clues: Clue[] = [];
    const sigs = new Set<string>();
    for (let guard = 0; guard < 80 && !goal(cands); guard++) {
      const c = makeClue(rng, ORDER_KINDS[d], H, E, s);
      if (!c || sigs.has(c.sig)) continue;
      const next = cands.filter(c.test);
      if (next.length === cands.length) continue;
      // Never an exact-position clue that answers the question outright.
      if (c.kind === "pos") {
        const e = Number(c.sig.slice(3));
        if ((ctx.form === "kth" && H[e] === k) || (ctx.form === "position_of" && e === target)) continue;
      }
      sigs.add(c.sig);
      clues.push(c);
      cands = next;
    }
    if (!goal(cands) || clues.length < 2) throw new Error("order puzzle did not converge");
    const solution = [...Array(n).keys()].sort((a, b) => cands[0][a] - cands[0][b]);
    const unique = cands.length === 1;
    const scenario = `${s.intro(n)} The order must follow these clues:\n${clues.map((c) => `- ${c.text}`).join("\n")}`;
    let question: string;
    let opts: { options: string[]; index: number };
    let because: string;
    if (ctx.form === "kth") {
      const who = cands[0].indexOf(k);
      question = `Who is the ${ORDINAL[k + 1]} ${s.unit}?`;
      opts = singleChoice(rng, cap(E[who]), rng.shuffle(E.filter((_, i) => i !== who)).map(cap));
      because = unique
        ? `The only order that fits every clue is ${orderText(solution, E)}, so the ${ORDINAL[k + 1]} ${s.unit} is ${E[who]}.`
        : `Every order that fits the clues puts ${E[who]} ${ORDINAL[k + 1]} — for example ${orderText(solution, E)}.`;
    } else if (ctx.form === "position_of") {
      const pos = cands[0][target];
      question = `In which position is ${E[target]}?`;
      const label = (i: number) => cap(ORDINAL[i + 1]);
      opts = singleChoice(rng, label(pos), rng.shuffle([...Array(n).keys()].filter((i) => i !== pos)).map(label));
      because = `${cap(E[target])} can only be ${ORDINAL[pos + 1]}: ${unique ? `the one order that fits is ${orderText(solution, E)}` : `every order that fits the clues has it there, e.g. ${orderText(solution, E)}`}.`;
    } else {
      const statements: { text: string; must: boolean; could: boolean }[] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const asClue = clues.some((c) => c.sig === `b${a}${b}` || c.sig === `rb${a}${b}`);
        if (asClue) continue;
        const holds = cands.map((p) => p[a] < p[b]);
        statements.push({ text: `${cap(E[a])} ${s.verb} before ${E[b]}.`, must: holds.every(Boolean), could: holds.some(Boolean) });
      }
      const musts = statements.filter((x) => x.must);
      if (!musts.length) throw new Error("no derived must-statement");
      const correct = rng.pick(musts);
      const couldOnly = rng.shuffle(statements.filter((x) => !x.must && x.could)).map((x) => x.text);
      const never = rng.shuffle(statements.filter((x) => !x.could)).map((x) => x.text);
      question = "Which statement MUST be true?";
      opts = singleChoice(rng, correct.text, [...couldOnly.slice(0, 2), ...never]);
      because = `${correct.text.replace(/\.$/, "")} in every order that fits the clues (for example ${orderText(solution, E)}). The other statements are true in some orders or in none.`;
    }
    const anchor = clues.find((c) => c.kind === "pos") ?? clues.find((c) => c.kind === "rightbefore") ?? clues[0];
    return {
      type: "mcq",
      scenario,
      question,
      options: opts.options,
      key: key({
        correct: [opts.index],
        explanation: because,
        hints: hints(
          `Draw ${n} blanks (1st … ${ORDINAL[n]}) and start with "${anchor.text}"`,
          d >= 3 ? "Treat every 'immediately before' pair as one block, then test where the block can sit." : "Use each 'before' clue to cross out positions that are too early or too late.",
        ),
      }),
      objective: "Infer what must follow from a set of ordering facts.",
      gap: "reading",
    };
  },
};

// ═══ 2. Conditional reasoning ══════════════════════════════════════════════════════════════════

interface Prop { yes: string; no: string }

const PROPS: Record<string, { intro: string; props: Prop[] }> = {
  discount_rules: { intro: "In this practice scenario a sales team follows these rules about one sale:", props: [
    { yes: "the discount is above 10%", no: "the discount is not above 10%" },
    { yes: "the sales admin must approve the sale", no: "the sales admin does not need to approve the sale" },
    { yes: "the order reaches the tech team today", no: "the order does not reach the tech team today" },
    { yes: "the client paid an advance", no: "the client has not paid an advance" },
    { yes: "the salesperson sends the invoice", no: "the salesperson does not send the invoice" } ] },
  lead_rules: { intro: "In this practice scenario a calling team follows these rules about one lead:", props: [
    { yes: "the lead answered the call", no: "the lead did not answer the call" },
    { yes: "a follow-up is booked", no: "no follow-up is booked" },
    { yes: "the lead is marked interested", no: "the lead is not marked interested" },
    { yes: "the number goes back to the pool", no: "the number stays with the salesperson" },
    { yes: "a sample video is sent", no: "no sample video is sent" } ] },
  render_rules: { intro: "In this practice scenario a production team follows these rules about one clip:", props: [
    { yes: "the voice-over fits in 8 seconds", no: "the voice-over does not fit in 8 seconds" },
    { yes: "the clip is approved", no: "the clip is not approved" },
    { yes: "the clip is rendered again", no: "the clip is not rendered again" },
    { yes: "extra Flow credits are used", no: "no extra Flow credits are used" },
    { yes: "the client sees the preview today", no: "the client does not see the preview today" } ] },
  access_rules: { intro: "In this practice scenario a studio follows these rules about one job:", props: [
    { yes: "the member entered the access code", no: "the member did not enter the access code" },
    { yes: "the job opens in the studio", no: "the job does not open in the studio" },
    { yes: "the work time is logged", no: "the work time is not logged" },
    { yes: "the team leader is alerted", no: "the team leader is not alerted" },
    { yes: "the device is a new one", no: "the device is not a new one" } ] },
  leave_rules: { intro: "In this practice scenario an office follows these rules about one leave day:", props: [
    { yes: "the leave is approved", no: "the leave is not approved" },
    { yes: "the day is marked as leave", no: "the day is not marked as leave" },
    { yes: "the day is paid", no: "the day is not paid" },
    { yes: "the leave allowance has days left", no: "the leave allowance has no days left" },
    { yes: "the manager is informed", no: "the manager is not informed" } ] },
  invoice_rules: { intro: "In this practice scenario an accounts team follows these rules about one invoice:", props: [
    { yes: "the client gave a GST number", no: "the client did not give a GST number" },
    { yes: "the invoice is issued today", no: "the invoice is not issued today" },
    { yes: "tax is shown on the invoice", no: "tax is not shown on the invoice" },
    { yes: "the payment has arrived", no: "the payment has not arrived" },
    { yes: "a receipt is sent", no: "no receipt is sent" } ] },
};

const COND_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["discount_rules", "lead_rules"],
  technical: ["render_rules", "access_rules"],
  admin: ["leave_rules", "invoice_rules"],
};

type Lit = { v: number; pos: boolean };
type Premise =
  | { t: "imp"; a: Lit; b: Lit }
  | { t: "or"; a: Lit; b: Lit }
  | { t: "nand"; a: Lit; b: Lit }
  | { t: "fact"; a: Lit };

interface Pattern { premises: Premise[]; target: number; level: Difficulty; reasoning: (P: (l: Lit) => string) => string; undetermined?: boolean }

const L = (v: number, pos = true): Lit => ({ v, pos });

/** Inference patterns by difficulty — each with its reasoning in words (the coach's worked solution). */
const PATTERNS: Pattern[] = [
  { level: 1, target: 1, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "fact", a: L(0) }],
    reasoning: (P) => `The rule says that if ${P(L(0))}, then ${P(L(1))}. We know ${P(L(0))}, so ${P(L(1))}.` },
  { level: 2, target: 0, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "fact", a: L(1, false) }],
    reasoning: (P) => `If ${P(L(0))} were true, then ${P(L(1))} would be true too. But ${P(L(1, false))}, so it cannot be that ${P(L(0))}.` },
  { level: 2, target: 0, undetermined: true, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "fact", a: L(1) }],
    reasoning: (P) => `The rule only says what happens when ${P(L(0))}. ${cap(P(L(1)))} could be true for another reason, so we cannot tell whether ${P(L(0))}.` },
  { level: 2, target: 1, undetermined: true, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "fact", a: L(0, false) }],
    reasoning: (P) => `The rule says nothing about what happens when ${P(L(0, false))}, so we cannot tell whether ${P(L(1))}.` },
  { level: 3, target: 2, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "imp", a: L(1), b: L(2) }, { t: "fact", a: L(0) }],
    reasoning: (P) => `${cap(P(L(0)))}, so ${P(L(1))} (first rule), so ${P(L(2))} (second rule).` },
  { level: 3, target: 1, premises: [{ t: "or", a: L(0), b: L(1) }, { t: "fact", a: L(0, false) }],
    reasoning: (P) => `At least one of the two must be true. Since ${P(L(0, false))}, the other one holds: ${P(L(1))}.` },
  { level: 4, target: 0, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "imp", a: L(1), b: L(2) }, { t: "fact", a: L(2, false) }],
    reasoning: (P) => `If ${P(L(0))}, then ${P(L(1))} and then ${P(L(2))}. But ${P(L(2, false))}, so ${P(L(1, false))}, and so ${P(L(0, false))}.` },
  { level: 4, target: 1, premises: [{ t: "or", a: L(0), b: L(1) }, { t: "imp", a: L(0), b: L(2) }, { t: "fact", a: L(2, false) }],
    reasoning: (P) => `If ${P(L(0))}, then ${P(L(2))} — but ${P(L(2, false))}, so ${P(L(0, false))}. At least one of the first two must hold, so ${P(L(1))}.` },
  { level: 5, target: 1, premises: [{ t: "nand", a: L(0), b: L(1) }, { t: "imp", a: L(2), b: L(0) }, { t: "imp", a: L(3), b: L(1) }, { t: "fact", a: L(2) }],
    reasoning: (P) => `${cap(P(L(2)))}, so ${P(L(0))}. The two can never both be true, so ${P(L(1, false))} — and the last rule cannot apply.` },
  { level: 5, target: 3, premises: [{ t: "imp", a: L(0), b: L(1) }, { t: "imp", a: L(1), b: L(2, false) }, { t: "or", a: L(2), b: L(3) }, { t: "fact", a: L(0) }],
    reasoning: (P) => `${cap(P(L(0)))}, so ${P(L(1))}, so ${P(L(2, false))}. At least one of the last pair must hold, so ${P(L(3))}.` },
];

function evalPremise(p: Premise, w: boolean[]): boolean {
  const lit = (l: Lit) => w[l.v] === l.pos;
  if (p.t === "fact") return lit(p.a);
  if (p.t === "imp") return !lit(p.a) || lit(p.b);
  if (p.t === "or") return lit(p.a) || lit(p.b);
  return !(lit(p.a) && lit(p.b));
}

function premiseText(p: Premise, P: (l: Lit) => string): string {
  if (p.t === "fact") return `It is known that ${P(p.a)}.`;
  if (p.t === "imp") return `If ${P(p.a)}, then ${P(p.b)}.`;
  if (p.t === "or") return `At least one of these is always true: ${P(p.a)}; ${P(p.b)}.`;
  return `These two are never both true: ${P(p.a)}; ${P(p.b)}.`;
}

const conditionalLogic: Family = {
  id: "conditional_logic",
  version: "1",
  dims: ["logical", "critical"],
  open: false,
  forms: ["conclude", "which_follows"],
  settings: COND_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const set = PROPS[ctx.setting];
    const pool = PATTERNS.filter((p) => p.level === d || (d === 1 && p.level === 1));
    const pat = rng.pick(pool.length ? pool : PATTERNS.filter((p) => p.level <= d));
    const nVars = Math.max(...pat.premises.flatMap((p) => ("b" in p ? [p.a.v, p.b.v] : [p.a.v]))) + 1;
    const map = rng.sample([...Array(set.props.length).keys()], nVars);
    // Random polarity flips keep the logic and change the words ("not answered" instead of "answered").
    const flip = map.map(() => rng.chance(0.3));
    const P = (l: Lit) => {
      const prop = set.props[map[l.v]];
      return l.pos !== flip[l.v] ? prop.yes : prop.no;
    };
    const worlds: boolean[][] = [];
    for (let m = 0; m < 1 << nVars; m++) {
      const w = [...Array(nVars).keys()].map((i) => !!(m & (1 << i)));
      if (pat.premises.every((p) => evalPremise(p, w))) worlds.push(w);
    }
    if (!worlds.length) throw new Error("inconsistent premises");
    const valueOf = (v: number): "true" | "false" | "unknown" => {
      const vals = new Set(worlds.map((w) => w[v]));
      return vals.size > 1 ? "unknown" : [...vals][0] ? "true" : "false";
    };
    const rules: Premise[] = pat.premises.filter((p) => p.t !== "fact");
    const facts: Premise[] = pat.premises.filter((p) => p.t === "fact");
    const premises: Premise[] = [...rng.shuffle(rules), ...facts];
    const scenario = `${set.intro}\n${premises.map((p) => `- ${premiseText(p, P)}`).join("\n")}`;
    const tv = valueOf(pat.target);
    if ((tv === "unknown") !== !!pat.undetermined) throw new Error("pattern evaluation mismatch");
    let question: string;
    let opts: { options: string[]; index: number };
    if (ctx.form === "conclude" || tv === "unknown") {
      question = `Based only on these rules, what can you conclude about whether ${set.props[map[pat.target]].yes}?`;
      const yes = cap(P(L(pat.target)));
      const no = cap(P(L(pat.target, false)));
      const cant = "It cannot be determined from these rules";
      const correct = tv === "true" ? yes : tv === "false" ? no : cant;
      opts = singleChoice(rng, correct, [yes, no, cant].filter((x) => x !== correct), [], 3);
    } else {
      const correct = cap(P(L(pat.target, tv === "true")));
      const others: string[] = [];
      for (let v = 0; v < nVars; v++) {
        const val = valueOf(v);
        if (v === pat.target) others.push(cap(P(L(v, tv !== "true"))));
        else if (val === "unknown") { others.push(cap(P(L(v)))); others.push(cap(P(L(v, false)))); }
        else others.push(cap(P(L(v, val !== "true"))));
      }
      question = "Which conclusion follows from the rules?";
      opts = singleChoice(rng, correct, rng.shuffle(others), [], Math.min(4, others.length + 1));
    }
    return {
      type: "mcq",
      scenario,
      question,
      options: opts.options,
      key: key({
        correct: [opts.index],
        explanation: pat.reasoning(P),
        hints: hints(
          "Start from the fact that is 'known', then see which rule it switches on.",
          "A rule 'If X, then Y' tells you nothing when X is false — and Y being true does not prove X.",
        ),
      }),
      objective: "Draw only the conclusions the rules support.",
      gap: pat.undetermined ? "assumption" : "reading",
    };
  },
};

// ═══ 3. Number patterns ═════════════════════════════════════════════════════════════════════════

const SEQ_SETTINGS: Record<string, { what: string; step: string }> = {
  calls_per_day: { what: "calls a new salesperson made", step: "day" },
  leads_per_week: { what: "fresh leads a campaign brought in", step: "week" },
  clips_per_day: { what: "clips a trainee rendered", step: "day" },
  frames_per_batch: { what: "frames generated", step: "batch" },
  files_per_day: { what: "files an assistant processed", step: "day" },
  tickets_closed: { what: "requests the office closed", step: "week" },
};

const SEQ_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["calls_per_day", "leads_per_week"],
  technical: ["clips_per_day", "frames_per_batch"],
  admin: ["files_per_day", "tickets_closed"],
};

interface SeqRule { terms: number[]; rule: string; mistakes: number[] }

function makeSequence(rng: Rng, d: Difficulty, len: number): SeqRule {
  const r = rng.int(0, 1);
  if (d === 1) {
    const a = rng.int(3, 15);
    const k = rng.int(2, 7);
    const t = [...Array(len + 1).keys()].map((i) => a + i * k);
    return { terms: t, rule: `it grows by ${k} each time`, mistakes: [t[len] + k, t[len] - 1, t[len - 1] + k + 1] };
  }
  if (d === 2) {
    if (r) {
      const a = rng.int(2, 5);
      const k = rng.pick([2, 3]);
      const t = [...Array(len + 1).keys()].map((i) => a * k ** i);
      return { terms: t, rule: `each number is ${k} times the one before`, mistakes: [t[len - 1] + (t[len - 1] - t[len - 2]), t[len] + k, t[len] * k] };
    }
    const a = rng.int(40, 90);
    const k = rng.int(3, 9);
    const t = [...Array(len + 1).keys()].map((i) => a - i * k);
    return { terms: t, rule: `it falls by ${k} each time`, mistakes: [t[len] - k, t[len] + k, t[len] + 1] };
  }
  if (d === 3) {
    const a = rng.int(5, 20);
    const x = rng.int(2, 6);
    const y = rng.int(7, 12);
    const t = [a];
    for (let i = 1; i <= len; i++) t.push(t[i - 1] + (i % 2 ? x : y));
    return { terms: t, rule: `it adds ${x}, then ${y}, then ${x}, then ${y} …`, mistakes: [t[len - 1] + (len % 2 ? y : x), t[len] + x, t[len - 1] + Math.round((x + y) / 2)] };
  }
  if (d === 4) {
    const a = rng.int(2, 10);
    const k = rng.int(1, 4);
    const inc = rng.int(1, 3);
    const t = [a];
    for (let i = 1; i <= len; i++) t.push(t[i - 1] + k + (i - 1) * inc);
    const lastGap = t[len - 1] - t[len - 2];
    return { terms: t, rule: `the gap grows by ${inc} each time (+${k}, +${k + inc}, +${k + 2 * inc} …)`, mistakes: [t[len - 1] + lastGap, t[len] + inc, t[len] - inc] };
  }
  if (r) {
    const a = rng.int(1, 4);
    const b = rng.int(2, 5);
    const t = [a, b];
    while (t.length <= len) t.push(t[t.length - 1] + t[t.length - 2]);
    return { terms: t, rule: "each number is the sum of the two before it", mistakes: [t[len - 1] * 2, t[len] + 1, t[len - 1] + (t[len - 1] - t[len - 2])] };
  }
  const a = rng.int(3, 6);
  const c = rng.int(1, 3);
  const t = [a];
  for (let i = 1; i <= len; i++) t.push(t[i - 1] * 2 - c);
  return { terms: t, rule: `each number is double the one before, minus ${c}`, mistakes: [t[len - 1] * 2, t[len] + c, t[len - 1] + (t[len - 1] - t[len - 2])] };
}

const sequenceRule: Family = {
  id: "sequence_rule",
  version: "1",
  dims: ["logical", "cognitive"],
  open: false,
  forms: ["next_value", "missing_value"],
  settings: SEQ_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 5,
  generate(ctx: GenContext): Generated {
    const { rng, difficulty: d } = ctx;
    const s = SEQ_SETTINGS[ctx.setting];
    const shown = d >= 4 ? 5 : 4;
    const seq = makeSequence(rng, d, shown);
    if (seq.terms.some((x) => x <= 0 || x > 5000)) throw new Error("sequence out of range");
    const rows = seq.terms.slice(0, shown).map((v, i) => `${s.step[0].toUpperCase()}${s.step.slice(1)} ${i + 1}: ${v}`).join(" · ");
    if (ctx.form === "next_value") {
      const answer = seq.terms[shown];
      return {
        type: "numeric",
        scenario: `The number of ${s.what} follows a steady pattern:\n${rows}`,
        question: `If the pattern continues, what is the number for ${s.step} ${shown + 1}?`,
        unit: "",
        key: key({
          value: answer,
          tolerance: 0,
          explanation: `The pattern: ${seq.rule}. So ${s.step} ${shown + 1} is ${answer}.`,
          hints: hints("Write down the difference between each pair of neighbours.", d >= 3 ? "If the differences are not equal, look at the differences of the differences — or at multiplying." : "Is the difference the same every time?"),
        }),
        objective: "Spot the rule behind a pattern and extend it.",
        gap: "calculation",
      };
    }
    const hole = rng.int(1, shown - 2);
    const answer = seq.terms[hole];
    const display = seq.terms.slice(0, shown + 1).map((v, i) => (i === hole ? "?" : String(v)));
    const opts = singleChoice(rng, String(answer), nearNumbers(rng, answer, [...seq.mistakes.map((m) => m - (seq.terms[shown] - answer)), answer + 2, answer - 2]).map(String));
    return {
      type: "mcq",
      scenario: `The number of ${s.what} follows a steady pattern, but one value is missing:\n${display.map((v, i) => `${s.step} ${i + 1}: ${v}`).join(" · ")}`,
      question: `Which number belongs in place of the "?"`,
      options: opts.options,
      key: key({
        correct: [opts.index],
        explanation: `The pattern: ${seq.rule}. That makes the missing value ${answer}, and it stays consistent with the numbers after it.`,
        hints: hints("Use the numbers on BOTH sides of the gap.", "Check your guess by continuing the pattern to the last number."),
      }),
      objective: "Spot the rule behind a pattern and extend it.",
      gap: "calculation",
    };
  },
};

export const LOGIC_FAMILIES: Family[] = [orderPuzzle, conditionalLogic, sequenceRule];
