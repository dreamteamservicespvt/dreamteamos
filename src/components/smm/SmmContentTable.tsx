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
import { Plus, Sparkles, Image as ImageIcon, Video, ChevronRight, Link2 } from "lucide-react";
import { addItems } from "@/services/smm";
import { useToast } from "@/hooks/use-toast";
import { isoDay, postLinks } from "@/utils/smmPlan";
import { SMM_CONTENT_KINDS, type SmmCampaign, type SmmContentItem, type SmmContentKind } from "@/types/smm";
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
  const [adding, setAdding] = useState(false);

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

  const add = async (kind: SmmContentKind, extra: boolean) => {
    setAdding(true);
    try {
      await addItems(campaign.id, kind, 1, extra);
      toast({
        title: extra ? "Extra work added" : "Added to the plan",
        description: extra ? "The sales member has been told, so they can collect for it." : undefined,
      });
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
      </div>

      {rows.length === 0 ? (
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
                            {item.extra && <span className="text-[10px] font-medium text-warning">Extra work</span>}
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
              onClick={() => add(key, false)}
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
            onClick={() => add(filter === "all" ? "poster" : filter, true)}
            className="inline-flex items-center gap-1 rounded-lg border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
          >
            <Plus size={12} /> Extra work (beyond the package)
          </button>
        </div>
      )}
    </div>
  );
}
