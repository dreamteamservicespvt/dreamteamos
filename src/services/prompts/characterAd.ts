import { packNameSpellings, type CharacterPack } from "@/services/characterPacks";
import {
  MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE, wordBudgetFor,
} from "@/utils/dialogueFormat";
import { CLIP_SECONDS } from "@/utils/voiceOverFormat";
import { packLocationSubject, packStagingRole, realLocationFormula } from "./realLocation";
import { coreMessageBlock, type CoreMessageBrief } from "./coreMessage";
import { everydaySpeechRules } from "./everydaySpeech";
import { wishAudienceRule } from "./festivalWish";
import {
  HAND_GESTURES, VEO_DIRECTION_SYSTEM_PROMPT, WALK_MANNER, compositionFor, framingForMotion, withoutStillness,
  type ClipMotionPlan, type Performer,
} from "./motion";

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
export const characterCastBlock = (pack: CharacterPack, wardrobe?: string): string => {
  const cast = pack.characters.map((c) => c.name).join(" and ");

  /**
   * What kind of identity this is, and therefore what “get it right” means.
   *
   * The original wording — “the REAL, ORIGINAL characters … exactly as they appear on screen in
   * that show … NOT a new pair of Indian cartoon men” — is precisely correct for a cartoon and
   * actively wrong for everything else. A deity does not appear in a show. A Real Owner Face ad
   * has no franchise at all: the identity is a photograph the client sent, and telling the model
   * to reach for a recognisable existing character is the one instruction guaranteed to lose the
   * client’s actual face. So each family is told what its own identity anchor is.
   */
  const identity = pack.usesClientFace
    ? `${cast} IS THE CLIENT THEMSELF, built from the photograph supplied with this job.
That photograph is the only source of this face. Reproduce it exactly: the same bone structure, the same
age, the same skin tone, the same hair, the same build — in EVERY clip, from every angle.
Do NOT beautify, slim, de-age, lighten, restyle or “improve” them, and do NOT substitute a model who merely
resembles them. If the owner’s own family would not say “that is them”, the frame is WRONG.`
    : pack.family === "god"
      ? `${cast} — ${pack.franchise}.
Depict the deity with full devotional accuracy and respect: the established iconography, attributes, vahana,
posture and colour associations, exactly as a devotee would expect to see them.
Never comic, never romanticised, never casual, and never blended with another deity’s iconography.
The same ${cast}, identical in every clip.`
      : pack.family === "human"
        ? `${cast} — ${pack.franchise}.
One consistent person: cast them once, in clip 1, and keep that exact face, age, build, hair and wardrobe
in every clip after. A presenter who changes between clips reads as a different person and destroys the ad.`
        : pack.family === "custom"
          ? `${cast} — ${pack.franchise}`
          : `${cast} — the REAL, ORIGINAL character${pack.characters.length > 1 ? "s" : ""} from ${pack.franchise}, exactly as they appear on screen in that show.
These specific existing characters and nobody else: NOT look-alikes, NOT "inspired by", NOT newly invented cartoons.
If a viewer who watches the show would not instantly recognise them as ${cast}, the frame is WRONG.
Do not restyle, redesign or reinterpret them, and do not describe their appearance in the prompt: name them and let them be themselves.
They must be the same ${cast} in every clip.`;

  /**
   * The outfit that was ordered, for an entry with a real person on screen.
   *
   * The human-model entries' STAGING offers "a formal suit or a designer saree" and leaves the
   * generator to choose — which it did differently from one ad to the next, whatever the client had
   * asked for. When an attire was ordered it is stated after STAGING and said to override it, so
   * the choice the team made is the one on screen, identical in every clip.
   */
  const wardrobeBlock = wardrobe && pack.family === "human"
    ? `\n\nWARDROBE (as ordered — this overrides any outfit STAGING offers): ${wardrobe}. The exact same outfit, colour and styling in every clip.`
    : "";

  return `===== CHARACTERS =====

${identity}

STAGING: ${pack.styleDirective}${wardrobeBlock}`;
};

/**
 * The ordered attire, written as a wardrobe line for a human-model entry.
 *
 * Mirrors the four AttireType values without importing them, so this prompt module stays free of
 * the app's form types. Colour always comes from the client's brand palette — the one choice the
 * brief never makes.
 */
export const wardrobeDirective = (
  attireType?: string | null,
  customAttire?: string | null,
  gender?: string | null,
): string => {
  const male = gender === "male";
  switch (attireType) {
    case "traditional":
      return male
        ? "an elegant traditional kurta with a Nehru jacket, in a colour drawn from the client's brand palette"
        : "an elegant designer silk saree with a modest elbow-length blouse, in a colour drawn from the client's brand palette, with tasteful traditional jewellery";
    case "shirt_pant":
      return "a crisp formal shirt neatly tucked into tailored formal trousers with a leather belt, in colours drawn from the client's brand palette";
    case "custom":
      return customAttire?.trim()
        ? `exactly this outfit: ${customAttire.trim()}`
        : "the outfit described in the client's brief";
    case "professional":
      return male
        ? "a premium tailored men's formal suit — structured blazer, crisp shirt, formal trousers — in a colour drawn from the client's brand palette"
        : "a premium tailored formal suit — structured blazer, crisp inner shirt, slim formal trousers — in a colour drawn from the client's brand palette";
    default:
      return "";
  }
};

/**
 * How this character MOVES, SOUNDS and IS SHOT.
 *
 * The single most important block for making thirty-two options behave like thirty-two options.
 * `franchise` anchors WHO; without this, a model given only a name falls back to the same neutral
 * presenter reciting an advertisement whoever it was asked for — Shiva and SpongeBob rendered with
 * the same face, the same hands and the same camera.
 *
 * Every line is optional and omitted when the entry does not carry it, so the pack that predates
 * these fields emits exactly the prompt it always did.
 */
/** Which slices of the direction a given prompt should carry. */
export type DirectionScope = "script" | "frame" | "video";

/**
 * How this character MOVES, SOUNDS and IS SHOT.
 *
 * The single most important block for making thirty-two options behave like thirty-two options.
 * `franchise` anchors WHO; without this a model given only a name falls back to the same neutral
 * presenter whoever it was asked for — Shiva and SpongeBob rendered with the same face, the same
 * hands and the same camera.
 *
 * ── Why the IMAGE prompt gets less of it ────────────────────────────────────────────────────
 * Body language is written in terms of stance, weight and scale against the room, and on a still
 * frame that reads as a description of the character's BUILD. Describing a famous character's
 * build is the one thing this whole file is organised around not doing: it makes the generator
 * redraw them to the words instead of using the real pair, which is how two identically-sized
 * cartoon men kept coming back instead of Motu and Patlu. So the frame prompt takes performance
 * and camera direction and leaves the body to the video prompt, where it describes MOTION.
 *
 * Voice and script style are omitted from the frame prompt for the plainer reason that a still
 * image cannot carry either.
 *
 * Every field is optional and omitted when absent, so a pack predating them emits exactly the
 * prompt it always did.
 */
export const characterDirectionBlock = (
  pack: CharacterPack,
  scope: DirectionScope = "video",
): string => {
  /**
   * ── Why the VIDEO prompt gets no camera and no stillness ────────────────────────────────────
   * The catalogue's camera and body direction was written for held frames — "tripod-locked with
   * absolutely no movement", "Patlu stays planted and completely still", Shiva "a still frame with a
   * moving mouth is correct here" — and the video director was told to follow it, which is exactly why
   * the special-category videos stayed static. The camera now belongs to the motion plan (prompts/
   * motion), and every clause that orders stillness is taken out of what the director reads. What
   * makes the character THEM — manner, gestures, expressions, what a deity must never touch — stays.
   */
  const all: [string, string | undefined, DirectionScope[]][] = [
    ["VOICE & MODULATION", pack.voiceDirection, ["script", "video"]],
    ["FACIAL EXPRESSION", pack.expressionDirection, ["script", "frame", "video"]],
    ["EYES & GAZE", pack.eyeDirection, ["script", "frame", "video"]],
    ["HAND GESTURES", pack.gestureDirection, ["script", "frame", "video"]],
    ["BODY LANGUAGE", pack.bodyLanguage, ["video"]],
    ["CAMERA & CINEMATIC DIRECTION", pack.cameraDirection, ["frame"]],
    ["BACKGROUND", pack.backgroundDirection, ["frame", "video"]],
    ["SCRIPT STYLE", pack.scriptStyle, ["script"]],
  ];

  const lines = all
    .filter(([, v, scopes]) => !!(v && v.trim()) && scopes.includes(scope))
    .map(([k, v]) => [k, scope === "video" ? withoutStillness(v as string) : (v as string)] as const)
    .filter(([, v]) => !!v.trim())
    .map(([k, v]) => `${k}: ${v}`);

  if (lines.length === 0) return "";

  return ["===== HOW THIS CHARACTER PERFORMS =====", ""]
    .concat(lines)
    .join(String.fromCharCode(10));
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
/**
 * The promotional shape of the script, clip by clip.
 *
 * Cast-aware because a solo entry has nobody to address. Written for two, it told a lone deity to
 * greet themselves by name in clip 1 and to answer their own question — an instruction with no
 * possible correct output, which the validator then enforced.
 */
const promotionalBeats = (segmentCount: number, first: string, second: string, place: string): string => {
  const solo = first === second;
  const placeAndName = place
    ? `NAMES THE BUSINESS **and says it is in ${place}**, saying plainly what it does and the core promise that makes it worth choosing`
    : `NAMES THE BUSINESS, saying plainly what it does and the core promise that makes it worth choosing`;

  if (segmentCount <= 1) {
    return `The single clip must name the business${place ? ` and the town it is in (${place})` : ""}, give one `
      + `real reason to choose it, and end with ${second} delivering the call to action.`;
  }

  const beats = [
    solo
      ? `Clip 1 — THE HOOK: ${first}'s first line must STOP someone who is scrolling past. They react `
        + `to something striking in front of them — see THE HOOK below for how — and in the same breath `
        + `${placeAndName}. This clip carries the one and only mention of ${first}'s name.`
      : `Clip 1 — THE HOOK: ${first}'s first line must STOP someone who is scrolling past. He addresses `
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
    + (solo
      ? `inviting the viewer to come to the business the way ${first} just showed them.`
      : `inviting the viewer to come to the business the way the two of them just did.`),
  );
  return beats.join(String.fromCharCode(10));
};

/**
 * The shape of a FESTIVAL WISHES ad, clip by clip.
 *
 * A festival ad is not a commercial with a festive adjective in it. The business is WISHING the
 * viewer, and that wish is the whole of clip 1 — no product, no offer, no town, no call to action.
 * The selling starts at clip 2 and runs exactly as it would in any other ad.
 *
 * The standard human-model path has enforced this split for a long time (FESTIVAL MODE in
 * services/prompts). The character path never did: choosing Festival Wishes alongside a special
 * category changed one TONE sentence and nothing else, so the commercial skeleton below — clip 1 is
 * a hook, greetings are banned, the town goes in clip 1 — stayed in force and the member got an
 * ordinary promotional script back. This is that same festival contract, written for a cast.
 */
const festivalBeats = (
  segmentCount: number,
  first: string,
  second: string,
  place: string,
  festival: string,
  /** The ad's language, so the wish is addressed in the words that language uses. */
  language: string,
): string => {
  const solo = first === second;
  /**
   * Two forms of the occasion, because a missing festival name has to read as English either way.
   * `occasion` stands alone ("Diwali is finished", "the festival is finished"); `bare` follows an
   * article ("a happy Diwali", "a happy festival") where "the festival" would double the article.
   */
  const occasion = (festival || "").trim() || "the festival";
  const bare = (festival || "").trim() || "festival";
  const placeAndName = place
    ? `NAMES THE BUSINESS **and says it is in ${place}**, saying plainly what it does and the core promise that makes it worth choosing`
    : `NAMES THE BUSINESS, saying plainly what it does and the core promise that makes it worth choosing`;

  /** Clip 1 is the greeting itself, and it is the only clip the names are allowed in. */
  const wishes = solo
    ? `Clip 1 — THE WISHES (NOT A HOOK, NOT A SELL): ${first} wishes the viewer and their family a `
      + `happy ${bare} ON BEHALF OF THE BUSINESS, naming the business as the one sending the `
      + `wish. ${wishAudienceRule(festival, language)} This clip carries the one and only mention of `
      + `${first}'s name.`
    : `Clip 1 — THE WISHES (NOT A HOOK, NOT A SELL): ${first} greets ${second} BY NAME about `
      + `${occasion}, and ${second} answers with "${first}" and wishes the viewer and their family a `
      + `happy ${bare} ON BEHALF OF THE BUSINESS, naming the business as the one sending the `
      + `wish. ${wishAudienceRule(festival, language)} This clip carries the one and only mention of `
      + `each name — no clip after this may use either again.`;

  const nothingElse = `Clip 1 CONTAINS NOTHING ELSE. No product, no service, no offer, no price, no `
    + `speciality, no reason to buy, no call to action${place ? `, and not the town "${place}"` : ""}. `
    + `One selling word in clip 1 and the ad has failed — it is a greeting card, not an advertisement.`;

  if (segmentCount <= 1) {
    return `${wishes}\nThere is only this one clip, so ${second} closes the same wish with a short, `
      + `warm invitation to visit the business${place ? ` in ${place}` : ""}. Nothing is sold beyond that.`;
  }

  if (segmentCount === 2) {
    return [
      wishes,
      nothingElse,
      `Clip ${segmentCount} — THE TURN AND THE CLOSE: ${occasion} is finished and is never `
      + `mentioned again. ${solo
        ? `${first} ${placeAndName}, gives ONE real reason to choose it, and ends with the call to action.`
        : `${first} reacts to one striking, real thing about the business, and ${second} ${placeAndName} `
          + `and ends with the call to action.`}`,
    ].join(String.fromCharCode(10));
  }

  const beats = [
    wishes,
    nothingElse,
    `Clip 2 — THE TURN (this is where the ad starts selling): ${occasion} is finished and is `
    + `never mentioned again in any later clip. ${solo
      ? `${first} reacts to something striking about the business — see THE HOOK below for how — and `
        + `in the same breath ${placeAndName}.`
      : `${first} reacts to something striking about the business — see THE HOOK below for how — and `
        + `${second} answers and ${placeAndName}.`}`,
  ];
  for (let i = 3; i < segmentCount; i++) {
    beats.push(
      `Clip ${i} — PROOF: one specific, real thing this business offers, taken from the business `
      + `information. A different one in each clip — never repeat a benefit already used.`,
    );
  }
  beats.push(
    `Clip ${segmentCount} — CLOSE: ${second} gives the reason to act now and delivers the call to action, `
    + (solo
      ? `inviting the viewer to come to the business the way ${first} just showed them.`
      : `inviting the viewer to come to the business the way the two of them just did.`),
  );
  return beats.join(String.fromCharCode(10));
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
  /** The core message decided before writing — see prompts/coreMessage. */
  brief: CoreMessageBrief | null = null,
): string => {
  const lang = (language || "Telugu").trim() || "Telugu";
  const place = (placeName || "").trim();
  const isLatin = lang.toLowerCase() === "english";
  /**
   * Festival Wishes, chosen alongside a special category.
   *
   * Everything structural below branches on this: which clip is the hook, which clip carries the
   * town, what the worked example looks like, and whether a greeting is allowed to open the ad. It
   * used to change only the TONE line at the bottom, which is why festival ads came back as
   * ordinary promotional scripts.
   */
  const isFestival = adType === "festival";
  /** The occasion as it will be spoken. Empty festival names still have to read as a sentence. */
  const occasion = (festivalName || "").trim() || "the festival";
  /**
   * The same occasion without its article, for the many places that already supply one.
   * "the ${occasion} wish" reads as "the the festival wish" when a member chose Festival Wishes
   * but never picked the festival, which happens.
   */
  const occasionBare = (festivalName || "").trim() || "festival";
  /**
   * The occasion inside the worked example, which is a quoted spoken line rather than an
   * instruction. "a very happy the festival" is not a sentence, so the example falls back to a
   * named festival while the instructions around it keep the neutral wording.
   */
  const exampleOccasion = (festivalName || "").trim() || "Diwali";
  /**
   * Where the commercial hook lives. In a festival ad clip 1 is the wish, so the hook moves down —
   * except in a one-clip ad, where there is nowhere to move it to and the single clip carries the
   * wish and the invitation together. Pointing the town or the hook at a clip 2 that does not exist
   * is an instruction with no correct output.
   */
  const hookClip = isFestival && segmentCount > 1 ? 2 : 1;
  /** True only when the ad is long enough to actually have a turn. */
  const festivalTurn = isFestival && hookClip > 1;
  const [first] = pack.characters;
  /**
   * The second speaker, or the first again when there is only one.
   *
   * This prompt was written for a two-hander and reads `second.name` throughout. Twenty-three of
   * the thirty-two catalogue entries have a single speaker, and on those `pack.characters[1]` is
   * undefined — which threw before a single word of the script was generated. Falling back keeps
   * the template safe; the prose that would actually READ wrong for one person is branched on
   * `solo` below, because a fallback stops a crash but cannot stop a sentence being nonsense.
   */
  const second = pack.characters[1] ?? first;
  const spellings = packNameSpellings(pack, lang);

  /**
   * How many people are actually in this ad.
   *
   * The catalogue holds duos AND single characters — a lone deity, one cartoon, the client’s own
   * face — and this prompt used to hard-code a two-line exchange per clip. Asked for Lord Shiva it
   * would invent a second speaker purely to satisfy the contract, because the contract is the
   * format a model obeys far more literally than any prose above it. So it is built from the cast.
   */
  const solo = pack.characters.length === 1;
  /** 18-20 words an 8-second clip, split between the cast. See wordBudgetFor. */
  const budget = wordBudgetFor(pack.characters.length);

  const contract = Array.from({ length: segmentCount }, (_, i) => {
    const start = i * CLIP_SECONDS;
    const end = start + CLIP_SECONDS;
    return pack.characters
      .map((c) => `${start}-${end}|${c.key}: [${c.name}'s line]`)
      .join(String.fromCharCode(10));
  }).join(String.fromCharCode(10));

  return `You are a WORLD-CLASS ${lang.toUpperCase()} AD SCRIPTWRITER writing a ${duration}-second
${isFestival ? `${occasionBare.toUpperCase()} GREETING advertisement` : "television commercial"} in which ${solo
  ? `${first.name} presents a real business straight to camera`
  : "two well-known characters visit a real business and talk to each other about it"}.

===== ${solo ? "THE CHARACTER" : "THE TWO CHARACTERS"} =====

${pack.characters.map((c) => `${c.name} — ${c.persona}\n  Voice: ${c.voice}\n  Their job in the script: ${c.scriptRole}`).join("\n\n")}

===== THE BEAT (NEVER BREAK THIS) =====

${pack.dialogueRhythm}

${solo
  ? `Every clip is ONE line from ${first.name}: a set-up half and a pay-off half inside a single breath.
It must sound like ${first.name} talking to the viewer — never a narrator reading an advertisement,
and never a second voice answering, because there is nobody else in this ad.`
  : `Every clip is a tiny two-line exchange: a set-up and a pay-off. It must feel like a real
conversation between friends — never two separate announcements stitched together. ${second.name}'s
line must actually ANSWER what ${first.name} just said.`}

${characterDirectionBlock(pack, "script")}

${isFestival ? `===== THIS IS A ${occasionBare.toUpperCase()} GREETING AD FROM ONE SPECIFIC BUSINESS =====

THE BUSINESS IS WISHING THE VIEWER. That is what a Festival Wishes ad is, and it is the reason the
client paid for one. Clip 1 is the wish and nothing but the wish — the business sends ${occasionBare}
greetings to the viewer and their family, and sells nothing at all. ${festivalTurn
  ? `From clip ${hookClip} the ad becomes an
ordinary promotion for the same business and the festival is never spoken of again.`
  : `This ad is one clip long, so
that wish closes with a short invitation and nothing more is sold.`}

A script whose clip 1 opens with a sales hook, a question about the shop, a product, an offer or a
welcome is WRONG however good it is. Rewrite clip 1 as the wish.

THIS OVERRIDES THE PERFORMANCE DIRECTION ABOVE. ${solo ? `${first.name}'s` : "These characters'"} own notes were written for an
ordinary ad, so where they say clip 1 hooks the viewer, states the customer's problem, introduces
${solo ? "the speaker" : "the two of them"}, or names the business and its town — ${festivalTurn
  ? `that is now clip ${hookClip}`
  : "none of that happens here"}. Clip 1 is the
${occasionBare} wish, whatever any direction above says clip 1 should be. Everything else in those
notes — the voice, the faces, the gestures, the camera, the register — is unchanged.

` : ""}===== ${festivalTurn ? `AND FROM CLIP ${hookClip} IT IS A PROMOTIONAL AD FOR ONE SPECIFIC BUSINESS` : "THIS IS A PROMOTIONAL AD FOR ONE SPECIFIC BUSINESS"} =====

${solo
  ? `THE SITUATION, AND IT NEVER CHANGES: ${first.name} has come to this client's business to show
it to people. They are standing in the real premises, talking straight to the viewer about why it is
worth coming to. Write it as that visit — never as an announcement read out over pictures.`
  : `THE SITUATION, AND IT NEVER CHANGES: ${first.name} and ${second.name} have come to this client's business to show it to people. They are standing in the real premises, seeing the real thing, and telling the viewer why it is worth coming to. Write it as that visit — two friends who turned up at a good place and want everyone to know about it — never as a studio announcement, never as an advert read aloud, never as a comedy sketch with a tagline bolted on the end.`}

The characters are the DELIVERY, not the subject. This ad sells the business described in the
BUSINESS INFORMATION you are given — it is not a general chat about advertising, marketing, offers
or "promotion". The humour exists only to carry the sell. Every line must sound like natural
${lang} speech between the two of them, not like a written slogan.${isFestival ? `

The one exception is clip 1, which sells nothing because it is the ${occasionBare} wish. Everything in
this section applies from clip ${hookClip} onward.` : ""}

===== BOTH NAMES, EACH EXACTLY ONCE (STRICT) =====

${solo ? `Say "${first.name}" AT MOST ONCE in the whole script, in clip 1. Every word spent on the character is a word the client did not get.` : `BOTH characters must be named in the ad, and each name is spoken EXACTLY ONE TIME across the ENTIRE
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
`}

${coreMessageBlock(brief, isFestival && segmentCount > 1 ? 2 : 1)}

CLIP-BY-CLIP STRUCTURE:

${isFestival
  ? festivalBeats(segmentCount, first.name, second.name, place, festivalName, lang)
  : promotionalBeats(segmentCount, first.name, second.name, place)}

${place
  ? `===== SAY WHERE THIS BUSINESS IS (MANDATORY) =====

THE TOWN IS: ${place}

This ad is watched by people who live near this shop, and "near" is the entire reason they stop
scrolling. So the ad must SAY the place out loud. A viewer who hears the ad once must come away
knowing the business is in ${place} — not a nice-sounding shop somewhere in the state.

• "${place}" is spoken EXACTLY ONCE, in CLIP ${hookClip}, in ${second.name}'s line, joined to the business's
  name in the same breath — the way a person says it: "that is <business> here in ${place}".${festivalTurn ? `
• NOT in clip 1. Clip 1 is the ${occasionBare} wish and carries no town — a wish does not come with an
  address on it. The town belongs in clip ${hookClip}, where the ad starts talking about the business.` : ""}
• Frame it as the two of them having COME there today. They have travelled to ${place} and walked
  into this business, and they are telling the viewer about the place they are standing in.
• Say the town, not a whole address. Never a door number, street, district, state or pincode —
  those are read on screen, never spoken.
• Never repeat "${place}" in any other clip. Once is what a listener needs; twice is a word the
  business did not get.
• SPELL IT EXACTLY AS "${place}" — that spelling and no other. A town whose name is written two
  different ways in two runs is a town the client does not recognise as theirs.

A script that never says "${place}" has FAILED, however good the rest of it is. Check before you
output: does clip ${hookClip} contain the town's name? If not, rewrite clip ${hookClip}.`
  : `===== NO TOWN WAS PROVIDED =====

The business information does not say which town or village this business is in, so DO NOT mention
a place anywhere in the script. Never invent one, never guess from the business name, and never
substitute a vague phrase like "our town" or "your area". Sell the business on what it does.`}

${festivalTurn ? `===== CLIP 1 IS THE WISH. THE HOOK IS CLIP ${hookClip}'S JOB =====

Clip 1 opens with the ${occasionBare} greeting, and that is the ONE place in this script where a
greeting belongs. Write it as ${solo ? `${first.name} speaking warmly to the viewer` : "one friend turning to the other about the day"}, never as a
formal announcement and never as a narrator reading out a message. It must sound like a person
wishing you, and the business's name must be in it as the one sending the wish.

The clip that has to STOP a scroller is clip ${hookClip}, because that is where this stops being a
greeting and becomes an advertisement.

` : ""}===== THE HOOK: ${festivalTurn ? `CLIP ${hookClip} DECIDES WHETHER ANYONE WATCHES THE REST` : "THE FIRST LINE DECIDES WHETHER ANYONE WATCHES THE REST"} =====

An ad is ${festivalTurn ? "skipped the moment the wish ends" : "skipped in the first two seconds"} or not at all, so ${first.name}'s ${festivalTurn ? `clip ${hookClip}` : "opening"} line has ONE
job: make a person stop. It must PROVOKE, never explain. Pick whichever of these fits the business
and ${festivalTurn ? "turn the ad with it" : "open with it"}:

• SURPRISE — ${solo ? "they react" : "he reacts"} to something striking in front of him. "Look at the size of that shelf!"
• CURIOSITY GAP — something unexplained that demands an answer. "Why is there a queue outside?"
• THE CUSTOMER'S OWN PROBLEM — the exact pain that brings people to this business. "My phone died again!"
• DISBELIEF — he challenges a claim as too good to be true. "At that price? I don't believe it."

It must sound like ${first.name}: loud, excited, saying what everyone else is thinking.
And it must be about THIS business — a hook that would suit any shop is not a hook.

NEVER ${festivalTurn ? `write clip ${hookClip}` : "open"} with any of these. They are why an ad gets skipped:
✗ A greeting — "Hello friends", "Namaste", "Hi everyone"${festivalTurn ? ` (clip 1's ${occasionBare} wish is the sole exception, and it is not repeated here)` : ""}
✗ An announcement — "Today we will tell you about…", "Let me introduce…"
✗ A welcome — "Welcome to…", "Come to…"
✗ Anything a narrator would say. These two are TALKING TO EACH OTHER, never to a camera.

===== EVERY LINE MUST BE COMPLETE, AND THE AD MUST FINISH =====

The scripts that fail do so in the same two ways — half-sentences, and an ending that just stops.

1. Each line is ONE complete sentence that makes full sense on its own. Never let a sentence run
   from one character into the other's line, or from one clip into the next. If a thought does not
   fit the word budget, write a SHORTER thought — never half of a longer one.
2. Every line must say something. A line that carries no fact, no reaction and no reason to buy is
   wasted airtime, even when it is grammatically fine.${isFestival ? ` Clip 1 is the exception: its
   job is the ${occasionBare} wish, and a wish is not a wasted line.` : ""}
3. The final clip must FINISH the ad. It has to feel ended, not interrupted — the last thing heard
   is a clear instruction to act.
4. Test the whole script by itself: someone who hears only this, once, with no picture, must come
   away knowing WHO the business is, WHAT it sells, WHY it is better, and WHAT to do next. If any
   of those four is missing, the script has failed and you must rewrite it.

===== A WORKED EXAMPLE — COPY THE SHAPE, NOT THE WORDS =====

This is shown in English so the STRUCTURE is unmistakable. Write yours in ${lang}, about the real
business you were given. Word counts are marked to show how a complete thought fits the budget.

${isFestival ? (solo ? `clip-1 (the WISH — the business sends it, and nothing at all is sold)
  ${first.name}: "${first.name} here, wishing you and your whole family a very happy ${exampleOccasion} from all of us at Sharma Electronics."  (19 words)

clip-2 (the TURN — the festival is over; the hook, then the business${place ? " and its town are" : " is"} named)
  ${first.name}: ${place
    ? `"Why is there a queue outside this shop? That is Sharma Electronics here in ${place} — everyone buys here."  (18 words)`
    : `"Why is there a queue outside this shop? That is Sharma Electronics — the whole town buys here."  (18 words)`}

clip-3 (proof — a real, specific offering)
  ${first.name}: "They keep every single brand and every model of washing machine here, and home delivery is completely free."  (18 words)

clip-4 (close — it ends, and it tells you what to do)
  ${first.name}: "Come to Sharma Electronics today and see every one of these machines for yourself before the week ends."  (18 words)` : `clip-1 (the WISH — the business sends it, and nothing at all is sold)
  ${first.name}:  "${second.name}, look at all these lights outside every shop!"   (9 words)
  ${second.name}: "Happy ${exampleOccasion} from Sharma Electronics to you and your family, ${first.name}!"   (11 words)

clip-2 (the TURN — the festival is over; the hook, then the business${place ? " and its town are" : " is"} named)
  ${first.name}:  "Why is there such a long queue outside that shop?"          (10 words)
  ${second.name}: ${place
    ? `"That is Sharma Electronics here in ${place} — everyone buys there."   (10 words)`
    : `"That is Sharma Electronics — the whole town buys there."   (9 words)`}

clip-3 (proof — a real, specific offering)
  ${first.name}:  "But do they keep the latest washing machines too?"         (9 words)
  ${second.name}: "Every brand, every model, and free home delivery included."  (9 words)

clip-4 (close — it ends, and it tells you what to do)
  ${first.name}:  "Then what are we waiting for, let us go!"                   (9 words)
  ${second.name}: "Visit Sharma Electronics today and see everything for yourself."   (9 words)`) : solo ? `clip-1 (the hook — curiosity gap, then the business and its town are named)
  ${first.name}: ${place
    ? `"Why is there a queue outside this shop? That is Sharma Electronics here in ${place} — everyone buys here."  (19 words)`
    : `"Why is there a queue outside this shop? That is Sharma Electronics — the whole town buys here."  (18 words)`}

clip-2 (proof — a real, specific offering)
  ${first.name}: "They keep every brand and every model of washing machine, with free home delivery included."  (18 words)

clip-3 (proof — a DIFFERENT one, never a repeat)
  ${first.name}: "Repairs would cost a fortune elsewhere, but here one full year of service is free."  (18 words)

clip-4 (close — it ends, and it tells you what to do)
  ${first.name}: "Visit Sharma Electronics today and see the festival offers for yourself before they finish."  (18 words)`
  : `clip-1 (the hook — curiosity gap, then the business and its town are named)
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
  ${second.name}: "Visit Sharma Electronics today and see the festival offers yourself." (10 words)`}

${isFestival
  ? `Notice: clip 1 sells nothing and only wishes, ${occasion} is never spoken of again after it,
clip 2 provokes and names the business${place ? " and its town" : ""}, every line is a whole sentence, and the last
line tells the viewer exactly what to do.`
  : `Notice: the first line provokes, the business${place ? " and its town are" : " is"} named immediately, every line is a
whole sentence, each clip adds something new, and the last line tells the viewer exactly what to do.`}

GROUND EVERY SINGLE LINE IN THE DATA YOU WERE GIVEN:
1. Say the business's REAL NAME out loud in the ad, early — a viewer must know who this is.${isFestival ? ` In a
   ${occasionBare} ad that first mention is clip 1, as the business sending the wish.` : ""}${place
  ? `\n1b. Say "${place}" out loud in clip ${hookClip} alongside that name — a viewer must know where this is.`
  : ""}
2. Use its REAL services, products, specialities, and selling points, exactly as provided.
3. THE GENERIC TEST — apply it to every line you write: if the line would fit any other business
   in any other industry, it is WRONG. Delete it and write one that only this business could say.
4. Never talk about advertising, videos, promotion or marketing unless that IS this client's
   business. The client sells what the business information says they sell — nothing else.
5. If the data is thin, lean harder on the few real details you do have. Never pad with invention.

===== CORE OUTPUT CONTRACT =====

1. Output EXACTLY ${segmentCount} clips. Each clip has EXACTLY ${pack.characters.length} line${solo ? "" : "s"}${solo ? ` — ${first.name}'s` : ` — one for ${first.name},`}
   ${solo ? "" : `then one for ${second.name}. ${first.name} ALWAYS speaks first.`}
2. Output format must be EXACTLY this, with no headings, notes, or explanation:

${contract}

3. WORD BUDGET (this is a timing rule, not a style preference): each clip is
   ${CLIP_SECONDS} seconds${solo ? "" : " shared by two speakers with a short hand-off pause between them"}.
   Each clip must total between ${budget.minClip} and ${budget.maxClip} spoken words${solo ? "" : " across both characters"} — never fewer, never more.
   ${solo
     ? `That single line therefore carries the whole clip: ${budget.minLine}-${budget.maxLine} words.`
     : `Each character's single line must be between ${budget.minLine} and ${budget.maxLine} words.`}
   Count every clip carefully before you output it.
4. Each line is ONE complete spoken sentence ending in . ! or ?
5. Do NOT output a FULL SCRIPT section. Do NOT repeat the same line twice anywhere.

===== LANGUAGE RULES (${lang.toUpperCase()}) =====

${isLatin
  ? `1. Spoken content must be clean, natural, conversational English as spoken in a premium Indian TV cartoon ad.
2. Keep brand names exactly as written.
3. Never stiff, bookish, or corporate. These are cartoon characters talking, not a brochure.`
  : `1. Spoken content must be 100% correct, native, pixel-perfect ${lang} script. No Latin letters in spoken content (English-origin words are allowed only when written in ${lang} script).
2. Brand names must be transliterated into ${lang} script naturally.
3. Use the words people in the town actually say — everyday ${lang}, or the English word everyone already uses, written in ${lang} script — never a heavy literary ${lang} translation. Write how a popular ${lang} cartoon actually speaks: the way kids and grandparents both talk.
4. Never archaic, devotional, bookish, or government-style ${lang}.`}
${solo ? `5. ${first.name} speaks in their own register throughout — see the performance direction above.` : `5. ${first.name} speaks in short, excited, simple words. ${second.name} speaks in calm, clear,
   informative words. Their two voices must sound DIFFERENT on the page.
${spellings.length > 0
  ? `6. NAME SPELLING (EXACT — NO ALTERNATIVES). When a character's name is spoken inside a line, it must be written EXACTLY as:
${spellings.map((s) => `     ${s.name} → ${s.spelling}`).join("\n")}
   Never any other spelling of these names, and never in Latin letters. If a name is not spoken in a line, do not add it.`
  : ""}
`}

${everydaySpeechRules(lang)}

===== CONTENT TRUTH RULES =====

1. Use ONLY facts present in the business information provided.
2. Do NOT invent addresses, prices, offers, claims, years, or services.
3. If a detail is missing, skip it cleanly. Never fabricate.
4. The ad must still SELL — every clip should carry one real reason to choose this business.${isFestival ? `
5. Clip 1 is exempt from rule 4 and from it alone: it carries the ${occasionBare} wish and no reason to
   buy. Rule 4 applies to clip 2 onward.
6. The ${occasionBare} wish states no claim about the business beyond its name. Never wish on behalf of
   a business the information does not name.` : ""}

===== NUMBER AND CTA RULES =====

1. Never use digits in spoken content.
2. NEVER speak a phone number or contact number — it is shown on screen, not spoken.
3. Only the FINAL clip carries the call to action, and ${solo ? first.name : second.name} delivers it.
4. Do not leak CTA or "visit us / call us" language into earlier clips.

===== TONE =====

${isFestival
  ? `This is a FESTIVAL greeting ad for ${occasion}. Clip 1 is warm, celebratory and affectionate — a
real wish from the business to the viewer.${festivalTurn ? ` From clip ${hookClip} the tone becomes friendly and persuasive
like any other ad, and the celebration is not carried into it.` : ` The ad is one clip long, so that
warmth carries the closing invitation too.`}`
  : "This is a COMMERCIAL ad — friendly, funny, and clearly persuasive. The humour must never bury the sell."}
${isFestival ? `
===== CHECK CLIP 1 BEFORE YOU OUTPUT =====

Read your clip 1 back and answer each of these. A "no" anywhere means rewrite clip 1 and check again.

• Is it a ${occasionBare} wish to the viewer and their family, sent by the business by name?
• Is it free of every product, service, speciality, offer, price and reason to buy?
${festivalTurn ? `• Is it free of any call to action — no "visit", no "call", no "come to"?` : `• Does it end with the short invitation this one-clip ad has nowhere else to put?`}${place && festivalTurn ? `
• Is it free of the town "${place}", which belongs in clip ${hookClip}?` : ""}${festivalTurn ? `
• Does the ad then TURN at clip ${hookClip}, and is ${occasion} absent from every clip after clip 1?` : ""}
` : ""}
Write the ${segmentCount} clips now, in the exact format above and nothing else.`;
};

/**
 * Refine pass — the member has asked for ONE change to a script that already exists.
 *
 * Deliberately not the generator prompt above. Handing a refine the full CHARACTER_VOICEOVER prompt
 * looked right — it is the prompt that knows the two-hander contract — but it ends with "Write the
 * N clips now", and a model given a script plus an instruction to write a script writes a new one.
 * The member's edit came back as a wholly rewritten ad, and when the rewrite drifted out of the
 * two-speaker shape the result read as an ordinary single-voice promotional script: the exact
 * failure the pack exists to avoid.
 *
 * So this states the contract as something to PRESERVE and the task as an edit. Everything the
 * generator says about hooks, beats and word budgets is deliberately absent — none of it is being
 * decided here, and repeating it is what invites a rewrite.
 */
export const CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT = (
  pack: CharacterPack,
  segmentCount: number,
  language: string = "Telugu",
): string => {
  const lang = (language || "Telugu").trim() || "Telugu";
  const [first] = pack.characters;
  /**
   * The second speaker, or the first again when there is only one.
   *
   * Twenty-three of the thirty-two catalogue entries have a single speaker — a deity, one
   * cartoon, the client’s own face — and on those `pack.characters[1]` is undefined. Every
   * prompt builder in this file reads `second.name`, so an unguarded destructure throws
   * “Cannot read properties of undefined (reading ‘name’)” before a single prompt is built,
   * which stops the member’s job dead with no way past it.
   */
  const second = pack.characters[1] ?? first;
  /** True when this ad has one voice in it. Prose that describes a two-hander is branched on it. */
  const solo = pack.characters.length === 1;
  const spellings = packNameSpellings(pack, lang);

  return `You are a precise script EDITOR working on an existing ${lang} cartoon ad script for
${pack.label}. You are NOT writing a new script. You will be given a finished script and one
requested change, and you return the SAME script with ONLY that change applied.

===== WHAT YOU ARE LOOKING AT =====

This is a TWO-CHARACTER script. ${first.name} and ${second.name} are talking to each other. It is
not a voice-over, not a narration, and not a single presenter reading an advertisement.

Every clip is an exchange of exactly two lines:
  ${first.name} speaks first. ${second.name} answers him.

===== THE SHAPE YOU MUST RETURN (NON-NEGOTIABLE) =====

• EXACTLY ${segmentCount} clips — never add one, never drop one, never merge two.
• EXACTLY 2 lines in every clip, ${first.name} first and ${second.name} second, each labelled.
• NEVER collapse the two into one voice. NEVER remove a character. NEVER reorder them.
• NEVER convert this into a narrator's voice-over or a single-presenter script.
• Keep the same clip timings, the same ${lang}, and the same business facts.
• Output format exactly: \`<start>-<end>|${first.key}: <line>\` then \`<start>-<end>|${second.key}: <line>\`${spellings.length > 0
  ? `\n• A spoken character name is written EXACTLY as: ${spellings.map((s) => `${s.name} → ${s.spelling}`).join(", ")}`
  : ""}

===== HOW TO EDIT =====

Make the SMALLEST change that fully satisfies the request. Every line the request does not touch
comes back word for word as it was — same wording, same order, same punctuation. Do not "improve",
re-polish, re-translate, shorten or restructure anything you were not asked about.

If the requested change affects only one line, change only that line. If it affects the whole
script (a tone, a fact, a name), apply it line by line and leave everything else intact.

Return ONLY the edited clip lines. No preamble, no explanation, no headings.`;
};

/**
 * Repair pass — same contract, aimed at the specific faults found.
 *
 * `adType` and `festivalName` are appended rather than placed beside the writer's copies of them,
 * so the existing positional call sites keep working. They matter because this prompt restates the
 * structure: it used to demand a provoking hook in clip 1 unconditionally, which put back the very
 * commercial opening a festival ad had just been written to avoid — a single failed word count was
 * enough to lose the wishes.
 */
export const CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT = (
  pack: CharacterPack,
  duration: number,
  segmentCount: number,
  language: string = "Telugu",
  placeName: string = "",
  adType: string = "commercial",
  festivalName: string = "",
): string => {
  const isFestival = adType === "festival";
  const occasion = (festivalName || "").trim() || "the festival";
  /** Without its article, for the places that already supply one. See the writer's copy. */
  const occasionBare = (festivalName || "").trim() || "festival";
  /** Clip 1 is the wish, so hook and town move to clip 2 — unless the ad is a single clip. */
  const hookClip = isFestival && segmentCount > 1 ? 2 : 1;
  /** True only when the ad is long enough to actually have a turn. See the writer's copy. */
  const festivalTurn = isFestival && hookClip > 1;
  const [first] = pack.characters;
  /**
   * The second speaker, or the first again when there is only one.
   *
   * Twenty-three of the thirty-two catalogue entries have a single speaker — a deity, one
   * cartoon, the client’s own face — and on those `pack.characters[1]` is undefined. Every
   * prompt builder in this file reads `second.name`, so an unguarded destructure throws
   * “Cannot read properties of undefined (reading ‘name’)” before a single prompt is built,
   * which stops the member’s job dead with no way past it.
   */
  const second = pack.characters[1] ?? first;
  /** True when this ad has one voice in it. Prose that describes a two-hander is branched on it. */
  const solo = pack.characters.length === 1;
  /** Same cast-derived budget as the writer — otherwise the repair re-imposes the impossible pair. */
  const repairBudget = wordBudgetFor(pack.characters.length);
  const spellings = packNameSpellings(pack, language);
  const place = (placeName || "").trim();
  return `You repair ${language} cartoon two-character ad scripts. You will be given a script and a
list of validation problems. Fix ONLY those problems and return the corrected script.

NON-NEGOTIABLE CONTRACT:
• EXACTLY ${segmentCount} clips, each with EXACTLY 2 lines
• ${first.name} speaks first in every clip, ${second.name} answers
• ${repairBudget.minClip}-${repairBudget.maxClip} spoken words per clip; ${solo ? `that single line carries the clip: ${repairBudget.minLine}-${repairBudget.maxLine} words` : `each line ${repairBudget.minLine}-${repairBudget.maxLine} words`}
• Each line is one complete sentence ending in . ! or ?
• Output format exactly: \`<start>-<end>|${first.key}: <line>\` then \`<start>-<end>|${second.key}: <line>\`
• Keep the original meaning and the business facts — change only what is broken
• NEVER fix a word count by cutting a sentence in half. Shorten the THOUGHT instead: every line must still be one complete sentence that makes sense on its own
${isFestival
  ? `• Clip 1 must still be the ${occasionBare} WISH — the business wishing the viewer and their family, naming itself as the sender. Never turn clip 1 into a hook, a question about the shop, or a welcome${festivalTurn
    ? `, and keep every product, service, offer, price, reason to buy and call to action out of it
• Clip ${hookClip} must still be the TURN: the first line provokes — a surprise, an unanswered question, the customer's own problem, or disbelief — and the ad sells from there on
• ${occasion} is spoken ONLY in clip 1. If a later clip mentions it, remove it there`
    : `. This ad is one clip long, so that wish also carries the short closing invitation and nothing else is sold`}`
  : `• Clip 1's first line must still be a hook that provokes — a surprise, an unanswered question, the customer's own problem, or disbelief. Never a greeting, a welcome, or an announcement`}
• The final clip must still FINISH the ad with a clear instruction to act — it must feel ended, not interrupted
• Across ALL ${segmentCount} clips together, "${first.name}" is spoken exactly once and "${second.name}" exactly once — both in clip 1 where they greet each other, and never again anywhere${place
  ? `\n• The town "${place}" is spoken exactly ONCE, in clip ${hookClip}, in ${second.name}'s line, next to the business's name — written in ${language}. If it is missing, put it back; if it appears in any other clip, remove it there. Never a street, district, state or pincode`
  : `\n• No town, village, street or address is spoken anywhere — none was provided, so none may be invented`}
• Total duration is ${duration} seconds; never add or remove clips${spellings.length > 0
  ? `\n• A spoken character name is written EXACTLY as: ${spellings.map((s) => `${s.name} → ${s.spelling}`).join(", ")}`
  : ""}
• When a problem names a hard word, swap it for the everyday word it gives

${everydaySpeechRules(language)}

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
  /**
   * The ordered outfit for a human-model entry (see `wardrobeDirective`). Ignored for deities and
   * cartoons, who come dressed.
   */
  wardrobe?: string;
  /** The camera move each clip's video will be animated with, so each still is composed for it. */
  motionPlan?: ClipMotionPlan[];
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
    zone: "just inside the entrance, on the shop floor — the first thing a customer sees after stepping in (indoors, never the street outside)",
    camera: "wide enough to establish the place, the cast full-figure, the business clearly readable behind them",
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
    zone: "back at the main counter or the most inviting spot inside the premises — full circle, still indoors",
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
  /** Who is on screen — the continuation line used to hard-code one pair for all 32 entries. */
  cast: string,
  /** True when only one character is in the ad — see the note in the frame builder. */
  solo: boolean,
  /** The move each clip's video will be animated with — see prompts/motion. */
  motionPlan: ClipMotionPlan[] = [],
): string {
  return shots.map((shot, i) => {
    const n = i + 1;
    const line = clipSummaries[i] ? `\n   🗣️ THIS CLIP'S LINE: ${clipSummaries[i]}` : "";
    const motion = motionPlan[i] ? `\n   ${framingForMotion(motionPlan[i])}` : "";
    const composition = motionPlan[i] ? compositionFor(motionPlan[i]) : "";
    const head = `**CLIP ${n} — ${shot.name}**
   📍 ZONE: ${shot.zone}
   🎥 CAMERA: ${shot.camera}
   🎭 STAGING: ${shot.staging}
   🎯 PURPOSE: ${shot.purpose}${line}${motion}`;

    if (n === 1) {
      return `${head}

   Write a COMPLETE standalone prompt for this frame, about 90–120 words, as one flowing paragraph.
   Open by naming the photograph or generated zone this clip uses, then ${solo ? cast : `the two characters`} by name
   only, then the real fixtures and stock actually visible around them, then the light in that
   space, then the ${aspectRatio} ${orientation} framing.${hasLogo ? " Place the attached logo where it would really be installed in this zone." : ""}${motionPlan[i] ? `
   Compose it as the first moment of this clip's walk: ${composition}.` : ""}
   This frame sets the look for the whole ad — the grade, the light and the finish that every later
   clip has to match.`;
    }

    return `${head}

   ⚠️ CONTINUATION FRAME — clip 1's frame is attached as the reference. Do NOT re-describe the
   characters, the style, the grade or the business identity: they are LOCKED by that reference.
   Write ONE line referring to it — "the same ${cast} exactly as in the attached reference
   frame, unchanged" — and then spend the rest of the prompt ONLY on what genuinely changes:
   the new zone and the real objects in it, the new staging and gestures, the new camera angle,
   and how the light differs in this part of the premises.${motionPlan[i] ? `
   Include, in plain words, the first moment of this clip's walk: ${composition}.` : ""}
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
    aspectRatio, adType, festivalName, hasLogo = false, businessContext = "", wardrobe, motionPlan = [],
  } = input;
  const clipContext = clipSummaries.map((s, i) => `  Clip ${i + 1}: ${s}`).join("\n");
  const orientation = aspectRatio === "16:9" ? "horizontal (landscape)" : "vertical (portrait)";
  /** Who is on screen, for the continuation line. Named from the cast, never hard-coded. */
  const cast = pack.characters.map((c) => c.name).join(" and ");
  /**
   * How many figures belong in the frame.
   *
   * This prompt was written for a two-hander, and its lines ORDER a second person into the shot:
   * “showing BOTH characters together”, “stage the two characters”, “the classic two-hander”. On a
   * single-character entry that is an instruction, and the generator obeys it — a Real Owner Face
   * ad came back with the client’s real photographed face standing beside an invented cartoon man,
   * and a Ganesha ad was told to frame “a second, unstated character”. Nothing in the negatives
   * can undo a positive instruction to include somebody.
   */
  const solo = pack.characters.length === 1;
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

  // The shared real-premises formula (prompts/realLocation) — the same block the human-model frame
  // prompt reads, told who it is placing so a lone deity is never lit as "the two characters".
  const locationBlock = locationMode === "real_provided"
    ? realLocationFormula(packLocationSubject(pack), locationPlan)
    : `===== LOCATION: GENERATED FROM THE BUSINESS PROFILE =====

No client photographs were provided, so build a believable, photoreal location for this exact kind
of business from the profile below. It must look like a real operating Indian business — real
stock, real fixtures, real wear — never a showroom render or an empty studio set.

${locationPlan}`;

  return `You are a world-class advertising art director who stages ${packStagingRole(pack)} inside REAL
photographed business locations for television commercials.

YOUR TASK: Write ${segmentCount} image-generation prompts — one per ${CLIP_SECONDS}-second
clip — each showing ${solo ? `${cast} alone` : "BOTH characters together"} inside this business.

===== AD CONFIGURATION (WHAT WAS ORDERED) =====

• Aspect ratio: ${aspectRatio} ${orientation} — compose and frame EVERY clip for this canvas.
• Clips: ${segmentCount}, ${CLIP_SECONDS} seconds each.
• Ad type: ${adType === "festival" ? `festival greeting for ${festivalName || "the festival"} — layer the festival cues naturally over the real premises, never replace them` : "commercial — the business and what it sells must be unmistakable"}.

Every prompt must state the ${aspectRatio} ${orientation} framing explicitly, and stage
${solo ? `${cast}` : "the two characters"} and the business zone to fill that shape properly — no composition borrowed from a
different aspect ratio.

${characterCastBlock(pack, wardrobe)}

${characterDirectionBlock(pack, "frame")}${motionPlan.length ? `

Every clip's video WALKS: ${solo ? cast : "the characters"} walk${solo ? "s" : ""} through the business while talking, with a
moving camera. Where the direction above asks for a planted stance, a held or locked-off frame, or no
movement, this ad's walk wins — each frame is the first moment of its clip's walk (see each clip's 🎬
note), with the body caught in motion. Everything else in that direction still applies.` : ""}

${locationBlock}

${logoBlock}

===== WHAT EACH CLIP'S DIALOGUE IS ABOUT =====

${clipContext}

===== THE ONE RULE THAT MATTERS MOST: ONE CONTINUOUS WALK THROUGH THE BUSINESS =====

Every clip is set INSIDE the business — indoors, among its real fixtures. Never the street, the
footpath, the car park or the outside of the building, and never a shot looking in from outside.

All ${segmentCount} clips are ONE walk through that one space, cut into pieces. Each clip shows the part
of the business the characters are TALKING about in that clip — shelves for the product range, the
counter for service, the display for what is new — and the background must prove the line. But each
part must ADJOIN the last: clip N+1 picks up a few steps further along the same path.

CONTINUITY (WHAT MAKES THE VIDEO FLOW — MANDATORY):
• Clip N+1 starts where clip N ended, in the same room or the area directly next to it.
• At least one real thing from the previous clip's frame — the counter, a shelf run, a doorway, a
  pillar, the logo — is still visible in the next clip's frame, even if only at the edge.
• The light, the colour grade, the floor and the wall finish are IDENTICAL in every clip.
• Never a jump to an unrelated zone, another floor, another branch or another building. If a viewer
  would ask "where are we now?", the frame is WRONG.
• What changes between clips is the angle and how much of the space is in view — never the place.
Never repeat the same framing twice, and never pick a zone at random.

===== ${solo ? `STAGING ${cast.toUpperCase()}` : "STAGING BOTH CHARACTERS"} =====

${solo
  ? `• ${cast} is the ONLY character in the frame. Nobody else appears — no second figure, no
  companion, no staff member, no passer-by, no cartoon, no crowd. If anyone else is visible, the
  frame is WRONG.
• Stage them open to camera, addressing the viewer directly rather than anyone in the room.
• They must be the focus, but the business must be unmistakable behind them.`
  : `• BOTH characters visible in every frame, clearly separated, neither hidden or cropped.
• Stage them mid-conversation, angled slightly towards each other but open to camera — the classic
  two-hander. The one who is speaking is the more animated of the two.
• They must be the focus, but the business must be unmistakable behind them.
• Say nothing about their build, size or how tall either one is. They are the real characters —
  their proportions come with them. Writing it down only invites the generator to redraw them.`}

===== THE SHOT PLAN — WRITE THESE ${segmentCount} PROMPTS =====

${clipShotPlan(segmentCount, clipSummaries, shots, hasLogo, aspectRatio, orientation, cast, solo, motionPlan)}

===== OUTPUT FORMAT =====

Write ${segmentCount} prompts separated by ###CLIP### on its own line, in clip order, nothing else.
Each prompt is plain flowing English — no headings, no numbering, no bullet lists, no commentary,
and no negative list. Follow the per-clip word budgets above. Never describe what the characters
look like${hasLogo ? ", and never describe the attached logo" : ""} — naming them is enough.

${/*
  No performance direction here, deliberately.

  This prompt ANIMATES AN ATTACHED FRAME, and its own most important rule three lines down is
  “NEVER describe the location, characters, lighting or composition — the attached frame IS all of
  that”. Pouring in expression, gaze, gesture and camera paragraphs contradicts that instruction
  directly, and it pushed the prompt past the length budget the standard ad holds itself to — a
  budget that exists because a bloated Veo prompt degrades the motion it is asking for.

  The direction still reaches the video: it shaped the frame this animates and the script it
  speaks. See characterDirectionBlock for which scope goes where.
*/''}
${characterNegativesBlock(pack)}

${businessContext ? `===== BUSINESS CONTEXT =====\n${businessContext}` : ""}`;
};

// ── 3 · Veo: the talking two-hander ───────────────────────────────────────────────────────────

/**
 * The system prompt for the Veo direction call on a special-category ad — see prompts/motion.
 *
 * It used to be the whole Veo prompt, and it ended every clip with "Camera holds steady, single
 * continuous shot". Every character in the catalogue carries its own camera, gesture, gaze and body
 * direction written for video, and this prompt never passed any of it on — so a Motu and Patlu ad
 * and a Lord Shiva ad came out equally frozen. The direction call now receives that performance
 * direction, each clip's frame and planned move, and writes a moving, performed shot; the finished
 * prompt, with the exact dialogue and voices, is assembled in code (packVeoSubject + assembleVeoPrompt).
 */
export const CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT = (
  pack: CharacterPack,
  segmentCount: number,
  aspectRatio: "9:16" | "16:9" = "9:16",
): string => {
  const cast = pack.characters.map((c) => c.name).join(" and ");
  return VEO_DIRECTION_SYSTEM_PROMPT({
    clipCount: segmentCount,
    aspectRatio,
    subject: cast,
    characterDirection: characterDirectionBlock(pack, "video"),
    performer: packPerformer(pack),
  });
};

/** How a pack's cast performs a walk: a deity blesses, a cartoon walks its own way, a person naturally. */
export const packPerformer = (pack: CharacterPack | null | undefined): Performer => {
  if (!pack) return "person";
  if (pack.family === "god") return "deity";
  if (pack.family === "duo" || pack.family === "solo") return "cartoon";
  return "person";
};

/**
 * Who speaks in a special-category clip, how they sound, and what the video must never change.
 *
 * A cartoon is voiced in its own voice from the show; a deity or a person in the voice the catalogue
 * gives them. In a two-hander the first speaker has the first half of the clip and the second the
 * rest, and only the one speaking moves their mouth.
 */
export const packVeoSubject = (pack: CharacterPack) => {
  const solo = pack.characters.length === 1;
  const cartoon = pack.family === "duo" || pack.family === "solo";
  const person = pack.family === "human";
  const identityLock = person
    ? "the person's face (100% face match), their hair, their outfit, the logo and the location"
    : solo
      ? "the character exactly as drawn, the logo and the location"
      : "both characters exactly as drawn, the logo and the location";
  const voiceOf = (name: string, voice: string) => cartoon
    ? `the original ${name} voice from the show (${voice})`
    : voice;
  const speech = (lines: { name: string; text: string }[]) => lines.map((line, i) => {
    const character = pack.characters.find((c) => c.name === line.name) ?? pack.characters[i] ?? pack.characters[0];
    return {
      speaker: solo ? undefined : character.name,
      voice: voiceOf(character.name, character.voice),
      line: line.text,
      at: solo ? undefined : lines.length === 2 ? (i === 0 ? "0–4s" : "4–8s") : undefined,
    };
  });
  const performanceNotes = [
    solo ? "" : "Only the speaking character's mouth moves; the other listens and reacts in their own way.",
    cartoon ? "Voices are strict: only the original voices from the show — never a narrator, a new voice actor or a different accent." : "",
  ].filter(Boolean).join("\n");
  /** Who the movement rules address — "Both characters", "Ganesha", "The business owner". */
  const cast = solo
    ? person ? `The ${pack.characters[0].name.toLowerCase()}` : pack.characters[0].name
    : "Both characters";
  const performer = packPerformer(pack);
  /** A custom character is nobody's show — it walks its own way, not "the way the audience knows". */
  const walkManner = pack.family === "custom" ? "in the character's own natural way" : WALK_MANNER[performer];
  return {
    identityLock, speech, performanceNotes, cast, castPlural: !solo, twoHander: !solo,
    performer, walkManner, handGestures: HAND_GESTURES[performer],
  };
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
