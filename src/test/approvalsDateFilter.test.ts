import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { decidedAtMs } from "@/utils/saleDecision";

/**
 * "What did I approve yesterday?"
 *
 * The approvals queue dated a decided sale by `lead.lastUpdated` — the last time ANYTHING happened
 * to the lead: a note, a call logged, another sale added, a status change. So picking Yesterday
 * listed sales approved weeks earlier whose lead happened to be touched yesterday, and hid sales
 * approved yesterday on a lead touched since. The admin checking their own work was reading a list
 * of leads that moved, not of sales they decided.
 *
 * The rule now: a decision is dated by its own stamp — `verifiedAt` for an approval, `rejectedAt`
 * for a rejection — and only falls back to the lead for rows decided before those stamps existed.
 */

const ts = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });

/** The screen's own formatting of the shared rule — the rule itself is imported, not copied. */
function decidedDateStr(li: {
  item: { verificationStatus?: string; verifiedAt?: unknown; rejectedAt?: unknown };
  lead: { lastUpdated?: { seconds?: number } };
}): string | null {
  const ms = decidedAtMs(li.item, li.lead);
  return ms ? format(new Date(ms), "dd/MM/yyyy") : null;
}

describe("dating an approved sale", () => {
  /** The exact report: approved three weeks ago, lead edited yesterday. */
  it("uses the approval, not the last edit to the lead", () => {
    const row = {
      item: { verificationStatus: "verified", verifiedAt: ts("2026-07-22T11:00:00Z") },
      lead: { lastUpdated: ts("2026-08-13T18:00:00Z") },
    };
    expect(decidedDateStr(row)).toBe("22/07/2026");
  });

  /** And the mirror image: approved yesterday, lead touched again today. */
  it("keeps yesterday's approval in yesterday", () => {
    const row = {
      item: { verificationStatus: "verified", verifiedAt: ts("2026-08-13T09:30:00Z") },
      lead: { lastUpdated: ts("2026-08-14T08:00:00Z") },
    };
    expect(decidedDateStr(row)).toBe("13/08/2026");
  });
});

describe("dating a rejected sale", () => {
  /**
   * Rejection clears `verifiedAt`, so before `rejectedAt` existed a rejection had no stamp at all
   * and could only be dated by the lead — the same bug, with no fallback to catch it.
   */
  it("uses its own rejection stamp", () => {
    const row = {
      item: { verificationStatus: "rejected", verifiedAt: null, rejectedAt: ts("2026-08-13T15:00:00Z") },
      lead: { lastUpdated: ts("2026-08-14T10:00:00Z") },
    };
    expect(decidedDateStr(row)).toBe("13/08/2026");
  });

  it("never reads a stale approval stamp on a rejected row", () => {
    // A sale approved, then rejected: verifiedAt may still be set on older documents.
    const row = {
      item: { verificationStatus: "rejected", verifiedAt: ts("2026-07-01T10:00:00Z"), rejectedAt: ts("2026-08-13T10:00:00Z") },
      lead: { lastUpdated: ts("2026-08-14T10:00:00Z") },
    };
    expect(decidedDateStr(row)).toBe("13/08/2026");
  });
});

describe("rows decided before the stamps existed", () => {
  /** Imperfect, but visible. Dropping them would hide real history behind an empty list. */
  it("falls back to the lead rather than vanishing", () => {
    const row = {
      item: { verificationStatus: "verified" },
      lead: { lastUpdated: ts("2026-06-02T10:00:00Z") },
    };
    expect(decidedDateStr(row)).toBe("02/06/2026");
  });

  it("returns nothing when there is no date anywhere", () => {
    expect(decidedDateStr({ item: { verificationStatus: "verified" }, lead: {} })).toBeNull();
  });
});
