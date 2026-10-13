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
 * ── One list, everywhere (owner, 2026-10-13: "fake, missing or duplicate numbers") ─────────────────
 * The audit that day found the numbers could still go wrong AFTER this file: a typed order id or bank
 * account ("Order ID 4521789632") was taken for a phone number because every 8–15-digit run was; a
 * "WhatsApp:" label marked the NEXT number too, and "Call: X, WhatsApp: X" lost it; "(+91) 98480 12345"
 * was printed "+91) 98480 12345"; and the label, the posters and the overlays each cut their own list.
 * Now a typed number counts only when it is shaped like a phone number or labelled as one, and never
 * when it is labelled as an account / id / registration number / price; the label nearest a number is
 * the one that describes it; the member's own spelling is kept; and the list is cut to three HERE
 * (MAX_CONTACT_NUMBERS), so `contactNumbersOf` is the single list every poster, label, overlay, frame
 * and refine prints — each number once (contactNumberProblems is the check the tests hold them to).
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

/**
 * The most numbers a business's contact list holds: the label has three pill sizes (one, two, three) and
 * a poster's contact line stays readable with three. A fourth number is reported, not printed.
 */
export const MAX_CONTACT_NUMBERS = 3;

export interface BusinessFacts {
  /** Verified numbers, typed ones first, no duplicates, at most MAX_CONTACT_NUMBERS. */
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
 * ONE line (a newline would join a number to whatever the next line starts with). A bracket may open
 * before the "+" too: "(+91) 98480 12345" used to be read from its "+", and printed "+91) 98480 12345".
 */
const PHONE_RUN = /\(?\+?\(?\d[\d \t\-().]{5,}\d\)?/g;
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
 * a toll-free number, or an international number written with its country code — and, unless
 * `allowShortLandline` is false, an 8-digit city landline written without its code. Eight bare digits
 * are also how an amount or an id looks, so a TYPED one counts only when it is labelled a phone.
 */
export function isWellFormedNumber(raw: string, opts: { allowShortLandline?: boolean } = {}): boolean {
  const trimmed = raw.trim();
  const d = digitsOf(trimmed);
  let local = d;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0") && /^[6-9]/.test(local.slice(1))) local = local.slice(1);
  if (local.length === 10 && /^[6-9]/.test(local)) return true;               // mobile
  if (/^0\d{9,11}$/.test(d)) return true;                                    // landline with STD code
  if (/^1[89]00\d{6,8}$/.test(d)) return true;                               // toll-free
  if (/^1860\d{7}$/.test(d)) return true;
  if (/^\(?\+/.test(trimmed) && d.length >= 10 && d.length <= 15 && !d.startsWith("91")) return true; // abroad
  if (opts.allowShortLandline !== false && d.length === 8 && /^[2-9]/.test(d)) return true; // a city landline without its code
  return false;
}

/**
 * Brackets with no partner removed — punctuation the run picked up, not part of the number. "(+91) 98480
 * 12345" keeps both of its own; "98480 12345)" from "(Call 98480 12345)" loses the stray one.
 */
function balanceBrackets(value: string): string {
  const drop = new Set<number>();
  const open: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") open.push(i);
    else if (value[i] === ")") { if (open.length) open.pop(); else drop.add(i); }
  }
  open.forEach((i) => drop.add(i));
  return drop.size ? [...value].filter((_, i) => !drop.has(i)).join("").replace(/\s{2,}/g, " ").trim() : value;
}

/** Tidy a number for printing without changing a single digit. */
function tidy(value: string): string {
  return balanceBrackets(value.replace(/\s+/g, " ").replace(/[\s,;.\-–]+$/, "").trim()).replace(/^[\s,;.\-–]+/, "");
}

/** Where a run holding several numbers may be cut: a space, or a dash with four or more digits after it. */
const SPLIT_POINT = /\s+|(?<=\d)[-–](?=\s*\d{4,})/g;

/**
 * A run holding more than one number — "98480 12345 99887 76655", two mobiles with only a space
 * between them — split back into its numbers. Tokens are gathered until they make a whole number.
 * Each part is a SLICE of the run, so it keeps the member's own separators ("0884-2345678" used to come
 * back as "0884 2345678") and the scrubber can find it in the text to remove it.
 */
function splitRun(run: string): string[] {
  if (digitsOf(run).length <= 13) return [run];
  const tokens: { start: number; end: number }[] = [];
  let last = 0;
  for (const m of run.matchAll(SPLIT_POINT)) {
    const at = m.index ?? 0;
    if (at > last) tokens.push({ start: last, end: at });
    last = at + m[0].length;
  }
  if (last < run.length) tokens.push({ start: last, end: run.length });
  const out: string[] = [];
  let from = -1;
  for (const token of tokens) {
    if (from < 0) from = token.start;
    const cd = digitsOf(run.slice(from, token.end));
    const whole = (cd.length === 10 && /^[6-9]/.test(cd)) || (cd.length === 11 && cd.startsWith("0"))
      || (cd.length === 12 && cd.startsWith("91")) || cd.length >= 13;
    if (whole) { out.push(run.slice(from, token.end)); from = -1; }
  }
  if (from >= 0 && digitsOf(run.slice(from)).length >= 8) out.push(run.slice(from));
  return out.length ? out : [run];
}

/** A digit run long enough, and shaped enough, to be a phone number — never a pincode, price, year or date. */
function isPhoneLike(display: string): boolean {
  const d = digitsOf(display);
  if (d.length < 8 || d.length > 15 || DATE_LIKE.test(display) || YEAR_RANGE.test(display)) return false;
  return d.length >= 10 || isWellFormedNumber(display) || (isPlaceholderNumber(display) && d.length >= 8);
}

// ── what the words before a number call it ───────────────────────────────────────────────────────

/** How the words just before a number describe it: a way to reach the business, something else, or nothing. */
export type NumberLabel = "contact" | "other" | "";

/** A word that calls the number after it a way to reach the business — anywhere in its label. */
const CONTACT_LABEL = /(?:^|[^\p{L}])(?:ph|phone|phones|mob|mobile|mobiles|cell|call|calls|contact|contacts|tel|telephone|landline|helpline|hotline|whats\s*app|wa|toll[\s-]*free|dial|reach|enquir(?:y|ies)|inquir(?:y|ies)|bookings?|reservations?|appointments?|office|shop|store|showroom|branch|emergency|ambulance|customer\s*care|support|numbers?)(?![\p{L}])|📞|☎|📱|ఫోన్|మొబైల్|కాల్|సంప్రదించ|వాట్సా?ప్|फ़?फोन|मोबाइल|नंबर/iu;
/**
 * A word that makes the number RIGHT after it something other than a phone number — an account, an id,
 * a registration or a price ("Bank A/c No: 50100234567812", "Order ID 4521789632", "Rs. 35000000").
 * It must sit immediately before the number: "Email ID: a@b.com, 9848012345" is still a phone number.
 */
const OTHER_LABEL = /(?:(?:^|[^\p{L}])(?:a\/?c|acc|acct|account|ifsc|gst|gstin|pan|aadh?aa?r|uid|uan|reg|regd|registration|licen[cs]e|lic|fssai|cin|tin|vat|udyam|msme|order|invoice|inv|bill|receipt|ref|reference|txn|transaction|utr|upi|serial|sl|s\.?\s?no|id|emp|employee|roll|survey|plot|door|flat|h\.?\s?no|d\.?\s?no|pin|pin\s*code|pincode|zip|rs|inr|mrp|price|cost|amount|fees?|salary|turnover|imei|chassis|policy|folio|otp)\.?\s*(?:no\.?|number|num|#|id)?|₹)\s*[:.#=\-–—]*\s*$/iu;
const WHATSAPP_LABEL = /whats\s*app|(?:^|[^\p{L}])wa(?![\p{L}])|వాట్సా?ప్/iu;
/**
 * "(WhatsApp)", "- WhatsApp only" written just AFTER a number — it belongs to that number, not the next.
 * Followed by a number of its own ("98480 12345 WhatsApp: 99887 76655") it is that number's label instead.
 */
const WHATSAPP_AFTER = /^\s*[([]?\s*[-–:]?\s*(?:whats\s*app|wa|వాట్సా?ప్)(?:\s+only)?\s*[)\]]?(?!\s*[:\-–]?\s*[+(]?\d)/iu;

/**
 * The words that label the number starting at `to`: what was written since the number before it (at most
 * 40 characters), on its own line — or, when the line holds nothing but the number, the line above if it
 * ends in a colon ("Contact:\n98480 12345"). A finished sentence before it is not its label ("WhatsApp us
 * today. Call 98480 12345"); an abbreviation's full stop is ("Ph. No. 23456789").
 */
function labelZone(text: string, from: number, to: number): string {
  const lines = text.slice(Math.max(from, to - 40), to).split(/\r?\n/);
  let line = lines.pop() ?? "";
  if (!/\p{L}/u.test(line) && lines.length && /[:\u{FF1A}]\s*$/u.test(lines[lines.length - 1])) line = `${lines[lines.length - 1]} ${line}`;
  return line.split(/[;|]|(?<=\p{L}{4,})[.!?]\s+(?=\p{Lu})/u).pop() ?? "";
}

const labelOf = (zone: string): NumberLabel => (OTHER_LABEL.test(zone) ? "other" : CONTACT_LABEL.test(zone) ? "contact" : "");

export interface FoundNumber {
  /** As written, spacing tidied. */
  display: string;
  key: string;
  whatsapp: boolean;
  /** What the words before it call it — "other" for an account, id, registration number or price. */
  label: NumberLabel;
}

/**
 * The phone numbers written in a piece of text, in order, as written, each once. A number written twice
 * is one number — a WhatsApp label on either copy makes it a WhatsApp number, and a contact label on
 * either makes it a contact. A number glued to "@" is an email or a UPI id, not a number to call.
 */
export function findPhoneNumbers(text: string): FoundNumber[] {
  const out: FoundNumber[] = [];
  if (!text) return out;
  let previousEnd = 0;
  for (const match of text.matchAll(PHONE_RUN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const zone = labelZone(text, previousEnd, start);
    const after = WHATSAPP_AFTER.exec(text.slice(end, end + 30));
    previousEnd = end + (after ? after[0].length : 0);
    if (text[end] === "@") continue;
    const whatsapp = WHATSAPP_LABEL.test(zone) || !!after;
    const label = labelOf(zone);
    for (const part of splitRun(match[0])) {
      const display = tidy(part);
      const d = digitsOf(display);
      if (d.length < 8 || d.length > 15) continue;
      if (DATE_LIKE.test(display) || YEAR_RANGE.test(display)) continue;
      const key = phoneKey(d);
      const same = out.find((p) => p.key === key);
      if (same) {
        same.whatsapp ||= whatsapp;
        if (label === "contact") same.label = "contact";
        continue;
      }
      out.push({ display, key, whatsapp, label });
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
          // The same number under "mobile" and again under "whatsapp" is one WhatsApp number.
          const same = found.find((f) => phoneKey(digitsOf(f.display)) === p.key);
          if (same) same.whatsapp ||= whatsapp || p.whatsapp;
          else found.push({ display: p.display, whatsapp: whatsapp || p.whatsapp });
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

  // 1 · typed — ground truth for a PHONE number: shaped like one or labelled as one, never a stand-in
  //     left in a template, and never what the member labelled an account, id, registration or price.
  const notPhones = new Set<string>();
  for (const p of findPhoneNumbers(input.typedText)) {
    if (isPlaceholderNumber(p.display)) { rejected.push({ value: p.display, reason: "a placeholder number" }); continue; }
    if (p.label === "other") {
      notPhones.add(p.key);
      rejected.push({ value: p.display, reason: "labelled as an account, id, registration number or price — not a number to call" });
      continue;
    }
    if (p.label !== "contact" && !isWellFormedNumber(p.display, { allowShortLandline: false })) {
      notPhones.add(p.key);
      rejected.push({ value: p.display, reason: "not shaped like a phone number, and not labelled as one" });
      continue;
    }
    phones.push({ display: p.display, key: p.key, source: "typed", whatsapp: p.whatsapp });
  }

  // 2 · what the model says it read
  for (const { display: raw, whatsapp } of numbersInProfileDetailed(input.profile)) {
    const display = tidy(raw);
    const key = phoneKey(digitsOf(display));
    const same = phones.find((p) => p.key === key);
    if (same) {
      // A card or flyer can show that a typed number is also the WhatsApp one; with nothing to read, the
      // model's "whatsapp" key is only its guess.
      if (whatsapp && input.hasContactDocuments) same.whatsapp = true;
      continue;
    }
    if (notPhones.has(key)) { rejected.push({ value: display, reason: "the member gave it as something other than a phone number" }); continue; }
    if (isPlaceholderNumber(display)) { rejected.push({ value: display, reason: "a placeholder number" }); continue; }
    const typedTwin = phones.find((p) => p.source === "typed" && isMisreadOf(p.key, key));
    if (typedTwin) { rejected.push({ value: display, reason: `a misreading of the typed ${typedTwin.display}` }); continue; }
    if (!input.hasContactDocuments) { rejected.push({ value: display, reason: "not in the text given, and no card, flyer or premises photo to read it from" }); continue; }
    if (!isWellFormedNumber(display)) { rejected.push({ value: display, reason: "not a well-formed phone number" }); continue; }
    phones.push({ display, key, source: "document", whatsapp });
  }

  // 3 · the list every deliverable prints — cut here, once, so the label, the posters and the overlays
  //     can never each keep a different three.
  for (const extra of phones.splice(MAX_CONTACT_NUMBERS)) {
    rejected.push({ value: extra.display, reason: `more than ${MAX_CONTACT_NUMBERS} numbers — the first ${MAX_CONTACT_NUMBERS} given are used` });
  }

  // 4 · the address
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
export const layoutPhones = (facts: BusinessFacts, max = MAX_CONTACT_NUMBERS) => facts.phones.slice(0, max);

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

/** Where a removed number stood while the text around it is tidied: a private-use character no text holds. */
const GONE = "\u{E000}";
/** A text that is nothing but contact labels and punctuation once its numbers are gone. */
const BARE_CONTACT_LABEL = /^[\s,.;:|/&\-–—]*(?:(?:call(?:\s+(?:us|now|today))?|ph|phone|mobile|mob|cell|contact(?:\s+us)?|whats\s*app(?:\s+us)?|tel|dial|or|and|📞|☎️?|📱)[\s,.;:|/&\-–—]*)*$/iu;

// The pieces a removed number's surroundings are recognised by (regex source, composed below).
/** What joins two numbers: a comma, slash, dash, "&", "|", "·", "or", "and". */
const JOIN = String.raw`[ \t]*(?:[-–—,/&|·•]|\bor\b|\band\b)[ \t]*`;
/** The words that introduce a number: "Call us on", "WhatsApp:", "📞". */
const LABELS = String.raw`(?:(?:call(?:\s+(?:us|now|today))?|whats\s*app(?:\s+us)?|dial|ph|phone|mobile|mob|cell|tel|contact(?:\s+(?:us|no\.?|number))?|reach\s+us|📞|☎️?|📱)(?:\s+(?:on|at))?[ \t]*[:\-–]?[ \t]*)+`;
/** A kept number, just before or after: seven or more digit-like characters. */
const KEPT = String.raw`\d[\d \t\-().]{5,}\d`;
const GONE_MARK = String.raw`\u{E000}`;
/** A whole sentence about removed numbers only: "Call X or Y, WhatsApp Z." — it goes, full stop and all. */
const GONE_SENTENCE = new RegExp(String.raw`(^|[.!?][ \t]+)${LABELS}${GONE_MARK}(?:${JOIN}(?:${LABELS})?${GONE_MARK})*[ \t]*(?:[.!;]|$)`, "gimu");
/** Removed numbers joined to each other: one gap. */
const GONE_RUN = new RegExp(String.raw`${GONE_MARK}(?:${JOIN}${GONE_MARK})+`, "gu");
/** A kept number, then what joined it to a removed one: "98480 12345 / X" → "98480 12345". */
const KEPT_JOIN_GONE = new RegExp(String.raw`(?<=${KEPT}\)?)${JOIN}(?:${LABELS})?${GONE_MARK}`, "giu");
/** A removed number, then what joined it to a kept one: "X or 98480 12345" → "98480 12345". */
const GONE_JOIN_KEPT = new RegExp(String.raw`${GONE_MARK}${JOIN}(?=[+(]?${KEPT})`, "gu");
/** What joined a removed number at the end of a sentence or line: "Rs 1,499 or X." → "Rs 1,499.", "Order now · X". */
const JOIN_GONE_AT_END = new RegExp(String.raw`${JOIN}(?:${LABELS})?${GONE_MARK}(?=[ \t]*(?:[.!;]|$))`, "gimu");
/** A removed number opening a line, and what joined it to the rest: "X · Order now." → "Order now.". */
const GONE_JOIN_AT_START = new RegExp(String.raw`^[ \t]*${GONE_MARK}${JOIN}`, "gmu");

/**
 * Removes every phone-like number (8–15 digits) that is not one of the verified ones, with the
 * "Call:" / "📞" it leaves hanging and the "or" / "," / "/" that joined it to another number. Shorter
 * digit runs — pincodes, door numbers, years, prices, pixel sizes — are never touched.
 */
export function stripUnverifiedNumbers(text: string, allowedKeys: string[]): string {
  if (!text) return text;
  const allowed = new Set(allowedKeys);
  let changed = false;
  const out = text.replace(PHONE_RUN, (match) => {
    // The parts are slices of the match itself: a part re-spelt (spaces tidied, dashes turned into
    // spaces) could not be found in it, and an unverified number with a double space survived.
    return splitRun(match).reduce((kept, part) => {
      const display = tidy(part);
      // Pincodes, prices, door numbers, years and pixel sizes are never a phone number.
      if (!isPhoneLike(display)) return kept;
      if (allowed.has(phoneKey(digitsOf(display)))) return kept;
      changed = true;
      return kept.replace(part, GONE);
    }, match);
  });
  if (!changed) return text;
  const result = out
    // A removed number takes its surroundings with it — "Call X or Y, WhatsApp Z." with all three removed
    // left "Call or, WhatsApp." on the poster (seen in the browser check, 2026-10-13).
    .replace(GONE_SENTENCE, "$1")
    .replace(GONE_RUN, GONE)
    .replace(KEPT_JOIN_GONE, "")
    .replace(GONE_JOIN_KEPT, "")
    .replace(JOIN_GONE_AT_END, "")
    .replace(GONE_JOIN_AT_START, "")
    .replace(/\u{E000}/gu, "")
    // The dash or slash that joined a removed number to a kept one ("0884-2345678-" → "0884-2345678").
    .replace(/(\d)[ \t]*[-–/][ \t]*(?=[\n,;|]|$)/gm, "$1")
    // The label a removed number leaves behind, when nothing follows it on its line.
    .replace(/(?:📞|☎️?|📱)\s*(?=[\n,;|]|$)/gm, "")
    .replace(/\b(?:call(?:\s+us|\s+now)?|ph|phone|mobile|mob|contact(?:\s+no\.?|\s+number)?|whatsapp|tel)\s*[:\-–]\s*(?=[\n,;|]|$)/gim, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;])/g, "$1")
    .replace(/(?:[ \t]*[|,/][ \t]*){2,}/g, " | ")
    .trim();
  // Nothing left but the label ("Call", "📞 WhatsApp:") — an overlay that was only an unverified number.
  return BARE_CONTACT_LABEL.test(result) ? "" : result;
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
  // `contactNumbers` is this file's own verified list. A profile without it was saved before the
  // verification existed (2026-09-25): its numbers are the model's, so only well-formed ones are read.
  const verified = Array.isArray(p.contactNumbers);
  const list = verified ? (p.contactNumbers as unknown[]).filter((x): x is string => typeof x === "string") : numbersInProfile(p);
  const whatsapp = typeof p.whatsappNumber === "string" ? phoneKey(digitsOf(p.whatsappNumber)) : "";
  const phones: PhoneFact[] = [];
  for (const display of list) {
    const key = phoneKey(digitsOf(display));
    if (key.length < 8 || phones.some((x) => x.key === key) || isPlaceholderNumber(display)) continue;
    if (!verified && !isWellFormedNumber(display)) continue;
    phones.push({ display: tidy(display), key, source: "document", whatsapp: key === whatsapp });
    if (phones.length === MAX_CONTACT_NUMBERS) break;
  }
  const address = typeof p.address === "string" && p.address.trim() && !EMPTY_VALUE.test(p.address.trim())
    ? p.address.trim()
    : addressInProfile(p);
  return { phones, address, addressSource: address ? "document" : "", rejected: [] };
}

// ── the one list, and the check every printed copy is held to ────────────────────────────────────

/**
 * THE contact numbers of a business — read from its sanitized profile, as the member gave them, typed
 * first, each once, at most MAX_CONTACT_NUMBERS. The Video Bottom Label, both poster systems, the
 * overlays, the frames and every refine print this list and nothing else (2026-10-13).
 */
export const contactNumbersOf = (profile: unknown): PhoneFact[] => factsFromProfile(profile).phones;

/**
 * What is wrong with the numbers a finished prompt prints, in words — [] when it carries every one of
 * `phones` exactly once and no other phone number. Spellings of one number count as that number
 * ("+91 98480 12345" is 98480 12345).
 */
export function contactNumberProblems(text: string, phones: Pick<PhoneFact, "display" | "key">[]): string[] {
  const problems: string[] = [];
  const counts = new Map<string, number>();
  for (const match of (text || "").matchAll(PHONE_RUN)) {
    for (const part of splitRun(match[0])) {
      const display = tidy(part);
      if (!isPhoneLike(display)) continue;
      const key = phoneKey(digitsOf(display));
      if (!phones.some((p) => p.key === key)) problems.push(`${display} is not one of the business's numbers`);
      else counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  for (const p of phones) {
    const n = counts.get(p.key) || 0;
    if (n === 0) problems.push(`${p.display} is missing`);
    else if (n > 1) problems.push(`${p.display} is printed ${n} times`);
  }
  return problems;
}
