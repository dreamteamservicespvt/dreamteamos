import { useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useSalesOrdersStore } from "@/store/salesOrdersStore";
import type { Order } from "@/types";

/**
 * Owns the ONE live "my sold orders" listener for a signed-in sales member. Mount exactly once —
 * in AppLayout, next to `useMyLeadsSync` — never inside an individual page. See
 * store/salesOrdersStore.ts for why this exists.
 */
export function useMyOrdersSync() {
  const uid = useAuthStore((s) => s.user?.uid);
  const role = useAuthStore((s) => s.user?.role);
  const setOrders = useSalesOrdersStore((s) => s.setOrders);
  const reset = useSalesOrdersStore((s) => s.reset);

  useEffect(() => {
    if (!uid || role !== "sales_member") {
      reset();
      return;
    }
    const q = query(collection(db, "orders"), where("soldBy", "==", uid));
    const unsub = onSnapshot(
      q,
      (snap) => setOrders(uid, snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order))),
      () => setOrders(uid, []),
    );
    return () => {
      unsub();
      reset();
    };
  }, [uid, role, setOrders, reset]);
}

/**
 * Read-only access to the shared "my sold orders" data synced by `useMyOrdersSync`. Safe to call
 * from any number of components/pages — it never opens its own Firestore listener.
 */
export function useMyOrders(): { orders: Order[]; loading: boolean } {
  const orders = useSalesOrdersStore((s) => s.orders);
  const loading = useSalesOrdersStore((s) => s.loading);
  return { orders, loading };
}
