/**
 * The ⓘ next to a field label — what this box is for, in one sentence.
 *
 * ── Why a tap rather than a hover tooltip ────────────────────────────────────────────────────
 * Almost everyone using these forms is on a phone with a client on the line, and a hover tooltip
 * simply does not exist there. So this is a button: tap to open, tap again or tap away to close. On
 * a desktop it also opens on hover, which is the behaviour a mouse expects.
 *
 * ── Why hover and tap are two separate states ────────────────────────────────────────────────
 * They were one, and a mouse could not open it at all: hovering set it open, and the click that
 * followed — which a mouse cannot make without first hovering — toggled that straight back to
 * closed. So the hint flickered and vanished for every desktop user, while working fine on the
 * phones it had been tested on. `pinned` is the click; `hovered` is the pointer; it is open if
 * either is true, and only the click has to be dismissed.
 *
 * ── Why the hint is not just placeholder text ────────────────────────────────────────────────
 * Two boxes that look identical and go to opposite audiences — one to the customer, one to the tech
 * team — cannot be told apart by a placeholder, because a placeholder disappears the moment
 * somebody types. The hint stays reachable after the box is full, which is exactly when the
 * question "wait, does the client see this one?" gets asked.
 */
import { useState, useEffect, useRef } from "react";
import { Info } from "lucide-react";

export default function FieldHint({ text, testId }: { text: string; testId?: string }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const open = pinned || hovered;

  // Any tap outside unpins it. Without this the bubble follows the member down the form.
  useEffect(() => {
    if (!pinned) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [pinned]);

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        type="button"
        data-test={testId}
        aria-label={text}
        aria-expanded={open}
        title={text}
        onClick={(e) => { e.preventDefault(); setPinned((v) => !v); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onBlur={() => setHovered(false)}
        /* An explicit 24px box around a 12px glyph, with a negative margin cancelling it again so
           the icon sits exactly where it always did. Before this the ⓘ was the bare icon — a 12px
           target on the form the sales team taps most, on a phone, mid-call. */
        className="-m-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-primary"
      >
        <Info size={12} />
      </button>
      {open && (
        <span
          role="tooltip"
          // Left-anchored and width-capped so it never runs off the right edge of a phone.
          className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-popover p-2 text-[10px] font-normal leading-relaxed text-popover-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
