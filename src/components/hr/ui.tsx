import type { ReactNode } from "react";
import { STAGE_LABELS, ENGAGEMENT_LABELS } from "@/types/hr";
import type { EmploymentStage, EngagementType } from "@/types/hr";
import { STAGE_TONE } from "@/utils/hrPolicy";

/**
 * The small pieces every HR panel repeats — a labelled read-only field, a titled card, a stage
 * chip. Kept in one file so a member's designation looks identical on the admin's profile page
 * and on the member's own, which is the point of showing them the same record.
 */

export function Field({ label, value, mono, className = "" }: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className={`text-sm mt-0.5 break-words ${empty ? "text-muted-foreground/50" : "text-foreground"} ${mono ? "font-mono" : ""}`}>
        {empty ? "—" : value}
      </div>
    </div>
  );
}

export function SectionCard({ title, icon, action, children, className = "" }: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-card ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-display font-semibold text-sm text-foreground flex items-center gap-2">
          {icon}{title}
        </h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** The employment stage, coloured the same way wherever it appears. */
export function StageChip({ stage, engagement, className = "" }: {
  stage: EmploymentStage;
  engagement?: EngagementType;
  className?: string;
}) {
  // A confirmed intern is not "confirmed" in the probation sense — they are simply active.
  const label = stage === "confirmed" && engagement === "intern"
    ? "Active (Intern)"
    : STAGE_LABELS[stage];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_TONE[stage]} ${className}`}>
      {label}
    </span>
  );
}

export function EngagementChip({ engagement, className = "" }: { engagement?: EngagementType; className?: string }) {
  if (!engagement) return null;
  return (
    <span className={`inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ${className}`}>
      {ENGAGEMENT_LABELS[engagement]}
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      {icon && <div className="mb-2 flex justify-center text-muted-foreground/30">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/** A labelled text/date/number input, matching the form styling used across the app. */
export function Input({ label, hint, className = "", ...props }: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>
      <input
        {...props}
        className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40"
      />
      {hint && <span className="text-[10px] text-muted-foreground mt-0.5 block">{hint}</span>}
    </label>
  );
}

export function Textarea({ label, hint, className = "", ...props }: {
  label: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>
      <textarea
        {...props}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40 resize-y"
      />
      {hint && <span className="text-[10px] text-muted-foreground mt-0.5 block">{hint}</span>}
    </label>
  );
}

export function Select({ label, children, className = "", ...props }: {
  label: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>
      <select
        {...props}
        className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary"
      >
        {children}
      </select>
    </label>
  );
}
