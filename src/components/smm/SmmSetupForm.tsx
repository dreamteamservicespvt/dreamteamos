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
import { CalendarRange, Clapperboard, Link2, Loader2, Users, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { applyMonthSetup, setupProblem } from "@/services/smmSetup";
import { fetchAssignableMembers } from "@/services/smm";
import { ClipsPerVideoPicker } from "@/components/sales/SmmSaleFields";
import { isoDay } from "@/utils/smmPlan";
import {
  DEFAULT_SMM_CLIPS_PER_VIDEO, SMM_SEATS, addMonthsIso, clipsPerVideoOf, cycleRangeLabel, monthCycle,
  type SmmSeat,
} from "@/utils/smmPackage";
import { daysBetween } from "@/utils/smmPlan";
import { SMM_PLATFORMS, type SmmAssignee, type SmmCampaign, type SmmPlatform, type SmmTeam } from "@/types/smm";
import type { SmmAssignResult } from "@/services/smmAssign";
import type { AppUser } from "@/types";

export interface SmmSetupValue {
  startDate: string;
  endDate: string;
  /** The end was typed, so a new start no longer moves it. */
  endTouched: boolean;
  clipsPerVideo: number;
  pageLinks: Partial<Record<SmmPlatform, string>>;
  team: SmmTeam;
}

const EMPTY_TEAM: SmmTeam = { creator: null, publisher: null, marketer: null, assistants: [] };

/** A month's current setup as the form's starting point — or a fresh one starting on `startDate`. */
export function setupValueOf(campaign: SmmCampaign | null | undefined, startDate?: string): SmmSetupValue {
  const start = startDate || campaign?.cycle?.startDate || isoDay(new Date());
  const cycle = monthCycle(start, startDate ? null : campaign?.cycle?.endDate);
  return {
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    endTouched: !startDate && !!campaign?.cycle && campaign.cycle.endDate !== addMonthsIso(campaign.cycle.startDate, 1),
    clipsPerVideo: campaign ? clipsPerVideoOf(campaign) : DEFAULT_SMM_CLIPS_PER_VIDEO,
    pageLinks: { ...(campaign?.pageLinks || {}) },
    team: campaign?.team ? { ...EMPTY_TEAM, ...campaign.team, assistants: campaign.team.assistants || [] } : { ...EMPTY_TEAM },
  };
}

/** What the services take. */
export function setupInputOf(v: SmmSetupValue) {
  return {
    startDate: v.startDate,
    endDate: v.endDate,
    clipsPerVideo: v.clipsPerVideo,
    pageLinks: v.pageLinks,
    team: v.team,
  };
}

const inputCls = "mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary";

export default function SmmSetupForm({ value, onChange, members, platforms, hasVideos }: {
  value: SmmSetupValue;
  onChange: (next: SmmSetupValue) => void;
  members: { uid: string; name: string }[];
  /** The accounts the month covers — one page-link box each. */
  platforms: SmmPlatform[];
  /** The month owes AI videos, so their length is asked. */
  hasVideos: boolean;
}) {
  const today = isoDay(new Date());
  const cycle = monthCycle(value.startDate, value.endDate);
  const history = cycle.endDate < today;
  const days = daysBetween(cycle.startDate, cycle.endDate) + 1;
  const set = (patch: Partial<SmmSetupValue>) => onChange({ ...value, ...patch });

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

      {/* ── Where ────────────────────────────────────────────────────────────────────────── */}
      {platforms.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Link2 size={13} className="text-primary" /> The client's pages <span className="font-normal text-muted-foreground">(optional)</span>
          </h4>
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
            <p className="text-xs text-muted-foreground">{campaign.packageLabel} · sold by {campaign.soldByName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <SmmSetupForm value={value} onChange={setValue} members={members}
          platforms={campaign.platforms || []} hasVideos={(campaign.commitments?.ai_ad || 0) > 0} />
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
