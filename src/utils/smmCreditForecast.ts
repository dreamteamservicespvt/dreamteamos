/**
 * SMM Delivery Control — the Flow-credit forecast (2026-10-15, phase 7 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why ─────────────────────────────────────────────────────────────────────────────────────────
 * A video is made in Google Flow from the maker's Flow accounts (1000 credits a month each, 12 credits an 8-second
 * clip — `utils/flowCredits`). "Out of Flow credits" is one of the Blocked reasons; this says it BEFORE it happens:
 * for each maker, what the AI videos still to be made this week and next will cost, against the credits left this
 * cycle in the Flow accounts they hold. Posters and real videos are not made in Flow and cost nothing here.
 *
 * Pure: the rows come from the weekly plan (`utils/smmDeliveryView`), the accounts and the rates from AI Accounts.
 */
import { accountState, creditsFor, defaultRowsFor, DEFAULT_FLOW_SETTINGS } from "./flowCredits";
import { clipsOf } from "./smmCadence";
import type { FlowAccount, FlowSettings } from "../types/aiAccounts";
import type { SmmTaskRow } from "./smmDeliveryView";

export interface SmmCreditForecast {
  uid: string;
  /** AI videos still to be made (not yet sent) whose week is this week / next week, and what they cost. */
  videosThisWeek: number;
  creditsThisWeek: number;
  videosNextWeek: number;
  creditsNextWeek: number;
  /** Credits left this cycle across the usable Flow accounts they hold. */
  remaining: number;
  accounts: number;
  /** remaining − this week's need (negative = short). */
  marginThisWeek: number;
  /** "short" when this week alone does not fit; "tight" when this week and next do not. */
  state: "ok" | "tight" | "short" | "no_accounts";
}

/** What one AI video costs in Flow: its clips (the month's length, or an extra video's own) at the 8-second rate. */
export function videoCredits(row: Pick<SmmTaskRow, "item" | "month">, settings: FlowSettings = DEFAULT_FLOW_SETTINGS): number {
  const monthClips = Math.max(1, Math.min(15, Math.floor(Number(row.month.clipsPerVideo) || 4)));
  return creditsFor(defaultRowsFor(clipsOf(row.item, monthClips)), settings);
}

const isVideoToMake = (r: SmmTaskRow) =>
  !r.progress.live && (r.progress.step === "make") && (r.task.type === "ai_video" || (r.task.type === "extra" && r.item.kind === "ai_ad"));

/**
 * Each maker's forecast. `weekOf(row)` says whether a row's week is "this" or "next" week for its month (or
 * neither); late rows count as this week.
 */
export function creditForecast(args: {
  rows: readonly SmmTaskRow[];
  accounts: readonly FlowAccount[];
  today: string;
  settings?: FlowSettings;
  uids?: readonly string[];
}): Map<string, SmmCreditForecast> {
  const settings = args.settings || DEFAULT_FLOW_SETTINGS;
  const out = new Map<string, SmmCreditForecast>();
  const get = (uid: string): SmmCreditForecast => {
    let f = out.get(uid);
    if (!f) {
      const held = args.accounts.filter((a) => a.holderId === uid).map((a) => accountState(a, args.today)).filter((s) => s.usable);
      f = {
        uid, videosThisWeek: 0, creditsThisWeek: 0, videosNextWeek: 0, creditsNextWeek: 0,
        remaining: held.reduce((s, a) => s + a.remaining, 0), accounts: held.length, marginThisWeek: 0, state: "ok",
      };
      out.set(uid, f);
    }
    return f;
  };
  for (const uid of args.uids || []) get(uid);
  for (const r of args.rows) {
    if (!isVideoToMake(r) || !r.task.makerUid) continue;
    const w = r.task.week ? r.plan.weeks[r.task.week - 1] : null;
    const next = r.plan.weeks.find((x) => x.start > args.today);
    const thisWeek = r.mark === "late" || (!!w && args.today >= w.start && args.today <= w.end);
    const nextWeek = !thisWeek && !!w && !!next && w.week === next.week;
    if (!thisWeek && !nextWeek) continue;
    const f = get(r.task.makerUid);
    const c = videoCredits(r, settings);
    if (thisWeek) {
      f.videosThisWeek += 1;
      f.creditsThisWeek += c;
    } else {
      f.videosNextWeek += 1;
      f.creditsNextWeek += c;
    }
  }
  for (const f of out.values()) {
    f.marginThisWeek = f.remaining - f.creditsThisWeek;
    f.state = !f.accounts && (f.creditsThisWeek || f.creditsNextWeek) ? "no_accounts"
      : f.marginThisWeek < 0 ? "short"
        : f.remaining < f.creditsThisWeek + f.creditsNextWeek ? "tight" : "ok";
  }
  return out;
}

/** "3 videos this week need ~144 Flow credits — 420 left in 2 accounts." */
export function forecastWords(f: SmmCreditForecast): string {
  if (!f.videosThisWeek && !f.videosNextWeek) return "No AI videos to make this week or next.";
  const need = `${f.videosThisWeek} video${f.videosThisWeek === 1 ? "" : "s"} this week need ~${f.creditsThisWeek} Flow credits`
    + (f.videosNextWeek ? ` (+${f.creditsNextWeek} next week)` : "");
  if (f.state === "no_accounts") return `${need} — but no usable Flow account is held. Add or take one in AI Accounts.`;
  const left = `${f.remaining} left in ${f.accounts} account${f.accounts === 1 ? "" : "s"}`;
  if (f.state === "short") return `${need} — only ${left}. ${-f.marginThisWeek} short: get another account before you start.`;
  if (f.state === "tight") return `${need} — ${left}; next week will not fit without another account.`;
  return `${need} — ${left}.`;
}
