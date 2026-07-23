import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));

import { orderDocId, nextWorkUniqueId, findReconcilableOrders } from "@/services/orders";
import type { Order, SaleDetail, WorkAssignment } from "@/types";

describe("orderDocId (idempotency key)", () => {
  it("keys on submittedAt so it survives saleItems index shifts", () => {
    const item = { submittedAt: { seconds: 1_700_000_000 } } as SaleDetail;
    expect(orderDocId("lead1", item, 0)).toBe("o_lead1_1700000000000");
    expect(orderDocId("lead1", item, 5)).toBe("o_lead1_1700000000000"); // index doesn't change the id
  });

  it("falls back to the index key when there is no submittedAt", () => {
    expect(orderDocId("lead1", {} as SaleDetail, 2)).toBe("o_lead1__2");
  });
});

describe("nextWorkUniqueId", () => {
  const wa = (uniqueId: string) => ({ uniqueId } as WorkAssignment);

  it("starts each ad category at 001 with the right prefix", () => {
    expect(nextWorkUniqueId("promotional", [])).toBe("P001");
    expect(nextWorkUniqueId("cinematic", [])).toBe("C001");
    expect(nextWorkUniqueId("wishes", [])).toBe("W001");
  });

  it("uses the O prefix for non-ad categories", () => {
    expect(nextWorkUniqueId("website", [])).toBe("O001");
    expect(nextWorkUniqueId("logo", [])).toBe("O001");
  });

  it("increments past the highest existing id of the same prefix", () => {
    const existing = [wa("P001"), wa("P003"), wa("C002"), wa("W009")];
    expect(nextWorkUniqueId("promotional", existing)).toBe("P004");
    expect(nextWorkUniqueId("cinematic", existing)).toBe("C003");
    expect(nextWorkUniqueId("wishes", existing)).toBe("W010");
  });
});

describe("findReconcilableOrders (queue cleanup)", () => {
  const order = (f: Partial<Order>): Order => ({
    id: "o1", clientPhone: "+919876543210", category: "promotional", status: "unassigned",
    workAssignmentId: null, ...f,
  } as Order);
  const work = (phone: string, category = "promotional"): WorkAssignment =>
    ({ businessWhatsapp: phone, category } as WorkAssignment);

  it("flags an unassigned order whose client+category already has manual work", () => {
    const orders = [order({ clientPhone: "+919876543210", category: "promotional" })];
    const found = findReconcilableOrders(orders, [work("9876543210", "promotional")]);
    expect(found).toHaveLength(1);
  });

  it("matches regardless of phone formatting", () => {
    const orders = [order({ clientPhone: "+91 98765 43210" })];
    expect(findReconcilableOrders(orders, [work("9876543210")])).toHaveLength(1);
  });

  it("does not flag when the category differs", () => {
    const orders = [order({ category: "cinematic" })];
    expect(findReconcilableOrders(orders, [work("9876543210", "promotional")])).toHaveLength(0);
  });

  it("only touches unassigned, unlinked orders", () => {
    const assignments = [work("9876543210")];
    expect(findReconcilableOrders([order({ status: "assigned" })], assignments)).toHaveLength(0);
    expect(findReconcilableOrders([order({ workAssignmentId: "w1" })], assignments)).toHaveLength(0);
  });

  it("leaves an order with no matching manual work alone", () => {
    const orders = [order({ clientPhone: "+919999999999" })];
    expect(findReconcilableOrders(orders, [work("9876543210")])).toHaveLength(0);
  });
});
