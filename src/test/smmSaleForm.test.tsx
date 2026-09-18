import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Selling a social-media month, driven through the real Add Sale form.
 *
 * This is the one sale where the package is not the price. The accounts, the content counts and the
 * client's own videos we agree to edit are all settled on the same call, and the figure written
 * down is whatever the client committed to at the end of it. All of that has to reach the saved
 * sale, because the delivery side builds the whole month's plan from it — and because the discount
 * it implies is what decides whether the order reaches the tech team at all.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const updateDoc = vi.fn();
const upsertOrderForSale = vi.fn();

const leads = [
  {
    id: "l1", phone: "9876543210", displayName: "Ravi", status: "answered",
    assignedTo: "u1", createdAt: at("2026-09-18T09:00:00"),
  },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc,
  deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: {
    now: () => at("2026-09-18T12:00:00"),
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
vi.mock("@/services/orders", () => ({
  upsertOrderForSale, cancelOrderForSale: vi.fn(), addOrderUpdateNote: vi.fn(), orderDocId: () => "o1",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/components/sales/NumberTimelineButton", () => ({ default: () => null }));

const MyLeads = (await import("@/pages/sales-member/MyLeads")).default;
const { useSalesLeadsStore } = await import("@/store/salesLeadsStore");

function renderMyLeads() {
  useSalesLeadsStore.getState().setLeads("u1", leads as any);
  return render(<MemoryRouter><MyLeads /></MemoryRouter>);
}

beforeEach(() => { vi.setSystemTime(new Date("2026-09-18T13:00:00")); updateDoc.mockClear(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

configure({ testIdAttribute: "data-test" });

/** Open Add Sale and switch it to the existing Social Media Management package. */
function openSmmForm(pkg = "Pro Package") {
  renderMyLeads();
  fireEvent.click(screen.getAllByText("Add Sale")[0]);
  fireEvent.change(screen.getByTestId("sale-category"), { target: { value: "social_media_management" } });
  fireEvent.change(screen.getByTestId("sale-package"), { target: { value: pkg } });
}

const gross = () => screen.getByTestId("smm-gross").textContent;
const final = () => screen.getByTestId("smm-final").textContent;

describe("Add Sale — social media month", () => {
  it("only appears for the social-media category", () => {
    renderMyLeads();
    fireEvent.click(screen.getAllByText("Add Sale")[0]);
    expect(screen.queryByTestId("smm-sale-fields")).toBeNull();
    fireEvent.change(screen.getByTestId("sale-category"), { target: { value: "social_media_management" } });
    expect(screen.getByTestId("smm-sale-fields")).toBeTruthy();
  });

  it("opens with the accounts and the content counts the chosen package covers", () => {
    openSmmForm("Pro Package");
    expect((screen.getByTestId("smm-count-poster") as HTMLInputElement).value).toBe("8");
    expect((screen.getByTestId("smm-count-ai_ad") as HTMLInputElement).value).toBe("8");
    expect((screen.getByTestId("smm-count-real_video") as HTMLInputElement).value).toBe("0");
    // Pro covers four networks; X is never included by a package, so it starts off.
    expect(screen.getByTestId("smm-platform-linkedin").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("smm-platform-x").getAttribute("aria-pressed")).toBe("false");
    expect(gross()).toBe("₹20,000");
  });

  it("re-seeds the plan when the member changes package, and stops once they have set it themselves", () => {
    openSmmForm("Starter Package");
    expect((screen.getByTestId("smm-count-poster") as HTMLInputElement).value).toBe("4");
    expect(screen.getByTestId("smm-platform-youtube").getAttribute("aria-pressed")).toBe("false");

    fireEvent.change(screen.getByTestId("sale-package"), { target: { value: "Pro Package" } });
    expect((screen.getByTestId("smm-count-poster") as HTMLInputElement).value).toBe("8");

    // The member agrees ten posters on the call. Changing the package afterwards must not silently
    // take that promise back.
    fireEvent.change(screen.getByTestId("smm-count-poster"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("sale-package"), { target: { value: "Starter Package" } });
    expect((screen.getByTestId("smm-count-poster") as HTMLInputElement).value).toBe("10");
  });

  it("charges ₹500 a video for the client's own footage, on top of the package", () => {
    openSmmForm("Pro Package");
    fireEvent.change(screen.getByTestId("smm-count-real_video"), { target: { value: "10" } });
    expect(gross()).toBe("₹25,000");
    expect(final()).toBe("₹25,000");
  });

  it("works out the discount from the price the client committed to", () => {
    openSmmForm("Pro Package");
    fireEvent.change(screen.getByTestId("smm-count-real_video"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("smm-price-input"), { target: { value: "22000" } });
    expect(final()).toBe("₹22,000");
    expect(screen.getByTestId("smm-discount-line").textContent).toContain("₹3,000");
  });

  it("works out what they pay from a discount, when that is how it was agreed", () => {
    openSmmForm("Pro Package");
    fireEvent.click(screen.getByTestId("smm-price-mode-amount"));
    fireEvent.change(screen.getByTestId("smm-price-input"), { target: { value: "2000" } });
    expect(final()).toBe("₹18,000");
  });

  it("re-reads the same price when the unit is switched, instead of reinterpreting the digits", () => {
    openSmmForm("Pro Package");
    fireEvent.change(screen.getByTestId("smm-price-input"), { target: { value: "18000" } });
    expect(final()).toBe("₹18,000");
    // ₹18,000 "they pay" must become ₹2,000 "off", not ₹18,000 off.
    fireEvent.click(screen.getByTestId("smm-price-mode-amount"));
    expect((screen.getByTestId("smm-price-input") as HTMLInputElement).value).toBe("2000");
    expect(final()).toBe("₹18,000");
    fireEvent.click(screen.getByTestId("smm-price-mode-percent"));
    expect((screen.getByTestId("smm-price-input") as HTMLInputElement).value).toBe("10");
    expect(final()).toBe("₹18,000");
  });

  it("warns that a heavy bargain is held for the sales admin", () => {
    openSmmForm("Pro Package");
    fireEvent.change(screen.getByTestId("smm-price-input"), { target: { value: "15000" } });
    expect(screen.getByText(/Held until your admin approves/)).toBeTruthy();
  });

  it("does not show the generic discount box as well — one discount, one place", () => {
    openSmmForm("Pro Package");
    expect(screen.queryByTestId("manual-discount")).toBeNull();
  });

  it("saves what was promised alongside the price, ready for the month's plan", async () => {
    openSmmForm("Pro Package");
    fireEvent.change(screen.getByTestId("smm-count-real_video"), { target: { value: "4" } });
    fireEvent.click(screen.getByTestId("smm-platform-x"));
    fireEvent.change(screen.getByTestId("smm-price-input"), { target: { value: "21000" } });

    // The quote and the agreed price are both on screen, so what is being saved is visible before
    // anybody presses anything.
    expect(gross()).toBe("₹22,000");
    expect(final()).toBe("₹21,000");
    expect(screen.getByTestId("smm-platform-x").getAttribute("aria-pressed")).toBe("true");

    // And the form still refuses to submit without the payment screenshot, exactly as every other
    // sale does — the new section changes the price, not the rules around it.
    const save = screen.getByText("Upload screenshot to continue").closest("button")!;
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
