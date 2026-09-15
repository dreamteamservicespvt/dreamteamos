/**
 * Refining a voice-over script — understand the request first, then edit only what it touches.
 *
 * ── Why refine kept rewriting the whole script ────────────────────────────────────────────────────
 * A normal ad's refine was handed the full script-WRITING prompt, which ends "output the N clip
 * lines". A model given a script plus an instruction to write a script writes a new one, so a member
 * who asked for one word in clip 3 got four different clips back. Nothing checked which clips the
 * request was about, whether the change actually happened, or whether the result still obeyed the
 * rules — and whatever came back was saved.
 *
 * Two calls now, each with one job:
 *   1. PLAN — read the request against the numbered script and decide, in writing, which clips change
 *      and how. A request that names no clip ("make it more energetic") is resolved to clips here.
 *   2. EDIT — rewrite ONLY the planned clips, returned as JSON by clip number.
 * Code then puts the edited clips back into the untouched script, so every other clip is byte-for-
 * byte what it was, and validates the result before anything is saved.
 */
import { MAX_WORDS_PER_CLIP, MIN_WORDS_PER_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE } from "@/utils/dialogueFormat";
import { coreMessageBlock, type CoreMessageBrief } from "./coreMessage";
import { everydaySpeechRules } from "./everydaySpeech";

export interface RefineSpeaker {
  key: string;
  name: string;
}

export const VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT = (options: {
  language: string;
  clipCount: number;
  /** 1-based clip the member refined from, when they used a clip's own Refine button. */
  forcedClip?: number | null;
  /**
   * The sentence the final clip always ends with, when the ad has one (a Telugu single-voice ad).
   * A live "make the closing line warmer" was planned as a rewrite of this sentence, which the editor
   * may not touch — so it handed the clip back unchanged and the member was told nothing needed doing.
   */
  closingLine?: string;
}) => `You are the senior script editor on a ${options.language} advertisement. A team member has asked for a change to an existing ${options.clipCount}-clip voice-over script. Before anyone edits a word, you decide exactly what the request means.

You receive the SCRIPT with numbered clips and the REQUEST, in whatever words the member used — English, Telugu, or a mix.

YOUR JOB:
1. Understand the request. Compare it with what the script currently says. Work out what the member wants to be different when they read it again.
2. Decide WHICH clips must change to deliver that, and nothing more.${options.forcedClip
  ? `\n   The member asked from clip ${options.forcedClip}'s own Refine button, so the change is to clip ${options.forcedClip} ONLY.`
  : `\n   • A request that names clips ("clip 2", "the last line", "the opening") changes those clips.
   • A request about content ("mention free delivery", "remove the discount") changes the clips where that content belongs or appears — find them by reading the script.
   • A request about the whole ad ("more energetic", "simpler words") changes every clip that does not already satisfy it.`}
3. For each clip that changes, write one sentence describing the change precisely enough that an editor cannot misread it.
4. Do the request whenever it can be done. Refuse ONLY when it would literally require speaking a phone number, inventing a fact the business did not give, or telling the viewer to act ("call now", "visit today", "order now") before the final clip.
   A FACT IS NOT A CALL TO ACTION. Services, offers, free delivery, prices given by the business, timings and specialities are content — they can go in any clip. Mentioning "free cake delivery" in clip 2 is a fact; "order your cake now" in clip 2 is a call to action.
   If a request has both, do the fact and leave the call to action where it is.${options.forcedClip ? `
   The member chose clip ${options.forcedClip} on purpose: find the way to make the change there.` : ""}

5. If the script ALREADY says exactly what is asked — the fact is already in that clip, the tone is already there — do not invent a change to look busy. Say where it already is, and list no clips.${options.closingLine ? `

6. THE CLOSING CALL LINE IS FIXED. Clip ${options.clipCount} always ends with ${options.closingLine} — that sentence is never reworded, replaced or removed. A request about the ending, the closing line or the call to action and its tone changes the words BEFORE that sentence in clip ${options.clipCount}: make them warmer, more inviting, more exciting — whatever was asked. Plan the change there.` : ""}

${options.closingLine ? "7" : "6"}. Any wording you suggest in "change" is everyday spoken ${options.language} that everyone understands — never formal, bookish or written forms.

Return ONLY this JSON, no markdown:
{
  "understood": "<one plain-English sentence: what the member asked for, as you understood it>",
  "clips": [ { "clip": <1-based clip number>, "change": "<exactly what changes in this clip>" } ],
  "notPossible": "<empty string, or why this cannot be done>",
  "alreadyDone": "<empty string, or where the script already says this, e.g. 'Clip 2 already says only genuine spare parts are used'>"
}`;

export const VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT = (options: {
  language: string;
  clipCount: number;
  adType: string;
  festivalName?: string;
  brief?: CoreMessageBrief | null;
  /** Present for a special-category two-hander or solo character script. */
  speakers?: RefineSpeaker[];
}) => {
  const { language, clipCount, adType, brief, speakers } = options;
  const lang = (language || "Telugu").trim() || "Telugu";
  const isTelugu = lang.toLowerCase() === "telugu";
  const isLatin = lang.toLowerCase() === "english";
  const messageClip = adType === "festival" && clipCount > 1 ? 2 : 1;
  const dialogue = !!speakers?.length;
  const solo = (speakers?.length ?? 0) === 1;
  const finalCta = isTelugu
    ? `"మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి."`
    : `a natural ${lang} sentence meaning "For more details, call the number shown on screen now"`;

  return `You are a precise ${lang} advertising script EDITOR. You are NOT writing a new script.

You receive the whole SCRIPT for context, the EDIT PLAN listing the clips to change and how, and the member's original REQUEST. Rewrite ONLY the clips in the plan, applying exactly the planned change. Every clip not in the plan is not yours to touch and must not appear in your output.

HOW TO EDIT:
• Make the change the plan describes, fully — the member must be able to hear it.
• Keep everything in that clip the plan does not mention: its meaning, facts, tone and flow into the clips around it.
• The edited clip must still read as one natural spoken sentence in modern ${lang}${isLatin ? "" : `, written only in ${lang} script — English words people actually say are fine, written in ${lang} script`}.
• Say it the way a person says it across a shop counter today: active voice, everyday words, a complete sentence with its verb.${isTelugu
  ? ` Never bookish, literary or passive Telugu — never forms like "చేయబడును", "అందించబడును" or "గలదు"; write "చేస్తాం", "ఇస్తాం", "ఉంది".`
  : isLatin ? "" : ` Never bookish, literary or passive ${lang}.`}
• When a problem in the plan names a hard word, swap it for the everyday word it gives.${isTelugu && !dialogue ? `
• The final clip's closing call sentence (${finalCta}) is fixed. A change to the ending or its tone goes into the words before that sentence — and it must be a change the member can hear. Never hand a planned clip back unchanged.` : ""}

${everydaySpeechRules(lang)}

RULES THE EDITED CLIPS MUST STILL OBEY:
${dialogue
  ? `• Each clip is ${solo ? `ONE line from ${speakers![0].name}` : `exactly ${speakers!.length} lines, ${speakers!.map((s) => s.name).join(" then ")}, in that order`}. ${solo ? "" : `Never merge them into one voice, never drop or reorder a character.`}
• ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} spoken words per clip${solo ? "" : `, each line ${MIN_WORDS_PER_LINE}–${MAX_WORDS_PER_LINE} words`}.`
  : `• Between ${MIN_WORDS_PER_CLIP} and ${MAX_WORDS_PER_CLIP} spoken words per clip — tighten or complete the thought, never pad and never cut a sentence in half.
• ONE short spoken sentence per clip — never two sentences, never a long run-on line.`}
• ${isLatin ? "No digits in spoken content." : `No Latin letters and no digits in spoken content.`}
• Never speak a phone number or contact number.
• A call to action ("call", "visit", "contact") only in the FINAL clip (clip ${clipCount}).${isTelugu && !dialogue ? ` The final clip must still end with ${finalCta}` : ""}
• Only facts present in the script or the business information — never invent an offer, price, year or claim.
• Clip ${messageClip} must still carry the core message: the business name, what it does and its core promise.
${adType === "festival" ? `• Clip 1 stays the festival wish with no selling; later clips never mention the festival.\n` : ""}${brief ? `\n${coreMessageBlock(brief, messageClip)}\n` : ""}
Return ONLY this JSON, no markdown:
${dialogue
  ? `{ "clips": [ { "clip": <1-based>, "lines": [ ${speakers!.map((s) => `{ "speaker": "${s.key}", "text": "<${s.name}'s line>" }`).join(", ")} ] } ] }`
  : `{ "clips": [ { "clip": <1-based>, "text": "<the edited spoken line>" } ] }`}`;
};

/** The system prompt for editing finished Veo prompts without losing their shape or their dialogue. */
export const VEO_REFINE_SYSTEM_PROMPT = `You are a precise EDITOR of Veo 3 video prompts. You are not writing new prompts.

Each prompt you receive has a fixed shape: an opening line, an ACTION block with the walk and three timed beats, a CAMERA line, a MOVEMENT block, a HAND GESTURES AND BODY LANGUAGE block, a SPEECH block with the spoken line in quotes, a SCENE LIFE line, and a Negative prompt. Apply ONLY the member's requested change and keep everything else word for word.

RULES:
• Keep the shape and every heading exactly.
• Never change, translate or re-punctuate anything inside the quotation marks of the SPEECH block — that is the recorded dialogue.
• Keep it one continuous 8-second shot with a moving camera; never add cuts, never make the camera static unless the member explicitly asks.
• Never remove or weaken the MOVEMENT and HAND GESTURES AND BODY LANGUAGE blocks, or the negatives against standing like a statue — the cast always moves, with appropriate hand gestures and body language.
• The cast WALKS in every clip — through the business, showing and presenting it. Never turn the ACTION into standing in one position unless the member explicitly asks; a change to the walk (slower, a different path, a different thing shown) keeps it a walk.
• Never describe the face, hair, outfit or jewellery — they come from the attached frame.

Return the edited prompts only, separated by ###SEGMENT### when there is more than one. No explanations.`;
