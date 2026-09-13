/**
 * One generation run, as the waiting workspace sees it.
 *
 * Everything here is snapshotted when Start is pressed. The form is not locked while a run is going
 * — a member can change the duration or switch to posters mid-run — so anything read live would
 * describe the next run, not this one.
 */
import type { GeneratedOutputs } from "@/types/aiPlatform";
import type { Checkpoint, RunProfile } from "@/utils/generationEta";

/** What the member is preparing for, in the terms the guide talks about. */
export interface RunFacts {
  mode: "video" | "poster";
  /** Main-frame prompts coming, one per clip — so one ChatGPT tab per clip. */
  clipCount: number;
  aspectRatio: "9:16" | "16:9";
  /** A logo file is attached, so every image tab needs it. */
  hasLogo: boolean;
  /** No logo — the business name is rendered as a name board instead. */
  nameBoard: boolean;
  /** The ad is shot in the client's own photographs. */
  onLocation: boolean;
  /** How many location photographs are attached (0 unless on location). */
  locationPhotos: number;
  /** The special-category label ("Motu Patlu", "Ganesha"), or "" for a normal model ad. */
  castLabel: string;
  /** Poster mode: how many concepts are being written. */
  conceptCount: number;
}

export interface GenerationRun {
  /** The start timestamp, doubling as the run's identity so a stale run can be told apart. */
  id: number;
  profile: RunProfile;
  checkpoints: Checkpoint[];
  facts: RunFacts;
}

/**
 * Whether anything the member can actually USE has arrived.
 *
 * Not "outputs is set": the generator emits a snapshot holding only the extracted business info at
 * about 10%, before a single asset exists. Treating that as the first asset would dismiss the
 * workspace a few seconds in and leave an empty "Generated Assets" heading in its place.
 */
export function hasGeneratedAsset(outputs: Partial<GeneratedOutputs> | null | undefined): boolean {
  if (!outputs) return false;
  return Boolean(
    outputs.voiceOverScript?.trim()
    || outputs.mainFramePrompts?.some((p) => p?.trim())
    || outputs.headerPrompt?.trim()
    || outputs.posterPrompt?.trim()
    || outputs.veoPrompts?.some((p) => p?.trim())
    || outputs.posterConcepts?.length
    || outputs.stockImagePrompts?.length
    || outputs.overlayTexts?.length,
  );
}
