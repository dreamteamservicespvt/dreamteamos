/**
 * The business's address as it is SAID in an ad — and the check that the final clip said it.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 * The voice-over prompts only ever said "do not invent addresses", so an ad for a client who typed
 * "D.No 5-12, Main Road, near Clock Tower, Kakinada" never told anyone where to come. The address is
 * now spoken in the final clip whenever the business has a VERIFIED one (utils/businessFacts) — and
 * only then, so nothing is ever invented.
 *
 * An address is written for an envelope, not for a voice: a door number, a pincode, a state and a
 * country are noise in an eight-second clip (and they are on screen in the bottom label anyway). What
 * a listener needs is the street, the landmark and the town — "Main Road, near Clock Tower, Kakinada".
 *
 * Pure — no model calls. The parts are written in the ad's script by one small call in geminiService;
 * whether the final clip said them is checked here.
 */

/** A door, house, flat, plot, shop or survey number — with or without its digits. */
const UNIT_NUMBER = /^(?:d\.?\s*no|door\s*no|h\.?\s*no|house\s*no|flat(?:\s*no)?|plot(?:\s*no)?|shop(?:\s*no)?|s\.?\s*no|sy\.?\s*no|survey\s*no|door|no|#)\b[.:\s#-]*[\w/.-]*$/i;
/** A part that is only a number — "5-12", "12/4", "#21". */
const ONLY_NUMBER = /^[#\d\s/.,:-]+$/;
/** The state, the country and their abbreviations — never said aloud in a local ad. */
const STATE_OR_COUNTRY = /^(?:andhra\s*pradesh|a\.?\s*p\.?|telangana|t\.?\s*s\.?|tamil\s*nadu|karnataka|kerala|odisha|india|bharat)$/i;
/** A district or mandal tag — dropped when the place itself is already named. */
const ADMIN_TAG = /\b(?:dist(?:rict)?|mandal|tq|taluk|tehsil)\b\.?/i;

const tidy = (part: string): string => part
  // A pincode, wherever it sits: "Kakinada - 533001" → "Kakinada".
  .replace(/[-–\s]*\b\d{6}\b/g, "")
  // A door number in front of a street: "12-4 Main Road" → "Main Road".
  .replace(/^\s*(?:d\.?\s*no\.?|door\s*no\.?|h\.?\s*no\.?|#)?\s*\d+[\w/-]*\s+(?=[A-Za-z\u{0C00}-\u{0C7F}])/iu, "")
  .replace(/\s+/g, " ")
  .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
  .trim();

/**
 * The parts of an address worth saying, most specific first and the town last — at most three:
 * "D.No 5-12, Main Road, near Clock Tower, Gandhi Nagar, Kakinada - 533001, Andhra Pradesh" →
 * ["Main Road", "near Clock Tower", "Kakinada"]. [] when nothing speakable is left.
 */
export function addressPartsForSpeech(address: string | null | undefined): string[] {
  const raw = (address || "").split(/[,\n;]+/).map(tidy).filter(Boolean);
  const kept: string[] = [];
  for (const part of raw) {
    if (UNIT_NUMBER.test(part) || ONLY_NUMBER.test(part) || STATE_OR_COUNTRY.test(part)) continue;
    if (kept.some((k) => k.toLowerCase() === part.toLowerCase())) continue;
    kept.push(part);
  }
  // A district or mandal tag only adds words once the place itself is named.
  const places = kept.length >= 2 ? kept.filter((p) => !ADMIN_TAG.test(p)) : kept;
  const parts = places.length > 0 ? places : kept.map((p) => p.replace(ADMIN_TAG, "").trim()).filter(Boolean);
  if (parts.length <= 3) return parts;
  // The street and the landmark say WHERE in town; the last part says WHICH town.
  return [parts[0], parts[1], parts[parts.length - 1]];
}

/** One part of the address in the two spellings a script may carry it in. */
export interface AddressPart {
  /** As typed — "near Clock Tower". */
  latin: string;
  /** As spoken in the ad's own script — "క్లాక్ టవర్ దగ్గర". Same as `latin` for an English ad. */
  spoken: string;
}

/** The address, as one phrase to put in a prompt. */
export function spokenAddressPhrase(parts: AddressPart[]): string {
  return parts.map((p) => p.spoken || p.latin).filter(Boolean).join(", ");
}

/** For matching: lower case, no spaces, no joiners, no punctuation — "రోడ్‌లో" still contains "రోడ్". */
const squashed = (text: string): string => (text || "")
  .toLowerCase()
  .normalize("NFC")
  .replace(/[\s\u{200B}-\u{200D}\u{2060}.,;:!?'"()-]/gu, "");

/**
 * The parts of the address a line does NOT say, in their spoken form. A part counts as said when its
 * spoken or typed spelling appears anywhere in the text, with or without spaces and case endings —
 * "కాకినాడలో" says "కాకినాడ", "Main Road's" says "Main Road".
 */
export function missingAddressParts(text: string, parts: AddressPart[]): string[] {
  const haystack = squashed(text);
  return parts
    // A part with no known spoken spelling cannot be checked — a Telugu line never contains "Main Road".
    .filter((part) => !!part.spoken?.trim())
    .filter((part) => {
      const needles = [part.spoken, part.latin].map(squashed).filter(Boolean);
      return needles.length > 0 && !needles.some((n) => haystack.includes(n));
    })
    .map((part) => part.spoken || part.latin);
}

/** The repair instruction for a final clip that left part of the address out, or null when it said it all. */
export function addressIssue(clipNumber: number, text: string, parts: AddressPart[]): string | null {
  if (parts.length === 0) return null;
  const missing = missingAddressParts(text, parts);
  if (missing.length === 0) return null;
  return `Clip ${clipNumber} must say where the business is — the address "${spokenAddressPhrase(parts)}" — but it `
    + `leaves out ${missing.map((m) => `"${m}"`).join(", ")}. Put the address into the invitation, written exactly `
    + `as given, keeping the clip inside its word budget by shortening the rest of the line.`;
}
