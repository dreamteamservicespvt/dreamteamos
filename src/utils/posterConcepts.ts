/**
 * Turning the model's reply into poster concepts the member can trust.
 *
 * Kept pure and separate from the service because every rule here is a promise to the CLIENT, and
 * each one is something a model breaks occasionally no matter how the prompt is worded:
 *
 *  - the canvas: a prompt that forgets to say "4:5" produces a square poster, and the member only
 *    finds out after generating it. So the canvas sentence is put back if it is missing.
 *  - the phone number: a model asked for "a contact strip" will happily write a plausible number.
 *    Any phone-like number that is not one the business actually gave is removed.
 *  - the shape: the reply may be `{concepts:[…]}`, a bare array, one object, or JSON wrapped in a
 *    code fence. All four are read.
 */
import type { PosterConcept } from "@/types/aiPlatform";
import { posterCanvasSentence, parsePosterSize } from "./posterSpec";
import { getPosterStyle, AUTO_POSTER_STYLE } from "@/services/posterStyles";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Pulls the JSON out of a reply that may carry a code fence or a sentence around it. */
function extractJson(text: string): unknown {
  const cleaned = (text || "")
    .replace(/^```(?:json|javascript|text)?\s*/gim, "")
    .replace(/```\s*$/gim, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through to the bracket search */ }
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const close = cleaned[start] === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** One raw concept → a PosterConcept, or null when it has no usable prompt. */
export function normalizePosterConcept(raw: unknown, fallbackStyle = AUTO_POSTER_STYLE): PosterConcept | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const imagePrompt = str(r.imagePrompt) || str(r.prompt) || str(r.image_prompt);
  if (!imagePrompt) return null;
  const styleId = str(r.style);
  return {
    title: str(r.title) || "Poster concept",
    // A style the library does not know is recorded as the requested one, so a "Shadow metaphor"
    // job never displays as some invented style name the model made up.
    style: getPosterStyle(styleId) ? styleId : fallbackStyle,
    idea: str(r.idea) || str(r.concept),
    whyItWorks: str(r.whyItWorks) || str(r.why) || undefined,
    headline: str(r.headline),
    subline: str(r.subline) || undefined,
    imagePrompt,
    negativePrompt: str(r.negativePrompt) || str(r.negative) || undefined,
  };
}

/** Every concept the reply contains, in order. Unreadable replies give []. */
export function parsePosterConcepts(text: string, fallbackStyle = AUTO_POSTER_STYLE): PosterConcept[] {
  const json = extractJson(text);
  const list: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { concepts?: unknown }).concepts)
      ? (json as { concepts: unknown[] }).concepts
      : json && typeof json === "object"
        ? [json]
        : [];
  return list
    .map((c) => normalizePosterConcept(c, fallbackStyle))
    .filter((c): c is PosterConcept => c !== null);
}

/**
 * Makes sure the prompt states the canvas. If the ratio and the pixel size are both absent, the
 * canvas sentence is prepended — the generator reads the start of a prompt most reliably.
 */
export function enforceCanvas(prompt: string, posterSize: string): string {
  const size = parsePosterSize(posterSize);
  const text = prompt.trim();
  const mentionsRatio = size.ratioExact && text.includes(size.ratio);
  const mentionsPixels = new RegExp(`${size.width}\\s*[x×]\\s*${size.height}`).test(text);
  if (mentionsRatio || mentionsPixels) return text;
  const sentence = posterCanvasSentence(posterSize);
  return `Create ${sentence}. ${text}`;
}

const lastTen = (digits: string) => digits.slice(-10);

/**
 * Removes any phone-like number (8–15 digits) that is not one of the business's real numbers.
 *
 * Matched on the last ten digits, so "+91 91603 45678" and "9160345678" are the same number.
 * Shorter digit runs — pincodes, door numbers, years, pixel sizes — are never touched.
 */
export function stripInventedNumbers(text: string, allowed: string[]): string {
  const allowedSet = new Set(allowed.map((a) => lastTen(a.replace(/\D/g, ""))).filter(Boolean));
  return text
    .replace(/\+?\d[\d\s\-()]{6,}\d/g, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return match;
      return allowedSet.has(lastTen(digits)) ? match : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

/** The whole pass: canvas stated, invented numbers gone, count capped. */
export function finalizePosterConcepts(
  concepts: PosterConcept[],
  opts: { posterSize: string; contacts: string[]; maxCount?: number },
): PosterConcept[] {
  const max = opts.maxCount ?? concepts.length;
  return concepts.slice(0, max).map((c) => ({
    ...c,
    headline: stripInventedNumbers(c.headline, opts.contacts),
    subline: c.subline ? stripInventedNumbers(c.subline, opts.contacts) : c.subline,
    imagePrompt: enforceCanvas(stripInventedNumbers(c.imagePrompt, opts.contacts), opts.posterSize),
  }));
}

/** One concept as plain text — what "Copy all" puts on the clipboard. */
export function posterConceptAsText(c: PosterConcept, index?: number): string {
  const head = `${index !== undefined ? `Concept ${index + 1}: ` : ""}${c.title}`;
  return [
    head,
    c.idea ? `Idea: ${c.idea}` : null,
    c.headline ? `Headline: ${c.headline}` : null,
    c.subline ? `Subline: ${c.subline}` : null,
    "",
    c.imagePrompt,
    c.negativePrompt ? `\nAvoid: ${c.negativePrompt}` : null,
  ].filter((l): l is string => l !== null).join("\n");
}
