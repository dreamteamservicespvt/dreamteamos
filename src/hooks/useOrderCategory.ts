import { useCallback, useState } from "react";
import { ALL_ORDER_CATEGORIES, DEFAULT_ORDER_CATEGORY } from "@/utils/orderCategoryFilter";

/**
 * The Orders queue's remembered "kind of work" filter.
 *
 * The queue opens on everything (see DEFAULT_ORDER_CATEGORY) — but somebody who spends their day
 * clearing cinematic jobs should not re-pick cinematic on every visit. So the choice is theirs and
 * it sticks, rather than the page choosing for them and hiding work they never asked to hide.
 */
export function useOrderCategory(key = "orders"): [string, (next: string) => void] {
  const storageKey = `orderCategory:${key}`;
  const [category, setCategoryState] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || DEFAULT_ORDER_CATEGORY;
    } catch {
      return DEFAULT_ORDER_CATEGORY;
    }
  });

  const setCategory = useCallback((next: string) => {
    setCategoryState(next);
    try {
      // "All services" is the default, so it is stored as an absence rather than a value —
      // that way a future change to the default reaches everyone who never expressed a preference.
      if (next === ALL_ORDER_CATEGORIES) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next);
    } catch { /* private mode / quota — the filter just won't be remembered */ }
  }, [storageKey]);

  return [category, setCategory];
}
