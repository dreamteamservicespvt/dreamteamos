import { describe, it, expect, vi, beforeEach } from "vitest";
import { feedbackComplete } from "@/types";
import type { Order } from "@/types";

const updateDoc = vi.fn(async (_ref: unknown, _data: Record<string, unknown>) => undefined);
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, updateDoc, doc: vi.fn(() => ({})), serverTimestamp: () => "TS" };
});

const { canRecordFeedback, saveSaleFeedback } = await import("@/services/saleFeedback");

const order = (f: Partial<Order> = {}): Order =>
  ({ id: "o1", soldBy: "seller_1", status: "verified", ...f }) as Order;

const actor = (uid: string, role: Order["status"] extends never ? never : string) =>
  ({ uid, name: "Asha", role: role as never });

beforeEach(() => updateDoc.mockClear());

/**
 * Selling the next thing to somebody whose last ad you have not asked about is how a client who
 * was quietly unhappy gets pitched a ₹20,000 month. The gate is BOTH ratings.
 */
describe("feedbackComplete", () => {
  it("needs both halves", () => {
    expect(feedbackComplete(null)).toBe(false);
    expect(feedbackComplete({ work: "good" })).toBe(false);
    expect(feedbackComplete({ service: "bad" })).toBe(false);
    expect(feedbackComplete({ work: "good", service: "bad" })).toBe(true);
  });

  it("counts a bad rating as an answer — it is the most useful one", () => {
    expect(feedbackComplete({ work: "bad", service: "bad" })).toBe(true);
  });

  it("does not count a note as having asked", () => {
    expect(feedbackComplete({ notes: "rang twice, no answer" })).toBe(false);
  });
});

/**
 * The WORK rating is the tech team's report card and the SERVICE rating is ours. Both are readable
 * by the tech admin and the team leader — that is the point of showing it to them — but a rating of
 * your own department's work, entered by your own department, is not feedback.
 */
describe("who may record it", () => {
  it("lets the member who sold it", () => {
    expect(canRecordFeedback(order(), actor("seller_1", "sales_member"))).toBe(true);
  });

  it("lets a sales admin, who takes these calls when a member is out", () => {
    expect(canRecordFeedback(order(), actor("admin_1", "sales_admin"))).toBe(true);
  });

  it("does not let the tech admin or the team leader rate their own department", () => {
    expect(canRecordFeedback(order(), actor("t1", "tech_admin"))).toBe(false);
    expect(canRecordFeedback(order(), actor("t2", "tech_team_leader"))).toBe(false);
  });

  it("does not let another seller write on somebody else's client", () => {
    expect(canRecordFeedback(order(), actor("seller_2", "sales_member"))).toBe(false);
  });

  it("refuses a signed-out caller", () => {
    expect(canRecordFeedback(order(), null)).toBe(false);
    expect(canRecordFeedback(order(), { role: "sales_member" })).toBe(false);
  });
});

describe("saving", () => {
  /**
   * The row is filled in over one conversation, a field at a time — the status moves as the member
   * dials, the ratings come mid-call, the note afterwards. A replace would mean the note wiped the
   * ratings.
   */
  it("merges into what is already there rather than replacing it", async () => {
    await saveSaleFeedback({
      order: order({ feedback: { work: "good", status: "contacted" } }),
      patch: { service: "outstanding" },
      actor: actor("seller_1", "sales_member") as never,
    });
    expect(updateDoc.mock.calls[0]?.[1]).toMatchObject({
      feedback: { work: "good", service: "outstanding", status: "contacted", byName: "Asha" },
    });
  });

  it("stores a blank note as nothing, not as an empty string", async () => {
    await saveSaleFeedback({
      order: order(),
      patch: { notes: "   " },
      actor: actor("seller_1", "sales_member") as never,
    });
    expect((updateDoc.mock.calls[0]?.[1] as { feedback: { notes: unknown } }).feedback.notes).toBeNull();
  });

  it("writes nothing at all when the caller may not", async () => {
    const res = await saveSaleFeedback({
      order: order(),
      patch: { work: "outstanding" },
      actor: actor("t1", "tech_admin") as never,
    });
    expect(res.ok).toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("says who recorded it, so a row on a shared page is answerable to a person", async () => {
    await saveSaleFeedback({
      order: order(),
      patch: { work: "bad" },
      actor: actor("seller_1", "sales_member") as never,
    });
    expect(updateDoc.mock.calls[0]?.[1]).toMatchObject({
      feedback: { by: "seller_1", byName: "Asha" },
    });
  });
});
