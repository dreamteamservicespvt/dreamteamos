/**
 * Hearing the client's voice note — before anything else reads it.
 *
 * ── Why this is its own step ──────────────────────────────────────────────────────────────────────
 * The voice note used to be dropped into the extraction call as one more attachment, next to the logo,
 * the visiting card and the photos, with the line "Listen carefully". The extractor's job is to fill a
 * business-profile JSON, so whatever the client SAID — "put my son's name on it", "don't mention the
 * old address", "we open at 6 in the morning" — only survived if it happened to fit a field. Members saw
 * the ad come back ignoring the recording and concluded the platform could not hear it.
 *
 * Now the recording is heard on its own, first: transcribed word for word, understood against the
 * business and the written material, and turned into a list of requirements. That text is what every
 * later step reads, so the client's own words reach the script, the frames and the label.
 */
export const VOICE_NOTE_SYSTEM_PROMPT = `You are the account manager at an Indian advertising agency. A client has sent a voice note about the advertisement they want. Listen to every attached recording carefully, from start to finish.

1. TRANSCRIBE it word for word, in the language(s) actually spoken (Telugu, Hindi, English or a mix) — the exact words, not a summary. Keep names, numbers, prices and places exactly as said.
2. UNDERSTAND it against the written material you are given (the business content and frame instructions typed by the team): what business this is, what the client is asking the ad to say, show or avoid, and in what tone.
3. LIST the client's requirements as short, specific instructions — offers and prices they mentioned, lines they want said, products or places they want shown, the tone or language they asked for, anything they said NOT to do.
4. COMPARE: where the voice note and the written material disagree (a different price, a different timing, a different name), say so — never silently pick one.

Never invent anything that is not in the recording. If a part is unclear, write "(unclear)" at that point in the transcript rather than guessing.

Return ONLY this JSON, no markdown:
{
  "transcript": "<word for word, in the language spoken>",
  "summary": "<one or two plain-English sentences: what the client wants>",
  "requirements": ["<specific requirement>", "..."],
  "conflicts": ["<where the voice note and the written material disagree>"]
}`;

/** The user message for the voice-note call — the written material the recording is compared with. */
export function voiceNoteUserPrompt(input: { businessContent?: string; frameInstructions?: string; fileCount: number }): string {
  return `${input.fileCount} voice note${input.fileCount === 1 ? " is" : "s are"} attached above.

BUSINESS CONTENT (typed by the team):
${input.businessContent?.trim() || "(none)"}

FRAME / BACKGROUND INSTRUCTIONS (typed by the team):
${input.frameInstructions?.trim() || "(none)"}

Transcribe, understand and compare now.`;
}
