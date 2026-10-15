/**
 * The Flow-credit forecast on Delivery Control (2026-10-15, phase 7): a member's own line on Today, and a line per
 * person on the Team tab — what this week's (and next week's) AI videos will cost against the credits left in the
 * Flow accounts each maker holds (`utils/smmCreditForecast`). Reads the Flow accounts only while it is on screen
 * (`useFlowAccounts`: a member's own, a manager's team's) and the credit rates (`useFlowSettings`).
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useFlowAccounts, useFlowSettings } from "@/hooks/useAiAccounts";
import { creditForecast, forecastWords, type SmmCreditForecast } from "@/utils/smmCreditForecast";
import { useControl } from "./context";

const TONE: Record<SmmCreditForecast["state"], string> = {
  ok: "border-border bg-muted/40 text-muted-foreground",
  tight: "border-viz-wait/50 bg-viz-wait/10 text-amber-800 dark:text-viz-wait",
  short: "border-viz-late/40 bg-viz-late/10 text-viz-late",
  no_accounts: "border-viz-late/40 bg-viz-late/10 text-viz-late",
};

export function useCreditForecasts(uids: string[]): Map<string, SmmCreditForecast> {
  const { board, user } = useControl();
  const { accounts } = useFlowAccounts(user);
  const settings = useFlowSettings();
  return useMemo(() => creditForecast({ rows: board.rows, accounts, today: board.today, settings, uids }), [board.rows, board.today, accounts, settings, uids]);
}

export function CreditLine({ forecast, compact = false }: { forecast: SmmCreditForecast | undefined; compact?: boolean }) {
  if (!forecast || (!forecast.videosThisWeek && !forecast.videosNextWeek)) return null;
  return (
    <p data-test="smm-credit-forecast" data-state={forecast.state}
      className={cn("rounded-lg border px-3 py-2", compact ? "text-xs" : "text-sm", TONE[forecast.state])}>
      🎬 Flow credits: {forecastWords(forecast)}
    </p>
  );
}

/** A member's own forecast (Today). */
export default function MyCreditForecast() {
  const { user } = useControl();
  const uids = useMemo(() => [user.uid], [user.uid]);
  const map = useCreditForecasts(uids);
  return <CreditLine forecast={map.get(user.uid)} />;
}
