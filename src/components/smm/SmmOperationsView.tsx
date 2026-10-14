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
  { key: "waiting", label: "Client response" },
  { key: "risk", label: "At risk" },
  { key: "setup", label: "Planning" },
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
  waiting: "Client response",
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
        sortDate: campaign.cycle.endDate, title: "Campaign needs setup",
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
    let committed = 0;
    let posted = 0;
    let activeCampaigns = 0;

    for (const campaign of campaigns) {
      if (campaign.status !== "active" || campaign.history) continue;
      activeCampaigns += 1;
      for (const kind of SMM_CONTENT_KINDS) {
        const promised = Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
        committed += promised;
        posted += Math.min(promised, (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length);
      }
      for (const item of campaign.items || []) {
        if (isPosted(item)) continue;
        if (isOverdue(item, today)) overdue += 1;
        else {
          const delta = daysUntilDue(item, today);
          if (delta !== null && delta <= 3) dueSoon += 1;
        }
        if (item.approval?.state === "waiting" || item.approval?.state === "changes" || item.status === "changes_requested") waiting += 1;
      }
    }
    return {
      overdue,
      dueSoon,
      waiting,
      committed,
      posted,
      activeCampaigns,
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
    if (filter === "overdue") return (campaign.items || []).some((item) => !isPosted(item) && isOverdue(item, today));
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

  const countFor = (key: Filter): number => actions
    .filter((row) => campaignMatches(row.campaign) && rowMatchesFilter(row, key, today)).length;
  const deliveryPercent = stats.committed > 0 ? Math.min(100, Math.round(stats.posted / stats.committed * 100)) : 0;

  return (
    <div data-test="smm-operations-view" className="mx-auto w-full max-w-[1480px] space-y-6 pb-6">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            SMM <span className="text-border">/</span> Operations
          </div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">Social media</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">A focused view of delivery, blockers and the next action.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" data-test="smm-classic-ui" onClick={onClassicUI}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <LayoutGrid size={15} /> Classic view
          </button>
          {canSetUp && onAddSale && (
            <button type="button" data-test="smm-add-sale" onClick={onAddSale}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <Plus size={16} /> Add SMM sale
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Delivery pulse</span>
            <span className="text-xs text-muted-foreground">{stats.activeCampaigns} active campaigns</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
            <StatButton label="Overdue work" value={stats.overdue} caption="Past promised date" Icon={AlertTriangle} tone="red" active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} />
            <StatButton label="Due in 3 days" value={stats.dueSoon} caption="Deadline approaching" Icon={Clock3} tone="amber" active={filter === "due"} onClick={() => setFilter(filter === "due" ? "all" : "due")} />
            <StatButton label="Client response" value={stats.waiting} caption="Approval or changes" Icon={MessageCircle} tone="blue" active={filter === "waiting"} onClick={() => setFilter(filter === "waiting" ? "all" : "waiting")} />
            <StatButton label="Campaigns at risk" value={stats.risk} caption="Behind the plan" Icon={CircleAlert} tone="amber" active={filter === "risk"} onClick={() => setFilter(filter === "risk" ? "all" : "risk")} />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Monthly delivery</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{deliveryPercent}% recorded</span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{stats.posted}</span>
              <span className="pb-1 text-sm text-muted-foreground">of {stats.committed} package deliverables marked posted</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Package deliverables marked posted" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deliveryPercent}>
              <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: deliveryPercent + "%" }} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[11px] leading-5 text-muted-foreground">Package work only; additional work is tracked separately.</p>
            <Link to="/smm?view=insights" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View insights <ArrowRight size={13} />
            </Link>
          </div>
        </aside>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.95fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Needs attention</h2>
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{visibleActions.length}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Only items that need a decision or action appear here.</p>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Live records</span>
            </div>
            <label className="relative block w-full">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search clients and deliverables"
                placeholder="Search client, content or package"
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <div role="group" aria-label="Filter work" className="flex gap-1 overflow-x-auto rounded-xl bg-muted/65 p-1">
              {FILTERS.map(({ key, label }) => (
                <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} aria-label={"Filter " + (key === "all" ? "All work" : key === "waiting" ? "Waiting on client" : key === "setup" ? "Needs setup" : label) + ": " + countFor(key)}
                  className={"inline-flex min-h-8 shrink-0 items-center rounded-lg px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                    (filter === key ? "bg-background text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                  <span className={"ml-1.5 rounded-md px-1 py-0.5 text-[10px] tabular-nums " + (filter === key ? "bg-muted" : "opacity-70")}>{countFor(key)}</span>
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Loading campaigns…</div>
          ) : visibleActions.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 size={19} /></span>
              <p className="mt-3 text-sm font-semibold text-foreground">Nothing needs attention here</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{search ? "Try a different search or clear the current filter." : "This queue uses current dates, statuses and recorded approvals."}</p>
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
                const critical = row.category === "overdue";
                return (
                  <article key={row.id} className="grid grid-cols-[3px_minmax(0,1fr)]">
                    <span className={"my-3 rounded-full " + (critical ? "bg-red-500" : row.category === "waiting" || row.category === "changes" ? "bg-sky-500" : row.category === "due" || row.category === "risk" ? "bg-amber-500" : "bg-border")} />
                    <div className="flex min-w-0 items-start gap-3 px-3 py-3.5 sm:px-4">
                      <span className={"mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " + (critical ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-muted/70 text-muted-foreground")}><Icon size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold leading-5 text-foreground">{row.title}</span>
                          <span className={"inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold " + CATEGORY_STYLE[row.category]}>{CATEGORY_LABEL[row.category]}</span>
                          {row.item?.extra && <span className="inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Extra work</span>}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.campaign.businessName || row.campaign.clientName} <span className="mx-1 text-border">·</span> {row.reason}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <span className="truncate text-[11px] text-muted-foreground">{row.owner}</span>
                          <span className={"text-[11px] font-semibold " + (critical ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>{row.dueLabel}</span>
                        </div>
                        {row.category === "setup" && canSetUp && onSetUp ? (
                          <button type="button" onClick={() => onSetUp(row.campaign)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-95">
                            Set up campaign <ArrowRight size={13} />
                          </button>
                        ) : (
                          <Link to={"/smm/" + row.campaign.id} className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-foreground transition hover:bg-muted">
                            Open work <ArrowRight size={13} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {visibleActions.length > 6 && <div className="px-5 py-3 text-center text-xs text-muted-foreground">Showing 6 of {visibleActions.length} actions. Use filters or search to narrow the list.</div>}
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Client campaigns</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">What was promised, what is posted and what comes next.</p>
            </div>
            <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{visibleCampaigns.length}</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Loading campaigns…</div>
          ) : visibleCampaigns.length === 0 ? (
            <div className="px-5 py-9 text-center text-sm text-muted-foreground">No clients match this view.</div>
          ) : (
            <div className="divide-y divide-border">
              {visibleCampaigns.map(({ campaign, glance }) => {
                const next = (campaign.items || [])
                  .filter((item) => !isPosted(item) && Boolean(item.uploadDate))
                  .sort((a, b) => (a.uploadDate || "").localeCompare(b.uploadDate || ""))[0];
                const extraCount = (campaign.items || []).filter((item) => item.extra).length;
                const setup = needsSetup(campaign, today);
                const kinds = SMM_CONTENT_KINDS.filter((kind) => Number(campaign.commitments?.[kind.key] || 0) > 0);
                const committed = kinds.reduce((sum, kind) => sum + Number(campaign.commitments?.[kind.key] || 0), 0);
                const posted = kinds.reduce((sum, kind) => sum + Math.min(
                  Number(campaign.commitments?.[kind.key] || 0),
                  (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length,
                ), 0);
                const progress = committed ? Math.round(posted / committed * 100) : 0;
                return (
                  <article key={campaign.id} className="px-4 py-4 transition hover:bg-muted/20 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={"/smm/" + campaign.id} className="block truncate text-sm font-semibold text-foreground transition hover:text-primary">{campaign.businessName || campaign.clientName || "Unnamed client"}</Link>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{campaign.packageLabel || "Custom package"} <span className="mx-1 text-border">·</span> {safeDateLabel(campaign.cycle.startDate)} – {safeDateLabel(campaign.cycle.endDate)}</p>
                      </div>
                      <span className={"inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset " + (STATUS_STYLE[glance.status] || STATUS_STYLE.not_started)}>
                        <span className={"h-1.5 w-1.5 rounded-full " + (glance.status === "off_track" ? "bg-red-500" : glance.status === "at_risk" ? "bg-amber-500" : glance.status === "on_track" || glance.status === "done" ? "bg-emerald-500" : "bg-current opacity-50")} />
                        {glance.label}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: progress + "%" }} /></div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{posted}/{committed}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                      {kinds.map((kind) => {
                        const promised = Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
                        const liveCount = (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length;
                        return <span key={kind.key} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className={"h-1.5 w-1.5 rounded-full " + (kind.key === "poster" ? "bg-violet-500" : kind.key === "real_video" ? "bg-emerald-600" : "bg-primary")} />
                          {kind.label} <strong className="font-semibold text-foreground">{Math.min(promised, liveCount)}/{promised}</strong>
                        </span>;
                      })}
                      {extraCount > 0 && <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">{extraCount} extra · separate from package</span>}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-2.5">
                      <div className="min-w-0">
                        {next ? <>
                          <p className="truncate text-xs font-semibold text-foreground">{next.title?.trim() || contentLabel(next.kind)}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{safeDateLabel(next.uploadDate)} · {dueText(next, today)}</p>
                        </> : <p className="text-xs text-muted-foreground">No dated deliverables coming up</p>}
                        {glance.reason && <p className="mt-1 truncate text-[10px] text-muted-foreground">{glance.reason}</p>}
                      </div>
                      {setup && canSetUp && onSetUp ? (
                        <button type="button" onClick={() => onSetUp(campaign)} className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-95">Set up</button>
                      ) : (
                        <Link to={"/smm/" + campaign.id} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted">Open <ArrowRight size={12} /></Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-muted-foreground">
        <CalendarClock size={14} className="mt-0.5 shrink-0" />
        Progress is based on existing campaign records. A “posted” status here is not independent platform verification.
      </p>
    </div>
  );
}
