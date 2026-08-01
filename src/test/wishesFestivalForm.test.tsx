import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { CUSTOM_FESTIVAL_OPTION } from "@/utils/festivals";

/**
 * Capturing the occasion on the call, driven through the real Add Sale form.
 *
 * A wishes video with no occasion reaches the tech team as "make a greeting video" and someone has
 * to ring the client back to ask what for. The form asks while the sales member still has them on
 * the phone — and will not let the sale through without an answer.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });
const updateDoc = vi.fn();

const leads = [
  { id: "l1", phone: "9876543210", displayName: "Ravi", status: "answered",
    assignedTo: "u1", createdAt: at("2026-08-02T09:00:00") },
  {
    // An existing wishes sale, for the edit path. It already has its payment screenshot, so the
    // form's earlier gates are satisfied and the occasion is the one thing under test.
    id: "l2", phone: "9876543211", displayName: "Sita", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-08-02T09:00:00"),
    saleItems: [{
      category: "wishes", packageKey: "20 Seconds", amount: 499,
      verificationStatus: "pending", submittedAt: at("2026-08-02T10:00:00"),
      paymentScreenshotUrl: "https://example.test/paid.png",
      requirement: { language: "Telugu", festival: "Diwali", aspectRatio: "9:16" },
    }],
  },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc,
  deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: {
    now: () => at("2026-08-02T12:00:00"),
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

beforeEach(() => { vi.setSystemTime(new Date("2026-08-02T13:00:00")); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

configure({ testIdAttribute: "data-test" });

function openSaleForm(category: string) {
  render(<MyLeads />);
  fireEvent.click(screen.getAllByText("Add Sale")[0]);
  fireEvent.change(screen.getByTestId("sale-category"), { target: { value: category } });
}

/** Open the existing wishes sale in edit mode — its screenshot is already on file. */
function openWishesEdit() {
  render(<MyLeads />);
  fireEvent.click(screen.getAllByText("Edit")[0]);
}

const submitLabel = () => screen.getByText(/Add Sale —|Save changes —|to continue/).textContent;

describe("Add Sale — the occasion on a wishes video", () => {
  it("is asked for on a wishes sale and nowhere else", () => {
    openSaleForm("promotional");
    expect(screen.queryByTestId("sale-festival")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("sale-category"), { target: { value: "wishes" } });
    expect(screen.getByTestId("sale-festival")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("sale-category"), { target: { value: "cinematic" } });
    expect(screen.queryByTestId("sale-festival")).not.toBeInTheDocument();
  });

  it("offers the festivals the generator knows how to theme", () => {
    openSaleForm("wishes");
    const options = Array.from((screen.getByTestId("sale-festival") as HTMLSelectElement).options)
      .map((o) => o.value);
    expect(options).toContain("Diwali");
    expect(options).toContain("Ganesh Chaturthi");
    expect(options).toContain(CUSTOM_FESTIVAL_OPTION);
  });

  it("opens an existing sale on the occasion it was sold for", () => {
    openWishesEdit();
    expect((screen.getByTestId("sale-festival") as HTMLSelectElement).value).toBe("Diwali");
  });

  it("blocks the sale until an occasion is chosen", () => {
    openWishesEdit();
    expect(submitLabel()).toContain("Save changes —");
    fireEvent.change(screen.getByTestId("sale-festival"), { target: { value: "" } });
    expect(submitLabel()).toContain("Pick the occasion to continue");
  });

  it("lets the member type an occasion that is not on the list", () => {
    // A client can want a video for their shop's anniversary; the list saves typing, it does not
    // limit what can be sold.
    openWishesEdit();
    fireEvent.change(screen.getByTestId("sale-festival"), { target: { value: CUSTOM_FESTIVAL_OPTION } });
    expect(submitLabel()).toContain("Pick the occasion to continue");

    fireEvent.change(screen.getByTestId("sale-festival-custom"), { target: { value: "Shop 5th anniversary" } });
    expect(submitLabel()).toContain("Save changes —");
  });

  it("stores the occasion on the sale's brief", async () => {
    openWishesEdit();
    fireEvent.change(screen.getByTestId("sale-festival"), { target: { value: "Ganesh Chaturthi" } });
    updateDoc.mockClear();
    fireEvent.click(screen.getByText(/^Save changes —/));

    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const saved = updateDoc.mock.calls.at(-1)![1].saleItems[0];
    expect(saved.category).toBe("wishes");
    expect(saved.requirement.festival).toBe("Ganesh Chaturthi");
    // And the change is named in the sale's own edit log, not buried as "requirement updated".
    expect(saved.editLog.at(-1).changes).toContain("Occasion: Diwali → Ganesh Chaturthi");
  });
});
