/**
 * Every image prompt of a saved video kit, said in the kit's own ratio (2026-11-05).
 *
 * ── Why (the owner, 2026-11-05) ──────────────────────────────────────────────────────────────────
 * "In every frames, posters and the overlays images prompts must and should mention the ratio of the image based on
 * the ad configuration." New runs stamp it (utils/frameFormat, utils/overlayImage); a kit saved before that day is
 * reopened from Saved or from its job with prompts that name no ratio — or the 9:16 their old templates said in a 16:9
 * ad. Reopening stamps them with the KIT's ratio (its `spec`, never the live form). Every stamp is idempotent, so a kit
 * that already carries them comes back unchanged. The poster's ratio is its Format line (utils/posterAdType).
 */

import { withAspectRatio } from "@/utils/frameFormat";
import { overlayPromptForRatio } from "@/utils/overlayImage";

export interface KitImagePrompts {
  mainFramePrompts?: string[] | null;
  stockImagePrompts?: any[] | null;
  overlayTexts?: any[] | null;
}

export function withKitImageRatio<T extends KitImagePrompts>(kit: T, ratio?: string | null): T {
  return {
    ...kit,
    mainFramePrompts: Array.isArray(kit.mainFramePrompts) ? kit.mainFramePrompts.map((p) => withAspectRatio(p, ratio)) : kit.mainFramePrompts,
    stockImagePrompts: Array.isArray(kit.stockImagePrompts)
      ? kit.stockImagePrompts.map((item) => (typeof item?.prompt === "string" ? { ...item, prompt: withAspectRatio(item.prompt, ratio) } : item))
      : kit.stockImagePrompts,
    overlayTexts: Array.isArray(kit.overlayTexts)
      ? kit.overlayTexts.map((item) => (typeof item?.imagePrompt === "string" && item.imagePrompt.trim()
        ? { ...item, imagePrompt: overlayPromptForRatio(item, ratio) }
        : item))
      : kit.overlayTexts,
  };
}
