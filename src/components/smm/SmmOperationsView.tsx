import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Clock3,
  Image as ImageIcon, LayoutGrid, Loader2, Megaphone, MessageCircle, Plus,
  Search, Video,
} from "lucide-react";
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
  sortDate: string;
  title: string;
  reason: string;
  dueLabel: string;
  owner: string;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All work" },
  { key: "overdue", label: "Overdue" },
  { key: "due", label: "Due soon" },
  { key: "waiting", label: "Waiting on client" },
  { key: "risk", label: "At risk" },
  { key: "setup", label: "Needs planning" },
];

const STATUS_STYLE: Record<string, string> = {
  off_track: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
  at_risk: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:ring-amber-900",
  on_track: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-900",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-900",
  setup: "bg-muted text-muted-foreground ring-border",
  not_started: "bg-muted text-muted-foreground ring-border",
  on_hold: "bg-muted text-muted-foreground ring-border",
  history: "bg-muted text-muted-foreground ring-border",
  nothing: "bg-muted text-muted-foreground ring-border",
};

const CATEGORY_STYLE: Record<ActionCategory, string> = {
  overdue: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  due: "bg-amber-50 text-amber-800 dark:bg-amber-950/35 dark:text-amber-300",
  waiting: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  changes: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  planning: "bg-muted text-muted-foreground",
  setup: "bg-muted text-muted-foreground",
  risk: "bg-amber-50 text-amber-800 dark:bg-amber-950/35 dark:text-amber-300",
};

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  overdue: "Overdue",
  due: "Due soon",
  waiting: "Waiting on client",
  changes: "Changes requested",
  planning: "Needs scheduling",
  setup: "Needs setup",
  risk: "At risk",
};

const CONTENT_ICON: Record<SmmContentKind, typeof ImageIcon> = {
  poster: ImageIcon,
  ai_ad: Video,
  real_video: Video,
};

function safeDateLabel(day: string | null | undefined): string {
  if (!day) return "No date";
  const value = new Date(day + "T12:00:00");
  if (Number.isNaN(value.getTime())) return day;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(value);
}

function contentLabel(kind: SmmContentKind): string {
  return SMM_CONTENT_KINDS.find((entry) => entry.key === kind)?.singular || "Deliverable";
}

function titleOf(item: SmmContentItem, index: number): string {
  return item.title?.trim() || (contentLabel(item.kind) + " " + (index + 1));
}

function ownerOf(campaign: SmmCampaign, item?: SmmContentItem): string {
  const names = [item?.makerName, item?.publisherName].filter(Boolean) as string[];
  if (names.length) return [...new Set(names)].join(" · ");
  const teamNames = [campaign.team?.creator?.name, campaign.team?.publisher?.name, campaign.team?.marketer?.name]
    .filter(Boolean) as string[];
  return teamNames.length ? [...new Set(teamNames)].join(" · ") : "Owner not assigned";
}

function dueText(item: SmmContentItem, today: string): string {
  if (!item.uploadDate) return "Date not set";
  const delta = daysUntilDue(item, today);
  if (delta < 0) return Math.abs(delta) + (Math.abs(delta) === 1 ? " day overdue" : " days overdue");
  if (delta === 0) return "Due today";
  if (delta === 1) return "Due tomorrow";
  return "Due " + safeDateLabel(item.uploadDate);
}

function actionFor(item: SmmContentItem, today: string): { category: ActionCategory; rank: number } | null {
  if (isPosted(item)) return null;
  const delta = daysUntilDue(item, today);
  if (delta !== null && delta < 0) return { category: "overdue", rank: 0 };
  if (item.status === "changes_requested" || item.approval?.state === "changes") {
    return { category: "changes", rank: 1 };
  }
  if (item.approval?.state === "waiting") return { category: "waiting", rank: 2 };
  if (delta !== null && delta <= 3) return { category: "due", rank: 3 };
  return null;
}

function buildActions(campaigns: SmmCampaign[], today: string): ActionRow[] {
  const rows: ActionRow[] = [];
  campaigns.forEach((campaign) => {
    if (campaign.status !== "active" || campaign.history) return;
    const glance = monthGlance(campaign, today);

    if (needsSetup(campaign, today)) {
      rows.push({
        id: campaign.id + ":setup", campaign, glance, category: "setup", rank: 0,
        sortDate: campaign.cycle.endDate, title: "Set up this campaign",
        reason: "Assign the team and plan deliverables before production starts.",
        dueLabel: "Setup required", owner: "Campaign owner",
      });
      return;
    }

    const unplanned = (campaign.items || []).filter((item) =>
      !isPosted(item) && !item.uploadDate &&
      item.approval?.state !== "waiting" && item.approval?.state !== "changes" &&
      item.status !== "changes_requested"
    );
    const kinds = [...new Set(unplanned.map((item) => item.kind))];
    if (unplanned.length > 0) {
      rows.push({
        id: campaign.id + ":planning", campaign, glance, category: "planning", rank: 4,
        sortDate: campaign.cycle.endDate,
        title: unplanned.length + " deliverable" + (unplanned.length === 1 ? "" : "s") + " need scheduling",
        reason: kinds.map(contentLabel).join(", ") + " · Set realistic production and posting dates.",
        dueLabel: "Date not set", owner: ownerOf(campaign),
      });
    }

    (campaign.items || []).forEach((item, index) => {
      const result = actionFor(item, today);
      if (!result) return;
      let reason = contentLabel(item.kind);
      if (item.extra) reason = "Additional work · " + reason;
      if (item.approval?.state === "waiting") reason += " · Awaiting client approval";
      if (item.status === "changes_requested" || item.approval?.state === "changes") reason += " · Revision required";
      if (result.category === "overdue" && item.approval?.state === "waiting") reason += " · Client response is also pending";
      rows.push({
        id: campaign.id + ":" + item.id, campaign, item, glance, category: result.category, rank: result.rank,
        sortDate: item.uploadDate || campaign.cycle.endDate,
        title: titleOf(item, index), reason, dueLabel: dueText(item, today), owner: ownerOf(campaign, item),
      });
    });

    const hasSpecificAction = rows.some((row) => row.campaign.id === campaign.id);
    if (!hasSpecificAction && (glance.status === "off_track" || glance.status === "at_risk")) {
      rows.push({
        id: campaign.id + ":risk", campaign, glance, category: "risk", rank: 5,
        sortDate: campaign.cycle.endDate, title: glance.label + ": review delivery plan",
        reason: glance.reason, dueLabel: safeDateLabel(campaign.cycle.endDate), owner: ownerOf(campaign),
      });
    }
  });
  return rows.sort((a, b) => a.rank - b.rank || a.sortDate.localeCompare(b.sortDate));
}

function rowMatchesFilter(row: ActionRow, filter: Filter, today: string): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return Boolean(row.item && isOverdue(row.item, today));
  if (filter === "due") {
    if (!row.item || isPosted(row.item)) return false;
    const delta = daysUntilDue(row.item, today);
    return delta !== null && delta >= 0 && delta <= 3;
  }
  if (filter === "waiting") return row.item?.approval?.state === "waiting" || row.item?.approval?.state === "changes" || row.item?.status === "changes_requested";
  if (filter === "risk") return row.glance.status === "off_track" || row.glance.status === "at_risk";
  return row.category === "setup" || row.category === "planning";
}

function StatButton({ label, value, caption, Icon, tone, active, onClick }: {
  label: string;
  value: number;
  caption: string;
  Icon: typeof AlertTriangle;
  tone: "red" | "amber" | "blue" | "green";
  active: boolean;
  onClick: () => void;
}) {
  const color = {
    red: "text-red-700 dark:text-red-300",
    amber: "text-amber-800 dark:text-amber-300",
    blue: "text-sky-700 dark:text-sky-300",
    green: "text-emerald-700 dark:text-emerald-300",
  }[tone];
  return (
    <button type="button" onClick={onClick} aria-label={label + ": " + value} aria-pressed={active}
      className={"group flex min-w-0 items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset " + (active ? "bg-muted/70" : "bg-transparent")}>
      <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background ring-1 ring-border " + color}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className={"mt-0.5 block text-[23px] font-semibold leading-none tracking-tight tabular-nums " + color}>{value}</span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">{caption}</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5" />
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
  const glances = useMemo(() => campaigns.map((campaign) => ({ campaign, glance: monthGlance(campaign, today) })), [campaigns, today]);
  const actions = useMemo(() => buildActions(campaigns, today), [campaigns, today]);

  const stats = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let waiting = 0;
    for (const campaign of campaigns) {
      if (campaign.status !== "active" || campaign.history) continue;
      for (const item of campaign.items || []) {
        if (isPosted(item)) continue;
        if (isOverdue(item, today)) overdue += 1;
        else {
          const delta = daysUntilDue(item, today);
          if (delta !== null && delta <= 3) dueSoon += 1;
        }
        if (item.approval?.state === "waiting" || item.approval?.state === "changes") waiting += 1;
      }
    }
    return {
      overdue,
      dueSoon,
      waiting,
      risk: glances.filter(({ campaign, glance }) => campaign.status === "active" && !campaign.history &&
        (glance.status === "off_track" || glance.status === "at_risk")).length,
      setup: campaigns.filter((campaign) => campaign.status === "active" && !campaign.history && needsSetup(campaign, today)).length,
    };
  }, [campaigns, glances, today]);

  const query = search.trim().toLowerCase();
  const campaignMatches = (campaign: SmmCampaign) =>
    !query || [campaign.businessName, campaign.clientName, campaign.packageLabel, campaign.clientPhone]
      .some((value) => (value || "").toLowerCase().includes(query))
      || (campaign.items || []).some((item) => (item.title || "").toLowerCase().includes(query));

  const visibleActions = actions.filter((row) => rowMatchesFilter(row, filter, today) && campaignMatches(row.campaign));
  const visibleCampaigns = glances.filter(({ campaign, glance }) => {
    if (!campaignMatches(campaign)) return false;
    if (filter === "overdue") return (campaign.items || []).some((item) => isOverdue(item, today));
    if (filter === "due") return (campaign.items || []).some((item) => {
      if (isPosted(item)) return false;
      const delta = daysUntilDue(item, today);
      return delta !== null && delta >= 0 && delta <= 3;
    });
    if (filter === "waiting") return (campaign.items || []).some((item) =>
      !isPosted(item) && (item.approval?.state === "waiting" || item.approval?.state === "changes" || item.status === "changes_requested")
    );
    if (filter === "risk") return glance.status === "off_track" || glance.status === "at_risk";
    if (filter === "setup") return needsSetup(campaign, today);
    return true;
  });

  const countFor = (key: Filter): number => {
    if (key === "overdue") return stats.overdue;
    if (key === "due") return stats.dueSoon;
    if (key === "waiting") return stats.waiting;
    if (key === "risk") return stats.risk;
    if (key === "setup") return stats.setup;
    return actions.filter((row) => campaignMatches(row.campaign)).length;
  };

  return (
    <div data-test="smm-operations-view" className="mx-auto w-full max-w-[1440px] space-y-5 pb-5">
      <header className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Operations <span className="text-border">/</span> Social media
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">Social media</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            A clear view of client commitments, what needs attention, and what comes next.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" data-test="smm-classic-ui" onClick={onClassicUI}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <LayoutGrid size={15} /> Classic view
          </button>
          {canSetUp && onAddSale && (
            <button type="button" data-test="smm-add-sale" onClick={onAddSale}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <Plus size={16} /> Add SMM sale
            </button>
          )}
        </div>
      </header>

      <section aria-label="Today at a glance" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Today at a glance</span>
          <span className="text-xs text-muted-foreground">{safeDateLabel(today)}</span>
        </div>
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <StatButton label="Overdue work" value={stats.overdue} caption="Past its promised date" Icon={AlertTriangle} tone="red" active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} />
          <StatButton label="Due in 3 days" value={stats.dueSoon} caption="Still time to prevent a miss" Icon={Clock3} tone="amber" active={filter === "due"} onClick={() => setFilter(filter === "due" ? "all" : "due")} />
          <StatButton label="Client response" value={stats.waiting} caption="Approval or changes needed" Icon={MessageCircle} tone="blue" active={filter === "waiting"} onClick={() => setFilter(filter === "waiting" ? "all" : "waiting")} />
          <StatButton label="Campaigns at risk" value={stats.risk} caption="Behind the delivery plan" Icon={CircleAlert} tone="amber" active={filter === "risk"} onClick={() => setFilter(filter === "risk" ? "all" : "risk")} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Needs attention</h2>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{visibleActions.length}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Prioritized by deadline and the next action required.</p>
          </div>
          <label className="relative block w-full sm:max-w-[280px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search clients and deliverables"
              placeholder="Search clients or deliverables"
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
        </div>
        <div role="group" aria-label="Filter work" className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2.5 sm:px-4">
          {FILTERS.map(({ key, label }) => (
            <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} aria-label={"Filter " + label + ": " + countFor(key)}
              className={"inline-flex min-h-8 shrink-0 items-center rounded-lg px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                (filter === key ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {label}
              <span className={"ml-2 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums " + (filter === key ? "bg-background/15" : "bg-muted")}>{countFor(key)}</span>
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Loading your campaigns…</div>
        ) : visibleActions.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 size={19} /></span>
            <p className="mt-3 text-sm font-semibold text-foreground">Nothing needs attention here</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {search ? "Try a different search or clear the current filter." : "This view is based on existing dates, statuses and campaign setup. New blockers appear here when they are recorded."}
            </p>
            {(filter !== "all" || search) && <button type="button" onClick={() => { setFilter("all"); setSearch(""); }} className="mt-3 text-xs font-semibold text-primary hover:underline">Clear filters</button>}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleActions.slice(0, 6).map((row) => {
              const Icon = row.category === "overdue" ? AlertTriangle
                : row.category === "waiting" ? MessageCircle
                : row.category === "changes" ? ImageIcon
                : row.category === "planning" || row.category === "setup" ? CalendarClock
                : row.category === "risk" ? CircleAlert : Clock3;
              return (
                <article key={row.id} className="group grid grid-cols-[3px_minmax(0,1fr)] sm:grid-cols-[3px_minmax(0,1fr)_auto]">
                  <span className={"my-3 rounded-full " + (row.category === "overdue" ? "bg-red-500" : row.category === "waiting" || row.category === "changes" ? "bg-sky-500" : row.category === "due" || row.category === "risk" ? "bg-amber-500" : "bg-border")} />
                  <div className="flex min-w-0 flex-col gap-2 px-3 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                    <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground sm:flex"><Icon size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{row.title}</span>
                        <span className={"inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold " + CATEGORY_STYLE[row.category]}>{CATEGORY_LABEL[row.category]}</span>
                        {row.item?.extra && <span className="inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Extra work</span>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{row.campaign.businessName || row.campaign.clientName} <span className="mx-1 text-border">·</span> {row.reason}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{row.owner}</span>
                        <span className={row.category === "overdue" ? "font-semibold text-red-700 dark:text-red-300" : ""}>{row.dueLabel}</span>
                      </div>
                    </div>
                    {row.category === "setup" && canSetUp && onSetUp ? (
                      <button type="button" onClick={() => onSetUp(row.campaign)} className="ml-3 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-95 sm:ml-0">
                        Set up <ArrowRight size={13} />
                      </button>
                    ) : (
                      <Link to={"/smm/" + row.campaign.id} className="ml-3 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg px-2.5 text-xs font-semibold text-foreground transition hover:bg-muted sm:ml-0 sm:self-center">
                        Open work <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
            {visibleActions.length > 6 && <div className="px-5 py-3 text-center text-xs text-muted-foreground">Showing 6 of {visibleActions.length} actions. Use the filters or search to narrow the list.</div>}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Client campaigns</h2>
            <p className="mt-1 text-xs text-muted-foreground">Promised work, actual posting progress, and the next due item.</p>
          </div>
          <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{visibleCampaigns.length} client{visibleCampaigns.length === 1 ? "" : "s"}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Loading campaigns…</div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="px-5 py-9 text-center text-sm text-muted-foreground">No clients match this view.</div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(160px,1.2fr)_minmax(190px,1.4fr)_135px_minmax(125px,1fr)_76px] gap-4 bg-muted/30 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground lg:grid">
              <span>Client</span><span>Package fulfilment</span><span>Health</span><span>Next due</span><span />
            </div>
            <div className="divide-y divide-border">
              {visibleCampaigns.map(({ campaign, glance }) => {
                const next = (campaign.items || [])
                  .filter((item) => !isPosted(item) && Boolean(item.uploadDate))
                  .sort((a, b) => (a.uploadDate || "").localeCompare(b.uploadDate || ""))[0];
                const extraCount = (campaign.items || []).filter((item) => item.extra).length;
                const setup = needsSetup(campaign, today);
                const kinds = SMM_CONTENT_KINDS.filter((kind) => Number(campaign.commitments?.[kind.key] || 0) > 0);
                return (
                  <div key={campaign.id} className="grid grid-cols-1 gap-3 px-4 py-4 transition hover:bg-muted/20 lg:grid-cols-[minmax(160px,1.2fr)_minmax(190px,1.4fr)_135px_minmax(125px,1fr)_76px] lg:items-center lg:gap-4 lg:px-5">
                    <div className="min-w-0">
                      <Link to={"/smm/" + campaign.id} className="block truncate text-sm font-semibold text-foreground transition hover:text-primary">{campaign.businessName || campaign.clientName || "Unnamed client"}</Link>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{campaign.packageLabel || "Custom package"}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{safeDateLabel(campaign.cycle.startDate)} – {safeDateLabel(campaign.cycle.endDate)}</p>
                      {extraCount > 0 && <p className="mt-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">{extraCount} extra item{extraCount === 1 ? "" : "s"} · excluded from package total</p>}
                    </div>
                    <div className="space-y-2">
                      {kinds.length === 0 ? <span className="text-xs text-muted-foreground">No package items recorded</span> : kinds.map((kind) => {
                        const committed = Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
                        const posted = (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length;
                        const ratio = committed ? Math.min(1, posted / committed) : 0;
                        const Icon = CONTENT_ICON[kind.key];
                        const color = kind.key === "poster" ? "bg-violet-500" : kind.key === "real_video" ? "bg-emerald-600" : "bg-primary";
                        return (
                          <div key={kind.key} className="grid grid-cols-[92px_36px_minmax(42px,1fr)] items-center gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground"><Icon size={12} />{kind.label}</span>
                            <span className="text-right text-xs font-semibold tabular-nums text-foreground">{posted}<span className="text-muted-foreground">/{committed}</span></span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className={"block h-full rounded-full " + color} style={{ width: (ratio * 100) + "%" }} /></span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-start lg:block">
                      <span className={"inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset " + (STATUS_STYLE[glance.status] || STATUS_STYLE.not_started)}>
                        <span className={"h-1.5 w-1.5 rounded-full " + (glance.status === "off_track" ? "bg-red-500" : glance.status === "at_risk" ? "bg-amber-500" : glance.status === "on_track" || glance.status === "done" ? "bg-emerald-500" : "bg-current opacity-50")} />
                        {glance.label}
                      </span>
                      <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{glance.reason}</p>
                    </div>
                    <div className="min-w-0">
                      {next ? (
                        <>
                          <p className="truncate text-xs font-semibold text-foreground">{next.title?.trim() || contentLabel(next.kind)}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{safeDateLabel(next.uploadDate)} · {dueText(next, today)}</p>
                        </>
                      ) : <p className="text-xs text-muted-foreground">No dated items upcoming</p>}
                    </div>
                    <div className="flex items-center justify-start lg:justify-end">
                      {setup && canSetUp && onSetUp ? (
                        <button type="button" onClick={() => onSetUp(campaign)} className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-95">Set up</button>
                      ) : (
                        <Link to={"/smm/" + campaign.id} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted">View <ArrowRight size={12} /></Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-muted-foreground">
        <CalendarClock size={14} className="mt-0.5 shrink-0" />
        This view uses existing campaign dates and status records. It does not independently verify live social posts.
      </p>
    </div>
  );
}
