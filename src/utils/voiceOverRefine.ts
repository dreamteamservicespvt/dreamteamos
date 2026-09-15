/**
 * The mechanical half of refining a script: reading the plan and the edits, putting edited clips
 * back into the untouched script, and telling a real regression from a problem that was already
 * there. Pure, so every guarantee the refine flow relies on is testable without a model.
 */

export interface RefinePlan {
  understood: string;
  /** 0-based clip indexes that change, ascending, no duplicates. */
  clips: number[];
  /** What changes, by 0-based clip index. */
  changes: Record<number, string>;
  /** Why nothing can be changed, or "". */
  notPossible: string;
  /** Where the script already says what was asked, or "". Nothing is changed when this is set. */
  alreadyDone: string;
}

const stripFences = (raw: string) => raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Reads the plan call's reply.
 *
 * `forcedClip` (0-based) is the clip whose own Refine button was used. It wins over whatever the
 * model decided, in both directions: the change goes to that clip even if the plan named another,
 * and never spreads to the rest of the script.
 */
export function parseRefinePlan(raw: string, clipCount: number, forcedClip?: number | null): RefinePlan {
  let data: any = null;
  try {
    data = JSON.parse(stripFences(raw || ""));
  } catch {
    data = null;
  }
  const understood = str(data?.understood);
  const notPossible = str(data?.notPossible);
  const changes: Record<number, string> = {};
  const rows = Array.isArray(data?.clips) ? data.clips : [];
  for (const row of rows) {
    const index = Number(row?.clip) - 1;
    if (Number.isInteger(index) && index >= 0 && index < clipCount) {
      changes[index] = str(row?.change) || changes[index] || "";
    }
  }
  // "Already there" only counts when the planner also found nothing to change — a plan that lists
  // clips is a plan to change them.
  const alreadyDone = Object.keys(changes).length === 0 ? str(data?.alreadyDone) : "";
  const stop = !!(notPossible || alreadyDone);

  if (typeof forcedClip === "number" && forcedClip >= 0 && forcedClip < clipCount) {
    const change = changes[forcedClip] || Object.values(changes).find(Boolean) || "";
    return {
      understood,
      clips: stop ? [] : [forcedClip],
      changes: stop ? {} : { [forcedClip]: change },
      notPossible,
      alreadyDone,
    };
  }

  const clips = stop ? [] : Object.keys(changes).map(Number).sort((a, b) => a - b);
  return { understood, clips, changes: stop ? {} : changes, notPossible, alreadyDone };
}

/** Reads a single-voice edit reply into edited text by 0-based clip, keeping only allowed clips. */
export function parseClipTextEdits(raw: string, allowed: number[]): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const data = JSON.parse(stripFences(raw || ""));
    const rows = Array.isArray(data?.clips) ? data.clips : Array.isArray(data) ? data : [];
    for (const row of rows) {
      const index = Number(row?.clip) - 1;
      const text = str(row?.text);
      if (allowed.includes(index) && text) out.set(index, text);
    }
  } catch {
    // An unreadable reply edits nothing.
  }
  return out;
}

/** Reads a dialogue edit reply into lines by 0-based clip, keeping only allowed clips. */
export function parseClipDialogueEdits(
  raw: string,
  allowed: number[],
): Map<number, { speaker: string; text: string }[]> {
  const out = new Map<number, { speaker: string; text: string }[]>();
  try {
    const data = JSON.parse(stripFences(raw || ""));
    const rows = Array.isArray(data?.clips) ? data.clips : Array.isArray(data) ? data : [];
    for (const row of rows) {
      const index = Number(row?.clip) - 1;
      const lines = Array.isArray(row?.lines)
        ? row.lines.map((l: any) => ({ speaker: str(l?.speaker), text: str(l?.text) })).filter((l: any) => l.speaker && l.text)
        : [];
      if (allowed.includes(index) && lines.length) out.set(index, lines);
    }
  } catch {
    // An unreadable reply edits nothing.
  }
  return out;
}

/**
 * The original clips with only the edited ones replaced.
 *
 * This is the guarantee that a refine of clip 3 leaves clips 1, 2 and 4 exactly as they were: the
 * untouched clips are never round-tripped through a model at all.
 */
export function mergeClipEdits<T>(original: T[], edits: Map<number, T>): T[] {
  return original.map((clip, i) => (edits.has(i) ? (edits.get(i) as T) : clip));
}

/** The 0-based clips whose content actually differs. */
export function changedClipIndexes<T>(before: T[], after: T[], same: (a: T, b: T) => boolean = (a, b) => a === b): number[] {
  const out: number[] = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if (before[i] === undefined || after[i] === undefined || !same(before[i], after[i])) out.push(i);
  }
  return out;
}

/**
 * The 0-based clips a validation issue list is about.
 *
 * Validation names the clip ("Clip 3 must contain…"), except the call-to-action check, which names
 * "Final clip". Script-level problems (a wrong clip count) belong to no clip and are not returned —
 * they need the whole script repaired, not one clip.
 */
export function clipIndexesFromIssues(issues: string[], clipCount: number): number[] {
  const out = new Set<number>();
  for (const issue of issues) {
    const named = issue.match(/^Clip (\d+)\b/);
    if (named) {
      const index = Number(named[1]) - 1;
      if (index >= 0 && index < clipCount) out.add(index);
    } else if (/^Final clip\b/.test(issue) && clipCount > 0) {
      out.add(clipCount - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The issues that name one clip, including the final-clip call-to-action check for the last one. */
export function issuesForClip(issues: string[], index: number, clipCount: number): string[] {
  return issues.filter((issue) => {
    const named = issue.match(/^Clip (\d+)\b/);
    if (named) return Number(named[1]) - 1 === index;
    return /^Final clip\b/.test(issue) && index === clipCount - 1;
  });
}

/**
 * What to do about a clip's problems, in editor's terms.
 *
 * A bare "must be 18–22 words, has 16" was repeated to the repair model twice and it came back 16 both
 * times. Saying which direction and by how much — and with what, so it is not padding — is what gets
 * the count fixed without losing the line.
 */
export function repairDirection(issues: string[], min: number, max: number): string {
  return issues.map((issue) => {
    const count = issue.match(/but it has (\d+)/);
    if (!count) return issue;
    const has = Number(count[1]);
    if (has < min) {
      return `It has ${has} spoken words; it needs ${min}–${max}. ADD ${min - has} to ${max - has} words by carrying one more real, `
        + `specific fact from the business information in the same sentence — never filler, never a repeated word.`;
    }
    return `It has ${has} spoken words; it needs ${min}–${max}. CUT ${has - max} to ${has - min} words by tightening the sentence — `
      + `keep the business name, the promise and every fact, drop only the words that carry nothing.`;
  }).join(" ");
}

/**
 * How far a script's clips sit outside the word band, in words, summed.
 *
 * A repair that takes a 14-word clip to 17 has not cleared the issue, but it is closer — rejecting it
 * because the issue count did not drop threw away real progress in the first live runs.
 */
export function wordBandDistance(counts: number[], min: number, max: number): number {
  return counts.reduce((sum, n) => sum + (n < min ? min - n : n > max ? n - max : 0), 0);
}

/**
 * Whether a repaired script is better than the one it replaces: fewer problems, or the same number of
 * problems with clips nearer the word band.
 */
export function isBetterRepair(
  before: { issues: string[]; distance: number },
  after: { issues: string[]; distance: number },
): boolean {
  if (after.issues.length !== before.issues.length) return after.issues.length < before.issues.length;
  return after.distance < before.distance;
}

/**
 * A clip's words, numbered — handed to the model so it can see the count instead of estimating it.
 * Counting words in Telugu script is exactly where the models kept getting it wrong.
 */
export function numberedWords(words: string[]): string {
  return `${words.length} words: ${words.map((w, i) => `${i + 1}·${w}`).join(" ")}`;
}

/**
 * Problems the edit CREATED.
 *
 * A script can carry a small existing fault — an untouched clip one word over the band. Rejecting
 * every refine of such a script would make it unrefinable, so only issues that were not there before
 * the edit count against it.
 */
export function introducedIssues(before: string[], after: string[]): string[] {
  const existing = new Set(before);
  return after.filter((issue) => !existing.has(issue));
}
