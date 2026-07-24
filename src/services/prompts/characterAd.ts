import { packNameSpellings, type CharacterPack } from "@/services/characterPacks";
import { WORDS_PER_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE } from "@/utils/dialogueFormat";
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
const promotionalBeats = (segmentCount: number, first: string, second: string): string => {
  if (segmentCount <= 1) {
    return `The single clip must name the business, give one real reason to choose it, and end with `
      + `${second} delivering the call to action.`;
  }

  const beats = [
    `Clip 1 — HOOK: ${first} raises the customer's real question or problem. ${second}'s answer NAMES `
    + `THE BUSINESS and says plainly what it does.`,
  ];
  for (let i = 2; i < segmentCount; i++) {
    beats.push(
      `Clip ${i} — PROOF: one specific, real thing this business offers, taken from the business `
      + `information. A different one in each clip — never repeat a benefit already used.`,
    );
  }
  beats.push(
    `Clip ${segmentCount} — CLOSE: ${second} gives the reason to act now and delivers the call to action.`,
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
): string => {
  const lang = (language || "Telugu").trim() || "Telugu";
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

The characters are the delivery, not the subject. This ad sells the business described in the
BUSINESS INFORMATION you are given — it is not a comedy sketch, and it is not a general chat about
advertising, marketing, offers or "promotion". The humour exists only to carry the sell.

CLIP-BY-CLIP STRUCTURE:

${promotionalBeats(segmentCount, first.name, second.name)}

GROUND EVERY SINGLE LINE IN THE DATA YOU WERE GIVEN:
1. Say the business's REAL NAME out loud in the ad, early — a viewer must know who this is.
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
   them. Each clip must total EXACTLY ${WORDS_PER_CLIP} spoken words, and each character's single
   line must be between ${MIN_WORDS_PER_LINE} and ${MAX_WORDS_PER_LINE} words. Count carefully.
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
): string => {
  const [first, second] = pack.characters;
  const spellings = packNameSpellings(pack, language);
  return `You repair ${language} cartoon two-character ad scripts. You will be given a script and a
list of validation problems. Fix ONLY those problems and return the corrected script.

NON-NEGOTIABLE CONTRACT:
• EXACTLY ${segmentCount} clips, each with EXACTLY 2 lines
• ${first.name} speaks first in every clip, ${second.name} answers
• EXACTLY ${WORDS_PER_CLIP} spoken words per clip; each line ${MIN_WORDS_PER_LINE}-${MAX_WORDS_PER_LINE} words
• Each line is one complete sentence ending in . ! or ?
• Output format exactly: \`<start>-<end>|${first.key}: <line>\` then \`<start>-<end>|${second.key}: <line>\`
• Keep the original meaning and the business facts — change only what is broken
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
• Keep their height difference honest and constant, and keep both in scale with the real room.
• They must be the focus, but the business must be unmistakable behind them.

===== OUTPUT FORMAT =====

Write ${segmentCount} prompts separated by ###CLIP###.
Each prompt is ONE short paragraph — about 60 to 90 words — naming the two characters, the specific
business zone for that clip, the lighting, the staging, the camera framing and the ${aspectRatio}
${orientation} canvas. Never describe what the characters look like${hasLogo ? ", and never describe the attached logo" : ""} — naming them is
enough. Do NOT number them, add headings, or explain.

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

INPUT PROVIDED: each clip's two-line dialogue (${first.name} first, then ${second.name}) and the location it plays in.

ORDERED FORMAT: ${aspectRatio} ${orientation} video. Every prompt must state it.

You must output each clip in this EXACT FORMAT:

${aspectRatio} ${orientation} video. ${cast}, the real original characters from ${pack.franchise}, in \${location for this clip}. \${lighting and camera framing, one short phrase}.

${first.name} says, in a ${first.voice} voice: "\${${first.name}'s line}"
Then ${second.name} replies, in a ${second.voice} voice: "\${${second.name}'s line}"

Only the speaking character's mouth moves; the other listens and reacts. Single continuous shot, no cuts.

Negative prompt:
No text on the screen, no subtitles, no watermark
No background music, pure studio type voice over, crystal clear voice, no echos
Do not restyle the location into a cartoon, no extra characters, no character morphing

RULES:
• Keep each prompt SHORT — the shape above and nothing more. No paragraphs of description.
• These must be the REAL ${cast} from ${pack.franchise} — not look-alikes, not a new cartoon duo.
• NEVER describe what ${cast} look like. Their names are enough; describing them makes the model draw the wrong characters.
• Use the dialogue lines EXACTLY as provided — do not rewrite, translate or shorten them.
• Only the location and the dialogue change between clips.

OUTPUT FORMAT:
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
