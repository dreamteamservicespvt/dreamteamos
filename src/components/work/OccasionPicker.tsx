/**
 * What the greeting video is FOR — a listed occasion, or one typed in.
 *
 * ── The bug this replaces ─────────────────────────────────────────────────────────────────────
 * Both Work Assign forms offered an "Other occasion…" entry that could not be used. Choosing it
 * set the occasion to the empty string, and the text box was rendered only when the occasion was
 * NON-empty — so the box never appeared, and because an empty occasion also reads as "Not
 * specified", the dropdown snapped straight back. Every occasion outside the festival list was
 * therefore unreachable from this screen: the birthdays, weddings, openings and invitations that
 * are most of what actually gets sold.
 *
 * ── Why "other" is state here, and could not be derived ───────────────────────────────────────
 * `DurationPicker` next door derives its custom mode from the value, because a custom duration is
 * never blank. An occasion IS blank the moment you choose to type one — that is the whole point of
 * choosing it — so "they asked to type one" is a real fact about the interaction that no value can
 * carry. It is one `useState`, seeded from whether the incoming occasion is off-list, which is
 * what makes re-opening an existing custom job show the typed name rather than an empty dropdown.
 */
import { useState } from "react";
import { WISHES_OCCASION_GROUPS, isListedFestival } from "@/utils/festivals";

const OTHER = "__other__";

export interface OccasionPickerProps {
  /** The occasion currently on the job. Empty means none chosen. */
  value: string;
  onChange: (occasion: string) => void;
  size?: "sm" | "md";
  testPrefix?: string;
}

export default function OccasionPicker({
  value, onChange, size = "md", testPrefix = "occasion",
}: OccasionPickerProps) {
  // Seeded, not synced: an occasion that is set but unlisted can only have been typed.
  const [typing, setTyping] = useState(() => !!value.trim() && !isListedFestival(value));

  const field = size === "sm"
    ? "w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20"
    : "w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20";

  const selected = typing ? OTHER : (isListedFestival(value) ? value : "");

  return (
    <>
      <select
        value={selected}
        data-test={`${testPrefix}-select`}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER) {
            // Clear the box so they type into an empty one, and remember that they asked to.
            setTyping(true);
            onChange("");
            return;
          }
          setTyping(false);
          onChange(next);
        }}
        className={field}
      >
        <option value="">Not specified</option>
        {WISHES_OCCASION_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        ))}
        <option value={OTHER}>Other occasion…</option>
      </select>

      {typing && (
        <input
          type="text"
          autoFocus
          placeholder="Type the occasion — e.g. Sashtiabdapoorthi"
          value={value}
          data-test={`${testPrefix}-custom`}
          onChange={(e) => onChange(e.target.value)}
          className={`mt-1.5 ${field}`}
        />
      )}
    </>
  );
}
