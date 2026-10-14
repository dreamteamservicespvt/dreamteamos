import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert,
  Clock3, Image as ImageIcon, LayoutDashboard, Loader2, MessageCircle, Plus, Search,
  Sparkles, Video, WandSparkles,
} from "lucide-react";
import "./smm-operations.css";
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

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  overdue: "Overdue",
  due: "Due soon",
  waiting: "Client response",
  changes: "Changes requested",
  planning: "Needs scheduling",
  setup: "Needs setup",
  risk: "At risk",
};

const CATEGORY_TONE: Record<ActionCategory, string> = {
  overdue: "critical",
  due: "warning",
  waiting: "info",
  changes: "violet",
  planning: "neutral",
  setup: "neutral",
  risk: "warning",
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
  if (item.status === "changes_requested" || item.approval?.state === "changes") return { category: "changes", rank: 1 };
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
    if (unplanned.length > 0) {
      const kinds = [...new Set(unplanned.map((item) => item.kind))];
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

interface MetricCardProps {
  label: string;
  value: number;
  description: string;
  tone: "rose" | "amber" | "blue" | "violet";
  Icon: typeof AlertTriangle;
  active: boolean;
  onClick: () => void;
  testLabel: string;
}

function MetricCard({ label, value, description, tone, Icon, active, onClick, testLabel }: MetricCardProps) {
  return (
    <button type="button" className={"smm-glass-metric smm-glass-metric--" + tone + (active ? " is-active" : "")}
      onClick={onClick} aria-label={testLabel} aria-pressed={active}>
      <span className="smm-glass-metric__top">
        <span className="smm-glass-icon"><Icon size={18} strokeWidth={1.8} /></span>
        <span className="smm-glass-metric__micro">{active ? "FILTER ACTIVE" : "LIVE COUNT"}</span>
        <ArrowUpRight size={15} className="smm-glass-metric__arrow" />
      </span>
      <span className="smm-glass-metric__value">{value}</span>
      <span className="smm-glass-metric__label">{label}</span>
      <span className="smm-glass-metric__description">{description}</span>
      <span className="smm-glass-metric__light" aria-hidden="true" />
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
  const [showAllActions, setShowAllActions] = useState(false);
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
    const health = {
      overdue: glances.filter(({ campaign, glance }) => campaign.status === "active" && !campaign.history && glance.status === "off_track").length,
      atRisk: glances.filter(({ campaign, glance }) => campaign.status === "active" && !campaign.history && glance.status === "at_risk").length,
      onTrack: glances.filter(({ campaign, glance }) => campaign.status === "active" && !campaign.history && (glance.status === "on_track" || glance.status === "done")).length,
      setup: campaigns.filter((campaign) => campaign.status === "active" && !campaign.history && needsSetup(campaign, today)).length,
    };
    return {
      overdue, dueSoon, waiting, committed, posted, activeCampaigns,
      risk: health.overdue + health.atRisk,
      setup: health.setup,
      health: { ...health, other: Math.max(0, activeCampaigns - health.overdue - health.atRisk - health.onTrack - health.setup) },
    };
  }, [campaigns, glances, today]);

  const byKind = useMemo(() => SMM_CONTENT_KINDS.map((kind) => {
    const promised = campaigns.reduce((sum, campaign) => {
      if (campaign.status !== "active" || campaign.history) return sum;
      return sum + Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
    }, 0);
    const live = campaigns.reduce((sum, campaign) => {
      if (campaign.status !== "active" || campaign.history) return sum;
      const cap = Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
      return sum + Math.min(cap, (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length);
    }, 0);
    return { ...kind, promised, live, left: Math.max(0, promised - live), percent: promised ? Math.round(live / promised * 100) : 0 };
  }).filter((kind) => kind.promised > 0), [campaigns]);

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
  const dateLong = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const actionRows = showAllActions ? visibleActions : visibleActions.slice(0, 5);
  const healthTotal = Math.max(1, stats.activeCampaigns);
  const healthSegments = [
    { label: "Off track", value: stats.health.overdue, className: "is-rose" },
    { label: "At risk", value: stats.health.atRisk, className: "is-amber" },
    { label: "On track", value: stats.health.onTrack, className: "is-emerald" },
    { label: "Needs setup", value: stats.health.setup, className: "is-violet" },
    { label: "Other", value: stats.health.other, className: "is-slate" },
  ];

  return (
    <div className="smm-glass-stage" data-test="smm-operations-view">
      <div className="smm-glass-orb smm-glass-orb--one" aria-hidden="true" />
      <div className="smm-glass-orb smm-glass-orb--two" aria-hidden="true" />
      <div className="smm-glass-orb smm-glass-orb--three" aria-hidden="true" />
      <div className="smm-glass-content space-y-6">
        <header className="smm-glass-hero">
          <div className="smm-glass-hero__copy">
            <div className="smm-glass-eyebrow"><span className="smm-glass-live-dot" /> DREAM TEAM SERVICES <span className="smm-glass-eyebrow__slash">/</span> SOCIAL STUDIO</div>
            <h1 className="smm-glass-hero__title">Social media<span className="smm-glass-title-period" aria-hidden="true">.</span></h1>
            <p className="smm-glass-hero__subtitle">Your campaign command centre. Clear priorities, visible progress, no guesswork.</p>
            <div className="smm-glass-hero__meta">
              <span className="smm-glass-date"><CalendarClock size={14} /> {dateLong}</span>
              <span className="smm-glass-meta-divider" />
              <span><strong>{stats.activeCampaigns}</strong> active campaigns</span>
            </div>
          </div>
          <div className="smm-glass-hero__visual" aria-label={deliveryPercent + "% of package deliverables marked posted"}>
            <div className="smm-glass-orbit smm-glass-orbit--outer" />
            <div className="smm-glass-orbit smm-glass-orbit--inner" />
            <div className="smm-glass-hero__halo" />
            <div className="smm-glass-hero__glass-stat">
              <span className="smm-glass-hero__stat-label">PACKAGE DELIVERY</span>
              <strong>{deliveryPercent}<small>%</small></strong>
              <span className="smm-glass-hero__stat-foot">{stats.posted} of {stats.committed} marked posted</span>
            </div>
            <div className="smm-glass-float-chip smm-glass-float-chip--top"><CheckCircle2 size={14} /> <span>Progress at a glance</span></div>
            <div className="smm-glass-float-chip smm-glass-float-chip--bottom"><Sparkles size={14} /> <span>One clear next step</span></div>
          </div>
          <div className="smm-glass-hero__actions">
            <button type="button" data-test="smm-classic-ui" onClick={onClassicUI} className="smm-glass-button smm-glass-button--secondary">
              <LayoutDashboard size={15} /> Classic view
            </button>
            {canSetUp && onAddSale && (
              <button type="button" data-test="smm-add-sale" onClick={onAddSale} className="smm-glass-button smm-glass-button--primary">
                <Plus size={16} /> Add SMM sale
              </button>
            )}
          </div>
          <div className="smm-glass-hero__shine" aria-hidden="true" />
        </header>

        <section aria-label="Social media overview metrics" className="smm-glass-metric-grid">
          <MetricCard label="Overdue work" value={stats.overdue} description="Past the promised date" tone="rose" Icon={AlertTriangle}
            active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} testLabel={"Overdue work: " + stats.overdue} />
          <MetricCard label="Due in 3 days" value={stats.dueSoon} description="Time to prevent a miss" tone="amber" Icon={Clock3}
            active={filter === "due"} onClick={() => setFilter(filter === "due" ? "all" : "due")} testLabel={"Due in 3 days: " + stats.dueSoon} />
          <MetricCard label="Client response" value={stats.waiting} description="Approval or changes needed" tone="blue" Icon={MessageCircle}
            active={filter === "waiting"} onClick={() => setFilter(filter === "waiting" ? "all" : "waiting")} testLabel={"Client response: " + stats.waiting} />
          <MetricCard label="Campaigns at risk" value={stats.risk} description="Behind the delivery plan" tone="violet" Icon={CircleAlert}
            active={filter === "risk"} onClick={() => setFilter(filter === "risk" ? "all" : "risk")} testLabel={"Campaigns at risk: " + stats.risk} />
        </section>

        <section className="smm-glass-analysis-grid" aria-label="Portfolio analysis">
          <div className="smm-glass-panel smm-glass-delivery">
            <div className="smm-glass-section-heading">
              <div>
                <div className="smm-glass-kicker"><span className="smm-glass-kicker__dot is-emerald" /> PERFORMANCE</div>
                <h2>Commitment fulfilment</h2>
                <p>Package deliverables marked posted across active clients.</p>
              </div>
              <span className="smm-glass-period-pill">Current campaigns</span>
            </div>
            <div className="smm-glass-delivery__body">
              <div className="smm-glass-donut-wrap">
                <div className="smm-glass-donut" role="progressbar" aria-label="Package deliverables marked posted" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deliveryPercent}
                  style={{ background: "conic-gradient(#15a67a 0% " + deliveryPercent + "%, rgba(148,163,184,.16) " + deliveryPercent + "% 100%)" }}>
                  <div className="smm-glass-donut__center">
                    <span>RECORDED</span>
                    <strong>{deliveryPercent}<small>%</small></strong>
                    <em>posted</em>
                  </div>
                </div>
                <div className="smm-glass-donut__totals"><strong>{stats.posted}</strong><span>of {stats.committed} promised</span></div>
              </div>
              <div className="smm-glass-kind-list">
                {byKind.length === 0 ? (
                  <div className="smm-glass-empty-inline">No package commitments are recorded for active campaigns yet.</div>
                ) : byKind.map((kind) => {
                  const Icon = CONTENT_ICON[kind.key];
                  const color = kind.key === "poster" ? "poster" : kind.key === "real_video" ? "real" : "ai";
                  return (
                    <div className="smm-glass-kind-row" key={kind.key}>
                      <div className={"smm-glass-kind-icon is-" + color}><Icon size={16} /></div>
                      <div className="smm-glass-kind-main">
                        <div className="smm-glass-kind-head"><span>{kind.label}</span><strong>{kind.live}<small> / {kind.promised}</small></strong></div>
                        <div className="smm-glass-bar"><span className={"is-" + color} style={{ width: kind.percent + "%" }} /></div>
                        <div className="smm-glass-kind-caption">{kind.left} remaining <span>{kind.percent}% marked posted</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="smm-glass-delivery__foot">
              <span><span className="smm-glass-legend-dot is-emerald" /> Marked posted</span>
              <span><span className="smm-glass-legend-dot is-slate" /> Remaining commitment</span>
              <span className="smm-glass-footnote">Extra work excluded</span>
            </div>
          </div>

          <div className="smm-glass-panel smm-glass-health">
            <div className="smm-glass-section-heading">
              <div>
                <div className="smm-glass-kicker"><span className="smm-glass-kicker__dot is-violet" /> CLIENT PORTFOLIO</div>
                <h2>Campaign health</h2>
                <p>How your active client months are tracking.</p>
              </div>
              <div className="smm-glass-health__badge"><WandSparkles size={15} /></div>
            </div>
            <div className="smm-glass-health__headline">
              <strong>{stats.activeCampaigns}</strong>
              <span>active<br />campaigns</span>
              <div className="smm-glass-health__headline-note">{stats.risk === 0 ? "No campaigns currently flagged at risk" : stats.risk + " campaign" + (stats.risk === 1 ? "" : "s") + " need attention"}</div>
            </div>
            <div className="smm-glass-health__stack" aria-label="Campaign health distribution">
              {healthSegments.filter((s) => s.value > 0).map((segment) => (
                <span key={segment.label} className={segment.className} style={{ width: (segment.value / healthTotal * 100) + "%" }} title={segment.label + ": " + segment.value} />
              ))}
            </div>
            <div className="smm-glass-health__legend">
              {healthSegments.map((segment) => (
                <div key={segment.label} className="smm-glass-health__legend-item">
                  <span className={"smm-glass-legend-dot " + segment.className} />
                  <span>{segment.label}</span>
                  <strong>{segment.value}</strong>
                </div>
              ))}
            </div>
            <button type="button" className="smm-glass-health__action" onClick={() => setFilter(filter === "risk" ? "all" : "risk")}>
              {filter === "risk" ? "Show all work" : "Review at-risk campaigns"} <ArrowRight size={14} />
            </button>
          </div>
        </section>

        <section className="smm-glass-panel smm-glass-work" aria-label="Work that needs attention">
          <div className="smm-glass-work__header">
            <div>
              <div className="smm-glass-kicker"><span className="smm-glass-kicker__dot is-rose" /> PRIORITY QUEUE</div>
              <div className="smm-glass-work__title-line">
                <h2>Needs attention</h2>
                <span className="smm-glass-count-pill">{visibleActions.length}</span>
              </div>
              <p>Prioritised by deadline. Each item links to the work that needs action.</p>
            </div>
            <label className="smm-glass-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search clients and deliverables"
                placeholder="Search clients or deliverables" />
              {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>×</button>}
            </label>
          </div>
          <div role="group" aria-label="Filter work" className="smm-glass-filter-row">
            {FILTERS.map(({ key, label }) => (
              <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
                aria-label={"Filter " + (key === "all" ? "All work" : key === "waiting" ? "Waiting on client" : key === "setup" ? "Needs setup" : key === "due" ? "Due soon" : label) + ": " + countFor(key)}
                className={"smm-glass-filter" + (filter === key ? " is-selected" : "")}>
                {label}<span>{countFor(key)}</span>
              </button>
            ))}
          </div>
          {loading ? (
            <div className="smm-glass-loading"><Loader2 className="animate-spin" size={20} /> Loading your campaigns…</div>
          ) : actionRows.length === 0 ? (
            <div className="smm-glass-empty-state">
              <div className="smm-glass-empty-state__icon"><CheckCircle2 size={25} /></div>
              <strong>Nothing needs attention here</strong>
              <p>{search ? "Try a different search or clear the current filter." : "There are no recorded blockers for this view right now."}</p>
              {(filter !== "all" || search) && <button type="button" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters</button>}
            </div>
          ) : (
            <div className="smm-glass-action-list">
              {actionRows.map((row) => {
                const Icon = row.category === "overdue" ? AlertTriangle
                  : row.category === "waiting" ? MessageCircle
                  : row.category === "changes" ? ImageIcon
                  : row.category === "planning" || row.category === "setup" ? CalendarClock
                  : row.category === "risk" ? CircleAlert : Clock3;
                return (
                  <article key={row.id} className={"smm-glass-action smm-glass-action--" + CATEGORY_TONE[row.category]}>
                    <div className="smm-glass-action__icon"><Icon size={17} /></div>
                    <div className="smm-glass-action__content">
                      <div className="smm-glass-action__title-line">
                        <strong>{row.title}</strong>
                        <span className={"smm-glass-status smm-glass-status--" + CATEGORY_TONE[row.category]}>{CATEGORY_LABEL[row.category]}</span>
                        {row.item?.extra && <span className="smm-glass-status smm-glass-status--violet">Extra work</span>}
                      </div>
                      <p>{row.campaign.businessName || row.campaign.clientName} <span>·</span> {row.reason}</p>
                      <div className="smm-glass-action__meta"><span>{row.owner}</span><strong className={row.category === "overdue" ? "is-overdue" : ""}>{row.dueLabel}</strong></div>
                    </div>
                    {row.category === "setup" && canSetUp && onSetUp ? (
                      <button type="button" onClick={() => onSetUp(row.campaign)} className="smm-glass-action__open">Set up <ArrowRight size={14} /></button>
                    ) : (
                      <Link to={"/smm/" + row.campaign.id} className="smm-glass-action__open">Open <ArrowRight size={14} /></Link>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {visibleActions.length > 5 && (
            <button type="button" className="smm-glass-more" onClick={() => setShowAllActions((value) => !value)}>
              {showAllActions ? "Show fewer priorities" : "Show all " + visibleActions.length + " priorities"}
              <ArrowRight size={14} className={showAllActions ? "rotate-[-90deg]" : ""} />
            </button>
          )}
        </section>

        <section className="smm-glass-client-section" aria-label="Client campaigns">
          <div className="smm-glass-client-heading">
            <div>
              <div className="smm-glass-kicker"><span className="smm-glass-kicker__dot is-blue" /> CLIENT OVERVIEW</div>
              <h2>Campaigns, at a glance</h2>
              <p>Track package fulfilment, client health and the next scheduled deliverable.</p>
            </div>
            <span className="smm-glass-client-count">{visibleCampaigns.length} client{visibleCampaigns.length === 1 ? "" : "s"}</span>
          </div>
          {loading ? (
            <div className="smm-glass-panel smm-glass-loading"><Loader2 className="animate-spin" size={20} /> Loading campaigns…</div>
          ) : visibleCampaigns.length === 0 ? (
            <div className="smm-glass-panel smm-glass-empty-state"><strong>No clients match this view</strong><p>Change the filter or search to see other campaigns.</p></div>
          ) : (
            <div className="smm-glass-client-grid">
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
                  <article key={campaign.id} className="smm-glass-client-card">
                    <div className="smm-glass-client-card__top">
                      <div className="smm-glass-client-card__avatar" aria-hidden="true">{(campaign.businessName || campaign.clientName || "C").trim().charAt(0).toUpperCase()}</div>
                      <div className="smm-glass-client-card__identity">
                        <Link to={"/smm/" + campaign.id}>{campaign.businessName || campaign.clientName || "Unnamed client"} <ArrowUpRight size={14} /></Link>
                        <span>{campaign.packageLabel || "Custom package"}</span>
                      </div>
                      <span className={"smm-glass-campaign-health is-" + (glance.status === "off_track" ? "rose" : glance.status === "at_risk" || glance.status === "setup" ? "amber" : glance.status === "on_track" || glance.status === "done" ? "emerald" : "slate")}>
                        <i />{glance.label}
                      </span>
                    </div>
                    <div className="smm-glass-client-card__progress">
                      <div className="smm-glass-client-card__progress-head"><span>Package completion</span><strong>{progress}%</strong></div>
                      <div className="smm-glass-bar smm-glass-client-card__bar"><span className="is-emerald" style={{ width: progress + "%" }} /></div>
                      <div className="smm-glass-client-card__numbers"><strong>{posted}<small> / {committed}</small></strong><span>marked posted</span></div>
                    </div>
                    <div className="smm-glass-client-card__kinds">
                      {kinds.map((kind) => {
                        const promised = Math.max(0, Number(campaign.commitments?.[kind.key] || 0));
                        const liveCount = (campaign.items || []).filter((item) => item.kind === kind.key && !item.extra && isPosted(item)).length;
                        const Icon = CONTENT_ICON[kind.key];
                        return <span key={kind.key}><Icon size={13} />{kind.label}<strong>{Math.min(promised, liveCount)}/{promised}</strong></span>;
                      })}
                    </div>
                    {extraCount > 0 && <div className="smm-glass-client-card__extra"><Sparkles size={12} /> {extraCount} extra item{extraCount === 1 ? "" : "s"} · separate from package</div>}
                    <div className="smm-glass-client-card__next">
                      <div className="smm-glass-client-card__next-icon"><CalendarClock size={15} /></div>
                      <div>
                        <span>{next ? "NEXT DELIVERABLE" : "SCHEDULE"}</span>
                        {next ? <><strong>{next.title?.trim() || contentLabel(next.kind)}</strong><small>{safeDateLabel(next.uploadDate)} · {dueText(next, today)}</small></>
                          : <strong>No dated deliverable upcoming</strong>}
                      </div>
                    </div>
                    <div className="smm-glass-client-card__foot">
                      <span>{safeDateLabel(campaign.cycle.startDate)} — {safeDateLabel(campaign.cycle.endDate)}</span>
                      {setup && canSetUp && onSetUp ? (
                        <button type="button" onClick={() => onSetUp(campaign)} className="smm-glass-client-card__button">Set up <ArrowRight size={13} /></button>
                      ) : (
                        <Link to={"/smm/" + campaign.id} className="smm-glass-client-card__button">View campaign <ArrowRight size={13} /></Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="smm-glass-disclaimer"><CalendarClock size={14} /> Progress reflects existing campaign records. A “posted” status is not independently verified against the social platform.</footer>
      </div>
    </div>
  );
}
