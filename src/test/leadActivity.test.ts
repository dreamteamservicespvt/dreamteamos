import { describe, it, expect } from "vitest";
import { leadActivityMs, leadActivityDay } from "@/utils/leadActivity";
import type { Lead } from "@/types";

/**
 * Which day a lead belongs to in My Leads.
 *
 * The reported problem: a number claimed three weeks ago and sold to this morning stayed in the
 * three-week-old bucket, so after every upsell the seller had to switch the day filter to "All
 * days" and search the number by hand. On an upsell round — where every sale is against an old
 * number — that was the entire workflow.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "l1",
  createdAt: at("2026-07-20T09:00:00"),
  ...over,
} as unknown as Lead);

describe("when a lead was last worked", () => {
  it("is the day it arrived when nothing has happened to it", () => {
    expect(leadActivityDay(lead())).toBe("2026-07-20");
  });

  /** The fix, stated plainly. */
  it("moves to the day of the sale when one is recorded", () => {
    const l = lead({
      saleItems: [{ submittedAt: at("2026-08-12T15:30:00") }] as never,
    });
    expect(leadActivityDay(l)).toBe("2026-08-12");
  });

  it("uses the most recent sale when there are several", () => {
    const l = lead({
      saleItems: [
        { submittedAt: at("2026-07-25T10:00:00") },
        { submittedAt: at("2026-08-12T15:30:00") },
        { submittedAt: at("2026-08-01T10:00:00") },
      ] as never,
    });
    expect(leadActivityDay(l)).toBe("2026-08-12");
  });

  /** A fresh lead nobody has touched must still show on the day it arrived — it is the call list. */
  it("never moves earlier than the day it arrived", () => {
    const l = lead({
      createdAt: at("2026-08-12T09:00:00"),
      saleItems: [{ submittedAt: at("2026-07-01T10:00:00") }] as never,
    });
    expect(leadActivityDay(l)).toBe("2026-08-12");
  });

  it("reads the legacy single-sale shape too", () => {
    const l = lead({ saleDetails: { submittedAt: at("2026-08-12T15:30:00") } as never });
    expect(leadActivityDay(l)).toBe("2026-08-12");
  });

  /**
   * `updatedAt` deliberately does NOT count. It moves for things nobody would call activity — a
   * freeze expiring, a backfill touching the row — and would shuffle the day list for reasons the
   * seller cannot see.
   */
  it("ignores bookkeeping touches", () => {
    const l = lead({ lastUpdated: at("2026-08-12T15:30:00") as never });
    expect(leadActivityDay(l)).toBe("2026-07-20");
  });

  it("says nothing rather than guessing when there is no usable stamp", () => {
    expect(leadActivityMs({ id: "x" } as unknown as Lead)).toBe(0);
    expect(leadActivityDay({ id: "x" } as unknown as Lead)).toBe("");
  });

  it("handles the millisecond timestamp shape as well as the seconds one", () => {
    const l = lead({ createdAt: { toMillis: () => Date.parse("2026-08-05T10:00:00") } as never });
    expect(leadActivityDay(l)).toBe("2026-08-05");
  });
});
