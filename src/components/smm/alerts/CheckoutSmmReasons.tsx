/**
 * The check-out step of SMM Delivery Control (2026-10-15, phase 4; owner's decision 8): before a covered member
 * checks out, every social-media piece of theirs that is due today, late, or past a checkpoint needs a one-tap
 * "why not done" (and an optional new time). It replaces the old "due soon" card for the people Delivery Control
 * covers; the reasons are saved with the check-out (`services/smmDelivery.saveCheckoutReasons`, one transaction per
 * month) and the lead sees them on the Team tab and in the Alerts log.
 *
 * The parent (`CheckoutModal`) keeps Submit off until every piece has a reason (`onChange(complete)`).
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { checkoutTasksFor, SMM_LATE_REASONS } from "@/utils/smmDeliveryActions";
import { TASK_TYPE_WORDS, dayWords } from "@/utils/smmDeliveryView";
import { useDeliveryData } from "@/components/smm/control/useDeliveryData";
import type { SmmLateStep } from "@/types/smmDelivery";
import type { AppUser } from "@/types";

export interface CheckoutReasonEntry {
  campaignId: string;
  itemId: string;
  step: SmmLateStep;
  reason: string;
  note?: string | null;
  newTime?: number | null;
}

const WHY_WORDS = { late: "Late", due_today: "Due today", checkpoint_missed: "Behind" } as const;

export default function CheckoutSmmReasons({ user, onChange }: {
  user: AppUser;
  onChange: (state: { entries: CheckoutReasonEntry[]; complete: boolean }) => void;
}) {
  const data = useDeliveryData(user, {});
  const tasks = useMemo(() => {
    if (!data.monthsLoaded) return null;
    try {
      return checkoutTasksFor({ uid: user.uid, months: data.months, now: data.now, holidays: data.holidays, settings: data.settings });
    } catch {
      return [];
    }
  }, [data.monthsLoaded, data.months, data.now, data.holidays, data.settings, user.uid]);
  const [answers, setAnswers] = useState<Record<string, { reason: string; note: string; newTime: string }>>({});

  useEffect(() => {
    if (!tasks) {
      onChange({ entries: [], complete: false });
      return;
    }
    const entries: CheckoutReasonEntry[] = [];
    let complete = true;
    for (const t of tasks) {
      const a = answers[`${t.campaignId}:${t.itemId}`];
      if (!a?.reason || (a.reason === "Other" && a.note.trim().length < 5)) {
        complete = false;
        continue;
      }
      entries.push({ campaignId: t.campaignId, itemId: t.itemId, step: t.step, reason: a.reason, note: a.note || null, newTime: a.newTime ? new Date(a.newTime).getTime() : null });
    }
    onChange({ entries, complete });
  }, [tasks, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tasks) return <p className="text-xs text-muted-foreground">Checking your social media pieces…</p>;
  if (!tasks.length) {
    return (
      <div data-test="checkout-smm-none" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-foreground">
        ✔ Social media: nothing left to explain today — every piece of yours is on track or already has a reason.
      </div>
    );
  }
  return (
    <div data-test="checkout-smm-reasons" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
      <p className="text-xs font-semibold text-foreground">Social media — why is each not done? ({tasks.length})</p>
      {tasks.map((t) => {
        const key = `${t.campaignId}:${t.itemId}`;
        const a = answers[key] || { reason: "", note: "", newTime: "" };
        const set = (patch: Partial<typeof a>) => setAnswers((all) => ({ ...all, [key]: { ...a, ...patch } }));
        return (
          <div key={key} className="space-y-1.5 rounded-md bg-card/80 p-2" data-test="checkout-smm-row">
            <p className="text-[11px] font-medium text-foreground">
              {TASK_TYPE_WORDS[t.task.type].icon} {t.clientName} · {t.task.title || TASK_TYPE_WORDS[t.task.type].noun} —{" "}
              <span className={t.why === "late" ? "text-destructive" : "text-warning"}>{WHY_WORDS[t.why]}</span>
              {t.task.deadlineDay ? ` (deadline ${dayWords(t.task.deadlineDay)})` : ""}
            </p>
            <div className="flex flex-wrap gap-1">
              {SMM_LATE_REASONS[t.step].map((r) => (
                <button key={r} type="button" onClick={() => set({ reason: r })}
                  className={cn("min-h-[40px] rounded-full border px-2.5 text-[11px]", a.reason === r ? "border-primary bg-primary/15 font-semibold text-foreground" : "border-border bg-card text-foreground")}>
                  {r}
                </button>
              ))}
            </div>
            {a.reason && (
              <div className="flex flex-wrap items-center gap-1.5">
                <input value={a.note} onChange={(e) => set({ note: e.target.value })} placeholder={a.reason === "Other" ? "Say why (needed)" : "Note (optional)"}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px]" />
                <input type="datetime-local" value={a.newTime} onChange={(e) => set({ newTime: e.target.value })} aria-label="New time (optional)"
                  className="h-8 rounded-md border border-border bg-background px-1 text-[11px]" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
