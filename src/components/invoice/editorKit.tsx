/**
 * The Invoice Builder's form pieces — quiet, compact, keyboard-first.
 *
 * Deliberately small: 36px controls, labels above, one hairline per section and no cards inside
 * cards. A salesperson should see the whole invoice's shape at a glance, not a wall of boxes.
 *
 * `data-field` on a Field is how "fix the first problem" finds it: the builder scrolls to the
 * element and focuses its first input.
 */
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full h-9 px-3 rounded-lg bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground/70 " +
  "outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/15 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

const errorRing = "border-destructive/70 focus:border-destructive focus:ring-destructive/15";

export interface FieldIssue {
  message: string;
  level: "error" | "warning";
}

export function Field({
  label, htmlFor, field, issue, hint, className, children, aside,
}: {
  label: ReactNode;
  htmlFor?: string;
  field?: string;
  issue?: FieldIssue | null;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Small control to the right of the label (a link, a toggle). */
  aside?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)} data-field={field}>
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[18px]">
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground truncate">{label}</label>
        {aside}
      </div>
      {children}
      {issue ? (
        <p role={issue.level === "error" ? "alert" : undefined}
          className={cn("mt-1 text-[11.5px] leading-snug", issue.level === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
          {issue.message}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValue: (v: string) => void;
  invalid?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ value, onValue, invalid, className, ...rest }, ref) {
  return (
    <input
      {...rest}
      ref={ref}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      aria-invalid={invalid || undefined}
      className={cn(inputClass, invalid && errorRing, className)}
    />
  );
});

/** A textarea that grows with what is typed, from `minRows`. */
export function TextArea({
  value, onValue, minRows = 2, invalid, className, ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onValue: (v: string) => void;
  minRows?: number;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      aria-invalid={invalid || undefined}
      className={cn(inputClass, "h-auto py-2 leading-relaxed resize-none overflow-hidden", invalid && errorRing, className)}
    />
  );
}

/**
 * A number field that lets people type naturally — "1.", "0.5", "" — and only reports a number
 * when it is one. A plain controlled `type=number` turns "1." back into "1" mid-keystroke.
 */
export function NumberInput({
  value, onValue, decimals = 2, max, invalid, blankZero, className, ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "max"> & {
  value: number;
  onValue: (n: number) => void;
  decimals?: number;
  max?: number;
  invalid?: boolean;
  /** Show an empty field (and the placeholder) for 0 — a price nobody has typed yet. */
  blankZero?: boolean;
}) {
  const format = (n: number) => (Number.isFinite(n) && n !== 0 ? String(Number(n.toFixed(decimals))) : blankZero ? "" : "0");
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  useEffect(() => {
    // Follow outside changes (duplicate, undo, a restored copy) — never while the person is typing.
    if (focused.current) return;
    const parsed = parseFloat(text);
    if (!(Number.isFinite(parsed) && Math.abs(parsed - value) < 1e-9)) setText(format(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const pattern = decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;
  return (
    <input
      {...rest}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={text}
      onFocus={(e) => { focused.current = true; if (text === "0") e.currentTarget.select(); rest.onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; setText(format(value)); rest.onBlur?.(e); }}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "").trim();
        if (!pattern.test(raw)) return;
        let n = raw === "" || raw === "." ? 0 : parseFloat(raw);
        if (max !== undefined && n > max) n = max;
        setText(max !== undefined && parseFloat(raw) > max ? String(max) : raw);
        onValue(Number.isFinite(n) ? n : 0);
      }}
      aria-invalid={invalid || undefined}
      className={cn(inputClass, "text-right tabular-nums", invalid && errorRing, className)}
    />
  );
}

/** Two or three mutually exclusive choices, as one control. */
export function Segmented<T extends string>({
  value, options, onChange, size = "md", disabled, ariaLabel, className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className={cn("inline-flex p-0.5 rounded-lg bg-muted/70 border border-border", disabled && "opacity-60", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One section of the editor. Open sections show their fields; a closed one shows a one-line summary
 * of what is already filled in, so the pre-filled parts (business, payment) stay out of the way.
 */
export function Section({
  id, step, title, summary, open, onToggle, actions, children, collapsible = true, disabled = false,
}: {
  id: string;
  step: number;
  title: string;
  summary?: ReactNode;
  open: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  /** Read-only: the fields are disabled, the header still opens and closes. */
  disabled?: boolean;
}) {
  const headId = `inv-sec-${id}`;
  return (
    <section aria-labelledby={headId} className="border-b border-border last:border-b-0" data-section={id}>
      <div className="flex items-center gap-3 py-3.5">
        <button
          type="button"
          onClick={collapsible ? onToggle : undefined}
          aria-expanded={collapsible ? open : undefined}
          className={cn("flex items-center gap-3 min-w-0 flex-1 text-left", collapsible ? "cursor-pointer" : "cursor-default")}
        >
          <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center tabular-nums">
            {step}
          </span>
          <span className="min-w-0">
            <span id={headId} className="block text-sm font-semibold text-foreground">{title}</span>
            {!open && summary ? <span className="block text-xs text-muted-foreground truncate mt-0.5">{summary}</span> : null}
          </span>
          {collapsible && (
            <ChevronDown size={16} className={cn("ml-auto shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
          )}
        </button>
        {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
      </div>
      {open && (
        <fieldset disabled={disabled} className="min-w-0 border-0 p-0 m-0 pb-5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {children}
        </fieldset>
      )}
    </section>
  );
}
