/**
 * Editing a sale (2026-10-08) — utils/saleEdit: what changed (and which lines are money), whose change
 * wins when the form's copy is older than the sale, what cannot change once the tech team has started,
 * what reaches the job, and what each person on the tech side is told.
 */
import { describe, it, expect } from "vitest";
import {
  saleChangeList, describeSaleChanges, mergeSaleEdit, sameSaleValue, saleHasWork, lockedServiceChange,
  jobPatchForSaleEdit, saleEditNotice,
} from "@/utils/saleEdit";
import type { Order, SaleDetail, WorkAssignment } from "@/types";

const sale = (over: Partial<SaleDetail> = {}): SaleDetail => ({
  saleId: "lead1_1000",
  category: "promotional",
  packageKey: "30 Seconds + Poster",
  amount: 999,
  verificationStatus: "pending",
  paymentScreenshotUrl: "https://img/a.png",
  requirement: { businessName: "Sri Sai Silks", language: "Telugu", aspectRatio: "9:16", modelGender: "female", attireType: "traditional", notes: "" },
  ...over,
}) as SaleDetail;

describe("saleChangeList — the edit log, with money marked", () => {
  it("names what changed and marks price, discount and payment lines as money", () => {
    const prev = sale();
    const next = sale({ amount: 1299, requirement: { ...prev.requirement!, language: "English", businessName: "Sri Sai Sarees" } });
    const list = saleChangeList(prev, next);
    expect(list).toEqual(expect.arrayContaining([
      { text: "Amount: ₹999 → ₹1,299", money: true },
      { text: "Language: Telugu → English", money: false },
      { text: "Business: Sri Sai Silks → Sri Sai Sarees", money: false },
    ]));
    expect(describeSaleChanges(prev, next)).toContain("Language: Telugu → English");
  });

  it("notices the edits it used to throw away as 'no changes'", () => {
    const prev = sale();
    // The advance collected, and the payment screenshot.
    expect(describeSaleChanges(prev, sale({ partialPayment: true, payments: [{ id: "p", amount: 500, collectedAt: null }] })))
      .toContain("Payment: paid in full → ₹500 advance");
    expect(describeSaleChanges(prev, sale({ paymentScreenshotUrl: "https://img/b.png" }))).toContain("Payment screenshot replaced");
    // A Custom sale's length, a month's video length, a custom character's description.
    expect(describeSaleChanges(sale({ customDurationSeconds: 120 }), sale({ customDurationSeconds: 180 }))).toContain("Length: 2 min → 3 min");
    expect(describeSaleChanges(
      sale({ category: "social_media_management", smm: { clipsPerVideo: 4 } as never }),
      sale({ category: "social_media_management", smm: { clipsPerVideo: 6 } as never }),
    )).toContain("Video length: 4 clips → 6 clips");
    expect(describeSaleChanges(
      sale({ requirement: { customCharacter: "a lion" } as never }),
      sale({ requirement: { customCharacter: "a tiger" } as never }),
    )).toContain("Custom character description updated");
  });

  it("says nothing when nothing changed", () => {
    expect(saleChangeList(sale(), sale())).toEqual([]);
  });
});

describe("mergeSaleEdit — only what the form changed is laid on the sale as it is now", () => {
  it("keeps an approval, a penalty and a balance that arrived while the form was open", () => {
    const base = sale({ partialPayment: true, payments: [{ id: "adv", amount: 500, collectedAt: null }] });
    const fresh = {
      ...base,
      verificationStatus: "verified" as const,
      penaltyTotal: 200,
      payments: [{ id: "adv", amount: 500, collectedAt: null }, { id: "bal", amount: 499, collectedAt: null }],
    };
    const next = { ...base, requirement: { ...base.requirement!, notes: "Bigger logo" } };
    const merged = mergeSaleEdit(fresh, base, next);
    expect(merged.verificationStatus).toBe("verified");
    expect(merged.penaltyTotal).toBe(200);
    expect(merged.payments?.map((p) => p.id)).toEqual(["adv", "bal"]);
    expect(merged.requirement?.notes).toBe("Bigger logo");
  });

  it("the form owns the advance: a changed advance keeps later balances", () => {
    const base = sale({ partialPayment: true, payments: [{ id: "adv", amount: 500, collectedAt: null }] });
    const fresh = { ...base, payments: [{ id: "adv", amount: 500, collectedAt: null }, { id: "bal", amount: 200, collectedAt: null }] };
    const next = { ...base, payments: [{ id: "adv", amount: 700, collectedAt: null }] };
    expect(mergeSaleEdit(fresh, base, next).payments).toEqual([
      { id: "adv", amount: 700, collectedAt: null }, { id: "bal", amount: 200, collectedAt: null },
    ]);
  });

  it("removes a field the form removed (a bulk sale edited into one video), and never takes its identity", () => {
    const base = sale({ category: "bulk_ads", quantity: 10, bulkAdType: "cinematic" });
    const { quantity: _q, bulkAdType: _b, ...single } = base;
    const next = { ...single, category: "cinematic", saleId: "something_else" } as SaleDetail;
    const merged = mergeSaleEdit(base, base, next);
    expect(merged).not.toHaveProperty("quantity");
    expect(merged).not.toHaveProperty("bulkAdType");
    expect(merged.category).toBe("cinematic");
    expect(merged.saleId).toBe("lead1_1000");
  });

  it("compares values, not key order or timestamp shape", () => {
    expect(sameSaleValue({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(sameSaleValue({ t: { seconds: 1, nanoseconds: 0 } }, { t: { toMillis: () => 1000 } })).toBe(true);
    expect(sameSaleValue(undefined, null)).toBe(true);
    expect(sameSaleValue({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("work started: deletion blocked, the service locked", () => {
  it("knows when the tech side has started", () => {
    expect(saleHasWork(null)).toBe(false);
    expect(saleHasWork({ status: "unassigned" } as Order)).toBe(false);
    expect(saleHasWork({ status: "cancelled" } as Order)).toBe(false);
    for (const status of ["assigned", "completed", "verified"] as const) expect(saleHasWork({ status } as Order)).toBe(true);
    // A cancelled order whose job is still out is work too.
    expect(saleHasWork({ status: "cancelled", workAssignmentId: "w1" } as Order)).toBe(true);
  });

  it("locks what the job IS, and nothing else", () => {
    const fresh = sale();
    expect(lockedServiceChange(fresh, sale({ category: "website" }))).toMatch(/service can't change/);
    expect(lockedServiceChange(sale({ category: "bulk_ads", quantity: 10, bulkAdType: "promotional" }), sale({ category: "bulk_ads", quantity: 6, bulkAdType: "promotional" })))
      .toMatch(/number of videos/);
    expect(lockedServiceChange(sale({ category: "bulk_ads", bulkAdType: "promotional" }), sale({ category: "bulk_ads", bulkAdType: "cinematic" })))
      .toMatch(/kind of video/);
    expect(lockedServiceChange(fresh, sale({ packageKey: "1 Minute + Poster", amount: 1999, requirement: { language: "Hindi" } as never }))).toBeNull();
  });
});

describe("jobPatchForSaleEdit — only what the edit changed reaches the job", () => {
  const order = (req: Record<string, unknown>, over: Partial<Order> = {}): Order => ({
    id: "o_lead1_1000", category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
    clientPhone: "+919876543210", businessName: "Sri Sai Silks",
    requirement: { businessName: "Sri Sai Silks", language: "Telugu", aspectRatio: "9:16", modelGender: "female", attireType: "traditional", ...req },
    ...over,
  }) as Order;
  const job = { category: "promotional", language: "Telugu", aspectRatio: "16:9", businessName: "Sri Sai Silks", duration: "30 sec" } as WorkAssignment;

  it("writes the changed fields and leaves the tech side's own changes alone", () => {
    const patch = jobPatchForSaleEdit(order({}), order({ language: "Hindi", notes: "Show the offer" }), job);
    expect(patch).toMatchObject({ language: "Hindi", requirementNotes: "Show the offer" });
    // The team leader moved the job to 16:9; a language change does not move it back.
    expect(patch).not.toHaveProperty("aspectRatio");
    expect(patch).not.toHaveProperty("businessName");
  });

  it("a longer package makes a longer job, at its rate", () => {
    const patch = jobPatchForSaleEdit(order({}), order({}, { packageKey: "1 Minute + Poster", amount: 1999 }), job);
    expect(patch.duration).toBeTruthy();
    expect(patch.duration).not.toBe("30 sec");
    expect(typeof patch.clipCount).toBe("number");
    expect(patch).toHaveProperty("pricePerUnit");
  });

  it("writes nothing when nothing the job carries changed", () => {
    expect(jobPatchForSaleEdit(order({}), order({}, { amount: 1299 }), job)).toEqual({});
  });
});

describe("saleEditNotice — what each person is told", () => {
  const changes = [{ text: "Amount: ₹999 → ₹1,299", money: true }, { text: "Language: Telugu → Hindi", money: false }];

  it("the tech admin reads every change; a member and a team leader never see money", () => {
    const admin = saleEditNotice({ audience: "tech_admin", business: "Sri Sai Silks", uniqueId: "P012", editorName: "Anil", changes });
    const member = saleEditNotice({ audience: "tech_member", business: "Sri Sai Silks", uniqueId: "P012", editorName: "Anil", changes });
    const leader = saleEditNotice({ audience: "tech_team_leader", business: "Sri Sai Silks", uniqueId: "P012", editorName: "Anil", changes });
    expect(admin.lines).toEqual(["Amount: ₹999 → ₹1,299", "Language: Telugu → Hindi"]);
    expect(member.lines).toEqual(["Language: Telugu → Hindi"]);
    expect(leader.lines).toEqual(["Language: Telugu → Hindi"]);
    expect(member.title).toBe("Sale updated — Sri Sai Silks");
    expect(member.message).toMatch(/\(P012\): Language: Telugu → Hindi\. Your job now shows the new details/);
    expect(member.message).not.toMatch(/₹/);
  });

  it("a price-only edit still tells everybody — and says the work does not change", () => {
    const n = saleEditNotice({ audience: "tech_member", business: "Sri Sai Silks", editorName: "Anil", changes: [changes[0]] });
    expect(n.message).toMatch(/nothing changes in the work/);
    expect(n.message).not.toMatch(/₹/);
  });
});
