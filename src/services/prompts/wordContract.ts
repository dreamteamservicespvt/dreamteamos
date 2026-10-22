/**
 * The word budget as every script prompt states it — the writer, its repairs, the native-speaker review,
 * the refine editor and the character writer and repair all include THIS block, built from the numbers in
 * utils/scriptContract. Until 2026-10-15 each prompt wrote its own sentence about length, and they
 * disagreed (18–20 here, 15–17 there, a deity's "eight to twelve words" in its catalogue entry).
 *
 * The block is what a model obeys most literally, so it says three things plainly: the band (17–20, aim
 * 18–19, 20 the hard ceiling), what counts (every SPOKEN word — the business name, the address and the
 * closing call line included; never labels or punctuation), and how to fit it (write a shorter complete
 * thought — never pad, never cut a sentence in half). Code counts every clip afterwards and repairs or
 * rejects whatever is outside the band, so this is the instruction, not the guarantee.
 */
import {
  MAX_WORDS_PER_CLIP, MAX_WORDS_PER_LINE, MIN_WORDS_PER_CLIP, MIN_WORDS_PER_LINE,
  PREFERRED_WORDS_PER_CLIP, PREFERRED_WORDS_PER_LINE, countSpokenWords, measuresSyllables, syllableLimitsFor,
} from "@/utils/scriptContract";

/**
 * The fixed sentence a Telugu single-voice ad ends with — one spelling for the writer, its repairs, the
 * review, the refine and the validator (geminiService FINAL_SCREEN_CTA). It is 9 spoken words, and they
 * count inside the final clip's 17–20. (The zero-width non-joiners are written as escapes on purpose.)
 */
export const TELUGU_SCREEN_CTA = "మరిన్ని వివరాల కోసం స్క్రీన్\u{200C}పై ఉన్న నంబర్\u{200C}కు ఇప్పుడే కాల్ చేయండి.";

/** How the cast speaks — only to say how the budget is met naturally for it, never to change it. */
export type WordContractRegister = "presenter" | "people" | "owners" | "children" | "cartoon" | "deity";

export interface WordContractOptions {
  /** People speaking in each clip: 1 = one voice (the default), 2 = a two-person clip. */
  speakers?: number;
  /** Their names, in speaking order — for the split sentence of a two-person clip. */
  names?: string[];
  /** The fixed sentence the final clip ends with, when the ad has one — counted here, in code. */
  closingLine?: string;
  /** The address the final clip must say, in its spoken form — counted here too. */
  address?: string;
  register?: WordContractRegister;
  /** The script's language: a Telugu script is also told its syllable limit (utils/scriptContract, 2026-10-22). */
  language?: string;
}

const BAND = `${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP}`;
const PREFERRED = `${PREFERRED_WORDS_PER_CLIP.min}–${PREFERRED_WORDS_PER_CLIP.max}`;

/** One-line form, for a sentence inside another rule ("Every clip has 17–20 spoken words — aim for 18–19"). */
export const WORD_BAND_TEXT = `${BAND} spoken words (aim for ${PREFERRED}; ${MAX_WORDS_PER_CLIP} is the hard ceiling)`;

/** The word budget, as a block every script prompt includes. */
export function wordContractBlock(options: WordContractOptions = {}): string {
  const pair = (options.speakers ?? 1) > 1;
  const [a, b] = options.names ?? [];
  const closing = options.closingLine?.trim() ? options.closingLine.trim() : "";
  const closingWords = closing ? countSpokenWords(closing) : 0;
  const address = options.address?.trim() || "";
  const addressWords = address ? countSpokenWords(address) : 0;
  const lines: string[] = [
    `• Every clip holds ${BAND} SPOKEN words — aim for ${PREFERRED}. ${MAX_WORDS_PER_CLIP} is the hard ceiling: a clip of ${MAX_WORDS_PER_CLIP + 1} words is rejected and rewritten. Fewer than ${MIN_WORDS_PER_CLIP} leaves dead air. This holds for every clip, whoever speaks it.`,
  ];
  if (pair) {
    lines.push(`• A clip's TWO lines TOGETHER make the ${BAND} — never ${BAND} each. Split it evenly: about ${PREFERRED_WORDS_PER_LINE.min}–${PREFERRED_WORDS_PER_LINE.max} words for ${a ? `${a}'s line` : "the first line"} and ${PREFERRED_WORDS_PER_LINE.min}–${PREFERRED_WORDS_PER_LINE.max} for ${b ? `${b}'s` : "the answer"} (each line ${MIN_WORDS_PER_LINE}–${MAX_WORDS_PER_LINE}), so both have a real, unhurried line and the hand-over has time to breathe.`);
  } else {
    lines.push(`• The one speaker's line IS the clip: ${BAND} words in a single complete sentence.`);
  }
  if (options.language !== undefined && measuresSyllables(options.language)) {
    // The live Flow check (2026-10-22): 18 words / 54 syllables just fit 8 s; 19 words / 58 syllables were cut.
    const { aim } = syllableLimitsFor(pair);
    lines.push(`• It must also be SAID in 8 seconds: at most ${aim} syllables (aksharas) in the clip${pair ? ", both lines together" : ""} — the voice says about six a second and stops at eight seconds, cutting whatever is left. So the ${BAND} words are SHORT everyday words: a long compound (కస్టమర్లందరికీ, శ్రేయోభిలాషులు, హృదయపూర్వక) costs as much as three short words — use a short one or leave it out. Counted in code.`);
  }
  lines.push(`• Count only what is SAID — every word of every line, including the business name, the town, the address and the closing call line. Clip labels, timestamps, speaker labels and punctuation are not words.`);
  if (closing) {
    const lo = Math.max(0, MIN_WORDS_PER_CLIP - closingWords);
    const hi = Math.max(0, MAX_WORDS_PER_CLIP - closingWords);
    lines.push(`• The final clip's closing sentence ${closing} is ${closingWords} words and counts INSIDE that clip's ${BAND}, so the rest of the final clip has ${lo}–${hi} words${address ? ` — the address ("${address}", ${addressWords} words) among them` : ""}.`);
  } else if (address) {
    lines.push(`• The address the final clip says ("${address}") is ${addressWords} words and counts inside that clip's ${BAND}.`);
  }
  // A final clip whose fixed words leave little room (found live, 2026-10-15): it holds the invitation only.
  const room = MAX_WORDS_PER_CLIP - closingWords - addressWords;
  if ((closing || address) && room <= 8) {
    lines.push(`• That leaves the final clip room for only ${Math.max(0, MIN_WORDS_PER_CLIP - closingWords - addressWords)}–${Math.max(0, room)} other words — a short invitation, nothing more. Put every offer and every fact in an EARLIER clip; the final clip never carries one.`);
  }
  lines.push(`• Fit the budget by WRITING: one clear idea per clip, said simply and completely. Never pad to reach ${MIN_WORDS_PER_CLIP} — no filler, no repeated adjective, no empty praise, no greeting or meaningless English word added — and never cut a sentence in half to stay under ${MAX_WORDS_PER_CLIP}: choose a shorter complete thought.`);
  const register: Record<WordContractRegister, string> = {
    presenter: "",
    people: "",
    owners: "",
    children: "• Children speak in simple, short words a nine-year-old really says — the budget is met with plain words and short sentences, never by making them gabble or sound like a grown-up's sales pitch.",
    cartoon: "• The characters keep their own rhythm and personality inside the budget — a quick reaction and a clear answer, not a joke stretched to fill the clip.",
    deity: "• A blessing is calm and unhurried: the budget is met with clear, complete, everyday sentences — never a chant, never a list of blessings to fill the clip.",
  };
  const note = register[options.register ?? "presenter"];
  if (note) lines.push(note);
  lines.push("• Count every clip before you output it.");
  return `===== THE WORD BUDGET — ${BAND} SPOKEN WORDS IN EVERY CLIP (MANDATORY, COUNTED IN CODE) =====\n${lines.join("\n")}`;
}
