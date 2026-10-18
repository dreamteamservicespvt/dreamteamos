/**
 * The Development OS's small UI parts. The owner's rule for status visuals (memory: plain words + one simple picture
 * per item, charts only as extras) is followed everywhere: a word, a colour, one ring or bar.
 */
import type { ReactNode } from "react";
import { Info, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEASUREMENT_DISCLAIMER } from "@/devos/core/dimensions";
import type { Difficulty, Outcome, Purpose, RankLevel } from "@/devos/core/types";

export const RANK_STYLE: Record<RankLevel, { ring: string; text: string; bg: string }> = {
  1: { ring: "ring-slate-400/60", text: "text-slate-600 dark:text-slate-300", bg: "from-slate-400 to-slate-600" },
  2: { ring: "ring-emerald-500/60", text: "text-emerald-600 dark:text-emerald-400", bg: "from-emerald-400 to-emerald-700" },
  3: { ring: "ring-sky-500/60", text: "text-sky-600 dark:text-sky-400", bg: "from-sky-400 to-blue-700" },
  4: { ring: "ring-violet-500/60", text: "text-violet-600 dark:text-violet-400", bg: "from-violet-400 to-violet-700" },
  5: { ring: "ring-amber-500/60", text: "text-amber-600 dark:text-amber-400", bg: "from-amber-300 to-orange-600" },
  6: { ring: "ring-rose-500/60", text: "text-rose-600 dark:text-rose-400", bg: "from-rose-400 via-fuchsia-500 to-amber-400" },
};

export function RankBadge({ level, label, size = "md" }: { level: RankLevel; label: string; size?: "sm" | "md" | "lg" }) {
  const s = RANK_STYLE[level];
  const dim = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-base";
  return (
    <div className="flex items-center gap-2 min-w-0" data-test="rank-badge">
      <div className={cn("shrink-0 rounded-2xl bg-gradient-to-br text-white font-bold grid place-items-center shadow-sm ring-2", dim, s.bg, s.ring)} aria-hidden>
        {level}
      </div>
      {size !== "sm" && (
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rank</p>
          <p className={cn("font-semibold leading-tight truncate", s.text)}>{label}</p>
        </div>
      )}
    </div>
  );
}

/** One ring, with the number in the middle (0–100, or "—"). */
export function Ring({ value, size = 72, stroke = 8, label, tone = "primary" }: { value: number | null; size?: number; stroke?: number; label?: string; tone?: "primary" | "good" | "warn" | "bad" | "muted" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color = { primary: "hsl(var(--primary))", good: "hsl(var(--success))", warn: "hsl(var(--warning))", bad: "hsl(var(--destructive))", muted: "hsl(var(--muted-foreground))" }[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ? `${label}: ${value === null ? "not measured" : Math.round(v)}` : undefined}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <span className="font-bold tabular-nums" style={{ fontSize: size * 0.26 }}>{value === null ? "—" : Math.round(v)}</span>
      </div>
    </div>
  );
}

export function Bar({ value, baseline, tone = "primary", className }: { value: number | null; baseline?: number | null; tone?: "primary" | "good" | "warn" | "bad" | "muted"; className?: string }) {
  const color = { primary: "bg-primary", good: "bg-success", warn: "bg-warning", bad: "bg-destructive", muted: "bg-muted-foreground/40" }[tone];
  return (
    <div className={cn("relative h-2.5 w-full rounded-full bg-muted overflow-hidden", className)}>
      {value !== null && <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />}
      {baseline !== null && baseline !== undefined && (
        <div className="absolute top-[-2px] h-[14px] w-0.5 bg-foreground/60" style={{ left: `${Math.max(0, Math.min(100, baseline))}%` }} title={`Baseline ${Math.round(baseline)}`} />
      )}
    </div>
  );
}

export function DifficultyDots({ level, className }: { level: Difficulty | number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5 align-middle", className)} aria-label={`Difficulty ${level} of 5`} title={`Difficulty ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i <= level ? "bg-primary" : "bg-muted-foreground/25")} />)}
    </span>
  );
}

const PURPOSE_LABEL: Record<Purpose, string> = {
  baseline: "Baseline", quest: "Quest", practice: "Practice", remediation: "Fresh try", transfer: "Transfer check", retention: "Retention check",
  rank: "Rank assessment", league: "League", challenge: "Challenge", mission: "Team mission", capstone: "Capstone",
};

export function PurposeChip({ purpose }: { purpose: Purpose }) {
  return <Chip tone={purpose === "rank" || purpose === "league" ? "info" : purpose === "remediation" ? "warn" : "muted"}>{PURPOSE_LABEL[purpose] ?? purpose}</Chip>;
}

export const OUTCOME_WORD: Record<Outcome, { word: string; tone: ChipTone }> = {
  passed: { word: "Passed", tone: "good" }, failed: { word: "Not yet", tone: "bad" }, expired: { word: "Expired", tone: "muted" },
  system_error: { word: "Not counted (system)", tone: "muted" }, pending_validation: { word: "Being graded", tone: "info" }, partial: { word: "Partly", tone: "warn" },
};

export type ChipTone = "good" | "warn" | "bad" | "info" | "muted" | "primary";

/**
 * Orange TEXT that stays readable: the brand orange (`text-primary`) on a light background is 2.8:1 — below the 4.5:1
 * small text needs (the browser test measured it) — so light mode uses a darker orange; dark mode keeps the brand one.
 */
export const ACCENT_TEXT = "text-orange-700 dark:text-primary";
/** The same for green / red status TEXT (an icon needs only 3:1, so icons keep `text-success` / `text-destructive`). */
export const GOOD_TEXT = "text-green-700 dark:text-success";
export const BAD_TEXT = "text-red-700 dark:text-destructive";

/**
 * A chip's 11 px text sits on its own tint, so the light theme needs one step darker again (the browser test measured
 * "Passed" at 2.8:1; the red, blue, amber and orange tones were under 4.5:1 too). The dark theme keeps the tokens.
 */
export function Chip({ children, tone = "muted", className }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  const t = {
    good: "bg-success/10 text-green-800 dark:text-success border-success/30", warn: "bg-warning/15 text-amber-800 dark:text-warning border-warning/40",
    bad: "bg-destructive/10 text-red-700 dark:text-destructive border-destructive/30", info: "bg-info/10 text-blue-700 dark:text-info border-info/30",
    muted: "bg-muted text-muted-foreground border-border", primary: "bg-primary/10 text-orange-800 dark:text-primary border-primary/30",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", t, className)}>{children}</span>;
}

export function Section({ title, hint, right, children, className, id }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5 min-w-0", className)} aria-labelledby={id}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 id={id} className="font-semibold text-foreground leading-tight">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
      <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">{what}…</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{children}</div>;
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("flex gap-2 text-[11px] leading-relaxed text-muted-foreground", className)}>
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{MEASUREMENT_DISCLAIMER}</span>
    </p>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex gap-2 text-xs text-muted-foreground", className)}>
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{children}</span>
    </p>
  );
}

/**
 * Scenario text → safe markup (no HTML from the text is ever injected): paragraphs, "- " bullets, "> " quotes and
 * markdown pipe tables, which the content library uses for data.
 */
export function ScenarioText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k++} className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border-collapse my-2 min-w-[18rem]">
            <thead><tr>{head.map((h, j) => <th key={j} className="text-left font-semibold border-b border-border px-2 py-1.5 bg-muted/50">{h}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri} className="odd:bg-muted/20">{r.map((c, j) => <td key={j} className="border-b border-border/60 px-2 py-1.5 tabular-nums">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.trim().startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) items.push(lines[i++].trim().slice(2));
      blocks.push(<ul key={k++} className="list-disc pl-5 space-y-1 my-1.5">{items.map((t, j) => <li key={j}>{t}</li>)}</ul>);
      continue;
    }
    if (line.trim().startsWith(">")) {
      blocks.push(<blockquote key={k++} className="border-l-4 border-primary/40 bg-muted/40 rounded-r-lg px-3 py-2 my-2 italic">{line.trim().replace(/^>\s?/, "")}</blockquote>);
      i++;
      continue;
    }
    if (line.trim()) blocks.push(<p key={k++} className="my-1.5">{line}</p>);
    i++;
  }
  return <div className={cn("text-sm leading-relaxed text-foreground", className)}>{blocks}</div>;
}

export const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
export const fmtDateTime = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

export function timeAgo(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "never";
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const TAP = "min-h-[44px] sm:min-h-[38px]";
