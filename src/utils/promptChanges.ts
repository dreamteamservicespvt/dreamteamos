/**
 * A member's change to an image prompt (a main frame, the video bottom label), applied by code (2026-11-05).
 *
 * ── Why (the owner, 2026-11-05: "the platform refine was not working … required modifications also not doing
 * correctly") ─────────────────────────────────────────────────────────────────────────────────────────────────
 * The frame and label refines asked the model to REWRITE every prompt (two frames are ~2,500 words) "applying only the
 * change", and took whatever came back. Live, "Change her saree to royal blue with a gold border": the model also
 * turned the Diwali scene's maroon palette blue in both frames, and left the code-stamped "OUTFIT (AS ORDERED): … a
 * colour drawn from the client's brand palette … this overrides any other outfit named in this prompt" — so the image
 * tool was told to ignore the change. "Make the label background deep maroon" changed one word ("maroon/wine" →
 * "maroon"); nothing would look different. A long rewrite can also come back short and drop a clip.
 *
 * Now the model returns a small PLAN — which clips, the exact sentences that say the opposite with their rewrites, and
 * the change written as one instruction — and code applies it: an edit whose sentence is not in the prompt is skipped,
 * a protected line (the face lock, "text in the image", the ratio, the 📎 attach line) is never edited, and the change
 * is stamped as MEMBER'S CHANGES, the line that wins over every other one (stamps included) and stays through later
 * refines until undone — like the poster's "Changes:" line (2026-10-13). Pure, so it is unit-tested.
 */

export const MEMBER_CHANGES_HEADING = "MEMBER'S CHANGES (FINAL — THESE WIN OVER EVERY OTHER LINE IN THIS PROMPT)";

/** Lines a refine never edits: the face lock(s), the only-text rule, the canvas, the attach line. */
const PROTECTED = [/FACE LOCK/, /TEXT IN THE IMAGE/, /ASPECT RATIO:/, /📎/u, /MEMBER'S CHANGES/];

export interface PromptEdit {
  /** Text copied exactly from the prompt. */
  find: string;
  replace: string;
}

/** The member's change line a prompt carries now ("" when none). */
export function memberChangesOf(prompt: string): string {
  const m = (prompt || "").match(new RegExp(String.raw`^${escapeRe(MEMBER_CHANGES_HEADING)}:\s*(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

/**
 * The prompt with its MEMBER'S CHANGES line set to `changes` (replacing the old line; "" removes it), placed last —
 * before a closing 📎 attach line. Idempotent.
 */
export function withMemberChanges(prompt: string, changes: string): string {
  const text = (prompt || "").replace(new RegExp(String.raw`\n*^${escapeRe(MEMBER_CHANGES_HEADING)}:[^\n]*$`, "m"), "");
  const line = cleanChanges(changes);
  if (!line) return text;
  const stamped = `${MEMBER_CHANGES_HEADING}: ${line}`;
  const attach = text.search(/\n[^\n]*📎[^\n]*\s*$/u);
  return attach >= 0
    ? `${text.slice(0, attach).trimEnd()}\n\n${stamped}\n\n${text.slice(attach).trimStart()}`
    : `${text.trimEnd()}\n\n${stamped}`;
}

const MAX_CHANGES_WORDS = 80;

/** One line, no heading echoed back, at most 80 words, ending in a full stop. */
export function cleanChanges(changes: string): string {
  let line = (changes || "").replace(/\s+/g, " ").replace(new RegExp(escapeRe(MEMBER_CHANGES_HEADING) + ":?", "g"), "").trim();
  line = line.replace(/^(?:member'?s )?changes?:\s*/i, "");
  const words = line.split(" ").filter(Boolean);
  if (words.length > MAX_CHANGES_WORDS) line = words.slice(0, MAX_CHANGES_WORDS).join(" ");
  if (line && !/[.!?]$/.test(line)) line += ".";
  return line;
}

/**
 * The edits applied: each one whose `find` is in the prompt (every occurrence — a frame repeats its palette line) and
 * touches no protected line. Matching ignores runs of whitespace. Returns what was applied and what was skipped.
 */
export function applyPromptEdits(prompt: string, edits: PromptEdit[]): { text: string; applied: number; skipped: PromptEdit[] } {
  let text = prompt || "";
  let applied = 0;
  const skipped: PromptEdit[] = [];
  for (const edit of edits || []) {
    const find = String(edit?.find ?? "").trim();
    const replace = String(edit?.replace ?? "").trim();
    if (!find || find === replace || PROTECTED.some((p) => p.test(find)) || PROTECTED.some((p) => p.test(replace))) {
      if (find && find !== replace) skipped.push(edit);
      continue;
    }
    const pattern = new RegExp(find.split(/\s+/).map(escapeRe).join(String.raw`\s+`), "g");
    if (!pattern.test(text)) { skipped.push(edit); continue; }
    // A protected line is left as it is even when the sentence also appears there.
    const next = text.split("\n").map((line) => (PROTECTED.some((p) => p.test(line)) ? line : line.replace(pattern, () => replace))).join("\n");
    if (next === text) { skipped.push(edit); continue; }
    text = next;
    applied++;
  }
  return { text, applied, skipped };
}

/** The refine plan the model answers with. */
export interface PromptChangePlan {
  understood: string;
  /** 1-based clips the change applies to (all when empty). */
  clips: number[];
  /** The complete MEMBER'S CHANGES line after this request ("" = keep the line as it is; `clearChanges` removes it). */
  changes: string;
  clearChanges: boolean;
  edits: (PromptEdit & { clip: number })[];
  notApplied: string;
}

/** The model's JSON read leniently; null when nothing usable came back. */
export function parsePromptChangePlan(raw: string): PromptChangePlan | null {
  let json: any;
  try {
    json = JSON.parse(String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const clips = (Array.isArray(json.clips) ? json.clips : []).map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0);
  const edits = (Array.isArray(json.edits) ? json.edits : [])
    .filter((e: any) => e && typeof e.find === "string" && typeof e.replace === "string")
    .map((e: any) => ({ clip: Number(e.clip) || 0, find: e.find, replace: e.replace }));
  return {
    understood: String(json.understood || "").trim(),
    clips,
    changes: typeof json.changes === "string" ? json.changes : "",
    // Only an explicit undo removes the line; an empty "changes" just means this request needed no line of its own.
    clearChanges: json.clearChanges === true,
    edits,
    notApplied: String(json.notApplied || "").trim(),
  };
}

/**
 * Every prompt with the plan applied: the edits (to their clip, or to every target clip when `clip` is 0) and the
 * MEMBER'S CHANGES line on each target clip. `changed` lists the 0-based prompts that differ.
 */
export function applyPromptChangePlan(prompts: string[], plan: PromptChangePlan): { prompts: string[]; changed: number[]; skipped: number } {
  const targets = new Set(plan.clips.length ? plan.clips.map((n) => n - 1) : prompts.map((_, i) => i));
  let skipped = 0;
  const out = prompts.map((prompt, i) => {
    if (!targets.has(i)) return prompt;
    const mine = plan.edits.filter((e) => e.clip === i + 1 || e.clip === 0);
    const { text, skipped: s } = applyPromptEdits(prompt, mine);
    skipped += s.length;
    const line = cleanChanges(plan.changes);
    if (line) return withMemberChanges(text, line);
    return plan.clearChanges ? withMemberChanges(text, "") : text;
  });
  return { prompts: out, changed: out.map((p, i) => (p.trim() !== prompts[i].trim() ? i : -1)).filter((i) => i >= 0), skipped };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
