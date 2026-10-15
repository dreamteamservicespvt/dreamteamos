/**
 * Setting a social-media month up — the tech side's half of the handover (2026-10-03).
 *
 * Four things, in the order they are decided: when the month runs (the end follows the start to the
 * same date next month unless somebody types otherwise), how long each video is, where the client's
 * pages are, and who does the work. A month whose dates are already over is recorded as history: the
 * team section then asks who DID the work — saved by name, no job cards (2026-10-05; it used to be
 * hidden, which left an old month's team no way to see it or fill in its work).
 *
 * The form is controlled; `SmmSetupDialog` below wraps it for a month that already exists, and the
 * "Add SMM sale" dialog uses it as its last step.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AtSign, CalendarRange, Check, Clapperboard, ExternalLink, ListChecks, Loader2, Lock, PencilLine, RefreshCcw, Users, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { applyHistorySetup, applyMonthSetup, historySetupProblem, setupProblem } from "@/services/smmSetup";
import { SmmMonthDatesError, createRenewalMonth, fetchAssignableMembers } from "@/services/smm";
import type { MonthDatesVerdict } from "@/utils/smmMonthDates";
import { ClipsPerVideoPicker } from "@/components/sales/SmmSaleFields";
import { dayToDate, isoDay, ownDayCount, teamMembers } from "@/utils/smmPlan";
import {
  DEFAULT_SMM_CLIPS_PER_VIDEO, SMM_SEATS, canAdminRenewSmm, cleanPlatforms, clipsPerVideoOf, cycleRangeLabel, isMonthLocked, isNoSaleMonth,
  lockedMonthLabel, monthCycle, ownDaysLabel, sellerLineOf, shortDayLabel, type SmmSeat,
} from "@/utils/smmPackage";
import {
  SMM_PLATFORMS, type SmmAssignee, type SmmCampaign, type SmmContentKind, type SmmPlatform, type SmmTeam,
} from "@/types/smm";
import type { SmmAssignResult } from "@/services/smmAssign";
import type { AppUser } from "@/types";

export interface SmmSetupValue {
  /** The month's name — the business or page name the board, its page and the jobs show. */
  businessName: string;
  /** How many videos, posters and real videos the month owes. */
  commitments: Record<SmmContentKind, number>;
  startDate: string;
  endDate: string;
  /** The end was typed, so a new start no longer moves it. */
  endTouched: boolean;
  clipsPerVideo: number;
  pageLinks: Partial<Record<SmmPlatform, string>>;
  /**
   * The accounts the month covers, when this form chooses them — Set up / Edit setup and setting up a
   * recorded sale (2026-10-05). Absent: the caller owns them (the no-sale step ticks them beside its
   * package) and passes them as the form's `platforms`.
   */
  platforms?: SmmPlatform[];
  team: SmmTeam;
  /**
   * The client's billing day the month carries (`SmmCycle.anchorDay`, 2026-10-15) and the start it belongs
   * to: while the start is unchanged the automatic end keeps it (28 Feb → 31 Mar, not 28 Mar), exactly as
   * the services keep it on save (`anchorKept`). Form state only — never saved from here.
   */
  anchor?: { startDate: string; day: number } | null;
}

const EMPTY_TEAM: SmmTeam = { creator: null, publisher: null, marketer: null, assistants: [] };

/**
 * The end a start gets automatically: the same date next month (`monthCycle`), on the client's billing
 * day while the start is the one the month already had (2026-10-15). It used to be `addMonthsIso(start,
 * 1)`, which put a 31st client on the 28th after February for ever.
 */
export function autoEndOf(start: string, anchor?: SmmSetupValue["anchor"]): string {
  return monthCycle(start, null, anchor && anchor.startDate === start ? anchor.day : null).endDate;
}
const NO_COUNTS: Record<SmmContentKind, number> = { ai_ad: 0, poster: 0, real_video: 0 };

/** The three counts, in the order a month is described: videos first. */
const COUNT_ROWS: { kind: SmmContentKind; label: string }[] = [
  { kind: "ai_ad", label: "Videos" },
  { kind: "poster", label: "Posters" },
  { kind: "real_video", label: "Real videos" },
];

/** "4 videos · 4 posters" — a set of counts in words, zeros left out. */
export function countsLine(c: Partial<Record<SmmContentKind, number>> | null | undefined): string {
  const parts = COUNT_ROWS
    .map(({ kind, label }) => ({ n: Math.max(0, Math.floor(c?.[kind] || 0)), label: label.toLowerCase() }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.n === 1 ? p.label.replace(/s$/, "") : p.label}`);
  return parts.join(" · ") || "nothing";
}

/** A month's current setup as the form's starting point — or a fresh one starting on `startDate`. */
export function setupValueOf(
  campaign: SmmCampaign | null | undefined,
  startDate?: string,
  businessName?: string,
  commitments?: Record<SmmContentKind, number> | null,
): SmmSetupValue {
  const start = startDate || campaign?.cycle?.startDate || isoDay(new Date());
  const cycle = monthCycle(start, startDate ? null : campaign?.cycle?.endDate);
  const anchor = !startDate && campaign?.cycle?.anchorDay ? { startDate: campaign.cycle.startDate, day: campaign.cycle.anchorDay } : null;
  return {
    businessName: businessName ?? campaign?.businessName ?? campaign?.clientName ?? "",
    commitments: { ...NO_COUNTS, ...(commitments ?? campaign?.commitments ?? {}) },
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    // Typed by hand only when it is not what the rule (with the client's billing day) would give.
    endTouched: !startDate && !!campaign?.cycle && campaign.cycle.endDate !== autoEndOf(campaign.cycle.startDate, anchor),
    anchor,
    clipsPerVideo: campaign ? clipsPerVideoOf(campaign) : DEFAULT_SMM_CLIPS_PER_VIDEO,
    pageLinks: { ...(campaign?.pageLinks || {}) },
    ...(campaign ? { platforms: cleanPlatforms(campaign.platforms) } : {}),
    team: campaign?.team ? { ...EMPTY_TEAM, ...campaign.team, assistants: campaign.team.assistants || [] } : { ...EMPTY_TEAM },
  };
}

/** What the services take. */
export function setupInputOf(v: SmmSetupValue) {
  return {
    businessName: v.businessName,
    commitments: v.commitments,
    startDate: v.startDate,
    endDate: v.endDate,
    clipsPerVideo: v.clipsPerVideo,
    pageLinks: v.pageLinks,
    ...(v.platforms ? { platforms: v.platforms } : {}),
    team: v.team,
  };
}

/**
 * The accounts as tick-chips (2026-10-05) — one control wherever accounts are chosen: setup's "Accounts
 * it covers", and the no-sale step's "Accounts it covered".
 */
export function AccountPicker({ value, onChange, testPrefix }: {
  value: SmmPlatform[];
  onChange: (next: SmmPlatform[]) => void;
  /** `${testPrefix}-${account}` on each chip. */
  testPrefix: string;
}) {
  return (
    <div role="group" aria-label="Accounts" className="mt-1 flex flex-wrap gap-1.5">
      {SMM_PLATFORMS.map((p) => {
        const on = value.includes(p.key);
        return (
          <button key={p.key} type="button" aria-pressed={on} data-test={`${testPrefix}-${p.key}`}
            onClick={() => onChange(on ? value.filter((x) => x !== p.key) : cleanPlatforms([...value, p.key]))}
            className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
            }`}>
            {on && <Check size={12} aria-hidden />} {p.label}
          </button>
        );
      })}
    </div>
  );
}

const inputCls = "mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary";

export default function SmmSetupForm({ value, onChange, members, platforms: givenPlatforms = [], soldCommitments }: {
  value: SmmSetupValue;
  onChange: (next: SmmSetupValue) => void;
  members: { uid: string; name: string }[];
  /**
   * The accounts the month covers, when the caller chooses them (the no-sale step) — one page-link box
   * each. When the value carries `platforms`, the form asks for them itself and this is not used.
   */
  platforms?: SmmPlatform[];
  /** What the sale promised, shown beside the counts so a change from it is visible. */
  soldCommitments?: Record<SmmContentKind, number> | null;
}) {
  const today = isoDay(new Date());
  // The video length is only asked while the month owes AI videos.
  const hasVideos = (value.commitments.ai_ad || 0) > 0;
  const setCount = (kind: SmmContentKind, n: number) =>
    set({ commitments: { ...value.commitments, [kind]: Math.max(0, Math.min(60, Math.floor(n) || 0)) } });
  const changedFromSale = !!soldCommitments
    && COUNT_ROWS.some(({ kind }) => (soldCommitments[kind] || 0) !== (value.commitments[kind] || 0));
  /*
    ── The month's own days, as the services count them (2026-10-15) ──────────────────────────────
    The end date is the RENEWAL DAY — the next month's first day — so "6 Sep → 6 Oct" has 30 own days
    (6 Sep – 5 Oct) and is over (history) from 6 Oct on, the day the services file it so: the form said
    "not over" on that day and counted 31 days. A month with no start yet (a month that had no sale is
    picked, never guessed — owner, 2026-10-15) shows no range at all.
  */
  const hasStart = !!dayToDate(value.startDate);
  const cycle = monthCycle(value.startDate, value.endDate);
  const history = hasStart && cycle.endDate <= today;
  const days = ownDayCount(cycle);
  const set = (patch: Partial<SmmSetupValue>) => onChange({ ...value, ...patch });
  /** The form chooses the accounts itself (Set up / Edit setup, setting up a sale) — see `SmmSetupValue`. */
  const choosesAccounts = !!value.platforms;
  const platforms = value.platforms ?? givenPlatforms;

  const setStart = (start: string) => set({
    startDate: start,
    endDate: value.endTouched && value.endDate ? value.endDate : autoEndOf(start, value.anchor),
  });

  const person = (uid: string): SmmAssignee | null => {
    const m = members.find((x) => x.uid === uid);
    return m ? { uid: m.uid, name: m.name } : null;
  };
  const setSeat = (seat: SmmSeat, uid: string) => set({ team: { ...value.team, [seat]: person(uid) } });
  const giveAll = (uid: string) => {
    const p = person(uid);
    if (!p) return;
    set({ team: { ...value.team, creator: p, publisher: p, marketer: p } });
  };
  const toggleAssistant = (uid: string) => {
    const has = value.team.assistants.some((a) => a.uid === uid);
    const p = person(uid);
    set({
      team: {
        ...value.team,
        assistants: has ? value.team.assistants.filter((a) => a.uid !== uid) : p ? [...value.team.assistants, p] : value.team.assistants,
      },
    });
  };

  // A seat held by somebody no longer in the list (left the team) still shows their name.
  const seatOptions = (seat: SmmSeat) => {
    const held = value.team[seat];
    return held && !members.some((m) => m.uid === held.uid) ? [held, ...members] : members;
  };

  return (
    <div data-test="smm-setup-form" className="space-y-4">
      {/* ── What it is called ────────────────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold text-foreground">
          <span className="flex items-center gap-1.5"><PencilLine size={13} className="text-primary" /> Name</span>
          <input
            value={value.businessName}
            data-test="smm-setup-name"
            maxLength={80}
            placeholder="Business or page name — e.g. Sri Sai Silks"
            onChange={(e) => set({ businessName: e.target.value })}
            className={inputCls}
          />
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          How the month is named on the board, its page and the team's jobs. The sale keeps its own record.
        </p>
      </section>

      {/* ── What it owes ─────────────────────────────────────────────────────────────────── */}
      <section data-test="smm-setup-counts">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ListChecks size={13} className="text-primary" /> What the month owes
        </h4>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {COUNT_ROWS.map(({ kind, label }) => {
            const n = value.commitments[kind] || 0;
            return (
              <div key={kind} className="min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                <div className="mt-1 flex items-stretch">
                  <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} data-test={`smm-setup-less-${kind}`}
                    onClick={() => setCount(kind, n - 1)} disabled={n <= 0}
                    className="h-9 w-8 shrink-0 rounded-l-md border border-border text-sm text-foreground hover:bg-accent disabled:opacity-40">−</button>
                  <input type="number" min={0} max={60} inputMode="numeric" value={n}
                    aria-label={label} data-test={`smm-setup-count-${kind}`}
                    onChange={(e) => setCount(kind, Number(e.target.value))}
                    className="h-9 w-full min-w-0 border-y border-border bg-background text-center font-mono text-sm text-foreground outline-none focus:border-primary" />
                  <button type="button" aria-label={`More ${label.toLowerCase()}`} data-test={`smm-setup-more-${kind}`}
                    onClick={() => setCount(kind, n + 1)}
                    className="h-9 w-8 shrink-0 rounded-r-md border border-border text-sm text-foreground hover:bg-accent">+</button>
                </div>
              </div>
            );
          })}
        </div>
        {soldCommitments && (
          <p data-test="smm-setup-sold" className={`mt-1 text-[11px] ${changedFromSale ? "text-warning" : "text-muted-foreground"}`}>
            Sold as {countsLine(soldCommitments)}
            {changedFromSale ? " — the month will owe what you set here." : "."}
          </p>
        )}
      </section>

      {/* ── When ─────────────────────────────────────────────────────────────────────────── */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CalendarRange size={13} className="text-primary" /> When the month runs
        </h4>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">
            Starts
            <input type="date" value={value.startDate} data-test="smm-setup-start"
              onChange={(e) => e.target.value && setStart(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[11px] font-medium text-muted-foreground">
            Renews on {!value.endTouched && <span className="font-normal">(same date next month)</span>}
            <input type="date" value={value.endDate} min={value.startDate || undefined} data-test="smm-setup-end"
              disabled={!hasStart}
              onChange={(e) => e.target.value && set({ endDate: e.target.value, endTouched: true })} className={`${inputCls} disabled:opacity-60`} />
          </label>
        </div>
        {hasStart ? (
          /* Its own days, and the renewal day apart (2026-10-15): "6 Sep – 5 Oct · 30 days · renews 6 Oct". */
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground" data-test="smm-setup-range">
            <span>
              <b className="text-foreground">{ownDaysLabel(cycle)}</b> · {days} days · renews {shortDayLabel(cycle.endDate)}
            </span>
            {value.endTouched && (
              <button type="button" data-test="smm-setup-end-reset"
                onClick={() => set({ endDate: autoEndOf(value.startDate, value.anchor), endTouched: false })}
                className="font-medium text-primary underline-offset-2 hover:underline">
                Back to the same date next month
              </button>
            )}
          </p>
        ) : (
          <p className="mt-1 text-[11px] font-medium text-destructive" data-test="smm-setup-range-missing">
            Pick the day the month started.
          </p>
        )}
        {history && (
          <p data-test="smm-setup-history" className="mt-2 rounded-md border border-info/40 bg-info/10 p-2 text-xs text-foreground">
            These dates are already over, so this month is recorded as <b>history</b>: its package, salesperson,
            dates and the people below are kept for the record. Nobody gets a job card for it and nothing on it
            can be late — afterwards, fill in what was made and posted on the month's Content tab.
          </p>
        )}
      </section>

      {/* ── How long each video is ───────────────────────────────────────────────────────── */}
      {hasVideos && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Clapperboard size={13} className="text-primary" /> Each video
          </h4>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            The AI studio makes every video of this month at this length. Most clients get 4 clips; some ask for 6.
          </p>
          <ClipsPerVideoPicker value={value.clipsPerVideo} onChange={(clips) => set({ clipsPerVideo: clips })} testPrefix="smm-setup-clips" />
        </section>
      )}

      {/* ── Where: the accounts, then the client's page on each ──────────────────────────── */}
      {(choosesAccounts || platforms.length > 0) && (
        <section data-test="smm-setup-accounts">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AtSign size={13} className="text-primary" /> {choosesAccounts ? "Accounts it covers" : "The client's pages"}
            {!choosesAccounts && <span className="font-normal text-muted-foreground">(optional)</span>}
          </h4>
          {choosesAccounts && (
            <>
              <AccountPicker value={platforms} onChange={(next) => set({ platforms: next })} testPrefix="smm-setup-platform" />
              <p className={`mt-1 text-[11px] ${platforms.length === 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {platforms.length === 0
                  ? "Tick at least one account the month covers."
                  : "Every post goes on these accounts unless it was given its own. Posts already live stay where they went."}
              </p>
              {platforms.length > 0 && (
                <p className="mt-2.5 text-[11px] font-medium text-muted-foreground">
                  The client's page on each <span className="font-normal">(optional)</span>
                </p>
              )}
            </>
          )}
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {SMM_PLATFORMS.filter((p) => platforms.includes(p.key)).map((p) => (
              <label key={p.key} className="text-[11px] font-medium text-muted-foreground">
                {p.label}
                <input
                  value={value.pageLinks[p.key] || ""}
                  data-test={`smm-setup-link-${p.key}`}
                  placeholder="@handle or page link"
                  onChange={(e) => set({ pageLinks: { ...value.pageLinks, [p.key]: e.target.value } })}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── Who ──────────────────────────────────────────────────────────────────────────── */}
      {/*
        A history month asks too (owner, 2026-10-05): the people who DID its work, saved on the month by
        name so it is in their Social Media and they can fill in its work — never a job card
        (services/smmSetup.historyTeam). Optional there; a running month needs somebody.
      */}
      <section data-test="smm-setup-team">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Users size={13} className="text-primary" /> {history ? "Who did the work" : "Who does the work"}
          {history && <span className="font-normal text-muted-foreground">(optional)</span>}
        </h4>
        <p data-test="smm-setup-team-help" className="mb-1.5 text-[11px] text-muted-foreground">
          {history
            ? "Saved on the month so they see it in Social Media and can fill in what they made and posted. No job cards — it is a record."
            : "Each person gets one job in My Work for this month, listing what they hold, at the video length above."}
        </p>
        <label className="text-[11px] font-medium text-muted-foreground">
          Give everything to one person
          <select value="" data-test="smm-setup-all" onChange={(e) => e.target.value && giveAll(e.target.value)} className={inputCls}>
            <option value="">Choose a member…</option>
            {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </select>
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {SMM_SEATS.map(({ seat, label }) => (
            <label key={seat} className="text-[11px] font-medium text-muted-foreground">
              {label}
              <select value={value.team[seat]?.uid || ""} data-test={`smm-setup-seat-${seat}`}
                onChange={(e) => setSeat(seat, e.target.value)} className={inputCls}>
                <option value="">Nobody</option>
                {seatOptions(seat).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
              </select>
            </label>
          ))}
        </div>
        {members.length > 0 && (
          <div className="mt-2">
            <span className="text-[11px] font-medium text-muted-foreground">Assisting (juniors on a big month)</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = value.team.assistants.some((a) => a.uid === m.uid);
                return (
                  <button key={m.uid} type="button" data-test={`smm-setup-assistant-${m.uid}`} aria-pressed={on}
                    onClick={() => toggleAssistant(m.uid)}
                    className={`h-7 rounded-md border px-2 text-[11px] font-medium transition-colors ${
                      on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                    }`}>
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * What the dates check said about a change of a month's dates (2026-10-15, services/smm
 * `SmmMonthDatesError`) — shown in the setup screens in place of a toast, because each answer needs
 * something done: the posts that would fall outside the new dates are LISTED and kept only on "Keep the new
 * dates anyway" (never silently — the owner's Dhana lakshmi month lost its posts' month that way); an
 * overlap names the client's other month with Open that month; a locked month says it stays in the past.
 */
export function MonthDatesAsk({ verdict, busy, onKeep, onClose }: {
  verdict: MonthDatesVerdict;
  busy?: boolean;
  /** "Keep the new dates anyway" — the caller saves again carrying these pieces' ids. */
  onKeep: () => void;
  /** Leaving the dialog for another month's page. */
  onClose?: () => void;
}) {
  if (verdict.overlap || verdict.locked || verdict.unconfirmed.length === 0) {
    return (
      <div data-test="smm-dates-refused" role="alert"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-foreground">
        <span className="min-w-[12rem] flex-1">{verdict.problem}</span>
        {verdict.overlap && (
          <Link to={`/smm/${verdict.overlap.id}`} onClick={onClose} data-test="smm-dates-overlap-open"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent">
            <ExternalLink size={13} /> Open that month
          </Link>
        )}
      </div>
    );
  }
  const n = verdict.outside.length;
  return (
    <div data-test="smm-dates-outside" role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-foreground">
      <p className="font-semibold text-amber-800 dark:text-warning">
        {n === 1 ? "This post will be" : `These ${n} posts will be`} outside the month's new dates
      </p>
      <ul className="mt-1.5 space-y-0.5" data-test="smm-dates-outside-list">
        {verdict.outside.map((p) => (
          <li key={p.id} className="flex flex-wrap gap-x-1.5">
            <span className="min-w-0 font-medium">{p.title.trim() || "Untitled post"}</span>
            <span className="text-muted-foreground">
              {shortDayLabel(p.day)}{p.posted ? " · posted" : ""}{p.wasInside ? "" : " · already outside before"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-muted-foreground">
        They won't count toward this month. If they belong to another month of this client, open each post and move it
        there; if a date is wrong, fix it in the Content list.
      </p>
      <button type="button" onClick={onKeep} disabled={busy} data-test="smm-dates-keep"
        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {busy && <Loader2 size={12} className="animate-spin" />} Keep the new dates anyway
      </button>
    </div>
  );
}

/** The dates check's refusal, when that is what a save threw — else null (any other error is a toast). */
export function monthDatesVerdictOf(err: unknown): MonthDatesVerdict | null {
  return err instanceof SmmMonthDatesError ? err.verdict : null;
}

/** One sentence about what assigning did, for the toast. */
export function assignSummary(r: SmmAssignResult | null): string {
  if (!r) return "";
  const parts: string[] = [];
  if (r.created.length) parts.push(`${r.created.map((c) => c.name).join(" and ")} ${r.created.length === 1 ? "has" : "have"} the job in My Work`);
  if (r.withdrawn.length) parts.push(`${r.withdrawn.map((w) => w.name).join(", ")} taken off`);
  if (r.keptStarted.length) parts.push(`${r.keptStarted.map((k) => k.name).join(", ")} already started — their job stays (take it back from Work Assign if needed)`);
  if (r.skippedInactive.length) parts.push(`${r.skippedInactive.map((s) => s.name).join(", ")} no longer active, left off`);
  return parts.join(" · ");
}

/** The setup of a month that already exists — "Set up & assign" on the board, "Edit setup" on its page. */
export function SmmSetupDialog({ campaign, user, onClose, onSaved }: {
  campaign: SmmCampaign;
  user: Pick<AppUser, "uid" | "name" | "role" | "createdBy">;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<SmmSetupValue>(() => setupValueOf(campaign));
  const [members, setMembers] = useState<{ uid: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [renewing, setRenewing] = useState(false);
  useEffect(() => { fetchAssignableMembers().then(setMembers); }, []);
  const today = isoDay(new Date());

  /*
    Completed or historical months are LOCKED (2026-10-12). They cannot be edited to represent
    the next renewal period. Their dates must remain in the past, and managing them updates the
    historical record without creating live jobs. To start the next period, a new renewal month
    record is created.
  */
  const locked = isMonthLocked(campaign, today);
  const lockedLabel = lockedMonthLabel(campaign, today);
  const canAdminRenew = canAdminRenewSmm(user);
  const problem = useMemo(
    () => (locked
      ? historySetupProblem(setupInputOf(value), today)
      : setupProblem(setupInputOf(value), today)),
    [value, today, locked],
  );

  const createRenewal = async () => {
    setRenewing(true);
    try {
      const actor = { uid: user.uid, name: user.name, role: user.role };
      const res = await createRenewalMonth({ previousCampaignId: campaign.id, actor });
      toast({ title: "Next renewal month created", description: "Preserved completed month and started Month N+1." });
      onClose();
      window.location.href = `/smm/${res.newCampaignId}`;
    } catch (err) {
      toast({ title: "Could not create renewal", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setRenewing(false);
    }
  };

  /*
    What the dates check said on the last save (2026-10-15): posts that would fall outside the new dates
    (listed, kept only on "Keep the new dates anyway"), or the client's month these dates overlap. New
    dates are a new question.
  */
  const [datesAsk, setDatesAsk] = useState<MonthDatesVerdict | null>(null);
  useEffect(() => { setDatesAsk(null); }, [value.startDate, value.endDate]);

  const save = async (confirmedOutside?: string[]) => {
    if (problem) { toast({ title: problem, variant: "destructive" }); return; }
    setSaving(true);
    const actor = { uid: user.uid, name: user.name, role: user.role, createdBy: user.createdBy };
    const input = { ...setupInputOf(value), ...(confirmedOutside ? { confirmedOutside } : {}) };
    try {
      if (locked) {
        await applyHistorySetup(campaign.id, input, actor);
        const people = teamMembers(value.team).map((m) => m.name).join(", ");
        toast({ title: "Historical record saved", description: people ? `${people} on it — preserved as historical record.` : cycleRangeLabel(monthCycle(value.startDate, value.endDate)) });
        onSaved?.();
        onClose();
        return;
      }
      const result = await applyMonthSetup(campaign.id, input, actor);
      toast({ title: "Month set up", description: assignSummary(result.assign) || cycleRangeLabel(monthCycle(value.startDate, value.endDate)) });
      onSaved?.();
      onClose();
    } catch (err) {
      // The dates check answers in the dialog, with the posts listed — never a toast that is gone in a second.
      const verdict = monthDatesVerdictOf(err);
      if (verdict) setDatesAsk(verdict);
      else toast({ title: "Not saved", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !saving && !renewing && onClose()}>
      <div data-test="smm-setup-dialog" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-xl sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {locked ? "Manage historical record" : campaign.setupAt ? "Edit setup" : "Set up & assign"} — {campaign.businessName || campaign.clientName}
            </h3>
            <p className="text-xs text-muted-foreground">
              {campaign.packageLabel} · {sellerLineOf(campaign)}{isNoSaleMonth(campaign) ? " · no sale, not in revenue" : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {locked && (
          <div data-test="smm-setup-locked-banner" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">
            {/* An On hold month is not "Completed" (2026-10-15, `lockedMonthLabel`) — it has not been renewed yet. */}
            <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
              <Lock size={14} /> {lockedLabel?.finished === false ? `${lockedLabel.label} (Locked)` : "Completed Month (Locked)"}
            </div>
            <p className="mt-1 text-muted-foreground">
              This month ended on <b>{campaign.cycle?.endDate}</b>{lockedLabel?.label === "Ended — not renewed yet" ? " and has not been renewed yet. It" : " and"} is locked to preserve its complete history, dates, and work. It cannot be edited to represent the next renewal.
            </p>
            {canAdminRenew && !campaign.renewal?.nextCampaignId && (
              <div className="mt-2.5 flex items-center justify-between border-t border-amber-500/20 pt-2">
                <span className="text-[11px] text-muted-foreground">Ready to start the next renewal period?</span>
                <button
                  type="button"
                  onClick={createRenewal}
                  disabled={renewing}
                  data-test="smm-setup-create-renewal"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {renewing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} Create next renewal
                </button>
              </div>
            )}
          </div>
        )}

        {/* The value carries the month's accounts, so the form asks for them ("Accounts it covers"). */}
        <SmmSetupForm value={value} onChange={setValue} members={members} />
        {datesAsk && (
          <div className="mt-3">
            <MonthDatesAsk verdict={datesAsk} busy={saving} onClose={onClose}
              onKeep={() => save(datesAsk.outside.map((p) => p.id))} />
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={saving || renewing}
            className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => save()} disabled={saving || renewing || !!problem} data-test="smm-setup-save"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : problem || (locked ? "Save historical record" : "Save setup")}
          </button>
        </div>
      </div>
    </div>
  );
}
