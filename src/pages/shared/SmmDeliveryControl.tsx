/**
 * SMM Delivery Control — the NEW Social Media screen (2026-10-15, phase 2 of the plan in
 * `.claude/rules/smm.md` §9.9). Routes `/smm/control` and `/smm/control/:monthId`, the same six roles as `/smm`.
 *
 * ── Why a separate page ─────────────────────────────────────────────────────────────────────────
 * The owner: "Keep the classic Social Media UI exactly as it is. A button opens the new UI." The classic board
 * shows the month; this page divides each client's month into WEEKLY tasks with a deadline at each week's end and
 * shows who has to do what next — and, Live, takes the answers the alerts ask for. The last UI a person used is
 * remembered per browser (`dts_smm_ui`, owner's decision 16): Classic stays the default for anyone who never
 * pressed the button, and "← Classic view" sets it back.
 *
 * ── The frame ───────────────────────────────────────────────────────────────────────────────────
 * A status line (Preview / Live / Off, "supervisor checked n min ago", red for the admins when it stopped), the
 * count tiles that filter Today (per role), the tabs per role (`utils/smmDeliveryView.tabsFor`) and everybody
 * lands on Today. Offline: "Showing 10:42 data — alerts paused". A part that fails says so; the classic view
 * still works. Every rule it shows is `utils/smmCadence` / `utils/smmMonitor` / `utils/smmDeliveryView`.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { cn } from "@/lib/utils";
import { toMs } from "@/utils/smmCadence";
import {
  buildControlBoard, canOpenControl, controlViewOf, isControlManager, SMM_TAB_LABELS, tabsFor, tilesFor, timeWords,
  type SmmControlTab, type SmmTaskRow,
} from "@/utils/smmDeliveryView";
import { useDeliveryData } from "@/components/smm/control/useDeliveryData";
import { ControlContext, type SmmControlCtx, type SmmPieceAction } from "@/components/smm/control/context";
import { PartError, Tiles, TAP } from "@/components/smm/control/kit";
import TodayTab from "@/components/smm/control/TodayTab";
import { rememberSmmUi } from "@/components/smm/control/smmUi";
import type { AppUser } from "@/types";

const WeeksTab = lazy(() => import("@/components/smm/control/WeeksTab"));
const PlanTab = lazy(() => import("@/components/smm/control/PlanTab"));
const TeamTab = lazy(() => import("@/components/smm/control/TeamTab"));
const SettingsTab = lazy(() => import("@/components/smm/control/SettingsTab"));
const StartingLineTab = lazy(() => import("@/components/smm/control/StartLogTabs").then((m) => ({ default: m.StartingLineTab })));
const AlertsLogTab = lazy(() => import("@/components/smm/control/StartLogTabs").then((m) => ({ default: m.AlertsLogTab })));
const PieceSheet = lazy(() => import("@/components/smm/control/PieceSheet"));


const MODE_LINE: Record<string, { label: string; tone: string; text: string }> = {
  preview: { label: "Preview", tone: "border-viz-ready/40 bg-viz-ready/10 text-viz-ready", text: "Nothing is saved and nobody is alerted — this shows what would happen." },
  live: { label: "Live", tone: "border-viz-done/40 bg-viz-done/10 text-viz-done", text: "Plans are saved and the alerts run." },
  off: { label: "Off", tone: "border-border bg-muted text-muted-foreground", text: "Delivery Control is off — the classic Social Media works as before." },
};

export default function SmmDeliveryControl() {
  const user = useAuthStore((s) => s.user) as AppUser | null;
  const view = controlViewOf(user);
  const manager = isControlManager(view);
  const lead = view === "lead";
  const data = useDeliveryData(user, { withPeople: manager || lead || view === "sales_admin", withPresence: manager || lead });
  const { monthId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [tile, setTile] = useState<string | null>(null);
  const [piece, setPiece] = useState<{ row: SmmTaskRow; action: SmmPieceAction } | null>(null);

  useEffect(() => { rememberSmmUi("control"); }, []);

  const tabs = view ? tabsFor(view) : [];
  const asked = (monthId ? "plan" : params.get("tab")) as SmmControlTab | null;
  const tab: SmmControlTab = asked && tabs.includes(asked) ? asked : "today";
  const setTab = (t: SmmControlTab) => {
    if (t === "plan" && monthId) return;
    if (monthId) navigate(`/smm/control?tab=${t}`);
    else setParams(t === "today" ? {} : { tab: t }, { replace: true });
  };

  const live = data.settings.mode === "live";
  const board = useMemo(() => {
    if (!user || !view) return null;
    try {
      return buildControlBoard({
        months: data.months, settings: data.settings, holidays: data.holidays, now: data.now,
        viewer: { uid: user.uid, name: user.name, role: user.role, smmLeader: !!user.smmLeader },
        people: data.people.length ? data.people : undefined, answers: data.answers, liveSince: data.liveSince,
      });
    } catch (e) {
      console.error("[smm control] board:", e);
      return null;
    }
  }, [user, view, data.months, data.settings, data.holidays, data.now, data.people, data.answers, data.liveSince]);

  const openPiece = useCallback((row: SmmTaskRow, action: SmmPieceAction = "details") => setPiece({ row, action }), []);
  const openMonth = useCallback((id: string) => navigate(`/smm/control/${id}`), [navigate]);
  // Keep an open sheet on the live copy of its piece (a write elsewhere updates it).
  const liveRow = piece && board ? board.rows.find((r) => r.key === piece.row.key) || piece.row : piece?.row || null;

  if (!user) return null;
  if (!view || (data.settingsLoaded && !canOpenControl(user, data.settings.mode))) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-10 text-center" data-test="smm-control-closed">
        <p className="text-sm text-muted-foreground">Delivery Control is not open to you yet{data.settings.mode === "preview" ? " — it is in Preview for the admins, the team leaders and the Social Media Team Lead" : data.settings.mode === "off" ? " — it is switched off" : ""}.</p>
        <Link to="/smm" onClick={() => rememberSmmUi("classic")} className="text-sm font-medium text-primary hover:underline">← Back to Social Media</Link>
      </div>
    );
  }

  const tiles = board ? tilesFor(board) : [];
  const mode = MODE_LINE[data.settings.mode] || MODE_LINE.preview;
  const lastRun = toMs(data.settings.lastRunAt);
  const lastRunAge = lastRun ? Math.round((data.now - lastRun) / 60_000) : null;
  const supervisorDown = live && (lastRunAge == null || lastRunAge > 45);
  const offline = data.monthsLoaded && data.meta.fromCache && typeof navigator !== "undefined" && navigator.onLine === false;
  const ctx: SmmControlCtx | null = board ? { data, board, user, view, live, manager, openPiece, openMonth } : null;

  return (
    <div className="space-y-4 pb-10" data-test="smm-control">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link to="/smm" onClick={() => rememberSmmUi("classic")} data-test="smm-control-classic"
              className={cn("inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-sm text-muted-foreground hover:bg-muted", TAP)}>
              <ArrowLeft className="h-4 w-4" /> Classic view
            </Link>
            <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold text-foreground sm:text-2xl">
              <Sparkles className="h-5 w-5 shrink-0 text-primary" /> Delivery Control
            </h1>
          </div>
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", mode.tone)} data-test="smm-control-mode">{mode.label}</span>
        </div>
        <p className="text-sm text-muted-foreground" data-test="smm-control-status">
          {mode.text}
          {data.settings.mode !== "off" && (
            <span className={cn(" ", supervisorDown && manager ? "font-medium text-viz-late" : "")}>
              {" "}{lastRun ? `Supervisor checked ${lastRunAge! < 1 ? "just now" : `${lastRunAge} min ago`}.` : live ? "The server supervisor is not running yet — alerts reach people only while the app is open." : ""}
            </span>
          )}
        </p>
        {offline && <p className="rounded-xl border border-viz-wait/50 bg-viz-wait/10 px-3 py-2 text-sm" role="status">Showing {data.meta.serverAt ? timeWords(data.meta.serverAt) : "saved"} data — alerts paused until you are back online.</p>}
        {data.settings.mode === "preview" && manager && (
          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" data-test="smm-control-preview-banner">
            Preview: the Alerts log shows who WOULD get which alert. Switch months on from Client plan; go Live in Settings.
          </p>
        )}
      </header>

      {!data.monthsLoaded || !board || !ctx ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the months…</div>
      ) : (
        <ControlContext.Provider value={ctx}>
          <Tiles tiles={tiles} active={tile} onPick={(k) => { setTile(k); if (k) setTab("today"); }} />

          <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Delivery Control">
            <div role="tablist" className="flex w-max gap-1 rounded-xl bg-muted p-1 sm:w-auto">
              {tabs.map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} data-test={`smm-control-tab-${t}`}
                  onClick={() => setTab(t)}
                  className={cn("whitespace-nowrap rounded-lg px-3 text-sm font-medium", TAP, tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {SMM_TAB_LABELS[t]}
                  {t === "start" && board.monitor.startingLine.length ? ` · ${board.monitor.startingLine.length}` : ""}
                </button>
              ))}
            </div>
          </nav>

          <ErrorBoundary fallback={<PartError what="This part" />}>
            <Suspense fallback={<div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}>
              {tab === "today" && <TodayTab tile={tile} tiles={tiles} />}
              {tab === "weeks" && <WeeksTab />}
              {tab === "plan" && <PlanTab monthId={monthId || null} onPickMonth={openMonth} />}
              {tab === "team" && <TeamTab />}
              {tab === "start" && <StartingLineTab />}
              {tab === "log" && <AlertsLogTab />}
              {tab === "settings" && <SettingsTab />}
            </Suspense>
          </ErrorBoundary>

          <Suspense fallback={null}>
            {piece && <PieceSheet row={liveRow} action={piece.action} onClose={() => setPiece(null)} />}
          </Suspense>
        </ControlContext.Provider>
      )}
    </div>
  );
}
