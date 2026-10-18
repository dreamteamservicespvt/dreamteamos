/**
 * Open-answer families (written work graded against a versioned rubric by AI judges — FR-017, FR-018, MSRS §13.2).
 *
 * Every item carries: the situation, the task, a word limit, the rubric (criteria with 0 / 2 / 4 anchors; the total is
 * computed in code, never by the judge), a reference answer the judges calibrate against (research: a reference answer
 * cut grading failures sharply — Zheng et al. 2023) and what a strong answer contains (shown after answering).
 * Rubrics stay small (5 criteria) and fact-checkable; the judge must quote the answer for every score it gives.
 */
import type { Rng } from "../../core/rng.js";
import type { DimensionId, Rubric, RubricCriterion, TrackId } from "../../core/types.js";
import { BUSINESSES, PEOPLE, hints, key, type Family, type GenContext, type Generated } from "../kit.js";

interface OpenSetting { situation: (rng: Rng) => string; task: string; exemplar: string }
/** `rubricVersion` goes up whenever `criteria` change: an answer is graded against the rubric it was served with. */
interface OpenDef { id: string; dims: DimensionId[]; maxWords: number; criteria: RubricCriterion[]; strong: string; hint: [string, string]; objective: string; settings: Record<TrackId, Record<string, OpenSetting>>; rubricVersion?: number }

const C = (id: string, label: string, weight: number, a0: string, a2: string, a4: string, critical = false): RubricCriterion =>
  ({ id, label, weight, anchors: { 0: a0, 2: a2, 4: a4 }, ...(critical ? { critical: true } : {}) });

const biz = (r: Rng) => r.pick(BUSINESSES);
const person = (r: Rng) => r.pick(PEOPLE);

const IDEAS: OpenDef = {
  id: "ideas_open", dims: ["creativity", "problem"], maxWords: 160,
  objective: "Generate distinct, useful, feasible ideas and choose one to test.",
  strong: "Three ideas that work in different ways (for example a channel, an offer and a process change), each fitting the limits given, one of them fresh, and one picked to test first with a measurable sign of success and a time frame.",
  hint: ["Make each idea work in a DIFFERENT way — not three versions of one.", "Say how you would know, with a number and a date, that the idea you test first worked."],
  criteria: [
    C("distinct", "Three genuinely different ideas", 25, "One idea, or three versions of the same idea", "Two genuinely different ideas", "Three clearly different approaches"),
    C("relevant", "Each idea serves the goal", 20, "The ideas do not serve the goal", "Most ideas help; one is off-target", "Every idea clearly serves the goal for this situation"),
    C("feasible", "Fits the limits given", 20, "Breaks the stated limit (budget, time, tools)", "One idea stretches the limit", "All ideas fit the limits as given", true),
    C("original", "Beyond the obvious", 15, "Only the most obvious ideas", "One idea goes beyond the obvious", "At least one idea is fresh and specific to this situation"),
    C("test", "Picks one to test, with a measure", 20, "No idea chosen, or no way to tell if it worked", "Chooses one with a reason but no measurable sign", "Chooses one, says why, and names a measurable sign and a time frame"),
  ],
  settings: {
    sales: {
      winback: { situation: () => "Five clients did not renew their monthly social-media plan last month. You may not offer more than the usual 10% discount, and you have two days.", task: "Give three clearly different ideas to win some of them back. Then pick the one you would try first and say how you would know within a week whether it worked.", exemplar: "1) Send each client a one-page report of what their posts achieved last month, with one new idea for next month, and call the next day. 2) Offer a free festival poster with the renewal, worth less than 10%. 3) Ask the two most loyal ones what made them stop and fix that reason for all five. I would try the report first: if at least 2 of 5 book a call within a week, it works." },
      referrals: { situation: () => "Happy clients rarely refer others. There is no budget for gifts or cash rewards.", task: "Give three clearly different ideas to get more referrals. Pick the one you would try first and say how you would measure it.", exemplar: "1) After delivery, ask happy clients for one name while they are pleased, and message that person the same day with their sample. 2) Feature a client's ad on our page with their permission and tag them, so their customers see us. 3) Give a referral code that tracks which client sent whom, and thank them publicly. I would test asking at delivery: if 5 of the next 20 delivered clients give a name within two weeks, keep it." },
    },
    technical: {
      rerender: { situation: () => "Festival videos are often rendered two or three times because small mistakes (wrong phone number, spelling, logo) are found late. You may only use the tools the team already has.", task: "Give three clearly different ideas to cut these re-renders. Pick the one you would try first and say how you would know it worked.", exemplar: "1) A 6-line checklist (phone, address, spelling, logo, language, length) ticked on the FRAMES before any clip is rendered. 2) Send the client the frames and script for approval before rendering, not the finished video. 3) Keep each client's verified details in one note that every prompt copies from. I'd start with frame approval: if re-renders per video fall from about 2 to under 1 over the next 10 videos, it works." },
      posterspeed: { situation: () => "Each festival poster takes about 90 minutes. You cannot buy a new tool and quality must not drop.", task: "Give three clearly different ideas to make posters faster. Pick one to try first and say how you'd measure it.", exemplar: "1) Build three approved layout templates per festival so only text and photos change. 2) Batch the prompt writing for all festival posters in one sitting before generating any. 3) Collect every client's logo, phone and offer the week before, so nothing waits on them. I'd try templates first: if the next 8 posters average under 60 minutes with no extra client corrections, it worked." },
    },
    admin: {
      corrections: { situation: () => "Every month many attendance corrections arrive after the payroll cut-off. Fines are not allowed.", task: "Give three clearly different ideas to get corrections in on time. Pick the one you'd try first and say how you'd measure it.", exemplar: "1) Send each person their own attendance summary three days before the cut-off, asking them to confirm or correct. 2) Let team leaders submit corrections for their team in one weekly batch. 3) Move the cut-off nearer to month end and run a short second pass for late items. I'd try the personal summary first: if late corrections drop from about 15 to under 5 next month, keep it." },
      onboarding: { situation: () => "A new joiner takes about two weeks to become useful. Same staff, no extra budget.", task: "Give three clearly different ideas to make new joiners useful sooner. Pick one to try first and how you'd measure it.", exemplar: "1) A day-by-day first-week plan with one real but small task each day. 2) Pair each new joiner with a buddy for 30 minutes daily. 3) A short screen-recorded video of each common task, made once and reused. I'd try the first-week plan: if the next joiner handles a task alone by day 5 instead of day 10, it works." },
    },
  },
};

const EXPLAIN: OpenDef = {
  // v2 (2026-10-18): "Within the limit" now needs an answer to the task — live, an off-task reply and a prompt
  // injection both took 4/4 on it for being short.
  id: "explain_open", dims: ["communication"], maxWords: 90, rubricVersion: 2,
  objective: "Explain clearly to a non-specialist and make the next step obvious.",
  strong: "Correct facts in plain words for that reader, in a short clear order (what, why, what next), ending with a specific next step — and within the word limit.",
  hint: ["Picture the reader: what do they already know, and what do they need to do after reading?", "End with one specific next step: who does what, by when."],
  criteria: [
    C("accurate", "Correct", 25, "Wrong or misleading", "Mostly right; one unclear or wrong detail", "Fully correct", true),
    C("audience", "Fits the reader", 25, "Jargon this reader would not understand", "Mostly plain; some jargon", "Plain words that fit this reader"),
    C("structure", "Clear order", 20, "Hard to follow", "Followable but rambling", "Short and ordered: what, why, what next"),
    C("next_step", "Clear next step", 20, "The reader does not know what to do", "A vague next step", "A specific next step (who, what, when)"),
    C("concise", "Within the limit", 10, "Far over the word limit, or not an answer to the task at all", "Slightly over the limit", "Within the limit AND an answer to the task"),
  ],
  settings: {
    sales: {
      value_explain: { situation: (r) => `${biz(r)}'s owner, who has never bought an ad, asks why a 4-clip promotional video costs ₹4,999 when a poster costs ₹999.`, task: "Write your reply (at most 90 words).", exemplar: "A poster is one image. The video is four short clips: we write a script, record a voice-over in Telugu, create each scene and edit them together with your logo and phone number, so it plays on WhatsApp, Instagram and YouTube. People stop for video more than for a picture. If you'd like to try first, I can send you two videos we made for shops like yours today — reply 'yes' and I'll share them by 5 PM." },
      smm_explain: { situation: (r) => `A busy clinic owner, Dr. ${person(r)}, asks how your monthly social-media plan works.`, task: "Explain it in at most 90 words.", exemplar: "Each month we plan your posts — for example two a week — and send them to you on WhatsApp before anything goes live. Nothing is posted until you approve it. We post on the days we agreed and, at the end of the month, send a short report: what was posted and how many people saw it. Your only job is to approve within a day. Shall I send this month's first two posts for approval on Thursday?" },
    },
    technical: {
      delay_explain: { situation: (r) => `${biz(r)} changed the script after the video was made and is upset that delivery moves by one day.`, task: "Explain to the client, in at most 90 words, why it takes another day.", exemplar: "Changing the script means the voice-over must be recorded again, and every clip whose words changed has to be made again so the lips and timing match. Each clip takes time to render, then we edit and check the whole video again. That is why it needs one more day. You will have the new version tomorrow by 4 PM on WhatsApp. If anything else should change, please tell me before 11 AM so it goes into the same round." },
      logo_explain: { situation: (r) => `${biz(r)} sent a blurry WhatsApp photo of their signboard as their logo.`, task: "Explain to the client, in at most 90 words, how to send the logo so it looks sharp.", exemplar: "A photo of a signboard comes out blurry when we enlarge it. Please send the original logo file — the one your designer or printer used, usually a PNG or PDF — as a document on WhatsApp (attach it as a document, not as a photo, so it is not compressed). If you don't have it, tell me the printer's name and I'll ask them. Once we have it today, your ad stays on schedule for Friday." },
    },
    admin: {
      halfday_explain: { situation: (r) => `${person(r)} joined this week and asks how half-day leave works.`, task: "Explain it in at most 90 words.", exemplar: "A half-day leave is half of one leave day — it uses 0.5 from your monthly allowance of 2 days. Ask for it in the app at least 2 days ahead, choose 'Half day', and your team leader approves it. On that day you work either the first or the second half. If you need it at short notice for an emergency, call your team leader first, then add it in the app the same day." },
      cutoff_explain: { situation: () => "Several team members keep sending attendance corrections after payroll has been run.", task: "Write a message to the team (at most 90 words) explaining why corrections must arrive before the cut-off.", exemplar: "Payroll is worked out from attendance on the cut-off day. A correction that arrives later cannot change this month's salary — it moves to next month, so you wait a month for money that was yours. Please check your attendance in the app every Friday and send corrections through the correction form. This month's cut-off is the 26th at 12 noon; Madhavi will confirm each correction the same day." },
    },
  },
};

const REPLY: OpenDef = {
  id: "reply_open", dims: ["emotional", "communication"], maxWords: 110,
  objective: "Respond constructively to frustration or disagreement.",
  strong: "Acknowledges the person's feelings, takes fitting ownership without blaming anyone, commits to a specific next step with a time, stays honest (no promise beyond your authority), and keeps a calm, respectful tone.",
  hint: ["First show you understand why they are upset — in their terms.", "Commit to something specific you can actually do, with a time."],
  criteria: [
    C("acknowledge", "Acknowledges the feeling", 25, "Ignores or dismisses how they feel", "A generic 'sorry' without their concern", "Names their concern in their own terms"),
    C("ownership", "Fitting ownership, no blame", 20, "Blames a colleague, a tool or the customer", "Neither blames nor owns", "Owns what was ours to own, without blaming"),
    C("next_step", "Specific next step with a time", 25, "No next step", "A vague promise ('soon', 'we'll see')", "A specific action with a time"),
    C("honest", "Honest — nothing beyond authority", 20, "Promises something they cannot authorise or a false claim", "Slightly overconfident wording", "Promises only what they can deliver", true),
    C("tone", "Calm and respectful", 10, "Defensive, rude or sarcastic", "Polite but cold", "Calm, warm and respectful"),
  ],
  settings: {
    sales: {
      late_video: { situation: (r) => `${person(r)}, a shop owner, writes: "You promised the video yesterday! My sale starts tomorrow and I have nothing to post."`, task: "Write your reply (3–5 sentences).", exemplar: "I'm really sorry — your sale starts tomorrow and you were counting on this video. We should have told you yesterday that it was running late. The final video will be on your WhatsApp by 4 PM today, and I'll call you as soon as it is sent so you can post it tonight." },
      discount_push: { situation: (r) => `${person(r)} says: "Your competitor offered 30% off. Match it now or I'm going to them."`, task: "Write your reply (3–5 sentences). Your own limit is 10%; the sales admin can approve up to 20%.", exemplar: "I understand — you want the best value for your money, and that offer is tempting. I can't approve 30% myself, and I don't want to promise something I can't keep. I'll ask my sales admin today about going further than my 10%, and I'll call you back before 6 PM with the best price we can honestly give." },
    },
    technical: {
      logo_bad: { situation: (r) => `${person(r)} writes: "The logo in clip 3 looks stretched. This is the third time something is wrong!"`, task: "Write your reply (3–5 sentences).", exemplar: "You're right to be annoyed — a stretched logo isn't acceptable, and this is the third issue. We missed it in our check before sending. I'll re-make clip 3 with the correct logo and send it to you by 2 PM today, and I've added a logo check to our list for your future videos." },
      reassigned: { situation: (r) => `Your teammate ${person(r)} says: "Why was my job given to you? I was halfway through it!"`, task: "Write your reply (3–5 sentences).", exemplar: "I can see why that's frustrating — you'd already put real work into it. I should have checked with you before taking it. Let's ask the team leader together at 3 PM how to split the rest; until then I'll keep everything you made exactly as it is." },
    },
    admin: {
      salary_cut: { situation: (r) => `${person(r)} writes: "My salary is ₹1,200 less this month and nobody told me why!"`, task: "Write your reply (3–5 sentences).", exemplar: "I understand — an unexplained cut in your salary is worrying, and you should have been told before it was paid. I'll check your attendance and leave against the payslip now and call you by 5 PM today with the exact reason. If it turns out to be our mistake, I'll tell you when the correction will be paid." },
      leave_no: { situation: (r) => `${person(r)} says: "My leave was rejected but I've already booked my tickets!"`, task: "Write your reply (3–5 sentences). You cannot approve leave yourself.", exemplar: "That's stressful — you've already made plans and paid for tickets. The rejection should have come with a reason and other options. Let's sit with your team leader at 11 AM and look at who can cover your work on those dates; I'll help you put the cover plan together before then." },
    },
  },
};

const PLAN: OpenDef = {
  id: "plan_open", dims: ["problem", "execution"], maxWords: 150,
  objective: "Diagnose with evidence and plan concrete, verifiable steps.",
  strong: "Starts by checking the facts, aims at the root cause rather than the symptom, gives three concrete steps in a sensible order, says how each result will be checked, and keeps the affected people informed.",
  hint: ["Before fixing anything, what would you check to find the real cause?", "For each step, how will you know it worked?"],
  criteria: [
    C("evidence_first", "Evidence first", 25, "Changes things before checking any facts", "Checks something, but not what matters", "Starts by checking the facts that separate the possible causes"),
    C("root_cause", "Aims at the root cause", 25, "Only treats the symptom", "Mentions a cause but guesses it", "Targets the most likely root cause and how to confirm it"),
    C("ordered", "Concrete, ordered steps", 20, "Vague or out of order", "Concrete but loosely ordered", "Three concrete steps in a sensible order"),
    C("verify", "Checks each result", 20, "No way to tell if it worked", "Checks the end result only", "Says how each step's result will be checked"),
    C("communicate", "Keeps people informed", 10, "Nobody is told", "Tells people only at the end", "Tells the affected people what is happening and when"),
  ],
  settings: {
    sales: {
      leads_cold: { situation: () => "Leads from the new Facebook ad say 'not interested' far more often than last month's leads from the old list.", task: "Write your next three steps, in order, and how you'll know each worked (at most 150 words).", exemplar: "1) Check the facts: compare this month's and last month's leads by source, business type and how soon they were first called — is it the ad's audience or our follow-up? 2) Listen to five recorded or noted calls from each source to see where they drop. 3) If the ad's audience is the cause, change its targeting for one week and compare the 'interested' rate with the same week's old-list calls. Each step is checked against numbers; I'll share the comparison with the sales admin on Friday." },
      renewals_drop: { situation: () => "Renewals of the monthly social-media plan fell from 8 of 10 to 4 of 10 this month.", task: "Write your next three steps, in order, and how you'll know each worked (at most 150 words).", exemplar: "1) List the six clients who did not renew with their reason, posts delivered vs promised, and who handled them — look for a common cause. 2) Call two of them to confirm the reason in their words. 3) Fix the most common cause (for example late posts) for next month's renewals and track the renewal rate of the next 10. I'll check each step against the list and update the sales admin weekly." },
    },
    technical: {
      uploads_fail: { situation: () => "Since Monday, large video uploads to the client Drive fail about half the time; small files upload fine.", task: "Write your next three steps, in order, and how you'll know each worked (at most 150 words).", exemplar: "1) Collect facts: which files fail (size, network, browser, time) — the log so far points at size. 2) Test one large file on the office Wi-Fi and on mobile data, changing only the network, to see if the connection is the cause. 3) Apply the fix the test points to (e.g. upload large files over the stable connection, or compress above 500 MB) and watch the next 10 uploads. I'll tell the team what to do meanwhile and confirm when uploads are stable." },
      renders_slow: { situation: () => "Renders that took 3 minutes last week now take 15 minutes; six festival videos are due tomorrow.", task: "Write your next three steps, in order, and how you'll know each worked (at most 150 words).", exemplar: "1) Check whether every account and clip length is slow or only some — compare one render on two accounts at the same time. 2) Check the account status and credit pages for limits or warnings. 3) Move tomorrow's six videos to the account that renders normally and re-test the slow one after hours. Each step is checked by timing one render; I'll tell the team leader the new plan for tomorrow by 2 PM." },
    },
    admin: {
      invoices_late: { situation: () => "Invoices have gone out 3–4 days late for the past two weeks.", task: "Write your next three steps, in order, and how you'll know each worked (at most 150 words).", exemplar: "1) For each late invoice, note the day it was prepared, checked, approved and sent — to see which step holds them. 2) Ask the person at that step what blocks them (missing details, approvals waiting). 3) Remove that block (for example a daily approval slot) and track the next 15 invoices' days to send. I'll share the before/after numbers with the manager after a week." },
      payslip_errors: { situation: () => "Three payslips this month had wrong leave deductions.", task: "Write your next three steps, in order, and how you'll know each worked (at most 150 words).", exemplar: "1) Compare the three payslips' leave days with the approved leave records and attendance marks — find where they differ. 2) Check whether the three share something (half days, late approvals, manual sheets). 3) Fix that input step and recheck all payslips for the same pattern before payment. I'll inform the three people today and confirm the corrected amounts and dates." },
    },
  },
};

const CRITIQUE: OpenDef = {
  id: "critique_open", dims: ["critical"], maxWords: 130,
  objective: "Evaluate a claim: separate facts from assumptions and find the deciding evidence.",
  strong: "Separates what the facts show from what is assumed, names the one piece of data that would test the claim, offers another explanation, and ends with a proportionate conclusion.",
  hint: ["What do the numbers actually show — and what is being added on top of them?", "What single piece of data would settle it?"],
  criteria: [
    C("facts_assumptions", "Facts vs assumptions", 30, "Treats the claim as proven", "Spots one assumption", "Clearly separates what is shown from what is assumed"),
    C("missing_evidence", "The deciding evidence", 30, "Asks for nothing, or for opinions", "Asks for more data, not specific", "Names the specific data that would test the claim"),
    C("alternative", "Another explanation", 20, "None", "Mentions one vaguely", "Gives a concrete alternative explanation"),
    C("conclusion", "Proportionate conclusion", 20, "Accepts or rejects outright without reason", "A conclusion that over-reaches a little", "A balanced conclusion that matches the evidence"),
  ],
  settings: {
    sales: {
      ads_dont_work: { situation: () => "A colleague says: \"Our Instagram ads don't work — we got 3 leads from ₹2,000 last week, so we should stop all ads.\"", task: "What is supported, what is assumed, and what data would you ask for? (at most 130 words)", exemplar: "Supported: last week ₹2,000 brought 3 leads. Assumed: that one week represents all ads, and that 3 leads is bad — we don't know how many became sales or what other channels cost per sale. I would ask for cost per SALE over the last month by channel. Another explanation: the ad ran in a slow week or targeted the wrong area. Conclusion: don't stop all ads yet; compare a month of cost per sale before deciding." },
      advance_renew: { situation: () => "A manager says: \"Clients who pay an advance always renew, so we should only take clients who pay an advance.\"", task: "What is supported, what is assumed, and what data would you ask for? (at most 130 words)", exemplar: "It may be true that advance-payers renewed more, but 'always' needs the numbers: how many advance and non-advance clients, and how many of each renewed. It assumes the advance causes renewal; more committed clients may both pay early and renew. I'd ask for renewal rates by group over six months. Refusing non-advance clients could lose good clients — a softer step is to encourage advances and watch the numbers." },
    },
    technical: {
      model_better: { situation: () => "A teammate says: \"The new AI model is better: the first 5 clips it made were all approved.\"", task: "What is supported, what is assumed, and what data would you ask for? (at most 130 words)", exemplar: "Shown: 5 clips from the new model were approved. Assumed: that 5 is enough and that the jobs were as hard as usual — they may have been simple clips. I'd ask for the approval rate of the old and new model on the same kinds of jobs over a few weeks. The approval could also come from a new prompt template used at the same time. Conclusion: promising, not proven — test both on the same jobs." },
      router_fault: { situation: () => "A colleague says: \"The office Wi-Fi is why uploads fail, so we must buy a new router.\"", task: "What is supported, what is assumed, and what data would you ask for? (at most 130 words)", exemplar: "We know uploads fail; that the Wi-Fi is the cause is assumed. Failures might depend on file size, the browser or Drive limits. I'd ask for a test: upload the same large file over Wi-Fi and over mobile data at the same time. If only Wi-Fi fails, the network is a likely cause; even then a router restart or settings check should come before buying one. Conclusion: test first, then spend." },
    },
    admin: {
      halfday_bad: { situation: () => "A manager says: \"Since we started half-day leave, absences went up — so we should cancel it.\"", task: "What is supported, what is assumed, and what data would you ask for? (at most 130 words)", exemplar: "Supported only if absences really rose — we need absence days per person before and after, for the same season. It assumes half-day leave caused it; the monsoon or a flu season could explain the rise, and half days might even replace full-day absences. I'd ask for the same months of last year and the count of half days taken. Conclusion: don't cancel until the comparison shows the option is the cause." },
      vendor_cheaper: { situation: () => "A colleague says: \"Vendor X is cheaper per page, so switching to them saves money.\"", task: "What is supported, what is assumed, and what data would you ask for? (at most 130 words)", exemplar: "Shown: X's price per page is lower. Assumed: that quality, delivery time and reprints are the same — a late or reprinted festival order could cost more than the saving. I'd ask for X's delivery record and a sample print before any large order. Another view: the total yearly saving may be small next to one missed deadline. Conclusion: try X on a small, non-urgent order first." },
    },
  },
};

const DECIDE: OpenDef = {
  id: "decide_open", dims: ["decision", "critical"], maxWords: 140,
  objective: "Choose under constraints and justify the trade-offs.",
  strong: "Makes a clear choice, names the trade-offs of both options, uses the numbers and limits given, names the main risk of the choice and a way to reduce it, and says why the other option was rejected.",
  hint: ["Use the numbers given — work out what each option is really worth.", "Name the main risk of your choice and how you would reduce it."],
  criteria: [
    C("choice", "A clear choice", 15, "No clear choice", "A hedged choice", "One clear choice"),
    C("tradeoffs", "Trade-offs of both", 30, "No trade-offs", "Trade-offs of one option only", "The trade-offs of both options"),
    C("uses_facts", "Uses the numbers and limits", 25, "Ignores the facts given", "Uses some of them", "Uses the numbers and limits to justify the choice"),
    C("risk", "Risk and mitigation", 20, "No risk named", "A risk without a way to reduce it", "The main risk and a way to reduce it"),
    C("rejected", "Why not the other", 10, "Nothing about the other option", "Rejects it without a reason", "Says why the other option was rejected"),
  ],
  settings: {
    sales: {
      two_demos: { situation: () => "Two prospects want a demo at the same time tomorrow; you can reach only one in time. A: a jewellery shop, deal ₹15,000, about 40% likely, 30 minutes away. B: a clinic, deal ₹6,000, about 80% likely, 5 minutes away.", task: "Which do you choose and why? (at most 140 words)", exemplar: "Expected value: A = ₹15,000 × 40% = ₹6,000; B = ₹6,000 × 80% = ₹4,800. A is worth more on average but riskier and costs an extra 25 minutes each way. I choose A, because the expected value is ₹1,200 higher. Risk: A's 40% may not close — I'll call B now, apologise, and book B for the first slot next morning so B is not lost. I reject B for tomorrow only because its value is lower, not because it matters less." },
      big_discount: { situation: () => "A client wants 25% off a 3-month social-media plan. Your limit is 10%; the sales admin can approve up to 20%; above that the main admin decides.", task: "What do you do and why? (at most 140 words)", exemplar: "I don't agree to 25% on the call — it is beyond my authority. I offer 10% now and ask the sales admin today about 20%, explaining the 3-month commitment as the reason. Trade-off: a bigger discount keeps the client but cuts our margin on three months; holding firm protects the margin but risks losing them. Risk: they walk away — I'll call back by 6 PM with an answer. Going straight to 25% is rejected because I can't promise it honestly." },
    },
    technical: {
      credits_batch: { situation: () => "Tonight you must re-render 6 clips (72 credits, about 1 hour). The account has 80 credits; it resets in 3 days. Option 2: render 4 clips now and 2 after the reset, so the client gets it 3 days later.", task: "Which option and why? (at most 140 words)", exemplar: "I render all 6 tonight: 72 of 80 credits fit, and the client gets the video on time. Trade-off: it leaves only 8 credits for 3 days, so a new urgent job could not be rendered until the reset; splitting saves credits but makes the client wait 3 days. Risk: an urgent job arrives — I'll ask the team leader now to keep a second account ready. I reject splitting because a 3-day delay for this client costs more than the risk." },
      fix_now: { situation: () => "A recurring logo bug can be fixed now (4 hours, delaying two jobs by a day) or after the festival rush next week (more client complaints likely meanwhile).", task: "Which option and why? (at most 140 words)", exemplar: "I fix it after the rush, with a stopgap now: a manual logo check before each render this week (about 5 minutes a job). Trade-off: fixing now stops complaints at the source but delays two jobs during peak demand; waiting keeps deliveries on time but risks repeats. The manual check reduces that risk. Fixing now is rejected because delaying two paid jobs in the festival week costs more than a week of careful manual checks." },
    },
    admin: {
      same_leave: { situation: () => "Two people asked for leave on the same festival day; only one can be away. A asked first; B's sister's wedding is that day.", task: "What do you decide and why? (at most 140 words)", exemplar: "I approve B's leave and talk to A before saying no. Trade-off: 'first come' is fair and predictable; a family wedding cannot move while A's plan might. I'll ask A whether the plan can shift, offer the day before or after, and give A first choice on the next festival. Risk: A feels the rule was broken — so I explain the reason openly and record it as an exception. Strict 'first come' is rejected here because the cost to B is far higher." },
      print_vendor: { situation: () => "Choose a printing vendor for a festival order due in 6 days. V1: ₹6 a page, 4-day delivery, never late. V2: ₹5 a page, 7-day delivery, late twice last year.", task: "Which vendor and why? (at most 140 words)", exemplar: "V1. The order is due in 6 days: V2 needs 7 days, so even on time it would be late, and it has been late twice. V1's 4-day delivery leaves 2 days spare. Trade-off: V1 costs ₹1 more per page — on 2,000 pages, ₹2,000 more — against a missed festival. Risk: V1 slips once — I'll confirm the delivery date in writing and check progress on day 2. V2 is rejected because it cannot meet the date." },
    },
  },
};

const OPEN_DEFS: OpenDef[] = [IDEAS, EXPLAIN, REPLY, PLAN, CRITIQUE, DECIDE];

function makeFamily(def: OpenDef): Family {
  const settings = Object.fromEntries((["sales", "technical", "admin"] as TrackId[]).map((t) => [t, Object.keys(def.settings[t])])) as Record<TrackId, string[]>;
  return {
    id: def.id,
    version: String(def.rubricVersion ?? 1),
    dims: def.dims,
    open: true,
    forms: ["write"],
    settings,
    minDifficulty: 1,
    maxDifficulty: 5,
    generate(ctx: GenContext): Generated {
      const track = (Object.keys(def.settings) as TrackId[]).find((t) => ctx.setting in def.settings[t]);
      if (!track) throw new Error(`unknown setting ${ctx.setting}`);
      const s = def.settings[track][ctx.setting];
      const passMark = ctx.difficulty >= 4 ? 70 : ctx.difficulty <= 1 ? 55 : 60;
      const rubric: Rubric = { version: `${def.id}-v${def.rubricVersion ?? 1}`, criteria: def.criteria, passMark, maxWords: def.maxWords };
      return {
        type: "open",
        scenario: s.situation(ctx.rng),
        question: s.task,
        key: key({ rubric, explanation: `A strong answer: ${def.strong}`, hints: hints(...def.hint), exemplar: s.exemplar }),
        objective: def.objective,
        gap: def.dims[0] === "emotional" || def.dims[0] === "communication" ? "communication" : def.dims[0] === "decision" ? "tradeoff" : def.dims[0] === "critical" ? "assumption" : "incomplete",
      };
    },
  };
}

export const OPEN_FAMILIES: Family[] = OPEN_DEFS.map(makeFamily);
