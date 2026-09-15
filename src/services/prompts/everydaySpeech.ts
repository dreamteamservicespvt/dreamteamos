/**
 * Everyday spoken language — the words people in the town actually say.
 *
 * ── Why the hard words are named, and checked in code ────────────────────────────────────────────
 * Every script prompt already said "no bookish, grandhika or Sanskrit-heavy Telugu", and live scripts
 * still said ప్రసిద్ధి, స్వచ్ఛమైన, అత్యుత్తమ, సందర్శించండి, నిబద్ధత, మా వద్ద and అందిస్తాము. Two
 * reasons. The same prompts asked for "premium" and "polished" copy, which a model reads as formal,
 * written Telugu. And an abstract rule loses to a model's written-register habit every time.
 *
 * So the hard words are named, each with the word people use instead, and shown to every writer,
 * repairer, reviewer and refine editor. A script that still uses one is caught here, and that clip
 * goes back through the clip-level repair — the same way a clip outside the word band does. Written
 * verb endings (చేస్తాము → చేస్తాం) need no model at all: they are fixed in code, word for word.
 *
 * The list is Telugu-only and kept to words that are unmistakably bookish in speech. A common word
 * everyone already understands (ఉచితం, సేవ, ప్రత్యేకంగా, అద్భుతమైన) is left alone: every flag
 * costs a repair call, and a false one would rewrite a good line.
 */

export interface HardWord {
  /** The bookish word, as shown to the writer. */
  word: string;
  /** What people actually say instead. */
  say: string;
  /** Matched at the start of a word — the word with any case ending (సందర్శ → సందర్శించండి). */
  stems?: string[];
  /** Matched anywhere inside a word, for compounds (స్వచ్ఛ → అతిస్వచ్ఛమైన). */
  parts?: string[];
  /** Matched only as the whole word — short function words (మరియు, వద్ద) that begin other words. */
  forms?: string[];
  /** Matched against the whole word, for grammar with no fixed stem (the passive). */
  pattern?: RegExp;
  /**
   * Latin spellings that mean the word is part of a business or place name. A name is never "hard":
   * శ్రీ ప్రసిద్ధి ట్రేడర్స్ is what the shop is called.
   */
  names?: string[];
  /** Shown in the prompt's "never these" list. The rest are still checked. */
  shown?: boolean;
}

export const HARD_TELUGU_WORDS: HardWord[] = [
  { word: "ప్రసిద్ధి", say: "ఫేమస్", parts: ["ప్రసిద్ధ"], names: ["prasid"], shown: true },
  { word: "ప్రఖ్యాత", say: "ఫేమస్", parts: ["ప్రఖ్యాత"], names: ["prakhyat"] },
  { word: "స్వచ్ఛమైన", say: "అసలైన", parts: ["స్వచ్ఛ"], names: ["swach", "svach", "swatch"], shown: true },
  { word: "అత్యుత్తమ", say: "చాలా మంచి", stems: ["అత్యుత్తమ"], shown: true },
  { word: "ఉత్తమ", say: "మంచి", stems: ["ఉత్తమ"], names: ["uttam", "utham"] },
  { word: "అత్యంత", say: "చాలా", stems: ["అత్యంత"], shown: true },
  { word: "అనేక", say: "చాలా", stems: ["అనేక"] },
  { word: "నాణ్యమైన", say: "క్వాలిటీ", stems: ["నాణ్య"], shown: true },
  { word: "సందర్శించండి", say: "రండి", stems: ["సందర్శ"], shown: true },
  { word: "విచ్చేయండి", say: "రండి", stems: ["విచ్చేయ", "విచ్చేస"] },
  { word: "సంప్రదించండి", say: "కాల్ చేయండి", stems: ["సంప్రదించ", "సంప్రదిస్త"], shown: true },
  { word: "ఆహ్వానిస్తున్నాం", say: "రండి", stems: ["ఆహ్వాని"] },
  { word: "లభిస్తుంది", say: "దొరుకుతుంది", stems: ["లభి", "లభ్య"], shown: true },
  { word: "వినియోగదారులు", say: "కస్టమర్లు", stems: ["వినియోగదార"], shown: true },
  { word: "వినియోగించండి", say: "వాడండి", stems: ["వినియోగించ", "వినియోగిస్త"] },
  { word: "ఉపయోగించి", say: "వాడి", stems: ["ఉపయోగించ", "ఉపయోగిస్త"], shown: true },
  { word: "అనుభవజ్ఞులైన", say: "అనుభవం ఉన్న", stems: ["అనుభవజ్ఞ"], shown: true },
  { word: "నిపుణులు", say: "బాగా పని తెలిసినవాళ్లు", stems: ["నిపుణ"] },
  { word: "విశ్వసనీయ", say: "నమ్మకమైన", stems: ["విశ్వసనీయ"], shown: true },
  { word: "నిబద్ధత", say: "శ్రద్ధ", stems: ["నిబద్ధ"] },
  { word: "తక్షణమే", say: "వెంటనే", stems: ["తక్షణ"], shown: true },
  { word: "సత్వర", say: "తొందరగా", stems: ["సత్వర"] },
  { word: "విభిన్న", say: "రకరకాల", stems: ["విభిన్న"], shown: true },
  { word: "వివిధ", say: "రకరకాల", stems: ["వివిధ"] },
  { word: "సమస్త", say: "అన్ని", stems: ["సమస్త"], names: ["samast"] },
  { word: "సకల", say: "అన్ని", stems: ["సకల"], names: ["sakal"] },
  { word: "రుచికరమైన", say: "రుచిగా", stems: ["రుచికర"], shown: true },
  { word: "నూతన", say: "కొత్త", stems: ["నూతన"], names: ["nutan", "nuthan", "noothan"], shown: true },
  { word: "ఆధునిక", say: "కొత్త", stems: ["ఆధునిక"], names: ["adhunik"] },
  { word: "వినూత్న", say: "కొత్త", stems: ["వినూత్న"] },
  { word: "ప్రారంభం", say: "ఓపెనింగ్", stems: ["ప్రారంభ"], names: ["prarambh", "praramb"] },
  { word: "ఉన్నత", say: "మంచి", stems: ["ఉన్నత"], names: ["unnat"] },
  { word: "ప్రామాణిక", say: "క్వాలిటీ", stems: ["ప్రామాణిక"] },
  { word: "ప్రత్యేకత", say: "స్పెషల్", stems: ["ప్రత్యేకత"] },
  { word: "సుందరమైన", say: "అందమైన", stems: ["సుందర"], names: ["sundar"] },
  { word: "మనోహరమైన", say: "అందమైన", stems: ["మనోహర"], names: ["manohar"] },
  { word: "ఆకర్షణీయమైన", say: "అందమైన", stems: ["ఆకర్షణీయ"] },
  { word: "సంతృప్తి", say: "హ్యాపీ", stems: ["సంతృప్త"] },
  { word: "సాంకేతిక", say: "టెక్నాలజీ", stems: ["సాంకేతిక"] },
  { word: "పరికరాలు", say: "మెషిన్లు", stems: ["పరికర"] },
  { word: "గృహోపకరణాలు", say: "హోమ్ అప్లయెన్సెస్", stems: ["ఉపకరణ"], parts: ["ోపకరణ"] },
  { word: "ఉత్పత్తులు", say: "ప్రొడక్ట్స్", stems: ["ఉత్పత్త"] },
  { word: "కొనుగోలు", say: "కొనండి", stems: ["కొనుగోలు"] },
  { word: "విక్రయం", say: "అమ్మకం", stems: ["విక్రయ"] },
  { word: "రాయితీ", say: "డిస్కౌంట్", stems: ["రాయితీ"] },
  { word: "వస్త్రాలు", say: "బట్టలు", stems: ["వస్త్ర"], names: ["vastr"] },
  { word: "ఆభరణాలు", say: "నగలు", stems: ["ఆభరణ"], names: ["abharan", "aabharan"] },
  { word: "వాహనం", say: "బండి", stems: ["వాహన"], names: ["vahan", "vaahan"] },
  { word: "ఔషధాలు", say: "మందులు", stems: ["ఔషధ"], names: ["aushadh", "oushadh"] },
  // Before చికిత్స: the longer word wins, and says what people actually call it.
  { word: "శస్త్రచికిత్స", say: "ఆపరేషన్", stems: ["శస్త్రచికిత్స"] },
  { word: "చికిత్స", say: "ట్రీట్‌మెంట్", parts: ["చికిత్స"] },
  { word: "విద్యార్థులు", say: "స్టూడెంట్స్", stems: ["విద్యార్థ"] },
  { word: "అల్పాహారం", say: "టిఫిన్", stems: ["అల్పాహార"], shown: true },
  { word: "పానీయాలు", say: "డ్రింక్స్", parts: ["పానీయ"] },
  { word: "పరిశుభ్రంగా", say: "శుభ్రంగా", stems: ["పరిశుభ్ర"] },
  { word: "సేవలందిస్తాం", say: "సర్వీస్ చేస్తాం", parts: ["సేవలంది"] },
  { word: "తప్పక", say: "తప్పకుండా", forms: ["తప్పక"] },
  // Written-Telugu grammar words nobody says out loud.
  { word: "మరియు", say: "ఇంకా", forms: ["మరియు"], shown: true },
  { word: "యొక్క", say: "(leave it out)", forms: ["యొక్క"], shown: true },
  { word: "కొరకు", say: "కోసం", forms: ["కొరకు", "కొరకే"], shown: true },
  { word: "వద్ద", say: "దగ్గర", forms: ["వద్ద", "వద్దకు", "వద్దనే", "వద్దే"], shown: true },
  { word: "ద్వారా", say: "తో", forms: ["ద్వారా"] },
  { word: "కలదు", say: "ఉంది", forms: ["కలదు", "గలదు", "కలవు", "గలవు"], shown: true },
  /**
   * The passive — చేయబడును, అందించబడుతుంది, తయారుచేయబడతాయి, తయారుచేయబడింది. Two letters before బడ
   * so a word that merely starts with బడి (school) never matches, and only the passive's own endings
   * after it, so పెట్టుబడి, పెట్టుబడులు and పెట్టుబడిని (investment) do not either.
   */
  {
    word: "చేయబడును",
    say: "చేస్తాం",
    pattern: /[ఀ-౿]{2,}బడ(?:ును|ుతు|ుతా|తా|తు|ింది|్డా|్డది|ిన(?!ి))/,
    shown: true,
  },
];

const TELUGU = /[ఀ-౿]/;
const isTelugu = (language?: string) => ((language || "Telugu").trim() || "Telugu").toLowerCase() === "telugu";

/** A word with its punctuation and joiners taken off, for matching. */
const bare = (token: string) => token.replace(/[^\p{L}\p{M}\p{N}]/gu, "");

function matches(entry: HardWord, word: string): boolean {
  if (entry.forms?.includes(word)) return true;
  if (entry.stems?.some((s) => word.startsWith(s))) return true;
  if (entry.parts?.some((p) => word.includes(p))) return true;
  return !!entry.pattern?.test(word);
}

/** True when a hard word is part of one of the business's own names, so it must be left alone. */
function isPartOfAName(entry: HardWord, names: string[]): boolean {
  const lower = names.map((n) => n.toLowerCase());
  if (entry.names?.some((latin) => lower.some((n) => n.includes(latin)))) return true;
  const telugu = [...(entry.stems ?? []), ...(entry.parts ?? []), ...(entry.forms ?? [])];
  return names.some((n) => TELUGU.test(n) && telugu.some((t) => n.includes(t)));
}

export interface HardWordHit {
  /** The word as it appears in the script. */
  found: string;
  /** What to say instead. */
  say: string;
}

/**
 * The hard words in one piece of spoken text, in order, each once.
 *
 * `names` are the business's name and town, in any script — a hard word inside them is left alone.
 * Returns [] for every language other than Telugu: the list is Telugu's.
 */
export function findHardWords(text: string, language?: string, names: string[] = []): HardWordHit[] {
  if (!isTelugu(language) || !text) return [];
  const active = HARD_TELUGU_WORDS.filter((entry) => !isPartOfAName(entry, names.filter(Boolean)));
  const hits: HardWordHit[] = [];
  const seen = new Set<string>();
  for (const token of text.split(/\s+/)) {
    const word = bare(token);
    if (!word || !TELUGU.test(word) || seen.has(word)) continue;
    const entry = active.find((e) => matches(e, word));
    if (entry) {
      seen.add(word);
      hits.push({ found: word, say: entry.say });
    }
  }
  return hits;
}

const HARD_WORD_MARK = "uses words people do not say in everyday";

/** The validation message for a clip — or one character's line — that uses hard words. */
export function hardWordIssue(clipNumber: number, hits: HardWordHit[], language = "Telugu", speaker?: string): string {
  const lang = (language || "Telugu").trim() || "Telugu";
  const who = speaker ? `: ${speaker}'s line` : "";
  const swaps = hits.map((h) => `"${h.found}" → say "${h.say}"`).join(", ");
  return `Clip ${clipNumber}${who} ${HARD_WORD_MARK} ${lang} — ${swaps}. Swap each for the everyday word, keep the meaning, and keep the clip inside its word count.`;
}

/**
 * True for a hard-word message. A refine is never refused over one — the member asked for a change,
 * and losing it over one formal word is worse than the word — so the refine flow tells them apart.
 */
export function isHardWordIssue(issue: string): boolean {
  return issue.includes(HARD_WORD_MARK);
}

/** Hard-word messages for a single-voice script, one per clip that has any. */
export function hardWordIssues(clips: string[], language?: string, names: string[] = []): string[] {
  return clips.flatMap((text, i) => {
    const hits = findHardWords(text, language, names);
    return hits.length ? [hardWordIssue(i + 1, hits, language)] : [];
  });
}

/** Hard-word messages for a dialogue script, one per line that has any, naming whose line it is. */
export function dialogueHardWordIssues(
  clips: { speaker: string; text: string }[][],
  language: string | undefined,
  names: string[],
  nameOf: (speakerKey: string) => string,
): string[] {
  return clips.flatMap((clip, i) => clip.flatMap((line) => {
    const hits = findHardWords(line.text, language, names);
    return hits.length ? [hardWordIssue(i + 1, hits, language, nameOf(line.speaker))] : [];
  }));
}

/**
 * Written verb endings turned into spoken ones: చేస్తాము → చేస్తాం, ఉన్నాము → ఉన్నాం,
 * చేశాము → చేశాం, వెళ్దాము → వెళ్దాం.
 *
 * Done in code because it is exact: the same word, one letter shorter, no model needed. Only verb
 * endings — తా, టా, న్నా, శా, చ్చా… before ము — so పాము (snake), గ్రాము (gram), బాదాము (almond)
 * and the pronoun తాము are never touched. Other languages are returned as they are.
 */
export function toSpokenEndings(text: string, language?: string): string {
  if (!isTelugu(language) || !text) return text;
  return text.replace(
    /([ఀ-౿])(తా|టా|న్నా|శా|ేసా|చ్చా|ంచా|ద్దా|్దా|మ్మా|ళ్ళా|ళ్లా|ప్పా|క్కా)ము(?![ఀ-౿])/g,
    "$1$2ం",
  );
}

/**
 * The prompt section every writer, repairer, reviewer and editor of a script gets.
 *
 * "Premium" stays — it is the delivery. It is never the vocabulary.
 */
export function everydaySpeechRules(language?: string): string {
  const lang = (language || "Telugu").trim() || "Telugu";
  const lower = lang.toLowerCase();

  if (lower === "english") {
    return `===== PLAIN EVERYDAY ENGLISH — EVERY WORD (MANDATORY) =====

Write the way a friendly shopkeeper talks to a customer: short, common words that anyone in the town understands on the first listen. "Premium" is the confidence and warmth of the delivery — it is never fancy words. Never "bespoke", "curated", "state-of-the-art", "unparalleled", "solutions", "leverage" or any other brochure word.`;
  }

  const firstListen = `THE FIRST-LISTEN TEST, for every single word: would a vegetable seller, an auto driver, a grandmother and a college student in this town all understand it instantly — and say it themselves? If any one of them would pause on it, replace it with the word they actually use.`;

  if (lower !== "telugu") {
    return `===== EVERYDAY SPOKEN ${lang.toUpperCase()} — EVERY WORD (MANDATORY) =====

Write the way people in the town actually TALK — at home, at the shop counter, on the phone — never the way a newspaper, a textbook or a government notice writes. "Premium" is the confidence and warmth of the delivery; it is NEVER fancy or formal words.

${firstListen}

• Everyday ${lang} words first.
• An English word only when everyone in town already says it in English (free, offer, service, delivery, order, shop, fresh, special) — written in ${lang} script. Never English that only city people use (premium, exclusive, professional, innovative).
• Never literary, Sanskrit-heavy, textbook or government-style ${lang}. Active voice. Short, simple words in one easy sentence.`;
  }

  const never = HARD_TELUGU_WORDS.filter((w) => w.shown).map((w) => `${w.word} → ${w.say}`).join("  |  ");
  return `===== EVERYDAY SPOKEN TELUGU — EVERY WORD (MANDATORY) =====

Write the way people in the town actually TALK — at home, at the shop counter, on the phone — never the way a newspaper, a textbook or a government notice writes. "Premium" is the confidence and warmth of the delivery; it is NEVER fancy or formal words.

${firstListen}

• Everyday Telugu words first: చాలా, మంచి, కొత్త, వెంటనే, దగ్గర, దొరుకుతుంది, నమ్మకమైన, రండి.
• An English word only when everyone in town already says it in English — ఫ్రీ, ఆఫర్, సర్వీస్, డెలివరీ, ఆర్డర్, షాప్, ఫ్రెష్, స్పెషల్, క్వాలిటీ — written in Telugu script. Never English that only city people use (ప్రీమియం, ఎక్స్‌క్లూజివ్, ప్రొఫెషనల్, ఇన్నోవేటివ్), and never swap a simple Telugu word for English: కొత్త stays కొత్త, never న్యూ.
• Spoken verb endings, never written ones: చేస్తాం, ఇస్తాం, ఉన్నాం — never చేస్తాము, ఇస్తాము, ఉన్నాము.
• Active voice: చేస్తాం, ఇస్తాం, ఉంది — never చేయబడును, అందించబడుతుంది, కలదు.
• Short, simple words in one easy sentence.

NEVER THESE → SAY THESE INSTEAD:
${never}`;
}
