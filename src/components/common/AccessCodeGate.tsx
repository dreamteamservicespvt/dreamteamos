import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Four digits between someone outside the company and something meant only for them.
 *
 * Used by the client chat and by the hiring link. Both hand a stranger a URL that will be forwarded,
 * pasted and screenshotted, and both need the same answer: the link alone proves nothing. Keeping
 * one component means the two cannot drift into behaving differently — a gate that clears its boxes
 * on a wrong code in one place and leaves them filled in another teaches people it is broken.
 *
 * The parent owns the verdict. This component knows how to collect four digits, submit them the
 * moment the fourth lands, and show what it is told; it never decides whether a code was right.
 */
export default function AccessCodeGate({
  icon, title, subtitle, note, busy, busyLabel, error, blocked, onSubmit,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** The reassuring line under the boxes — who this is from, or what is behind the door. */
  note?: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  /** Set by the parent after a failed attempt. Setting it clears the boxes and re-focuses. */
  error?: string | null;
  /** Locked out, or the link is dead: the boxes stop accepting input entirely. */
  blocked?: boolean;
  onSubmit: (code: string) => void;
}) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  // A rejected code leaves nothing behind: retyping over four filled boxes is fiddly on a phone,
  // and the commonest reason for a wrong code is a mistyped digit the person cannot see.
  useEffect(() => {
    if (!error) return;
    setDigits(["", "", "", ""]);
    const t = setTimeout(() => inputs.current[0]?.focus(), 50);
    return () => clearTimeout(t);
  }, [error]);

  // Computed outside the state updater on purpose: submitting from inside one runs the parent's
  // handler during React's render phase, which is how a keystroke turns into "Cannot update a
  // component while rendering a different component" and, in strict mode, two submissions.
  const setDigit = useCallback((index: number, value: string) => {
    if (blocked || busy) return;
    if (!/^\d*$/.test(value)) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    if (value && index < 3) inputs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) onSubmit(next.join(""));
  }, [digits, blocked, busy, onSubmit]);

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (blocked || busy) return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length !== 4) return;
    setDigits(pasted.split(""));
    onSubmit(pasted);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          {icon}
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{subtitle}</p>

        <div className="my-7 flex justify-center gap-3" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              disabled={blocked || busy}
              data-test={`access-code-${i}`}
              className={cn(
                "h-16 w-14 rounded-xl border-2 bg-card text-center text-2xl font-bold text-foreground outline-none transition-all",
                error ? "border-destructive/60" : "border-border focus:border-primary focus:ring-4 focus:ring-primary/10",
                (blocked || busy) && "opacity-50",
              )}
            />
          ))}
        </div>

        {busy && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel || "Checking…"}
          </p>
        )}

        {error && !busy && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-left" data-test="access-code-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {note && (
          <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
