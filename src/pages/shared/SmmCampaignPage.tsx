/**
 * One social-media month, in full.
 *
 * ── Why four tabs and not one long page ───────────────────────────────────────────────────────
 * A month has four separable jobs — make and post the content, run the ads, handle the money, and
 * report to the client — and on any given day a person is doing exactly one of them. Stacked into
 * one scroll, the person posting today has to scroll past a budget ledger to reach the plan, on a
 * phone, several times a day. The header carries the two facts everybody needs regardless of which
 * tab they are on: how far through the month is, and who is on it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Loader2, Megaphone, Phone, MessageSquare, CalendarRange, Users, IndianRupee,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaign } from "@/hooks/useSmmCampaigns";
import { fetchAssignableMembers, setCampaignTeam, setCycle } from "@/services/smm";
import { formatCurrency } from "@/utils/formatters";
import { getWhatsAppUrl } from "@/utils/phone";
import {
  canEditCampaign, clientWaitSummary, daysLeftInCycle, fulfilment, isoDay, isSmmOverseer,
  teamMembers,
} from "@/utils/smmPlan";
import { orderChatLink } from "@/services/orderChat";
import SmmContentTable from "@/components/smm/SmmContentTable";
import SmmAdsPanel from "@/components/smm/SmmAdsPanel";
import SmmMoneyPanel from "@/components/smm/SmmMoneyPanel";
import SmmReportPanel from "@/components/smm/SmmReportPanel";
import SmmItemDialog from "@/components/smm/SmmItemDialog";
import SmmMessageComposer from "@/components/smm/SmmMessageComposer";
import { ProgressBar } from "@/components/smm/SmmChips";
import type { SmmAssignee, SmmContentItem, SmmTeam, SmmTemplateKind } from "@/types/smm";

type Tab = "content" | "ads" | "money" | "report";

export default function SmmCampaignPage() {
  const { campaignId } = useParams();
  const user = useAuthStore((s) => s.user);
  const { campaign, loading } = useSmmCampaign(campaignId);
  const [tab, setTab] = useState<Tab>("content");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: SmmTemplateKind } | null>(null);
  const [members, setMembers] = useState<{ uid: string; name: string }[]>([]);
  const [showTeam, setShowTeam] = useState(false);

  const canEdit = canEditCampaign(campaign || { watchers: [], soldBy: "" }, user);
  const canAssign = isSmmOverseer(user);
  const today = isoDay(new Date());

  useEffect(() => {
    if (canAssign) fetchAssignableMembers().then(setMembers);
  }, [canAssign]);

  // The dialog reads the live item rather than a copy, so a change made in it is visible the
  // instant it is saved instead of on the next open.
  const item = useMemo(
    () => (openItem ? campaign?.items.find((i) => i.id === openItem) || null : null),
    [openItem, campaign?.items],
  );

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>;
  }

  if (!campaign || !user) {
    return (
      <div className="space-y-3">
        <Link to="/smm" className="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft size={14} /> Social Media Management
        </Link>
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          This month is not available to you.
        </p>
      </div>
    );
  }

  const f = fulfilment(campaign);
  const wait = clientWaitSummary(campaign.items);
  const daysLeft = daysLeftInCycle(campaign.cycle, today);
  const team = teamMembers(campaign.team);

  return (
    <div className="space-y-4">
      {/* `-mx-2 px-2 py-1.5`: the words are the same size, but the thing a thumb has to hit is
          not. The negative margin keeps it optically flush with the card below. */}
      <Link to="/smm" className="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ArrowLeft size={14} /> Social Media Management
      </Link>

      {/* ── Who this is, and how it is going ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 data-test="smm-page-business" className="truncate text-xl font-bold text-foreground sm:text-2xl">
              {campaign.businessName || campaign.clientName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {campaign.clientName && campaign.clientName !== campaign.businessName ? `${campaign.clientName} · ` : ""}
              {campaign.packageLabel} · {formatCurrency(campaign.amount)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={getWhatsAppUrl(campaign.clientPhone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
            >
              <Phone size={13} /> Client
            </a>
            {/* A directly-added month has no order behind it, so there is no client chat room to
                open — the link would lead to a page that says the chat does not exist. */}
            {campaign.orderId && (
              <a
                href={orderChatLink(campaign.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                <MessageSquare size={13} /> Their chat
              </a>
            )}
          </div>
        </div>

        <div className="mt-3"><ProgressBar percent={f.percent} tone={f.complete ? "success" : "primary"} /></div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <strong className="text-foreground">{f.posted} of {f.committed}</strong> posted
          {wait.openCount > 0 ? ` · ${wait.openCount} waiting on the client` : ""}
          {" · "}{campaign.cycle.startDate} → {campaign.cycle.endDate}
          {daysLeft > 0 ? ` (${daysLeft}d left)` : daysLeft === 0 ? " (last day)" : " (ended)"}
        </p>

        {/* Small, underneath the client — the people on the month. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <Users size={11} />
          {team.length > 0
            ? team.map((m) => <span key={m.uid}>{m.name} <span className="opacity-70">({m.roles.join("/")})</span></span>)
            : <span>Nobody assigned yet</span>}
          <span className="opacity-70">· {campaign.origin === "direct" ? "added by" : "sold by"} {campaign.soldByName}</span>
          {canAssign && (
            <button
              data-test="smm-edit-team"
              onClick={() => setShowTeam((v) => !v)}
              className="ml-1 inline-flex h-6 items-center rounded border border-border px-2 text-[10px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Change
            </button>
          )}
        </div>

        {showTeam && canAssign && (
          <TeamEditor
            campaignId={campaign.id}
            team={campaign.team}
            members={members}
            cycleStart={campaign.cycle.startDate}
            onDone={() => setShowTeam(false)}
          />
        )}
      </div>

      {/* ── The four jobs ────────────────────────────────────────────────────────────────── */}
      <div className="inline-flex w-full overflow-x-auto rounded-xl border border-border bg-card p-0.5">
        {([
          { key: "content" as const, label: "Content", Icon: CalendarRange },
          { key: "ads" as const, label: "Ads", Icon: Megaphone },
          { key: "money" as const, label: "Money", Icon: IndianRupee },
          { key: "report" as const, label: "Report", Icon: Users },
        ]).map(({ key, label, Icon }) => (
          <button
            key={key}
            data-test={`smm-tab-${key}`}
            onClick={() => setTab(key)}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <SmmContentTable campaign={campaign} canEdit={canEdit} onOpen={(i: SmmContentItem) => setOpenItem(i.id)} />
      )}
      {tab === "ads" && (
        <SmmAdsPanel
          campaign={campaign}
          canEdit={canEdit}
          actorName={user.name}
          onMessage={(text) => setMessage({ text, kind: "daily_report" })}
        />
      )}
      {tab === "money" && (
        <SmmMoneyPanel
          campaign={campaign}
          canEdit={canEdit}
          actorName={user.name}
          actorUid={user.uid}
          onMessage={(text) => setMessage({ text, kind: "extra_work" })}
        />
      )}
      {tab === "report" && (
        <SmmReportPanel campaign={campaign} user={user} onMessage={(text, kind) => setMessage({ text, kind })} />
      )}

      {item && (
        <SmmItemDialog
          campaign={campaign}
          item={item}
          user={user}
          members={canAssign ? members : []}
          onClose={() => setOpenItem(null)}
          onMessage={(text, kind) => setMessage({ text, kind })}
        />
      )}

      {message && (
        <SmmMessageComposer
          campaign={campaign}
          initialText={message.text}
          kind={message.kind}
          user={user}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
}

/**
 * Who is on the month, and when it runs.
 *
 * The three seats mirror the order's own tracks, so assigning here and assigning on the Orders
 * queue mean the same thing. Assistants are the part the tracks cannot express — the junior put
 * alongside the main member on a big month, who needs to see the plan and be reminded about it like
 * anybody else doing the work.
 */
function TeamEditor({ campaignId, team, members, cycleStart, onDone }: {
  campaignId: string;
  team: SmmTeam;
  members: SmmAssignee[];
  cycleStart: string;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState(cycleStart);
  const [days, setDays] = useState(30);

  const pick = async (seat: "creator" | "publisher" | "marketer", uid: string) => {
    const m = members.find((x) => x.uid === uid);
    setSaving(true);
    try {
      await setCampaignTeam(campaignId, { ...team, [seat]: m ? { uid: m.uid, name: m.name } : null });
    } finally {
      setSaving(false);
    }
  };

  const toggleAssistant = async (uid: string) => {
    const m = members.find((x) => x.uid === uid);
    if (!m) return;
    const has = team.assistants.some((a) => a.uid === uid);
    setSaving(true);
    try {
      await setCampaignTeam(campaignId, {
        ...team,
        assistants: has ? team.assistants.filter((a) => a.uid !== uid) : [...team.assistants, { uid: m.uid, name: m.name }],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-test="smm-team-editor" className="mt-3 space-y-2.5 rounded-lg border border-border bg-background p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          { seat: "creator" as const, label: "Makes the content" },
          { seat: "publisher" as const, label: "Posts it" },
          { seat: "marketer" as const, label: "Runs the ads" },
        ]).map(({ seat, label }) => (
          <div key={seat}>
            <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
            <select
              value={team[seat]?.uid || ""}
              data-test={`smm-seat-${seat}`}
              disabled={saving}
              onChange={(e) => pick(seat, e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">Nobody</option>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground">Assisting (juniors on a big month)</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = team.assistants.some((a) => a.uid === m.uid);
            return (
              <button
                key={m.uid}
                data-test={`smm-assistant-${m.uid}`}
                disabled={saving}
                onClick={() => toggleAssistant(m.uid)}
                className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Month runs from</label>
          <input
            type="date"
            value={start}
            data-test="smm-cycle-start"
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="w-20">
          <label className="text-[11px] font-medium text-muted-foreground">Days</label>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))}
            className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <button
          data-test="smm-cycle-save"
          disabled={saving}
          onClick={async () => { setSaving(true); try { await setCycle(campaignId, start, days); } finally { setSaving(false); } }}
          className="h-9 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          Set dates
        </button>
        <button onClick={onDone} className="ml-auto h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          Done
        </button>
      </div>
    </div>
  );
}
