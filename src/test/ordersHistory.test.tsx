import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The Orders queue's history tabs.
 *
 * The queue subscribes to three statuses, so an order that reached the end of the pipeline was not
 * merely filtered off the page — it was never fetched. On the live data that was 685 of 728 orders:
 * 664 delivered-or-swept, 21 deleted. The team's experience of that was "orders keep disappearing",
 * and there was no screen anywhere that could say where one had gone.
 *
 * These pin the three things that fixes it: history is reachable, each row says WHY it left, and
 * anything removed by mistake can be put back.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const order = (over: Record<string, unknown>) => ({
  clientPhone: "+919000000000", clientPhoneId: "919000000000",
  businessName: "A business", clientName: "A client", category: "promotional",
  packageKey: "30 Seconds + Poster", amount: 999,
  leadId: "l1", saleItemIndex: 0, saleItemKey: "l1__0", saleSubmittedAtMs: 0,
  soldBy: "s1", soldByName: "Gova", fromAd: true, salesAdminId: "sa1",
  promise: null, penalties: [], penaltyTotal: 0, penaltyClips: 0,
  createdAt: at("2026-08-01T09:00:00"), updatedAt: at("2026-08-02T09:00:00"),
  ...over,
});

/** One live order, so the queue itself is not empty while we look at history. */
const liveOrders = [order({ id: "live1", status: "unassigned", businessName: "Still Waiting" })];

const historyRows = [
  order({
    id: "h_deleted", status: "deleted", deleted: true, businessName: "Fmcg",
    deletedAt: at("2026-08-02T06:23:37"), deletedByName: "Srinu",
    updatedAt: at("2026-08-02T06:23:37"),
  }),
  order({
    id: "h_swept", status: "verified", reconciledManually: true, businessName: "Swept Away",
    retiredByName: "Srinu", retiredAt: at("2026-07-29T05:37:54"),
    updatedAt: at("2026-07-29T05:37:54"),
  }),
  order({
    id: "h_delivered", status: "verified", businessName: "All Done",
    updatedAt: at("2026-07-30T05:00:00"),
  }),
];

const restoreOrders = vi.fn(async () => 1);
const fetchOrderHistory = vi.fn(async () => ({ rows: historyRows, scanned: 3 }));

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useFirestore", () => ({
  useFirestoreQuery: () => ({ data: liveOrders, loading: false }),
  useFirestoreCollection: (name: string) => ({
    data: name === "work_assignments" ? [] : [{ uid: "m1", name: "Jyothika", role: "tech_member", isActive: true }],
    loading: false,
  }),
}));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { uid: "ta1", name: "Srinu", role: "tech_admin", createdBy: "ma1" } }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/services/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/orders")>();
  return {
    ...actual,
    activeOrdersQuery: () => null,
    notifyDueOrdersOnOpen: vi.fn(),
    findReconcilableOrders: () => [],
    reconcileManualOrders: vi.fn(),
    deleteOrders: vi.fn(async () => 1),
    revertOrderToUnassigned: vi.fn(),
    removeOrderPenalty: vi.fn(),
    restoreOrders,
    fetchOrderHistory,
  };
});
vi.mock("@/services/workAssign", () => ({ unassignWork: vi.fn() }));
vi.mock("@/services/workVerify", () => ({ verifyAssignments: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const Orders = (await import("@/pages/tech-admin/Orders")).default;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
configure({ testIdAttribute: "data-test" });

const shownBusinesses = () =>
  Array.from(document.querySelectorAll("h3")).map((h) => h.textContent?.trim() || "");

describe("Orders queue — history", () => {
  it("does not touch history until a history tab is opened", () => {
    render(<Orders />);
    // The whole point of the on-demand fetch: 700+ archived orders must not be read on a page
    // whose job is the 40 live ones. This app runs on the free daily read budget.
    expect(fetchOrderHistory).not.toHaveBeenCalled();
    expect(shownBusinesses()).toEqual(["Still Waiting"]);
  });

  it("shows delivered orders — the 91% the queue could never reach", async () => {
    render(<Orders />);
    fireEvent.click(screen.getByTestId("orders-tab-delivered"));
    await waitFor(() => expect(fetchOrderHistory).toHaveBeenCalled());
    await waitFor(() => expect(shownBusinesses()).toEqual(["All Done"]));
  });

  it("separates what was removed from what was delivered, and says which is which", async () => {
    render(<Orders />);
    fireEvent.click(screen.getByTestId("orders-tab-removed"));
    // Newest change first: the Fmcg delete (2 Aug) before the sweep (29 Jul).
    await waitFor(() => expect(shownBusinesses()).toEqual(["Fmcg", "Swept Away"]));

    const reasons = screen.getAllByTestId("order-exit-reason").map((el) => el.textContent);
    expect(reasons[0]).toContain("Deleted from the queue");
    expect(reasons[1]).toContain("Cleared as already-done");
  });

  it("names who removed an order and when — the question nobody could answer before", async () => {
    render(<Orders />);
    fireEvent.click(screen.getByTestId("orders-tab-removed"));
    await waitFor(() => expect(screen.getByTestId("order-removed-by")).toBeTruthy());
    expect(screen.getByTestId("order-removed-by").textContent).toContain("Srinu");
  });

  it("puts a removed order back in the queue", async () => {
    render(<Orders />);
    fireEvent.click(screen.getByTestId("orders-tab-removed"));
    await waitFor(() => expect(screen.getAllByTestId("order-restore-one").length).toBe(2));

    fireEvent.click(screen.getAllByTestId("order-restore-one")[0]);
    fireEvent.click(screen.getByText("Restore 1"));

    await waitFor(() => expect(restoreOrders).toHaveBeenCalled());
    const [restored, actor] = restoreOrders.mock.calls[0] as unknown as [{ id: string }[], { uid: string }];
    expect(restored.map((o) => o.id)).toEqual(["h_deleted"]);
    // Attributable: restoring is as consequential as removing, and both now name a person.
    expect(actor.uid).toBe("ta1");
  });

  it("never offers to restore delivered work — that ad has already been made", async () => {
    render(<Orders />);
    fireEvent.click(screen.getByTestId("orders-tab-delivered"));
    await waitFor(() => expect(shownBusinesses()).toEqual(["All Done"]));
    expect(screen.queryByTestId("order-restore-one")).toBeNull();
  });
});
