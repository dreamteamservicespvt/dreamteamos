import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * A payment's day, driven through the real My Leads page and sale form (2026-10-15, audit item 6).
 *
 * A balance was stamped with the moment it was typed in, so money collected on 9 Oct and recorded on
 * 10 Oct counted in the October pay period (revenue and incentive). An edit could re-date the advance to the
 * edit, and unticking "Advance collected" dropped a recorded balance and moved its money to the sale day.
 */

configure({ testIdAttribute: "data-test" });

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const SALE_DAY = at("2026-10-01T10:00:00");
const leads = [
  {
    // Half paid at the sale on 1 Oct — 5,000 still to collect.
    id: "l1", phone: "9876543210", displayName: "Ravi", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-10-15T09:00:00"),
    saleItems: [{
      saleId: "l1_1", category: "promotional", packageKey: "p1", amount: 10000, verificationStatus: "verified",
      submittedAt: SALE_DAY, paymentScreenshotUrl: "https://example.test/paid.png",
      partialPayment: true, payments: [{ id: "adv", amount: 5000, collectedAt: SALE_DAY }],
    }],
  },
  {
    // Advance on 1 Oct, a balance of 3,000 on 9 Oct, 2,000 still owed.
    id: "l2", phone: "9876543211", displayName: "Sita", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-10-15T09:00:00"),
    saleItems: [{
      saleId: "l2_1", category: "promotional", packageKey: "p1", amount: 10000, verificationStatus: "verified",
      submittedAt: SALE_DAY, paymentScreenshotUrl: "https://example.test/paid.png",
      partialPayment: true,
      payments: [
        { id: "adv", amount: 5000, collectedAt: SALE_DAY },
        { id: "bal", amount: 3000, collectedAt: at("2026-10-09T12:00:00") },
      ],
    }],
  },
  {
    // Paid in full at the sale.
    id: "l3", phone: "9876543212", displayName: "Gopi", status: "answered", saleDone: true,
    assignedTo: "u1", createdAt: at("2026-10-15T09:00:00"),
    saleItems: [{
      saleId: "l3_1", category: "promotional", packageKey: "p1", amount: 999, verificationStatus: "verified",
      submittedAt: SALE_DAY, paymentScreenshotUrl: "https://example.test/paid.png",
    }],
  },
];

const toast = vi.fn();
const mutateSaleItems = vi.fn(async (leadId: string, _ids: string[], fn: (it: unknown) => unknown) => {
  const lead = leads.find((l) => l.id === leadId)!;
  return { lead, changed: [{ item: fn(lead.saleItems[0]) }] };
});
const updateSale = vi.fn(async (p: { next: unknown }) => ({ changed: true, changes: [{ text: "x", money: true }], item: p.next, itemIndex: 0, hasWork: false, orderId: "o1" }));

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: {
    now: () => ({ seconds: Math.floor(Date.now() / 1000) }),
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000) }),
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
  watchAdLanguages: () => () => {}, rememberAdLanguage: vi.fn(), mergeAdLanguages: (a: string[] | null) => a ?? ["Telugu"],
}));
vi.mock("@/services/activityLog", () => ({ logActivity: vi.fn() }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn() }));
vi.mock("@/services/numberLock", () => ({
  claimNumber: vi.fn(), applySaleFreeze: vi.fn(), releaseLockForLead: vi.fn(),
  buildLeadFreezeFields: vi.fn(), fetchNumberLock: async () => null, clearSaleFreeze: vi.fn(), clearedLeadFreezeFields: vi.fn(),
}));
vi.mock("@/services/orders", () => ({ upsertOrderForSale: vi.fn(), cancelOrderForSale: vi.fn(), addOrderUpdateNote: vi.fn(), orderDocId: () => "o1" }));
vi.mock("@/services/sales", () => ({
  recordSale: vi.fn(), updateSale, deleteSale: vi.fn(), deleteLeadWithSales: vi.fn(), mutateSaleItems,
  isSaleWriteError: () => false,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/components/sales/NumberTimelineButton", () => ({ default: () => null }));

const MyLeads = (await import("@/pages/sales-member/MyLeads")).default;
const { useSalesLeadsStore } = await import("@/store/salesLeadsStore");

function renderMyLeads() {
  useSalesLeadsStore.getState().setLeads("u1", leads as never);
  return render(<MemoryRouter><MyLeads /></MemoryRouter>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 11, 0)); // 15 Oct 2026
  toast.mockClear();
  mutateSaleItems.mockClear();
  updateSale.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const dayOf = (ts: { seconds: number }) => {
  const d = new Date(ts.seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("Collect payment — Collected on", () => {
  async function openCollectFor(name: string) {
    renderMyLeads();
    fireEvent.click(await screen.findByText(/Pending payments ·/));
    const row = (await screen.findAllByTestId("pending-payment-row")).find((r) => r.textContent?.includes(name))!;
    fireEvent.click(row.querySelector('[data-test="pending-collect"]')!);
    return screen.findByTestId("collect-payment");
  }

  it("records the day the member gives, in that day's pay period", async () => {
    await openCollectFor("Ravi");
    expect((screen.getByTestId("collect-day") as HTMLInputElement).value).toBe("2026-10-15");
    fireEvent.change(screen.getByTestId("collect-day"), { target: { value: "2026-10-09" } });
    expect(screen.getByTestId("collect-payment").textContent).toMatch(/September 2026/);
    fireEvent.click(screen.getByTestId("collect-save"));
    await waitFor(() => expect(mutateSaleItems).toHaveBeenCalled());
    const saved = (mutateSaleItems.mock.results[0].value as Promise<{ changed: { item: { payments: { collectedAt: { seconds: number } }[] } }[] }>);
    const item = (await saved).changed[0].item;
    expect(dayOf(item.payments.at(-1)!.collectedAt)).toBe("2026-10-09");
  });

  it("will not take a day before the sale or after today", async () => {
    await openCollectFor("Ravi");
    fireEvent.change(screen.getByTestId("collect-day"), { target: { value: "2026-09-29" } });
    expect(screen.getByTestId("collect-day-problem").textContent).toMatch(/before the sale/);
    expect((screen.getByTestId("collect-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("collect-day"), { target: { value: "2026-10-16" } });
    expect(screen.getByTestId("collect-day-problem").textContent).toMatch(/future/);
  });
});

describe("editing a sale keeps its payments where they are", () => {
  /** Opens the edit form on the sale of the lead with this name. */
  async function editSaleOf(name: string) {
    renderMyLeads();
    const edits = await screen.findAllByText("Edit");
    // The Edit button inside the card showing this client's number (the cards show the number).
    const phone = leads.find((l) => l.displayName === name)!.phone;
    const target = edits.find((e) => {
      let node: HTMLElement | null = e as HTMLElement;
      for (let i = 0; i < 12 && node; i += 1, node = node.parentElement) {
        const text = node.textContent || "";
        if (leads.some((l) => l.phone !== phone && text.includes(l.phone))) return false;
        if (text.includes(phone)) return true;
      }
      return false;
    });
    fireEvent.click(target!);
    return screen.findByTestId("advance-block");
  }

  it("refuses to switch a sale with a recorded balance back to paid in full", async () => {
    await editSaleOf("Sita");
    const toggle = screen.getByTestId("advance-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    // The advance alone — not the 8,000 collected in all, which used to be saved as the advance again.
    expect((screen.getByTestId("advance-amount") as HTMLInputElement).value).toBe("5000");
    expect(screen.getByTestId("advance-later-payments").textContent).toMatch(/3,000/);
    fireEvent.click(toggle);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Can't switch to paid in full" }));
    expect((screen.getByTestId("advance-toggle") as HTMLInputElement).checked).toBe(true);
  });

  it("dates an advance ticked on an edit to the sale, under the id the sale's money already had", async () => {
    await editSaleOf("Gopi");
    // A sale paid in full opens with the payment section closed.
    fireEvent.click(screen.getByTestId("advance-block-toggle"));
    fireEvent.click(screen.getByTestId("advance-toggle"));
    fireEvent.change(screen.getByTestId("advance-amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByText(/^Save changes/));
    await waitFor(() => expect(updateSale).toHaveBeenCalled());
    const next = updateSale.mock.calls.at(-1)![0].next as { payments: { id: string; collectedAt: { seconds: number } }[] };
    expect(next.payments[0].id).toBe("pay_opening");
    expect(dayOf(next.payments[0].collectedAt)).toBe("2026-10-01");
  });
});
