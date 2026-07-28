/**
 * The name of the town, village or city a business is in.
 *
 * Local ads sell on proximity: "the shop in OUR village" is the whole reason a viewer stops. So the
 * cartoon duo has to SAY where they are — "we have come today to <place>, to <business>" — and that
 * means the place has to be pulled out of the business profile as its own value rather than left
 * buried inside a postal address the script writer may or may not notice.
 *
 * Extraction asks for the place explicitly (see EXTRACTION_SYSTEM_PROMPT). This falls back to
 * reading it out of the address for profiles captured before that field existed, and for visiting
 * cards that only ever print a full address.
 *
 * NEVER guesses. A wrong village name in an ad is worse than no village name at all, so anything
 * that cannot be resolved confidently returns "" and the script simply doesn't mention a place.
 */

/** Values the extractor writes when it found nothing. Treated as absent. */
const NOT_PROVIDED = /^(not\s*provided|n\/?a|none|nil|-+)$/i;

/** Keys that hold the place itself, most specific first. */
const PLACE_KEYS = ["village", "town", "city", "locality", "area", "place", "district"];

/**
 * Address tail noise. An Indian address ends "…, Nizamabad, Telangana - 503001, India", so the
 * state, the country and the pincode all sit AFTER the place and have to be dropped before the
 * last remaining segment can be trusted to be the place.
 */
const INDIAN_STATES = [
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat",
  "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh",
  "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "orissa", "punjab",
  "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
  "west bengal", "delhi", "new delhi", "puducherry", "pondicherry", "chandigarh", "jammu",
  "kashmir", "jammu and kashmir", "ladakh", "andaman and nicobar islands", "lakshadweep",
  "dadra and nagar haveli", "daman and diu", "india", "bharat",
];

/** Segments that are a street line, not a place: door numbers, floors, landmarks. */
const STREET_WORDS =
  /\b(road|rd|street|st|lane|cross|main|opp|opposite|near|beside|behind|floor|plot|door|shop|no|number|building|complex|apartment|apt|block|sector|phase|circle|highway|bypass|market|bazaar|bus\s*stand|railway)\b/i;

const clean = (value: string): string =>
  value.replace(/\s+/g, " ").replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, "").trim();

const isNoise = (segment: string): boolean => {
  const lower = clean(segment).toLowerCase();
  if (!lower) return true;
  if (INDIAN_STATES.includes(lower)) return true;
  // A pincode, a door number, or anything that is mostly digits.
  if (/^\d[\d\s-]*$/.test(lower)) return true;
  if (/^(pin|pincode|pin\s*code)\b/.test(lower)) return true;
  return false;
};

/**
 * A place name a person would recognise: a word or two, letters only.
 *
 * The guard matters because the fallback path is guessing at structure. "Gandhi Chowk, 2nd Floor"
 * is not a village, and putting it in a voice-over would be worse than saying nothing.
 */
const looksLikePlace = (segment: string): boolean => {
  const value = clean(segment);
  if (value.length < 3 || value.length > 40) return false;
  if (STREET_WORDS.test(value)) return false;
  if (/\d/.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length <= 3;
};

/** Strips a trailing "Dist"/"Mandal"/"Village" qualifier: "Bodhan Mandal" → "Bodhan". */
const stripQualifier = (value: string): string =>
  clean(value.replace(/\b(dist|district|mandal|taluk|taluka|tehsil|village|town|city|post|po)\.?\b/gi, ""));

/** Reads the place out of a full postal address, or "" when it cannot be told confidently. */
export function placeFromAddress(address: string): string {
  if (!address || NOT_PROVIDED.test(address.trim())) return "";

  const segments = address
    .split(/[,\n|]+/)
    .map(clean)
    .filter(Boolean);
  if (segments.length === 0) return "";

  // A segment that names itself — "Bodhan Mandal", "Nizamabad Dist" — is the place, wherever it sits.
  for (const segment of segments) {
    if (/\b(mandal|village|dist|district|taluk|taluka|tehsil)\b/i.test(segment)) {
      const named = stripQualifier(segment);
      if (looksLikePlace(named)) return named;
    }
  }

  // Otherwise the place is the last real segment before the state / pincode / country tail.
  const meaningful = segments.filter((s) => !isNoise(s));
  for (let i = meaningful.length - 1; i >= 0; i--) {
    const candidate = stripQualifier(meaningful[i]);
    if (looksLikePlace(candidate)) return candidate;
  }
  return "";
}

/**
 * The place this business is in, from anywhere in the extracted profile.
 *
 * Prefers a field that says outright which town it is; falls back to the address. Returns "" when
 * nothing is known, which the prompts read as "do not mention a place".
 */
export function resolvePlaceName(info: unknown): string {
  if (!info || typeof info !== "object") return "";

  let fromKey = "";
  let address = "";

  const visit = (node: unknown, depth: number): void => {
    if (fromKey || node == null || depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (typeof node !== "object") return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === "string") {
        const text = clean(value);
        if (!text || NOT_PROVIDED.test(text)) continue;
        const lowerKey = key.toLowerCase();
        if (!fromKey && PLACE_KEYS.some((k) => lowerKey.includes(k)) && looksLikePlace(stripQualifier(text))) {
          fromKey = stripQualifier(text);
        }
        if (!address && lowerKey.includes("address")) address = text;
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (value && typeof value === "object") visit(value, depth + 1);
      if (fromKey) return;
    }
  };

  visit(info, 0);
  return fromKey || placeFromAddress(address);
}
