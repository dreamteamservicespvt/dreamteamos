/**
 * One commission rule, two payout channels, and the money's own days — 2026-10-15
 * (owner: "Payroll's rule everywhere").
 *
 * 4. A revoked and re-approved sale is never settled twice (first approval kept; settlements record keys).
 * 5. Commission counts in the pay period the money was COLLECTED, at the rate that applied then, only past
 *    75% of that period's target — on every screen; Settlements and Sales Payroll never pay the same money.
 * 6. A payment is dated the day it was collected; an edit never drops or moves a recorded balance.
 * 9. / 10. / 11. P&L, revenue charts and the work day read one rule each.
 *
 * Pure rules plus the real hooks and pages on the in-memory Firestore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

configure({ testIdAttribute: "data-test" });

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
vi.mock("@/services/auditLog", () => ({ recordAudit: vi.fn(async () => undefined) }));
const AUTH: { user: Record<string, unknown> } = { user: { uid: "salesadmin", name: "Sam", role: "sales_admin" } };
vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(AUTH), { getState: () => AUTH }),
}));
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const mem = await import("./memoryFirestore");
const { collectionsOf, periodIncentive, commissionInWindow, settlementCoverage } = await import("@/utils/salesPay");
const { payPeriodForMonth } = await import("@/utils/payrollEngine");
const { useSalesMemberPay } = await import("@/hooks/useSalesMemberPay");
const { default: Settlements } = await import("@/pages/sales-admin/Settlements");
const { default: RevenueOverview } = await import("@/pages/main-admin/RevenueOverview");
const { keepFirstApproval } = await import("@/utils/saleDecision");
const { collectedAtFor, collectedOnProblem, paymentEvents } = await import("@/utils/salePayments");
const { mergeSaleEdit, paymentEditRefusal } = await import("@/utils/saleEdit");
const { salesBookedByDay, salesBookedByOwner } = await import("@/utils/salesRevenue");

import type { AppUser, CommissionSettlement, Lead, SaleDetail } from "@/types";

const ts = (y: number, m: number, d: number, h = 11) => mem.Timestamp.fromDate(new Date(y, m - 1, d, h));
const SEPT = payPeriodForMonth("2026-09", 10);
const sale = (amount: number, y: number, m: number, d: number, extra: Partial<SaleDetail> = {}): SaleDetail =>
  ({ category: "promotional", packageKey: "p", amount, verificationStatus: "verified", submittedAt: ts(y, m, d), ...extra } as SaleDetail);
const seller = (uid: string, extra: Partial<AppUser> = {}): AppUser =>
  ({ uid, name: uid, role: "sales_member", salary: 0, isActive: true, createdBy: "salesadmin", ...extra } as AppUser);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 11, 0)); // 15 Oct 2026
  mem.__reset();
  AUTH.user = { uid: "salesadmin", name: "Sam", role: "sales_admin" };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

// ── 5. The rule ──────────────────────────────────────────────────────────────────────────────────

describe("a period's incentive under the one rule", () => {
  const leads = [{ id: "l1", assignedTo: "sita", saleItems: [sale(20000, 2026, 9, 15), sale(15000, 2026, 9, 20)] }] as unknown as Lead[];

  it("decides the 75% gate on ALL the period's money, and pays only what nobody has paid", () => {
    const collections = collectionsOf(leads);
    const first = collections[0].key;
    // Target 1,000/day → 30,000 for 10 Sep → 9 Oct; 35,000 collected = 117% — earned.
    const r = periodIncentive({ collections, period: SEPT, rate: 5, dailyTarget: 1000, exclude: [first] });
    expect(r.salesBase).toBe(35000);
    expect(r.settledBase).toBe(20000);
    expect(r.payableBase).toBe(15000);
    expect(r.commission).toBe(750);
    // Under 75%: nothing, and it says so.
    const low = periodIncentive({ collections, period: SEPT, rate: 5, dailyTarget: 2000 });
    expect(low.commission).toBe(0);
    expect(low.withheld).toBe(true);
  });

  it("gives a window the period's rate on the money collected in it, gated by the whole period", () => {
    const collections = collectionsOf(leads);
    const terms = (p: string) => ({ rate: p === "2026-09" ? 10 : 5, dailyTarget: 1000 });
    expect(commissionInWindow({ collections, from: "2026-09-20", to: "2026-09-20", termsFor: terms }).commission).toBe(1500);
    expect(commissionInWindow({ collections, from: "2026-09-20", to: "2026-09-20", termsFor: () => ({ rate: 10, dailyTarget: 5000 }) }).commission).toBe(0);
  });
});

describe("Sales Payroll leaves out what Settlements paid", () => {
  it("pays only the collections no settlement covered, and records which it left out", async () => {
    mem.__seed("leads/l1", { assignedTo: "sita", saleItems: [sale(20000, 2026, 9, 15), sale(15000, 2026, 9, 20)] });
    const firstKey = collectionsOf([{ id: "l1", assignedTo: "sita", saleItems: [sale(20000, 2026, 9, 15), sale(15000, 2026, 9, 20)] }] as unknown as Lead[])[0].key;
    mem.__seed("commission_settlements/s1", { memberId: "sita", amount: 1000, periods: ["2026-09"], paidKeys: [firstKey], paidAt: ts(2026, 10, 11) });
    const { result } = renderHook(() => useSalesMemberPay([seller("sita")], "2026-09"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const row = result.current.rows[0];
    expect(row.salesBase).toBe(35000);
    expect(row.settledBase).toBe(20000);
    expect(row.settledKeys).toEqual([firstKey]);
    expect(row.commission).toBe(750);
  });

  it("Sales Payroll opens on September (due) and says what Settlements already paid", async () => {
    mem.__seed("users/sita", { uid: "sita", name: "Sita", role: "sales_member", isActive: true, salary: 0, createdBy: "salesadmin" });
    mem.__seed("leads/l1", { assignedTo: "sita", saleItems: [sale(20000, 2026, 9, 15), sale(15000, 2026, 9, 20)] });
    const firstKey = collectionsOf([{ id: "l1", assignedTo: "sita", saleItems: [sale(20000, 2026, 9, 15), sale(15000, 2026, 9, 20)] }] as unknown as Lead[])[0].key;
    mem.__seed("commission_settlements/s1", { memberId: "sita", amount: 1000, periods: ["2026-09"], paidKeys: [firstKey], paidAt: ts(2026, 10, 11) });
    const { default: SalesPayroll } = await import("@/pages/sales-admin/Payroll");
    render(<SalesPayroll />);
    expect(await screen.findByText("September 2026 (10 Sep – 09 Oct)")).toBeTruthy();
    expect(screen.getByTestId("payroll-period-state").textContent).toBe("Due now");
    fireEvent.click(await screen.findByText("Sita"));
    expect((await screen.findByTestId("sales-payroll-settled")).textContent).toMatch(/₹20,000/);
  });

  it("does not flag a payment made before this rule existed", async () => {
    mem.__seed("leads/l1", { assignedTo: "sita", saleItems: [sale(20000, 2026, 9, 15, { verifiedAt: ts(2026, 9, 16) })] });
    // An older settlement (no keys) paid it on 20 Sep; Sales Payroll then also paid the period, by the old code.
    mem.__seed("commission_settlements/old", { memberId: "sita", amount: 1000, paidAt: ts(2026, 9, 20) });
    mem.__seed("payroll_lines/2026-09_sita", {
      month: "2026-09", memberId: "sita", netSalary: 1000, paymentStatus: "completed",
      computation: { monthlySalary: 0, lines: [], adjustmentTotal: 0, absentDays: 0, halfDays: 0, unpaidLeaveDays: 0, dailySalary: 0 },
      incentive: { salesBase: 20000, rate: 5, amount: 1000 },
    });
    const { result } = renderHook(() => useSalesMemberPay([seller("sita")], "2026-09"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows[0].changedSincePaid).toBe(false);
  });
});

describe("Settlements — pays ended periods, never one Sales Payroll paid", () => {
  it("lists the periods, pays the due one and records its periods and collections", async () => {
    mem.__seed("users/sita", { name: "Sita", role: "sales_member", isActive: true, createdBy: "salesadmin", salary: 0 });
    mem.__seed("leads/l1", { assignedTo: "sita", saleItems: [sale(10000, 2026, 8, 20), sale(4000, 2026, 9, 15), sale(6000, 2026, 10, 12)] });
    // August went with the salary in Sales Payroll.
    mem.__seed("payroll_lines/2026-08_sita", { month: "2026-08", memberId: "sita", netSalary: 500, paymentStatus: "completed" });
    render(<MemoryRouter><Settlements /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Sita"));

    const rows = await screen.findAllByTestId("commission-period");
    expect(rows.map(r => r.getAttribute("data-status"))).toEqual(["running", "due", "payroll"]);
    expect(screen.getByTestId("settlement-due").textContent).toBe("₹200");

    fireEvent.click(screen.getByTestId("settlement-pay"));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByText("Mark as paid"));
    await waitFor(() => expect(mem.__all("commission_settlements")).toHaveLength(1));
    const settlement = mem.__all("commission_settlements")[0] as unknown as CommissionSettlement;
    expect(settlement.periods).toEqual(["2026-09"]);
    expect(settlement.amount).toBe(200);
    expect(settlement.paidKeys).toHaveLength(1);
  });
});

// ── 4. A re-approval keeps the first approval ────────────────────────────────────────────────────

describe("the first approval stamp", () => {
  it("is set once and survives a revoke, a rejection and a re-approval", () => {
    const now = { seconds: 2 };
    expect(keepFirstApproval({}, now)).toEqual({ firstVerifiedAt: now });                       // first approval
    expect(keepFirstApproval({ verifiedAt: { seconds: 1 } })).toEqual({ firstVerifiedAt: { seconds: 1 } }); // revoke
    expect(keepFirstApproval({ firstVerifiedAt: { seconds: 1 } }, now)).toEqual({ firstVerifiedAt: { seconds: 1 } }); // re-approval
    expect(keepFirstApproval({})).toEqual({});                                                   // never approved
  });

  it("keeps a legacy settlement's sale settled after a re-approval", () => {
    const legacy = [{ memberId: "m1", paidAt: { seconds: Math.floor(new Date(2026, 7, 25).getTime() / 1000) } }] as unknown as CommissionSettlement[];
    const reApproved = { ...sale(8000, 2026, 8, 20), verifiedAt: ts(2026, 10, 14), firstVerifiedAt: ts(2026, 8, 21) };
    const lead = [{ id: "l1", assignedTo: "m1", saleItems: [reApproved] }] as unknown as Lead[];
    expect(settlementCoverage(legacy, collectionsOf(lead)).size).toBe(1);
  });
});

// ── 6. The money's own day ───────────────────────────────────────────────────────────────────────

describe("the day a payment was collected", () => {
  it("must be on or after the sale and not in the future", () => {
    const ctx = { saleDay: "2026-10-01", today: "2026-10-15" };
    expect(collectedOnProblem("2026-10-09", ctx)).toBeNull();
    expect(collectedOnProblem("2026-09-30", ctx)).toMatch(/before the sale/);
    expect(collectedOnProblem("2026-10-16", ctx)).toMatch(/future/);
    expect(collectedOnProblem("", ctx)).toMatch(/Pick/);
  });

  it("is stamped on that day — the moment itself only when it is today", () => {
    const now = new Date(2026, 9, 15, 18, 30);
    expect(collectedAtFor("2026-10-15", now)).toBe(now);
    const back = collectedAtFor("2026-10-09", now);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours()]).toEqual([2026, 9, 9, 12]);
  });

  it("gives the money taken at a sale one identity, recorded or not", () => {
    expect(paymentEvents(sale(999, 2026, 10, 1))[0].id).toBe("opening");
    expect(paymentEvents(sale(999, 2026, 10, 1, { partialPayment: true, payments: [{ id: "pay_opening", amount: 999, collectedAt: ts(2026, 10, 1) }] }))[0].id).toBe("opening");
  });
});

describe("editing a sale never drops or moves a balance", () => {
  const withBalance = sale(10000, 2026, 10, 1, {
    partialPayment: true,
    payments: [
      { id: "adv", amount: 5000, collectedAt: ts(2026, 10, 1) },
      { id: "bal", amount: 3000, collectedAt: ts(2026, 10, 9) },
    ],
  });

  it("refuses switching it back to paid in full", () => {
    const merged = mergeSaleEdit(withBalance, withBalance, { ...withBalance, partialPayment: false, payments: null });
    expect(paymentEditRefusal(withBalance, merged)).toMatch(/can't be switched back to "paid in full"/);
  });

  it("keeps the balance, on its own day, when the advance is edited", () => {
    const next = { ...withBalance, payments: [{ id: "adv", amount: 6000, collectedAt: ts(2026, 10, 1) }] };
    const merged = mergeSaleEdit(withBalance, withBalance, next);
    expect(paymentEditRefusal(withBalance, merged)).toBeNull();
    expect(merged.payments!.map(p => [p.id, p.amount])).toEqual([["adv", 6000], ["bal", 3000]]);
  });
});

// ── 10. Revenue by the sale's own day ────────────────────────────────────────────────────────────

describe("revenue charts", () => {
  const leads = [
    { id: "l1", assignedTo: "sita", lastUpdated: ts(2026, 10, 14), saleItems: [
      sale(999, 2026, 10, 10, { submittedAt: mem.Timestamp.fromDate(new Date(2026, 9, 10, 0, 30)) }), // 00:30 local
      sale(500, 2026, 10, 11, { verificationStatus: "rejected" }),
    ] },
    { id: "l2", assignedTo: "gopi", saleDone: true, saleDetails: sale(1999, 2026, 10, 12) }, // the legacy shape
  ] as unknown as Lead[];

  it("dates each sale by its own local day, across saleItems and the legacy shape, rejected left out", () => {
    expect([...salesBookedByDay(leads)].sort()).toEqual([["2026-10-10", 999], ["2026-10-12", 1999]]);
    expect(salesBookedByOwner(leads).get("sita")).toBe(999);
  });

  it("the Accounts Dashboard's net profit is one pay period's revenue − expenses − salaries & incentives", async () => {
    // Running period on 15 Oct: 10 Oct → 9 Nov.
    mem.__seed("users/t1", { role: "tech_member", name: "T", isActive: true, salary: 31000, createdBy: "techadmin" });
    mem.__seed("leads/l1", { assignedTo: "x", saleItems: [sale(50000, 2026, 10, 12), sale(70000, 2026, 9, 20)] });
    mem.__seed("expenses/e1", { date: "2026-10-12", category: "Rent", amount: 4000 });
    mem.__seed("expenses/e2", { date: "2026-09-01", category: "Rent", amount: 9999 });
    const { default: AccountsDashboard } = await import("@/pages/accounts-admin/Dashboard");
    render(<AccountsDashboard />);
    expect((await screen.findByTestId("accounts-period")).textContent).toBe("10 Oct – 09 Nov 2026");
    const net = (await screen.findByText("Net Profit")).parentElement!.parentElement!;
    // 50,000 − 4,000 − 6,000 salary (the running period's 6 days so far of 31: 31,000 × 6/31 — not charged in
    // full since 2026-10-15, payLeftoversOct15) − 2,500 incentive (5%, no target set)
    await waitFor(() => expect(within(net).getByText("₹37,500")).toBeTruthy());
  });

  it("is what Revenue Overview shows", async () => {
    mem.__seed("leads/l1", leads[0] as unknown as Record<string, unknown>);
    mem.__seed("leads/l2", leads[1] as unknown as Record<string, unknown>);
    render(<RevenueOverview />);
    const card = (await screen.findByText("From Sales")).parentElement!;
    await waitFor(() => expect(within(card).getByText("₹2,998")).toBeTruthy());
  });
});
