/**
 * Pausing a running SMM month (owner, 2026-11-05) — the writes. The rules are in `utils/smmPause`.
 *
 * Every write is ONE transaction through `smm.mutateCampaign` (so the view-only lead's guard and the
 * order's derived counters hold): the renewal day (`cycle.endDate`), every unposted piece's date and the
 * pause record change together, from the month as the database holds it at that instant. Then, outside
 * the transaction, the month's deadline on its order and open jobs follows the new last own day (the
 * one helper setup uses, `smmSetup.applyMonthPromise`, which keeps a used extension), and the people on
 * the month and its salesperson are told. A failed deadline or notice never undoes the pause.
 *
 * ── Why a separate file ──────────────────────────────────────────────────────────────────────────
 * `smmSetup` imports `smm`; the deadline helper lives in `smmSetup`. Putting these in `smm` would make
 * the two import each other.
 */
import { sendNotification } from "@/services/notifications";
import { fetchCampaign, mutateCampaign } from "@/services/smm";
import { applyMonthPromise } from "@/services/smmSetup";
import { useAuthStore } from "@/store/authStore";
import { isoDay, smmWatchers } from "@/utils/smmPlan";
import {
  cancelPausePatch, pauseDayLabel, pausePatch, pauseReasonLine, pauseSentence, restartPatch,
  type PauseActor, type PauseInput, type PausePatch,
} from "@/utils/smmPause";
import type { SmmCampaign } from "@/types/smm";

/** The signed-in person when there is one (the rule reads `request.auth`, so do we); else the caller's. */
function whoActs(actor: PauseActor): PauseActor {
  const u = useAuthStore.getState().user as { uid?: string; name?: string; role?: string } | null;
  return u?.uid ? { uid: u.uid, name: u.name || actor.name, role: u.role ?? null } : actor;
}

async function applyPatch(id: string, build: (c: SmmCampaign) => PausePatch): Promise<SmmCampaign> {
  const next = await mutateCampaign(id, (c) => build(c));
  if (!next) throw new Error("This month could not be changed.");
  await applyMonthPromise(next).catch((err) => console.warn("[smm pause] deadline not moved:", err));
  return next;
}

async function tellTeam(c: SmmCampaign, actor: PauseActor, kind: "smm_paused" | "smm_resumed", title: string, message: string, stamp: number) {
  const people = smmWatchers(c.team || ({} as SmmCampaign["team"]), c.soldBy).filter((uid) => uid !== actor.uid);
  for (const uid of people) {
    await sendNotification({
      userId: uid, type: kind, title, message, link: `/smm/${c.id}`,
      dedupeKey: `${kind}_${c.id}_${stamp}_${uid}`,
    }).catch(() => undefined);
  }
}

const nameOf = (c: SmmCampaign) => c.businessName || c.clientName || "A client";

/** Pause the month from `from` to the day before `until` (the restart day). */
export async function pauseMonth(
  campaignId: string,
  input: PauseInput & { proofUrl?: string | null },
  actorIn: PauseActor,
): Promise<SmmCampaign> {
  const actor = whoActs(actorIn);
  const at = Date.now();
  const today = isoDay(new Date());
  const next = await applyPatch(campaignId, (c) => pausePatch(c, input, actor, today, at));
  await tellTeam(
    next, actor, "smm_paused", "Social media month paused",
    `${nameOf(next)}: ${pauseSentence(next, today)}. Why: ${pauseReasonLine(next.pause!)}. Paused by ${actor.name}.`,
    at,
  );
  return next;
}

/** Restart on `until` instead — today = resume now, later = extend. */
export async function changePauseRestart(campaignId: string, until: string, actorIn: PauseActor): Promise<SmmCampaign> {
  const actor = whoActs(actorIn);
  const today = isoDay(new Date());
  const next = await applyPatch(campaignId, (c) => restartPatch(c, until, actor, today));
  const now = until <= today;
  await tellTeam(
    next, actor, now ? "smm_resumed" : "smm_paused",
    now ? "Social media month restarted" : "Social media pause changed",
    now
      ? `${nameOf(next)} is back on from today — ${actor.name} restarted it. Renewal ${pauseDayLabel(next.cycle.endDate)}.`
      : `${nameOf(next)}: ${pauseSentence(next, today)} (changed by ${actor.name}).`,
    Date.now(),
  );
  return next;
}

/** Take back a pause that has not started (or starts today) — as if it never was. */
export async function cancelUpcomingPause(campaignId: string, actorIn: PauseActor): Promise<SmmCampaign> {
  const actor = whoActs(actorIn);
  const today = isoDay(new Date());
  const next = await applyPatch(campaignId, (c) => cancelPausePatch(c, actor, today));
  await tellTeam(
    next, actor, "smm_resumed", "Social media pause cancelled",
    `${nameOf(next)} will not be paused after all (${actor.name}). Renewal ${pauseDayLabel(next.cycle.endDate)}.`,
    Date.now(),
  );
  return next;
}

/** For a screen that wants the month as the database holds it before opening the dialog. */
export const fetchMonthForPause = fetchCampaign;
