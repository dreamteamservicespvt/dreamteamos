/**
 * The client's voice note, as the rest of the pipeline reads it (services/prompts/voiceNote).
 *
 * Pure — no model calls — so what counts as a usable reading, and how it is written into the prompts,
 * is tested on its own.
 */
import type { VoiceBrief } from "@/types/aiPlatform";

const line = (v: unknown, max = 600): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const list = (v: unknown, max = 12): string[] =>
  Array.isArray(v) ? v.map((x) => line(x, 300)).filter(Boolean).slice(0, max) : [];

/**
 * The model's reply as a voice brief, or null when nothing usable came back.
 *
 * A reading needs a transcript or a summary; a reply with neither heard nothing, and passing an empty
 * brief downstream would tell every later step the client said nothing at all.
 */
export function parseVoiceBrief(raw: string): VoiceBrief | null {
  if (!raw?.trim()) return null;
  let data: any;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const brief: VoiceBrief = {
    transcript: line(data.transcript, 4000),
    summary: line(data.summary),
    requirements: list(data.requirements),
    conflicts: list(data.conflicts, 8),
  };
  return brief.transcript || brief.summary ? brief : null;
}

/** The brief as a prompt block — what the client said, in their words and as instructions. */
export function voiceBriefAsText(brief: VoiceBrief): string {
  return [
    brief.summary ? `What the client wants: ${brief.summary}` : "",
    brief.requirements.length ? `The client's requirements (follow every one):\n${brief.requirements.map((r) => `• ${r}`).join("\n")}` : "",
    brief.conflicts.length ? `Where the voice note disagrees with the written material (the written BUSINESS CONTENT wins unless the voice note is clearly newer):\n${brief.conflicts.map((c) => `• ${c}`).join("\n")}` : "",
    brief.transcript ? `Word for word: "${brief.transcript}"` : "",
  ].filter(Boolean).join("\n\n");
}

/** What is merged into the business profile, so every later prompt that reads it hears the client too. */
export function voiceBriefForProfile(brief: VoiceBrief): Record<string, unknown> {
  return {
    summary: brief.summary,
    requirements: brief.requirements,
    ...(brief.conflicts.length ? { conflictsWithWrittenMaterial: brief.conflicts } : {}),
    transcript: brief.transcript,
  };
}
