import { packNameSpellings, type CharacterPack } from "@/services/characterPacks";
import {
  MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE,
} from "@/utils/dialogueFormat";
import { CLIP_SECONDS } from "@/utils/voiceOverFormat";

/**
 * Prompts for character-pack ads — two cartoon characters talking to each other inside a real
 * business location.
 *
 * These are entirely separate from the standard human-model prompts in services/prompts.ts and are
 * only reached when a pack is selected, so the proven single-model path is never touched.
 *
 * Three things make or break this format, and every prompt below is built around them:
 *
 *  1. NAME THE CHARACTERS, NEVER DESCRIBE THEM. These are famous characters the image and video
 *     models already know. An explicit physical description competes with that knowledge and
 *     produces a generic cartoon that merely matches the words, so the prompts say "Motu and Patlu"
 *     and stop. This also keeps every prompt short. (See the note in services/characterPacks.)
 *
 *  2. THE 8-SECOND TWO-HANDER. Both characters speak inside the same clip, so the word budget is
 *     split and exact (see utils/dialogueFormat).
 *
 *  3. CARTOON SUBJECT, PHOTOREAL WORLD. The characters are drawn; the shop is photographed. The
 *     most common failure is the model "helpfully" cartoonifying the whole frame, so that is a
 *     hard negative everywhere.
 */

// ── Shared building blocks ────────────────────────────────────────────────────────────────────

/**
 * Who is on screen — names only.
 *
 * Deliberately three lines. Anything longer here is a physical description by another route, and
 * that is exactly what made the generated characters stop looking like themselves.
 */
export const characterCastBlock = (pack: CharacterPack): string => {
  const cast = pack.characters.map((c) => c.name).join(" and ");
  return `===== CHARACTERS =====

${cast} — the REAL, ORIGINAL characters from ${pack.franchise}, exactly as they appear on screen in that show.
These specific existing characters and nobody else: NOT look-alikes, NOT "inspired by", NOT a new pair of Indian cartoon men.
If a viewer who watches the show would not instantly recognise them as ${cast}, the frame is WRONG.
Do not restyle, redesign or reinterpret them, and do not describe their appearance in the prompt: name them and let them be themselves.
They must be the same ${cast} in every clip.

STAGING: ${pack.styleDirective}`;
};

/** Negatives, formatted for appending to any prompt. */
export const characterNegativesBlock = (pack: CharacterPack): string =>
  `===== HARD NEGATIVES =====\n${pack.negatives.map((n) => `• ${n}`).join("\n")}`;

// ── 1 · Voice-over: the two-hander script ─────────────────────────────────────────────────────

/**
 * The promotional shape of the script, clip by clip.
 *
 * Without this the model writes two characters having a pleasant conversation *about advertising*
 * and never sells the client's actual business — which is what the first real generations did.
 * The beats scale with the package: every ad gets a hook and a close, and the clips in between
 * each carry one distinct, real reason to choose this business.
 */
const promotionalBeats = (segmentCount: number, first: string, second: string, place: string): string => {
  const placeAndName = place
    ? `NAMES THE BUSINESS **and says it is in ${place}**, saying plainly what it does`
    : `NAMES THE BUSINESS, saying plainly what it does`;

  if (segmentCount <= 1) {
    return `The single clip must name the business${place ? ` and the town it is in (${place})` : ""}, give one `
      + `real reason to choose it, and end with ${second} delivering the call to action.`;
  }

  const beats = [
    `Clip 1 — THE HOOK: ${first}'s first line must STOP someone who is scrolling past. He addresses `
    + `${second} BY NAME and reacts to something striking — see THE HOOK below for how. `
    + `${second} answers with "${first}" and ${placeAndName}. `
    + `This clip carries the one and only mention of each name — no clip after this may use either again.`,
  ];
  for (let i = 2; i < segmentCount; i++) {
    beats.push(
      `Clip ${i} — PROOF: one specific, real thing this business offers, taken from the business `
      + `information. A different one in each clip — never repeat a benefit already used.`,
    );
  }
  beats.push(
    `Clip ${segmentCount} — CLOSE: ${second} gives the reason to act now and delivers the call to action, `
    + `inviting the viewer to come to the business the way the two of them just did.`,
  );
  return beats.join("\n");
};

export const CHARACTER_VOICEOVER_SYSTEM_PROMPT = (
  pack: CharacterPack,
  duration: number,
  segmentCount: number,
  adType: string,
  festivalName: string,
  language: string = "Telugu",
  /** The town / village the business is in. Empty when unknown — then no place is mentioned. */
  placeName: string = "",
): string => {
  const lang = (language || "Telugu").trim() || "Telugu";
  const place = (placeName || "").trim();
  const isLatin = lang.toLowerCase() === "english";
  const [first, second] = pack.characters;
  const spellings = packNameSpellings(pack, lang);

  const contract = Array.from({ length: segmentCount }, (_, i) => {
    const start = i * CLIP_SECONDS;
    const end = start + CLIP_SECONDS;
    return `${start}-${end}|${first.key}: [${first.name}'s line]\n${start}-${end}|${second.key}: [${second.name}'s line]`;
  }).join("\n");

  return `You are a WORLD-CLASS ${lang.toUpperCase()} AD SCRIPTWRITER who writes CARTOON DIALOGUE for
television commercials. You are writing a ${duration}-second ad in which two well-known cartoon
characters visit a real business and talk to each other about it.

===== THE TWO CHARACTERS =====

${pack.characters.map((c) => `${c.name} — ${c.persona}\n  Voice: ${c.voice}\n  His job in the script: ${c.scriptRole}`).join("\n\n")}

===== THE BEAT (NEVER BREAK THIS) =====

${pack.dialogueRhythm}

Every clip is a tiny two-line exchange: a set-up and a pay-off. It must feel like a real
conversation between friends — never two separate announcements stitched together. ${second.name}'s
line must actually ANSWER what ${first.name} just said.

===== THIS IS A PROMOTIONAL AD FOR ONE SPECIFIC BUSINESS =====

THE SITUATION, AND IT NEVER CHANGES: ${first.name} and ${second.name} have come to this client's
business to show it to people. They are standing in the real premises, seeing the real thing, and
telling the viewer why it is worth coming to. Write it as that visit — two friends who turned up at
a good place and want everyone to know about it — never as a studio announcement, never as an
advert read aloud, never as a comedy sketch with a tagline bolted on the end.

The characters are the DELIVERY, not the subject. This ad sells the business described in the
BUSINESS INFORMATION you are given — it is not a general chat about advertising, marketing, offers
or "promotion". The humour exists only to carry the sell. Every line must sound like natural
${lang} speech between the two of them, not like a written slogan.

===== BOTH NAMES, EACH EXACTLY ONCE (STRICT) =====

BOTH characters must be named in the ad, and each name is spoken EXACTLY ONE TIME across the ENTIRE
script — all ${segmentCount} clips together. "${first.name}" appears once. "${second.name}" appears
once. That is two name-words in the whole ad, and no more. It is the same in every ad whatever its
length: a 2-clip ad and an 8-clip ad each get exactly one of each.

• BOTH MUST APPEAR. The audience has to register who these two are. The natural way is CLIP 1,
  where they greet each other: ${first.name} opens by addressing ${second.name} by name, and
  ${second.name}'s reply comes back with "${first.name}". One line each, done.
• NEITHER MAY APPEAR AGAIN. Not in clip 2, not in the closing line, not anywhere after clip 1.
  From then on they simply talk to each other, with no names at all.

We are promoting the business, not the characters. Beyond that one introduction, every word spent
on "${first.name}" or "${second.name}" is a word the client did not get. The viewer can SEE who is
talking; they cannot know the business unless it is said. So the BUSINESS's name is the one that
gets repeated.

CLIP-BY-CLIP STRUCTURE:

${promotionalBeats(segmentCount, first.name, second.name, place)}

${place
  ? `===== SAY WHERE THIS BUSINESS IS (MANDATORY) =====

THE TOWN IS: ${place}

This ad is watched by people who live near this shop, and "near" is the entire reason they stop
scrolling. So the ad must SAY the place out loud. A viewer who hears the ad once must come away
knowing the business is in ${place} — not a nice-sounding shop somewhere in the state.

• "${place}" is spoken EXACTLY ONCE, in CLIP 1, in ${second.name}'s line, joined to the business's
  name in the same breath — the way a person says it: "that is <business> here in ${place}".
• Frame it as the two of them having COME there today. They have travelled to ${place} and walked
  into this business, and they are telling the viewer about the place they are standing in.
• Say the town, not a whole address. Never a door number, street, district, state or pincode —
  those are read on screen, never spoken.
• Never repeat "${place}" in any later clip. Once is what a listener needs; twice is a word the
  business did not get.
• SPELL IT EXACTLY AS "${place}" — that spelling and no other. A town whose name is written two
  different ways in two runs is a town the client does not recognise as theirs.

A script that never says "${place}" has FAILED, however good the rest of it is. Check before you
output: does clip 1 contain the town's name? If not, rewrite clip 1.`
  : `===== NO TOWN WAS PROVIDED =====

The business information does not say which town or village this business is in, so DO NOT mention
a place anywhere in the script. Never invent one, never guess from the business name, and never
substitute a vague phrase like "our town" or "your area". Sell the business on what it does.`}

===== THE HOOK: THE FIRST LINE DECIDES WHETHER ANYONE WATCHES THE REST =====

An ad is skipped in the first two seconds or not at all, so ${first.name}'s opening line has ONE
job: make a person stop. It must PROVOKE, never explain. Pick whichever of these fits the business
and open with it:

• SURPRISE — he reacts to something striking in front of him. "Look at the size of that shelf!"
• CURIOSITY GAP — something unexplained that demands an answer. "Why is there a queue outside?"
• THE CUSTOMER'S OWN PROBLEM — the exact pain that brings people to this business. "My phone died again!"
• DISBELIEF — he challenges a claim as too good to be true. "At that price? I don't believe it."

The opening must sound like ${first.name}: loud, excited, saying what everyone else is thinking.
And it must be about THIS business — a hook that would suit any shop is not a hook.

NEVER open with any of these. They are why an ad gets skipped:
✗ A greeting — "Hello friends", "Namaste", "Hi everyone"
✗ An announcement — "Today we will tell you about…", "Let me introduce…"
✗ A welcome — "Welcome to…", "Come to…"
✗ Anything a narrator would say. These two are TALKING TO EACH OTHER, never to a camera.

===== EVERY LINE MUST BE COMPLETE, AND THE AD MUST FINISH =====

The scripts that fail do so in the same two ways — half-sentences, and an ending that just stops.

1. Each line is ONE complete sentence that makes full sense on its own. Never let a sentence run
   from one character into the other's line, or from one clip into the next. If a thought does not
   fit the word budget, write a SHORTER thought — never half of a longer one.
2. Every line must say something. A line that carries no fact, no reaction and no reason to buy is
   wasted airtime, even when it is grammatically fine.
3. The final clip must FINISH the ad. It has to feel ended, not interrupted — the last thing heard
   is a clear instruction to act.
4. Test the whole script by itself: someone who hears only this, once, with no picture, must come
   away knowing WHO the business is, WHAT it sells, WHY it is better, and WHAT to do next. If any
   of those four is missing, the script has failed and you must rewrite it.

===== A WORKED EXAMPLE — COPY THE SHAPE, NOT THE WORDS =====

This is shown in English so the STRUCTURE is unmistakable. Write yours in ${lang}, about the real
business you were given. Word counts are marked to show how a complete thought fits the budget.

clip-1 (the hook — curiosity gap, then the business and its town are named)
  ${first.name}:  "${second.name}! Why is there a queue outside this shop?"            (9 words)
  ${second.name}: ${place
    ? `"That is Sharma Electronics here in ${place}, ${first.name} — everyone buys here."   (11 words)`
    : `"That is Sharma Electronics, ${first.name} — the whole town buys here."   (10 words)`}

clip-2 (proof — a real, specific offering)
  ${first.name}:  "But do they keep the latest washing machines too?"          (9 words)
  ${second.name}: "Every brand, every model, and free home delivery included."  (9 words)

clip-3 (proof — a DIFFERENT one, never a repeat)
  ${first.name}:  "Repairs must cost a fortune at a big showroom."             (9 words)
  ${second.name}: "One full year of service is free with every purchase."      (10 words)

clip-4 (close — it ends, and it tells you what to do)
  ${first.name}:  "Then what are we waiting for, let us go!"                   (9 words)
  ${second.name}: "Visit Sharma Electronics today and see the festival offers yourself." (10 words)

Notice: the first line provokes, the business${place ? " and its town are" : " is"} named immediately, every line is a
whole sentence, each clip adds something new, and the last line tells the viewer exactly what to do.

GROUND EVERY SINGLE LINE IN THE DATA YOU WERE GIVEN:
1. Say the business's REAL NAME out loud in the ad, early — a viewer must know who this is.${place
  ? `\n1b. Say "${place}" out loud in clip 1 alongside that name — a viewer must know where this is.`
  : ""}
2. Use its REAL services, products, specialities, and selling points, exactly as provided.
3. THE GENERIC TEST — apply it to every line you write: if the line would fit any other business
   in any other industry, it is WRONG. Delete it and write one that only this business could say.
4. Never talk about advertising, videos, promotion or marketing unless that IS this client's
   business. The client sells what the business information says they sell — nothing else.
5. If the data is thin, lean harder on the few real details you do have. Never pad with invention.

===== CORE OUTPUT CONTRACT =====

1. Output EXACTLY ${segmentCount} clips. Each clip has EXACTLY 2 lines — one for ${first.name},
   then one for ${second.name}. ${first.name} ALWAYS speaks first.
2. Output format must be EXACTLY this, with no headings, notes, or explanation:

${contract}

3. WORD BUDGET (this is a timing rule, not a style preference): each clip is
   ${CLIP_SECONDS} seconds shared by two speakers with a short hand-off pause between
   them. Each clip must total between ${MIN_WORDS_PER_CLIP} and ${MAX_WORDS_PER_CLIP} spoken words across both characters — never fewer, never more.
   Each character's single line must be between ${MIN_WORDS_PER_LINE} and ${MAX_WORDS_PER_LINE} words. Count every clip carefully before you output it.
4. Each line is ONE complete spoken sentence ending in . ! or ?
5. Do NOT output a FULL SCRIPT section. Do NOT repeat the same line twice anywhere.

===== LANGUAGE RULES (${lang.toUpperCase()}) =====

${isLatin
  ? `1. Spoken content must be clean, natural, conversational English as spoken in a premium Indian TV cartoon ad.
2. Keep brand names exactly as written.
3. Never stiff, bookish, or corporate. These are cartoon characters talking, not a brochure.`
  : `1. Spoken content must be 100% correct, native, pixel-perfect ${lang} script. No Latin letters in spoken content (English-origin words are allowed only when written in ${lang} script).
2. Brand names must be transliterated into ${lang} script naturally.
3. Prefer the SIMPLE everyday English business word written in ${lang} script over a heavy literary ${lang} translation — write how a popular ${lang} cartoon actually speaks.
4. Never archaic, devotional, bookish, or government-style ${lang}.`}
5. ${first.name} speaks in short, excited, simple words. ${second.name} speaks in calm, clear,
   informative words. Their two voices must sound DIFFERENT on the page.
${spellings.length > 0
  ? `6. NAME SPELLING (EXACT — NO ALTERNATIVES). When a character's name is spoken inside a line, it must be written EXACTLY as:
${spellings.map((s) => `     ${s.name} → ${s.spelling}`).join("\n")}
   Never any other spelling of these names, and never in Latin letters. If a name is not spoken in a line, do not add it.`
  : ""}

===== CONTENT TRUTH RULES =====

1. Use ONLY facts present in the business information provided.
2. Do NOT invent addresses, prices, offers, claims, years, or services.
3. If a detail is missing, skip it cleanly. Never fabricate.
4. The ad must still SELL — every clip should carry one real reason to choose this business.

===== NUMBER AND CTA RULES =====

1. Never use digits in spoken content.
2. NEVER speak a phone number or contact number — it is shown on screen, not spoken.
3. Only the FINAL clip carries the call to action, and ${second.name} delivers it.
4. Do not leak CTA or "visit us / call us" language into earlier clips.

===== TONE =====

${adType === "festival"
  ? `This is a FESTIVAL greeting ad for ${festivalName || "the festival"} — warm, celebratory and affectionate, while still naming what the business does.`
  : "This is a COMMERCIAL ad — friendly, funny, and clearly persuasive. The humour must never bury the sell."}

Write the ${segmentCount} clips now, in the exact format above and nothing else.`;
};

/** Repair pass — same contract, aimed at the specific faults found. */
export const CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT = (
  pack: CharacterPack,
  duration: number,
  segmentCount: number,
  language: string = "Telugu",
  placeName: string = "",
): string => {
  const [first, second] = pack.characters;
  const spellings = packNameSpellings(pack, language);
  const place = (placeName || "").trim();
  return `You repair ${language} cartoon two-character ad scripts. You will be given a script and a
list of validation problems. Fix ONLY those problems and return the corrected script.

NON-NEGOTIABLE CONTRACT:
• EXACTLY ${segmentCount} clips, each with EXACTLY 2 lines
• ${first.name} speaks first in every clip, ${second.name} answers
• ${MIN_WORDS_PER_CLIP}-${MAX_WORDS_PER_CLIP} spoken words per clip; each line ${MIN_WORDS_PER_LINE}-${MAX_WORDS_PER_LINE} words
• Each line is one complete sentence ending in . ! or ?
• Output format exactly: \`<start>-<end>|${first.key}: <line>\` then \`<start>-<end>|${second.key}: <line>\`
• Keep the original meaning and the business facts — change only what is broken
• NEVER fix a word count by cutting a sentence in half. Shorten the THOUGHT instead: every line must still be one complete sentence that makes sense on its own
• Clip 1's first line must still be a hook that provokes — a surprise, an unanswered question, the customer's own problem, or disbelief. Never a greeting, a welcome, or an announcement
• The final clip must still FINISH the ad with a clear instruction to act — it must feel ended, not interrupted
• Across ALL ${segmentCount} clips together, "${first.name}" is spoken exactly once and "${second.name}" exactly once — both in clip 1 where they greet each other, and never again anywhere${place
  ? `\n• The town "${place}" is spoken exactly ONCE, in clip 1, in ${second.name}'s line, next to the business's name — written in ${language}. If it is missing, put it back; if it appears in a later clip, remove it there. Never a street, district, state or pincode`
  : `\n• No town, village, street or address is spoken anywhere — none was provided, so none may be invented`}
• Total duration is ${duration} seconds; never add or remove clips${spellings.length > 0
  ? `\n• A spoken character name is written EXACTLY as: ${spellings.map((s) => `${s.name} → ${s.spelling}`).join(", ")}`
  : ""}

Return ONLY the corrected clip lines, nothing else.`;
};

// ── 2 · Main frame: two characters staged in a real location ─────────────────────────────────

/**
 * Everything the frame prompts need that isn't the pack itself.
 *
 * Grouped rather than passed as eight positional arguments, and — more importantly — it carries the
 * ad configuration the member actually chose. The aspect ratio in particular used to reach this
 * path only as a generic override header, so the generated prompts never stated the frame they
 * were composed for.
 */
export interface CharacterFramePromptInput {
  segmentCount: number;
  /** What is said in each clip, so the backdrop can be chosen to prove the line. */
  clipSummaries: string[];
  locationMode: "real_provided" | "ai_generated";
  locationPlan: string;
  aspectRatio: "9:16" | "16:9";
  adType: string;
  festivalName?: string;
  /** True when the client's logo file is attached to the request. */
  hasLogo?: boolean;
  businessContext?: string;
}

/**
 * The director's shot plan — one designed shot per clip, in the order a real commercial moves.
 *
 * The standard human-model pipeline has had this from the start (services/prompts.ts) and it is the
 * single biggest reason its frames look art-directed rather than generic: each clip arrives with a
 * stated purpose, zone, camera and staging instead of "write a nice frame". The character version
 * had none of it and the prompts came out flat and interchangeable. Same idea, restaged for two
 * cartoon characters who walk a customer through a business.
 */
const SHOT_DESIGNS = [
  {
    name: "ARRIVAL / ESTABLISHING SHOT",
    zone: "the entrance, shopfront or main reception — where a real customer would walk in",
    camera: "wide enough to establish the place, both characters full-figure, the business clearly readable behind them",
    staging: "the two have just arrived and are taking the place in — open, welcoming body language turned towards camera",
    purpose: "establish WHERE we are and WHOSE business this is, in one glance",
  },
  {
    name: "THE PROOF SHOT",
    zone: "the working heart of the business — the counter, shelves, machines, stock or work area this clip's line is about",
    camera: "medium two-shot, closer in, with the real equipment or stock filling the space behind and beside them",
    staging: "one character gesturing towards the real thing being talked about while the other reacts to it",
    purpose: "show the actual proof of what is being claimed — the viewer must see the thing, not just hear about it",
  },
  {
    name: "THE SERVICE / TRUST SHOT",
    zone: "the customer-facing zone — billing counter, consultation desk, service point or display the client is proud of",
    camera: "medium two-shot at eye level, warmer and closer, with the business's own branding naturally in frame",
    staging: "engaged mid-conversation, relaxed and confident, as if a staff member is just out of frame",
    purpose: "build trust — this is a real, running business that looks after its customers",
  },
  {
    name: "THE DETAIL / DEPTH SHOT",
    zone: "a different zone not shown yet — a specialised area, secondary display, storage, or the back-of-house work area",
    camera: "a fresh angle with real depth, using the room's own lines and fixtures to frame the pair",
    staging: "actively exploring — leaning in, pointing something out, discovering it with the viewer",
    purpose: "prove the place is bigger than one corner and add visual variety",
  },
  {
    name: "THE CLOSING INVITATION",
    zone: "back at the entrance, main counter or the most inviting spot in the premises — full circle",
    camera: "clean, warm, slightly wider composition with the business unmistakable around them",
    staging: "both turned to camera, openly inviting the viewer in — the final impression",
    purpose: "end on 'come and visit' — the call to action needs a welcoming frame behind it",
  },
] as const;

/**
 * Picks the shots for this ad's length. Every ad opens on the arrival and ends on the invitation;
 * the middle is filled with the proof/trust/detail beats, so a 2-clip ad is arrival + close and a
 * long one still never repeats a zone.
 */
function shotsForClipCount(segmentCount: number): typeof SHOT_DESIGNS[number][] {
  if (segmentCount <= 0) return [];
  if (segmentCount === 1) return [SHOT_DESIGNS[0]];

  const [arrival, ...rest] = SHOT_DESIGNS;
  const closing = SHOT_DESIGNS[SHOT_DESIGNS.length - 1];
  const middlePool = rest.slice(0, rest.length - 1);
  const middle = Array.from(
    { length: Math.max(0, segmentCount - 2) },
    (_, i) => middlePool[i % middlePool.length],
  );
  return [arrival, ...middle, closing];
}

/**
 * Clip 1 is written in full; every later clip is a CONTINUATION that must not re-describe anything
 * already locked. That split is the other half of what the standard pipeline does — a continuation
 * frame that redescribes its subject gets a different-looking subject back from the generator.
 */
function clipShotPlan(
  segmentCount: number,
  clipSummaries: string[],
  shots: typeof SHOT_DESIGNS[number][],
  hasLogo: boolean,
  aspectRatio: string,
  orientation: string,
): string {
  return shots.map((shot, i) => {
    const n = i + 1;
    const line = clipSummaries[i] ? `\n   🗣️ THIS CLIP'S LINE: ${clipSummaries[i]}` : "";
    const head = `**CLIP ${n} — ${shot.name}**
   📍 ZONE: ${shot.zone}
   🎥 CAMERA: ${shot.camera}
   🎭 STAGING: ${shot.staging}
   🎯 PURPOSE: ${shot.purpose}${line}`;

    if (n === 1) {
      return `${head}

   Write a COMPLETE standalone prompt for this frame, about 90–120 words, as one flowing paragraph.
   Open by naming the photograph or generated zone this clip uses, then the two characters by name
   only, then the real fixtures and stock actually visible around them, then the light in that
   space, then the ${aspectRatio} ${orientation} framing.${hasLogo ? " Place the attached logo where it would really be installed in this zone." : ""}
   This frame sets the look for the whole ad — the grade, the light and the finish that every later
   clip has to match.`;
    }

    return `${head}

   ⚠️ CONTINUATION FRAME — clip 1's frame is attached as the reference. Do NOT re-describe the
   characters, the style, the grade or the business identity: they are LOCKED by that reference.
   Write ONE line referring to it — "the same Motu and Patlu exactly as in the attached reference
   frame, unchanged" — and then spend the rest of the prompt ONLY on what genuinely changes:
   the new zone and the real objects in it, the new staging and gestures, the new camera angle,
   and how the light differs in this part of the premises.
   Keep it SHORT: 60–90 words. Anything you re-describe is something the generator is free to
   redraw differently, which is exactly how the characters drift between clips.`;
  }).join("\n\n");
}

export const CHARACTER_MULTI_FRAME_SYSTEM_PROMPT = (
  pack: CharacterPack,
  input: CharacterFramePromptInput,
): string => {
  const {
    segmentCount, clipSummaries, locationMode, locationPlan,
    aspectRatio, adType, festivalName, hasLogo = false, businessContext = "",
  } = input;
  const clipContext = clipSummaries.map((s, i) => `  Clip ${i + 1}: ${s}`).join("\n");
  const orientation = aspectRatio === "16:9" ? "horizontal (landscape)" : "vertical (portrait)";
  const shots = shotsForClipCount(segmentCount);

  /**
   * The logo is ATTACHED, so the model can see it. Describing it is worse than useless: the words
   * compete with the image and the generator redraws an approximation of the description instead
   * of reproducing the real thing.
   */
  const logoBlock = hasLogo
    ? `===== LOGO =====

The client's logo is attached to this request. Every prompt must place it in the scene as real
signage already installed in that zone — and must refer to it only as "the attached logo".
Do NOT describe the logo: not its text, colours, shape, icon, or wording. It is attached; the image
generator can see it. Describing it makes the generator redraw an approximation instead of using it.
The attached logo is the only text anywhere in the frame — never invent other signage or wall text.`
    : `===== LOGO =====

No logo was provided. Do not invent one, and do not put any text, signage or lettering in the frame.`;

  const locationBlock = locationMode === "real_provided"
    ? `===== LOCATION: THE CLIENT'S REAL PHOTOGRAPHS (AUTHORITATIVE) =====

Real photographs of this business are attached. They are the ground truth for every clip.

• Each clip has been assigned ONE specific photograph — build that clip's frame from THAT photo.
• REPRODUCE the real place: its actual architecture, counters, shelving, stock, signage, flooring,
  wall colours and fixtures. Do not redesign, tidy, upgrade, or re-imagine it.
• MATCH that photo's own lighting — direction, hardness and colour temperature — when lighting the
  two characters, so they look photographed in that room rather than pasted onto it.
• MATCH the camera perspective and eye level of the photo. The characters must sit correctly in
  that space, standing on the actual floor, at believable scale against real objects.
• Keep the business's real signage and branding legible exactly as photographed.

${locationPlan}`
    : `===== LOCATION: GENERATED FROM THE BUSINESS PROFILE =====

No client photographs were provided, so build a believable, photoreal location for this exact kind
of business from the profile below. It must look like a real operating Indian business — real
stock, real fixtures, real wear — never a showroom render or an empty studio set.

${locationPlan}`;

  return `You are a world-class advertising art director who stages CARTOON CHARACTERS inside REAL
photographed business locations for television commercials.

YOUR TASK: Write ${segmentCount} image-generation prompts — one per ${CLIP_SECONDS}-second
clip — each showing BOTH characters together inside this business.

===== AD CONFIGURATION (WHAT WAS ORDERED) =====

• Aspect ratio: ${aspectRatio} ${orientation} — compose and frame EVERY clip for this canvas.
• Clips: ${segmentCount}, ${CLIP_SECONDS} seconds each.
• Ad type: ${adType === "festival" ? `festival greeting for ${festivalName || "the festival"} — layer the festival cues naturally over the real premises, never replace them` : "commercial — the business and what it sells must be unmistakable"}.

Every prompt must state the ${aspectRatio} ${orientation} framing explicitly, and stage the two
characters and the business zone to fill that shape properly — no composition borrowed from a
different aspect ratio.

${characterCastBlock(pack)}

${locationBlock}

${logoBlock}

===== WHAT EACH CLIP'S DIALOGUE IS ABOUT =====

${clipContext}

===== THE ONE RULE THAT MATTERS MOST: A DIFFERENT PLACE EVERY CLIP =====

Every clip must be set in a DIFFERENT part of the business, and that part must be chosen to match
what the characters are SAYING in that clip. If they are talking about the product range, stand
them at the shelves. If they are talking about service, stand them at the counter. If they are
welcoming, put them at the entrance. Never repeat a location, and never pick a zone at random —
the background must prove the line.

===== STAGING BOTH CHARACTERS =====

• BOTH characters visible in every frame, clearly separated, neither hidden or cropped.
• Stage them mid-conversation, angled slightly towards each other but open to camera — the classic
  two-hander. The one who is speaking is the more animated of the two.
• They must be the focus, but the business must be unmistakable behind them.
• Say nothing about their build, size or how tall either one is. They are the real characters —
  their proportions come with them. Writing it down only invites the generator to redraw them.

===== THE SHOT PLAN — WRITE THESE ${segmentCount} PROMPTS =====

${clipShotPlan(segmentCount, clipSummaries, shots, hasLogo, aspectRatio, orientation)}

===== OUTPUT FORMAT =====

Write ${segmentCount} prompts separated by ###CLIP### on its own line, in clip order, nothing else.
Each prompt is plain flowing English — no headings, no numbering, no bullet lists, no commentary,
and no negative list. Follow the per-clip word budgets above. Never describe what the characters
look like${hasLogo ? ", and never describe the attached logo" : ""} — naming them is enough.

${characterNegativesBlock(pack)}

${businessContext ? `===== BUSINESS CONTEXT =====\n${businessContext}` : ""}`;
};

// ── 3 · Veo: the talking two-hander ───────────────────────────────────────────────────────────

/**
 * Short on purpose.
 *
 * The first version of this asked for the scene, both characters in full, the exchange, performance
 * direction and camera work — and produced prompts so long the member could not read them, for no
 * gain: Veo needs the line, the place and who says it. This mirrors the standard ad's Veo prompt
 * (services/prompts.ts VEO_SEGMENT_SYSTEM_PROMPT) — a fixed shape with the words dropped in.
 */
export const CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT = (
  pack: CharacterPack,
  segmentCount: number,
  aspectRatio: "9:16" | "16:9" = "9:16",
): string => {
  const [first, second] = pack.characters;
  const cast = pack.characters.map((c) => c.name).join(" and ");
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";

  return `You are an expert at formatting video generation prompts for Veo 3.

YOUR TASK: Generate ${segmentCount} copy-paste-ready Veo 3 prompts, one per ${CLIP_SECONDS}-second clip.
INPUT: each clip's two-line dialogue, ${first.name} first, then ${second.name}.

EACH CLIP'S FRAME IMAGE IS ATTACHED. Veo animates that image, so the characters, the location and
the light already exist. Describing them back only gives the model a vaguer second version to drift
towards. Write what MOVES and what is HEARD — nothing else.

Output each clip in this EXACT FORMAT:

${aspectRatio} ${orientation} video. Animate the attached frame, keeping it exactly as it is.

${first.name} says, in his own original ${first.name} voice from the show: "\${${first.name}'s line}"
Then ${second.name} replies, in his own original ${second.name} voice from the show: "\${${second.name}'s line}"

Only the speaking character's mouth moves; the other listens and reacts. Camera holds steady, single continuous shot.

Negative prompt:
No text on the screen, no subtitles, no watermark
No background music, pure studio voice over, crystal clear voice, no echos
No new or different voices, no narrator, no dubbing accent
No change to the characters, location or framing from the attached image

RULES:
• NEVER describe the location, characters, lighting or composition — the attached frame IS all of that. Most important rule here.
• Keep each prompt SHORT — the shape above, nothing more.
• VOICES ARE STRICT: only the original ${cast} voices from the show — ${first.name} ${first.voice}, ${second.name} ${second.voice}. Never a narrator, a new voice actor, or a different accent.
• Use the dialogue lines EXACTLY as given — do not rewrite, translate or shorten them.
• Only the dialogue changes between clips; every clip has its own attached frame.

Provide ONLY the prompts. Separator between segments: "###SEGMENT###"`;
};

// ── 4 · Location index: read the client's photos before assigning them ────────────────────────

/**
 * Reads each uploaded photo once and tags what it shows, so clips can be matched to the RIGHT
 * photo rather than the next one in the list. Without this, photo N lands on clip N and the
 * background contradicts the dialogue half the time.
 */
export const LOCATION_INDEX_SYSTEM_PROMPT = `You are a location scout reviewing photographs of a
single business, so an art director can decide which photo suits which line of an advertisement.

For EACH photograph provided, in the order given, return one JSON object:

{
  "index": <0-based position of the photo as provided>,
  "zone": "<short name for this part of the business, e.g. 'entrance', 'billing counter', 'product shelves', 'workshop floor', 'consultation desk'>",
  "shows": "<what is actually visible: fixtures, stock, equipment, signage, seating>",
  "lighting": "<direction, hardness and colour temperature, e.g. 'soft daylight from camera-left, warm tungsten fill'>",
  "cameraHeight": "<eye level / low / high>",
  "bestFor": "<what kind of ad line this backdrop would prove, e.g. 'product range', 'welcome', 'service quality', 'expertise'>",
  "usable": <true|false — false only if too dark, too blurry, or showing nothing about the business>
}

Return ONLY a JSON array of these objects, in photo order. No commentary.`;
