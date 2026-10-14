import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert,
  Clock3, Image as ImageIcon, LayoutGrid, Loader2, Megaphone, Search,
  Sparkles, Video, Users, MessageCircle, ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { daysUntilDue, isOverdue, isPosted, isoDay } from "@/utils/smmPlan";
import { monthGlance, type SmmGlance } from "@/utils/smmGlance";
import { needsSetup } from "@/utils/smmPackage";
import { SMM_CONTENT_KINDS, type SmmCampaign, type SmmContentItem, type SmmContentKind } from "@/types/smm";

type Filter = "all" | "overdue" | "due" | "waiting" | "risk" | "setup";
type ActionCategory = "overdue" | "due" | "waiting" | "changes" | "planning" | "setup" | "risk";

interface ActionRow {
  id: string;
  campaign: SmmCampaign;
  item?: SmmContentItem;
  glance: SmmGlance;
  category: ActionCategory;
  rank: number;
  title: string;
  reason: string;
  dueLabel: string;
  owner: string;
}

const STATUS_CLASS: Record<string, string> = {
  off_track: "border-red-200 bg-red-50 text-red-700",
  at_risk: "border-amber-200 bg-amber-50 text-amber-800",
  on_track: "border-emerald-200 bg-emerald-50 text-emerald-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  setup: "border-sky-200 bg-sky-50 text-sky-700",
  not_started: "border-slate-200 bg-slate-50 text-slate-700",
  on_hold: "border-slate-200 bg-slate-50 text-slate-700",
  history: "border-slate-200 bg-slate-50 text-slate-700",
  nothing: "border-slate-200 bg-slate-50 text-slate-700",
};

const ACTION_CLASS: Record<ActionCategory, string> = {
  overdue: "bg-red-50 text-red-700 ring-red-200",
  due: "bg-amber-50 text-amber-800 ring-amber-200",
  waiting: "bg-sky-50 text-sky-700 ring-sky-200",
  changes: "bg-violet-50 text-violet-700 ring-violet-200",
  planning: "bg-slate-100 text-slate-700 ring-slate-200",
  setup: "bg-sky-50 text-sky-700 ring-sky-200",
  risk: "bg-amber-50 text-amber-800 ring-amber-200",
};

const ACTION_LABEL: Record<ActionCategory, string> = {
  overdue: "Overdue",
  due: "Due soon",
  waiting: "Waiting on client",
  changes: "Changes requested",
  planning: "Needs a date",
  setup: "Needs setup",
  risk: "At risk",
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All clients" },
  { key: "overdue", label: "Overdue" },
  { key: "due", label: "Due soon" },
  { key: "waiting", label: "Waiting on client" },
  { key: "risk", label: "At risk" },
  { key: "setup", label: "Needs setup" },
];

function dateLabel(day: string | null | undefined): string {
  if (!day) return "No date set";
  const value = new Date(day + "T12:00:00");
  if (Number.isNaN(value.getTime())) return day;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(value);
}

function contentLabel(kind: SmmContentKind): string {
  return SMM_CONTENT_KINDS.find((entry) => entry.key === kind)?.singular || "Deliverable";
}

function itemTitle(item: SmmContentItem, index: number): string {
  return item.title?.trim() || (contentLabel(item.kind) + " " + (index + 1));
}

function ownerLabel(campaign: SmmCampaign, item?: SmmContentItem): string {
  const itemOwners = [item?.makerName, item?.publisherName].filter(Boolean);
  if (itemOwners.length) return Array.from(new Set(itemOwners)).join(" · ");
  const teamOwners = [campaign.team?.creator?.name, campaign.team?.publisher?.name].filter(Boolean);
  return teamOwners.length ? Array.from(new Set(teamOwners)).join(" · ") : "Owner not recorded";
}

function dueLabel(item: SmmContentItem, today: string): string {
  if (!item.uploadDate) return "No posting date set";
  const delta = daysUntilDue(item, today);
  if (delta < 0) return Math.abs(delta) + (Math.abs(delta) === 1 ? " day overdue" : " days overdue");
  if (delta === 0) return "Due today";
  if (delta === 1) return "Due tomorrow";
  return "Due " + dateLabel(item.uploadDate);
}

function categoryFor(item: SmmContentItem, today: string): { category: ActionCategory; rank: number } | null {
  if (isPosted(item)) return null;
  const delta = daysUntilDue(item, today);
  if (delta !== null && delta < 0) return { category: "overdue", rank: 0 };
  if (delta !== null && delta <= 1) return { category: "due", rank: 1 };
  if (item.status === "changes_requested" || item.approval?.state === "changes") {
    return { category: "changes", rank: 2 };
  }
  if (item.approval?.state === "waiting") return { category: "waiting", rank: 3 };
  if (delta !== null && delta <= 3) return { category: "due", rank: 4 };
  if (!item.uploadDate && item.status === "planned") return { category: "planning", rank: 5 };
  return null;
}

function buildActions(campaigns: SmmCampaign[], today: string): ActionRow[] {
  const rows: ActionRow[] = [];
  for (const campaign of campaigns) {
    const glance = monthGlance(campaign, today);
    if (needsSetup(campaign, today) && !campaign.history) {
      rows.push({
        id: campaign.id + ":setup",
        campaign,
        glance,
        category: "setup",
        rank: 1,
        title: "Campaign setup needs attention",
        reason: "Check the campaign setup and delivery team.",
        dueLabel: "Setup required",
        owner: ownerLabel(campaign),
      });
    }

    if (!campaign.history) {
      (campaign.items || []).forEach((item, index) => {
        const result = categoryFor(item, today);
        // Undated checklist rows are useful after a team is assigned; before setup, show the setup
        // action instead of flooding the queue with every blank deliverable.
        if (!result || (result.category === "planning" && needsSetup(campaign, today))) return;
        let title = itemTitle(item, index);
        let reason = item.extra ? "Additional work · separate from the package commitment" : contentLabel(item.kind);
        if (result.category === "overdue") {
          title = "Overdue: " + title;
          reason += " · Past its promised posting date";
        } else if (result.category === "waiting") {
          title = "Client approval pending: " + title;
          reason += " · Waiting for the client's decision";
        } else if (result.category === "changes") {
          title = "Changes requested: " + title;
          reason += " · Needs revision before approval";
        } else if (result.category === "planning") {
          title = "Schedule: " + title;
          reason += " · No posting date has been set";
        } else {
          reason += " · " + (item.approval?.state === "waiting" ? "Awaiting client approval" : "Upcoming deadline");
        }
        rows.push({
          id: campaign.id + ":" + item.id,
          campaign,
          item,
          glance,
          category: result.category,
          rank: result.rank,
          title,
          reason,
          dueLabel: dueLabel(item, today),
          owner: ownerLabel(campaign, item),
        });
      });
    }

    const alreadyHasAction = rows.some((row) => row.campaign.id === campaign.id);
    if (!campaign.history && !alreadyHasAction && (glance.status === "off_track" || glance.status === "at_risk")) {
      rows.push({
        id: campaign.id + ":risk",
        campaign,
        glance,
        category: "risk",
        rank: 6,
        title: "Campaign is " + glance.label.toLowerCase(),
        reason: glance.reason,
        dueLabel: "Review plan",
        owner: ownerLabel(campaign),
      });
    }
  }
  return rows.sort((a, b) => a.rank - b.rank || a.dueLabel.localeCompare(b.dueLabel));
}

function matchesFilter(row: ActionRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return row.category === "overdue";
  if (filter === "due") return row.category === "due";
  if (filter === "waiting") return row.category === "waiting";
  if (filter === "setup") return row.category === "setup" || row.category === "planning";
  return row.glance.status === "off_track" || row.glance.status === "at_risk";
}

function StatCard({ label, value, note, Icon, tone, onClick }: {
  label: string;
  value: number;
  note: string;
  Icon: LucideIcon;
  tone: "red" | "amber" | "blue" | "green";
  onClick: () => void;
}) {
  const palette = {
    red: "border-red-100 bg-red-50/70 text-red-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-800",
    blue: "border-blue-100 bg-blue-50/70 text-blue-700",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  }[tone];
  return (
    <button type="button" onClick={onClick}
      className={"group flex min-w-0 items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm " + palette}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80">
        <Icon size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium opacity-80">{label}</span>
        <span className="mt-0.5 block text-2xl font-bold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-xs opacity-75">{note}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 opacity-50 transition group-hover:translate-x-0.5" />
    </button>
  );
}

export default function SmmOperationsView({ campaigns, loading, canSetUp, onAddSale, onSetUp, onClassicUI }: {
  campaigns: SmmCampaign[];
  loading: boolean;
  canSetUp: boolean;
  onAddSale?: () => void;
  onSetUp?: (campaign: SmmCampaign) => void;
  onClassicUI: () => void;
}) {
  const today = isoDay(new Date());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const glances = useMemo(() => campaigns.map((campaign) => ({
    campaign,
    glance: monthGlance(campaign, today),
  })), [campaigns, today]);
  const actions = useMemo(() => buildActions(campaigns, today), [campaigns, today]);

  const stats = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let waiting = 0;
    for (const campaign of campaigns) {
      if (campaign.history) continue;
      for (const item of campaign.items || []) {
        if (isPosted(item)) continue;
        if (isOverdue(item, today)) overdue += 1;
        else {
          const delta = daysUntilDue(item, today);
          if (delta !== null && delta <= 3) dueSoon += 1;
        }
        if (item.approval?.state === "waiting") waiting += 1;
      }
    }
    const risk = glances.filter(({ glance }) => glance.status === "off_track" || glance.status === "at_risk").length;
    return { overdue, dueSoon, waiting, risk };
  }, [campaigns, glances, today]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (campaign: SmmCampaign) =>
    !q || [campaign.businessName, campaign.clientName, campaign.packageLabel, campaign.clientPhone]
      .some((value) => (value || "").toLowerCase().includes(q))
      || (campaign.items || []).some((item) => (item.title || "").toLowerCase().includes(q));

  const visibleActions = actions.filter((row) => matchesFilter(row, filter) && matchesSearch(row.campaign));
  const visibleCampaigns = glances.filter(({ campaign, glance }) => {
    if (!matchesSearch(campaign)) return false;
    if (filter === "overdue") return (campaign.items || []).some((item) => isOverdue(item, today));
    if (filter === "due") return (campaign.items || []).some((item) => {
      const delta = daysUntilDue(item, today);
      return !isPosted(item) && delta !== null && delta >= 0 && delta <= 3;
    });
    if (filter === "waiting") return (campaign.items || []).some((item) => !isPosted(item) && item.approval?.state === "waiting");
    if (filter === "risk") return glance.status === "off_track" || glance.status === "at_risk";
    if (filter === "setup") return needsSetup(campaign, today);
    return true;
  });

  const actionCount = (key: Filter) => key === "all"
    ? actions.filter((row) => matchesSearch(row.campaign)).length
    : key === "overdue" ? stats.overdue
    : key === "due" ? stats.dueSoon
    : key === "waiting" ? stats.waiting
    : key === "risk" ? stats.risk
    : campaigns.filter((campaign) => needsSetup(campaign, today)).length;

  return (
    <div data-test="smm-operations-view" className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Megaphone size={21} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Social Media Management</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Focus on what needs action today.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-test="smm-classic-ui" onClick={onClassicUI}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted">
            <LayoutGrid size={15} /> Classic UI
          </button>
          {canSetUp && onAddSale && (
            <button type="button" onClick={onAddSale}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <span aria-hidden="true">+</span> Add SMM sale
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Overdue work" value={stats.overdue} note="Past the planned date" Icon={AlertTriangle} tone="red" onClick={() => setFilter("overdue")} />
        <StatCard label="Due in 3 days" value={stats.dueSoon} note="Prepare before the deadline" Icon={Clock3} tone="amber" onClick={() => setFilter("due")} />
        <StatCard label="Waiting on client" value={stats.waiting} note="Approval decision needed" Icon={MessageCircle} tone="blue" onClick={() => setFilter("waiting")} />
        <StatCard label="Campaigns at risk" value={stats.risk} note="Behind plan or already late" Icon={CircleAlert} tone="green" onClick={() => setFilter("risk")} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Priority action queue</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">The next action for work that is late, blocked or approaching its deadline.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search SMM clients and deliverables"
              placeholder="Search clients or deliverables"
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
          {FILTERS.map((entry) => (
            <button type="button" key={entry.key} onClick={() => setFilter(entry.key)} aria-pressed={filter === entry.key}
              className={"inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition " +
                (filter === entry.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {entry.label}
              <span className={"rounded-md px-1.5 py-0.5 tabular-nums " + (filter === entry.key ? "bg-white/20" : "bg-muted")}>
                {actionCount(entry.key)}
              </span>
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 size={19} className="animate-spin" /> Loading campaigns…</div>
        ) : visibleActions.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <CheckCircle2 size={25} className="text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-foreground">No matching actions</p>
            <p className="mt-1 text-xs text-muted-foreground">There is nothing in this category based on the current campaign records.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleActions.slice(0, 8).map((row) => (
              <div key={row.id} className="flex flex-col gap-3 p-4 transition hover:bg-muted/30 sm:flex-row sm:items-center">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  {row.category === "overdue" ? <AlertTriangle size={17} /> :
                    row.category === "waiting" ? <MessageCircle size={17} /> :
                    row.category === "changes" ? <ImageIcon size={17} /> :
                    row.category === "planning" ? <CalendarClock size={17} /> :
                    row.category === "risk" ? <CircleAlert size={17} /> : <ClipboardList size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{row.title}</span>
                    <span className={"inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset " + ACTION_CLASS[row.category]}>
                      {ACTION_LABEL[row.category]}
                    </span>
                    {row.item?.extra && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Extra work</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{row.campaign.businessName || row.campaign.clientName} · {row.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.owner} · {row.dueLabel}</p>
                </div>
                {row.category === "setup" && onSetUp ? (
                  <button type="button" onClick={() => onSetUp(row.campaign)}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                    Set up <ArrowRight size={13} />
                  </button>
                ) : (
                  <Link to={"/smm/" + row.campaign.id}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">
                    Open work <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            ))}
            {visibleActions.length > 8 && (
              <p className="px-4 py-3 text-center text-xs text-muted-foreground">Showing 8 of {visibleActions.length} actions. Use the filters or search to narrow the list.</p>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="font-semibold text-foreground">Client campaigns</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Package fulfilment and next scheduled deliverable.</p>
          </div>
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">{visibleCampaigns.length} clients</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 size={19} className="animate-spin" /> Loading campaigns…</div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">No clients match this filter.</div>
        ) : (
          <div className="divide-y divide-border">
            <div className="hidden grid-cols-[minmax(180px,1.35fr)_minmax(210px,1.4fr)_130px_minmax(160px,1fr)_90px] gap-4 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <span>Client & package</span><span>Package progress</span><span>Health</span><span>Next deliverable</span><span className="text-right">Action</span>
            </div>
            {visibleCampaigns.map(({ campaign, glance }) => {
              const next = (campaign.items || [])
                .filter((item) => !isPosted(item) && Boolean(item.uploadDate))
                .sort((a, b) => (a.uploadDate || "").localeCompare(b.uploadDate || ""))[0];
              const extras = (campaign.items || []).filter((item) => item.extra).length;
              const setup = needsSetup(campaign, today);
              return (
                <div key={campaign.id} className="grid grid-cols-1 gap-3 px-4 py-4 transition hover:bg-muted/20 lg:grid-cols-[minmax(180px,1.35fr)_minmax(210px,1.4fr)_130px_minmax(160px,1fr)_90px] lg:items-center lg:gap-4">
                  <div className="min-w-0">
                    <Link to={"/smm/" + campaign.id} className="block truncate text-sm font-semibold text-foreground hover:text-primary">
                      {campaign.businessName || campaign.clientName || "Unnamed client"}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{campaign.packageLabel || "Custom package"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{dateLabel(campaign.cycle?.startDate)} – {dateLabel(campaign.cycle?.endDate)}</p>
                    {extras > 0 && <span className="mt-1.5 inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{extras} extra {extras === 1 ? "item" : "items"}</span>}
                  </div>
                  <div className="space-y-2">
                    {SMM_CONTENT_KINDS.filter((kind) => Number(campaign.commitments?.[kind.key] || 0) > 0).map((kind) => {
                      const promised = Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
                      const posted = (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length;
                      const percent = promised > 0 ? Math.min(100, Math.round((posted / promised) * 100)) : 0;
                      const barColor = kind.key === "poster" ? "bg-violet-500" : kind.key === "real_video" ? "bg-emerald-500" : "bg-blue-500";
                      const icon = kind.key === "poster" ? <ImageIcon size={12} /> : <Video size={12} />;
                      return (
                        <div key={kind.key} className="grid grid-cols-[minmax(90px,1fr)_auto_minmax(48px,0.8fr)] items-center gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">{icon}{kind.label}</span>
                          <span className="font-medium tabular-nums text-foreground">{posted}/{promised}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <span className={"block h-full rounded-full " + barColor} style={{ width: percent + "%" }} />
                          </span>
                        </div>
                      );
                    })}
                    {extras > 0 && <p className="text-[10px] text-muted-foreground">Extra work is excluded from package fulfilment.</p>}
                  </div>
                  <div>
                    <span className={"inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold " + (STATUS_CLASS[glance.status] || STATUS_CLASS.not_started)}>
                      {glance.label}
                    </span>
                    <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{glance.reason}</p>
                  </div>
                  <div className="min-w-0">
                    {next ? (
                      <>
                        <p className="truncate text-sm font-medium text-foreground">{itemTitle(next, 0)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{dateLabel(next.uploadDate)} · {dueLabel(next, today)}</p>
                      </>
                    ) : <p className="text-xs text-muted-foreground">No upcoming dated deliverable</p>}
                  </div>
                  <div className="flex items-center gap-2 lg:justify-end">
                    {setup && onSetUp ? (
                      <button type="button" onClick={() => onSetUp(campaign)}
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Set up</button>
                    ) : (
                      <Link to={"/smm/" + campaign.id}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">View</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <Sparkles size={14} className="mt-0.5 shrink-0" />
        Campaign status is calculated from existing SMM records. Publishing and completion are not independently verified by this screen.
      </p>
    </div>
  );
}
