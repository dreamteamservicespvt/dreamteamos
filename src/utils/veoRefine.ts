/**
 * The mechanical half of refining a finished Veo 3 prompt (services/geminiService refineVeoPrompts).
 *
 * ── Why the refine was rebuilt ─────────────────────────────────────────────────────────────────────
 * The old refine sent the member's words and the prompts to one editor call and took back plain text
 * split on "###SEGMENT###". It failed in three quiet ways: the editor was told "the cast WALKS in every
 * clip", so any request about standing, facing or staying put was overruled; a reply that dropped a
 * separator shifted every prompt by one and was thrown away; and a reply that changed nothing was
 * reported as "Nothing changed" with no hint of what the model had understood. Members concluded the
 * button did nothing.
 *
 * Now a plan call first says what it understood and what exactly changes in which section of which
 * clip — compared against what that prompt says today — and an edit call makes only that change, as
 * JSON keyed by clip. These helpers read that JSON and decide whether an edit may replace the prompt.
 * Pure, so each guarantee is unit-tested.
 */
import { spokenLinesIn } from "@/services/prompts/motion";

const stripFences = (raw: string) => raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

/** Reads `{ clips: [{ clip, prompt }] }` into edited prompts by 0-based clip, keeping only allowed clips. */
export function parseClipPromptEdits(raw: string, allowed: number[]): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const data = JSON.parse(stripFences(raw || ""));
    const rows = Array.isArray(data?.clips) ? data.clips : Array.isArray(data) ? data : [];
    for (const row of rows) {
      const index = Number(row?.clip) - 1;
      const prompt = typeof row?.prompt === "string" ? row.prompt.trim() : "";
      if (allowed.includes(index) && prompt) out.set(index, prompt);
    }
  } catch {
    // An unreadable reply edits nothing.
  }
  return out;
}

/**
 * The section headings of an assembled prompt — "ACTION", "CAMERA", "SPEECH", "SCENE LIFE",
 * "Negative prompt" and the lock blocks — as the shape an edit must keep.
 */
export function promptHeadings(prompt: string): string[] {
  const headings = new Set<string>();
  for (const line of (prompt || "").split(/\r?\n/)) {
    const t = line.trim();
    if (/^negative prompt\s*:/i.test(t)) { headings.add("NEGATIVE PROMPT"); continue; }
    const m = t.match(/^([A-Z][A-Z0-9&/' ]{2,}?)\s*(?:—|–|:|\()/);
    if (m) headings.add(m[1].trim());
  }
  return [...headings];
}

/**
 * Why an edited prompt may not replace the original, or [] when it may.
 *
 * The recorded dialogue is the one thing an edit can never touch: the video must say exactly what the
 * voice-over says. A lost section is the other — an edit that drops the negatives or the world lock
 * brings back the walking and vanishing furniture those sections exist to prevent.
 */
export function veoEditProblems(original: string, candidate: string): string[] {
  const problems: string[] = [];
  if (!candidate.trim()) return ["The edited prompt was empty."];
  if (JSON.stringify(spokenLinesIn(candidate)) !== JSON.stringify(spokenLinesIn(original))) {
    problems.push("The spoken line inside the quotation marks under SPEECH was changed. Put it back exactly as it was — character for character.");
  }
  const kept = new Set(promptHeadings(candidate));
  const lost = promptHeadings(original).filter((h) => !kept.has(h));
  if (lost.length) problems.push(`These sections went missing: ${lost.join(", ")}. Keep every section and its heading.`);
  return problems;
}

/** Normalised for "did anything actually change" — whitespace differences are not a change. */
export function sameVeoPrompt(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}
