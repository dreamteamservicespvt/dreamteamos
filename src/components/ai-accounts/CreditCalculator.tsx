import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { fieldClass } from "./AiModal";
import { FLOW_CLIP_SECONDS, type FlowSettings } from "@/types/aiAccounts";
import { clipsAffordable } from "@/utils/flowCredits";

/**
 * How many clips a number of credits buys, by clip length — and how many ads, at the ad's own clip
 * count. Starts on the credits the team has left this month, so the first glance answers "how much
 * video can we still make?".
 */
export default function CreditCalculator({ settings, initialCredits }: { settings: FlowSettings; initialCredits: number }) {
  const [credits, setCredits] = useState(initialCredits);
  const [clipsPerAd, setClipsPerAd] = useState(4);
  useEffect(() => setCredits(initialCredits), [initialCredits]);
  const clips = clipsAffordable(credits, settings);

  return (
    <div className="bg-card border border-border rounded-xl p-4" data-test="credit-calculator">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold text-foreground">Credit calculator</h3>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">Credits</span>
          <input className={fieldClass} type="number" min={0} value={credits} onChange={(e) => setCredits(Math.max(0, Number(e.target.value) || 0))} data-test="calc-credits" />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">Clips per ad</span>
          <input className={fieldClass} type="number" min={1} value={clipsPerAd} onChange={(e) => setClipsPerAd(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
        </label>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-1">Clip length</th>
              <th className="text-right font-medium py-1">Credits / clip</th>
              <th className="text-right font-medium py-1">Clips</th>
              <th className="text-right font-medium py-1">Ads of {clipsPerAd}</th>
            </tr>
          </thead>
          <tbody>
            {FLOW_CLIP_SECONDS.map((sec) => (
              <tr key={sec} className="border-t border-border">
                <td className="py-1.5 text-foreground">{sec} seconds</td>
                <td className="py-1.5 text-right tabular-nums">{settings.clipCredits[sec]}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold text-foreground" data-test={`calc-clips-${sec}`}>{clips[sec]}</td>
                <td className="py-1.5 text-right tabular-nums">{Math.floor(clips[sec] / clipsPerAd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
