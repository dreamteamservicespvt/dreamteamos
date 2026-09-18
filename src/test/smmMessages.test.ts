/**
 * What the client is actually sent.
 *
 * These messages go out to paying customers under the company's name, so the two things pinned here
 * are that every placeholder gets filled — a report reaching a client with `{leads}` still in it is
 * worse than no report — and that the figures quoted match the ones the team is looking at.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEMPLATES, approvalChaseMessage, approvalRequestMessage, budgetTopUpMessage,
  dailyAdReportMessage, extraWorkMessage, monthlyReportMessage, renderTemplate, renewalMessage,
} from "@/utils/smmMessages";
import { blankItem, cycleFromStart } from "@/utils/smmPlan";
import type { SmmAdRun, SmmCampaign, SmmContentItem } from "@/types/smm";

function item(over: Partial<SmmContentItem> = {}): SmmContentItem {
  return { ...blankItem("poster", ["instagram", "facebook"]), ...over };
}

const run: SmmAdRun = {
  id: "r1", name: "Dussehra push", scope: { kind: "all", itemIds: [] },
  startDate: "2026-09-10", days: 5, dailyBudget: 300, status: "running", reports: [],
};

function campaign(over: Partial<SmmCampaign> = {}): SmmCampaign {
  return {
    id: "c1", orderId: "c1", leadId: "l1", saleItemKey: "l1__0",
    clientPhone: "+919000000000", clientPhoneId: "919000000000",
    clientName: "Ravi", businessName: "Sri Lakshmi Jewellers",
    packageKey: "Pro Package", packageLabel: "Pro Package", amount: 20000,
    cycle: cycleFromStart("2026-09-01"),
    platforms: ["instagram", "facebook"],
    commitments: { poster: 2, ai_ad: 2, real_video: 0 },
    items: [], ads: [], budgetPayments: [],
    team: { creator: null, publisher: null, marketer: null, assistants: [] },
    soldBy: "seller", soldByName: "Anita", salesAdminId: null,
    watchers: ["seller"], status: "active",
    renewal: { state: "none" },
    ...over,
  };
}

/** Nothing may leave with a placeholder still in it. */
const noPlaceholders = (text: string) => expect(text).not.toMatch(/\{[a-zA-Z]+\}/);

describe("renderTemplate", () => {
  it("fills what it knows", () => {
    expect(renderTemplate("Hello {client} of {business}", { client: "Ravi", business: "Sri Lakshmi" }))
      .toBe("Hello Ravi of Sri Lakshmi");
  });

  it("leaves an unknown placeholder visible rather than silently deleting the line", () => {
    // A typo has to show up in the preview. Blanking it produces a sentence with a hole in it that
    // reads as finished, which is how one goes out.
    expect(renderTemplate("Hi {clint}", { client: "Ravi" })).toBe("Hi {clint}");
  });

  it("copes with a template that has no placeholders at all", () => {
    expect(renderTemplate("Thank you!", {})).toBe("Thank you!");
  });
});

describe("approval request", () => {
  it("names the piece, when it goes up and where, and says we wait for their yes", () => {
    const text = approvalRequestMessage(campaign(), item({
      title: "Dussehra offer", uploadDate: "2026-09-22", uploadTime: "18:30",
    }));
    noPlaceholders(text);
    expect(text).toContain("Dussehra offer");
    expect(text).toContain("22 Sep 2026");
    expect(text).toContain("18:30");
    expect(text).toContain("Instagram, Facebook");
    expect(text).toMatch(/only after your approval/i);
  });

  it("still reads properly for a piece with no title or date yet", () => {
    noPlaceholders(approvalRequestMessage(campaign(), item()));
  });
});

describe("daily ad report", () => {
  it("quotes the day's own figures", () => {
    const text = dailyAdReportMessage(campaign(), run, {
      date: "2026-09-12", leads: 14, spend: 300, costPerResult: 21.43, reach: 4210,
      byName: "Kiran", at: null,
    });
    noPlaceholders(text);
    expect(text).toContain("12 Sep 2026");
    expect(text).toContain("14");
    expect(text).toContain("₹300");
    expect(text).toContain("4,210");
  });
});

describe("monthly report", () => {
  const withMonth = campaign({
    items: [
      item({ kind: "poster", status: "posted" }),
      item({ kind: "poster", status: "planned" }),
      item({ kind: "ai_ad", status: "posted" }),
      item({ kind: "ai_ad", status: "posted" }),
      item({ kind: "poster", status: "posted", extra: true, extraCharge: "free" }),
    ],
    ads: [{ ...run, reports: [
      { date: "2026-09-10", leads: 10, spend: 300, costPerResult: 30, byName: "K", at: null },
      { date: "2026-09-11", leads: 6, spend: 300, costPerResult: 50, byName: "K", at: null },
    ] }],
  });

  it("reports delivery against what was committed, and the ads against what was spent", () => {
    const text = monthlyReportMessage(withMonth);
    noPlaceholders(text);
    expect(text).toContain("3 of 4");
    expect(text).toContain("16 leads");
    expect(text).toContain("₹600");
  });

  it("mentions extra work given free — the best sentence in a renewal conversation", () => {
    expect(monthlyReportMessage(withMonth)).toMatch(/1 at no charge/);
  });

  it("names the days spent waiting for approvals, for every client and not only difficult ones", () => {
    const day = 86_400_000;
    const waited = campaign({
      ...withMonth,
      items: [item({ approval: { state: "approved", askedAt: Date.now() - 6 * day, respondedAt: Date.now(), chases: [] } })],
    });
    expect(monthlyReportMessage(waited)).toMatch(/6 days were spent waiting for approvals/);
  });

  it("says nothing about waiting when nobody was kept waiting", () => {
    expect(monthlyReportMessage(campaign({ items: [item()] }))).not.toMatch(/waiting for approvals/);
  });
});

describe("renewal", () => {
  it("asks for next month by showing what this one delivered", () => {
    const text = renewalMessage(campaign({
      cycle: cycleFromStart("2026-09-01"),
      items: [item({ status: "posted" }), item()],
      commitments: { poster: 2, ai_ad: 0, real_video: 0 },
    }));
    noPlaceholders(text);
    expect(text).toContain("1 of 2");
    expect(text).toContain("30 Sep 2026");
  });
});

describe("extra work", () => {
  it("says there is no charge when it was given", () => {
    const text = extraWorkMessage(campaign(), item({ title: "Bonus reel", extra: true, extraCharge: "free" }));
    noPlaceholders(text);
    expect(text).toMatch(/no charge/i);
  });

  it("quotes the amount when it is being charged", () => {
    const text = extraWorkMessage(campaign(), item({ title: "Bonus reel", extra: true, extraCharge: "billed", extraAmount: 500 }));
    noPlaceholders(text);
    expect(text).toContain("₹500");
  });

  it("promises to confirm rather than inventing a figure when none is set", () => {
    const text = extraWorkMessage(campaign(), item({ title: "Bonus reel", extra: true, extraCharge: "unbilled" }));
    noPlaceholders(text);
    expect(text).toMatch(/confirm the charge/i);
  });
});

describe("chasing and topping up", () => {
  it("chases politely, with the number of days on it", () => {
    const text = approvalChaseMessage(campaign(), item({ title: "Dussehra offer" }), 4);
    noPlaceholders(text);
    expect(text).toContain("4 days");
  });

  it("asks for a top-up with the balance and tomorrow's need", () => {
    const c = campaign({
      budgetPayments: [{ id: "p", amount: 200, at: null, byName: "Anita" }],
      ads: [{ ...run, startDate: "2026-09-12", days: 3, dailyBudget: 500 }],
    });
    const text = budgetTopUpMessage(c, "2026-09-12");
    noPlaceholders(text);
    expect(text).toContain("₹200");
    expect(text).toContain("₹500");
  });
});

describe("the built-in library", () => {
  it("has a default for every kind, so the feature works with nothing configured", () => {
    for (const body of Object.values(DEFAULT_TEMPLATES)) {
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });
});
