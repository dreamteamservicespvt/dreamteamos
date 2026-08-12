import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Selling ten cinematic ads at once, driven through the real Add Sale form.
 *
 * The pricing is the whole point of the feature: the kind of video decides the price list, the
 * quantity multiplies it, and the discount comes off in whichever unit the member was quoting in.
 * Getting any of those wrong under-charges a real client, so they are pinned here at the level a
 * member actually touches them rather than only in the pricing helper.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const updateDoc = vi.fn();

const leads = [
  {
    id: "l1", phone: "9876543210", displayName: "Ravi", status: "answered",
    assignedTo: "u1", createdAt: at("2026-08-01T09:00:00"),
  },
  {
    // A bulk order already recorded, for the edit path.
    id: "l2", phone: "9876543211", displayName: "Sita", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-08-01T09:00:00"),
    saleItems: [{
      category: "bulk_ads", bulkAdType: "cinematic", packageKey: "30 Seconds + Poster",
      quantity: 10, unitAmount: 1999, suggestedDiscountPercent: 10, discountPercent: 10,
      discountMode: "percent", discountAmount: 1999, discountEdited: false,
      amount: 17991, verificationStatus: "pending", submittedAt: at("2026-08-01T10:00:00"),
      paymentScreenshotUrl: "https://example.test/paid.png",
    }],
  },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc,
  deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: {
    now: () => at("2026-08-01T12:00:00"),
    // The delivery promise is built from this on save.
    fromMillis: (ms: number) => ({ seconds: Math.floor(ms / 1000) }),
  },
  onSnapshot: (_q: unknown, next: (snap: unknown) => void) => {
    next({ docs: leads.map((l) => ({ id: l.id, data: () => l })) });
    return () => {};
  },
}));
const AUTH = { user: { uid: "u1", name: "Jyothika", role: "sales_member" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/duplicateLeads", () => ({
  findMemberDuplicates: async () => ({}),
  resolveNonSaleDuplicates: async () => ({ resolvedMyLeadIds: new Set(), frozeMineCount: 0, wonCount: 0 }),
}));
vi.mock("@/services/adLanguages", () => ({
  watchAdLanguages: () => () => {},
  rememberAdLanguage: vi.fn(),
  // The form opens with `mergeAdLanguages(null)`, so this has to answer with the base list.
  mergeAdLanguages: (a: string[] | null) => a ?? ["Telugu", "Hindi", "English"],
}));
vi.mock("@/services/activityLog", () => ({ logActivity: vi.fn() }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn() }));
vi.mock("@/services/numberLock", () => ({
  claimNumber: vi.fn(), applySaleFreeze: vi.fn(), releaseLockForLead: vi.fn(),
  buildLeadFreezeFields: vi.fn(), fetchNumberLock: async () => null, clearSaleFreeze: vi.fn(),
  clearedLeadFreezeFields: vi.fn(),
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


beforeEach(() => { vi.setSystemTime(new Date("2026-08-01T13:00:00")); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

configure({ testIdAttribute: "data-test" });

/** Open Add Sale on the one lead and switch it to a bulk order. */
function openBulkForm() {
  renderMyLeads();
  fireEvent.click(screen.getAllByText("Add Sale")[0]);
  const category = screen.getByTestId("sale-category") as HTMLSelectElement;
  fireEvent.change(category, { target: { value: "bulk_ads" } });
  return category;
}

const total = () => screen.getByTestId("bulk-total").textContent;

describe("Add Sale — bulk videos", () => {
  it("asks which kind of video before anything else", () => {
    openBulkForm();
    const type = screen.getByTestId("bulk-type") as HTMLSelectElement;
    expect(Array.from(type.options).map((o) => o.value)).toEqual(["wishes", "promotional", "cinematic"]);
    expect(type.value).toBe("promotional");
  });

  it("prices the chosen kind at its own list price", () => {
    openBulkForm();
    fireEvent.change(screen.getByTestId("bulk-type"), { target: { value: "cinematic" } });
    const pkg = screen.getByTestId("sale-package") as HTMLSelectElement;
    // Cinematic's own price list, not the promotional one this category used to be locked to.
    expect(pkg.textContent).toContain("₹3,999");
    fireEvent.change(pkg, { target: { value: "30 Seconds + Poster" } });
    fireEvent.change(screen.getByTestId("bulk-quantity"), { target: { value: "10" } });
    // 10 × ₹1,999 = ₹19,990, less the ladder's 10% = ₹17,991.
    expect(total()).toBe("₹17,991");
  });

  it("switching the kind clears a package that belonged to the old one", () => {
    openBulkForm();
    const pkg = () => screen.getByTestId("sale-package") as HTMLSelectElement;
    fireEvent.change(pkg(), { target: { value: "30 Seconds + Poster" } });
    expect(pkg().value).toBe("30 Seconds + Poster");
    fireEvent.change(screen.getByTestId("bulk-type"), { target: { value: "wishes" } });
    expect(pkg().value).toBe("");
    // Wishes has its own two packages, and no "30 Seconds + Poster" among them.
    expect(Array.from(pkg().options).map((o) => o.value)).toEqual(["", "20 Seconds", "40 Seconds"]);
  });

  it("takes a discount in rupees and caps it at 20% of the order", () => {
    openBulkForm();
    fireEvent.change(screen.getByTestId("sale-package"), { target: { value: "30 Seconds + Poster" } });
    fireEvent.change(screen.getByTestId("bulk-quantity"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("bulk-discount-mode-amount"));

    // Gross is 10 × ₹999 = ₹9,990.
    fireEvent.change(screen.getByTestId("bulk-discount"), { target: { value: "1500" } });
    expect(total()).toBe("₹8,490");

    // ₹9,000 off a ₹9,990 order is not a discount, it is a giveaway: clamped to ₹1,998.
    fireEvent.change(screen.getByTestId("bulk-discount"), { target: { value: "9000" } });
    expect(total()).toBe("₹7,992");
  });

  it("drops the bulk arithmetic when a bulk sale is edited into a single video", async () => {
    // The old item is spread onto the edited one, so without an explicit strip the quantity and
    // discount survived a category change and the order kept announcing itself as "×10".
    renderMyLeads();
    updateDoc.mockClear();
    fireEvent.click(screen.getAllByText("Edit")[0]);
    fireEvent.change(screen.getByTestId("sale-category"), { target: { value: "cinematic" } });
    fireEvent.change(screen.getByTestId("sale-package"), { target: { value: "30 Seconds + Poster" } });
    fireEvent.click(screen.getByText(/^Save changes/));

    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const saved = updateDoc.mock.calls.at(-1)![1].saleItems[0];
    expect(saved.category).toBe("cinematic");
    expect(saved.amount).toBe(1999);
    for (const key of ["quantity", "bulkAdType", "unitAmount", "discountPercent", "discountAmount", "discountMode", "discountEdited"]) {
      expect(saved).not.toHaveProperty(key);
    }
  });

  it("asks which festival a bulk WISHES order is for", () => {
    // Ten Diwali videos are still ten Diwali videos — the occasion decides what gets built.
    openBulkForm();
    expect(screen.queryByTestId("sale-festival")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("bulk-type"), { target: { value: "wishes" } });
    expect(screen.getByTestId("sale-festival")).toBeInTheDocument();
  });

  it("converts what is already typed when the unit is switched", () => {
    openBulkForm();
    fireEvent.change(screen.getByTestId("sale-package"), { target: { value: "30 Seconds + Poster" } });
    fireEvent.change(screen.getByTestId("bulk-quantity"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("bulk-discount"), { target: { value: "15" } });
    const at15 = total();

    fireEvent.click(screen.getByTestId("bulk-discount-mode-amount"));
    // The box now reads ₹1,499 rather than 15, and the client still pays the same.
    expect((screen.getByTestId("bulk-discount") as HTMLInputElement).value).toBe("1499");
    expect(total()).toBe(at15);
  });
});
