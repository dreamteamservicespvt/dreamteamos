/**
 * "Months to check" — the admins' and team leaders' short list on the Social Media board (2026-10-15).
 *
 * ── Why ──────────────────────────────────────────────────────────────────────────────────────────
 * Until 2026-10-15 a month's dates could be changed with nothing looking at what was attached to them —
 * the owner's Dhana lakshmi month (posts dated 13 Aug – 9 Sep) was moved to 6 Oct → 6 Nov through Edit
 * setup. The dates check now stops that (services/smm `assertMonthDates`), but the months damaged before it
 * are still out there. This lists them, from the months the board already holds (no read): pieces dated
 * outside their month's own days, a client's months that share days, and a renewal whose next month does not
 * start on its renewal day — each with Open. Shown only while there is one, folded to a line until opened.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { monthsToCheck } from "@/utils/smmMonthDates";
import type { SmmCampaign } from "@/types/smm";

export default function SmmMonthsToCheck({ months, today }: { months: SmmCampaign[]; today: string }) {
  const list = useMemo(() => monthsToCheck(months, today), [months, today]);
  const [open, setOpen] = useState(false);
  if (list.length === 0) return null;
  return (
    <section data-test="smm-months-to-check" className="rounded-xl border border-warning/50 bg-warning/10 text-foreground">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-test="smm-months-to-check-toggle"
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <AlertTriangle size={15} className="shrink-0 text-amber-700 dark:text-warning" aria-hidden />
        <span className="min-w-0 flex-1">
          <b>Months to check ({list.length})</b>
          <span className="text-muted-foreground"> — dates that don't fit their posts or the client's other months</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-2 border-t border-warning/30 p-3" data-test="smm-months-to-check-list">
          {list.map((m) => (
            <li key={m.id} data-test="smm-month-to-check" className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-card p-2.5">
              <div className="min-w-[12rem] flex-1">
                <p className="truncate text-sm font-semibold">{m.name}</p>
                <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                  {m.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
              <Link to={`/smm/${m.id}`} data-test="smm-month-to-check-open"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent">
                <ExternalLink size={13} aria-hidden /> Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
