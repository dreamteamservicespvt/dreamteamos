/**
 * The live half of the SMM alert host (see `SmmAlertHost` for what it does and the rules it keeps) — loaded only
 * for a person Delivery Control covers (Live, in the pilot group when there is one).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { tryOpenPopup, usePopupStore } from "@/store/popupStore";
import { fetchServerNow } from "@/services/smmDelivery";
import { buildControlBoard, controlViewOf, timeWords, type SmmTaskRow } from "@/utils/smmDeliveryView";
import { claimHolds } from "@/utils/popupCoordinator";
import { screenFor, screenProblem } from "@/utils/smmMonitor";
import { useDeliveryData } from "../control/useDeliveryData";
import AlertScreen from "./AlertScreen";
import type { AppUser } from "@/types";

const SOUND_CHANNEL = "dts_smm_alert_sound";

/** A short two-tone alarm through WebAudio (no file to load); silently nothing when the browser blocks sound. */
function playAlarm(critical: boolean): void {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const beeps = critical ? 4 : 2;
    for (let i = 0; i < beeps; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = i % 2 ? 660 : 880;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35);
      o.stop(ctx.currentTime + i * 0.35 + 0.25);
    }
    setTimeout(() => ctx.close().catch(() => undefined), beeps * 400 + 200);
  } catch {
    /* sound blocked until the first tap — the screen still shows */
  }
  try {
    const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (active !== false) navigator.vibrate?.(critical ? [400, 150, 400, 150, 400] : [300, 120, 300]);
  } catch { /* no vibration */ }
}

/** One tab per device sounds a new alert: the first to announce the key on the channel plays it. */
function useOneTabSound() {
  const heard = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SOUND_CHANNEL);
    ch.onmessage = (e) => { if (typeof e.data === "string") heard.current.add(e.data); };
    channel.current = ch;
    return () => ch.close();
  }, []);
  return (key: string, critical: boolean) => {
    if (heard.current.has(key)) return;
    // A random pause so two tabs that saw it together do not both play; the first to announce wins.
    setTimeout(() => {
      if (heard.current.has(key)) return;
      heard.current.add(key);
      channel.current?.postMessage(key);
      playAlarm(critical);
    }, Math.floor(Math.random() * 250));
  };
}

/** The tab's title blinks while a full screen or the bar is waiting for an answer. */
function useBlinkingTitle(on: boolean, text: string) {
  useEffect(() => {
    if (!on || typeof document === "undefined") return;
    const original = document.title;
    let flip = false;
    const t = setInterval(() => {
      flip = !flip;
      document.title = flip ? `⚠ ${text}` : original;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = original;
    };
  }, [on, text]);
}

export default function LiveAlertHost({ user }: { user: AppUser }) {
  const view = controlViewOf(user);
  const overseer = view === "admin" || view === "team_leader" || view === "lead" || view === "sales_admin";
  const data = useDeliveryData(user, { withPeople: overseer, withPresence: true });
  const location = useLocation();
  const navigate = useNavigate();
  const claims = usePopupStore((s) => s.claims);
  const sound = useOneTabSound();
  const [serverOffset, setServerOffset] = useState<number | null>(null);
  const [checkedClock, setCheckedClock] = useState(false);

  // The device clock against the server's, every 30 minutes.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const server = await fetchServerNow();
      if (!alive) return;
      setServerOffset(server == null ? null : server - Date.now());
      setCheckedClock(true);
    };
    void check();
    const t = setInterval(check, 30 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const board = useMemo(() => {
    if (!data.monthsLoaded || !data.settingsLoaded) return null;
    try {
      return buildControlBoard({
        months: data.months, settings: data.settings, holidays: data.holidays, now: data.now,
        viewer: { uid: user.uid, name: user.name, role: user.role, smmLeader: !!user.smmLeader },
        people: data.people, answers: data.answers, liveSince: data.liveSince,
      });
    } catch {
      return null;
    }
  }, [data.months, data.monthsLoaded, data.settings, data.settingsLoaded, data.holidays, data.now, data.people, data.answers, data.liveSince, user.uid, user.name, user.role, user.smmLeader]);

  const screen = useMemo(() => (board ? screenFor(user.uid, board.monitor.alerts, user.role) : { alerts: [], level: null, combined: false }), [board, user.uid, user.role]);
  const rows = useMemo(() => {
    const m = new Map<string, SmmTaskRow>();
    for (const r of board?.rows || []) m.set(`${r.month.id}:${r.task.itemId}`, r);
    return m;
  }, [board]);

  // Fresh data and a sane clock, or no full screen.
  const problem = checkedClock
    ? screenProblem({ deviceNow: data.now, serverNow: serverOffset == null ? null : data.now + serverOffset, syncedAt: data.meta.serverAt, freshMinutes: data.settings.ladder.freshMinutes })
    : "stale";
  const holding = claims.filter((c) => claimHolds(c, Date.now()));
  const inStudio = holding.some((c) => c.kind === "studio");
  const onControlPage = location.pathname.startsWith("/smm/control");
  /**
   * "Open it" on the full screen takes the person to the piece on Delivery Control and gives them TEN MINUTES there
   * as the bar (the full screen would otherwise cover the page they went to act on). It is not an answer: unless the
   * piece is answered or done, the full screen comes back — on any page, Delivery Control included (the browser
   * check, 2026-10-15: hiding it on Delivery Control meant a person who works there never saw it).
   */
  const [openedUntil, setOpenedUntil] = useState(0);
  const opened = openedUntil > data.now || openedUntil > Date.now();
  const alerts = screen.alerts;
  const critical = alerts.some((a) => a.critical);

  // New alert keys: sound once per device.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const a of alerts) {
      if (seen.current.has(a.key)) continue;
      seen.current.add(a.key);
      if (!problem) sound(a.key, a.critical);
    }
  }, [alerts, problem, sound]);

  // The full screen: claimed through the coordinator, held while alerts remain.
  const releaseRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const wantFull = alerts.length > 0 && !problem && !inStudio && !opened;
  useEffect(() => {
    if (!wantFull) {
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
      setOpen(false);
      return;
    }
    if (releaseRef.current) return;
    const tryNow = () => {
      if (releaseRef.current) return;
      const release = tryOpenPopup("smm_alert", { urgent: critical });
      if (release) {
        releaseRef.current = release;
        setOpen(true);
      }
    };
    tryNow();
    const t = setInterval(tryNow, 20_000);
    return () => clearInterval(t);
  }, [wantFull, critical]);
  useEffect(() => () => { releaseRef.current?.(); }, []);

  const barText = alerts.length ? `${alerts.length} urgent social media alert${alerts.length === 1 ? "" : "s"}` : "";
  useBlinkingTitle(alerts.length > 0 && !problem, barText);

  if (!alerts.length) return null;
  const phoneOf = (uid: string | null | undefined) => (uid ? data.users.get(uid)?.phone || null : null);

  if (open && wantFull) {
    return (
      <AlertScreen alerts={alerts} combined={screen.combined} user={user} rows={rows} phoneOf={phoneOf} settings={data.settings} holidays={data.holidays}
        onOpen={() => setOpenedUntil(Date.now() + 10 * 60_000)} />
    );
  }

  // The bar: in the studio (its strip), for the ten minutes after "Open it", while something else holds the screen, or on
  // stale data. It sits in the app shell's slot under the Topbar (AppLayout), in the flow — never over the menu or the bell.
  const why = problem === "stale"
    ? `Showing ${data.meta.serverAt ? timeWords(data.meta.serverAt) : "old"} data — alerts paused until it syncs`
    : problem === "clock" ? "This device's clock is wrong — fix it to see alerts"
      : inStudio ? "They show when you leave the studio"
        : opened ? "Answer it here — it comes back full screen in a few minutes" : "";
  const slot = typeof document !== "undefined" ? document.getElementById("smm-alert-bar-slot") : null;
  const bar = (
    <div role="status" data-test={inStudio ? "smm-alert-studio-strip" : "smm-alert-bar"}
      className={`${slot ? "" : "fixed inset-x-0 top-0 z-[60] "}flex min-h-[40px] items-center gap-2 bg-red-700 px-3 py-1.5 text-xs font-medium text-white sm:text-sm`}>
      <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
      <span className="line-clamp-2 min-w-0 flex-1 sm:line-clamp-1">{alerts[0].title}{alerts.length > 1 ? ` +${alerts.length - 1} more` : ""}{why ? ` · ${why}` : ""}</span>
      {!onControlPage && !inStudio && (
        <button type="button" className="min-h-[32px] shrink-0 rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={() => navigate("/smm/control")}>Open</button>
      )}
    </div>
  );
  return slot ? createPortal(bar, slot) : bar;
}
