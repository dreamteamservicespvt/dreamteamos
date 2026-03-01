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
}

function useAnimatedCounter(target: number, duration = 1000) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return count;
}

export default function StatCard({ title, value, prefix = "", suffix = "", icon: Icon, trend, color }: StatCardProps) {
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
      <p className="font-display text-xl md:text-3xl font-bold text-foreground tracking-tight">
        {prefix}{formattedValue}{suffix}
      </p>
    </div>
  );
}
