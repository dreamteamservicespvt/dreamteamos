import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));

import { orderDocId, nextWorkUniqueId } from "@/services/orders";
import type { SaleDetail, WorkAssignment } from "@/types";

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
