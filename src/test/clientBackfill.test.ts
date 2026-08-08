import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client, ClientWorkItem, WorkAssignment } from "@/types";

/**
 * The backfill's contract, tested against a fake Firestore.
 *
 * Two things actually matter here. Idempotency: this sweep is run manually and will be run more
 * than once, so a second pass must not append the same delivery twice and inflate a client's
 * revenue or work count. And dates: a work item is stamped with when the job was *delivered*,
 * never when the import ran — stamping "now" is what made every client's last-work date read as
 * the day someone pressed Import.
 */

/** In-memory stand-in for the `clients` collection. */
const store = new Map<string, Client>();

/**
 * The `orders` collection, which the sweep reads once to attribute each job to its seller.
 *
 * It matters because "Sold by" used to be filled in from `assignment.assignedBy` — the tech person
 * who handed the job out — and that name is what a sales member's own client list is now built on.
 */
const orders = new Map<string, Record<string, unknown>>();

/** Writes actually committed, so a test can assert a no-op re-run touches nothing. */
let commits = 0;

const NOW_SECONDS = 1_800_000_000;

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, name: string, id: string) => ({ name, id }),
  getDoc: async (ref: { id: string }) => ({
    exists: () => store.has(ref.id),
    data: () => store.get(ref.id),
  }),
  getDocs: async (ref: { name?: string }) => {
    if (ref?.name === "clients") {
      return { docs: [...store.entries()].map(([id, data]) => ({ id, data: () => data })) };
    }
    if (ref?.name === "orders") {
      return { docs: [...orders.entries()].map(([id, data]) => ({ id, data: () => data })) };
    }
    return { docs: [] };
  },
  updateDoc: async () => undefined,
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  serverTimestamp: () => ({ __server: true }),
  Timestamp: {
    now: () => ({ seconds: NOW_SECONDS, nanoseconds: 0 }),
    fromMillis: (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
  },
  writeBatch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (ref: { id: string }, value: Client) => { ops.push(() => store.set(ref.id, value)); },
      update: (ref: { id: string }, patch: Partial<Client>) => {
        ops.push(() => store.set(ref.id, { ...(store.get(ref.id) as Client), ...patch }));
      },
      commit: async () => { commits += ops.length; ops.forEach((op) => op()); ops.length = 0; },
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      get: async (ref: { id: string }) => ({
        exists: () => store.has(ref.id),
        data: () => store.get(ref.id),
      }),
      set: (ref: { id: string }, value: Client) => { store.set(ref.id, value); },
      update: (ref: { id: string }, patch: Partial<Client>) => {
        store.set(ref.id, { ...(store.get(ref.id) as Client), ...patch });
      },
    };
    await fn(tx);
  },
}));

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: async () => undefined }));
vi.mock("@/services/numberLock", () => ({ adminAssignNumber: async () => undefined }));

const { backfillClientsFromDeliveredWork } = await import("@/services/clients");

const job = (fields: Partial<WorkAssignment>): WorkAssignment => ({
  id: "a1", assignedTo: "m1", assignedBy: "admin1", category: "promotional",
  status: "completed", totalPrice: 999, businessName: "Sharma Electronics",
  businessWhatsapp: "+919876543210", completedDate: "2026-07-15",
  clipCount: 2, duration: "16s", ...fields,
} as WorkAssignment);

const nameFor = () => "Ravi";

/** Epoch seconds the backfill should stamp for a job finished on `yyyy-MM-dd`. */
const secondsFor = (day: string) => Math.floor(Date.parse(`${day}T12:00:00`) / 1000);

beforeEach(() => { store.clear(); orders.clear(); commits = 0; });

describe("backfillClientsFromDeliveredWork", () => {
  it("imports delivered work that never reached Clients", async () => {
    const result = await backfillClientsFromDeliveredWork([job({})], nameFor);

    expect(result.scanned).toBe(1);
    expect(result.imported).toBe(1);
    expect(store.size).toBe(1);
    expect(store.get("919876543210")?.name).toBe("Sharma Electronics");
  });

  it("ignores work that is not delivered yet", async () => {
    const result = await backfillClientsFromDeliveredWork([
      job({ id: "a1", status: "assigned" }),
      job({ id: "a2", status: "in_progress" }),
      job({ id: "a3", status: "editing" }),
    ], nameFor);

    expect(result.scanned).toBe(0);
    expect(store.size).toBe(0);
  });

  it("counts verified work as delivered, not just completed", async () => {
    const result = await backfillClientsFromDeliveredWork([job({ status: "verified" })], nameFor);
    expect(result.imported).toBe(1);
  });

  it("is idempotent — a second run imports nothing and does not double-count", async () => {
    const jobs = [job({})];

    const first = await backfillClientsFromDeliveredWork(jobs, nameFor);
    const second = await backfillClientsFromDeliveredWork(jobs, nameFor);

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.alreadyPresent).toBe(1);

    const client = store.get("919876543210") as Client;
    expect(client.works).toHaveLength(1);
    expect(client.workCount).toBe(1);
    expect(client.totalDeliveredAmount).toBe(999);
  });

  it("accumulates several jobs for the same customer without duplicating them", async () => {
    const jobs = [
      job({ id: "a1", totalPrice: 999, completedDate: "2026-07-10" }),
      job({ id: "a2", totalPrice: 1999, completedDate: "2026-07-20" }),
    ];

    await backfillClientsFromDeliveredWork(jobs, nameFor);
    const client = store.get("919876543210") as Client;

    expect(client.works).toHaveLength(2);
    expect(client.workCount).toBe(2);
    expect(client.totalDeliveredAmount).toBe(2998);

    // Re-running must leave the totals exactly where they were.
    await backfillClientsFromDeliveredWork(jobs, nameFor);
    const after = store.get("919876543210") as Client;
    expect(after.works).toHaveLength(2);
    expect(after.totalDeliveredAmount).toBe(2998);
  });

  it("skips delivered work with no WhatsApp number — there is nobody to upsell", async () => {
    const result = await backfillClientsFromDeliveredWork([
      job({ id: "a1", businessWhatsapp: undefined }),
      job({ id: "a2", businessWhatsapp: "" }),
    ], nameFor);

    expect(result.missingPhone).toBe(2);
    expect(result.imported).toBe(0);
    expect(store.size).toBe(0);
  });

  it("keys clients by phone, so two businesses on one number merge into one record", async () => {
    await backfillClientsFromDeliveredWork([
      job({ id: "a1", businessName: "Sharma Electronics" }),
      job({ id: "a2", businessName: "Sharma Mobiles" }),
    ], nameFor);

    expect(store.size).toBe(1);
    expect((store.get("919876543210") as Client).works).toHaveLength(2);
  });

  it("normalises phone formatting so the same number never creates two clients", async () => {
    await backfillClientsFromDeliveredWork([
      job({ id: "a1", businessWhatsapp: "+91 98765 43210" }),
      job({ id: "a2", businessWhatsapp: "9876543210" }),
    ], nameFor);

    expect(store.size).toBe(1);
  });

  it("records delivery attribution on each work item", async () => {
    await backfillClientsFromDeliveredWork([job({})], () => "Ravi Kumar");
    const work = (store.get("919876543210") as Client).works[0] as ClientWorkItem;

    expect(work.deliveredBy).toBe("m1");
    expect(work.deliveredByName).toBe("Ravi Kumar");
    expect(work.workAssignmentId).toBe("a1");
  });

  it("reports progress per client, so a long sweep can show where it is", async () => {
    const seen: string[] = [];
    await backfillClientsFromDeliveredWork(
      [
        job({ id: "a1", businessWhatsapp: "+919000000001" }),
        job({ id: "a2", businessWhatsapp: "+919000000002" }),
        job({ id: "a3", businessWhatsapp: "+919000000003" }),
      ],
      nameFor,
      (done, total) => seen.push(`${done}/${total}`),
    );
    expect(seen).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("stamps each job with when it was delivered, never with when the import ran", async () => {
    await backfillClientsFromDeliveredWork([job({ completedDate: "2026-05-04" })], nameFor);
    const work = (store.get("919876543210") as Client).works[0];

    expect((work.deliveredAt as { seconds: number }).seconds).toBe(secondsFor("2026-05-04"));
    expect((work.deliveredAt as { seconds: number }).seconds).not.toBe(NOW_SECONDS);
  });

  it("prefers the precise completion stamp over the date string", async () => {
    const completedAt = { seconds: 1_777_000_000, nanoseconds: 0 };
    await backfillClientsFromDeliveredWork([job({ completedAt })], nameFor);
    const work = (store.get("919876543210") as Client).works[0];

    expect((work.deliveredAt as { seconds: number }).seconds).toBe(1_777_000_000);
  });

  it("repairs a delivery date an earlier import stamped with its own run time", async () => {
    // Exactly what the old import left behind: the right job, the wrong date.
    store.set("919876543210", {
      phone: "+919876543210", phoneId: "919876543210", name: "Sharma Electronics",
      works: [{
        orderId: "assignment_a1", workAssignmentId: "a1", category: "promotional",
        title: "Promotional Ad", billing: "one_time", soldBy: "admin1", soldByName: "",
        saleAmount: 999, fromAd: false, deliveredBy: "m1", deliveredByName: "Ravi",
        deliveredAmount: 999, deliveredAt: { seconds: NOW_SECONDS, nanoseconds: 0 },
      }],
      workCount: 1, totalSaleAmount: 0, totalDeliveredAmount: 999,
    } as unknown as Client);

    const result = await backfillClientsFromDeliveredWork([job({ completedDate: "2026-05-04" })], nameFor);

    expect(result.repaired).toBe(1);
    expect(result.imported).toBe(0);
    const work = (store.get("919876543210") as Client).works[0];
    expect((work.deliveredAt as { seconds: number }).seconds).toBe(secondsFor("2026-05-04"));
    // A repair must not duplicate the job or move the money.
    expect((store.get("919876543210") as Client).works).toHaveLength(1);
    expect((store.get("919876543210") as Client).totalDeliveredAmount).toBe(999);
  });

  it("writes nothing at all when everything is already correct", async () => {
    const jobs = [job({}), job({ id: "a2", businessWhatsapp: "+919000000009" })];
    await backfillClientsFromDeliveredWork(jobs, nameFor);

    commits = 0;
    const second = await backfillClientsFromDeliveredWork(jobs, nameFor);

    expect(commits).toBe(0);
    expect(second.clientsWritten).toBe(0);
    expect(second.alreadyPresent).toBe(2);
  });
});

/**
 * Whose customer is this?
 *
 * A sales member's own Clients page is a query on `soldByIds`, so getting this wrong does not
 * produce a cosmetic error — it shows one member another member's customers, or hides their own.
 */
describe("attributing a delivered job to the person who sold it", () => {
  const sale = (fields: Record<string, unknown> = {}) => ({
    soldBy: "sales1", soldByName: "Ravi", amount: 1499, fromAd: true, ...fields,
  });

  it("takes the seller from the order, not the tech member who assigned the work", async () => {
    orders.set("o1", sale());

    await backfillClientsFromDeliveredWork([job({ orderId: "o1" })], nameFor);

    const client = store.get("919876543210") as Client;
    expect(client.works[0].soldBy).toBe("sales1");
    expect(client.works[0].soldByName).toBe("Ravi");
    // `admin1` is the assigner. It is the value this used to write, and it is the bug.
    expect(client.works[0].soldBy).not.toBe("admin1");
    expect(client.soldByIds).toEqual(["sales1"]);
  });

  it("repairs history that was written with the assigner's uid", async () => {
    orders.set("o1", sale());
    store.set("919876543210", {
      phone: "+919876543210", phoneId: "919876543210", name: "Sharma Electronics",
      works: [{
        orderId: "o1", workAssignmentId: "a1", category: "promotional",
        title: "Promotional Ad", billing: "one_time",
        // What the old code wrote: the tech assigner, in a field called soldBy.
        soldBy: "admin1", soldByName: "",
        saleAmount: 999, fromAd: false, deliveredBy: "m1", deliveredByName: "Ravi",
        deliveredAmount: 999, deliveredAt: { seconds: secondsFor("2026-07-15"), nanoseconds: 0 },
      }],
      workCount: 1, totalSaleAmount: 0, totalDeliveredAmount: 999,
    } as unknown as Client);

    const result = await backfillClientsFromDeliveredWork([job({ orderId: "o1" })], nameFor);

    expect(result.reattributed).toBe(1);
    expect(result.imported).toBe(0);
    const client = store.get("919876543210") as Client;
    expect(client.works[0].soldBy).toBe("sales1");
    expect(client.soldByIds).toEqual(["sales1"]);
    // Repairing attribution must not duplicate the job or move the money.
    expect(client.works).toHaveLength(1);
    expect(client.totalDeliveredAmount).toBe(999);
  });

  it("keeps both sellers when two of them sold to the same business", async () => {
    orders.set("o1", sale({ soldBy: "sales1", soldByName: "Ravi" }));
    orders.set("o2", sale({ soldBy: "sales2", soldByName: "Meera" }));

    await backfillClientsFromDeliveredWork([
      job({ id: "a1", orderId: "o1", completedDate: "2026-06-01" }),
      job({ id: "a2", orderId: "o2", completedDate: "2026-07-01" }),
    ], nameFor);

    const client = store.get("919876543210") as Client;
    expect(client.soldByIds?.sort()).toEqual(["sales1", "sales2"]);
  });

  /**
   * Work created straight in Work Assign has no sale and no seller. Putting the tech assigner in
   * here would hand a customer to somebody who never sold anything — and, worse, to a uid that a
   * "my clients" query would happily match.
   */
  it("gives a directly-assigned job no seller at all", async () => {
    await backfillClientsFromDeliveredWork([job({ orderId: undefined })], nameFor);

    const client = store.get("919876543210") as Client;
    expect(client.soldByIds).toEqual([]);
  });

  it("stays idempotent once attribution is right", async () => {
    orders.set("o1", sale());
    const jobs = [job({ orderId: "o1" })];
    await backfillClientsFromDeliveredWork(jobs, nameFor);

    commits = 0;
    const second = await backfillClientsFromDeliveredWork(jobs, nameFor);

    expect(commits).toBe(0);
    expect(second.reattributed).toBe(0);
    expect(second.alreadyPresent).toBe(1);
  });
});
