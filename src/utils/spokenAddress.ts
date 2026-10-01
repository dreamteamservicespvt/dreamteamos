/**
 * The business's address as it is SPOKEN in the last clip — and the check that it was.
 *
 * ── Why this exists (2026-10-01) ─────────────────────────────────────────────────────────────
 * The team's rule: when the client's data has a real address, the closing clip says it; when it has
 * none, no address is spoken and nothing is invented. The prompts said the opposite in two places —
 * the presenter script made the address "optional", the character script forbade anything beyond the
 * town ("never a door number, street… those are read on screen") — and nothing checked either way.
 *
 * The address used is ONLY the verified one (utils/businessFacts: typed by the member, or read from a
 * card, flyer or premises photo). A door number, a pincode, a district and a state are written on the
 * bottom label and the poster, never said: in an 8-second clip they are seconds of digits a viewer
 * cannot remember. What is said is what a person would tell a friend — the road, the landmark, the
 * town — in at most a handful of words, so it fits beside the call to action.
 *
 * Pure — no React, no Firestore, no model call — so it is unit-tested.
 */

/** Parts of an address that are read, never spoken. */
const DOOR_NUMBER = /^(?:(?:d|h|s)\.?\s*no\b|(?:door|plot|flat|shop|house|survey|unit|block)\.?\s*(?:no\.?)?\s*[:-]?\s*[\da-z]{0,2}\d|no\.\s*\d|#)/i;
/** What a form or a model writes when there is no address at all. */
const NO_ADDRESS = /^(?:not\s+provided|not\s+available|n\/?a|nil|none|-+|unknown)$/i;
/** A landmark a person gives directions by — said first when the words run short. */
const LANDMARK = /^(?:opposite|near|beside|behind|next to|in front of|above|below)\b/i;
/** An area, street or road — said next. */
const AREA = /(?:nagar|peta?|pet|puram|palem|wada|guda|colony|layout|street|road|junction|centre|center|bazaar|market|cross roads)\b/i;
const NUMBER_ONLY = /^[#\d\s\-/.,]+[a-z]?$/i;
const PINCODE = /\b\d{6}\b/g;
const FLOOR = /\b(?:\d+(?:st|nd|rd|th)|ground|first|second|third|top)\s+floor\b/i;
const REGION = /^(?:andhra\s*pradesh|a\.?\s*p\.?|telangana|t\.?\s*s\.?|t\.?\s*g\.?|india|tamil\s*nadu|karnataka|kerala|odisha|orissa|maharashtra|pin(?:\s*code)?)$/i;
const DISTRICT = /\b(?:dist\.?|district|mandal|taluk|tehsil|state)\b/i;

/** Abbreviations written on cards, expanded the way they are said. */
const EXPANSIONS: [RegExp, string][] = [
  [/\bopp\.?(?=\s|$)/gi, "opposite"],
  [/\bnr\.?(?=\s|$)/gi, "near"],
  [/\bbeh\.?(?=\s|$)/gi, "behind"],
  [/\brd\.?(?=\s|$|,)/gi, "Road"],
  [/\bst\.(?=\s|$)/gi, "Street"],
  [/\bjn\.?(?=\s|$)/gi, "Junction"],
  [/\bx\s*rd?s?\b/gi, "Cross Roads"],
];

/** How many spoken words an address may take in a closing clip that also carries the call to action. */
export const MAX_SPOKEN_ADDRESS_WORDS = 6;

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * The spoken form of a verified address: road, landmark and town, door numbers, pincodes, districts
 * and states left out, abbreviations said in full, at most MAX_SPOKEN_ADDRESS_WORDS words (the town is
 * always kept). "" when there is no address, or nothing in it a person would say.
 */
export function spokenAddressOf(address: string | null | undefined, maxWords = MAX_SPOKEN_ADDRESS_WORDS): string {
  const text = (address || "").replace(/\r?\n+/g, ", ").replace(/\s+/g, " ").trim();
  if (!text || NO_ADDRESS.test(text)) return "";

  const parts: string[] = [];
  for (const raw of text.split(/[,;|]|\s+[-–]\s+/)) {
    let part = raw.replace(PINCODE, "").replace(/\bpin(?:\s*code)?\s*[:-]?\s*$/i, "").trim();
    // "D.No 12-3-45 Main Road" → "Main Road": a door number glued to the street is cut off it.
    part = part.replace(/^(?:d\.?\s*no|h\.?\s*no|door\s*no|plot\s*no|flat\s*no|shop\s*no|house\s*no|#)\.?\s*[:-]?\s*[\d\-/.]+[a-z]?\b\s*/i, "").trim();
    part = part.replace(/^[.\-–:\s]+|[.\-–:\s]+$/g, "");
    if (!part || DOOR_NUMBER.test(part) || NUMBER_ONLY.test(part) || REGION.test(part) || DISTRICT.test(part) || FLOOR.test(part)) continue;
    for (const [pattern, said] of EXPANSIONS) part = part.replace(pattern, said);
    if (!parts.some((p) => p.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  if (parts.length === 0) return "";

  /*
    Keep the town (the last part), then what a person gives directions by: a landmark first
    ("opposite RTC Bus Stand"), then the area or road, then anything else — as much as fits — said in
    the order the address has them.
  */
  const town = parts[parts.length - 1];
  const rest = parts.slice(0, -1).map((part, order) => ({
    part, order, rank: LANDMARK.test(part) ? 0 : AREA.test(part) ? 1 : 2,
  }));
  const chosen = new Set<number>();
  let count = wordsOf(town).length;
  for (const { part, order } of [...rest].sort((a, b) => a.rank - b.rank || a.order - b.order)) {
    const n = wordsOf(part).length;
    if (count + n > maxWords) continue;
    chosen.add(order);
    count += n;
  }
  const kept = rest.filter((r) => chosen.has(r.order)).map((r) => r.part);
  const spoken = [...kept, town].join(", ");
  return wordsOf(spoken).length > maxWords && kept.length === 0 ? wordsOf(town).slice(0, maxWords).join(" ") : spoken;
}

/** The meaningful words of a spoken address — what a check looks for in the closing line. */
function keyWords(address: string): string[] {
  return wordsOf(address.replace(/[,.!?;:()"'“”‘’]/g, " "))
    .filter((w) => w.length >= 2 && !/^(?:opposite|near|behind|the|of|and|to|at)$/i.test(w));
}

/**
 * Whether a closing line says the address: at least 60% of its meaningful words are there, each
 * matched by its stem so a case ending ("కాకినాడలో", "Kakinada's") still counts.
 */
export function saysAddress(line: string, address: string): boolean {
  const words = keyWords(address);
  if (words.length === 0) return true;
  const haystack = line.toLowerCase();
  const found = words.filter((w) => {
    const stem = w.toLowerCase().slice(0, Math.max(2, w.length - 2));
    return haystack.includes(stem);
  }).length;
  return found / words.length >= 0.6;
}

/** The issue a validator raises when the closing clip leaves the address out. */
export function missingAddressIssue(clipNumber: number, line: string, address: string): string | null {
  if (!address.trim() || saysAddress(line, address)) return null;
  return `Clip ${clipNumber} must say the business address "${address}" as part of the call to action — it is missing. `
    + `Say it exactly in those words, keep the clip inside its word count, and keep everything else that works.`;
}

/**
 * Words that only an address uses. When the client gave NO address, a line carrying one of these is
 * an invented address. Matched as whole words; a word that is part of the business's own name or its
 * town (passed in `own`) is never flagged — "Karimnagar" is a town, not an invented street.
 */
const ADDRESS_WORDS = new Set([
  "road", "street", "colony", "layout", "opposite", "pincode", "lane", "cross", "junction",
  "రోడ్డు", "రోడ్", "రోడ్డులో", "రోడ్లో", "రోడ్‌లో", "కాలనీ", "కాలనీలో", "వీధి", "వీధిలో", "ఎదురుగా", "పిన్‌కోడ్", "జంక్షన్",
]);

export function inventedAddressIssue(clipNumber: number, line: string, own: string[] = []): string | null {
  const ownWords = new Set(own.flatMap((o) => wordsOf(o.toLowerCase().replace(/[,.!?;:]/g, " "))));
  const hit = wordsOf(line.toLowerCase().replace(/[,.!?;:()"'“”‘’]/g, " "))
    .find((w) => ADDRESS_WORDS.has(w) && !ownWords.has(w));
  return hit
    ? `Clip ${clipNumber} speaks an address ("${hit}") but the client gave none — never invent a road, street, colony or landmark. Remove it and say something true about the business instead.`
    : null;
}
