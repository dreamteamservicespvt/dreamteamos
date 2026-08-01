/**
 * Filtering the tech Orders queue down to one kind of work.
 *
 * The queue mixes everything the sales team sells — a wishes video, a cinematic ad, a social-media
 * month and a website all sit in the same list. An admin or team leader clearing today's promotional
 * ads had to read past all of it, on every tab.
 *
 * Two decisions worth stating:
 *
 *  • The options are built from what is actually in the queue, never from a fixed list. The catalog
 *    grows, and a filter offering "Poster Development (0)" for a team that has never sold one is
 *    noise; a filter that silently omits a category somebody DID sell is worse.
 *
 *  • A bulk order counts as the kind of video it is made of. Ten cinematic ads bought at once are
 *    cinematic work — someone filtering for Cinematic to plan the week's shoots needs them in the
 *    list, and a separate "Bulk" bucket would hide them from exactly the person looking.
 */
import { categoryLabel, effectiveAdCategory } from "@/utils/serviceCatalog";
import type { Order } from "@/types";

/** The "no filter" sentinel. A real category key can never collide with it — none contain a space. */
export const ALL_ORDER_CATEGORIES = "all services";

/**
 * What the queue opens on.
 *
 * Promotional ads are the bulk of what the team delivers, so that is the pile an admin or team
 * leader is almost always coming to the page to work through. Opening on everything meant scrolling
 * past the monthly and website jobs first, every time.
 *
 * The queue is never silently narrowed: the filter renders highlighted when it is not "all", and a
 * tab with no promotional work says so by name and offers one click back to everything.
 */
export const DEFAULT_ORDER_CATEGORY = "promotional";

export interface OrderCategoryOption {
  key: string;
  label: string;
  count: number;
}

/** The service an order is really for. */
export function orderCategoryKey(order: Pick<Order, "category" | "bulkAdType">): string {
  return effectiveAdCategory(order.category || "", order.bulkAdType);
}

export function matchesOrderCategory(
  order: Pick<Order, "category" | "bulkAdType">,
  selected: string,
): boolean {
  return selected === ALL_ORDER_CATEGORIES || orderCategoryKey(order) === selected;
}

/**
 * The dropdown's options, with a count on each.
 *
 * Pass the orders the user is currently looking at — the tab's, past the search box — so the counts
 * describe what is actually on screen and add up to the "all" total.
 *
 * `selected` is always included even when nothing matches it any more: switching to a tab that has
 * no cinematic work must leave the filter visible and reading "(0)", not quietly reset it to
 * everything and show the user a list they did not ask for.
 */
export function orderCategoryOptions(
  orders: Pick<Order, "category" | "bulkAdType">[],
  selected: string = ALL_ORDER_CATEGORIES,
): OrderCategoryOption[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = orderCategoryKey(order);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (selected !== ALL_ORDER_CATEGORIES && !counts.has(selected)) counts.set(selected, 0);

  const options = Array.from(counts, ([key, count]) => ({ key, label: categoryLabel(key), count }))
    // Busiest first — the filter exists to reach the big pile, not to read an alphabet.
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return [{ key: ALL_ORDER_CATEGORIES, label: "All services", count: orders.length }, ...options];
}

/** "Cinematic Ad (7)" — the option text, counts included as the whole point of the dropdown. */
export function orderCategoryOptionLabel(option: OrderCategoryOption): string {
  return `${option.label} (${option.count})`;
}
