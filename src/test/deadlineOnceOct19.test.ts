import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deadline alerts all day long (owner, 2026-10-19, Kusuma).
 *
 * The sweep re-sent every late order each 6 hours that anybody opened Orders, and without `once` the keyed
 * row was rewritten whole — unread again, a new push. Each person now hears each state of each order once,
 * on the key already in use (so nothing already sent is sent again), and once more after an extension.
 */

const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    updateDoc: vi.fn(async () => undefined),
    getDocs: vi.fn(async () => ({ docs: [] })),
    doc: vi.fn(() => ({})), collection: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(() => ({})),
    serverTimestamp: () => "TS",
  };
});

const { notifyDueOrdersOnOpen } = await import("@/services/orders");
import type { Order } from "@/types";

const NOW = Date.parse("2026-10-19T10:00:00Z");
const overdue = { label: "24 hours", hours: 24, dueAt: { seconds: Math.floor((NOW - 2 * 86400000) / 1000) } };
const order = (f: Partial<Order> = {}) =>
  ({ id: "o1", status: "assigned", assignedTo: "maker", soldBy: "kusuma", promise: overdue, lastDeadlineNotifiedAt: null, ...f }) as Order;

beforeEach(() => sendNotification.mockClear());

describe("deadline alerts are written once", () => {
  it("sends with `once` on the existing key", async () => {
    await notifyDueOrdersOnOpen([order()], [], NOW);
    const toSeller = sendNotification.mock.calls.map((c) => c[0]).find((p) => p.userId === "kusuma")!;
    expect(toSeller).toMatchObject({ once: true, dedupeKey: "work_deadline_o1_overdue_kusuma" });
  });

  it("an extended promise has its own key", async () => {
    await notifyDueOrdersOnOpen([order({ promise: { ...overdue, extension: { hours: 24 } } as never })], [], NOW);
    const keys = sendNotification.mock.calls.map((c) => c[0].dedupeKey);
    expect(keys).toContain("work_deadline_o1_overdue_ext_kusuma");
  });
});
