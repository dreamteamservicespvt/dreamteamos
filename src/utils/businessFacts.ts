/**
 * The business's contact facts — its phone numbers and its address — as the member actually gave them.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 * Every contact number and address in a finished kit — the Video Bottom Label's pills, the poster's
 * contact line, the poster concepts — used to come from ONE place: the JSON the extraction model
 * wrote after reading the member's text and files. Nothing checked that JSON against what the member
 * had actually supplied, so the ad printed whatever the model wrote:
 *
 *  - a number that was never given ("98765 43210", a "+91" completed from nothing),
 *  - a typed number with a digit changed — the model re-typing it, or misreading a card,
 *  - an address that was never given: the town the model assumed, a street it composed,
 *  - a "WhatsApp" pill because the JSON merely had a "whatsapp" KEY, set to "Not provided".
 *
 * The prompts forbade all of it in capitals. A rule the model is asked to follow is not a guarantee;
 * a rule the code applies is. So:
 *
 *  1. What the member TYPED (BUSINESS CONTENT, the job's brief, a text file, the voice note's words)
 *     is ground truth, digit for digit and word for word.
 *  2. What the model says it READ is kept only when there was something to read it from — a visiting
 *     card, a flyer, a photo of the premises — and it is a real, well-formed number rather than a
 *     placeholder. A model "reading" of a number the member typed differently is a misreading, and the
 *     typed one wins. With no such file, the model had nothing to read: it is dropped.
 *  3. The business profile every later prompt reads is rewritten to carry ONLY those verified facts
 *     (sanitizeBusinessProfile), so no prompt ever sees an invented number or address to copy.
 *  4. What comes back from a model is scrubbed of any number that is not one of them
 *     (stripUnverifiedNumbers) — the last line, not the first.
 *
 * Kept pure: this decides what is printed on a client's ad, so every rule is unit-tested.
 */

export type FactSource = "typed" | "document";

export interface PhoneFact {
  /** As it will be printed — the member's own formatting, spacing tidied. */
  display: string;
  /** How two spellings of the same number are recognised: the last ten digits, or all of a shorter one. */
  key: string;
  source: FactSource;
  /** Said to be a WhatsApp number where it was given. */
  whatsapp: boolean;
}

export interface BusinessFacts {
  /** Verified numbers, typed ones first, no duplicates. Layouts use up to three. */
  phones: PhoneFact[];
  /** The verified address, or "" — in which case no address appears anywhere. */
  address: string;
  addressSource: FactSource | "";
  /** What the model reported and was not used, with why — for the console and the tests. */
  rejected: { value: string; reason: string }[];
}

export interface FactInputs {
  /** Everything the member typed or said: BUSINESS CONTENT, text files, the voice note's transcript. */
  typedText: string;
  /** The job's own address field, when there is one. */
  typedAddress?: string | null;
  /** The extraction model's business profile. */
  profile: unknown;
  /**
   * A file the business's contact details could genuinely be read from: a visiting card, a flyer or
   * poster, a photograph of the premises (a signboard). Product photos do not count — a number on a
   * packet is the manufacturer's, not the shop's.
   */
  hasContactDocuments: boolean;
}

// ── numbers ──────────────────────────────────────────────────────────────────────────────────────

/**
 * A run that could be a phone number: digits with spaces, dashes, dots or brackets between them — on
 * ONE line (a newline would join a number to whatever the next line starts with).
 */
const PHONE_RUN = /\+?\(?\d[\d \t\-().]{5,}\d\)?/g;
/** Dates, years and year ranges have the digits of a phone number and are never one. */
const DATE_LIKE = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;
const YEAR_RANGE = /^(?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2}$/;

export const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Two spellings of one number share this. */
export function phoneKey(digits: string): string {
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * A number nobody's business actually has — what a model writes when it has none to write, and what a
 * template left in the text. Same digit throughout, a counting run, or one of the classic examples.
 */
export function isPlaceholderNumber(raw: string): boolean {
  const key = phoneKey(digitsOf(raw));
  if (key.length < 8) return true;
  if (/^(\d)\1+$/.test(key)) return true;
  if (/(\d)\1{6,}/.test(key)) return true;
  const ascending = "01234567890123456789";
  const descending = "98765432109876543210";
  if (ascending.includes(key) || descending.includes(key)) return true;
  return ["9876543210", "9876543211", "9123456789", "9012345678", "9000000000", "1234567890", "9999900000"].includes(key);
}

/**
 * A real, well-formed number: an Indian mobile (6–9 then nine digits), a landline with its STD code,
 * a toll-free number, or an international number written with its country code.
 */
export function isWellFormedNumber(raw: string): boolean {
  const trimmed = raw.trim();
  const d = digitsOf(trimmed);
  let local = d;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0") && /^[6-9]/.test(local.slice(1))) local = local.slice(1);
  if (local.length === 10 && /^[6-9]/.test(local)) return true;               // mobile
  if (/^0\d{9,11}$/.test(d)) return true;                                    // landline with STD code
  if (/^1[89]00\d{6,8}$/.test(d)) return true;                               // toll-free
  if (/^1860\d{7}$/.test(d)) return true;
  if (trimmed.startsWith("+") && d.length >= 10 && d.length <= 15 && !d.startsWith("91")) return true; // abroad
  if (d.length === 8 && /^[2-9]/.test(d)) return true;                       // a city landline without its code
  return false;
}

/** Tidy a number for printing without changing a single digit. */
function tidy(value: string): string {
  let v = value.replace(/\s+/g, " ").replace(/[\s,;.\-–]+$/, "").trim();
  // A bracket with no partner is punctuation the run picked up, not part of the number.
  if (v.startsWith("(") && !v.includes(")")) v = v.slice(1).trim();
  if (v.endsWith(")") && !v.includes("(")) v = v.slice(0, -1).trim();
  return v;
}

/**
 * A run holding more than one number — "98480 12345 99887 76655", two mobiles with only a space
 * between them — split back into its numbers. Tokens are gathered until they make a whole number.
 */
function splitRun(display: string): string[] {
  const d = digitsOf(display);
  if (d.length <= 13) return [display];
  const tokens = display.split(/\s+|(?<=\d)[-–](?=\s*\d{4,})/).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const token of tokens) {
    current = current ? `${current} ${token}` : token;
    const cd = digitsOf(current);
    const whole = (cd.length === 10 && /^[6-9]/.test(cd)) || (cd.length === 11 && cd.startsWith("0"))
      || (cd.length === 12 && cd.startsWith("91")) || cd.length >= 13;
    if (whole) { out.push(current); current = ""; }
  }
  if (current && digitsOf(current).length >= 8) out.push(current);
  return out.length ? out : [display];
}

/** The phone numbers written in a piece of text, in order, as written. */
export function findPhoneNumbers(text: string): { display: string; key: string; whatsapp: boolean }[] {
  const out: { display: string; key: string; whatsapp: boolean }[] = [];
  if (!text) return out;
  for (const match of text.matchAll(PHONE_RUN)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
    const whatsapp = /whats\s*app|\bwa\b|వాట్సా?ప్/i.test(before.split(/[\n.;|]/).pop() || "");
    for (const part of splitRun(tidy(match[0]))) {
      const display = tidy(part);
      const d = digitsOf(display);
      if (d.length < 8 || d.length > 15) continue;
      if (DATE_LIKE.test(display) || YEAR_RANGE.test(display)) continue;
      const key = phoneKey(d);
      if (out.some((p) => p.key === key)) continue;
      out.push({ display, key, whatsapp });
    }
  }
  return out;
}

/** Two keys that are one misread apart: a digit or two changed, or two neighbours swapped. */
export function isMisreadOf(a: string, b: string): boolean {
  if (a === b || a.length !== b.length) return false;
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);
  if (diffs.length <= 2 && diffs.length > 0) return true;
  return false;
}

// ── the profile ──────────────────────────────────────────────────────────────────────────────────

/** A key whose value is a way to reach the business. `number` alone, never "numberOfYears". */
const CONTACT_KEY = /(phone|mobile|contact|whats\s*app|landline|telephone|^tel$|^tel[_\s-]|cell|helpline|toll[\s_-]?free|^call)/i;
const isContactKey = (key: string) => (CONTACT_KEY.test(key) || /^(?:phone\s*)?numbers?$/i.test(key.trim())) && !/e-?mail/i.test(key);
const isAddressKey = (key: string) => /address|addr\b|^location$|^full\s*location$/i.test(key) && !/e-?mail|web|url|\bip\b/i.test(key);
const PLACE_KEY = /^(?:city|town|village|locality|area|place|district|state|pin\s*code|pincode|pin)(?:\s*\/.*)?$|city|town|village|locality/i;
const isEmailKey = (key: string) => /e-?mail/i.test(key);
const isWebKey = (key: string) => /website|web\s*site|url|instagram|facebook|youtube|social|handle/i.test(key);
const EMPTY_VALUE = /^(?:not\s*(?:provided|available|mentioned|given|specified)|n\/?a|na|none|nil|null|unknown|-+|—|\.+)$/i;

/** Every number the profile holds under a contact key, as written there, and whether it was a WhatsApp one. */
export function numbersInProfileDetailed(profile: unknown): { display: string; whatsapp: boolean }[] {
  const found: { display: string; whatsapp: boolean }[] = [];
  const visit = (node: unknown, depth: number, underContact: boolean, whatsapp: boolean) => {
    if (node == null || depth > 7) return;
    if (typeof node === "string") {
      if (underContact && !EMPTY_VALUE.test(node.trim())) {
        for (const p of findPhoneNumbers(node)) {
          if (!found.some((f) => phoneKey(digitsOf(f.display)) === p.key)) found.push({ display: p.display, whatsapp: whatsapp || p.whatsapp });
        }
      }
      return;
    }
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1, underContact, whatsapp)); return; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        visit(v, depth + 1, underContact || isContactKey(k), whatsapp || /whats\s*app/i.test(k));
      }
    }
  };
  visit(profile, 0, false, false);
  return found;
}

export const numbersInProfile = (profile: unknown): string[] => numbersInProfileDetailed(profile).map((n) => n.display);

/** The first address the profile holds, unless it is empty or a stand-in. */
export function addressInProfile(profile: unknown): string {
  let result = "";
  const visit = (node: unknown, depth: number) => {
    if (result || node == null || depth > 7 || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "string" && isAddressKey(k) && v.trim() && !EMPTY_VALUE.test(v.trim())) { result = v.trim(); return; }
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      if (v && typeof v === "object") visit(v, depth + 1);
      if (result) return;
    }
  };
  visit(profile, 0);
  return result;
}

/** The labelled address line a member typed: "Address: …", "Addr - …", "చిరునామా: …", "Location: …". */
export function addressInText(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const label = /^\s*(?:[*•\-–]\s*)?(?:full\s+)?(?:address|addr\.?|shop\s+address|office\s+address|location|చిరునామా|అడ్రస్)\s*[:\-–]\s*/i;
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const rest = lines[i].slice(m[0].length).trim();
    if (rest && !EMPTY_VALUE.test(rest)) return rest;
    // "Address:" on its own line, the address on the next.
    const next = lines[i + 1]?.trim();
    if (!rest && next && !EMPTY_VALUE.test(next) && !/:\s*$/.test(next)) return next;
  }
  return "";
}

const STAND_IN_ADDRESS = /\b(?:your|business|shop|company)\s+address\b|address\s+here|\b123\b.*\b(?:main|street|road)\b|\bxyz\b|\babc\s+(?:street|road|nagar)\b|\bsample\b|\blorem\b|\[.*\]/i;
const ADDRESS_SIGNAL = /\d|\b(?:road|rd|street|st|nagar|colony|lane|cross|main|opp|opposite|near|beside|behind|floor|plot|door|d\.?\s?no|h\.?\s?no|pin|pincode|dist|district|mandal|village|town|city|highway|circle|sector|block|phase|market|complex|building|junction|centre|center|bazar|bazaar|gali|peta|pet|palem|puram|pally|palli|guda|pet)\b/i;

const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3);

/** Share of an address's words that also appear in the typed text. */
export function coveredBy(value: string, text: string): number {
  const w = words(value);
  if (w.length === 0) return 0;
  const bag = new Set(words(text));
  return w.filter((x) => bag.has(x)).length / w.length;
}

// ── the decision ─────────────────────────────────────────────────────────────────────────────────

export function verifyBusinessFacts(input: FactInputs): BusinessFacts {
  const rejected: BusinessFacts["rejected"] = [];
  const phones: PhoneFact[] = [];

  // 1 · typed — ground truth, apart from an obvious stand-in left in a template
  for (const p of findPhoneNumbers(input.typedText)) {
    if (isPlaceholderNumber(p.display)) { rejected.push({ value: p.display, reason: "a placeholder number" }); continue; }
    phones.push({ display: p.display, key: p.key, source: "typed", whatsapp: p.whatsapp });
  }

  // 2 · what the model says it read
  for (const { display: raw, whatsapp } of numbersInProfileDetailed(input.profile)) {
    const display = tidy(raw);
    const key = phoneKey(digitsOf(display));
    if (phones.some((p) => p.key === key)) continue;
    if (isPlaceholderNumber(display)) { rejected.push({ value: display, reason: "a placeholder number" }); continue; }
    const typedTwin = phones.find((p) => p.source === "typed" && isMisreadOf(p.key, key));
    if (typedTwin) { rejected.push({ value: display, reason: `a misreading of the typed ${typedTwin.display}` }); continue; }
    if (!input.hasContactDocuments) { rejected.push({ value: display, reason: "not in the text given, and no card, flyer or premises photo to read it from" }); continue; }
    if (!isWellFormedNumber(display)) { rejected.push({ value: display, reason: "not a well-formed phone number" }); continue; }
    phones.push({ display, key, source: "document", whatsapp });
  }

  // 3 · the address
  let address = "";
  let addressSource: BusinessFacts["addressSource"] = "";
  const typedAddress = input.typedAddress?.trim() || addressInText(input.typedText);
  if (typedAddress && !EMPTY_VALUE.test(typedAddress) && !STAND_IN_ADDRESS.test(typedAddress)) {
    address = typedAddress;
    addressSource = "typed";
  } else {
    const read = addressInProfile(input.profile);
    if (read) {
      const reason = STAND_IN_ADDRESS.test(read)
        ? "a stand-in address"
        : !ADDRESS_SIGNAL.test(read) && coveredBy(read, input.typedText) < 1
          ? "not an address — no street, area, number or pincode in it"
          : !input.hasContactDocuments && coveredBy(read, input.typedText) < 0.6
            ? "not in the text given, and no card, flyer or premises photo to read it from"
            : "";
      if (reason) rejected.push({ value: read, reason });
      else { address = read; addressSource = "document"; }
    }
  }

  return { phones, address, addressSource, rejected };
}

/** The numbers a layout places: up to three, typed first. */
export const layoutPhones = (facts: BusinessFacts, max = 3) => facts.phones.slice(0, max);

/**
 * The profile every later prompt reads, carrying only verified contact facts.
 *
 * Contact numbers, addresses and every "Not provided" are taken out wherever the model put them, and
 * the verified ones are put back under plain keys (`contactNumbers`, `whatsappNumber`, `address`). A
 * town, email or website stays only when the member gave it or a card/flyer/photo could show it. A
 * number sitting in any other field — "Call 9xxxx for offers" in a tagline — is removed unless verified.
 */
export function sanitizeBusinessProfile(profile: unknown, facts: BusinessFacts, input: Pick<FactInputs, "typedText" | "hasContactDocuments">): Record<string, unknown> {
  const base = profile && typeof profile === "object" && !Array.isArray(profile)
    ? JSON.parse(JSON.stringify(profile)) as Record<string, unknown>
    : { raw: profile ?? "" };
  const allowed = new Set(facts.phones.map((p) => p.key));
  const typedLower = input.typedText.toLowerCase();
  const reference = `${input.typedText}\n${facts.address}`.toLowerCase();

  const keepPlace = (value: string) => input.hasContactDocuments || reference.includes(value.toLowerCase().trim());
  const keepOnline = (value: string) => input.hasContactDocuments || typedLower.includes(value.toLowerCase().trim());

  const clean = (node: unknown, depth: number): unknown => {
    if (depth > 8) return node;
    if (typeof node === "string") return stripUnverifiedNumbers(node, [...allowed]);
    if (Array.isArray(node)) return node.map((n) => clean(n, depth + 1)).filter((n) => !(typeof n === "string" && (!n.trim() || EMPTY_VALUE.test(n.trim()))));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (typeof v === "string" && (!v.trim() || EMPTY_VALUE.test(v.trim()))) continue;
        if (isContactKey(k) || isAddressKey(k)) continue;
        if (typeof v === "string" && PLACE_KEY.test(k) && !keepPlace(v)) continue;
        if (typeof v === "string" && (isEmailKey(k) || isWebKey(k)) && !keepOnline(v)) continue;
        const cleaned = clean(v, depth + 1);
        if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
        if (Array.isArray(cleaned) && cleaned.length === 0) continue;
        out[k] = cleaned;
      }
      return out;
    }
    return node;
  };

  const cleaned = clean(base, 0) as Record<string, unknown>;
  const whatsapp = facts.phones.find((p) => p.whatsapp);
  return {
    ...cleaned,
    ...(facts.phones.length ? { contactNumbers: facts.phones.map((p) => p.display) } : {}),
    ...(whatsapp ? { whatsappNumber: whatsapp.display } : {}),
    ...(facts.address ? { address: facts.address } : {}),
  };
}

/**
 * Removes every phone-like number (8–15 digits) that is not one of the verified ones, with the
 * "Call:" / "📞" it leaves hanging. Shorter digit runs — pincodes, door numbers, years, prices, pixel
 * sizes — are never touched.
 */
export function stripUnverifiedNumbers(text: string, allowedKeys: string[]): string {
  if (!text) return text;
  const allowed = new Set(allowedKeys);
  let changed = false;
  const out = text.replace(PHONE_RUN, (match) => {
    return splitRun(tidy(match)).reduce((kept, part) => {
      const display = tidy(part);
      const d = digitsOf(display);
      // Pincodes, prices, door numbers, years and pixel sizes are never a phone number.
      const phoneLike = d.length >= 10 || isWellFormedNumber(display) || isPlaceholderNumber(display) && d.length >= 8;
      if (d.length < 8 || d.length > 15 || !phoneLike || DATE_LIKE.test(display) || YEAR_RANGE.test(display)) return kept;
      if (allowed.has(phoneKey(d))) return kept;
      changed = true;
      return kept.replace(part, "");
    }, match);
  });
  if (!changed) return text;
  return out
    // The label a removed number leaves behind, when nothing follows it on its line.
    .replace(/(?:📞|☎️?|📱)\s*(?=[\n,;|]|$)/gm, "")
    .replace(/\b(?:call(?:\s+us|\s+now)?|ph|phone|mobile|mob|contact(?:\s+no\.?|\s+number)?|whatsapp|tel)\s*[:\-–]\s*(?=[\n,;|]|$)/gim, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;])/g, "$1")
    .replace(/(?:[ \t]*[|,/][ \t]*){2,}/g, " | ")
    .trim();
}

/** The verified numbers' keys, for stripUnverifiedNumbers. */
export const verifiedKeys = (facts: BusinessFacts) => facts.phones.map((p) => p.key);

/**
 * The verified facts back out of a SANITIZED profile — for everything that only has the profile to
 * hand (a refine, a regenerated section, a saved kit reopened). A sanitized profile carries exactly
 * the verified facts under `contactNumbers` / `whatsappNumber` / `address`.
 */
export function factsFromProfile(profile: unknown): BusinessFacts {
  const p = (profile && typeof profile === "object" ? profile : {}) as Record<string, unknown>;
  const list = Array.isArray(p.contactNumbers) ? p.contactNumbers.filter((x): x is string => typeof x === "string") : numbersInProfile(p);
  const whatsapp = typeof p.whatsappNumber === "string" ? phoneKey(digitsOf(p.whatsappNumber)) : "";
  const phones: PhoneFact[] = [];
  for (const display of list) {
    const key = phoneKey(digitsOf(display));
    if (key.length < 8 || phones.some((x) => x.key === key) || isPlaceholderNumber(display)) continue;
    phones.push({ display: tidy(display), key, source: "document", whatsapp: key === whatsapp });
  }
  const address = typeof p.address === "string" && p.address.trim() && !EMPTY_VALUE.test(p.address.trim())
    ? p.address.trim()
    : addressInProfile(p);
  return { phones, address, addressSource: address ? "document" : "", rejected: [] };
}
