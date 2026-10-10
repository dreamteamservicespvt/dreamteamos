/**
 * Attendance → Pay Salary on the in-memory Firestore (2026-10-09).
 *
 * The real hooks and services, against data that behaves like Firestore: listeners re-fire when
 * attendance changes, a payment record stays put, a failed read is a failure. Each case is one of
 * the ways Pay Salary used to disagree with the attendance it is paid from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const notify = vi.fn(async (_n: { userId: string; link?: string }) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification: (n: { userId: string; link?: string }) => notify(n) }));
vi.mock("@/services/auditLog", () => ({ recordAudit: vi.fn(async () => undefined) }));
const AUTH = { user: { uid: "techadmin", name: "Tara", role: "tech_admin" } };
vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(AUTH), { getState: () => AUTH }),
}));
// The analytics charts measure their box; jsdom has no ResizeObserver.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const mem = await import("./memoryFirestore");
const { useMonthPayroll } = await import("@/hooks/useMonthPayroll");
const { useSalesMemberPay } = await import("@/hooks/useSalesMemberPay");
const { useSalaryMonth } = await import("@/hooks/useSalaryMonth");
const { default: MemberAnalyticsDashboard } = await import("@/components/analytics/MemberAnalyticsDashboard");
const { default: Payroll } = await import("@/pages/shared/Payroll");
const { approveLeaveRequest, undoLeaveDecision } = await import("@/services/leave");
const { markSalaryPaid, priceMemberForPeriod } = await import("@/services/payrollRun");
const { computeSalary, isSundayDate, payPeriodForMonth, periodDates } = await import("@/utils/payrollEngine");

import type { AppUser } from "@/types";
import type { LeaveRequest } from "@/types/payroll";

const JULY = payPeriodForMonth("2026-07", 10); // 10 Jul → 9 Aug 2026: 26 working days
const WORKING = periodDates(JULY).filter(d => !isSundayDate(d));

const member = (uid: string, extra: Partial<AppUser> = {}): AppUser =>
  ({ uid, name: uid, role: "tech_member", salary: 26000, isActive: true, createdBy: "admin", ...extra } as AppUser);

/** A tech check-in on every working day except those listed. */
function checkInAll(uid: string, except: string[] = []) {
  for (const d of WORKING) if (!except.includes(d)) mem.__seed(`daily_checkins/${uid}_${d}`, { memberId: uid, date: d });
}
/** A sales check-in, as `recordCheckIn` writes it. */
function salesCheckInAll(uid: string) {
  for (const d of WORKING) mem.__seed(`salesCheckins/${uid}_${d}`, { memberId: uid, date: d, checkInAt: new mem.Timestamp(1, 0) });
}
const mark = (uid: string, date: string, status: string) =>
  mem.__seed(`attendance/${uid}_${date}`, { memberId: uid, date, month: date.slice(0, 7), status });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 20, 11, 0)); // 20 Aug 2026 — July's cycle has closed
  mem.__reset();
  notify.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Payroll — live from attendance until paid", () => {
  it("prices each member from their attendance once every source has answered", async () => {
    checkInAll("asha", ["2026-07-13"]);
    mark("asha", "2026-07-14", "half");
    const { result } = renderHook(() => useMonthPayroll([member("asha")], "2026-07"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const row = result.current.rows[0];
    expect(row.computation.absentDays).toBe(1);
    expect(row.computation.halfDays).toBe(1);
    expect(row.netSalary).toBe(26000 - 1000 - 500);
    expect(row.frozen).toBe(false);
  });

  it("moves the moment attendance is corrected", async () => {
    checkInAll("asha");
    const { result } = renderHook(() => useMonthPayroll([member("asha")], "2026-07"));
    await waitFor(() => expect(result.current.rows[0]?.netSalary).toBe(26000));
    await act(async () => { mark("asha", "2026-07-15", "absent"); });
    await waitFor(() => expect(result.current.rows[0].netSalary).toBe(25000));
  });

  /**
   * The bug: freezing waited for a `payroll_runs` stage nothing ever writes, so a paid row kept
   * re-pricing itself after payday.
   */
  it("keeps a paid row at what was paid, and flags an attendance change after payday", async () => {
    checkInAll("asha", ["2026-07-13"]);
    const days = periodDates(JULY).map(date => ({
      date, status: isSundayDate(date) ? "holiday" as const : date === "2026-07-13" ? "absent" as const : "full" as const,
    }));
    const paidComputation = computeSalary({ month: "2026-07", monthlySalary: 26000, days, todayStr: "2026-08-20", period: JULY });
    mem.__seed("payroll_lines/2026-07_asha", {
      month: "2026-07", memberId: "asha", memberName: "asha", monthlySalary: 26000,
      netSalary: 25000, computation: paidComputation, paymentStatus: "completed",
    });

    const { result } = renderHook(() => useMonthPayroll([member("asha")], "2026-07"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows[0].frozen).toBe(true);
    expect(result.current.rows[0].changedSincePaid).toBe(false);

    await act(async () => { mark("asha", "2026-07-14", "absent"); });
    await waitFor(() => expect(result.current.rows[0].changedSincePaid).toBe(true));
    const row = result.current.rows[0];
    expect(row.netSalary).toBe(25000);        // what was paid — unmoved
    expect(row.liveNetSalary).toBe(24000);    // what attendance now says
    expect(result.current.totals.paid).toBe(25000);
  });

  /** Owner, 2026-10-10: inactive people are shown only in My Team / Team Management — never on Payroll. */
  it("lists only active people on the Payroll page, even one who worked this period", async () => {
    mem.__seed("users/asha", { name: "Asha", role: "tech_member", isActive: true, salary: 26000, createdBy: "techadmin" });
    mem.__seed("users/ravi", { name: "Ravi", role: "tech_member", isActive: false, salary: 26000, createdBy: "techadmin" });
    mem.__seed("daily_checkins/ravi_2026-08-12", { memberId: "ravi", date: "2026-08-12" });
    render(<Payroll />);
    expect(await screen.findByText("Asha")).toBeTruthy();
    expect(screen.queryByText("Ravi")).toBeNull();
  });

  it("reports a failed attendance read instead of pricing everybody Absent", async () => {
    checkInAll("asha");
    mem.__failReads("attendance");
    const { result } = renderHook(() => useMonthPayroll([member("asha")], "2026-07"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(true);
  });

  it("counts a member with a complete payout account as payable (the banner read a field nothing sets)", async () => {
    checkInAll("asha");
    mem.__seed("employee_bank/asha", {
      accounts: [{ id: "a1", method: "upi", accountHolderName: "Asha", upiId: "asha@upi", isPrimary: true, verified: true }],
    });
    const { result } = renderHook(() => useMonthPayroll([member("asha"), member("ben")], "2026-07"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.totals.bankReady).toBe(1));
    expect(result.current.totals.bankMissing).toBe(1);
  });

  it("shows the period's receipts from Accounts on the row", async () => {
    checkInAll("asha");
    mem.__seed("salary_receipts/r1", { userId: "asha", amount: 26000, period: "2026-07", month: "July 2026 (10 Jul – 09 Aug)", sentBy: "acc" });
    mem.__seed("salary_receipts/r2", { userId: "asha", amount: 1000, month: "July 2026 (10 Jul – 09 Aug)", sentBy: "acc" }); // an older receipt: label only
    const { result } = renderHook(() => useMonthPayroll([member("asha")], "2026-07"));
    await waitFor(() => expect(result.current.rows[0]?.receipts.length).toBe(2));
  });
});

describe("My Salary — the member sees the same record", () => {
  it("shows what was paid for a paid period, and says when attendance moved afterwards", async () => {
    checkInAll("asha");
    const days = periodDates(JULY).map(date => ({ date, status: isSundayDate(date) ? "holiday" as const : "full" as const }));
    mem.__seed("payroll_lines/2026-07_asha", {
      month: "2026-07", memberId: "asha", memberName: "asha", monthlySalary: 26000, netSalary: 26000,
      computation: computeSalary({ month: "2026-07", monthlySalary: 26000, days, todayStr: "2026-08-20", period: JULY }),
      paymentStatus: "completed",
    });
    const { result } = renderHook(() => useSalaryMonth({ memberId: "asha", monthlySalary: 26000, month: "2026-07" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.paidLine?.netSalary).toBe(26000);
    expect(result.current.changedSincePaid).toBe(false);

    await act(async () => { mark("asha", "2026-07-15", "absent"); });
    await waitFor(() => expect(result.current.changedSincePaid).toBe(true));
    expect(result.current.computation.absentDays).toBe(0);      // the paid record
    expect(result.current.liveComputation.absentDays).toBe(1);  // attendance today
  });
});

describe("analytics Days Present — the attendance record's count", () => {
  it("counts each day once, follows an admin's marks, and never a Sunday", async () => {
    vi.setSystemTime(new Date(2026, 6, 20, 18, 0)); // Mon 20 Jul 2026
    const seed = (id: string, date: string) => mem.__seed(`daily_checkins/${id}`, { memberId: "asha", date });
    seed("a", "2026-07-13"); seed("b", "2026-07-13");    // the same day checked in twice
    seed("c", "2026-07-14");                             // checked in, but the admin marked Absent
    mark("asha", "2026-07-14", "absent");
    mark("asha", "2026-07-15", "full");                  // marked Present with no check-in
    seed("d", "2026-07-19");                             // a Sunday
    seed("e", "2026-07-20");                             // today
    render(<MemberAnalyticsDashboard member={member("asha")} showRevenue={false} />);
    // "This Month" = the 10th → 9th cycle so far: 13, 15 and 20 Jul are Present.
    const tile = (await screen.findByText("Days Present")).parentElement!.parentElement!;
    await waitFor(() => expect(within(tile).getByText("3")).toBeTruthy());
  });
});

describe("Sales Payroll — the member's own incentive rule", () => {
  const ts = (d: Date) => mem.Timestamp.fromDate(d);

  it("pays incentive on verified money collected in the cycle, withheld under 75% of target", async () => {
    salesCheckInAll("sita");
    salesCheckInAll("gopi");
    mem.__seed("leads/l1", { assignedTo: "sita", saleItems: [
      { amount: 30000, verificationStatus: "verified", submittedAt: ts(new Date(2026, 6, 15, 11)) },
      { amount: 5000, verificationStatus: "pending", submittedAt: ts(new Date(2026, 6, 16, 11)) },
    ] });
    mem.__seed("leads/l2", { assignedTo: "gopi", saleItems: [
      { amount: 10000, verificationStatus: "verified", submittedAt: ts(new Date(2026, 6, 15, 11)) },
    ] });
    const people = [
      member("sita", { role: "sales_member", dailyTarget: 1000 }),
      member("gopi", { role: "sales_member", dailyTarget: 1000 }),
    ];
    const { result } = renderHook(() => useSalesMemberPay(people, "2026-07"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const [sita, gopi] = result.current.rows;
    expect(sita.salaryPayable).toBe(26000);           // present every day — from salesCheckins
    expect(sita.commission).toBe(1500);               // 5% of 30,000 (above 23,250)
    expect(sita.pendingSaleValue).toBe(5000);
    expect(sita.totalEarnings).toBe(27500);
    expect(gopi.commission).toBe(0);                  // 10,000 is under 75% of 31,000
    expect(gopi.incentiveWithheld).toBe(true);
  });
});

describe("leave approval reads the attendance record", () => {
  const request = (id: string, memberId: string, fromDate: string, toDate: string, extra: Partial<LeaveRequest> = {}): LeaveRequest =>
    ({ id, memberId, memberName: memberId, fromDate, toDate, month: "2026-07", kind: "paid", reason: "", status: "pending", createdAt: null, ...extra } as unknown as LeaveRequest);

  it("counts leave an admin marked on the grid, and reports the real split", async () => {
    mem.__seed("users/asha", { role: "sales_member", name: "asha" });
    mark("asha", "2026-07-20", "leave");
    mark("asha", "2026-07-21", "leave");
    mem.__seed("leave_requests/r1", { memberId: "asha" });
    const split = await approveLeaveRequest(request("r1", "asha", "2026-07-22", "2026-07-22"), { uid: "admin" });
    expect(split.absentDates).toEqual(["2026-07-22"]);
    expect(mem.__read("attendance/asha_2026-07-22")?.status).toBe("absent");
    // A sales member's notification opens the sales salary page.
    expect(notify.mock.calls.at(-1)?.[0].link).toBe("/sales/salary");
  });

  it("undo clears only the days that still hold the approval's mark", async () => {
    mem.__seed("users/asha", { role: "tech_member", name: "asha" });
    mem.__seed("leave_requests/r2", { memberId: "asha" });
    const req = request("r2", "asha", "2026-07-23", "2026-07-24");
    const split = await approveLeaveRequest(req, { uid: "admin" });
    expect(split.leaveDates).toEqual(["2026-07-23", "2026-07-24"]);
    mark("asha", "2026-07-23", "full"); // the admin corrected one day by hand
    await undoLeaveDecision({ ...req, status: "approved", leaveDates: split.leaveDates, absentDates: split.absentDates }, { uid: "admin" });
    expect(mem.__read("attendance/asha_2026-07-23")?.status).toBe("full");
    expect(mem.__read("attendance/asha_2026-07-24")).toBeUndefined();
  });
});

describe("Accounts' Salary Management prices a period the way Payroll does", () => {
  it("is salary less attendance for tech, plus incentive for sales, the salary for an admin — and sees a payment", async () => {
    checkInAll("asha", ["2026-07-13"]);
    salesCheckInAll("sita");
    mem.__seed("leads/l1", { assignedTo: "sita", saleItems: [
      { amount: 20000, verificationStatus: "verified", submittedAt: mem.Timestamp.fromDate(new Date(2026, 6, 15, 11)) },
    ] });

    const tech = await priceMemberForPeriod(member("asha"), "2026-07");
    expect(tech.amount).toBe(25000);
    expect(tech.paidLine).toBeNull();

    const sales = await priceMemberForPeriod(member("sita", { role: "sales_member" }), "2026-07");
    expect(sales.salaryPayable).toBe(26000);
    expect(sales.incentive).toBe(1000);
    expect(sales.amount).toBe(27000);

    const admin = await priceMemberForPeriod(member("boss", { role: "tech_admin", salary: 50000 }), "2026-07");
    expect(admin.amount).toBe(50000);
    expect(admin.computation).toBeNull();

    mem.__seed("payroll_lines/2026-07_asha", { month: "2026-07", memberId: "asha", netSalary: 25000, paymentStatus: "completed" });
    expect((await priceMemberForPeriod(member("asha"), "2026-07")).paidLine?.netSalary).toBe(25000);
  });
});

describe("the payment record", () => {
  it("stores the role and a sales incentive, prices on the computation's salary, and links the right page", async () => {
    salesCheckInAll("sita");
    const sita = member("sita", { role: "sales_member", salary: 30000 });
    const days = periodDates(JULY).map(date => ({ date, status: isSundayDate(date) ? "holiday" as const : "full" as const }));
    const computation = computeSalary({ month: "2026-07", monthlySalary: 26000, days, todayStr: "2026-08-20", period: JULY });
    await markSalaryPaid(
      { month: "2026-07", member: sita, netSalary: 27500, computation, incentive: { salesBase: 30000, rate: 5, amount: 1500 } },
      { uid: "admin" },
    );
    const line = mem.__read("payroll_lines/2026-07_sita")!;
    expect(line.memberRole).toBe("sales_member");
    expect(line.monthlySalary).toBe(26000); // the salary it was priced on, not today's profile
    expect((line.incentive as { amount: number }).amount).toBe(1500);
    expect(notify.mock.calls.at(-1)?.[0].link).toBe("/sales/salary");
  });
});
