/**
 * Communication and Emotional Intelligence families, objective forms (MSRS §6 dims 8 and 9).
 *   • clear_message  — messages assembled from parts (what, when, where, who, the ask); exactly one has every part and
 *                      no ambiguity, the others each miss or blur one — so the key is right by construction.
 *   • response_choice — replies assembled from principles (acknowledge the feeling, take fitting ownership without
 *                      blame, a specific next step with a time, honest — no promise beyond authority); one reply has all.
 * EI is judged on demonstrated choices in a structured scenario, never on inferred inner states (MSRS §6.1).
 * The open versions (write the message / write the reply) are in `open.ts`, graded against rubrics.
 */
import type { Rng } from "../../core/rng.js";
import type { TrackId } from "../../core/types.js";
import { BUSINESSES, PEOPLE, hints, key, singleChoice, type Family, type GenContext, type Generated } from "../kit.js";

// ═══ Clear message ═══════════════════════════════════════════════════════════════════════════════

interface MsgParts { what: string; when: string; where: string; who: string; ask: string }
interface MsgSetting { situation: (to: string) => string; to: (rng: Rng) => string; parts: (rng: Rng) => MsgParts; vague: { when: string; who: string; what: string } }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DATES = ["21 October", "22 October", "23 October", "24 October", "25 October", "27 October", "28 October"];

const MSG: Record<string, MsgSetting> = {
  meeting_confirm: {
    situation: (to) => `You are confirming tomorrow's visit to ${to} to show three sample ads. The owner must confirm so the visit is not wasted.`,
    to: (r) => r.pick(BUSINESSES),
    parts: (r) => {
      const i = r.int(0, 5);
      return { what: "I will visit your shop to show three sample ads for your Diwali offer", when: `on ${DAYS[i]}, ${DATES[i]}, at ${r.pick(["11:00 AM", "12:30 PM", "4:00 PM"])}`, where: "at your Main Road shop", who: `I will come with my colleague ${r.pick(PEOPLE)}, who makes the videos.`, ask: "Please reply YES to confirm, or send a better time." };
    },
    vague: { when: "sometime soon", who: "She will come with me.", what: "about the thing we discussed" },
  },
  payment_reminder: {
    situation: (to) => `You must remind ${to} about the balance for their ad. The money must come before the final file is sent.`,
    to: (r) => r.pick(BUSINESSES),
    parts: (r) => {
      const i = r.int(0, 5);
      return { what: `the balance of ₹${r.pick([1500, 2000, 2500, 3000]).toLocaleString("en-IN")} for your promotional video is due`, when: `by ${DAYS[i]}, ${DATES[i]}, 6:00 PM`, where: "through the UPI link below", who: "Our accounts person, Madhavi, will confirm when it arrives.", ask: "Please send a screenshot after paying so we can release the final file the same day." };
    },
    vague: { when: "in a few days", who: "She will confirm it.", what: "the pending thing" },
  },
  preview_ready: {
    situation: (to) => `The preview of ${to}'s ad is ready. The client must send any changes in time for final delivery.`,
    to: (r) => r.pick(BUSINESSES),
    parts: (r) => {
      const i = r.int(0, 5);
      return { what: "the preview of your 4-clip festival ad is ready to watch", when: `— please send changes by ${DAYS[i]}, ${DATES[i]}, 1:00 PM`, where: "on the link below", who: `Our editor ${r.pick(PEOPLE)} will make the changes.`, ask: "Reply with the clip number and the change, or reply OK if it is final." };
    },
    vague: { when: "— send changes whenever", who: "He will make the changes.", what: "the thing is ready" },
  },
  render_delay: {
    situation: (to) => `${to}'s video will be late because the Flow credits ran out; the client must know the new time.`,
    to: (r) => r.pick(BUSINESSES),
    parts: (r) => {
      const i = r.int(0, 5);
      return { what: "your video will be delivered later than promised because our rendering account ran out of credits", when: `— the new delivery time is ${DAYS[i]}, ${DATES[i]}, 5:00 PM`, where: "on this same WhatsApp chat", who: `${r.pick(PEOPLE)} from our studio is finishing it now.`, ask: "No action is needed from you; reply if this new time does not work." };
    },
    vague: { when: "— it will come a bit later", who: "He is doing it.", what: "there is an issue" },
  },
  holiday_notice: {
    situation: () => "The office will be closed for a festival. The team must finish urgent work and know who answers client calls.",
    to: () => "the team",
    parts: (r) => {
      const i = r.int(0, 5);
      return { what: "the office will be closed for the festival", when: `on ${DAYS[i]}, ${DATES[i]}`, where: "(all branches)", who: `${r.pick(PEOPLE)} will answer urgent client calls on 98480 12345.`, ask: "Please hand in any work due that day by 5:00 PM the day before." };
    },
    vague: { when: "on the festival day", who: "Someone will take urgent calls.", what: "there is a change in office timings" },
  },
  payroll_inputs: {
    situation: () => "Payroll runs soon. Everyone must send attendance corrections through the form, to one named person, before a cut-off.",
    to: () => "the team",
    parts: (r) => {
      const i = r.int(0, 5);
      return { what: "attendance corrections for this month's payroll must be sent", when: `by ${DAYS[i]}, ${DATES[i]}, 12:00 noon`, where: "through the correction form in the app", who: `${r.pick(PEOPLE)} will check and approve them.`, ask: "After the cut-off, corrections move to next month's payroll." };
    },
    vague: { when: "soon", who: "They will check them.", what: "some details are needed" },
  },
};

const MSG_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["meeting_confirm", "payment_reminder"],
  technical: ["preview_ready", "render_delay"],
  admin: ["holiday_notice", "payroll_inputs"],
};

type Flaw = "when" | "who" | "ask" | "what";

const FLAW_WORDS: Record<Flaw, string> = {
  when: "It does not say exactly when",
  who: "It is unclear who will do it",
  ask: "It does not say what the reader must do next",
  what: "It does not say clearly what it is about",
};

function compose(to: string, p: MsgParts, v: MsgSetting["vague"], flaw: Flaw | null): string {
  const greet = to === "the team" ? "Hello team," : "Hello,";
  const what = flaw === "what" ? v.what : p.what;
  const when = flaw === "when" ? v.when : p.when;
  const who = flaw === "who" ? v.who : p.who;
  const ask = flaw === "ask" ? "" : ` ${p.ask}`;
  return `${greet} ${what[0].toUpperCase()}${what.slice(1)} ${when} ${p.where}. ${who}${ask}`.replace(/\s+/g, " ").replace(" .", ".").trim();
}

const clearMessage: Family = {
  id: "clear_message",
  version: "1",
  dims: ["communication"],
  open: false,
  forms: ["best_message", "whats_missing"],
  settings: MSG_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 4,
  generate(ctx: GenContext): Generated {
    const { rng } = ctx;
    const s = MSG[ctx.setting];
    const to = s.to(rng);
    const p = s.parts(rng);
    const scenario = s.situation(to);
    if (ctx.form === "best_message") {
      const flaws = rng.sample(["when", "who", "ask", "what"] as Flaw[], 3);
      const good = compose(to, p, s.vague, null);
      const o = singleChoice(rng, good, flaws.map((f) => compose(to, p, s.vague, f)));
      return {
        type: "mcq", scenario, question: "Which message is the clearest and most complete?", options: o.options,
        key: key({
          correct: [o.index],
          explanation: `The best message says what it is about, exactly when, where or how, who is responsible, and what the reader must do next. The others each miss one: ${flaws.map((f) => FLAW_WORDS[f].toLowerCase()).join("; ")}.`,
          hints: hints("Check each message for: what · when (an exact time) · who · what the reader must do.", "Pronouns like 'he' or 'she' are unclear unless a name is given."),
        }),
        objective: "Communicate instructions and status unambiguously.", gap: "communication",
      };
    }
    const flaw = rng.pick(["when", "who", "ask", "what"] as Flaw[]);
    const msg = compose(to, p, s.vague, flaw);
    const o = singleChoice(rng, FLAW_WORDS[flaw], (["when", "who", "ask", "what"] as Flaw[]).filter((f) => f !== flaw).map((f) => FLAW_WORDS[f]));
    return {
      type: "mcq", scenario: `${scenario}\n\nA colleague drafted:\n> ${msg}`, question: "What is the main problem with this draft?", options: o.options,
      key: key({ correct: [o.index], explanation: `${FLAW_WORDS[flaw]}: "${flaw === "ask" ? "(no request at the end)" : flaw === "when" ? s.vague.when : flaw === "who" ? s.vague.who : s.vague.what}". A complete version: "${compose(to, p, s.vague, null)}"`, hints: hints("Read it as the person receiving it: could you act on it without asking a question?", "Look for vague words — 'soon', 'he', 'the thing'.") }),
      objective: "Communicate instructions and status unambiguously.", gap: "communication",
    };
  },
};

// ═══ Response choice (EI) ════════════════════════════════════════════════════════════════════════

interface ReplyParts { situation: (n: string) => string; ack: string; dismiss: string; own: string; blame: string; step: string; vague: string; overpromise: string }

const REPLIES: Record<string, ReplyParts> = {
  late_video_client: {
    situation: (n) => `${n} (a shop owner) messages angrily: "You promised the video yesterday! My sale starts tomorrow and I have nothing to post."`,
    ack: "I understand — your sale starts tomorrow and you were counting on this.", dismiss: "Delays like this happen with every agency.",
    own: "We should have told you about the delay yesterday.", blame: "Our editor was slow on this one, not me.",
    step: "I will send the final video by 4 PM today and call you as soon as it is on WhatsApp.", vague: "We will try to send it soon.",
    overpromise: "I'll give you the next video completely free.",
  },
  discount_pressure: {
    situation: (n) => `${n} says: "Your competitor offered 30% off. Match it right now or I'll go to them."`,
    ack: "I understand you want the best value, and that offer sounds tempting.", dismiss: "Other agencies' prices are not my problem.",
    own: "I can't approve that discount myself, and I don't want to promise something I can't keep.", blame: "My manager is the one who never allows good discounts.",
    step: "I'll ask my sales admin today and call you back before 6 PM with the best price we can do.", vague: "Let me see what can be done.",
    overpromise: "Done — 30% off, I'll sort it out later.",
  },
  logo_complaint: {
    situation: (n) => `${n} complains: "The logo in clip 3 looks stretched. This is the third time something is wrong!"`,
    ack: "You're right to be annoyed — a stretched logo on your ad isn't acceptable.", dismiss: "It's barely noticeable on a phone.",
    own: "We missed it in our check before sending.", blame: "The AI tool did that, it's not something we control.",
    step: "I'll re-render clip 3 with the correct logo and send it by 2 PM today.", vague: "We'll look into it.",
    overpromise: "I promise nothing will ever go wrong again.",
  },
  teammate_reassigned: {
    situation: (n) => `Your teammate ${n} says: "Why was my job given to you? I was halfway through it!"`,
    ack: "I can see why that's upsetting — you'd already put work into it.", dismiss: "Jobs get moved all the time, it's no big deal.",
    own: "I took it without checking with you first.", blame: "Talk to the team leader, it was their decision, not my problem.",
    step: "Let's ask the team leader together at 3 PM how to split the rest, and I'll keep your part as you made it.", vague: "We'll figure it out somehow.",
    overpromise: "I'll make sure you get all the credit and the incentive for it.",
  },
  salary_query: {
    situation: (n) => `${n} messages the office: "My salary is ₹1,200 less this month and nobody told me why!"`,
    ack: "I understand — an unexplained cut in your salary is worrying.", dismiss: "Salaries change sometimes, it's normal.",
    own: "We should have explained the change before paying.", blame: "Payroll is the system's job, not ours.",
    step: "I'll check your attendance and leave against the payslip and call you by 5 PM today with the reason.", vague: "Someone will check it later.",
    overpromise: "I'll add the ₹1,200 back right now.",
  },
  leave_rejected: {
    situation: (n) => `${n} says: "My leave was rejected but I already booked my tickets!"`,
    ack: "That's stressful — you've already made plans and paid for tickets.", dismiss: "You should have waited for approval before booking.",
    own: "The rejection should have come with a reason and other options.", blame: "It's the manager's rule, I can't help.",
    step: "Let's look at the cover plan with your team leader at 11 AM and see if the dates can work.", vague: "Maybe it will work out.",
    overpromise: "Don't worry, I'll approve it myself right now.",
  },
};

const REPLY_BY_TRACK: Record<TrackId, string[]> = {
  sales: ["late_video_client", "discount_pressure"],
  technical: ["logo_complaint", "teammate_reassigned"],
  admin: ["salary_query", "leave_rejected"],
};

const responseChoice: Family = {
  id: "response_choice",
  version: "1",
  dims: ["emotional", "communication"],
  open: false,
  forms: ["best_reply", "worst_reply"],
  settings: REPLY_BY_TRACK,
  minDifficulty: 1,
  maxDifficulty: 4,
  generate(ctx: GenContext): Generated {
    const { rng } = ctx;
    const r = REPLIES[ctx.setting];
    const scenario = r.situation(rng.pick(PEOPLE));
    const best = `${r.ack} ${r.own} ${r.step}`;
    const noAck = `${r.own} ${r.step}`;
    const blames = `${r.ack} ${r.blame} ${r.step}`;
    const vagueStep = `${r.ack} ${r.own} ${r.vague}`;
    const overpromise = `${r.ack} ${r.overpromise}`;
    const worst = `${r.dismiss} ${r.blame}`;
    if (ctx.form === "best_reply") {
      const o = singleChoice(rng, best, rng.shuffle([noAck, blames, vagueStep, overpromise]));
      return {
        type: "mcq", scenario, question: "Which reply is most likely to calm the situation and solve it?", options: o.options,
        key: key({
          correct: [o.index],
          explanation: "It acknowledges the feeling, takes fitting ownership without blaming anyone, and commits to a specific next step with a time — without promising what you cannot deliver. Each other reply skips one of these or overpromises.",
          hints: hints("A strong reply does four things: acknowledges, owns its part, gives a specific next step with a time, and stays honest.", "Watch for blame and for promises you have no authority to make."),
        }),
        objective: "Respond constructively to frustration or disagreement.", gap: "communication",
      };
    }
    const o = singleChoice(rng, worst, rng.shuffle([noAck, vagueStep, best]));
    return {
      type: "mcq", scenario, question: "Which reply is most likely to make things WORSE?", options: o.options,
      key: key({ correct: [o.index], explanation: "Dismissing the feeling and pushing the blame onto someone else tells the person they are not being heard and nobody owns the problem. That reply offers no next step either.", hints: hints("Which reply makes the other person feel unheard?", "Blame plus no next step is the usual way conflicts grow.") }),
      objective: "Respond constructively to frustration or disagreement.", gap: "communication",
    };
  },
};

export const PEOPLE_FAMILIES: Family[] = [clearMessage, responseChoice];
