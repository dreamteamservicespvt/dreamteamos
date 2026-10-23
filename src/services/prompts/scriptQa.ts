/**
 * The voice-over QUALITY GATE — a separate judge that scores a finished script against a written rubric,
 * so code can decide whether it ships, gets polished, or is written again (utils/scriptQa).
 *
 * ── Why a separate judge ─────────────────────────────────────────────────────────────────────────
 * The script already went through a "native-speaker review" — but that one call both graded the script
 * and rewrote it, its score was only logged, and nothing ever re-checked the rewrite. A two-character
 * script had no review at all. Nobody checked the script's claims against the business either, so an
 * invented offer or a town the business is not in could be spoken with total confidence.
 *
 * So the judge JUDGES — it never writes. It checks every claim against the business facts, scores eight
 * dimensions against the anchors below, and ties each problem to its clip, its dimension and its fix.
 * The overall score, the caps for what code found mechanically, the 10/10 decision and the next step are
 * computed in code (utils/scriptQa), never taken from the model's own verdict.
 *
 * ── 2026-10-15 ─────────────────────────────────────────────────────────────────────────────────────
 * Eight dimensions (cast integrity and originality & flow added), each with anchors so a 10 means the same
 * thing every run; the word counts are measured by code and handed to the judge (it used to be told
 * nothing and miscount Telugu); the cast's own identity is described (a deity's blessing, two children,
 * the two owners); and the verified address is passed — it never was, so a script that correctly said the
 * address in its last clip was marked as inventing one.
 */
import { coreMessageBlock, type CoreMessageBrief } from "./coreMessage";
import { everydaySpeechRules } from "./everydaySpeech";
import { deityWishLine } from "./festivalWish";
import { englishWordList } from "@/utils/englishWords";
import { MAX_WORDS_PER_CLIP, MIN_WORDS_PER_CLIP, countSpokenWords } from "@/utils/scriptContract";

export interface ScriptQaContext {
  language?: string;
  adType?: string;
  festivalName?: string;
  clipCount: number;
  /** Who speaks, when the ad has characters — "Motu and Patlu", "Business Owner". */
  speakers?: string[];
  /**
   * Who the cast IS and how it must sound — a deity's blessing register, two children's simple words,
   * the two owners' "we" — so the judge holds the script to its category, not to a generic presenter.
   */
  castNote?: string;
  brief?: CoreMessageBrief | null;
  /** The clip that must land the message: 1, or 2 when clip 1 is a festival greeting. */
  messageClip?: number;
  /** The verified address as spoken, when the business has one — the final clip must say it. */
  address?: string;
  /** Spoken words per clip, counted by code on this exact script. */
  clipWords?: number[];
  /** The fixed closing sentence of the final clip, when the ad has one (a Telugu single voice). */
  closingLine?: string;
  /**
   * A deity's festival ad (2026-10-23, the owner): clip 1 is the deity's own blessing with no business in it, and the
   * FINAL clip passes on the business's wish beside the invitation (prompts/characterAd isDeityFestival).
   */
  deityBlessing?: boolean;
}

/*
  ── What the final clip has ROOM for (2026-10-22, the live real-ad run) ──────────────────────────
  A two-clip Telugu Diwali ad: clip 1 is the wish, clip 2 must hold the 9-word closing call line and the
  3-word address, so 5–8 words are left for everything else. The judge asked clip 2 for "2BHK mariyu 3BHK
  flats, open plots, bank loan arrangements and immediate booking" — about 12 more words — scored persuasion,
  clarity and relevance 5–6 for leaving them out, and the loop spent its three passes on what could never fit
  (shipped at 7.9). The judge is now told the room, in code, and to judge the selling within it.
*/
function finalClipRoomRule(ctx: ScriptQaContext): string {
  const closing = (ctx.closingLine || "").replace(/^["“]|["”]$/g, "").trim();
  const address = (ctx.address || "").trim();
  // A deity's festival ad also passes on the business's wish in its final clip (2026-10-23) — that takes room too.
  const wish = ctx.adType === "festival" && ctx.deityBlessing ? deityWishLine(ctx.festivalName || "", ctx.language) : "";
  if (!closing && !address && !wish) return "";
  const fixed = (closing ? countSpokenWords(closing) : 0) + (address ? countSpokenWords(address) : 0) + (wish ? countSpokenWords(wish) : 0);
  const room = Math.max(0, MAX_WORDS_PER_CLIP - fixed);
  const noOfferClip = ctx.adType === "festival" && ctx.clipCount <= 2;
  return `• THE FINAL CLIP'S ROOM: clip ${ctx.clipCount} must say ${[closing ? "the closing call line" : "", address ? "the address" : "", wish ? "the business's festival wish" : ""].filter(Boolean).join(" and ")} (${fixed} words), which leaves at most ${room} words for anything else. Never ask that clip for an offer, a list of products or a detail that cannot fit in ${room} words, and never mark it down for leaving one out — judge whether those ${room} words are the strongest, clearest invitation they can be.${noOfferClip ? ` In this ${ctx.clipCount}-clip wishes ad clip 1 is the wish, so no clip has room for a list of offers: one specific thing the business offers, said simply, is the whole selling job — judge persuasion, clarity and relevance on that.` : ""}
`;
}

export const SCRIPT_QA_SYSTEM_PROMPT = (ctx: ScriptQaContext): string => {
  const lang = (ctx.language || "Telugu").trim() || "Telugu";
  const isTelugu = lang.toLowerCase() === "telugu";
  const messageClip = ctx.messageClip ?? 1;
  const pair = (ctx.speakers?.length ?? 0) > 1;
  const cast = ctx.speakers?.length
    ? pair
      ? `It is a conversation between ${ctx.speakers.join(" and ")} — both speak in every clip, in that order. Their labels ([Name]:) are not spoken.`
      : `It is spoken by ${ctx.speakers[0]} alone. The label ([Name]:) is not spoken.`
    : "It is spoken by one presenter.";
  const counts = ctx.clipWords?.length
    ? ctx.clipWords.map((n, i) => `clip ${i + 1}: ${n}`).join(", ")
    : "";

  return `You are the FINAL QUALITY GATE for ${isTelugu ? "Telugu " : ""}advertising voice-overs at a top Indian ad agency — a senior copy chief and native ${lang} speaker who has approved thousands of scripts for TV, YouTube and Instagram Reels. You do NOT rewrite. You JUDGE, strictly, specifically and consistently, against the rubric below.

THE SCRIPT: ${ctx.clipCount} clips of 8 seconds${ctx.adType === "festival" && ctx.festivalName ? `, a ${ctx.festivalName} wishes ad (clip 1 is the greeting)` : ", a promotional ad"}. ${cast}${ctx.castNote?.trim() ? `
THE CAST AND HOW IT MUST SOUND: ${ctx.castNote.trim()}` : ""}${ctx.adType === "festival" && ctx.deityBlessing ? `
IN THIS FESTIVAL AD THE DEITY BLESSES AND THE BUSINESS WISHES: clip 1 is the deity's own short blessing for the viewer — no business name, nothing sold, no hook needed${ctx.clipCount > 1 ? `; the FINAL clip passes on the business's ${ctx.festivalName || "festival"} wish (the business named as the one sending it) beside the invitation, and the festival is named in no clip between them` : ""}. The deity speaks as the deity, NEVER as the business: a "we", "our shop" or "మా" about the business is a cast fault. That overrides any clip-1 direction in the cast's notes above — never mark clip 1 down for having no business in it${ctx.clipCount > 1 ? "; judge the hook from clip 2" : ""}.` : ctx.adType === "festival" && ctx.clipCount > 1 ? `
IN THIS FESTIVAL AD CLIP 1 IS THE WISH AND NOTHING ELSE: the business greets the viewer, sells nothing and needs no hook. That overrides any clip-1 direction in the cast's notes above (a hook, an obstacle, a question, a product) — never mark clip 1 down for following it; judge the hook from clip 2.` : ""}

===== THE REGISTER IT MUST HAVE =====
${isTelugu
    ? "The way an EDUCATED, WELL-SPOKEN Telugu person talks to a customer they respect — clear, fluent and confident, yet completely natural: the voice of a good TV or radio ad announcer, or an articulate business owner. Simple words everyone understands on the first listen, correct grammar, respectful మీరు / మీకు. NOT bookish, grandhika or Sanskrit-heavy Telugu. NOT slang, street talk or careless speech. NOT English sentences translated word for word. The everyday English trade words Telugu speakers really use (షాప్, ఆఫర్, సర్వీస్, క్వాలిటీ) are fine in Telugu script."
    : lang.toLowerCase() === "english"
      ? "INDIAN English — the way an educated, well-spoken person from Andhra Pradesh talks to a customer they respect: clear, fluent, confident and natural, with Indian expressions, rhythm and references (rupees, Indian places and festivals). NOT American or British slang, idioms, spellings or culture."
      : `The way an educated, well-spoken ${lang} speaker talks to a customer they respect — clear, fluent, confident and natural; simple words, correct grammar; never bookish, never slang, never translated English.`}

===== FIXED RULES — NEVER PENALISE THESE =====
${isTelugu ? `• "mariyu" written in Latin letters inside a Telugu line is REQUIRED — it is how the team spells "and". Never mark it as an error.
• These English words written in English letters inside a Telugu line are REQUIRED too, the team's spelling: ${englishWordList()} (a Telugu ending joined to them, like flatsలో, is right). Never mark them as Latin letters or as English.
` : ""}${ctx.closingLine ? `• The closing sentence ${ctx.closingLine} is fixed. Judge the rest of the final clip, not that sentence.
` : ""}${finalClipRoomRule(ctx)}• Numbers written as words, and no phone number spoken anywhere, are required.
• The business's own name is spelled exactly as given, even when it is an English or unusual word.
${ctx.address?.trim()
  ? `• THE ADDRESS IS REQUIRED: the final clip must tell the viewer where to come — "${ctx.address.trim()}". A final clip without it is a clarity problem in that clip. Saying it is NEVER an unsupported claim.`
  : "• No verified address was given: an address, street or landmark spoken anywhere is an unsupported claim."}
• THE WORD COUNT IS MEASURED BY CODE, NOT BY YOU. Every clip must hold ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} spoken words${pair ? " across both lines together" : ""}; code counted this script${counts ? ` as: ${counts}` : ""} and will cap the timing score itself when a clip is outside the band. Do not count words and do not report a word count — judge how each clip SOUNDS in 8 seconds.

${everydaySpeechRules(lang)}

${ctx.brief ? `${coreMessageBlock(ctx.brief, messageClip, ctx.clipCount)}\n` : ""}
===== THE RUBRIC — SCORE EACH DIMENSION 0–10 =====
Anchors for every dimension: 10 = nothing on this dimension would make the script better — a senior copy chief would record it exactly as written. 9 = one small improvement is possible. 8 = a few small improvements. 7 = one clear weakness. 5–6 = several weaknesses, or one serious one. 3–4 = it fails on this dimension. 0–2 = unusable.
Award a 10 when it is TRUE and only then — never out of kindness, never because a draft is "good for a first draft". If you list a problem against a dimension, that dimension is not a 10.

1. facts — every specific claim (services, products, offers, prices, discounts, years, places, awards, promises of fact like "free home delivery", "open 24 hours", "since 1995") is supported by the BUSINESS INFORMATION. Warm general praise is not a claim of fact. Any invented fact caps this at 4 — list it in unsupportedClaims.
2. language — natural, correct, fluent ${lang} in the register above, the way a native speaker really says it: no translated-English sentence shapes, no bookish or slang word, no broken transliteration, grammar a teacher would accept.
3. persuasion — the opening makes the viewer keep watching, every clip gives a reason to care, the benefits are concrete, and the close makes them act.
4. clarity — one clear idea per clip, understood on the FIRST listen; clip ${messageClip} tells a stranger who the business is, what it does and why to choose it; the clips progress logically.
5. relevance — it is unmistakably about THIS business and uses its real differentiators; it could not be pasted into another business's ad.
6. speakability — every clip is comfortable to say aloud in 8 seconds by a voice artist: an easy rhythm, natural breath points, no tongue-twister, no rushed or crammed line, no long compound word.
7. cast — the right people speak in the right way: ${pair ? "both speakers have meaningful lines in every clip, each line in its own speaker's voice and order, a real exchange (the second answers the first) — never one person's thought split in two, never a duplicated idea just to give someone a line" : "one voice carries every clip as one coherent speaker — no imagined second speaker"}; the tone fits the cast described above (a deity blesses, children speak simply, owners say "we", a cartoon keeps its personality); role labels and names are used only as the cast rules allow.
8. originality — flows as one spoken thought with no filler, no repeated selling point or phrase across clips, no padding to reach a length, no obvious template wording.

===== HOW TO REPORT =====
• For EVERY dimension below 10, list at least one problem that says why — with its clip (0 when it is about the whole script), its dimension, what is wrong in a few words, and the exact fix in a few words. Quote the offending ${lang} words when it helps.
• If the script is weak at its core — the wrong message, flat, generic, translated, or full of invented facts — say what a NEW script must do differently, in two to four plain sentences (rewriteBrief). Otherwise leave rewriteBrief empty.

===== OUTPUT — ONLY THIS JSON, no markdown =====
{
  "scores": { "facts": 0, "language": 0, "persuasion": 0, "clarity": 0, "relevance": 0, "speakability": 0, "cast": 0, "originality": 0 },
  "unsupportedClaims": [ "clip 2: <the claim> — not in the business information" ],
  "problems": [ { "clip": 1, "dimension": "language", "issue": "<what is wrong>", "fix": "<how to fix it>" } ],
  "rewriteBrief": "<only when the script needs writing again; otherwise empty>"
}`;
};
