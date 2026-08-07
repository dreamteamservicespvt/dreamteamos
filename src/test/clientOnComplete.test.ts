import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client, Order, WorkAssignment } from "@/types";

/**
 * Becoming a client the moment the work is delivered.
 *
 * Completion — not verification — is when the customer actually has something, so it is when they
 * appear in Clients and become reachable for an upsell. Two things were wrong with how that entry
 * was built, and both are the kind of wrong that is invisible until somebody reads the list:
 *
 *  1. It took the phone number ONLY from the assignment, where it is optional and routinely
 *     blank — so a sold job assigned without re-typing the customer's number produced no client
 *     at all.
 *  2. It took the attribution from the assignment too, which knows about the delivery and nothing
 *     about the sale. The tech admin's uid went into `soldBy`, `soldByName` was empty, the tech
 *     price went into `saleAmount` and `totalSaleAmount` stayed at zero. Verification could not
 *     repair it: it matches on `orderId`, found the entry already there, and skipped.
 *
 * The order is the authority on the sale, so it is read first and it wins.
 */

/** In-memory stand-ins for the two collections this touches. */
const clients = new Map<string, Client>();
const orders = new Map<string, Order>();

const NOW_SECONDS = 1_800_000_000;

vi.mock("firebase/firestore", () => {
  const bucket = (name: string) => (name === "orders" ? orders : clients);
  const snap = (ref: { name: string; id: string }) => ({
    exists: () => bucket(ref.name).has(ref.id),
    data: () => bucket(ref.name).get(ref.id),
    id: ref.id,
  });
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    doc: (_db: unknown, name: string, id: string) => ({ name, id }),
    getDoc: async (ref: { name: string; id: string }) => snap(ref),
    getDocs: async () => ({ docs: [] }),
    updateDoc: async () => undefined,
    setDoc: async () => undefined,
    onSnapshot: () => () => {},
    query: (...args: unknown[]) => args,
    where: (...args: unknown[]) => args,
    serverTimestamp: () => ({ __server: true }),
    Timestamp: {
      now: () => ({ seconds: NOW_SECONDS, nanoseconds: 0 }),
      fromMillis: (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
    },
    writeBatch: () => ({ set: () => {}, update: () => {}, commit: async () => {} }),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        get: async (ref: { name: string; id: string }) => snap(ref),
        set: (ref: { name: string; id: string }, value: unknown) => {
          bucket(ref.name).set(ref.id, value as Client & Order);
        },
        update: (ref: { name: string; id: string }, patch: Record<string, unknown>) => {
          const store = bucket(ref.name);
          store.set(ref.id, { ...(store.get(ref.id) as Client & Order), ...patch } as Client & Order);
        },
      };
      await fn(tx);
    },
  };
});

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));
vi.mock("@/services/numberLock", () => ({ adminAssignNumber: vi.fn() }));

import { upsertClientOnWorkComplete } from "@/services/clients";

const anAssignment = (patch: Partial<WorkAssignment> = {}): WorkAssignment => ({
  id: "wa-1",
  assignedTo: "tech-1",
  assignedBy: "techadmin-1",
  category: "promotional",
  duration: "32s",
  clipCount: 4,
  status: "completed",
  totalPrice: 999,
  businessName: "Sri Ganesh Sweets",
  completedDate: "2026-08-01",
  ...patch,
} as WorkAssignment);

const anOrder = (patch: Partial<Order> = {}): Order => ({
  id: "ord-1",
  clientPhone: "+919876543210",
  clientPhoneId: "919876543210",
  businessName: "Sri Ganesh Sweets",
  category: "promotional",
  packageKey: "32s",
  amount: 4999,
  soldBy: "sales-7",
  soldByName: "Asha Devi",
  salesAdminId: "salesadmin-2",
  fromAd: true,
  status: "completed",
  ...patch,
} as Order);

beforeEach(() => {
  clients.clear();
  orders.clear();
  vi.clearAllMocks();
});

describe("a sold job, on completion", () => {
  beforeEach(() => { orders.set("ord-1", anOrder()); });

  it("creates the client even when the assignment carries no phone number", async () => {
    // The field is optional on an assignment and both edit forms write it back as "". The order
    // always has the number — it is the join key the whole pipeline is built on.
    await upsertClientOnWorkComplete({
      assignment: anAssignment({ orderId: "ord-1", businessWhatsapp: undefined }),
      deliveredByName: "Kiran",
    });

    const client = clients.get("919876543210");
    expect(client).toBeDefined();
    expect(client!.phone).toBe("+919876543210");
  });

  it("records who actually sold it, and for how much", async () => {
    await upsertClientOnWorkComplete({
      assignment: anAssignment({ orderId: "ord-1" }),
      deliveredByName: "Kiran",
    });

    const work = clients.get("919876543210")!.works[0];
    expect(work.soldBy).toBe("sales-7");
    expect(work.soldByName).toBe("Asha Devi");
    // The SALE amount, not the tech price — those are different numbers and both are on file.
    expect(work.saleAmount).toBe(4999);
    expect(work.deliveredAmount).toBe(999);
    expect(work.packageKey).toBe("32s");
    expect(work.fromAd).toBe(true);
    expect(work.orderId).toBe("ord-1");
  });

  it("counts the sale value, so the client does not read as a ₹0 customer", async () => {
    await upsertClientOnWorkComplete({ assignment: anAssignment({ orderId: "ord-1" }) });
    expect(clients.get("919876543210")!.totalSaleAmount).toBe(4999);
  });

  it("belongs to the order's sales admin, not to every sales admin", async () => {
    // Unattributed work goes to everyone so somebody can pick up the upsell. A sold job has an
    // owner, and handing it to the whole company is how another admin's client appears in a list
    // they have no business seeing.
    await upsertClientOnWorkComplete({
      assignment: anAssignment({ orderId: "ord-1" }),
      salesAdminIds: ["admin-a", "admin-b", "admin-c"],
    });
    expect(clients.get("919876543210")!.salesAdminIds).toEqual(["salesadmin-2"]);
  });

  it("files it under the ORDER's phone id, so one customer is one client document", async () => {
    // The assignment's copy can be edited by hand; the order's is the key Orders, reviews and the
    // verify path all use. Preferring the typed one is how a customer ends up recorded twice.
    await upsertClientOnWorkComplete({
      assignment: anAssignment({ orderId: "ord-1", businessWhatsapp: "98765 43210" }),
    });
    expect([...clients.keys()]).toEqual(["919876543210"]);
  });

  it("does not record the same job twice", async () => {
    const assignment = anAssignment({ orderId: "ord-1" });
    await upsertClientOnWorkComplete({ assignment });
    await upsertClientOnWorkComplete({ assignment });

    const client = clients.get("919876543210")!;
    expect(client.works).toHaveLength(1);
    expect(client.workCount).toBe(1);
    expect(client.totalSaleAmount).toBe(4999);
  });

  it("adds a second sale to the same client rather than a second client", async () => {
    orders.set("ord-2", anOrder({ id: "ord-2", amount: 2500, packageKey: "16s" }));
    await upsertClientOnWorkComplete({ assignment: anAssignment({ orderId: "ord-1" }) });
    await upsertClientOnWorkComplete({ assignment: anAssignment({ id: "wa-2", orderId: "ord-2" }) });

    const client = clients.get("919876543210")!;
    expect(client.works).toHaveLength(2);
    expect(client.totalSaleAmount).toBe(4999 + 2500);
  });
});

describe("a job assigned directly, with no sale behind it", () => {
  it("still becomes a client, from the number typed on the assignment", async () => {
    await upsertClientOnWorkComplete({
      assignment: anAssignment({ businessWhatsapp: "9876543210" }),
      salesAdminIds: ["admin-a", "admin-b"],
    });

    const client = clients.get("919876543210")!;
    expect(client).toBeDefined();
    // No order means no owning admin, so every sales admin can see it and run the upsell.
    expect(client.salesAdminIds).toEqual(["admin-a", "admin-b"]);
  });

  it("is skipped entirely when there is no number anywhere — nobody to upsell to", async () => {
    await upsertClientOnWorkComplete({ assignment: anAssignment({ businessWhatsapp: "" }) });
    expect(clients.size).toBe(0);
  });

  it("survives an order id that no longer resolves", async () => {
    // A deleted order must not take the client record down with it.
    await upsertClientOnWorkComplete({
      assignment: anAssignment({ orderId: "gone", businessWhatsapp: "9876543210" }),
      salesAdminIds: ["admin-a"],
    });
    expect(clients.get("919876543210")).toBeDefined();
  });
});
