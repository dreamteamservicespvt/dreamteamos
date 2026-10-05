/**
 * Setting a social-media month up — the tech side's half of the handover (2026-10-03).
 *
 * Four things, in the order they are decided: when the month runs (the end follows the start to the
 * same date next month unless somebody types otherwise), how long each video is, where the client's
 * pages are, and who does the work. A month whose dates are already over is recorded as history, so
 * the team section is replaced by a sentence saying so rather than asking for people nobody needs.
 *
 * The form is controlled; `SmmSetupDialog` below wraps it for a month that already exists, and the
 * "Add SMM sale" dialog uses it as its last step.
 */
import { useEffect, useMemo, useState } from "react";
import { AtSign, CalendarRange, Check, Clapperboard, ListChecks, Loader2, PencilLine, Users, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { applyMonthSetup, setupProblem } from "@/services/smmSetup";
import { fetchAssignableMembers } from "@/services/smm";
import { ClipsPerVideoPicker } from "@/components/sales/SmmSaleFields";
import { isoDay } from "@/utils/smmPlan";
import {
  DEFAULT_SMM_CLIPS_PER_VIDEO, SMM_SEATS, addMonthsIso, cleanPlatforms, clipsPerVideoOf, cycleRangeLabel, isNoSaleMonth,
  monthCycle, sellerLineOf, type SmmSeat,
} from "@/utils/smmPackage";
import { daysBetween } from "@/utils/smmPlan";
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
}

const EMPTY_TEAM: SmmTeam = { creator: null, publisher: null, marketer: null, assistants: [] };
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
  return {
    businessName: businessName ?? campaign?.businessName ?? campaign?.clientName ?? "",
    commitments: { ...NO_COUNTS, ...(commitments ?? campaign?.commitments ?? {}) },
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    endTouched: !startDate && !!campaign?.cycle && campaign.cycle.endDate !== addMonthsIso(campaign.cycle.startDate, 1),
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
  const cycle = monthCycle(value.startDate, value.endDate);
  const history = cycle.endDate < today;
  const days = daysBetween(cycle.startDate, cycle.endDate) + 1;
  const set = (patch: Partial<SmmSetupValue>) => onChange({ ...value, ...patch });
  /** The form chooses the accounts itself (Set up / Edit setup, setting up a sale) — see `SmmSetupValue`. */
  const choosesAccounts = !!value.platforms;
  const platforms = value.platforms ?? givenPlatforms;

  const setStart = (start: string) => set({
    startDate: start,
    endDate: value.endTouched ? value.endDate : addMonthsIso(start, 1),
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
            Ends {!value.endTouched && <span className="font-normal">(same date next month)</span>}
            <input type="date" value={value.endDate} min={value.startDate} data-test="smm-setup-end"
              onChange={(e) => e.target.value && set({ endDate: e.target.value, endTouched: true })} className={inputCls} />
          </label>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground" data-test="smm-setup-range">
          <span><b className="text-foreground">{cycleRangeLabel(cycle)}</b> · {days} days</span>
          {value.endTouched && (
            <button type="button" data-test="smm-setup-end-reset"
              onClick={() => set({ endDate: addMonthsIso(value.startDate, 1), endTouched: false })}
              className="font-medium text-primary underline-offset-2 hover:underline">
              Back to the same date next month
            </button>
          )}
        </p>
        {history && (
          <p data-test="smm-setup-history" className="mt-2 rounded-md border border-info/40 bg-info/10 p-2 text-xs text-foreground">
            These dates are already over, so this month is recorded as <b>history</b>: its package, salesperson
            and dates are kept for the record, nobody is given a job for it and nothing on it can be late.
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
      {!history && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Users size={13} className="text-primary" /> Who does the work
          </h4>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Each person gets one job in My Work for this month, listing what they hold, at the video length above.
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
      )}
    </div>
  );
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
  useEffect(() => { fetchAssignableMembers().then(setMembers); }, []);
  const today = isoDay(new Date());
  // A month already under way cannot be moved wholly into the past from here — a finished month is
  // recorded from "Add SMM sale", where it becomes history.
  const problem = useMemo(
    () => setupProblem(setupInputOf(value), today)
      || (value.endDate < today && campaign.status === "active" ? "The month can't end before today." : ""),
    [value, today, campaign.status],
  );

  const save = async () => {
    if (problem) { toast({ title: problem, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const result = await applyMonthSetup(campaign.id, setupInputOf(value), {
        uid: user.uid, name: user.name, role: user.role, createdBy: user.createdBy,
      });
      toast({ title: "Month set up", description: assignSummary(result.assign) || cycleRangeLabel(monthCycle(value.startDate, value.endDate)) });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({ title: "Not saved", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !saving && onClose()}>
      <div data-test="smm-setup-dialog" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-xl sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {campaign.setupAt ? "Edit setup" : "Set up & assign"} — {campaign.businessName || campaign.clientName}
            </h3>
            <p className="text-xs text-muted-foreground">
              {campaign.packageLabel} · {sellerLineOf(campaign)}{isNoSaleMonth(campaign) ? " · no sale, not in revenue" : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        {/* The value carries the month's accounts, so the form asks for them ("Accounts it covers"). */}
        <SmmSetupForm value={value} onChange={setValue} members={members} />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !!problem} data-test="smm-setup-save"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : problem || "Save setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
