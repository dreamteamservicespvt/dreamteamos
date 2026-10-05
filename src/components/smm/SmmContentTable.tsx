/**
 * The month's plan.
 *
 * ── One component, two shapes ─────────────────────────────────────────────────────────────────
 * A month's plan is tabular data — the same six facts about each of sixteen rows — so on a desktop
 * it is a real table, which is the only layout that lets somebody scan a column and spot the two
 * posts with no date on them. On a phone the same rows render as cards, because a six-column table
 * on a 360px screen is a horizontal scrollbar nobody uses.
 *
 * Both shapes are built here from one list of rows rather than as two components, so a column added
 * to the table cannot quietly go missing on the phones most of this team actually works on.
 */
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus, Sparkles, Image as ImageIcon, Video, ChevronRight, Link2, List, CalendarDays } from "lucide-react";
import { addItem, addItems } from "@/services/smm";
import { clipsPerVideoOf, videoLengthLabel } from "@/utils/smmPackage";
import SmmCalendar from "@/components/smm/SmmCalendar";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";
import {
  SMM_EXTRA_DURATIONS, SMM_EXTRA_WORK_TYPES, extraWorkProblem, extraWorkTitle, extraWorkTypeInfo, isoDay,
  normaliseDuration, postLinks,
} from "@/utils/smmPlan";
import {
  SMM_CONTENT_KINDS, type SmmCampaign, type SmmContentItem, type SmmContentKind, type SmmExtraWorkType,
} from "@/types/smm";
import { DueChip, PlatformChips, StatusChip } from "@/components/smm/SmmChips";

const KIND_ICON: Record<SmmContentKind, LucideIcon> = { poster: ImageIcon, ai_ad: Sparkles, real_video: Video };

type KindFilter = SmmContentKind | "all";

export default function SmmContentTable({ campaign, canEdit, onOpen }: {
  campaign: SmmCampaign;
  canEdit: boolean;
  onOpen: (item: SmmContentItem) => void;
}) {
  const { toast } = useToast();
  const today = isoDay(new Date());
  const [filter, setFilter] = useState<KindFilter>("all");
  /** The plan as rows (what to do next) or as a calendar (what the client's feed looks like). */
  const [view, setView] = useState<"list" | "calendar">("list");
  const lengthLabel = videoLengthLabel(clipsPerVideoOf(campaign));
  /** What a row says under its title: a video's length, extra work, a piece carried in from last month. */
  const rowNotes = (item: SmmContentItem) => (
    <>
      {item.kind === "ai_ad" && !item.extra && <span className="mr-1.5 text-[10px] text-muted-foreground">{lengthLabel}</span>}
      {item.carriedFrom && <span data-test="smm-row-carried" className="mr-1.5 text-[10px] font-medium text-info">From {item.carriedFrom.label}</span>}
    </>
  );
  const [adding, setAdding] = useState(false);
  const user = useAuthStore((s) => s.user);
  /** The extra-work form (2026-10-01): what it is, and a video's length. Null while closed. */
  const [extraForm, setExtraForm] = useState<{ type: SmmExtraWorkType; duration: string; custom: string; note: string } | null>(null);

  /**
   * Undated posts sink to the bottom, everything else runs in date order.
   *
   * That ordering is the point of the screen: the next thing to do is the top row, and the rows
   * with no date are the ones somebody still has to plan — which is a different kind of problem and
   * belongs at the end rather than scattered through the week.
   */
  const rows = useMemo(() => {
    const list = filter === "all" ? campaign.items : campaign.items.filter((i) => i.kind === filter);
    return [...list].sort((a, b) => {
      if (!a.uploadDate && !b.uploadDate) return 0;
      if (!a.uploadDate) return 1;
      if (!b.uploadDate) return -1;
      if (a.uploadDate !== b.uploadDate) return a.uploadDate < b.uploadDate ? -1 : 1;
      return (a.uploadTime || "").localeCompare(b.uploadTime || "");
    });
  }, [campaign.items, filter]);

  const add = async (kind: SmmContentKind) => {
    setAdding(true);
    try {
      await addItems(campaign.id, kind, 1, false);
      toast({ title: "Added to the plan" });
    } catch {
      toast({ title: "Not added", description: "Try again.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  /**
   * Extra work goes through `addItem`, which tells the seller — the old button used `addItems`, which
   * told nobody while its toast said the sales member had been told.
   */
  const extraDuration = extraForm ? (extraForm.duration === "custom" ? normaliseDuration(extraForm.custom) : extraForm.duration) : "";
  const extraProblem = extraForm ? extraWorkProblem(extraForm.type, extraDuration) : "";
  const addExtra = async () => {
    if (!extraForm || !user || extraProblem) return;
    setAdding(true);
    try {
      await addItem(campaign.id, {
        kind: extraWorkTypeInfo(extraForm.type).kind,
        extra: true,
        extraType: extraForm.type,
        extraDuration,
        notes: extraForm.note.trim() || null,
      }, user);
      toast({
        title: `Extra work added: ${extraWorkTitle(extraForm.type, extraDuration)}`,
        description: campaign.soldBy && campaign.soldBy !== user.uid ? "The sales member has been told, so they can collect for it." : undefined,
      });
      setExtraForm(null);
    } catch {
      toast({ title: "Not added", description: "Try again.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div data-test="smm-content-table">
      {/* ── Filter + add ─────────────────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {([{ key: "all" as const, label: "All" }, ...SMM_CONTENT_KINDS]).map(({ key, label }) => {
          const count = key === "all" ? campaign.items.length : campaign.items.filter((i) => i.kind === key).length;
          return (
            <button
              key={key}
              data-test={`smm-filter-${key}`}
              onClick={() => setFilter(key as KindFilter)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
        <div className="ml-auto inline-flex rounded-lg border border-border p-0.5">
          {([
            { key: "list" as const, label: "List", Icon: List },
            { key: "calendar" as const, label: "Calendar", Icon: CalendarDays },
          ]).map(({ key, label, Icon }) => (
            <button key={key} data-test={`smm-view-${key}`} aria-pressed={view === key} onClick={() => setView(key)}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        /* The client's whole run, opened on this month; the kind filter applies to every month. */
        <SmmCalendar campaign={campaign} kind={filter} onOpen={onOpen} />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing planned here yet.
        </p>
      ) : (
        <>
          {/* Desktop: a real table.
              `lg`, not `md`: the seven columns need about 930px, so a 768px tablet was being
              given a table it had to scroll sideways. It gets the cards instead, which fit.
              The scroller is still there for a narrow desktop window. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Content</th>
                  <th className="px-3 py-2 text-left font-medium">Upload</th>
                  <th className="px-3 py-2 text-left font-medium">Accounts</th>
                  <th className="px-3 py-2 text-left font-medium">Links</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Who</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <tr
                      key={item.id}
                      data-test="smm-row"
                      onClick={() => onOpen(item)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-accent/50"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className="shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">{item.title || <span className="text-muted-foreground">Untitled</span>}</p>
                            {rowNotes(item)}
                            {item.extra && <span className="text-[10px] font-medium text-warning">Extra work{item.extraType ? ` · ${extraWorkTitle(item.extraType, item.extraDuration)}` : ""}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-foreground">{item.uploadDate || "—"}{item.uploadTime ? ` · ${item.uploadTime}` : ""}</div>
                        <DueChip item={item} today={today} />
                      </td>
                      <td className="px-3 py-2"><PlatformChips platforms={item.platforms} /></td>
                      <td className="px-3 py-2">
                        {/* Only a posted row owes links, and a posted row WITHOUT them is the one
                            worth spotting — that is the update the group never got. */}
                        {item.status !== "posted" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : postLinks(item).length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <Link2 size={12} /> {postLinks(item).length}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-warning" title="Posted, but no link pasted yet">
                            <Link2 size={12} /> none
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2"><StatusChip status={item.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {item.makerName || "—"}
                        {item.publisherName && item.publisherName !== item.makerName ? ` → ${item.publisherName}` : ""}
                      </td>
                      <td className="px-2 text-muted-foreground"><ChevronRight size={14} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet: the same rows as cards, with the two facts that decide what to do first. */}
          <div className="space-y-2 lg:hidden">
            {rows.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <button
                  key={item.id}
                  data-test="smm-card"
                  onClick={() => onOpen(item)}
                  className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon size={14} className="shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {item.title || "Untitled"}
                      </span>
                    </div>
                    <StatusChip status={item.status} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <DueChip item={item} today={today} />
                    <PlatformChips platforms={item.platforms} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{item.uploadDate || "No date"}{item.uploadTime ? ` · ${item.uploadTime}` : ""}</span>
                    <span>{item.makerName || "Unassigned"}{item.extra ? " · extra" : ""}</span>
                  </div>
                  {(item.kind === "ai_ad" || item.carriedFrom) && <div className="mt-0.5">{rowNotes(item)}</div>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SMM_CONTENT_KINDS.map(({ key, singular }) => (
            <button
              key={key}
              data-test={`smm-add-${key}`}
              disabled={adding}
              onClick={() => add(key)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Plus size={12} /> {singular}
            </button>
          ))}
          {/*
            Extra work is its own button rather than a checkbox inside the dialog, because it has a
            consequence — the sales member is told the moment it is recorded, so they can collect for
            it or decide out loud to give it away. Something with a consequence should not be a tick
            box somebody can miss.
          */}
          <button
            data-test="smm-add-extra"
            disabled={adding}
            onClick={() => setExtraForm(extraForm ? null : { type: "poster", duration: "32s", custom: "", note: "" })}
            className="inline-flex items-center gap-1 rounded-lg border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
          >
            <Plus size={12} /> Extra work (beyond the package)
          </button>
        </div>
      )}

      {canEdit && extraForm && (
        <div data-test="smm-extra-form" className="mt-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">Extra work — what was made?</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] text-muted-foreground">Type of work</span>
              <select
                data-test="smm-extra-type"
                value={extraForm.type}
                onChange={(e) => setExtraForm({ ...extraForm, type: e.target.value as SmmExtraWorkType })}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
              >
                {SMM_EXTRA_WORK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            {extraWorkTypeInfo(extraForm.type).video && (
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] text-muted-foreground">Duration</span>
                <select
                  data-test="smm-extra-duration"
                  value={extraForm.duration}
                  onChange={(e) => setExtraForm({ ...extraForm, duration: e.target.value })}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  {SMM_EXTRA_DURATIONS.map((d) => <option key={d} value={d}>{parseInt(d, 10)} sec</option>)}
                  <option value="custom">Other…</option>
                </select>
              </label>
            )}
            {extraWorkTypeInfo(extraForm.type).video && extraForm.duration === "custom" && (
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] text-muted-foreground">Seconds</span>
                <input
                  data-test="smm-extra-seconds"
                  type="number" min={4} max={600} inputMode="numeric"
                  value={extraForm.custom}
                  onChange={(e) => setExtraForm({ ...extraForm, custom: e.target.value })}
                  className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                />
              </label>
            )}
            <label className="min-w-[140px] flex-1">
              <span className="mb-1 block text-[11px] text-muted-foreground">Note (optional)</span>
              <input
                value={extraForm.note}
                onChange={(e) => setExtraForm({ ...extraForm, note: e.target.value })}
                placeholder="e.g. Diwali offer video"
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-1.5">
              <button onClick={() => setExtraForm(null)} disabled={adding}
                className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
                Cancel
              </button>
              <button data-test="smm-extra-save" onClick={addExtra} disabled={adding || !!extraProblem}
                className="h-8 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                Add extra work
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground" data-test="smm-extra-preview">
            {extraProblem || `Adds “${extraWorkTitle(extraForm.type, extraDuration)}” to the plan, and tells the sales member so they can collect for it.`}
          </p>
        </div>
      )}
    </div>
  );
}
