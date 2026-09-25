/**
 * The FINAL voice-over script — written wherever the team writes it (ChatGPT, Gemini, the client's
 * own edits) and pasted back into a kit that has already been generated.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 * The script the team actually records is usually not the one the generator first wrote: it goes to
 * the client, comes back changed, gets polished in another tool. The only way to get video prompts,
 * B-roll and overlays for THAT script was to paste it into Configuration and generate the whole kit
 * again — new frames, new label, new poster — throwing away frames that had often already been made.
 * A final script now goes into the Deliverables, and only what is built FROM the script (the Veo
 * prompts, the B-roll and the overlays) is rewritten from it.
 *
 * ── The format ───────────────────────────────────────────────────────────────────────────────────
 * The same one the kit shows and the client receives, per special category:
 *   no character      clip-1[0-8sec]: the line
 *   one character     clip-1[0-8sec]:\n  [Business Owner]: the line
 *   two characters    clip-1[0-8sec]:\n  [Motu]: …\n  [Patlu]: …
 * Read with the same parsers the generator uses (voiceOverFormat, dialogueFormat), used word for word
 * (customScript), with numbers and "mariyu" made speakable exactly as every other script is
 * (spokenNumbers). Kept pure — the check that decides whether a pasted script is accepted is tested.
 */
import { parseLabeledClips, clipLabel, CLIP_SECONDS } from "./voiceOverFormat";
import { formatDialogueScript, parseDialogueClips, type DialogueClip, type Speaker } from "./dialogueFormat";
import { verbatimScriptText } from "./customScript";
import { speakableLine } from "./spokenNumbers";

/** The shape to paste, for this ad's cast, over the kit's own number of clips. */
export function finalScriptTemplate(speakers: Speaker[], clipCount: number): string {
  const clips = Math.max(1, Math.min(15, clipCount || 2));
  const blocks: string[] = [];
  for (let i = 0; i < clips; i++) {
    const head = `${clipLabel(i)}:`;
    if (speakers.length > 1) {
      blocks.push([head, ...speakers.map((s) => `  [${s.name}]: …`)].join("\n"));
    } else if (speakers.length === 1) {
      blocks.push(`${head}\n  [${speakers[0].name}]: …`);
    } else {
      blocks.push(`${head} …`);
    }
  }
  return blocks.join("\n");
}

/**
 * The kit's current voice-over in the paste format — so a member making a small correction can load
 * it, edit a word and apply, instead of retyping it. A cast's script is stored in the display form
 * already; a presenter's is stored as `0-8: …` and is shown with its clip labels.
 */
export function finalScriptFromKit(voiceOverScript: string, speakers: Speaker[]): string {
  if (!voiceOverScript?.trim()) return "";
  if (speakers.length > 0) {
    const clips = parseDialogueClips(voiceOverScript, speakers);
    return clips.length > 0 ? formatDialogueScript(clips, speakers) : voiceOverScript.trim();
  }
  const clips = parseLabeledClips(voiceOverScript);
  return clips.length > 0 ? clips.map((text, i) => `${clipLabel(i)}: ${text}`).join("\n") : voiceOverScript.trim();
}

/**
 * What a member pastes into ChatGPT or Gemini along with their script, so it comes back in exactly
 * the format this kit reads — without a word of it being changed.
 */
export function finalScriptAiInstruction(speakers: Speaker[], clipCount: number): string {
  const cast = speakers.length > 1
    ? `Every clip has one line for each speaker, labelled exactly ${speakers.map((s) => `[${s.name}]:`).join(" and ")}.`
    : speakers.length === 1
      ? `Every clip has one line, labelled exactly [${speakers[0].name}]:.`
      : "Every clip is one line after its label.";
  return [
    `Put my final voice-over script into EXACTLY this format — ${clipCount} clip${clipCount === 1 ? "" : "s"} of 8 seconds. ${cast}`,
    "Do NOT change, add, translate or remove a single word of my script — only split it into the clips and add the labels.",
    "Reply with the formatted script only, nothing before or after it.",
    "",
    "FORMAT:",
    finalScriptTemplate(speakers, clipCount),
    "",
    "MY SCRIPT:",
    "(paste your script here)",
  ].join("\n");
}

export interface FinalScriptReading {
  /** True when the script can be used as it is. */
  ok: boolean;
  /** The script in the form the kit stores and every later step reads. Empty when not ok. */
  script: string;
  /** How many clips it reads as. */
  clips: number;
  /** What stops it being used — each one says what to change. */
  problems: string[];
  /** What is worth a look but does not stop it. */
  notes: string[];
}

const label = /^\s*\[\s*([^\]\n]{1,40}?)\s*\]\s*:/;
const norm = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Every `[Name]:` label in the text that is not one of this ad's speakers. */
function unknownLabels(text: string, speakers: Speaker[]): string[] {
  const known = new Set<string>();
  for (const s of speakers) {
    known.add(norm(s.key));
    known.add(norm(s.name));
    const parts = s.name.trim().split(/\s+/);
    known.add(norm(parts[parts.length - 1] || ""));
  }
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = label.exec(line);
    if (!m) continue;
    const name = m[1].trim();
    if (!known.has(norm(name)) && !out.includes(name)) out.push(name);
  }
  return out;
}

const canonical = (segments: string[]) =>
  segments.map((text, i) => `${i * CLIP_SECONDS}-${(i + 1) * CLIP_SECONDS}: ${text}`).join("\n");

/**
 * Reads a pasted final script for this ad.
 *
 * `expectedClips` is the kit's own clip count: the video prompts are built from the frames already
 * made, one per clip, so a script with a different number of clips cannot be matched to them.
 */
export function readFinalScript(
  text: string,
  speakers: Speaker[],
  options: { expectedClips: number; language?: string },
): FinalScriptReading {
  const problems: string[] = [];
  const notes: string[] = [];
  const language = options.language || "Telugu";
  const fail = (clips = 0): FinalScriptReading => ({ ok: false, script: "", clips, problems, notes });

  if (!text.trim()) {
    problems.push("Paste the final script first.");
    return fail();
  }

  const expected = options.expectedClips;
  const names = speakers.map((s) => s.name).join(" and ");

  // ── an ad with characters: [Name]: lines under each clip ────────────────────────────────────
  if (speakers.length > 0) {
    const strangers = unknownLabels(text, speakers);
    if (strangers.length > 0) {
      problems.push(`${strangers.map((n) => `[${n}]`).join(", ")} ${strangers.length === 1 ? "is not a speaker" : "are not speakers"} in this ad — its ${speakers.length === 1 ? "character is" : "characters are"} ${names}. Use exactly ${speakers.map((s) => `[${s.name}]`).join(" and ")}.`);
    }
    let clips: DialogueClip[] = parseDialogueClips(text, speakers);
    // One character, written as plain clip lines: every clip is theirs.
    if (clips.length === 0 && speakers.length === 1) {
      clips = parseLabeledClips(text).map((line) => [{ speaker: speakers[0].key, text: line }]);
    }
    if (clips.length === 0) {
      problems.push(speakers.length > 1
        ? `No clips could be read. Start each clip with its line (clip-1[0-8sec]:) and give every line its speaker — ${speakers.map((s) => `[${s.name}]:`).join(" / ")}.`
        : `No clips could be read. Start each clip with its line, e.g. clip-1[0-8sec]:, then [${speakers[0].name}]: and the words.`);
      return fail();
    }
    const empty = clips.map((c, i) => (c.every((l) => !l.text.trim()) ? i + 1 : 0)).filter(Boolean);
    if (empty.length > 0) problems.push(`Clip ${empty.join(", ")} ${empty.length === 1 ? "has" : "have"} no spoken line.`);
    if (expected > 0 && clips.length !== expected) {
      problems.push(`The script has ${clips.length} clip${clips.length === 1 ? "" : "s"}; this kit has ${expected} frame${expected === 1 ? "" : "s"}. Paste exactly ${expected} clips — or put the script in Configuration → custom script and generate the kit again for a different length.`);
    }
    if (speakers.length > 1) {
      const lonely = clips.map((c, i) => (new Set(c.map((l) => l.speaker)).size < 2 ? i + 1 : 0)).filter(Boolean);
      if (lonely.length > 0) notes.push(`Clip ${lonely.join(", ")} ${lonely.length === 1 ? "has" : "have"} only one speaker — in this ad both ${names} normally speak in every clip.`);
    }
    if (problems.length > 0) return fail(clips.length);
    const spoken = clips.map((clip) => clip
      .filter((l) => l.text.trim())
      .map((l) => ({ ...l, text: speakableLine(verbatimScriptText(l.text), language) })));
    return { ok: true, script: formatDialogueScript(spoken, speakers), clips: spoken.length, problems, notes };
  }

  // ── no characters: one line per clip ─────────────────────────────────────────────────────────
  if (/^\s*\[[^\]\n]{1,40}\]\s*:/m.test(text)) {
    notes.push("This ad has no characters, so the [Name]: labels were read as part of the lines — remove them if they are not meant to be spoken.");
  }
  const segments = parseLabeledClips(text).map((line) => verbatimScriptText(line)).filter(Boolean);
  if (segments.length === 0) {
    problems.push("No clips could be read. Start each clip with its line: clip-1[0-8sec]: the words, clip-2[8-16sec]: the words …");
    return fail();
  }
  if (expected > 0 && segments.length !== expected) {
    problems.push(`The script has ${segments.length} clip${segments.length === 1 ? "" : "s"}; this kit has ${expected} frame${expected === 1 ? "" : "s"}. Paste exactly ${expected} clips — or put the script in Configuration → custom script and generate the kit again for a different length.`);
    return fail(segments.length);
  }
  return { ok: true, script: canonical(segments.map((s) => speakableLine(s, language))), clips: segments.length, problems, notes };
}
