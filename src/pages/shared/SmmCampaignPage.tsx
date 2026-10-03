/**
 * One social-media month, in full.
 *
 * ── Why four tabs and not one long page ───────────────────────────────────────────────────────
 * A month has four separable jobs — make and post the content, run the ads, handle the money, and
 * report to the client — and on any given day a person is doing exactly one of them. Stacked into
 * one scroll, the person posting today has to scroll past a budget ledger to reach the plan, on a
 * phone, several times a day.
 *
 * ── The header is the month at a glance (2026-10-03) ──────────────────────────────────────────
 * Above the tabs sits everything anybody opening the month asks first, drawn rather than written:
 * its dates as a timeline with every post as a dot on its day, what it owes as one block per piece,
 * whether it is keeping pace, who is on it and who sold it. Under that, where the month sits in the
 * client's run — the month before, the renewal coming, the month after — and, on a renewal, any
 * pieces the month before left unposted, ready to be moved in.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, ArrowRight, BellRing, CalendarRange, Check, Image as ImageIcon, IndianRupee, Loader2, Megaphone,
  MessageSquare, MoveRight, Pencil, Phone, RefreshCcw, Settings2, Sparkles, Trash2, Users, Video, X, XCircle,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaign } from "@/hooks/useSmmCampaigns";
import {
  deleteCampaign, fetchAssignableMembers, fetchCampaign, moveUnpostedToMonth, remindSellerToRenew, setRenewal,
  undoDeleteCampaign,
} from "@/services/smm";
import { renameMonth } from "@/services/smmSetup";
import { useConfirm } from "@/hooks/useConfirm";
import { toast as showToast, useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { formatCurrency } from "@/utils/formatters";
import { getWhatsAppUrl } from "@/utils/phone";
import {
  canDeleteSmmCampaign, canEditCampaign, clientWaitSummary, isOverdue, isPosted, isoDay,
} from "@/utils/smmPlan";
import {
  SMM_SEATS, canRenewSmm, canSetUpSmm, clipsPerVideoOf, cycleRangeLabel, cyclePhase, kindSegments, monthLabel,
  needsSetup, paceOf, renewalDue, videoLengthLabel,
} from "@/utils/smmPackage";
import { orderChatLink } from "@/services/orderChat";
import SmmContentTable from "@/components/smm/SmmContentTable";
import SmmAdsPanel from "@/components/smm/SmmAdsPanel";
import SmmMoneyPanel from "@/components/smm/SmmMoneyPanel";
import SmmReportPanel from "@/components/smm/SmmReportPanel";
import SmmItemDialog from "@/components/smm/SmmItemDialog";
import SmmMessageComposer from "@/components/smm/SmmMessageComposer";
import { PlatformChips } from "@/components/smm/SmmChips";
import { KindBar, MonthTimeline, PaceChip, ToneLegend } from "@/components/smm/SmmVisuals";
import { SmmSetupDialog } from "@/components/smm/SmmSetupForm";
import { useSmmRenewal } from "@/components/smm/useSmmRenewal";
import { SMM_PLATFORMS, type SmmCampaign, type SmmContentItem, type SmmContentKind, type SmmTemplateKind } from "@/types/smm";

type Tab = "content" | "ads" | "money" | "report";

const KIND_ROWS: { kind: SmmContentKind; label: string; icon: LucideIcon }[] = [
  { kind: "ai_ad", label: "Videos", icon: Sparkles },
  { kind: "poster", label: "Posters", icon: ImageIcon },
  { kind: "real_video", label: "Real videos", icon: Video },
];

const STATUS_LABEL: Partial<Record<SmmCampaign["status"], string>> = {
  completed: "Finished",
  renewed: "Renewed",
  lapsed: "Not renewed",
};

/** The pieces a month owed and never posted — what can be moved into the month after it. */
const unpostedOf = (c: SmmCampaign | null) => (c ? c.items.filter((i) => !i.extra && !isPosted(i)) : []);

/** How long a deleted month can be brought back from the toast. */
const UNDO_SECONDS = 5;

/**
 * "Month deleted — Undo" for five seconds (2026-10-03).
 *
 * The delete is written at once and Undo writes the month back exactly as it was — rather than
 * holding the delete back for five seconds — because the page has already closed and the person may
 * close the tab too: a delete that silently never happened would be worse than one that can be
 * undone. Lives outside the page component: it keeps counting after the page unmounts.
 */
function offerUndo(before: SmmCampaign, reopen: (id: string) => void) {
  const name = before.businessName || before.clientName;
  let left = UNDO_SECONDS;
  let done = false;
  const handle = showToast({
    title: "Month deleted",
    description: `${name} — undo within ${left}s`,
    duration: UNDO_SECONDS * 1000 + 200,
    action: (
      <ToastAction
        altText="Undo the delete"
        data-test="smm-undo-delete"
        onClick={async () => {
          if (done) return;
          done = true;
          clearInterval(timer);
          try {
            await undoDeleteCampaign(before);
            handle.dismiss();
            showToast({ title: "Month restored", description: name });
            reopen(before.id);
          } catch {
            showToast({ title: "Could not restore the month", description: "Try again from Add SMM sale.", variant: "destructive" });
          }
        }}
      >
        Undo
      </ToastAction>
    ),
  });
  const timer = setInterval(() => {
    left -= 1;
    if (left > 0 && !done) handle.update({ id: handle.id, description: `${name} — undo within ${left}s` });
    else clearInterval(timer);
  }, 1000);
}

/** Each person on the month once, with what they do: "makes, posts & runs ads". */
function peopleBySeat(c: SmmCampaign): { uid: string; name: string; does: string }[] {
  const map = new Map<string, { uid: string; name: string; jobs: string[] }>();
  for (const { seat, short } of SMM_SEATS) {
    const who = c.team?.[seat];
    if (!who?.uid) continue;
    const entry = map.get(who.uid) || { uid: who.uid, name: who.name, jobs: [] };
    entry.jobs.push(short);
    map.set(who.uid, entry);
  }
  return [...map.values()].map((p) => ({
    uid: p.uid,
    name: p.name,
    does: p.jobs.length > 1 ? `${p.jobs.slice(0, -1).join(", ")} & ${p.jobs[p.jobs.length - 1]}` : p.jobs[0],
  }));
}

export default function SmmCampaignPage() {
  const { campaignId } = useParams();
  const user = useAuthStore((s) => s.user);
  const { campaign, loading } = useSmmCampaign(campaignId);
  const [tab, setTab] = useState<Tab>("content");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: SmmTemplateKind } | null>(null);
  const [members, setMembers] = useState<{ uid: string; name: string }[]>([]);
  const [settingUp, setSettingUp] = useState(false);
  const [previous, setPrevious] = useState<SmmCampaign | null>(null);
  const [busy, setBusy] = useState<"" | "delete" | "move" | "remind" | "lost" | "rename">("");
  /** The name being typed while the month is renamed in place; null when not renaming. */
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const canEdit = canEditCampaign(campaign || { watchers: [], soldBy: "" }, user);
  const canSetUp = canSetUpSmm(user);
  const canDelete = canDeleteSmmCampaign(user);
  const canRenew = !!campaign && !!user && canRenewSmm(campaign, user);
  const { renew, renewingId } = useSmmRenewal(user);
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast } = useToast();
  const today = isoDay(new Date());

  useEffect(() => {
    if (canSetUp) fetchAssignableMembers().then(setMembers);
  }, [canSetUp]);

  // The month before — for the link back, and for any pieces it left unposted.
  const renewalOf = campaign?.renewalOf || "";
  useEffect(() => {
    if (!renewalOf) { setPrevious(null); return; }
    let cancelled = false;
    fetchCampaign(renewalOf).then((c) => { if (!cancelled) setPrevious(c); }).catch(() => { if (!cancelled) setPrevious(null); });
    return () => { cancelled = true; };
  }, [renewalOf]);

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

  const business = campaign.businessName || campaign.clientName;
  const pace = paceOf(campaign, today);
  const wait = clientWaitSummary(campaign.items);
  const late = campaign.items.filter((i) => isOverdue(i, today)).length;
  const clips = clipsPerVideoOf(campaign);
  const monthNo = campaign.monthNumber || 1;
  const setupDue = needsSetup(campaign, today);
  const renewDue = renewalDue(campaign, today);
  const ended = cyclePhase(campaign.cycle, today) === "ended";
  const nextId = campaign.renewal?.nextCampaignId || "";
  const leftover = unpostedOf(previous);
  // Offered once the month before has ended — its pieces are its own until then.
  const canCarry = canSetUp && !!previous && leftover.length > 0
    && (previous.status !== "active" || cyclePhase(previous.cycle, today) === "ended");
  const pageLinks = SMM_PLATFORMS.filter((p) => campaign.pageLinks?.[p.key]?.trim());

  const removeMonth = async () => {
    const { confirmed } = await confirm({
      title: `Delete ${business}'s month?`,
      description: `Its plan, ads, money and report go for everyone, and it will not come back if the sale is edited. You can undo it for ${UNDO_SECONDS} seconds.`,
      confirmText: "Delete month",
      variant: "destructive",
    });
    if (!confirmed) return;
    setBusy("delete");
    const before = campaign;
    try {
      await deleteCampaign(before, user);
      navigate("/smm");
      offerUndo(before, (id) => navigate(`/smm/${id}`));
    } catch {
      toast({ title: "Could not delete the month", description: "Try again.", variant: "destructive" });
      setBusy("");
    }
  };

  const saveName = async () => {
    if (nameDraft === null) return;
    if (!nameDraft.trim()) { toast({ title: "Give the month a name", variant: "destructive" }); return; }
    setBusy("rename");
    try {
      const changed = await renameMonth(campaign.id, nameDraft);
      if (changed) toast({ title: "Month renamed", description: nameDraft.trim() });
      setNameDraft(null);
    } catch (err) {
      toast({ title: "Not renamed", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const moveLeftover = async () => {
    if (!previous) return;
    setBusy("move");
    try {
      const moved = await moveUnpostedToMonth(previous.id, campaign.id, leftover.map((i) => i.id), user);
      toast({ title: `${moved} piece${moved === 1 ? "" : "s"} moved in`, description: `From ${monthLabel(previous.cycle.startDate)} — still owed, now planned here.` });
    } catch (err) {
      toast({ title: "Not moved", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const remind = async () => {
    setBusy("remind");
    try {
      await remindSellerToRenew(campaign, user);
      toast({ title: `${campaign.soldByName} has been reminded` });
    } finally {
      setBusy("");
    }
  };

  const notRenewing = async () => {
    const { confirmed } = await confirm({
      title: `${business} is not renewing?`,
      description: "The month is closed as not renewed once its last day has passed. You can still renew it later from the sale form.",
      confirmText: "Not renewing",
    });
    if (!confirmed) return;
    setBusy("lost");
    try {
      await setRenewal(campaign.id, "lost", user);
      toast({ title: "Marked as not renewing" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      {/* `-mx-2 px-2 py-1.5`: the words are the same size, but the thing a thumb has to hit is
          not. The negative margin keeps it optically flush with the card below. */}
      <Link to="/smm" className="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ArrowLeft size={14} /> Social Media Management
      </Link>

      {/* ── The month at a glance ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {nameDraft !== null ? (
                /* Renamed in place — the board, this page, the top bar and the team's jobs follow. */
                <form data-test="smm-rename-form" onSubmit={(e) => { e.preventDefault(); saveName(); }} className="flex min-w-0 max-w-full items-center gap-1.5">
                  <input
                    autoFocus
                    value={nameDraft}
                    maxLength={80}
                    data-test="smm-rename-input"
                    aria-label="Month name"
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setNameDraft(null); }}
                    className="h-10 w-72 min-w-0 max-w-full rounded-md border border-primary bg-background px-2 text-lg font-bold text-foreground outline-none"
                  />
                  <button type="submit" disabled={busy === "rename"} data-test="smm-rename-save" aria-label="Save name"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {busy === "rename" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button type="button" onClick={() => setNameDraft(null)} aria-label="Cancel renaming"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent">
                    <X size={15} />
                  </button>
                </form>
              ) : (
                <>
                  <h1 data-test="smm-page-business" className="truncate text-xl font-bold text-foreground sm:text-2xl">{business}</h1>
                  {canSetUp && (
                    <button data-test="smm-rename" onClick={() => setNameDraft(business)} aria-label="Rename this month" title="Rename"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Pencil size={14} />
                    </button>
                  )}
                </>
              )}
              {monthNo > 1 && (
                <span data-test="smm-page-month-no" className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Month {monthNo}</span>
              )}
              {campaign.history && <span className="rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-semibold text-info">History</span>}
              {!campaign.history && STATUS_LABEL[campaign.status] && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{STATUS_LABEL[campaign.status]}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {campaign.clientName && campaign.clientName !== campaign.businessName ? `${campaign.clientName} · ` : ""}
              {campaign.packageLabel} · {formatCurrency(campaign.amount)}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span data-test="smm-page-range"><CalendarRange size={12} className="mr-1 inline" />{cycleRangeLabel(campaign.cycle)}</span>
              {(campaign.commitments?.ai_ad || 0) > 0 && (
                <span data-test="smm-page-length">· each video <b className="text-foreground">{videoLengthLabel(clips)}</b></span>
              )}
              <PlatformChips platforms={campaign.platforms} />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <a href={getWhatsAppUrl(campaign.clientPhone)} target="_blank" rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
              <Phone size={13} /> Client
            </a>
            {/* A month with no order behind it (started directly, before every month had a sale)
                has no client chat room — the link would lead to a page saying so. */}
            {campaign.orderId && (
              <a href={orderChatLink(campaign.orderId)} target="_blank" rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
                <MessageSquare size={13} /> Their chat
              </a>
            )}
            {canSetUp && campaign.status === "active" && !campaign.history && (
              <button data-test="smm-page-setup" onClick={() => setSettingUp(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/50 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
                <Settings2 size={13} /> {campaign.setupAt || !setupDue ? "Edit setup" : "Set up & assign"}
              </button>
            )}
            {canDelete && (
              <button data-test="smm-delete-month" onClick={removeMonth} disabled={busy === "delete"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50">
                {busy === "delete" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
              </button>
            )}
          </div>
        </div>

        {setupDue && canSetUp && (
          <div data-test="smm-page-needs-setup" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
            <span className="min-w-0 flex-1">Nobody is on this month yet. Set its dates and video length, and give the work out.</span>
            <button onClick={() => setSettingUp(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-warning px-3 text-xs font-semibold text-white hover:bg-warning/90">
              <Settings2 size={13} /> Set up & assign
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <MonthTimeline cycle={campaign.cycle} today={today} items={campaign.items} size="lg" />
            <ToneLegend className="mt-2" />
          </div>
          <div className="grid min-w-0 gap-2.5">
            {KIND_ROWS.map(({ kind, label, icon }) => {
              const committed = campaign.commitments?.[kind] || 0;
              if (committed <= 0) return null;
              const segments = kindSegments(campaign.items, kind, today);
              const carried = campaign.items.filter((i) => i.kind === kind && i.carriedFrom).length;
              return (
                <KindBar key={kind} testId={`smm-page-bar-${kind}`} label={label} icon={icon}
                  segments={segments} committed={committed} posted={segments.filter((s) => s.tone === "done").length}
                  note={kind === "ai_ad" ? `${clips * 8}s each${carried ? ` · ${carried} carried` : ""}` : carried ? `${carried} carried` : undefined} />
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {!campaign.history && <PaceChip pace={pace} />}
          {late > 0 && <span className="font-medium text-destructive">{late} late</span>}
          {wait.openCount > 0 && <span className="text-warning">{wait.openCount} waiting on the client</span>}
          {campaign.history && <span className="text-muted-foreground">Recorded after the month ended — its delivery was not tracked here.</span>}
        </div>

        {/* Small, underneath the client — the people on the month. */}
        <div data-test="smm-page-people" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <Users size={12} />
          {/* One entry per person — "Divya makes, posts & runs ads", not her name three times. */}
          {peopleBySeat(campaign).map((p) => (
            <span key={p.uid}><b className="text-foreground">{p.name}</b> {p.does}</span>
          ))}
          {(campaign.team?.assistants || []).length > 0 && (
            <span>Assisting: {(campaign.team.assistants || []).map((a) => a.name).join(", ")}</span>
          )}
          {!campaign.team?.creator && !campaign.team?.publisher && !campaign.team?.marketer && (
            <span>{campaign.history ? "No team — recorded as history" : "Nobody on it yet"}</span>
          )}
          <span className="ml-auto">
            {campaign.origin === "direct" ? "added by" : "sold by"} <b className="text-foreground">{campaign.soldByName}</b>
            {campaign.setupByName ? ` · set up by ${campaign.setupByName}` : ""}
          </span>
        </div>

        {pageLinks.length > 0 && (
          <div data-test="smm-page-links" className="mt-2 flex flex-wrap gap-1.5">
            {pageLinks.map((p) => {
              const raw = campaign.pageLinks?.[p.key]?.trim() || "";
              const href = /^https?:\/\//i.test(raw) ? raw : null;
              return href ? (
                <a key={p.key} href={href} target="_blank" rel="noreferrer"
                  className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-accent">
                  {p.label}: {raw.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 40)}
                </a>
              ) : (
                <span key={p.key} className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] text-foreground">
                  {p.label}: {raw}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Where this month sits in the client's run ─────────────────────────────────────── */}
      {(renewalOf || nextId || renewDue || campaign.renewal?.state === "lost") && (
        <div data-test="smm-page-renewal" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs">
          {renewalOf && (
            <Link to={`/smm/${renewalOf}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-medium text-foreground hover:bg-accent">
              <ArrowLeft size={12} /> {previous ? monthLabel(previous.cycle.startDate) : "Previous month"}
            </Link>
          )}
          <span className="min-w-0 flex-1 text-muted-foreground">
            {nextId
              ? <>Renewed{campaign.renewal?.byName ? ` by ${campaign.renewal.byName}` : ""} — the next month is set.</>
              : campaign.renewal?.state === "lost"
                ? "Not renewing."
                : renewDue
                  ? (ended
                    ? <>The month has ended without a renewal decision.</>
                    : <>Renewal due — {campaign.soldByName} renews it by recording the sale.</>)
                  : <>Month {monthNo} of this client.</>}
          </span>
          {nextId && (
            <Link to={`/smm/${nextId}`} data-test="smm-page-next"
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-success/15 px-2.5 font-medium text-success hover:bg-success/25">
              Next month <ArrowRight size={12} />
            </Link>
          )}
          {renewDue && canRenew && (
            <>
              <button onClick={() => renew(campaign)} disabled={renewingId === campaign.id} data-test="smm-page-renew"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {renewingId === campaign.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} Renew for next month
              </button>
              <button onClick={notRenewing} disabled={busy === "lost"} data-test="smm-page-not-renewing"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">
                <XCircle size={12} /> Not this time
              </button>
            </>
          )}
          {renewDue && !canRenew && canSetUp && campaign.soldBy !== user.uid && (
            <button onClick={remind} disabled={busy === "remind"} data-test="smm-page-remind"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 font-medium text-foreground hover:bg-accent disabled:opacity-50">
              {busy === "remind" ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />} Remind {campaign.soldByName}
            </button>
          )}
        </div>
      )}

      {canCarry && previous && (
        <div data-test="smm-page-carry" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-foreground">
          <span className="min-w-0 flex-1">
            {monthLabel(previous.cycle.startDate)} left <b>{leftover.length} piece{leftover.length === 1 ? "" : "s"}</b> unposted.
            They are still owed — move them into this month to plan them here.
          </span>
          <button onClick={moveLeftover} disabled={busy === "move"}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-warning px-3 font-semibold text-white hover:bg-warning/90 disabled:opacity-50">
            {busy === "move" ? <Loader2 size={12} className="animate-spin" /> : <MoveRight size={12} />} Move them here
          </button>
        </div>
      )}

      {/* ── The four jobs ────────────────────────────────────────────────────────────────── */}
      <div className="inline-flex w-full overflow-x-auto rounded-xl border border-border bg-card p-0.5">
        {([
          { key: "content" as const, label: "Content", Icon: CalendarRange },
          { key: "ads" as const, label: "Ads", Icon: Megaphone },
          { key: "money" as const, label: "Money", Icon: IndianRupee },
          { key: "report" as const, label: "Report", Icon: Users },
        ]).map(({ key, label, Icon }) => (
          <button key={key} data-test={`smm-tab-${key}`} onClick={() => setTab(key)}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <SmmContentTable campaign={campaign} canEdit={canEdit} onOpen={(i: SmmContentItem) => setOpenItem(i.id)} />
      )}
      {tab === "ads" && (
        <SmmAdsPanel campaign={campaign} canEdit={canEdit} actorName={user.name}
          onMessage={(text) => setMessage({ text, kind: "daily_report" })} />
      )}
      {tab === "money" && (
        <SmmMoneyPanel campaign={campaign} canEdit={canEdit} actorName={user.name} actorUid={user.uid}
          onMessage={(text) => setMessage({ text, kind: "extra_work" })} />
      )}
      {tab === "report" && (
        <SmmReportPanel campaign={campaign} user={user} onMessage={(text, kind) => setMessage({ text, kind })} />
      )}

      {item && (
        <SmmItemDialog campaign={campaign} item={item} user={user} members={canSetUp ? members : []}
          onClose={() => setOpenItem(null)} onMessage={(text, kind) => setMessage({ text, kind })} />
      )}

      {message && (
        <SmmMessageComposer campaign={campaign} initialText={message.text} kind={message.kind} user={user}
          onClose={() => setMessage(null)} />
      )}

      {settingUp && (
        <SmmSetupDialog campaign={campaign} user={user} onClose={() => setSettingUp(false)} />
      )}
    </div>
  );
}
