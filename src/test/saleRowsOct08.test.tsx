import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * A sale row in My Leads, after the owner's 2026-10-08 rules, through the real page and form:
 *   • a sale the tech team has started can be EDITED (the form says the job follows and the tech side
 *     is told, and locks the service) but never DELETED — the row says why instead of a button;
 *   • a sale nobody has started is deleted after a confirm, through services/sales by its id.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });
const deleteSale = vi.fn(async (_p: { leadId: string; saleId: string }) => ({ deleted: true, item: null, noSalesLeft: false, orderId: "o" }));
const updateSale = vi.fn(async (p: { next: unknown }) => ({ changed: true, changes: [{ text: "x", money: false }], item: p.next, itemIndex: 0, hasWork: true, orderId: "o" }));

const STARTED = {
  category: "promotional", packageKey: "30 Seconds + Poster", amount: 999, verificationStatus: "pending",
  submittedAt: at("2026-08-01T10:00:00"), saleId: "l1_started", paymentScreenshotUrl: "https://img/p.png",
  requirement: { businessName: "Sri Sai Silks", language: "Telugu", aspectRatio: "9:16", modelGender: "female", attireType: "traditional" },
};
const WAITING = { ...STARTED, saleId: "l1_waiting", category: "wishes", packageKey: "1 Minute + Poster", amount: 1499,
  requirement: { ...STARTED.requirement, festival: "Diwali" } };

const leads = [{
  id: "l1", phone: "9876543210", displayName: "Sri Sai Silks", status: "answered", saleDone: true,
  assignedTo: "u1", createdAt: at("2026-08-01T09:00:00"), saleItems: [STARTED, WAITING],
}];
const ORDERS = [
  { id: "o_l1_started", status: "assigned", workAssignmentId: "w1", assignedTo: "ravi", assignedToName: "Ravi", soldBy: "u1", leadId: "l1" },
  { id: "o_l1_waiting", status: "unassigned", workAssignmentId: null, soldBy: "u1", leadId: "l1" },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: { now: () => at("2026-08-01T12:00:00"), fromMillis: (ms: number) => ({ seconds: Math.floor(ms / 1000) }) },
  onSnapshot: () => () => {},
}));
const AUTH = { user: { uid: "u1", name: "Anil", role: "sales_member" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/duplicateLeads", () => ({
  findMemberDuplicates: async () => ({}),
  resolveNonSaleDuplicates: async () => ({ resolvedMyLeadIds: new Set(), frozeMineCount: 0, wonCount: 0 }),
}));
vi.mock("@/services/adLanguages", () => ({
  watchAdLanguages: () => () => {}, rememberAdLanguage: vi.fn(), mergeAdLanguages: (a: string[] | null) => a ?? ["Telugu", "Hindi", "English"],
}));
vi.mock("@/services/activityLog", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn() }));
vi.mock("@/services/numberLock", () => ({
  claimNumber: vi.fn(), applySaleFreeze: vi.fn(), releaseLockForLead: vi.fn(),
  buildLeadFreezeFields: vi.fn(), fetchNumberLock: async () => null, clearSaleFreeze: vi.fn(),
}));
vi.mock("@/services/orders", () => ({ addOrderUpdateNote: vi.fn() }));
vi.mock("@/services/sales", () => ({
  recordSale: vi.fn(), updateSale, deleteSale, deleteLeadWithSales: vi.fn(), mutateSaleItems: vi.fn(),
  isSaleWriteError: () => false,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/components/sales/NumberTimelineButton", () => ({ default: () => null }));
vi.mock("@/components/work/ExtendPromiseButton", () => ({ default: () => null }));

const MyLeads = (await import("@/pages/sales-member/MyLeads")).default;
const { useSalesLeadsStore } = await import("@/store/salesLeadsStore");
const { useSalesOrdersStore } = await import("@/store/salesOrdersStore");

configure({ testIdAttribute: "data-test" });
beforeEach(() => {
  vi.setSystemTime(new Date("2026-08-01T13:00:00"));
  deleteSale.mockClear();
  updateSale.mockClear();
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

function renderMyLeads() {
  useSalesLeadsStore.getState().setLeads("u1", leads as never);
  useSalesOrdersStore.getState().setOrders("u1", ORDERS as never);
  render(<MemoryRouter><MyLeads /></MemoryRouter>);
  // Two sales on the lead → the list is collapsed behind "Show".
  fireEvent.click(screen.getAllByText("Show")[0]);
  const rows = screen.getAllByTestId("sale-row");
  return {
    started: rows.find((r) => r.getAttribute("data-sale-id") === "l1_started")!,
    waiting: rows.find((r) => r.getAttribute("data-sale-id") === "l1_waiting")!,
  };
}

describe("a sale the tech team has started", () => {
  it("can be edited but not deleted — the row says why", () => {
    const { started } = renderMyLeads();
    expect(within(started).getByTestId("sale-edit")).toBeTruthy();
    expect(within(started).queryByTestId("sale-delete")).toBeNull();
    expect(within(started).getByTestId("sale-delete-blocked").textContent).toMatch(/Can't delete — work started \(Ravi\)/);
  });

  it("opens the form saying the job follows the edit, with the service locked", async () => {
    const { started } = renderMyLeads();
    fireEvent.click(within(started).getByTestId("sale-edit"));
    expect(within(started).getByTestId("sale-edit-work-started").textContent).toMatch(/already working on this sale \(Ravi\)/);
    expect(within(started).getByTestId("sale-category-locked").textContent).toMatch(/Locked while the tech team works on it/);
    expect(within(started).queryByTestId("sale-category")).toBeNull();

    fireEvent.change(within(started).getByTestId("sale-package"), { target: { value: "1 Minute + Poster" } });
    fireEvent.click(within(started).getByText(/^Save changes/));
    await waitFor(() => expect(updateSale).toHaveBeenCalled());
    // The same sale, by its id.
    expect(updateSale.mock.calls[0][0]).toMatchObject({ leadId: "l1", saleId: "l1_started" });
  });
});

describe("a sale nobody has started", () => {
  it("is deleted after a confirm, by its id", async () => {
    const { waiting } = renderMyLeads();
    expect(within(waiting).queryByTestId("sale-delete-blocked")).toBeNull();
    fireEvent.click(within(waiting).getByTestId("sale-delete"));
    expect(deleteSale).not.toHaveBeenCalled();
    fireEvent.click(within(waiting).getByTestId("sale-delete-confirm"));
    await waitFor(() => expect(deleteSale).toHaveBeenCalledWith({ leadId: "l1", saleId: "l1_waiting" }));
  });
});
