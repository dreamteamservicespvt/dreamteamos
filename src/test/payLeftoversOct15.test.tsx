/**
 * The pay fixes' leftovers — 2026-10-15. One family: a period priced or counted with TODAY's values.
 *
 * 1. Work Done and Member History set revenue against the salary that applied in the period SHOWN
 *    (`utils/payTerms.termsPeriodOn` + `salaryFor`), not today's `users.salary`.
 * 2. My Performance's Option 1 / Option 2 card is an estimate for the running period under the one rule:
 *    money collected on verified sales, the incentive only at 75% of the period's target
 *    (`utils/salesPay.runningPlanEstimate`), with the running period's plan.
 * 3. The renewals card prices a renewal at the salesperson's terms for the period its money is collected in
 *    (a renewal still to win → the running period's), and says "estimate".
 * 4. The P&L charges an unpaid period still running only for its days so far (today included); a paid
 *    period costs what was paid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

configure({ testIdAttribute: "data-test" });

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
const AUTH: { user: Record<string, unknown> } = { user: { uid: "techadmin", name: "Kiran", role: "tech_admin" } };
vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(AUTH), { getState: () => AUTH }),
}));
vi.mock("@/components/agreement/AgreementListForMember", () => ({ default: () => null }));
// The renewals card's data: its months are handed in, its bell and its Renew are not under test here.
const SMM: { campaigns: unknown[] } = { campaigns: [] };
vi.mock("@/hooks/useSmmCampaigns", () => ({ useSmmCampaigns: () => ({ campaigns: SMM.campaigns, loading: false }) }));
vi.mock("@/services/smm", () => ({ notifyRenewalsDueOnOpen: vi.fn(async () => undefined) }));
vi.mock("@/components/smm/useSmmRenewal", () => ({ useSmmRenewal: () => ({ renew: vi.fn(), renewingId: null }) }));
vi.mock("@/components/sales/AttendanceCard", () => ({ default: () => null }));
vi.mock("recharts", () => {
  const Stub = () => null;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Cell: Stub,
  };
});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const mem = await import("./memoryFirestore");
const { termsPeriodOn, salaryFor } = await import("@/utils/payTerms");
const { runningPlanEstimate, collectionsOf } = await import("@/utils/salesPay");
const { payPeriodForMonth } = await import("@/utils/payrollEngine");
const { computeProfit, periodsInWindow } = await import("@/utils/profitAnalytics");
const { default: WorkDoneReport } = await import("@/components/work/WorkDoneReport");
const { default: MemberHistory } = await import("@/pages/tech-admin/MemberHistory");
const { default: MyPerformance } = await import("@/pages/sales-member/MyPerformance");
const { default: SmmRenewalsCard } = await import("@/components/smm/SmmRenewalsCard");
const { useSalesLeadsStore } = await import("@/store/salesLeadsStore");

import type { AppUser, Lead, SaleDetail, WorkAssignment } from "@/types";
import type { PeriodFilter } from "@/utils/periodFilter";

const ts = (y: number, m: number, d: number, h = 11) => mem.Timestamp.fromDate(new Date(y, m - 1, d, h));
const sale = (amount: number, y: number, m: number, d: number): SaleDetail =>
  ({ category: "promotional", packageKey: "p", amount, verificationStatus: "verified", submittedAt: ts(y, m, d) } as SaleDetail);

/** 20,000 until September; 25,000 from the October period (10 Oct → 9 Nov), saved on 12 Oct. */
const RAISED = {
  salary: 25000,
  payHistory: [{ from: "2026-10", salary: 25000, previous: { salary: 20000 }, at: 1 }],
};
/** A raise agreed today for NEXT period — the stored field already says 30,000. */
const RAISE_TO_COME = {
  salary: 30000,
  payHistory: [{ from: "2026-11", salary: 30000, previous: { salary: 20000 }, at: 1 }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 11, 0)); // 15 Oct 2026 — the October period, 10 Oct → 9 Nov, is running
  mem.__reset();
  SMM.campaigns = [];
  AUTH.user = { uid: "techadmin", name: "Kiran", role: "tech_admin" };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

// ── 1. The salary of the period shown ────────────────────────────────────────────────────────────

describe("termsPeriodOn — which period's terms price a day", () => {
  it("is the period the day falls in; a day still to come or no day at all is the running period", () => {
    expect(termsPeriodOn("2026-10-09", "2026-10-15")).toBe("2026-09");
    expect(termsPeriodOn("2026-10-10", "2026-10-15")).toBe("2026-10");
    expect(termsPeriodOn("2026-12-01", "2026-10-15")).toBe("2026-10"); // future → running
    expect(termsPeriodOn(null, "2026-10-15")).toBe("2026-10");
    expect(termsPeriodOn("not a day", "2026-10-15")).toBe("2026-10");
  });

  it("with salaryFor: each period its own salary, and a raise to come is not today's", () => {
    expect(salaryFor(RAISED, termsPeriodOn("2026-09-20", "2026-10-15"))).toBe(20000);
    expect(salaryFor(RAISED, termsPeriodOn(null, "2026-10-15"))).toBe(25000);
    expect(salaryFor(RAISE_TO_COME, termsPeriodOn(null, "2026-10-15"))).toBe(20000);
  });
});

describe("Work Done — revenue against the salary of the cycle shown", () => {
  const member = { uid: "m1", name: "Ravi", role: "tech_member", isActive: true, ...RAISED } as unknown as AppUser;
  const job = (date: string, price: number) =>
    ({ id: `w-${date}`, assignedTo: "m1", status: "verified", category: "promotional", totalPrice: price, date } as unknown as WorkAssignment);
  const assignments = [job("2026-09-20", 10000), job("2026-10-12", 5000)];

  it("prices the running cycle at its salary and last cycle at last cycle's", () => {
    render(<WorkDoneReport assignments={assignments} members={[member]} />);
    expect(screen.getByText(/salary ₹25,000/)).toBeTruthy();
    expect(screen.getByText("20% of salary")).toBeTruthy(); // 5,000 / 25,000
    fireEvent.click(screen.getByLabelText("Previous cycle"));
    expect(screen.getByText(/salary ₹20,000/)).toBeTruthy();
    expect(screen.getByText("50% of salary")).toBeTruthy(); // 10,000 / 20,000 — was 40% on today's 25,000
  });

  it("does not price the running cycle at a raise agreed for next period", () => {
    const m = { ...member, ...RAISE_TO_COME } as AppUser;
    render(<WorkDoneReport assignments={assignments} members={[m]} />);
    expect(screen.getByText(/salary ₹20,000/)).toBeTruthy();
    expect(screen.queryByText(/salary ₹30,000/)).toBeNull();
  });
});

describe("Member History — revenue against the salary of the day shown", () => {
  it("today → this period's salary; a day of last period → last period's", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 11, 0)); // 10 Oct: "Yesterday" (9 Oct) is in the September period
    mem.__seed("users/m1", { name: "Ravi", role: "tech_member", isActive: true, ...RAISED });
    mem.__seed("work_assignments/a1", { assignedTo: "m1", status: "verified", totalPrice: 5000, date: "2026-10-10" });
    mem.__seed("work_assignments/a2", { assignedTo: "m1", status: "verified", totalPrice: 4000, date: "2026-10-09" });
    render(
      <MemoryRouter initialEntries={["/tech-admin/team/m1"]}>
        <Routes><Route path="/tech-admin/team/:memberId" element={<MemberHistory />} /></Routes>
      </MemoryRouter>,
    );
    const salaryBox = async () => (await screen.findByText("Salary")).parentElement!.parentElement!;
    await waitFor(async () => expect((await salaryBox()).textContent).toContain("₹25,000"));
    const select = screen.getAllByRole("combobox").find(s => (s as HTMLSelectElement).querySelector('option[value="all"]'))!;
    fireEvent.change(select, { target: { value: "1" } }); // Yesterday, 9 Oct
    await waitFor(async () => expect((await salaryBox()).textContent).toContain("₹20,000"));
    expect(screen.getByText("20%")).toBeTruthy(); // 4,000 / 20,000
  });
});

// ── 2. My Performance's estimate ─────────────────────────────────────────────────────────────────

describe("runningPlanEstimate — the plans on the one rule", () => {
  const OCT = payPeriodForMonth("2026-10", 10);
  const collections = collectionsOf([{ id: "l1", assignedTo: "u1", saleItems: [sale(10000, 2026, 10, 12)] }] as unknown as Lead[]);

  it("withholds both incentives under 75% of the target; the salary part stays", () => {
    const e = runningPlanEstimate({ collections, period: OCT, dailyTarget: 1000 });
    expect(e.gateMetSoFar).toBe(false);
    expect(e.shortfall).toBeGreaterThan(0);
    expect(e.option1).toMatchObject({ incentive: 0, incentiveBeforeTarget: 500 });
    expect(e.option1.salary).toBeCloseTo(10000 / 30000 * 5000, 5);
    expect(e.option1.total).toBeCloseTo(e.option1.salary, 5);
    expect(e.option2).toMatchObject({ incentive: 0, incentiveBeforeTarget: 1000, total: 0 });
  });

  it("pays 5% / 10% once 75% is reached, and with no target set", () => {
    for (const dailyTarget of [100, 0]) {
      const e = runningPlanEstimate({ collections, period: OCT, dailyTarget });
      expect(e.gateMetSoFar).toBe(true);
      expect(e.option1.incentive).toBe(500);
      expect(e.option2.total).toBe(1000);
    }
  });

  it("counts only money collected in the period on verified sales", () => {
    const mixed = collectionsOf([{ id: "l1", assignedTo: "u1", saleItems: [
      sale(10000, 2026, 10, 12), sale(7000, 2026, 9, 30), { ...sale(3000, 2026, 10, 13), verificationStatus: "pending" },
    ] }] as unknown as Lead[]);
    expect(runningPlanEstimate({ collections: mixed, period: OCT }).salesBase).toBe(10000);
  });
});

describe("My Performance — the estimate card", () => {
  const leads = [{ id: "l1", assignedTo: "u1", saleDone: true, status: "answered", createdAt: ts(2026, 10, 12),
    saleItems: [sale(10000, 2026, 10, 12)] }];
  const show = (user: Record<string, unknown>) => {
    AUTH.user = { uid: "u1", name: "Asha", role: "sales_member", salary: 0, ...user };
    useSalesLeadsStore.getState().setLeads("u1", leads as never);
    render(<MemoryRouter><MyPerformance /></MemoryRouter>);
  };

  it("under the gate: says so, shows the incentive at ₹0 and what 75% would pay", () => {
    show({ earningsOption: "stipend_plus_5", dailyTarget: 1000 });
    const gate = screen.getByTestId("earnings-gate");
    expect(gate.getAttribute("data-gate")).toBe("under");
    expect(gate.textContent).toMatch(/Incentive not earned yet/);
    expect(screen.getByTestId("earnings-option1-incentive").textContent).toBe("₹0");
    expect(screen.getByTestId("earnings-option1").textContent).toMatch(/₹500 at 75% of target/);
    expect(screen.getByText(/My Earnings This Period · estimate/)).toBeTruthy();
  });

  it("past the gate: the incentive counts", () => {
    show({ earningsOption: "incentive_10", dailyTarget: 100 });
    expect(screen.getByTestId("earnings-gate").getAttribute("data-gate")).toBe("met");
    expect(screen.getByTestId("earnings-option2-incentive").textContent).toBe("₹1,000");
    expect(screen.queryByText(/No target required/)).toBeNull();
  });

  it("shows the plan that applies in the running period, not one agreed for the next", () => {
    show({
      earningsOption: "incentive_10", dailyTarget: 0,
      payHistory: [{ from: "2026-11", salary: 0, earningsOption: "incentive_10", previous: { salary: 0, earningsOption: "stipend_plus_5" }, at: 1 }],
    });
    expect(screen.getByTestId("earnings-plan-badge").textContent).toMatch(/Salary \+ 5%/);
    expect(screen.getByTestId("earnings-option1")).toBeTruthy();
    expect(screen.queryByTestId("earnings-option2")).toBeNull();
    expect(screen.getByTestId("earnings-gate").getAttribute("data-gate")).toBe("none");
  });
});

// ── 3. The renewals card ─────────────────────────────────────────────────────────────────────────

describe("My Social Media — a renewal at the terms of the period its money is collected in", () => {
  /** 5% (Salary + 5%) until September; 10% from the October period. */
  const seller = {
    uid: "u1", name: "Asha", role: "sales_member", earningsOption: "incentive_10",
    payHistory: [{ from: "2026-10", salary: 0, earningsOption: "incentive_10", previous: { salary: 0, earningsOption: "stipend_plus_5" }, at: 1 }],
  } as unknown as AppUser;
  const month = (id: string, endDate: string, extra: Record<string, unknown> = {}) => ({
    id, businessName: id, soldBy: "u1", status: "active", amount: 10000,
    cycle: { month: endDate.slice(0, 7), startDate: "2026-09-05", endDate }, ...extra,
  });

  it("a renewal won on 5 Oct (September period) at 5%, one still to win at the running 10%; says estimate", () => {
    SMM.campaigns = [
      month("Won", "2026-10-05", { status: "renewed", renewal: { state: "won" } }),
      month("Waiting", "2026-10-25"),
    ];
    render(<MemoryRouter><SmmRenewalsCard user={seller} ring={false} /></MemoryRouter>);
    expect(screen.getByTestId("smm-my-earned").textContent).toBe("₹500");
    expect(screen.getByTestId("smm-renewal-row-money").textContent).toBe("+₹1,000");
    expect(screen.getByTestId("smm-my-rate-note").textContent).toMatch(/^Estimate: 10%/);
    expect(screen.getByText(/from your renewals this month · estimate/)).toBeTruthy();
  });

  it("a plan agreed for next period does not price this one", () => {
    const later = { ...seller, payHistory: [{ ...seller.payHistory![0], from: "2026-11" }] } as AppUser;
    SMM.campaigns = [month("Waiting", "2026-10-25")];
    render(<MemoryRouter><SmmRenewalsCard user={later} ring={false} /></MemoryRouter>);
    expect(screen.getByTestId("smm-renewal-row-money").textContent).toBe("+₹500");
    expect(screen.getByTestId("smm-my-rate-note").textContent).toMatch(/^Estimate: 5%/);
  });
});

// ── 4. The P&L's running period ──────────────────────────────────────────────────────────────────

describe("P&L — a running period costs its days so far", () => {
  const tech = { uid: "t1", name: "T", role: "tech_member", isActive: true, salary: 31000, createdAt: null } as unknown as AppUser;
  const october: PeriodFilter = { mode: "month", month: "2026-10", day: "2026-10-15", monthBasis: "cycle" };
  const run = (extra: Partial<Parameters<typeof computeProfit>[0]> = {}) => computeProfit({
    filter: october, users: [tech], leads: [], assignments: [], expenses: [], todayStr: "2026-10-15", cycleStartDay: 10, ...extra,
  });

  it("periodsInWindow says how much of each period has happened (today included)", () => {
    const [oct] = periodsInWindow("2026-10-10", "2026-11-09", 10, "2026-10-15");
    expect(oct.share).toBe(1);
    expect(oct.shareToDate).toBeCloseTo(6 / 31, 10);
    expect(periodsInWindow("2026-09-10", "2026-10-09", 10, "2026-10-15")[0].shareToDate).toBe(1);
    expect(periodsInWindow("2026-11-10", "2026-12-09", 10, "2026-10-15")[0].shareToDate).toBe(0);
    expect(periodsInWindow("2026-07-10", "2026-08-09")[0]).not.toHaveProperty("shareToDate"); // unchanged without today
  });

  it("charges an unpaid running period 6 of its 31 days on 15 Oct — not the whole month", () => {
    expect(run().techSalary).toBe(6000);
    expect(run({ todayStr: "2026-11-09" }).techSalary).toBe(31000); // its last day: the whole period
    expect(run({ todayStr: "2026-10-09" }).techSalary).toBe(0); // not started yet
  });

  it("a period paid early costs what was paid", () => {
    const paid = run({
      payrollLines: [{ id: "2026-10_t1", month: "2026-10", memberId: "t1", netSalary: 31000, paymentStatus: "completed" }] as never,
    });
    expect(paid.techSalary).toBe(31000);
  });

  it("an ended unpaid period is charged in full, as before", () => {
    expect(run({ filter: { ...october, month: "2026-09" } }).techSalary).toBe(31000);
  });
});
