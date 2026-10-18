import { useEffect, useState, useRef } from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  color?: string;
  /** A short line under the figure that says what it counts, or what it leaves out ("Awaiting approval: ₹X"). */
  note?: string;
}

/**
 * Counts the shown figure up (or down) to `target` — and again whenever `target` changes.
 *
 * ── Why it re-runs (2026-10-18) ──
 * It animated ONCE, guarded by a ref, with a frame loop that closed over the FIRST target. A dashboard renders
 * before its Firestore listeners answer, so that first target was 0 and the card stayed at 0 for good: the main
 * admin's four cards read "₹0 / 0 / 0 / 0" with 10 people, 4 sales and 4 videos in the data (whole-app audit,
 * D-01). Now each new target animates from the figure on screen, the previous loop is cancelled, and a reduced-
 * motion setting (or no animation frames at all) shows the figure at once.
 */
function useAnimatedCounter(target: number, duration = 1000) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [count, setCount] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    const from = shown.current;
    if (from === safeTarget) return;
    const reduced = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof requestAnimationFrame !== "function") {
      shown.current = safeTarget;
      setCount(safeTarget);
      return;
    }
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const progress = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress >= 1 ? safeTarget : Math.round(from + (safeTarget - from) * eased);
      shown.current = next;
      setCount(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget, duration]);

  return count;
}

export default function StatCard({ title, value, prefix = "", suffix = "", icon: Icon, trend, color, note }: StatCardProps) {
  const animatedValue = useAnimatedCounter(value);

  const formattedValue = prefix === "₹"
    ? new Intl.NumberFormat("en-IN").format(animatedValue)
    : animatedValue.toLocaleString();

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5 hover:shadow-[0_0_20px_hsl(var(--primary)/0.08)] transition-all duration-300 group">
      <div className="flex items-center md:items-start justify-between mb-2 md:mb-4">
        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center ${color || "bg-primary/10 text-primary"}`}>
          <Icon size={16} className="md:hidden" />
          <Icon size={20} className="hidden md:block" />
        </div>
        {trend && (
          <span className={`text-[10px] md:text-xs font-mono font-medium px-1.5 md:px-2 py-0.5 md:py-1 rounded-full ${
            trend.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          }`}>
            {trend.positive ? "+" : ""}{trend.value}%
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs md:text-sm font-medium mb-0.5 md:mb-1 truncate">{title}</p>
      <p className="font-display text-xl md:text-3xl font-bold text-foreground tracking-tight" data-test="stat-value">
        {prefix}{formattedValue}{suffix}
      </p>
      {note && <p className="text-[10px] md:text-xs text-muted-foreground mt-1 truncate" title={note} data-test="stat-note">{note}</p>}
    </div>
  );
}
