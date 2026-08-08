/**
 * Picking how long an ad is — a standard package, or any clip count at all.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 * Work Assign could always create a job at a custom length, but the three EDIT dialogs (tech
 * admin, team leader, Work Reports) could not. Their dropdowns listed only the category's
 * packages, which stop at 8 clips — so a two-minute ad that had already been assigned could never
 * be corrected to its real length, and anyone editing a 15-clip job for an unrelated reason had
 * no way to leave the length alone except by not touching the field.
 *
 * ── Why "custom" is a flag AND a derivation ───────────────────────────────────────────────────
 * The obvious design is to derive the mode from the value alone: a duration outside the category's
 * packages must be custom. That is necessary but not sufficient, because a custom length can
 * coincide with a standard one — somebody on the 4-clip package who wants to type "4" and then
 * change it. Deriving alone means choosing "Custom length…" from a standard package changes
 * nothing, so the box never opens and the dropdown appears to ignore the click. (That is exactly
 * the bug the occasion picker next door had, in a different disguise.)
 *
 * So the flag records the one thing the value cannot: that they ASKED to type a length. The
 * derivation stays as the seed and as a safety net, so a job that already holds an off-list length
 * opens in the custom box, and a parent that swaps the value from outside is still rendered
 * correctly. `custom || !isPreset(duration)` is the whole rule.
 */
import { useState } from "react";
import {
  DURATIONS, END_CREDITS_SECONDS, clipChoiceLabel, durationChoiceLabel, durationForClips,
  getClipCount, hasPoster, normalizeClipCount,
} from "@/utils/assignmentDuration";

const CUSTOM = "__custom__";

export interface DurationPickerProps {
  category: string;
  /** The current duration string, e.g. `"32s"` or a custom `"120s"`. */
  duration: string;
  /** Given the new duration and its clip count — callers need both to reprice the job. */
  onChange: (duration: string, clips: number) => void;
  /** `sm` matches the compact edit dialogs; `md` matches the full Work Assign form. */
  size?: "sm" | "md";
  /** Test hook prefix, so a page with two pickers can tell them apart. */
  testPrefix?: string;
}

export default function DurationPicker({
  category, duration, onChange, size = "sm", testPrefix = "duration",
}: DurationPickerProps) {
  const presets = DURATIONS[category] || [];
  // Seeded from the value: a job already holding an off-list length opens in the custom box.
  const [custom, setCustom] = useState(() => !presets.includes(duration));
  const isCustom = custom || !presets.includes(duration);
  const clips = getClipCount(duration);

  const field = size === "sm"
    ? "w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20"
    : "w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20";

  const pick = (value: string) => {
    if (value === CUSTOM) {
      // Opening the box must not silently change the length — the clip count carries over, and
      // switching to Custom and straight back leaves the job exactly as it was found.
      setCustom(true);
      return;
    }
    setCustom(false);
    onChange(value, getClipCount(value));
  };

  const setClips = (raw: number) => {
    const safe = normalizeClipCount(raw);
    onChange(durationForClips(safe), safe);
  };

  return (
    <>
      <select
        value={isCustom ? CUSTOM : duration}
        onChange={(e) => pick(e.target.value)}
        data-test={`${testPrefix}-select`}
        className={field}
      >
        {presets.map((d) => (
          <option key={d} value={d}>
            {durationChoiceLabel(d)}{hasPoster(d) ? " + Poster" : ""} + {END_CREDITS_SECONDS}s EC
          </option>
        ))}
        <option value={CUSTOM}>Custom length…</option>
      </select>

      {isCustom && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            value={clips}
            onChange={(e) => setClips(parseInt(e.target.value, 10))}
            data-test={`${testPrefix}-clips`}
            className={size === "sm"
              ? "w-20 border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20"
              : "w-24 border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20"}
          />
          {/* Read back in full, because the number typed is clips and the thing sold is seconds. */}
          <span className="text-[11px] text-muted-foreground" data-test={`${testPrefix}-readback`}>
            = {clipChoiceLabel(clips)}{hasPoster(duration) ? " + Poster" : ""} + {END_CREDITS_SECONDS}s end credits
          </span>
        </div>
      )}
    </>
  );
}
