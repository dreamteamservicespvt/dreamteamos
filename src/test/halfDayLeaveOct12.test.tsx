/**
 * Half-day leave (owner, 2026-10-12).
 *
 * "Users should be able to select Full Day or Half Day when applying for leave, and the selected leave duration must
 * be correctly saved, displayed, approved/rejected, reflected in attendance, and used correctly in salary
 * calculations." The owner's rule: a half day uses HALF a day of the paid-leave allowance (2 per 10th → 9th pay
 * period). Inside it the day is paid in full; past it the day pays as a half day (½ day loss of pay). Tech and sales.
 *
 * Each block is one place the duration has to survive: the allowance split, the one tally the salary and the grid
 * share, the deductions and the payslip, the member's form, the approver's panel, and approval / undo on data that
 * behaves like Firestore. Full days are covered by the older suites, which must stay green untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

configure({ testIdAttribute: "data-test" });

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const notify = vi.fn(async (_n: { userId: string; title?: string; message?: string; link?: string }) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification: (n: { userId: string }) => notify(n) }));
const audit = vi.fn(async (_a: { summary?: string }) => undefined);
vi.mock("@/services/auditLog", () => ({ recordAudit: (a: { summary?: string }) => audit(a) }));
const AUTH: { user: { uid: string; name: string; role: string } } = { user: { uid: "asha", name: "Asha", role: "tech_member" } };
vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(AUTH), { getState: () => AUTH }),
}));

const mem = await import("./memoryFirestore");
const {
  approveLeaveRequest, rejectLeaveRequest, submitLeaveRequest, undoLeaveDecision, approvalMarks, requestWorkingDates,
} = await import("@/services/leave");
const { splitLeaveDays, describeLeaveSplit } = await import("@/utils/leaveAllowance");
const {
  computeSalary, deductionsFor, formatDayCount, formatDays, netPayable, paidLeaveUsed, payPeriodForMonth, periodDates,
  tallyAttendance,
} = await import("@/utils/payrollEngine");
const { summarize } = await import("@/services/techAttendance");
const { generatePayslipPdf } = await import("@/utils/payslipPdf");
const { todayStatusOf, halfDayLeaveAskedOn, leaveAskedOn, TODAY_GROUP_OF, todayCounts } = await import("@/utils/smmAttendance");
const { default: LeavePanel } = await import("@/components/payroll/LeavePanel");
const { default: LeaveApprovalsPanel } = await import("@/components/payroll/LeaveApprovalsPanel");

import { DEFAULT_PAYROLL_CONFIG, type LeaveRequest, type SalaryComputation } from "@/types/payroll";
import type { AttendanceStatus } from "@/services/techAttendance";

// July 2026's pay period: 10 Jul → 9 Aug, 26 working days. Sundays: 12, 19, 26 Jul, 2 Aug.
const JULY_DATES = periodDates(payPeriodForMonth("2026-07", DEFAULT_PAYROLL_CONFIG.payDayOfMonth));
const SALARY = 26000;
const RATE = SALARY / 26; // 1000 a working day

/** July, every day a full day unless listed — closed (today is 20 Aug). */
function july(marks: Record<string, AttendanceStatus> = {}, config: Partial<typeof DEFAULT_PAYROLL_CONFIG> = {}): SalaryComputation {
  return computeSalary({
    month: "2026-07",
    monthlySalary: SALARY,
    days: JULY_DATES.map(date => ({ date, status: marks[date] ?? ("full" as AttendanceStatus) })),
    todayStr: "2026-08-20",
    config: { ...DEFAULT_PAYROLL_CONFIG, ...config },
  });
}

const request = (id: string, fromDate: string, extra: Partial<LeaveRequest> = {}): LeaveRequest =>
  ({
    id, memberId: "asha", memberName: "Asha", fromDate, toDate: fromDate, month: "2026-07",
    duration: "half_day", reason: "", status: "pending", createdAt: null, ...extra,
  } as unknown as LeaveRequest);

const mark = (date: string, status: string, uid = "asha") =>
  mem.__seed(`attendance/${uid}_${date}`, { memberId: uid, date, month: date.slice(0, 7), status });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 6, 15, 11, 0)); // 15 Jul 2026 — inside July's pay period
  mem.__reset();
  notify.mockClear();
  audit.mockClear();
  AUTH.user = { uid: "asha", name: "Asha", role: "tech_member" };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

// ─── The allowance, in half days ─────────────────────────────────────────────────────────────────

describe("the allowance is spent in half days", () => {
  it("a half day inside the allowance takes half a day of it and is written Half-day leave", () => {
    const split = splitLeaveDays({ requestedDates: ["2026-07-22"], duration: "half_day" });
    expect(split.days).toEqual([{ date: "2026-07-22", kind: "leave", period: "2026-07", share: 0.5, paid: 0.5, unpaid: 0, mark: "half_leave" }]);
    expect(split.leaveDates).toEqual(["2026-07-22"]);
    expect(split.paidDays).toBe(0.5);
    expect(describeLeaveSplit(split)).toBe("Half a day, within your paid leave allowance — the day is paid in full.");
  });

  it("past the allowance a half day is written as a half day (H) and pays nothing from it", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-22"], duration: "half_day", alreadyApprovedLeaveDates: ["2026-07-13", "2026-07-14"],
    });
    expect(split.days[0]).toMatchObject({ kind: "absent", paid: 0, unpaid: 0.5, mark: "half" });
    expect(split.absentDates).toEqual(["2026-07-22"]);
    expect(describeLeaveSplit(split)).toMatch(/already used, so it is unpaid: the day is recorded and paid as a half day/);
  });

  it("counts half-day leave already on record as half a day — four halves are the two days", () => {
    const three = splitLeaveDays({
      requestedDates: ["2026-07-24"], duration: "half_day",
      alreadyApprovedHalfLeaveDates: ["2026-07-20", "2026-07-21", "2026-07-22"],
    });
    expect(three.days[0].mark).toBe("half_leave"); // 1½ used → the fourth half still fits
    const four = splitLeaveDays({
      requestedDates: ["2026-07-25"], duration: "half_day",
      alreadyApprovedHalfLeaveDates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-24"],
    });
    expect(four.days[0].mark).toBe("half");
  });

  it("a full day that finds half a day left is written Leave and paid half", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-22", "2026-07-23"],
      alreadyApprovedLeaveDates: ["2026-07-13"], alreadyApprovedHalfLeaveDates: ["2026-07-14"],
    });
    expect(split.days.map(d => [d.mark, d.paid, d.unpaid])).toEqual([["leave", 0.5, 0.5], ["absent", 0, 1]]);
    expect(split.paidDays).toBe(0.5);
    expect(split.unpaidDays).toBe(1.5);
    expect(describeLeaveSplit(split)).toBe("Half a day of paid leave, then 1½ days unpaid.");
  });

  it("one date in both lists is one day — the full day counts it", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-22"], duration: "half_day",
      alreadyApprovedLeaveDates: ["2026-07-13"], alreadyApprovedHalfLeaveDates: ["2026-07-13", "2026-07-14"],
    });
    expect(split.periods[0].alreadyUsed).toBe(1.5);
    expect(split.days[0].mark).toBe("half_leave");
  });

  it("takes the member's own count of the period when given, halves included", () => {
    const split = splitLeaveDays({ requestedDates: ["2026-07-22"], alreadyUsedByPeriod: { "2026-07": 1.5 } });
    expect(split.days[0]).toMatchObject({ mark: "leave", paid: 0.5, unpaid: 0.5 });
  });

  it("whole days settle and read exactly as before", () => {
    const split = splitLeaveDays({ requestedDates: ["2026-07-13", "2026-07-14", "2026-07-15"] });
    expect(split.days.map(d => d.mark)).toEqual(["leave", "leave", "absent"]);
    expect(describeLeaveSplit(split)).toBe("2 paid leave days, then 1 day counted as absence and unpaid.");
  });
});

describe("days are said as people say them", () => {
  it("formats halves", () => {
    expect([0, 0.5, 1, 1.5, 2].map(formatDayCount)).toEqual(["0", "½", "1", "1½", "2"]);
    expect([0.5, 1, 1.5, 2].map(formatDays)).toEqual(["half a day", "1 day", "1½ days", "2 days"]);
  });
});

// ─── The one tally, the salary, the deductions ──────────────────────────────────────────────────

describe("the salary pays a half-day leave by the owner's rule", () => {
  it("inside the allowance the day is paid in full and uses half a day of it", () => {
    const c = july({ "2026-07-22": "half_leave" });
    expect(c.paidHalfLeaveDays).toBe(1);
    expect(c.unpaidHalfLeaveDays).toBe(0);
    expect(c.earnedDays).toBe(26);
    expect(c.paidLeavesRemaining).toBe(1.5);
    expect(paidLeaveUsed(c)).toBe(0.5);
    expect(deductionsFor(c).rows).toEqual([]);
    expect(netPayable(c)).toBe(SALARY);
    expect(c.lines.find(l => l.key === "half_leave")).toMatchObject({ label: "Half-day Leave (paid)", days: 1, factor: 1 });
    expect(c.attendancePercent).toBe(100);
  });

  it("past the allowance it costs exactly what a Half Day costs — at a factor of 0.5 and of 0.75", () => {
    for (const halfDayFactor of [0.5, 0.75]) {
      const leaveThenHalf = july({ "2026-07-13": "leave", "2026-07-14": "leave", "2026-07-22": "half_leave" }, { halfDayFactor });
      const leaveThenH = july({ "2026-07-13": "leave", "2026-07-14": "leave", "2026-07-22": "half" }, { halfDayFactor });
      expect(leaveThenHalf.unpaidHalfLeaveDays).toBe(1);
      expect(leaveThenHalf.earnedDays).toBeCloseTo(25 + halfDayFactor);
      const row = deductionsFor(leaveThenHalf).rows.find(r => r.key === "half_leave_unpaid");
      expect(row).toMatchObject({ label: "Half-day leave without pay", days: 1 });
      expect(row?.amount).toBeCloseTo(RATE * (1 - halfDayFactor));
      expect(netPayable(leaveThenHalf)).toBeCloseTo(netPayable(leaveThenH));
      expect(leaveThenHalf.lines.find(l => l.key === "half_leave_unpaid")?.factor).toBe(halfDayFactor);
    }
  });

  it("a full day the allowance covers only half of is half paid leave and half leave without pay", () => {
    const c = july({ "2026-07-13": "half_leave", "2026-07-14": "leave", "2026-07-15": "leave" });
    expect(c.paidLeaveDays).toBe(1.5);
    expect(c.unpaidLeaveDays).toBe(0.5);
    expect(c.paidLeavesRemaining).toBe(0);
    const row = deductionsFor(c).rows.find(r => r.key === "unpaid_leave");
    expect(row).toMatchObject({ days: 0.5, amount: RATE / 2 });
    expect(netPayable(c)).toBe(SALARY - RATE / 2);
  });

  it("is paid in date order — the earliest leave is the paid leave", () => {
    const t = tallyAttendance(
      ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"].map((date, i) => ({
        date, status: (i === 2 ? "leave" : "half_leave") as AttendanceStatus,
      })),
    );
    // ½ + ½ + 1 = the two days; the halves after are past it.
    expect([t.halfLeavePaid, t.halfLeaveUnpaid, t.paidLeave, t.unpaidLeave, t.allowanceUsed, t.leavesLeft]).toEqual([2, 2, 1, 0, 2, 0]);
  });

  it("never counts a Sunday, and the grid's summary reads the same tally", () => {
    const days = [{ date: "2026-07-19", status: "half_leave" as AttendanceStatus }, { date: "2026-07-20", status: "half_leave" as AttendanceStatus }];
    const sum = summarize(days, DEFAULT_PAYROLL_CONFIG);
    expect(sum.halfLeave).toBe(1);
    expect(sum.leavesLeft).toBe(1.5);
    expect(sum.presentDays).toBe(0.5);
  });

  it("a computation frozen before half-day leave existed reads as before", () => {
    const old = july({ "2026-07-13": "leave" });
    const frozen = { ...old } as SalaryComputation;
    delete frozen.paidHalfLeaveDays;
    delete frozen.unpaidHalfLeaveDays;
    expect(deductionsFor(frozen)).toEqual(deductionsFor(old));
    expect(paidLeaveUsed(frozen)).toBe(1);
  });
});

describe("the payslip prints half-day leave in plain decimals", () => {
  const textOf = (pdf: { internal: { pages: unknown[] } }) =>
    (pdf.internal.pages as (string[] | undefined)[]).flatMap(p => p ?? []).join("\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");

  it("lists the half-day leave rows and the half-paid leave as 1.5 — never a ½ glyph", async () => {
    const c = july({ "2026-07-13": "half_leave", "2026-07-14": "leave", "2026-07-15": "leave", "2026-07-22": "half_leave" });
    const text = textOf(await generatePayslipPdf({ month: "2026-07", employeeName: "Asha Rao", computation: c, netPayable: netPayable(c) }));
    expect(text).toContain("Half-day Leave (paid)");
    expect(text).toContain("Half-day Leave (unpaid)");
    expect(text).toContain("(1.5)");
    expect(text).toContain("Half-day Leave Adjustment (1)");
    expect(text).toContain("Leave Without Pay (0.5 days)");
    expect(text).not.toContain("½");
  });

  it("a slip with no half-day leave has no half-day rows", async () => {
    const c = july({ "2026-07-13": "leave" });
    const text = textOf(await generatePayslipPdf({ month: "2026-07", employeeName: "Asha Rao", computation: c, netPayable: netPayable(c) }));
    expect(text).not.toContain("Half-day Leave");
  });
});

// ─── The request, its approval, rejection and undo — on data that behaves like Firestore ─────────

describe("a half-day request from submission to undo", () => {
  it("is saved as one date with duration half_day, and a Sunday is refused", async () => {
    await expect(submitLeaveRequest({ uid: "asha", name: "Asha" }, { fromDate: "2026-07-19", toDate: "2026-07-19", reason: "", duration: "half_day" }))
      .rejects.toThrow(/Sunday/);
    const id = await submitLeaveRequest({ uid: "asha", name: "Asha" }, { fromDate: "2026-07-22", toDate: "2026-07-24", reason: " doctor ", duration: "half_day" });
    const saved = mem.__read(`leave_requests/${id}`);
    expect(saved).toMatchObject({ fromDate: "2026-07-22", toDate: "2026-07-22", duration: "half_day", status: "pending", reason: "doctor", month: "2026-07" });
    expect(saved).not.toHaveProperty("kind");
    expect(audit.mock.calls.at(-1)?.[0].summary).toBe("Asha requested a half-day leave on 2026-07-22");
  });

  it("a full-day request is saved with duration full_day", async () => {
    const id = await submitLeaveRequest({ uid: "asha", name: "Asha" }, { fromDate: "2026-07-22", toDate: "2026-07-23", reason: "" });
    expect(mem.__read(`leave_requests/${id}`)).toMatchObject({ toDate: "2026-07-23", duration: "full_day" });
  });

  it("approval inside the allowance writes Half-day leave, says so, and undo clears it", async () => {
    mem.__seed("users/asha", { role: "tech_member", name: "Asha" });
    mem.__seed("leave_requests/h1", { memberId: "asha" });
    const req = request("h1", "2026-07-22");
    const split = await approveLeaveRequest(req, { uid: "admin", name: "Tara" });
    expect(split.leaveDates).toEqual(["2026-07-22"]);
    expect(mem.__read("attendance/asha_2026-07-22")?.status).toBe("half_leave");
    expect(mem.__read("leave_requests/h1")).toMatchObject({ status: "approved", leaveDates: ["2026-07-22"], absentDates: [] });
    expect(notify.mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Half-day Leave Approved", link: "/tech/salary",
      message: expect.stringContaining("Half a day, within your paid leave allowance"),
    });
    expect(audit.mock.calls.at(-1)?.[0].summary).toBe("Approved Asha's half-day leave on 2026-07-22 — ½ paid leave, 0 unpaid");

    await undoLeaveDecision({ ...req, status: "approved", ...split }, { uid: "admin" });
    expect(mem.__read("attendance/asha_2026-07-22")).toBeUndefined();
    expect(mem.__read("leave_requests/h1")?.status).toBe("pending");
  });

  it("past the allowance writes a Half Day, counting the leave already on the grid; undo spares a corrected day", async () => {
    mem.__seed("users/asha", { role: "sales_member", name: "Asha" });
    mark("2026-07-13", "leave");
    mark("2026-07-14", "half_leave");
    mark("2026-07-15", "half_leave"); // ½ + ½ + 1 = the two days already
    mem.__seed("leave_requests/h2", { memberId: "asha" });
    const req = request("h2", "2026-07-22");
    const split = await approveLeaveRequest(req, { uid: "admin" });
    expect(split.absentDates).toEqual(["2026-07-22"]);
    expect(mem.__read("attendance/asha_2026-07-22")?.status).toBe("half");
    expect(notify.mock.calls.at(-1)?.[0]).toMatchObject({ link: "/sales/salary", message: expect.stringContaining("recorded and paid as a half day") });
    expect(approvalMarks({ ...req, ...split })).toEqual(new Map([["2026-07-22", "half"]]));

    mark("2026-07-22", "full"); // the admin corrected it by hand
    await undoLeaveDecision({ ...req, status: "approved", ...split }, { uid: "admin" });
    expect(mem.__read("attendance/asha_2026-07-22")?.status).toBe("full");
  });

  it("a full day with half a day left is written Leave and reported half paid", async () => {
    mem.__seed("users/asha", { role: "tech_member", name: "Asha" });
    mark("2026-07-13", "leave");
    mark("2026-07-14", "half_leave");
    mem.__seed("leave_requests/f1", { memberId: "asha" });
    const split = await approveLeaveRequest(request("f1", "2026-07-22", { duration: "full_day" }), { uid: "admin" });
    expect(split.days[0]).toMatchObject({ mark: "leave", paid: 0.5, unpaid: 0.5 });
    expect(mem.__read("attendance/asha_2026-07-22")?.status).toBe("leave");
    expect(notify.mock.calls.at(-1)?.[0]).toMatchObject({ title: "Leave Approved", message: expect.stringContaining("Half a day of paid leave, then half a day unpaid") });
  });

  it("an old request with no duration is a full day, and a half-day request never spans a range", () => {
    expect(requestWorkingDates({ fromDate: "2026-07-22", toDate: "2026-07-24" })).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"]);
    expect(requestWorkingDates({ fromDate: "2026-07-22", toDate: "2026-07-24", duration: "half_day" })).toEqual(["2026-07-22"]);
    expect(approvalMarks({ fromDate: "2026-07-22", toDate: "2026-07-22" })).toEqual(new Map([["2026-07-22", "leave"]]));
  });

  it("rejection names the half day", async () => {
    mem.__seed("users/asha", { role: "tech_member", name: "Asha" });
    mem.__seed("leave_requests/h3", { memberId: "asha" });
    await rejectLeaveRequest(request("h3", "2026-07-22"), "Busy day", { uid: "admin" });
    expect(mem.__read("leave_requests/h3")?.status).toBe("rejected");
    expect(notify.mock.calls.at(-1)?.[0].message).toBe("Your half-day leave request for 2026-07-22 was not approved: Busy day");
    expect(mem.__read("attendance/asha_2026-07-22")).toBeUndefined();
  });
});

// ─── The member's form ───────────────────────────────────────────────────────────────────────────

describe("Apply for leave — Full day or Half day", () => {
  const open = (c: SalaryComputation = july()) => {
    render(<LeavePanel month="2026-07" config={DEFAULT_PAYROLL_CONFIG} computation={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply for leave" }));
  };
  const setDate = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("starts on Full day with From and To, as before", () => {
    open();
    expect(screen.getByRole("radio", { name: "Full day" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText(/^To/)).toBeInTheDocument();
  });

  it("Half day asks for one date, refuses a Sunday, previews the allowance and saves duration half_day", async () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Half day" }));
    expect(screen.queryByLabelText(/^To/)).toBeNull();
    setDate("Date", "2026-07-19");
    expect(screen.getByText(/That day is a Sunday/)).toBeInTheDocument();
    expect(screen.getByTestId("leave-submit")).toBeDisabled();

    setDate("Date", "2026-07-22");
    const preview = screen.getByTestId("leave-preview");
    expect(preview).toHaveTextContent("Half a day requested · 22 Jul");
    expect(preview).toHaveTextContent("comes out of your paid leave allowance (half a day of it)");
    fireEvent.click(screen.getByTestId("leave-submit"));
    await waitFor(() => expect(mem.__all("leave_requests")).toHaveLength(1));
    expect(mem.__all("leave_requests")[0]).toMatchObject({ memberId: "asha", fromDate: "2026-07-22", toDate: "2026-07-22", duration: "half_day" });
    // Listed back as a half day.
    expect(await screen.findByText("Half day · 22 Jul")).toBeInTheDocument();
  });

  it("past the allowance the preview says the half day costs half a day's pay", () => {
    open(july({ "2026-07-13": "leave", "2026-07-14": "leave" }));
    expect(screen.getByTestId("leave-used")).toHaveTextContent("2 of 2 paid leaves used");
    fireEvent.click(screen.getByRole("radio", { name: "Half day" }));
    setDate("Date", "2026-07-22");
    expect(screen.getByTestId("leave-preview")).toHaveTextContent("recorded as a half day and costs half a day's pay");
  });

  it("the header counts a half-day leave as half a day", () => {
    open(july({ "2026-07-13": "half_leave" }));
    expect(screen.getByTestId("leave-used")).toHaveTextContent("½ of 2 paid leaves used");
  });
});

// ─── The approver's panel ────────────────────────────────────────────────────────────────────────

describe("Leave requests panel — the approver sees Full day or Half day", () => {
  it("labels each request and approves a half day as Half-day leave", async () => {
    AUTH.user = { uid: "techadmin", name: "Tara", role: "tech_admin" };
    mem.__seed("users/asha", { role: "tech_member", name: "Asha" });
    mem.__seed("leave_requests/h1", { memberId: "asha", memberName: "Asha", fromDate: "2026-07-22", toDate: "2026-07-22", month: "2026-07", duration: "half_day", reason: "", status: "pending" });
    mem.__seed("leave_requests/f1", { memberId: "ravi", memberName: "Ravi", fromDate: "2026-07-23", toDate: "2026-07-24", month: "2026-07", kind: "paid", reason: "", status: "pending" });
    render(<LeaveApprovalsPanel />);

    const rows = await screen.findAllByTestId("leave-approval-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("leave-duration")).toHaveTextContent("Half day");
    expect(rows[0]).toHaveTextContent("one half of the day off");
    // A request made before half days existed has no duration: it is a full day.
    expect(within(rows[1]).getByTestId("leave-duration")).toHaveTextContent("Full day");
    expect(rows[1]).toHaveTextContent("2 working days");

    await act(async () => { fireEvent.click(within(rows[0]).getByRole("button", { name: /Approve/ })); });
    await waitFor(() => expect(mem.__read("attendance/asha_2026-07-22")?.status).toBe("half_leave"));
    await waitFor(() => expect(screen.getAllByTestId("leave-approval-row")).toHaveLength(1));
  });
});

// ─── The Social Media TODAY board ────────────────────────────────────────────────────────────────

describe("the Social Media TODAY board reads half-day leave", () => {
  it("an approved half-day leave is away, with its own words; a pending half day is asked", () => {
    const base = { checksIn: true, dayOff: false, leaveAsked: false };
    expect(todayStatusOf({ ...base, mark: "half_leave" }).kind).toBe("half_leave");
    expect(todayStatusOf({ ...base, leaveAsked: true, leaveAskedHalf: true }).kind).toBe("half_leave_asked");
    expect(todayStatusOf({ ...base, leaveAsked: true }).kind).toBe("leave_asked");
    expect(TODAY_GROUP_OF.half_leave).toBe("away");
    expect(TODAY_GROUP_OF.half_leave_asked).toBe("away");
    expect(todayCounts(["half_leave", "half_leave_asked", "leave"]).leave).toBe(3);
  });

  it("a half-day request covers its one date; somebody who also asked for the whole day is not a half day", () => {
    const requests = [
      { memberId: "a", fromDate: "2026-07-22", toDate: "2026-07-24", status: "pending", duration: "half_day" },
      { memberId: "b", fromDate: "2026-07-22", toDate: "2026-07-22", status: "pending", duration: "half_day" },
      { memberId: "b", fromDate: "2026-07-21", toDate: "2026-07-23", status: "pending" },
    ];
    expect([...leaveAskedOn(requests, "2026-07-23")].sort()).toEqual(["b"]);
    expect([...halfDayLeaveAskedOn(requests, "2026-07-22")]).toEqual(["a"]);
  });
});
