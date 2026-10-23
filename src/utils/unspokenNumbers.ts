/**
 * The numbers a voice-over never speaks — phone numbers, pincodes and door numbers — taken out of a line.
 *
 * ── Why this exists (2026-10-22) ─────────────────────────────────────────────────────────────────
 * The owner: "in the voice-over script the PIN code, door numbers and phone numbers were coming — no need
 * of any of these numbers in the voice-over". Every writer prompt already said "never speak a phone
 * number", but nothing in code held it — and `spellOutNumbers` READ a phone number aloud digit by digit.
 * So whatever the model copied from the business content, or a member pasted, was spoken: a mobile as
 * "తొమ్మిది ఎనిమిది నాలుగు …", a pincode as "ఐదు లక్షల ముప్పై మూడు వేల ఒకటి", a door number "5-87/1"
 * as three numbers. They are printed on screen (the bottom label, the poster); the closing clip says
 * "call the number on the screen" and the address the way a person says it (utils/spokenAddress).
 *
 * `speakableLine` runs this BEFORE numbers become words, so it holds for every line that ships —
 * generated, repaired, refined, a final script, a member's own script. A generated clip that loses words
 * here falls short of the word contract and is repaired like any short clip. Prices, offers,
 * percentages, years, times, ordinals and numbers in a road's name ("100 Feet Road", "3rd Cross") are
 * kept — only these three kinds go, with the label that introduced them ("Ph:", "Call us on",
 * "ఫోన్ నంబర్", "పిన్ కోడ్", "D.No"), a Telugu case ending glued to them ("…కి") and the "or" / comma
 * that joined them to the rest.
 *
 * Pure — no React, no Firestore, no model call — so it is unit-tested.
 */

/** Where a removed number stood while the text around it is tidied: a private-use character no script holds. */
const GONE = "\u{E001}";
const G = String.raw`\u{E001}`;
/** The same for a phone number, until its "on" / "at" is taken with it. */
const PHONE_GONE = "\u{E002}";
/** Not inside a word (Telugu vowel signs are marks, so \b cannot be used). */
const NOT_AFTER_WORD = String.raw`(?<![\p{L}\p{M}\d])`;
const NOT_BEFORE_WORD = String.raw`(?![\p{L}\p{M}\d])`;
/** Telugu "number": నంబర్ / నెంబర్ / నెం. */
const TE_NUMBER = String.raw`(?:నంబర్|నెంబర్|నెం\.?)`;

/**
 * A phone number: a mobile (98480 12345, +91-98480-12345, 984 801 2345), a landline with its STD code
 * (0884-2345678), toll-free (1800 123 4567), or any run of ten to twelve digits.
 */
const PHONE = /(?<![\d₹])(?:\+?\(?91\)?[\s-]?)?(?:[6-9]\d{4}[\s-]?\d{5}|[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}|0\d{2,4}[\s-]?\d{6,8}|1[89]00[\s-]?\d{3}[\s-]?\d{3,4}|\d{10,12})(?!\d)/gu;
/** A short local number, only when a phone label says so: "Ph: 2345678". */
const LABELLED_LANDLINE = new RegExp(
  String.raw`(?<=${NOT_AFTER_WORD}(?:ph|phone|tel|landline|office|ఫోన్|ల్యాండ్\s*లైన్)\.?\s*(?:no\.?|number|${TE_NUMBER})?\s*[:\-–]?\s*)\d{6,8}(?!\d)`,
  "giu",
);

/** "PIN: 533 001", "Pincode 533001", "పిన్ కోడ్ 533001" — the label goes with it. */
const PINCODE_LABELLED = new RegExp(
  String.raw`${NOT_AFTER_WORD}(?:pin\s*code|pincode|pin|zip|పిన్\s*\u{200C}?\s*కోడ్|పిన్)\.?\s*(?:no\.?|number|${TE_NUMBER})?\s*[:\-–]?\s*[1-9]\d{2}\s?\d{3}(?!\d)`,
  "giu",
);
/**
 * A bare pincode — six digits, maybe 3 + 3 ("Kakinada-533 001"). Never a price: not after ₹ / Rs / INR /
 * MRP or a digit, comma or point, and not before "/-", "%", rupees, lakh or thousand.
 */
const PINCODE = /(?<![\d₹,.]|rs\.?\s?|inr\s?|mrp\s?)[1-9]\d{2}\s?\d{3}(?![\d,]|\.\d|\s*(?:\/-|%|rupee|rs\b|రూ|లక్ష|వేల))/giu;

/** What a door number is called. Never a bare "No." or "#" — "No.1 showroom", "#1 in town" are rankings. */
const DOOR_LABEL = String.raw`(?:d\.?\s*no|h\.?\s*no|s\.?\s*no|(?:door|house|plot|flat|shop|survey|block|site)\s*(?:no|number)|(?:డోర్|ఇంటి|ప్లాట్|ఫ్లాట్|షాప్)\s*${TE_NUMBER}|డి\.?\s*నెం)`;
/** "D.No 5-87/1", "Door No: 12-3-45A", "ఇంటి నంబర్ 4-12" — the label goes with it. */
const DOOR_LABELLED = new RegExp(String.raw`${NOT_AFTER_WORD}${DOOR_LABEL}\.?\s*[:\-–]?\s*\d[\dA-Za-z]*(?:[-/][\dA-Za-z]+)*`, "giu");
/**
 * A door number written without its label, by its shape: two hyphens ("12-3-45") or a hyphen and a slash
 * ("5-87/1"). One hyphen ("10-20") is a range and "24/7" is a phrase; a date with its year is kept.
 */
const DOOR_SHAPED = /(?<![\d\p{L}/-])\d{1,5}[A-Za-z]?(?:(?:-\d{1,5}[A-Za-z]?){2,}(?:\/\d{1,4}[A-Za-z]?)?|-\d{1,5}[A-Za-z]?\/\d{1,4}[A-Za-z]?)(?![\d/-])/gu;
const DATE_WITH_YEAR = /^\d{1,2}-\d{1,2}-(?:19|20)\d{2}$/;

/**
 * A number already written as words, digit by digit — five or more digit words in a row is a phone number
 * or a pincode being read out, never a sentence.
 */
const DIGIT_WORD = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple|సున్నా|ఒకటి|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది)`;
const DIGIT_WORD_RUN = new RegExp(String.raw`${NOT_AFTER_WORD}${DIGIT_WORD}(?:[\s,\-]+${DIGIT_WORD}){4,}${NOT_BEFORE_WORD}`, "giu");

// ── the surroundings a removed number takes with it ─────────────────────────────────────────────────

/**
 * "Ph:", "Phone No.", "WhatsApp:", "ఫోన్ నంబర్", "📞" just before it. "Call" and "WhatsApp us" stay — they are the action.
 * A bare noun label goes too ("Phone 98765 43210", "Mobile …", "Ph. …" — 2026-10-22, the live check: a typed
 * "Kakinada-533005. Phone 9876543210." left "Kakinada. Phone", and the spoken address said "కాకినాడ ఫోన్");
 * "Contact" and "WhatsApp" need their colon or "No." for that, since bare they can be the action itself.
 */
const LABEL_BEFORE = new RegExp(
  String.raw`(?:${NOT_AFTER_WORD}(?:(?:ph|phone|mobile|mob|cell|tel|contact|whats\s*app|landline|helpline)\.?\s*(?:no\.?|number|num)\.?\s*[:\-–]?|(?:ph|phone|mobile|mob|cell|tel|contact|whats\s*app|landline|helpline)\.?\s*[:\-–]|(?:ph|phone|mobile|mob|cell|tel|landline|helpline)\.?|(?:ఫోన్|మొబైల్|వాట్సా?ప్|కాంటాక్ట్|సెల్)\s*${TE_NUMBER}?\s*[:\-–]?|${TE_NUMBER}\s*[:\-–]?)|📞|☎️?|📱)\s*${G}`,
  "giu",
);
/*
  ── A removed number must not leave a broken sentence (2026-10-22, the audit after the real-ad check) ──
  "మా ఫోన్ నంబర్ 98480 12345కి కాల్ చేయండి" came out "మా కాల్ చేయండి" ("our call do"), "మా నంబర్: 98480 12345."
  came out "మా.", "Our phone number is 98480 12345." came out "Our phone number is." and "కాకినాడ 533005 లో"
  came out "కాకినాడ లో". Two rules keep the sentence whole:
  • "our / my / the … number (is)" and "మా / మన" go WITH the label — "మా ఫోన్ నంబర్ …కి కాల్ చేయండి" → "కాల్ చేయండి",
    and a sentence that was only "Our phone number is …" / "మా నంబర్: …" goes whole;
  • a town keeps the case ending its removed pincode carried: "కాకినాడలో".
*/
/** The owner word or article before a label: "Our phone number is", "the number", "మా నంబర్", "మా". */
const OWNED_LABEL_BEFORE = new RegExp(
  String.raw`${NOT_AFTER_WORD}(?:(?:our|my|the)\s+(?:(?:phone|mobile|contact|whats\s*app|cell)\s+)?(?:no\.?|number)(?:\s+is)?|(?:our|my)\s+(?:phone|mobile|contact|whats\s*app|cell)(?:\s+is)?|(?:మా|మన)(?:\s+(?:(?:ఫోన్|మొబైల్|వాట్సా?ప్|కాంటాక్ట్|సెల్)\s*)?(?:నంబర్|నెంబర్|నెం\.?)?)?)\s*[:\-–]?\s*${G}`,
  "giu",
);
/** A Telugu case ending after a removed pincode belongs to the town before it. */
const TOWN_ENDING_AFTER_GONE = new RegExp(String.raw`([\u{0C00}-\u{0C7F}])[ \t]*${G}[ \t]*(లోని|లో|కి|కు|నుండి|నుంచి|దగ్గర)${NOT_BEFORE_WORD}`, "gu");
/** A dash gluing a word to a removed number. */
const DASH_BEFORE = new RegExp(String.raw`(?<=[\p{L}\p{M}])[ \t]*[-–][ \t]*${G}`, "gu");
/** "on" / "at" before a removed phone number. */
const PREP_BEFORE_PHONE = new RegExp(String.raw`${NOT_AFTER_WORD}(?:on|at)\s+\u{E002}`, "giu");
/** A Telugu case ending on a phone number: "98480 12345కి", "… 12345 కు". */
const SUFFIX_AFTER_PHONE = new RegExp(String.raw`\u{E002}\s*\u{200C}?(?:కు|కి|కే|లో|ని|నుండి|తో)${NOT_BEFORE_WORD}`, "gu");
/** What joins two removed numbers: one gap. */
const JOIN = String.raw`(?:[,/&|\-–]|(?<![\p{L}])(?:or|and|లేదా|మరియు|mariyu)(?![\p{L}\p{M}]))`;
const GONE_RUN = new RegExp(String.raw`${G}(?:\s*${JOIN}\s*${G})+`, "giu");
/** A removed number opening an address or a clause, and its comma: "at D.No 5-87, Main Road" → "at Main Road". */
const GONE_BEFORE_TEXT = new RegExp(String.raw`(^|[,.!?:;(]\s*|${NOT_AFTER_WORD}(?:at|on)\s+)${G}\s*[,;\-–]\s*`, "giu");
/** "Call us on X." → "Call us." */
const PREP_BEFORE_END = new RegExp(String.raw`\s*${NOT_AFTER_WORD}(?:on|at)\s*${G}(?=\s*(?:[.!?,;)]|$))`, "giu");
/** "Kakinada, 533001." → "Kakinada."; "Kakinada-533001" → "Kakinada"; "Call X or Y." → "Call." */
const JOIN_BEFORE_END = new RegExp(String.raw`\s*${JOIN}\s*${G}(?=\s*(?:[.!?,;)]|$))`, "giu");

/** True when a line holds a phone number, pincode or door number a voice-over must not speak. */
export function hasUnspokenNumbers(text: string): boolean {
  return !!text && withoutUnspokenNumbers(text) !== text;
}

/**
 * The line without its phone numbers, pincodes and door numbers (see the file note). A line with none is
 * returned exactly as it is; running it twice changes nothing more.
 */
export function withoutUnspokenNumbers(text: string): string {
  if (!text) return text;
  let changed = false;
  const mark = () => { changed = true; return GONE; };
  const markPhone = () => { changed = true; return PHONE_GONE; };
  let out = text
    .replace(PINCODE_LABELLED, mark)
    .replace(DOOR_LABELLED, mark)
    // Phones before the door-number shape: "+91-98480-12345" has two hyphens too.
    .replace(PHONE, markPhone)
    .replace(LABELLED_LANDLINE, markPhone)
    .replace(DOOR_SHAPED, (m) => (DATE_WITH_YEAR.test(m) ? m : mark()))
    .replace(PINCODE, mark)
    .replace(DIGIT_WORD_RUN, markPhone);
  if (!changed) return text;
  out = out
    // "Call us on X today" → "Call us today" — only a phone number's "on" / "at" goes mid-sentence; an
    // address keeps its "at" ("at D.No 5-87, Main Road" → "at Main Road").
    .replace(PREP_BEFORE_PHONE, PHONE_GONE)
    // Only a phone number takes its case ending: "…12345కి కాల్ చేయండి"; after a pincode it is the
    // town's ("కాకినాడ 533001 లో").
    .replace(SUFFIX_AFTER_PHONE, PHONE_GONE)
    .replace(/\u{E002}/gu, GONE)
    .replace(TOWN_ENDING_AFTER_GONE, (_m, last: string, ending: string) => `${last}${last === "\u{0C4D}" ? "\u{200C}" : ""}${ending}`)
    .replace(OWNED_LABEL_BEFORE, GONE)
    .replace(LABEL_BEFORE, GONE)
    .replace(GONE_RUN, GONE)
    // "Kakinada-533 001 today" → "Kakinada today".
    .replace(DASH_BEFORE, GONE)
    .replace(GONE_BEFORE_TEXT, "$1")
    .replace(PREP_BEFORE_END, "")
    .replace(JOIN_BEFORE_END, "")
    .replace(/\u{E001}/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    // A sentence that was only a number: "Come. Ph: 2345678. Soon." → "Come. Soon." — before the space in
    // front of a full stop is taken out, which would leave "Come.. Soon." (an ellipsis has no spaces, so it stays).
    .replace(/([.!?])(?:[ \t]+[.!?](?![.!?]))+/g, "$1")
    .replace(/[ \t]+([,.!?;:)])/g, "$1")
    .replace(/\([ \t]*\)/g, "")
    .replace(/,(?:[ \t]*,)+/g, ",")
    .replace(/[,;:][ \t]*([.!?])/g, "$1")
    .replace(/^[\s,.!?;:\-–]+/, "")
    .replace(/[ \t,;:\-–]+$/, "")
    .trim();
  return out;
}

/**
 * ── A spoken phone number is a RUN of digit words (2026-10-23) ──
 * The check counted digit words anywhere in a clip (two English-in-Telugu or three Telugu), so "ఇరవై నాలుగు గంటల
 * సెక్యూరిటీ … టూ బీహెచ్‌కే, త్రీ బీహెచ్‌కే" — the spelling code itself writes for "2BHK, 3BHK" (utils/englishWords) — was
 * "a phone/contact number" (geminiService validateVoiceOverSegments): live, a client-photo ad's clip 2 was capped at speakability 6 and the loop spent its
 * budget on it. A number read out digit by digit says four or more digit words in a row (commas and spaces between).
 */
const PHONE_RUN_WORDS = 4;
const DIGIT_RUN_WORD = /^(?:జీరో|వన్|టూ|త్రీ|ఫోర్|ఫైవ్|సిక్స్|సెవెన్|ఎయిట్|నైన్|సున్నా|ఒకటి|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది)$/u;
export const speaksDigitRun = (text: string): boolean => {
  let run = 0;
  for (const token of text.split(/[\s,.\-–—]+/u).filter(Boolean)) {
    run = DIGIT_RUN_WORD.test(token) ? run + 1 : 0;
    if (run >= PHONE_RUN_WORDS) return true;
  }
  return false;
};
