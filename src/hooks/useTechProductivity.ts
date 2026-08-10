/**
 * Videos delivered and work value, per tech member, for one pay period.
 *
 * ── Why the orders are fetched once rather than subscribed to ─────────────────────────────────
 * This app runs on Firestore's free daily read budget, and payroll is a page an admin leaves open.
 * A live subscription to the orders collection would re-read it on every change anyone made all
 * day. Productivity for a pay period does not need to be live to the second — it is read while
 * deciding what to pay somebody — so it is fetched once per period and left alone.
 *
 * Only the categories that actually need an order are fetched: bulk work, whose videos exist ONLY
 * as slots on the order and never become assignments, and social-media months, whose ads have to
 * be attributed to whoever holds the ad-creation track. Ordinary ad work is fully described by its
 * assignment and costs nothing extra here.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useFirestoreCollection } from "@/hooks/useFirestore";
import { memberProductivity, payToDate, type MemberProductivity } from "@/utils/techProductivity";
import { SERVICE_CATALOG } from "@/utils/serviceCatalog";
import type { PeriodFilter } from "@/utils/periodFilter";
import type { Order, WorkAssignment } from "@/types";

/** Categories whose work cannot be read off an assignment alone. */
const NEEDS_ORDER = [
  ...SERVICE_CATALOG.filter(c => c.bulk).map(c => c.key),
  "social_media_management",
];

export function useTechProductivity(
  members: { uid: string; pay: number }[],
  filter: PeriodFilter,
  /** The pay period's real bounds, so a period still running is compared like for like. */
  period: { start: string; end: string },
): { byUid: Record<string, MemberProductivity>; loading: boolean } {
  const { data: assignments, loading: assignmentsLoading } =
    useFirestoreCollection<WorkAssignment>("work_assignments");

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setOrdersLoading(true);
    // `in` takes at most 30 values; there are a handful of categories, so one query covers them.
    getDocs(query(collection(db, "orders"), where("category", "in", NEEDS_ORDER.slice(0, 30))))
      .then(snap => {
        if (!alive) return;
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      })
      .catch(err => {
        // Productivity degrades to assignment-only rather than the page failing. Bulk work would
        // be under-counted, so the caller is told loading finished either way.
        console.error("[productivity] could not read orders:", err);
        if (alive) setOrders([]);
      })
      .finally(() => { if (alive) setOrdersLoading(false); });
    return () => { alive = false; };
  }, []);

  const byUid = useMemo(() => {
    const out: Record<string, MemberProductivity> = {};
    for (const m of members) {
      const { pay, inProgress } = payToDate(m.pay, period);
      out[m.uid] = memberProductivity({
        uid: m.uid,
        pay,
        inProgress,
        assignments,
        orders,
        filter,
      });
    }
    return out;
  }, [members, assignments, orders, filter, period.start, period.end]);

  return { byUid, loading: assignmentsLoading || ordersLoading };
}
