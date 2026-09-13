/**
 * The countdown for one run, shared by every place that shows it.
 *
 * The same number appears in the workspace, in the Generation Status card once the workspace has
 * gone, and in the reopened AI Guide. Three independent clocks would drift apart by a second or two
 * — visibly, side by side — so there is one DisplayClock per run, kept here, and each on-screen
 * countdown only reads it. Ticking a shared clock from several subscribers is safe: it advances by
 * wall-clock time since its last tick, not by a fixed step per call.
 *
 * The tick lives in the leaf that renders the digits, and it only sets state when the formatted text
 * actually changes, so the rest of the generator screen never re-renders on a timer.
 */
import { useEffect, useRef, useState } from "react";
import {
  DisplayClock, calibrationFactors, estimateRemainingMs, formatClock, loadRunHistory, planFor, plannedTotalMs,
  type Segment,
} from "@/utils/generationEta";
import type { GenerationRun } from "./run";

interface SharedClock {
  clock: DisplayClock;
  plan: Segment[];
  factors: Record<string, number>;
  /** True when this browser has finished no runs of this kind, so the estimate is uncalibrated. */
  calibrating: boolean;
}

/** Only the current run is ever shown; older entries are dropped so the map cannot grow. */
const clocks = new Map<number, SharedClock>();

function clockFor(run: GenerationRun): SharedClock {
  let entry = clocks.get(run.id);
  if (!entry) {
    const plan = planFor(run.profile);
    const factors = calibrationFactors(loadRunHistory(), run.profile.mode);
    entry = {
      plan,
      factors,
      clock: new DisplayClock(plannedTotalMs(plan, factors), run.id),
      calibrating: Object.keys(factors).length === 0,
    };
    clocks.clear();
    clocks.set(run.id, entry);
  }
  return entry;
}

export interface RunClockView {
  /** "1:23", or "0:00" once the estimate is spent. */
  label: string;
  /** Time past the estimate, "0:07", or "" while still within it. */
  overLabel: string;
  /** The run has reported 100 and is writing its last results. */
  finishing: boolean;
  calibrating: boolean;
}

const TICK_MS = 250;

export function useRunClock(run: GenerationRun | null, active: boolean): RunClockView | null {
  const runRef = useRef(run);
  runRef.current = run;
  const [view, setView] = useState<RunClockView | null>(null);

  useEffect(() => {
    if (!run || !active) {
      setView(null);
      return;
    }
    const tick = () => {
      const current = runRef.current;
      if (!current) return;
      const shared = clockFor(current);
      const now = Date.now();
      const last = current.checkpoints[current.checkpoints.length - 1];
      const finishing = (last?.percent ?? 0) >= 100;
      const target = estimateRemainingMs(shared.plan, current.checkpoints, now, shared.factors);
      const { remainingMs, overrunMs } = shared.clock.tick(target, now);
      const next: RunClockView = {
        label: formatClock(finishing ? 0 : remainingMs),
        overLabel: !finishing && remainingMs === 0 && overrunMs >= 1000 ? formatClock(overrunMs, "down") : "",
        finishing,
        calibrating: shared.calibrating,
      };
      setView((prev) => (
        prev
          && prev.label === next.label
          && prev.overLabel === next.overLabel
          && prev.finishing === next.finishing
          && prev.calibrating === next.calibrating
          ? prev
          : next
      ));
    };
    tick();
    const handle = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(handle);
    // The run's identity decides the clock; its checkpoints are read through the ref on each tick.
  }, [run?.id, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return view;
}
