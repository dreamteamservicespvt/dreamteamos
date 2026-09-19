/**
 * The paid side of a month: what is being promoted, for how long, at what a day, and what came back.
 *
 * ── Why the agreed budget and the day's budget are different fields ───────────────────────────
 * A client settles a daily figure once, at the sale, and then moves it — up for a festival, down on
 * a slow Monday. Editing the agreed figure to do that loses the answer to "what did we agree", which
 * is the question asked at renewal; keeping only the agreed figure loses "what did we actually spend
 * on the 12th", which is the question asked when the money runs out. So the agreed number is fixed
 * and a day that moved carries its own override.
 */
import { useMemo, useState } from "react";
import {
  Plus, Megaphone, Loader2, Play, Pause, Square, Trash2, IndianRupee, Pencil, BarChart3,
  Image as ImageIcon, Sparkles, Video,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addAdRun, removeAdRun, setDayBudget, updateAdRun } from "@/services/smm";
import { formatCurrency } from "@/utils/formatters";
import { adRunDays, adTotals, budgetForDay, isoDay, itemsForRun, plannedSpend } from "@/utils/smmPlan";
import { SMM_CONTENT_KINDS, type SmmAdRun, type SmmCampaign, type SmmContentKind } from "@/types/smm";
import type { LucideIcon } from "lucide-react";
import SmmAdReportDialog from "@/components/smm/SmmAdReportDialog";

/** The same three marks the content table uses, so a suggestion looks like the row it came from. */
const KIND_ICON: Record<SmmContentKind, LucideIcon> = {
  poster: ImageIcon,
  ai_ad: Sparkles,
  real_video: Video,
};

const STATUS_TONE: Record<SmmAdRun["status"], string> = {
  planned: "bg-muted text-muted-foreground",
  running: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  ended: "bg-muted text-muted-foreground",
};

export default function SmmAdsPanel({ campaign, canEdit, actorName, onMessage }: {
  campaign: SmmCampaign;
  canEdit: boolean;
  actorName: string;
  onMessage: (text: string) => void;
}) {
  const { toast } = useToast();
  const today = isoDay(new Date());
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<{ run: SmmAdRun; date?: string } | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(campaign.ads[0]?.id || null);

  return (
    <div data-test="smm-ads-panel" className="space-y-3">
      {campaign.ads.length === 0 && !creating && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No ads running yet.
        </p>
      )}

      {campaign.ads.map((run) => {
        const days = adRunDays(run);
        const totals = adTotals(run.reports || []);
        const promoted = itemsForRun(campaign, run);
        const open = openRun === run.id;
        return (
          <div key={run.id} data-test="smm-ad-run" className="rounded-lg border border-border bg-card">
            <button
              onClick={() => setOpenRun(open ? null : run.id)}
              className="flex w-full items-start gap-2 p-3 text-left"
            >
              <Megaphone size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{run.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[run.status]}`}>
                    {run.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {run.days} day{run.days === 1 ? "" : "s"} from {run.startDate} · {formatCurrency(run.dailyBudget)}/day
                  {" · "}{promoted.length} piece{promoted.length === 1 ? "" : "s"} promoted
                </p>
                <p className="mt-0.5 text-[11px] text-foreground">
                  <strong>{totals.leads}</strong> leads · {formatCurrency(totals.spend)} spent
                  {totals.leads > 0 ? ` · ${formatCurrency(totals.costPerResult)} per result` : ""}
                  <span className="text-muted-foreground"> · planned {formatCurrency(plannedSpend(run))}</span>
                </p>
              </div>
            </button>

            {open && (
              <div className="border-t border-border p-3">
                {canEdit && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {(["running", "paused", "ended"] as const).map((s) => (
                      <button
                        key={s}
                        data-test={`smm-run-${s}`}
                        disabled={busy === run.id}
                        onClick={async () => {
                          setBusy(run.id);
                          try { await updateAdRun(campaign.id, run.id, { status: s }); } finally { setBusy(null); }
                        }}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                          run.status === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {s === "running" ? <Play size={10} /> : s === "paused" ? <Pause size={10} /> : <Square size={10} />}
                        {s}
                      </button>
                    ))}
                    <button
                      data-test="smm-run-report"
                      onClick={() => setReportFor({ run })}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <BarChart3 size={10} /> Add today's report
                    </button>
                    <button
                      data-test="smm-run-delete"
                      onClick={async () => {
                        setBusy(run.id);
                        try { await removeAdRun(campaign.id, run.id); } finally { setBusy(null); }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}

                {/* Day by day: what it was budgeted at, and what it actually did. */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-1 text-left font-medium">Day</th>
                        <th className="py-1 text-right font-medium">Budget</th>
                        <th className="py-1 text-right font-medium">Leads</th>
                        <th className="py-1 text-right font-medium">Spent</th>
                        <th className="py-1 text-right font-medium">Per result</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => {
                        const report = (run.reports || []).find((r) => r.date === d);
                        const overridden = run.budgetByDay?.[d] !== undefined;
                        return (
                          <tr key={d} className={`border-t border-border/60 ${d === today ? "bg-primary/5" : ""}`}>
                            <td className="py-1.5 text-foreground">{d.slice(5)}</td>
                            <td className="py-1.5 text-right">
                              {canEdit ? (
                                <input
                                  type="number"
                                  min={0}
                                  data-test={`smm-day-budget-${d}`}
                                  defaultValue={budgetForDay(run, d)}
                                  key={`${d}-${budgetForDay(run, d)}`}
                                  onBlur={(e) => setDayBudget(campaign.id, run.id, d, Number(e.target.value) || 0)}
                                  className={`h-6 w-16 rounded border bg-card px-1 text-right font-mono text-[11px] outline-none focus:border-primary ${
                                    overridden ? "border-warning/60 text-warning" : "border-border text-foreground"
                                  }`}
                                />
                              ) : (
                                <span className={`font-mono ${overridden ? "text-warning" : "text-foreground"}`}>
                                  {formatCurrency(budgetForDay(run, d))}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-right font-mono text-foreground">{report ? report.leads : "—"}</td>
                            <td className="py-1.5 text-right font-mono text-foreground">{report ? formatCurrency(report.spend) : "—"}</td>
                            <td className="py-1.5 text-right font-mono text-foreground">{report ? formatCurrency(report.costPerResult) : "—"}</td>
                            <td className="py-1.5 text-right">
                              {canEdit && (
                                <button
                                  data-test={`smm-day-report-${d}`}
                                  onClick={() => setReportFor({ run, date: d })}
                                  /* A bare 11px glyph is not a tap target. The box is. */
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  aria-label={report ? "Correct this day" : "Add this day's figures"}
                                  title={report ? "Correct this day" : "Add this day's figures"}
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {canEdit && (creating
        ? <NewRunForm campaign={campaign} onDone={() => setCreating(false)} />
        : (
          <button
            data-test="smm-add-run"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Plus size={13} /> Run ads on this content
          </button>
        ))}

      {reportFor && (
        <SmmAdReportDialog
          campaign={campaign}
          run={reportFor.run}
          existing={reportFor.date ? (reportFor.run.reports || []).find((r) => r.date === reportFor.date) : null}
          actorName={actorName}
          onClose={() => setReportFor(null)}
          onMessage={onMessage}
        />
      )}
    </div>
  );
}

/**
 * Setting up a run.
 *
 * The scope picker is two decisions in one control — a whole kind, or named pieces — because those
 * are the only two things anybody actually agrees with a client, and offering the second one only
 * would mean ticking eight boxes to say "all the posters".
 */
function NewRunForm({ campaign, onDone }: { campaign: SmmCampaign; onDone: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SmmContentKind | "all">("all");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(isoDay(new Date()));
  const [days, setDays] = useState(7);
  const [dailyBudget, setDailyBudget] = useState(300);
  const [saving, setSaving] = useState(false);

  const choices = useMemo(
    () => (kind === "all" ? campaign.items : campaign.items.filter((i) => i.kind === kind)),
    [campaign.items, kind],
  );

  /**
   * What the team is most likely to be promoting: the things that just went up.
   *
   * An ad campaign is almost always run on a post that is already live — you boost the Dussehra
   * poster the morning after it goes out. Typing its name again from memory is both a chore and a
   * way to end up with a campaign called "dusera" that nobody can match to anything. Newest first,
   * six at most: this is a shortcut, not a second content list.
   */
  const recentlyPosted = useMemo(() => {
    const ms = (v: unknown) => {
      const t = v as { toMillis?: () => number; seconds?: number } | null;
      if (!t) return 0;
      if (typeof t.toMillis === "function") return t.toMillis();
      return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
    };
    return campaign.items
      .filter((i) => i.status === "posted" && i.title?.trim())
      .sort((a, b) => (ms(b.postedAt) - ms(a.postedAt)) || (b.uploadDate || "").localeCompare(a.uploadDate || ""))
      .slice(0, 6);
  }, [campaign.items]);

  /** Picking a live post names the campaign after it AND scopes the run to it, in one tap. */
  const promoteThis = (item: (typeof campaign.items)[number]) => {
    setName(item.title.trim());
    setKind(item.kind);
    setItemIds([item.id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await addAdRun(campaign.id, {
        name: name.trim() || (kind === "all" ? "All content" : SMM_CONTENT_KINDS.find((k) => k.key === kind)?.label || "Campaign"),
        scope: { kind, itemIds },
        startDate,
        days,
        dailyBudget,
      });
      toast({ title: "Campaign added" });
      onDone();
    } catch {
      toast({ title: "Not saved", description: "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-test="smm-new-run" className="space-y-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3">
      {/* The shortcut first, the free-text box under it — because the common case is boosting
          something that is already live, not inventing a name. */}
      {recentlyPosted.length > 0 && (
        <div data-test="smm-run-suggestions">
          <label className="text-[11px] font-medium text-muted-foreground">Promote something you just posted</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {recentlyPosted.map((i) => {
              const picked = itemIds.length === 1 && itemIds[0] === i.id;
              const Icon = KIND_ICON[i.kind];
              return (
                <button
                  key={i.id}
                  type="button"
                  data-test={`smm-run-suggest-${i.id}`}
                  aria-pressed={picked}
                  onClick={() => promoteThis(i)}
                  className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                    picked ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon size={11} className="shrink-0" />
                  <span className="truncate">{i.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] font-medium text-muted-foreground">Campaign name</label>
        <input
          value={name}
          data-test="smm-run-name"
          onChange={(e) => setName(e.target.value)}
          placeholder={recentlyPosted.length > 0 ? "Or type your own" : "e.g. Diwali offer"}
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground">What are we promoting?</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {([{ key: "all" as const, label: "Everything" }, ...SMM_CONTENT_KINDS]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              data-test={`smm-run-scope-${key}`}
              onClick={() => { setKind(key as SmmContentKind | "all"); setItemIds([]); }}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                kind === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {choices.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              {itemIds.length > 0 ? `${itemIds.length} picked` : "…or pick specific posts"}
            </summary>
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2">
              {choices.map((i) => (
                <label key={i.id} className="flex cursor-pointer items-center gap-2 py-1.5 text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={itemIds.includes(i.id)}
                    onChange={(e) => setItemIds((l) => (e.target.checked ? [...l, i.id] : l.filter((x) => x !== i.id)))}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  {i.title || "Untitled"} <span className="text-muted-foreground">{i.uploadDate || ""}</span>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[11px] font-medium text-muted-foreground">Starts</label>
          <input
            type="date"
            value={startDate}
            data-test="smm-run-start"
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="w-20">
          <label className="text-[11px] font-medium text-muted-foreground">Days</label>
          <input
            type="number"
            min={1}
            value={days}
            data-test="smm-run-days"
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="w-28">
          <label className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
            <IndianRupee size={10} /> a day
          </label>
          <input
            type="number"
            min={0}
            value={dailyBudget}
            data-test="smm-run-budget"
            onChange={(e) => setDailyBudget(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Total if nothing changes: <strong className="text-foreground">{formatCurrency(days * dailyBudget)}</strong>.
        Any single day can be changed later without touching this figure.
      </p>

      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          data-test="smm-run-save"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add campaign
        </button>
      </div>
    </div>
  );
}
