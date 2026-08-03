import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileSignature, Plus, UserPlus } from "lucide-react";

/**
 * The two honest ways someone gets into this platform.
 *
 * Onboarding — offer letter, joining letter, login — is the path for anyone the company is actually
 * employing, and it is the default because it is what happens almost every time.
 *
 * Quick add exists for the people who are not employees: an external ad creator given access to one
 * tool, or someone who signed on paper before this existed. Sending them an offer letter would be a
 * lie, so the escape hatch stays — labelled honestly, and second.
 */
export default function AddMemberButton({ onOnboard, onQuickAdd }: {
  onOnboard: () => void;
  onQuickAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-test="add-member"
        className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 font-display text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:px-4 md:text-sm"
      >
        <Plus size={14} />
        <span className="hidden sm:inline">Add Member</span>
        <span className="sm:hidden">Add</span>
        <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <button
            onClick={() => pick(onOnboard)}
            data-test="add-member-onboard"
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent"
          >
            <FileSignature size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium text-foreground">Onboard new employee</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                Offer letter → joining letter → their login
              </span>
            </span>
          </button>
          <button
            onClick={() => pick(onQuickAdd)}
            data-test="add-member-quick"
            className="flex w-full items-start gap-2.5 border-t border-border px-3 py-2.5 text-left hover:bg-accent"
          >
            <UserPlus size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium text-foreground">Quick add, no paperwork</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                External creators, or anyone already signed on paper
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
