import { List, LayoutGrid } from "lucide-react";
import type { ViewMode } from "@/hooks/useViewMode";

/**
 * The list ↔ grid switch used on list pages. Two segmented buttons; list is the default view.
 * Kept tiny and self-contained so any page can drop it next to its heading or filters.
 */
export default function ViewToggle({ mode, onChange, className = "" }: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex shrink-0 rounded-xl border border-border bg-card p-0.5 ${className}`} role="group" aria-label="View">
      {([
        { key: "list" as const, label: "List", Icon: List },
        { key: "grid" as const, label: "Grid", Icon: LayoutGrid },
      ]).map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={mode === key}
          title={`${label} view`}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
            mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
