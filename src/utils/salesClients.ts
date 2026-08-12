/**
 * A sales member's own customer book: everyone they have ever sold to.
 *
 * ── Why this is not simply the clients collection ─────────────────────────────────────────────
 * Because a `clients` record is created when work is DELIVERED, and "who have I sold to" is a
 * different and larger question. Measured against live data, one member had sold to 710 distinct
 * customers and her Clients page offered 53 — the rest were either still in production, or carried
 * no `soldByIds` because that field is filled in by a one-off backfill nobody had run.
 *
 * Both of those are ways of losing a customer you are entitled to call. So the book is built from
 * the member's ORDERS, which is the record of the sale itself and exists from the moment the sale
 * is taken, and the client document is merged in wherever one exists to add the delivered history,
 * the profile and the reviews. A customer who bought yesterday and a customer who bought a year ago
 * both appear; only the depth of what we know about them differs.
 *
 * A pleasant consequence: nothing here depends on the backfill ever being run.
 *
 * Pure and Firestore-free — the merge rule is the part worth testing.
 */
import { normalizePhone } from "./phone";
import type { Client, ClientWorkItem, Order } from "@/types";

/** A row in a sales member's client book. */
export interface SalesClient {
  /** Digits-only phone — the clients collection's own key, so the two always line up. */
  phoneId: string;
  phone: string;
  name: string;
  /** The full record, when this customer has had something delivered. Null until then. */
  client: Client | null;
  /** Every order this member sold to this customer, newest first. */
  orders: Order[];
  /** When they last bought something from this member, in epoch ms. */
  lastSoldMs: number;
  /** When they first did — "client since", from this member's point of view. */
  firstSoldMs: number;
  /** Total this member has sold them, in rupees. */
  totalSold: number;
  /** Delivered work, from the client record. Empty for a customer still waiting. */
  works: ClientWorkItem[];
  /** True when nothing has been delivered yet — worth saying, since it changes the call. */
  awaitingDelivery: boolean;
}

function ms(ts: unknown): number {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

/** The clients collection keys on digits only; an order carries both forms. */
function keyOf(order: Order): string {
  return order.clientPhoneId || (order.clientPhone || "").replace(/[^0-9]/g, "");
}

export interface BuildSalesClientsInput {
  /** This member's orders — `where soldBy == uid`. */
  orders: Order[];
  /** Client records visible to them. Matched by phone; extras are ignored. */
  clients: Client[];
}

/**
 * Group a member's orders into one row per customer, enriched by the client record.
 *
 * Cancelled and deleted orders are left out: a sale that was reversed is not a customer
 * relationship, and calling somebody about an ad they never actually bought is worse than not
 * calling them.
 */
export function buildSalesClients(input: BuildSalesClientsInput): SalesClient[] {
  const byPhone = new Map<string, Client>();
  for (const c of input.clients) {
    if (c.phoneId) byPhone.set(c.phoneId, c);
  }

  const rows = new Map<string, SalesClient>();

  for (const order of input.orders) {
    if (order.deleted || order.status === "deleted" || order.status === "cancelled") continue;
    const phoneId = keyOf(order);
    if (!phoneId) continue;

    const at = ms(order.createdAt);
    const existing = rows.get(phoneId);

    if (existing) {
      existing.orders.push(order);
      existing.totalSold += order.amount || 0;
      existing.lastSoldMs = Math.max(existing.lastSoldMs, at);
      existing.firstSoldMs = existing.firstSoldMs === 0 ? at : Math.min(existing.firstSoldMs, at);
      // A later order may carry a better name than the first one did.
      if (!existing.name && order.businessName) existing.name = order.businessName;
      continue;
    }

    const client = byPhone.get(phoneId) || null;
    rows.set(phoneId, {
      phoneId,
      phone: order.clientPhone || client?.phone || normalizePhone(phoneId),
      // The client record's name wins: an admin may have corrected it there.
      name: client?.name || order.businessName || order.clientName || "",
      client,
      orders: [order],
      lastSoldMs: at,
      firstSoldMs: at,
      totalSold: order.amount || 0,
      works: client?.works || [],
      awaitingDelivery: !client,
    });
  }

  for (const row of rows.values()) {
    row.orders.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }

  return [...rows.values()].sort((a, b) => b.lastSoldMs - a.lastSoldMs);
}

/**
 * Whether a customer belongs in the selected period, measured by WHEN THEY BOUGHT.
 *
 * Deliberately the sale date rather than the delivery date, which is what the shared Clients page
 * uses. To a sales member "my July clients" means the people who bought from them in July; whether
 * the tech team shipped it in July or August is not a fact about their month, and filtering on it
 * moves customers between months for reasons the seller had no part in.
 */
export function soldWithin(row: SalesClient, isWithin: (day: string) => boolean): boolean {
  return row.orders.some((o) => {
    const at = ms(o.createdAt);
    if (!at) return false;
    const d = new Date(at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return isWithin(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  });
}
