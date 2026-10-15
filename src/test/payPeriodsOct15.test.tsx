/**
 * Pay periods, payroll audit — 2026-10-15 (owner's decisions: "open on due, warn early pay").
 *
 * 1. Payroll / Sales Payroll open on the period DUE; paying a period that has not ended names the days not
 *    worked yet and is refused without that confirmation.
 * 2. Old Accounts receipts labelled with the period RUNNING when sent belong to the period before it.
 * 3. Salary / target / plan carry the pay period they apply from; every reader prices a period with what
 *    applied IN it, and a paid period is compared with that.
 * 7. The member's leave panel reads the live attendance count, not the paid snapshot.
 * 8. Salary Management shows the status of the period looked at (the one due by default).
 *
 * The real hooks, services and pages on the in-memory Firestore (`memoryFirestore`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

configure({ testIdAttribute: "data-test" });

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
vi.mock("@/services/auditLog", () => ({ recordAudit: vi.fn(async () => undefined) }));
const AUTH: { user: Record<string, unknown> } = { user: { uid: "techadmin", name: "Tara", role: "tech_admin" } };
vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(AUTH), { getState: () => AUTH }),
}));
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const mem = await import("./memoryFirestore");
const {
  computeSalary, daysNotWorkedYet, earlyPayWarning, isSundayDate, payMonthsBetween, payPeriodForMonth, periodDates,
  salaryMonthDue, currentPayMonth,
} = await import("@/utils/payrollEngine");
const { markSalaryPaid, EarlyPaymentError } = await import("@/services/payrollRun");
const { periodFromLabel, receiptPeriodOf } = await import("@/utils/receiptPeriod");
const { watchPeriodReceipts } = await import("@/services/salaryReceipts");
const { payTermsFor, payTermsChange, salaryFor, applyFromChoices } = await import("@/utils/payTerms");
const { savePayTerms } = await import("@/services/payroll");
const { useMonthPayroll } = await import("@/hooks/useMonthPayroll");
const { default: Payroll } = await import("@/pages/shared/Payroll");
const { default: MySalaryDashboard } = await import("@/pages/tech-member/MySalaryDashboard");
const { default: SalaryManagement } = await import("@/pages/accounts-admin/SalaryManagement");

import type { AppUser } from "@/types";

const ts = (y: number, m: number, d: number, h = 11) => mem.Timestamp.fromDate(new Date(y, m - 1, d, h));
const member = (uid: string, extra: Partial<AppUser> = {}): AppUser =>
  ({ uid, name: uid, role: "tech_member", salary: 26000, isActive: true, createdBy: "admin", ...extra } as AppUser);
const SEPT = payPeriodForMonth("2026-09", 10); // 10 Sep → 9 Oct 2026
const fullPeriod = (period: typeof SEPT, salary: number, todayStr: string) => computeSalary({
  month: period.month, monthlySalary: salary, todayStr, period,
  days: periodDates(period).map(date => ({ date, status: isSundayDate(date) ? "holiday" as const : "full" as const })),
});
const bank = (uid: string) => mem.__seed(`employee_bank/${uid}`, {
  accounts: [{ id: "a1", method: "upi", accountHolderName: uid, upiId: `${uid}@upi`, isPrimary: true, verified: true }],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 11, 0)); // Thu 15 Oct 2026 — September is due, October runs
  mem.__reset();
  AUTH.user = { uid: "techadmin", name: "Tara", role: "tech_admin" };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

// ── 1. Open on due, warn early pay ───────────────────────────────────────────────────────────────

describe("the period due, and paying one that has not ended", () => {
  it("is September on 15 Oct, with October running one step ahead; on 5 Oct both are September", () => {
    expect(salaryMonthDue(new Date(2026, 9, 15))).toBe("2026-09");
    expect(payMonthsBetween("2026-09", currentPayMonth(10, new Date(2026, 9, 15)))).toBe(1);
    expect(salaryMonthDue(new Date(2026, 9, 5))).toBe("2026-09");
    expect(payMonthsBetween("2026-09", currentPayMonth(10, new Date(2026, 9, 5)))).toBe(0);
  });

  it("names the days not worked yet — on 3 Oct, paying September: 3 → 9 Oct", () => {
    const days = daysNotWorkedYet(SEPT, "2026-10-03");
    expect(days).toEqual({ from: "2026-10-03", to: "2026-10-09", days: 7, workingDays: 6 }); // 4 Oct is a Sunday
    expect(daysNotWorkedYet(SEPT, "2026-10-10")).toBeNull();
    expect(earlyPayWarning("Asha", "September 2026 (10 Sep – 09 Oct)", days!))
      .toBe("September 2026 (10 Sep – 09 Oct) has not ended yet: 03 Oct – 09 Oct (6 working days) are not worked yet, "
        + "and paying now pays them as if worked. If Asha is leaving, mark those days on the attendance grid first.");
  });

  it("refuses an early payment without the confirmation, records the days with it, and still lets a receipt be attached", async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 11, 0));
    const computation = fullPeriod(SEPT, 26000, "2026-10-03");
    const input = { month: "2026-09", member: member("asha"), netSalary: 26000, computation };
    await expect(markSalaryPaid(input, { uid: "admin" })).rejects.toBeInstanceOf(EarlyPaymentError);
    expect(mem.__read("payroll_lines/2026-09_asha")).toBeUndefined();

    await markSalaryPaid({ ...input, earlyPayConfirmed: true }, { uid: "admin" });
    expect(mem.__read("payroll_lines/2026-09_asha")?.earlyPay).toEqual({ from: "2026-10-03", to: "2026-10-09", workingDays: 6 });

    // A receipt attached afterwards is not a new payment: never refused, the early days kept as recorded.
    vi.setSystemTime(new Date(2026, 9, 5, 11, 0));
    await markSalaryPaid(input, { uid: "admin" }, { receiptUrl: "https://x/r.pdf" });
    const line = mem.__read("payroll_lines/2026-09_asha")!;
    expect(line.receiptUrl).toBe("https://x/r.pdf");
    expect(line.earlyPay).toEqual({ from: "2026-10-03", to: "2026-10-09", workingDays: 6 });
  });

  it("pays an ended period without asking", async () => {
    const computation = fullPeriod(SEPT, 26000, "2026-10-15");
    await markSalaryPaid({ month: "2026-09", member: member("asha"), netSalary: 26000, computation }, { uid: "admin" });
    expect(mem.__read("payroll_lines/2026-09_asha")?.earlyPay).toBeUndefined();
  });

  it("Payroll opens on the period due, steps forward only to the running one, and asks before paying it early", async () => {
    // A user record carries its own uid (the page reads it from the document).
    mem.__seed("users/asha", { uid: "asha", name: "Asha", role: "tech_member", isActive: true, salary: 26000, createdBy: "techadmin" });
    bank("asha");
    render(<Payroll />);
    expect(await screen.findByText("September 2026 (10 Sep – 09 Oct)")).toBeTruthy();
    expect(screen.getByTestId("payroll-period-state").textContent).toBe("Due now");

    fireEvent.click(screen.getByLabelText("Next month"));
    expect(await screen.findByText("October 2026 (10 Oct – 09 Nov)")).toBeTruthy();
    expect(screen.getByTestId("payroll-period-state").textContent).toMatch(/Not ended yet/);
    expect((screen.getByLabelText("Next month") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(await screen.findByText("Asha"));
    fireEvent.click(await screen.findByText("Mark paid"));
    expect(await screen.findByText("Pay Asha before the period ends?")).toBeTruthy();
    expect(screen.getByText(/15 Oct – 09 Nov .* are not worked yet/)).toBeTruthy();
  });
});

// ── 2. Old receipts labelled with the running period ─────────────────────────────────────────────

describe("which period an Accounts receipt pays", () => {
  it("reads the printed label", () => {
    expect(periodFromLabel("September 2026 (10 Sep – 09 Oct)")).toBe("2026-09");
    expect(periodFromLabel("July 2026")).toBe("2026-07");
    expect(periodFromLabel("nonsense")).toBeNull();
  });

  it("moves a label-only receipt sent before its period ended to the period before; keeps everything else", () => {
    // Sent on payday 10 Sep for August's salary, labelled with the period running that day.
    expect(receiptPeriodOf({ month: "September 2026 (10 Sep – 09 Oct)", sentAt: { seconds: ts(2026, 9, 10).seconds } })).toBe("2026-08");
    // Picked by hand: "August", sent 10 Sep — already right.
    expect(receiptPeriodOf({ month: "August 2026 (10 Aug – 09 Sep)", sentAt: { seconds: ts(2026, 9, 10).seconds } })).toBe("2026-08");
    // Sent on the labelled period's last day — that period, due that day.
    expect(receiptPeriodOf({ month: "September 2026 (10 Sep – 09 Oct)", sentAt: { seconds: ts(2026, 10, 9).seconds } })).toBe("2026-09");
    // A receipt that says its period, a calendar-month label from before 1 Aug, and one with no send time keep theirs.
    expect(receiptPeriodOf({ period: "2026-09", month: "September 2026 (10 Sep – 09 Oct)", sentAt: { seconds: ts(2026, 9, 10).seconds } })).toBe("2026-09");
    expect(receiptPeriodOf({ month: "July 2026", sentAt: { seconds: ts(2026, 7, 5).seconds } })).toBe("2026-07");
    expect(receiptPeriodOf({ month: "September 2026 (10 Sep – 09 Oct)" })).toBe("2026-09");
  });

  it("Payroll's receipt listener puts the payday receipt on August, not September", async () => {
    mem.__seed("salary_receipts/r1", { userId: "asha", amount: 25000, month: "September 2026 (10 Sep – 09 Oct)", sentBy: "acc", sentAt: ts(2026, 9, 10) });
    mem.__seed("salary_receipts/r2", { userId: "asha", amount: 26000, period: "2026-09", month: "September 2026 (10 Sep – 09 Oct)", sentBy: "acc", sentAt: ts(2026, 10, 10) });
    const seen: Record<string, string[]> = {};
    const stopAug = watchPeriodReceipts("2026-08", map => { seen.aug = (map.get("asha") || []).map(r => r.id); });
    const stopSep = watchPeriodReceipts("2026-09", map => { seen.sep = (map.get("asha") || []).map(r => r.id); });
    await waitFor(() => expect(seen.aug).toEqual(["r1"]));
    expect(seen.sep).toEqual(["r2"]);
    stopAug(); stopSep();
  });
});

// ── 3. Pay terms with the period they apply from ─────────────────────────────────────────────────

describe("pay terms per pay period", () => {
  const raised = (): AppUser => member("asha", {
    salary: 18000,
    payHistory: [{ from: "2026-10", salary: 18000, previous: { salary: 15000 }, at: 2 }],
  });

  it("gives each period what applied in it; no history = today's fields everywhere", () => {
    expect(salaryFor(raised(), "2026-08")).toBe(15000);
    expect(salaryFor(raised(), "2026-09")).toBe(15000);
    expect(salaryFor(raised(), "2026-10")).toBe(18000);
    expect(salaryFor(member("ben", { salary: 20000 }), "2025-01")).toBe(20000);
  });

  it("lets the most recent decision win for the periods it covers", () => {
    const u = member("asha", {
      salary: 16000,
      payHistory: [
        { from: "2026-10", salary: 18000, previous: { salary: 15000 }, at: 1 },
        { from: "2026-09", salary: 16000, previous: { salary: 18000 }, at: 2 },
      ],
    });
    expect(salaryFor(u, "2026-08")).toBe(15000);   // before every change: the original terms
    expect(salaryFor(u, "2026-09")).toBe(16000);
    expect(salaryFor(u, "2026-11")).toBe(16000);   // = the stored field
  });

  it("carries the target and the plan too", () => {
    const u = member("sita", {
      role: "sales_member", dailyTarget: 2000, earningsOption: "incentive_10",
      payHistory: [{ from: "2026-10", salary: 26000, dailyTarget: 2000, earningsOption: "incentive_10", previous: { salary: 26000, dailyTarget: 1000, earningsOption: "stipend_plus_5" }, at: 1 }],
    });
    expect(payTermsFor(u, "2026-09")).toEqual({ salary: 26000, dailyTarget: 1000, earningsOption: "stipend_plus_5" });
    expect(payTermsFor(u, "2026-10")).toEqual({ salary: 26000, dailyTarget: 2000, earningsOption: "incentive_10" });
  });

  it("records nothing when the pay terms did not change", () => {
    expect(payTermsChange({ current: { salary: 15000 }, next: { salary: 15000 }, from: "2026-10", at: 1 })).toBeNull();
    expect(applyFromChoices("2026-10").find(c => c.value === "2026-10")?.label).toMatch(/running now/);
  });

  it("savePayTerms writes the latest terms and appends the change with what it replaced", async () => {
    mem.__seed("users/sita", { name: "Sita", role: "sales_member", salary: 15000, monthlyTarget: 31000 });
    await savePayTerms("sita", { salary: 18000, dailyTarget: 1000 }, "2026-10", { uid: "admin", name: "Admin" }, { monthlyTarget: null });
    const u = mem.__read("users/sita")!;
    expect(u.salary).toBe(18000);
    expect(u.dailyTarget).toBe(1000);
    expect(u.monthlyTarget).toBeNull();
    const history = u.payHistory as { from: string; salary: number; previous: { salary: number } }[];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ from: "2026-10", salary: 18000, previous: { salary: 15000 } });

    // The same terms again: nothing appended, the stored fields still written.
    await savePayTerms("sita", { salary: 18000, dailyTarget: 1000 }, "2026-11", { uid: "admin" });
    expect((mem.__read("users/sita")!.payHistory as unknown[]).length).toBe(1);
  });

  it("Edit Member asks from which period a new salary or target applies, and saves the change with it", async () => {
    const { default: EditMemberModal } = await import("@/components/EditMemberModal");
    mem.__seed("users/sita", { name: "Sita", role: "sales_member", salary: 15000, dailyTarget: 1000, earningsOption: "stipend_plus_5" });
    const sita = { ...member("sita", { role: "sales_member", salary: 15000, dailyTarget: 1000, earningsOption: "stipend_plus_5" }) };
    const onUpdated = vi.fn();
    render(<EditMemberModal member={sita} variant="sales" onClose={() => {}} onUpdated={onUpdated} />);
    expect(screen.queryByTestId("pay-terms-from")).toBeNull();            // nothing changed yet, nothing asked
    fireEvent.change(screen.getByTestId("daily-target-input"), { target: { value: "1500" } });
    expect(screen.getByTestId("pay-terms-from")).toBeTruthy();
    expect((screen.getByTestId("pay-terms-from-select") as HTMLSelectElement).value).toBe("2026-10");
    fireEvent.change(screen.getByTestId("pay-terms-from-select"), { target: { value: "2026-11" } });
    await act(async () => { fireEvent.click(screen.getByText("Save Changes")); });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    const saved = mem.__read("users/sita")!;
    expect(saved.dailyTarget).toBe(1500);
    expect((saved.payHistory as { from: string; dailyTarget: number; previous: { dailyTarget: number } }[])[0])
      .toMatchObject({ from: "2026-11", dailyTarget: 1500, previous: { dailyTarget: 1000 } });
  });

  it("a raise from October does not re-price September or flag the paid August", async () => {
    const AUG = payPeriodForMonth("2026-08", 10);
    mem.__seed("payroll_lines/2026-08_asha", {
      month: "2026-08", memberId: "asha", memberName: "asha", monthlySalary: 15000, netSalary: 15000,
      computation: fullPeriod(AUG, 15000, "2026-10-15"), paymentStatus: "completed",
    });
    for (const d of [...periodDates(AUG), ...periodDates(SEPT)]) {
      if (!isSundayDate(d)) mem.__seed(`daily_checkins/asha_${d}`, { memberId: "asha", date: d });
    }
    const aug = renderHook(() => useMonthPayroll([raised()], "2026-08"));
    await waitFor(() => expect(aug.result.current.loading).toBe(false));
    expect(aug.result.current.rows[0].changedSincePaid).toBe(false);

    const sep = renderHook(() => useMonthPayroll([raised()], "2026-09"));
    await waitFor(() => expect(sep.result.current.loading).toBe(false));
    expect(sep.result.current.rows[0].netSalary).toBe(15000);
  });
});

// ── 7. The leave panel counts live attendance ────────────────────────────────────────────────────

describe("My Salary's leave panel after payday", () => {
  it("counts leave approved after the period was paid", async () => {
    AUTH.user = { uid: "asha", name: "Asha", role: "tech_member", salary: 26000 };
    bank("asha");
    // September paid on 10 Oct with no leave in it.
    mem.__seed("payroll_lines/2026-09_asha", {
      month: "2026-09", memberId: "asha", memberName: "Asha", monthlySalary: 26000, netSalary: 26000,
      computation: fullPeriod(SEPT, 26000, "2026-10-10"), paymentStatus: "completed",
    });
    for (const d of periodDates(SEPT)) if (!isSundayDate(d)) mem.__seed(`daily_checkins/asha_${d}`, { memberId: "asha", date: d });
    // Then a leave on 15 Sep is approved.
    mem.__seed("attendance/asha_2026-09-15", { memberId: "asha", date: "2026-09-15", month: "2026-09", status: "leave" });

    render(<MemoryRouter><MySalaryDashboard /></MemoryRouter>);
    // The page opens on the running period (October); step back to September.
    fireEvent.click(await screen.findByLabelText(/previous/i));
    await waitFor(() => expect(screen.getByTestId("leave-used").textContent).toBe("1 of 2 paid leaves used"));
  });
});

// ── 8. Salary Management: the status of the period looked at ─────────────────────────────────────

describe("Salary Management's status column", () => {
  it("shows the period due (September) as not sent when the only receipt paid August", async () => {
    AUTH.user = { uid: "acc", name: "Accounts", role: "accounts_admin" };
    mem.__seed("users/asha", { name: "Asha", email: "a@x", role: "tech_member", isActive: true, salary: 26000, createdBy: "techadmin" });
    mem.__seed("salary_receipts/r1", { userId: "asha", amount: 25000, month: "September 2026 (10 Sep – 09 Oct)", sentBy: "acc", sentAt: ts(2026, 9, 10) });
    render(<SalaryManagement />);
    expect(await screen.findByTestId("not-sent-for-period")).toBeTruthy();
    expect(screen.getByTestId("salary-period-label").textContent).toMatch(/September 2026.*due/);

    fireEvent.click(screen.getByLabelText("Previous pay period"));
    expect(await screen.findByTestId("receipt-sent-for-period")).toBeTruthy();
    expect(screen.getByTestId("salary-period-label").textContent).toMatch(/August 2026/);
  });

  it("asks from which period an edited salary applies, and records it", async () => {
    AUTH.user = { uid: "acc", name: "Accounts", role: "accounts_admin" };
    mem.__seed("users/asha", { name: "Asha", email: "a@x", role: "tech_member", isActive: true, salary: 15000, createdBy: "techadmin" });
    render(<SalaryManagement />);
    fireEvent.click(await screen.findByTitle("Edit Salary"));
    const input = screen.getByDisplayValue("15000");
    fireEvent.change(input, { target: { value: "18000" } });
    fireEvent.change(screen.getByTestId("salary-applies-from"), { target: { value: "2026-11" } });
    await act(async () => { fireEvent.click(input.parentElement!.querySelector("button")!); });
    await waitFor(() => expect(mem.__read("users/asha")?.salary).toBe(18000));
    const history = mem.__read("users/asha")!.payHistory as { from: string; previous: { salary: number } }[];
    expect(history[0]).toMatchObject({ from: "2026-11", previous: { salary: 15000 } });
  });
});
