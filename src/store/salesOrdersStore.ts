import { create } from "zustand";
import type { Order } from "@/types";

/**
 * The signed-in sales member's own sold orders ("orders" where soldBy == their uid), held ONCE
 * for the whole session — same idea as store/salesLeadsStore.ts, for the same reason: My Leads,
 * My Clients and Client Chats each used to open their own identical listener on this query, so
 * clicking between those pages re-read the member's whole order history every time.
 */
interface SalesOrdersState {
  uid: string | null;
  orders: Order[];
  loading: boolean;
  setOrders: (uid: string, orders: Order[]) => void;
  reset: () => void;
}

export const useSalesOrdersStore = create<SalesOrdersState>((set) => ({
  uid: null,
  orders: [],
  loading: true,
  setOrders: (uid, orders) => set({ uid, orders, loading: false }),
  reset: () => set({ uid: null, orders: [], loading: true }),
}));
