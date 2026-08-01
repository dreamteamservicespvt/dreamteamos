import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { ALL_ORDER_CATEGORIES } from "@/utils/orderCategoryFilter";

/**
 * The kind-of-work filter on the tech Orders queue, driven through the real page.
 *
 * The point of the feature is that it is ONE filter for the whole screen: pick Cinematic on
 * "Not assigned" and it is still Cinematic on "Assigned" and on "Changes", so a job type can be
 * followed through the queue by clicking tabs. These pin that, and that the numbers on the tabs
 * agree with the list underneath them once a filter is on.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const order = (over: Record<string, unknown>) => ({
  clientPhone: "+919000000000", clientPhoneId: "919000000000",
  businessName: "A business", clientName: "A client",
  packageKey: "30 Seconds + Poster", amount: 999,
  leadId: "l1", saleItemIndex: 0, saleItemKey: "l1__0", saleSubmittedAtMs: 0,
  soldBy: "s1", soldByName: "Asha", fromAd: true, salesAdminId: "sa1",
  promise: null, penalties: [], penaltyTotal: 0, penaltyClips: 0,
  createdAt: at("2026-08-01T09:00:00"), updatedAt: at("2026-08-01T09:00:00"),
  ...over,
});

const orders = [
  // Not assigned: 2 promotional, 1 cinematic, 1 bulk cinematic, 1 social media month.
  order({ id: "o1", category: "promotional", status: "unassigned", businessName: "Promo One" }),
  order({ id: "o2", category: "promotional", status: "unassigned", businessName: "Promo Two" }),
  order({ id: "o3", category: "cinematic", status: "unassigned", businessName: "Cine One" }),
  order({ id: "o4", category: "bulk_ads", bulkAdType: "cinematic", quantity: 10, status: "unassigned", businessName: "Cine Bulk" }),
  order({ id: "o5", category: "social_media_management", status: "unassigned", businessName: "Smm One", fromAd: false }),
  // Assigned: 1 cinematic, 1 promotional.
  order({ id: "o6", category: "cinematic", status: "assigned", businessName: "Cine Assigned", workAssignmentId: "w1", assignedTo: "m1" }),
  order({ id: "o7", category: "promotional", status: "assigned", businessName: "Promo Assigned", workAssignmentId: "w2", assignedTo: "m1" }),
];

const assignments = [
  { id: "w1", orderId: "o6", assignedTo: "m1", status: "assigned", category: "cinematic" },
  { id: "w2", orderId: "o7", assignedTo: "m1", status: "assigned", category: "promotional" },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useFirestore", () => ({
  useFirestoreQuery: () => ({ data: orders, loading: false }),
  useFirestoreCollection: (name: string) => ({
    data: name === "work_assignments" ? assignments : [{ uid: "m1", name: "Jyothika", role: "tech_member", isActive: true }],
    loading: false,
  }),
}));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { uid: "ta1", name: "Tech Admin", role: "tech_admin" } }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/services/orders", () => ({
  activeOrdersQuery: () => null,
  notifyDueOrdersOnOpen: vi.fn(),
  findReconcilableOrders: () => [],
  reconcileManualOrders: vi.fn(),
  deleteOrders: vi.fn(),
  revertOrderToUnassigned: vi.fn(),
  removeOrderPenalty: vi.fn(),
}));
vi.mock("@/services/workAssign", () => ({ unassignWork: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const Orders = (await import("@/pages/tech-admin/Orders")).default;

afterEach(cleanup);
configure({ testIdAttribute: "data-test" });

const filter = () => screen.getByTestId("orders-category-filter") as HTMLSelectElement;
const optionTexts = () => Array.from(filter().options).map((o) => o.textContent);
const tabCount = (t: string) => screen.getByTestId(`orders-tab-${t}`).textContent;
/** Business names of the order cards on screen. */
const shownBusinesses = () =>
  Array.from(document.querySelectorAll("h3")).map((h) => h.textContent?.trim() || "");

describe("Orders queue — filter by kind of work", () => {
  it("opens on promotional ads — the pile the team is nearly always here for", () => {
    render(<Orders />);
    expect(filter().value).toBe("promotional");
    expect(shownBusinesses()).toEqual(["Promo One", "Promo Two"]);
  });

  it("offers only what is in the queue, each with its count", () => {
    render(<Orders />);
    // Not assigned holds 2 promotional, 2 cinematic (one of them bulk) and 1 social media month.
    // Busiest first; the two that tie fall back to alphabetical. Counts are of the whole tab, not
    // of the current filter — otherwise picking one would strand you on it.
    expect(optionTexts()).toEqual([
      "All services (5)",
      "Cinematic Ad (2)",
      "Promotional Ad (2)",
      "Social Media Management (Monthly) (1)",
      // Always offered even at zero — a filter you can only use in festival season is no filter.
      "Wishes (0)",
    ]);
  });

  it("shows only the chosen kind — and counts a bulk order under it", () => {
    render(<Orders />);
    fireEvent.change(filter(), { target: { value: "cinematic" } });
    expect(shownBusinesses()).toEqual(["Cine One", "Cine Bulk"]);
  });

  it("keeps the filter when you move to another tab", () => {
    render(<Orders />);
    fireEvent.change(filter(), { target: { value: "cinematic" } });
    fireEvent.click(screen.getByTestId("orders-tab-assigned"));
    expect(filter().value).toBe("cinematic");
    expect(shownBusinesses()).toEqual(["Cine Assigned"]);
  });

  it("makes the tab badges count what the filter would show", () => {
    render(<Orders />);
    // Opens on promotional: 2 of the 5 unassigned, 1 of the 2 assigned.
    expect(tabCount("unassigned")).toContain("2");
    expect(tabCount("assigned")).toContain("1");

    fireEvent.change(filter(), { target: { value: ALL_ORDER_CATEGORIES } });
    // A badge left on the unfiltered total would claim more work than the tab lists.
    expect(tabCount("unassigned")).toContain("5");
    expect(tabCount("assigned")).toContain("2");
  });

  it("says the filter is what emptied the tab, and offers the way out", () => {
    render(<Orders />);
    fireEvent.change(filter(), { target: { value: "social_media_management" } });
    fireEvent.click(screen.getByTestId("orders-tab-assigned"));
    // No social-media month has been assigned, so the option stays listed reading (0)...
    expect(optionTexts()).toContain("Social Media Management (Monthly) (0)");
    expect(shownBusinesses()).toEqual([]);
    // ...the empty state names the filter rather than claiming the tab is empty...
    expect(document.body.textContent).toContain("No assigned orders in Social Media Management");
    // ...and one click puts everything back.
    fireEvent.click(screen.getByText("Show all services"));
    expect(filter().value).toBe("all services");
    expect(shownBusinesses()).toEqual(["Cine Assigned", "Promo Assigned"]);
  });
});
