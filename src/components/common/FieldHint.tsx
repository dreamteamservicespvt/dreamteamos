/**
 * The ⓘ next to a field label — what this box is for, in one sentence.
 *
 * ── Why a tap rather than a hover tooltip ────────────────────────────────────────────────────
 * Almost everyone using these forms is on a phone with a client on the line, and a hover tooltip
 * simply does not exist there. So this is a button: tap to open, tap anywhere to close. On a
 * desktop it opens on hover too, which is the behaviour a mouse expects.
 *
 * ── Why the hint is not just placeholder text ────────────────────────────────────────────────
 * Two boxes that look identical and go to opposite audiences — one to the customer, one to the
 * tech team — cannot be told apart by a placeholder, because a placeholder disappears the moment
 * somebody types. The hint stays reachable after the box is full, which is exactly when the
 * question "wait, does the client see this one?" gets asked.
 */
import { useState, useEffect, useRef } from "react";
import { Info } from "lucide-react";

export default function FieldHint({ text, testId }: { text: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  // Any tap outside closes it. Without this the bubble follows the member down the form.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        type="button"
        data-test={testId}
        aria-label={text}
        title={text}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center text-muted-foreground/70 hover:text-primary transition-colors"
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
