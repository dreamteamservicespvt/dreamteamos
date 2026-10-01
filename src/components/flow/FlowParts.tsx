/**
 * The small pieces every Flow Accounts screen is built from — kept together so the member's view, the
 * managers' view and the Mark Complete form show a password, a credit balance or a drive the same way.
 */
import { useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, X, Calculator, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowClipCounts } from "@/types/flowAccounts";
import {
  CLIP_LENGTHS, clipsAffordable, maskSecret, type DriveProgress, type FlowAccountState,
} from "@/utils/flowAccounts";

/** A bottom sheet on a phone, a centred dialog on a desktop. `z` lifts it over the full-screen generator. */
export function Modal({ title, subtitle, onClose, children, footer, wide = false, z = "z-50", testId }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  z?: string;
  testId?: string;
}) {
  return (
    <div className={cn("fixed inset-0 flex items-end justify-center bg-black/55 sm:items-center sm:p-4", z)} onClick={onClose}>
      <div
        data-test={testId}
        role="dialog"
        aria-label={title}
        className={cn(
          "flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" data-test="modal-close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Copies a value and says so for a moment. */
export function CopyButton({ value, label = "Copy", testId }: { value: string; label?: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-test={testId}
      aria-label={label}
      title={label}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); } catch { /* the field is still selectable */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  );
}

/** A credential line: label, value (masked when secret, until shown), copy. */
export function SecretField({ label, value, secret = false, testId }: { label: string; value: string; secret?: boolean; testId?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="w-[72px] shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span data-test={testId} className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
        {secret && !shown ? maskSecret(value) : value || "—"}
      </span>
      {secret && value && (
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide" : "Show"} title={shown ? "Hide" : "Show"}
          data-test={testId ? `${testId}-reveal` : undefined}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
          {shown ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      {value && <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} testId={testId ? `${testId}-copy` : undefined} />}
    </div>
  );
}

/** Credits used against the month's allowance, as a bar. */
export function CreditBar({ used, total, className }: { used: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const colour = pct >= 85 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", colour)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATE_LOOK: Record<FlowAccountState, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  low: { label: "Low credits", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  empty: { label: "No credits left", cls: "bg-red-500/12 text-red-600 dark:text-red-400" },
  expired: { label: "Expired", cls: "bg-muted text-muted-foreground" },
  blocked: { label: "Blocked", cls: "bg-red-500/12 text-red-600 dark:text-red-400" },
};

/** A small coloured label. */
export function Chip({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <span data-test={testId} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium", className)}>
      {children}
    </span>
  );
}

export function StateChip({ state }: { state: FlowAccountState }) {
  const look = STATE_LOOK[state];
  return <Chip className={look.cls} testId={`state-${state}`}>{look.label}</Chip>;
}

/** One headline number. */
export function StatCard({ label, value, hint, icon, testId }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; testId?: string }) {
  return (
    <div data-test={testId} className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold leading-tight text-foreground sm:text-2xl">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** How many clips of each length a number of credits makes — starts from `credits`, any number can be tried. */
export function CreditCalculator({ credits, costs, title = "Credit calculator" }: { credits: number; costs: FlowClipCounts; title?: string }) {
  const [custom, setCustom] = useState<string>("");
  const value = custom.trim() === "" ? credits : Math.max(0, Number(custom) || 0);
  const clips = clipsAffordable(value, costs);
  return (
    <div data-test="credit-calculator" className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Calculator size={15} className="text-primary" />{title}</div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Credits
          <input
            data-test="calculator-credits"
            inputMode="numeric"
            value={custom}
            placeholder={String(credits)}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))}
            className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CLIP_LENGTHS.map(({ key, seconds }) => (
          <div key={key} className="rounded-lg bg-muted/60 px-2.5 py-2">
            <div className="text-[11px] text-muted-foreground">{seconds}-second clips</div>
            <div data-test={`calc-${key}`} className="text-lg font-bold text-foreground">{clips[key].toLocaleString("en-IN")}</div>
            <div className="text-[10px] text-muted-foreground">{costs[key]} credits each</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DRIVE_LOOK: Record<DriveProgress["status"], { label: string; cls: string }> = {
  done: { label: "Target reached", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  on_track: { label: "On track", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  behind: { label: "Behind", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  overdue: { label: "Deadline passed", cls: "bg-red-500/12 text-red-600 dark:text-red-400" },
  not_started: { label: "Not started", cls: "bg-muted text-muted-foreground" },
};

export function DriveChip({ progress }: { progress: DriveProgress }) {
  const look = DRIVE_LOOK[progress.status];
  return (
    <Chip className={look.cls} testId={`drive-${progress.status}`}>
      {progress.status === "behind" ? `Behind by ${progress.behindBy}` : look.label}
    </Chip>
  );
}

/** Where one member stands against the drive: the count, today's pace and the deadline. */
export function DriveProgressCard({ progress, deadline, onAdd }: { progress: DriveProgress; deadline: string; onAdd?: () => void }) {
  const pct = progress.target > 0 ? Math.min(100, Math.round((progress.done / progress.target) * 100)) : 0;
  return (
    <div data-test="drive-card" className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Target size={13} className="text-primary" /> Your account drive
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span data-test="drive-done" className="text-3xl font-bold text-foreground">{progress.done}</span>
            <span className="text-sm text-muted-foreground">/ {progress.target} accounts</span>
          </div>
        </div>
        <DriveChip progress={progress} />
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 px-2 py-1.5">
          <div data-test="drive-today" className="text-base font-bold text-foreground">{progress.addedToday}<span className="text-xs font-normal text-muted-foreground">/{progress.dailyGoal}</span></div>
          <div className="text-[10.5px] text-muted-foreground">added today</div>
        </div>
        <div className="rounded-lg bg-background/60 px-2 py-1.5">
          <div className="text-base font-bold text-foreground">{progress.daysLeft}</div>
          <div className="text-[10.5px] text-muted-foreground">days left</div>
        </div>
        <div className="rounded-lg bg-background/60 px-2 py-1.5">
          <div className="text-base font-bold text-foreground">{progress.neededPerDay}</div>
          <div className="text-[10.5px] text-muted-foreground">needed a day</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Target by <b className="text-foreground">{formatDay(deadline)}</b> · {progress.dailyGoal} a day keeps you on track.
        </p>
        {onAdd && (
          <button data-test="drive-add" onClick={onAdd}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            + Add account
          </button>
        )}
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Oct 2026" from "2026-10-29". */
export function formatDay(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Oct 2026" from "2026-10". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : month;
}

/** A labelled input row, the way every form in the section lays one out. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-[11px] text-red-500">{error}</p> : hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const inputCls = "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary";
export const buttonCls = {
  primary: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
  secondary: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50",
  small: "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50",
  danger: "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400",
};
