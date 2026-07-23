import { useCallback, useState } from "react";

export type ViewMode = "list" | "grid";

/**
 * A remembered list/grid preference for a page.
 *
 * Defaults to "grid" and persists per key in localStorage, so a viewer's choice sticks across
 * visits without threading state through the app. Each page passes a stable key.
 */
export function useViewMode(key: string, initial: ViewMode = "grid"): [ViewMode, (m: ViewMode) => void] {
  const storageKey = `viewMode:${key}`;
  const [mode, setModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === "grid" || saved === "list" ? saved : initial;
    } catch {
      return initial;
    }
  });

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* private mode / quota — ignore */ }
  }, [storageKey]);

  return [mode, setMode];
}
