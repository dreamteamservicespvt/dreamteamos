/**
 * THE CAST LINE, carried by every frame of an ad whose people are invented — see
 * prompts/characterAd castLineBlock.
 *
 * Clip 1's frame prompt opens with one line, "CAST: …", that fixes how each person looks. The model
 * is asked to repeat it at the top of every later frame, and — like every other instruction a frame
 * model is merely asked to keep — it does not always. So code copies clip 1's line onto any frame that
 * lacks one. Each prompt then describes the same people on its own, which is what keeps them the same
 * people when the frames are generated one at a time, often in a fresh chat each time.
 *
 * Pure. A run whose clip 1 has no cast line is returned unchanged — there is nothing to copy.
 */

const CAST_LINE = /^\s*(?:\*\*)?CAST(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im;

/** Clip 1's cast description, without its heading, or "" when it has none. */
export function castLineOf(prompt: string): string {
  const match = (prompt || "").match(CAST_LINE);
  return match ? match[1].replace(/\*\*/g, "").trim() : "";
}

/** Every frame opened with clip 1's cast line — the frames that already carry one keep their own. */
export function withCastLine(prompts: string[]): string[] {
  const cast = castLineOf(prompts[0] || "");
  if (!cast) return prompts;
  return prompts.map((prompt, i) => {
    if (i === 0 || !prompt.trim() || castLineOf(prompt)) return prompt;
    return `CAST: ${cast}\n\n${prompt.trimStart()}`;
  });
}
