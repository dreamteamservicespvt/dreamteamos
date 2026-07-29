/**
 * The orders behind a specific handful of work assignments.
 *
 * A member's My Work page needs the ORDER, not just their assignment, to show a shared month's
 * counters — the counts live on the order precisely so three people splitting a month all read and
 * write the same numbers.
 *
 * It is a keyed lookup rather than a subscription to the orders collection because this project
 * runs on the Firebase free tier: a member holds at most a few multi-deliverable jobs at a time, so
 * this fetches those few by document id and nothing else. Members with no such work pay nothing.
 *
 * Firestore caps an `in` query at 30 values, so the ids are read in chunks of 30 and merged.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, documentId, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { Order } from "@/types";

const CHUNK = 30;

export function useOrdersByIds(orderIds: string[]): Map<string, Order> {
  // Sorted + joined so a re-render with the same ids in a different order does not resubscribe.
  const key = useMemo(() => Array.from(new Set(orderIds.filter(Boolean))).sort().join(","), [orderIds]);
  const [orders, setOrders] = useState<Map<string, Order>>(new Map());

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setOrders(new Map());
      return;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

    // One result bucket per chunk, merged on every emission — so a late chunk never wipes an
    // earlier one, and a doc that disappears from its chunk disappears from the map.
    const buckets: Order[][] = chunks.map(() => []);
    const publish = () => setOrders(new Map(buckets.flat().map((o) => [o.id, o])));

    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(
        query(collection(db, "orders"), where(documentId(), "in", chunk)),
        (snap) => {
          buckets[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
          publish();
        },
        (error) => {
          console.error("[useOrdersByIds] listener failed:", error);
          buckets[i] = [];
          publish();
        },
      ),
    );

    return () => unsubs.forEach((u) => u());
  }, [key]);

  return orders;
}
