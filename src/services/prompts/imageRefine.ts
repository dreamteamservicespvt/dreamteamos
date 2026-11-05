/**
 * The refine planner for image prompts — the main frames and the video bottom label (2026-11-05, utils/promptChanges).
 *
 * The model no longer rewrites the prompts. It reads them and the member's request and answers a small JSON plan:
 * which clips, the sentences that say the opposite (copied exactly, with their rewrites), and the change as one
 * instruction for the image tool. Code applies it, protects the locks and stamps the change as the final word.
 */

export type ImageRefineKind = "frames" | "label";

export const IMAGE_REFINE_SYSTEM_PROMPT = (kind: ImageRefineKind) => `You apply a team member's change to ${kind === "frames"
  ? "the image prompts of a video ad's frames (one prompt per clip; a member pastes each into ChatGPT or Gemini to make that clip's first frame)"
  : "the image prompt of a video ad's bottom label (a transparent brand strip laid over the video)"}.

You do NOT rewrite the prompts. You answer a small plan that code applies:

1. "understood": one plain sentence — what the member wants changed.
2. "clips": the clip numbers the change applies to. Every clip, unless the request names some ("only clip 2", "the first frame"). ${kind === "label" ? "The label is clip 1." : ""}
3. "changes": the COMPLETE "MEMBER'S CHANGES" line after this request — clear instructions to the image tool, in English, at most 80 words. Keep the earlier changes in the current line unless this request undoes or replaces them; add this request in concrete visual words ("Her saree is royal blue silk with a gold zari border in every clip." — not "make it better"). This line is stamped last in each prompt and wins over every other line.
4. "edits": every sentence in a target clip that describes the SAME thing the request changes and would now contradict it — "find" copied EXACTLY from that clip's prompt (a whole sentence or phrase, character for character), "replace" the sentence rewritten to agree with the request and otherwise unchanged; with its "clip" number. Include a stamped line such as "OUTFIT (AS ORDERED): …" when it contradicts the request (rewrite only the part the request changes). NEVER edit a sentence about anything the request does not change: if the request is about her saree, the room, the light, the decorations and the festival palette stay exactly as they are.
5. "notApplied": what could not be done and why (empty when everything could). Never: change a face the FACE LOCK protects, add writing other than the logo / name board (TEXT IN THE IMAGE), change the aspect ratio (the ad's setting), add a phone number or address the business did not give.
6. "clearChanges": true only when the member asks to undo all earlier changes.

Return ONLY this JSON:
{ "understood": "...", "clips": [1, 2], "changes": "...", "edits": [ { "clip": 1, "find": "...", "replace": "..." } ], "notApplied": "", "clearChanges": false }`;

export const IMAGE_REFINE_USER_PROMPT = (input: {
  kind: ImageRefineKind;
  prompts: string[];
  instruction: string;
  currentChanges: string;
  /** 1-based clip the member refined from its own card, or null for all. */
  clip?: number | null;
}) => `THE MEMBER'S REQUEST: "${input.instruction}"${input.clip ? `\n(Asked on clip ${input.clip}'s own card — apply it to clip ${input.clip} only.)` : ""}

CURRENT MEMBER'S CHANGES LINE: ${input.currentChanges ? `"${input.currentChanges}"` : "(none yet)"}

${input.prompts.map((p, i) => `===== ${input.kind === "label" ? "LABEL (clip 1)" : `CLIP ${i + 1}`} =====\n${p}`).join("\n\n")}

Return the JSON plan now.`;
