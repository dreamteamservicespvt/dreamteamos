import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * The Revenue tile on My Leads showed nothing on a day the member had actually sold.
 *
 * It read the leads CREATED that day rather than the sales MADE that day, and counted only sales a
 * sales admin had already approved — which never happens the same day. This drives the real page so
 * both halves of that are pinned where a member would see them, and covers the split the tile now
 * opens: "how many 499, how many 999".
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const leads = [
  {
    // Assigned last week, sold TODAY — the case that used to show nothing at all.
    id: "l1", phone: "9876543210", displayName: "Ravi", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-07-20T09:00:00"),
    saleItems: [
      { category: "promotional", packageKey: "p1", amount: 999, verificationStatus: "pending", submittedAt: at("2026-07-28T11:00:00") },
    ],
  },
  {
    id: "l2", phone: "9876543211", displayName: "Sita", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-07-28T08:00:00"),
    saleItems: [
      { category: "promotional", packageKey: "p0", amount: 499, verificationStatus: "verified", submittedAt: at("2026-07-28T10:00:00") },
      { category: "wishes", packageKey: "w0", amount: 499, verificationStatus: "pending", submittedAt: at("2026-07-28T12:00:00") },
      // Yesterday's sale must not land in today's total.
      { category: "cinematic", packageKey: "c1", amount: 1999, verificationStatus: "verified", submittedAt: at("2026-07-27T10:00:00") },
    ],
  },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), serverTimestamp: vi.fn(), Timestamp: { now: () => at("2026-07-28T12:00:00") },
  onSnapshot: (_q: unknown, next: (snap: unknown) => void) => {
    next({ docs: leads.map((l) => ({ id: l.id, data: () => l })) });
    return () => {};
  },
}));
// One stable object, not a fresh one per render: the page subscribes on `user`, so a new
// reference each render would resubscribe forever.
const AUTH = { user: { uid: "u1", name: "Jyothika", role: "sales_member" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/duplicateLeads", () => ({
  findMemberDuplicates: async () => ({}),
  resolveNonSaleDuplicates: async () => ({ resolvedMyLeadIds: new Set(), frozeMineCount: 0, wonCount: 0 }),
}));
vi.mock("@/services/adLanguages", () => ({ watchAdLanguages: () => () => {}, rememberAdLanguage: vi.fn(), mergeAdLanguages: (a: string[]) => a }));
vi.mock("@/services/activityLog", () => ({ logActivity: vi.fn() }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn() }));
vi.mock("@/services/numberLock", () => ({
  claimNumber: vi.fn(), applySaleFreeze: vi.fn(), releaseLockForLead: vi.fn(),
  buildLeadFreezeFields: vi.fn(), fetchNumberLock: vi.fn(), clearSaleFreeze: vi.fn(), clearedLeadFreezeFields: vi.fn(),
}));
vi.mock("@/services/orders", () => ({ upsertOrderForSale: vi.fn(), cancelOrderForSale: vi.fn(), addOrderUpdateNote: vi.fn(), orderDocId: () => "o1" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/components/sales/NumberTimelineButton", () => ({ default: () => null }));

const MyLeads = (await import("@/pages/sales-member/MyLeads")).default;

/**
 * MyLeads reads the query string — an upsell arriving from My Clients deep-links to a lead with
 * the sale form open — so it needs a Router, exactly as it has in the app.
 */
function renderMyLeads() {
  return render(<MemoryRouter><MyLeads /></MemoryRouter>);
}


beforeEach(() => {
  vi.setSystemTime(new Date("2026-07-28T13:00:00"));
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

// This codebase marks test hooks with `data-test`, not `data-testid`.
configure({ testIdAttribute: "data-test" });

const revenueCard = () => screen.getByTestId("revenue-card");

describe("My Leads — the day's revenue", () => {
  it("shows today's money, including a sale made on an older lead", () => {
    renderMyLeads();
    // 999 (old lead, today) + 499 + 499 = 1,997. Yesterday's 1,999 is excluded.
    expect(revenueCard().textContent).toContain("₹1,997");
  });

  it("counts a sale the moment it is made, not when an admin approves it", () => {
    renderMyLeads();
    // Only ₹499 has been approved so far; the tile still shows the full 1,997 and says so.
    expect(revenueCard().textContent).toContain("₹499 verified");
  });

  it("opens the split by ticket price when tapped", () => {
    renderMyLeads();
    fireEvent.click(revenueCard());

    const modal = screen.getByTestId("revenue-breakdown");
    expect(within(modal).getByText("₹1,997")).toBeInTheDocument();
    expect(within(modal).getByText(/3 sales/)).toBeInTheDocument();

    const rows = within(modal).getAllByText(/× \d+/).map((n) => n.parentElement!.textContent);
    // Biggest ticket first: one 999, then two 499s.
    expect(rows[0]).toContain("₹999");
    expect(rows[0]).toContain("× 1");
    expect(rows[1]).toContain("₹499");
    expect(rows[1]).toContain("× 2");
  });

  it("names the categories sold at each price", () => {
    renderMyLeads();
    fireEvent.click(revenueCard());
    const modal = screen.getByTestId("revenue-breakdown");
    expect(within(modal).getByText(/Promotional Ad, Wishes|Wishes, Promotional Ad/)).toBeInTheDocument();
  });

  it("separates approved money from money still awaiting approval", () => {
    renderMyLeads();
    fireEvent.click(revenueCard());
    const modal = screen.getByTestId("revenue-breakdown");
    expect(within(modal).getByText(/₹499 verified/)).toBeInTheDocument();
    expect(within(modal).getByText(/₹1,498 awaiting approval/)).toBeInTheDocument();
  });

  it("closes again", () => {
    renderMyLeads();
    fireEvent.click(revenueCard());
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByTestId("revenue-breakdown")).not.toBeInTheDocument();
  });
});
