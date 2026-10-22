/**
 * The business's FINAL name — read from the client's own material, never from the sale (owner, 2026-10-22).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The owner: "the sales person adds the business name just for reference — it is not the final name of
 * the business. At present it comes as the final business name. From the user's attached assets we need to
 * take the final business name while generating." The salesperson types what they call the client — a short
 * form, the owner's name, a nickname or a misspelling ("Sri Sai" for "Sri Sai Mobiles & Accessories") — and
 * the job opened with it in BUSINESS CONTENT as "Business name: Sri Sai", a box the extraction was told is
 * "authoritative", while the same extraction was forbidden to read the text in the logo. So the sale's
 * spelling went into the script, the wish line, the label, the poster and the name board.
 *
 * Three halves now:
 *   • the brief marks the sale's name as a REFERENCE (`saleNameLine`), and every reader can take it back out
 *     (`saleBusinessNameIn`, `withoutSaleNameLine` — also the older "Business name: X" line);
 *   • the extraction reads the name PRINTED on the logo's wordmark, the visiting card, a flyer or the shop's
 *     name board, and says where it read it (`businessName`, `businessNameSource` — prompts.EXTRACTION_SYSTEM_PROMPT);
 *   • code decides (`finalBusinessName`): the printed name when a file of that kind was attached, the sale's
 *     reference only when no file shows a name, and writes the one answer into the profile every later prompt
 *     reads (`withFinalBusinessName`) — so the script, label, poster, name board and cast all say the same name.
 *
 * Pure; tested in `src/test/adGenOct22.test.ts`.
 */

/** How the brief labels the sale's name — a reference, never the final name. */
export const SALE_NAME_LABEL =
  "Business name from the sale (a reference only — the name printed on the logo, visiting card, flyer or shop board is the real one)";

/** The brief's line for the sale's name. */
export function saleNameLine(name: string): string {
  return `${SALE_NAME_LABEL}: ${name.trim()}`;
}

/** The sale-name line as briefs write it now, and the "Business name: X" line older briefs carry. */
const SALE_NAME_LINE = /^[ \t]*(?:Business name from the sale \([^\n]*?\)|Business name)[ \t]*:[ \t]*(.+?)[ \t]*$/im;
const SALE_NAME_LINES = new RegExp(SALE_NAME_LINE.source, "gim");

/** The sale's name, read back from a brief — "" when the brief has no such line. */
export function saleBusinessNameIn(text?: string | null): string {
  return (SALE_NAME_LINE.exec(text || "")?.[1] || "").trim();
}

/** A brief without the sale-name line — for a prompt that must not take it as the name (the core message, the poster). */
export function withoutSaleNameLine(text?: string | null): string {
  return (text || "").replace(SALE_NAME_LINES, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Where the extraction says it read the name. */
export type NameSource = "logo" | "visiting card" | "flyer" | "store photo" | "voice note" | "typed" | "none";

/** The extraction's `businessNameSource`, read leniently ("Visiting card (front)", "the shop's name board"). */
export function readNameSource(value: unknown): NameSource | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!v) return null;
  if (/not\s*provided|^none$|^n\/?a$/.test(v)) return "none";
  if (/typed|reference|sale|brief|business content|text/.test(v)) return "typed";
  if (/logo|wordmark/.test(v)) return "logo";
  if (/card/.test(v)) return "visiting card";
  if (/flyer|poster|brochure|pamphlet|banner/.test(v)) return "flyer";
  if (/store|shop|board|sign|premises|photo|office|front/.test(v)) return "store photo";
  if (/voice|audio|recording/.test(v)) return "voice note";
  return null;
}

/** Which of the client's own materials were attached to the run. */
export interface NameAssets {
  logo: boolean;
  visitingCard: boolean;
  flyer: boolean;
  storePhoto: boolean;
  voiceNote: boolean;
}

const usable = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "" && !/^not\s*provided$/i.test(v.trim());

/** The material each source names, so a name "read from the logo" counts only when a logo was attached. */
const ATTACHED: Record<Exclude<NameSource, "typed" | "none">, keyof NameAssets> = {
  logo: "logo", "visiting card": "visitingCard", flyer: "flyer", "store photo": "storePhoto", "voice note": "voiceNote",
};

export interface FinalName {
  name: string;
  /** "asset" — printed on (or said in) the client's own material; "typed" — the sale's reference; "extracted" — the model's reading with no source to check it by. */
  from: "asset" | "typed" | "extracted" | "none";
}

/**
 * The one business name a run uses.
 *
 * • The extraction read it off an attached logo, card, flyer, shop board (or heard it in the voice note) → that
 *   name, as printed.
 * • The extraction did not say where it read it (an older reply shape) but the client's material was attached
 *   → its name: the prompt told it to prefer what the files show.
 * • Otherwise the sale's reference, when there is one; else whatever the extraction found.
 */
export function finalBusinessName(input: {
  extracted?: unknown;
  source?: unknown;
  typed?: string | null;
  assets: NameAssets;
}): FinalName {
  const typed = (input.typed || "").trim();
  const extracted = usable(input.extracted) ? input.extracted.trim() : "";
  const source = readNameSource(input.source);
  if (extracted && source && source !== "typed" && source !== "none" && input.assets[ATTACHED[source]]) {
    return { name: extracted, from: "asset" };
  }
  const material = input.assets.logo || input.assets.visitingCard || input.assets.flyer || input.assets.storePhoto;
  if (extracted && source === null && material) return { name: extracted, from: "extracted" };
  if (typed) return { name: typed, from: "typed" };
  if (extracted) return { name: extracted, from: "extracted" };
  return { name: "", from: "none" };
}

/** A key that holds the business's name in an extraction's reply ("Business Name", "businessName", "business_name"). */
const NAME_KEY = /^(?:business[\s_-]*name|name of (?:the )?business)$/i;

/**
 * The profile with ONE business name everywhere it is written: the top-level `businessName` (what
 * geminiService.extractBusinessNameFromInfo, the core message and the poster read first) and every nested
 * "Business Name" the reply carried, so no prompt that is shown the whole profile sees a second spelling.
 * The sale's reference is kept under a key the name readers never take (`saleReference`).
 */
export function withFinalBusinessName(profile: Record<string, unknown>, final: FinalName, typed?: string | null): Record<string, unknown> {
  if (!final.name) return profile;
  const replace = (value: unknown, depth: number): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value) || depth > 6) return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      NAME_KEY.test(k.trim()) && typeof v === "string" ? final.name : replace(v, depth + 1),
    ]));
  };
  const replaced = replace(profile, 0) as Record<string, unknown>;
  // The name readers take the FIRST key that looks like a name (prompts/coreMessage findField walks in order), so the
  // final name goes first and the reply's own "businessNameSource" (a "logo"-like value under a name-like key) goes.
  const rest = Object.fromEntries(Object.entries(replaced)
    .filter(([k]) => !/^business[\s_-]*name/i.test(k.trim()) && k !== "nameSource" && k !== "saleReference"));
  const reference = (typed || "").trim();
  return {
    businessName: final.name,
    ...rest,
    nameSource: final.from,
    ...(reference && reference !== final.name ? { saleReference: reference } : {}),
  };
}

/*
  ── The name as it is SAID (2026-10-22, night — the live promotional run) ──────────────────────────
  The final name comes from the logo, so it is often English capitals ("SRI SAI KRISHNA INFRA"). A Telugu
  script is told both "spell the business name exactly as given" and "no Latin letters", so one run wrote
  శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా and the next shipped "SRI SAI KRISHNA INFRA" inside the Telugu line — refused by the
  validator, capped by the judge, and read letter by letter by a voice. The run now fixes the name's spelling
  in the script's letters once (one `fast` call, like the address) and every spoken line is written with it.
*/

/** True when a name needs a spelling in a non-Latin script's letters (it has English letters). */
export function needsNativeName(name?: string | null): boolean {
  return !!name && /[A-Za-z]/.test(name);
}

/**
 * A spoken line with the business's English-letter name written in the script's own letters, a case ending
 * kept joined ("SRI SAI KRISHNA INFRAలో" → "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రాలో"). Matches the name in any case, with
 * spaces, dots or hyphens between its words. A line without the name, or no native spelling: unchanged.
 */
export function withNativeName(text: string, latinName?: string | null, nativeName?: string | null): string {
  const words = (latinName || "").match(/[A-Za-z0-9&']+/g);
  if (!text || !words?.length || !nativeName?.trim()) return text;
  const pattern = new RegExp(
    String.raw`(?<![A-Za-z])${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(String.raw`[\s.\-]*`)}\.?(?![A-Za-z])`,
    "gi",
  );
  // A Telugu case ending the writer left after the English name joins the spoken one: "INFRA లో" → "ఇన్‌ఫ్రాలో".
  const native = nativeName.trim();
  const joiner = native.endsWith("\u{0C4D}") ? "\u{200C}" : "";
  const looseEnding = new RegExp(
    `${native.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]+(లోని|లో|కి|కు|ను|తో|నుండి|నుంచి)(?![\\u0C00-\\u0C7F])`,
    "gu",
  );
  return text.replace(pattern, native).replace(looseEnding, (_m, ending: string) => `${native}${joiner}${ending}`);
}
