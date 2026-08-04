/**
 * Filtering the tech Orders queue down to one kind of work.
 *
 * The queue mixes everything the sales team sells — a wishes video, a cinematic ad, a social-media
 * month and a website all sit in the same list. An admin or team leader clearing today's promotional
 * ads had to read past all of it, on every tab.
 *
 * Two decisions worth stating:
 *
 *  • The options are built from what is actually in the queue, plus the three video kinds the team
 *    produces day in and day out. The catalog grows, and a filter offering "Poster Development (0)"
 *    for a team that has never sold one is noise — but wishes, promotional and cinematic are the
 *    work itself, and a filter that offers them only on the days somebody happened to sell one is
 *    a filter nobody can rely on.
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
 * What the queue opens on: everything.
 *
 * It used to open on "promotional", on the reasoning that promotional ads are the bulk of the work.
 * That reasoning was sound and the default was still wrong. The tab badges count the FILTERED set,
 * so a page opened on promotional says "Not assigned 4" while eleven live orders — a wishes video,
 * a website, two Google listings, a logo, a cinematic ad — sit behind a dropdown, with nothing on
 * screen to suggest they exist. A queue whose job is to be the list of everything owed to a paying
 * client cannot open by hiding some of it.
 *
 * The filter is still one click away, and `useOrderCategory` remembers the pick — so someone who
 * genuinely works one pile all day sets it once and keeps it, while a fresh session starts honest.
 */
export const DEFAULT_ORDER_CATEGORY = ALL_ORDER_CATEGORIES;

/**
 * The three kinds of video the team produces, always offered whether or not any are in the queue
 * today. These are the buckets the tech side plans and staffs around — "show me the wishes videos"
 * has to be answerable on a quiet Tuesday as well as the week before Diwali.
 */
export const ALWAYS_OFFERED_CATEGORIES = ["wishes", "promotional", "cinematic"] as const;

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
  const counts = new Map<string, number>(ALWAYS_OFFERED_CATEGORIES.map((k) => [k, 0]));
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
