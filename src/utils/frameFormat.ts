/**
 * The canvas and the subject's size, said in the copied prompt itself (2026-11-05).
 *
 * ── Why (the owner, 2026-11-05) ─────────────────────────────────────────────────────────────────
 * 1. "Based on the ad ratio … in the frames prompt, poster prompt and the B-roll images prompt we need to mention the
 *    aspect ratio." The ratio was told to the frame WRITER (a system-prompt override), but its templates say "9:16
 *    vertical" in several places, so a 16:9 ad's frame could come back saying 9:16 — or say nothing — and the image tool
 *    only ever sees the copied prompt. The B-roll writer was asked to start with the ratio, and nothing checked it.
 * 2. "In the frames the characters are far away, need them close to the screen." The composition asked for head to
 *    knees AND "feet and the floor visible", and clip 1 "wide enough to establish the place"; the image tool resolved
 *    it by pulling back. The size is now one line with numbers, last word on it, like the FACE LOCK and TEXT IN THE
 *    IMAGE stamps (the system prompt never reaches the image tool).
 *
 * Pure and idempotent, so a refine can re-stamp a prompt that already carries them.
 */

export type AdRatio = "9:16" | "16:9";

/** "16:9" for a landscape ad, otherwise the 9:16 default. */
export const adRatioOf = (ratio?: string | null): AdRatio => (String(ratio || "").trim() === "16:9" ? "16:9" : "9:16");

/** "9:16 vertical (portrait)" / "16:9 horizontal (landscape)". */
export const ratioWords = (ratio: AdRatio): string =>
  ratio === "16:9" ? "16:9 horizontal (landscape)" : "9:16 vertical (portrait)";

export const ASPECT_RATIO_HEADING = "ASPECT RATIO";

/** A leading 📎 / 🎨 attach line must stay the first line (utils/locationAssignment.splitAttachmentDirective). */
const LEADING_DIRECTIVE = /^\s*((?:📎|🎨)[^\n]*)\n+/u;

/**
 * Every mention of the OTHER ratio in a prompt, corrected to the ad's: "9:16 vertical", "9:16", "9x16", "portrait
 * format" in a 16:9 ad, and the reverse. Words that only happen to be "vertical" (a vertical reference line) or
 * "landscape" (scenery) are left alone — only a ratio, or an orientation word followed by format / orientation /
 * canvas / frame / composition / image, is a statement about the canvas.
 */
export function withRatioMentionsFixed(text: string, ratio: AdRatio): string {
  const other = ratio === "16:9" ? { a: "9", b: "16" } : { a: "16", b: "9" };
  const wrongRatio = new RegExp(
    String.raw`\b${other.a}\s*[:x×]\s*${other.b}\b(?:\s*,?\s*(?:vertical|horizontal|portrait|landscape)(?:\s*\((?:portrait|landscape|vertical|horizontal)\))?)?`,
    "gi",
  );
  const shape = ratio === "16:9" ? "horizontal" : "vertical";
  const wrongShape = ratio === "16:9" ? /\b(?:vertical|portrait)(\s+(?:format|orientation|canvas|frame|composition|image|photograph|photo|poster))\b/gi
    : /\b(?:horizontal|landscape)(\s+(?:format|orientation|canvas|frame|composition|image|photograph|photo|poster))\b/gi;
  return (text || "")
    .replace(wrongRatio, ratioWords(ratio))
    .replace(wrongShape, (_m, rest: string) => `${shape}${rest}`);
}

/**
 * An image prompt that names its canvas on its first line ("ASPECT RATIO: 16:9 horizontal (landscape) — compose the
 * whole image for this canvas."), after a leading attach line, with every other ratio mention corrected. Idempotent.
 */
export function withAspectRatio(prompt: string, ratioIn: string | null | undefined, what = "image"): string {
  if (!(prompt || "").trim()) return prompt;
  const ratio = adRatioOf(ratioIn);
  const fixed = withRatioMentionsFixed(prompt, ratio);
  const line = `${ASPECT_RATIO_HEADING}: ${ratioWords(ratio)} — compose the whole ${what} for this canvas.`;
  // Re-stamping replaces the old line (a kit whose ratio changed, or a refine that edited it).
  const existing = new RegExp(String.raw`^${ASPECT_RATIO_HEADING}:[^\n]*$`, "m");
  if (existing.test(fixed)) return fixed.replace(existing, line);
  const lead = fixed.match(LEADING_DIRECTIVE);
  return lead
    ? `${lead[0].trimEnd()}\n\n${line}\n\n${fixed.slice(lead[0].length)}`
    : `${line}\n\n${fixed.trimStart()}`;
}

// ── the subject's size ───────────────────────────────────────────────────────────────────────────

export const SUBJECT_SIZE_HEADING = "SUBJECT SIZE (CLOSE TO THE CAMERA)";

/** Who the frame shows — a real person (or two), or a drawn character / deity whose height is their identity. */
export interface SubjectSizeOptions {
  /** "person": one real person; "pair": two real people; "figure": a drawn character, a drawn pair or a deity. */
  cast: "person" | "pair" | "figure";
  /** The clip walks: the full figure (feet on the floor) is needed, still close. */
  walks?: boolean;
  /** The clip is set in the client's own photograph: the cast is placed in its foreground, the photo unchanged. */
  plate?: boolean;
}

/**
 * The cast kind of one frame, from its clip's motion plan: a drawn character or a deity is a "figure", two people a
 * "pair", anyone else one "person". A real owner's frames have no motion plan — one owner or the Real Owner Duo.
 */
export function frameCastOf(
  plan: { performer?: string; twoHander?: boolean } | undefined,
  options: { realPerson?: boolean; ownerPair?: boolean } = {},
): SubjectSizeOptions["cast"] {
  if (options.realPerson) return options.ownerPair ? "pair" : "person";
  if (plan?.performer && plan.performer !== "person") return "figure";
  return plan?.twoHander ? "pair" : "person";
}

/** The size sentence for one frame. */
export function subjectSizeLine(options: SubjectSizeOptions): string {
  const who = options.cast === "pair" ? "both people" : options.cast === "figure" ? "the cast" : "the person";
  const filling = options.cast === "pair"
    ? "together filling about 85–90% of the frame height and most of its width"
    : "filling about 85–90% of the frame height";
  const shot = options.cast === "figure" || options.walks
    ? `the full figure from head to feet, close to the camera — ${who} ${filling}`
    : `a close medium shot — ${who} from the head to mid-thigh, about 1.5 metres from the camera, ${filling}`;
  const plate = options.plate ? " Placed in the foreground of the photograph, which stays as it is behind them." : "";
  return `${SUBJECT_SIZE_HEADING}: ${shot}, the face${options.cast === "person" ? "" : "s"} large and sharp, with only a little headroom; `
    + `the business stays readable behind. Never a wide shot and never a small figure in a big room — this overrides any `
    + `other shot size or distance in this prompt.${plate}`;
}

/** A frame prompt that says how close the cast is. Idempotent (a re-stamp replaces it); placed before a closing 📎 line. */
export function withSubjectSize(prompt: string, options: SubjectSizeOptions): string {
  if (!(prompt || "").trim()) return prompt;
  const line = subjectSizeLine(options);
  const existing = new RegExp(String.raw`^${escapeRe(SUBJECT_SIZE_HEADING)}:[^\n]*$`, "m");
  if (existing.test(prompt)) return prompt.replace(existing, line);
  const attach = prompt.search(/\n[^\n]*📎/u);
  return attach >= 0 ? `${prompt.slice(0, attach)}\n\n${line}${prompt.slice(attach)}` : `${prompt.trimEnd()}\n\n${line}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
