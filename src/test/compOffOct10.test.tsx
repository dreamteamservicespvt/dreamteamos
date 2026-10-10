/**
 * Comp-off (owner, 2026-10-10): people who work on a holiday are paid for it at pay time by turning
 * their absences into paid days — a separate mark, never one of the two paid leaves.
 *
 * Rules the owner chose: the admin marks the holiday worked (W) by hand; a holiday worked earns ONE
 * credit whatever part of the day; credits are good in the same pay cycle only; Payroll applies them
 * to absences with one click (or the admin marks C on the grid).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within, configure } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const notify = vi.fn(async (_n: { userId: string; link?: string; meta?: unknown }) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification: (n: { userId: string; link?: string }) => notify(n) }));
vi.mock("@/services/auditLog", () => ({ recordAudit: vi.fn(async () => undefined) }));
const AUTH = { user: { uid: "admin", name: "Admin", role: "tech_admin" } };
vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(AUTH), { getState: () => AUTH }),
}));

const mem = await import("./memoryFirestore");
const { useMonthPayroll } = await import("@/hooks/useMonthPayroll");
const { applyCompOff, summarize } = await import("@/services/techAttendance");
const {
  compOffToApply, computeSalary, deductionsFor, isSundayDate, netPayable, payPeriodForMonth, periodDates, tallyAttendance,
} = await import("@/utils/payrollEngine");
const TeamAttendance = (await import("@/pages/shared/TeamAttendance")).default;

import type { AppUser } from "@/types";
import type { AttendanceStatus } from "@/services/techAttendance";
import type { ResolvedDay } from "@/types/payroll";

configure({ testIdAttribute: "data-test" });

const JULY = payPeriodForMonth("2026-07", 10); // 10 Jul → 9 Aug 2026: 26 working days → ₹1,000 a day on 26,000
/** Every working day Present, Sundays holiday, unless assigned. */
const julyDays = (assign: Record<string, AttendanceStatus>): ResolvedDay[] =>
  periodDates(JULY).map(date => ({ date, status: assign[date] ?? (isSundayDate(date) ? "holiday" : "full") }));
const pay = (days: ResolvedDay[]) =>
  computeSalary({ month: "2026-07", monthlySalary: 26000, days, todayStr: "2026-08-20", period: JULY });

describe("the comp-off rule", () => {
  it("a holiday worked earns a credit but no money by itself — the Sunday rule holds", () => {
    const c = pay(julyDays({ "2026-07-12": "holiday_work" })); // Sunday 12 Jul, worked
    expect(c.holidayWorkDays).toBe(1);
    expect(c.compOffLeft).toBe(1);
    expect(netPayable(c)).toBe(26000);
    expect(c.fullDays).toBe(26);
  });

  it("turns an absence into a paid day, and never touches the two paid leaves", () => {
    const before = pay(julyDays({
      "2026-07-12": "holiday_work", "2026-07-13": "leave", "2026-07-14": "leave", "2026-07-15": "absent",
    }));
    expect(netPayable(before)).toBe(25000);           // the absence costs a day
    const after = pay(julyDays({
      "2026-07-12": "holiday_work", "2026-07-13": "leave", "2026-07-14": "leave", "2026-07-15": "comp_off",
    }));
    expect(after.compOffDays).toBe(1);
    expect(after.paidLeaveDays).toBe(2);              // both leaves still paid
    expect(after.unpaidLeaveDays).toBe(0);
    expect(netPayable(after)).toBe(26000);
    expect(after.lines.find(l => l.key === "comp_off")?.label).toBe("Comp Off (holiday work)");
  });

  /** The old workaround — the absence marked Leave — made it the THIRD leave: unpaid, ₹1,000 deducted. */
  it("pays where marking the absence as Leave did not", () => {
    const viaLeave = pay(julyDays({ "2026-07-13": "leave", "2026-07-14": "leave", "2026-07-15": "leave" }));
    expect(netPayable(viaLeave)).toBe(25000);
  });

  it("a Comp Off with no holiday worked behind it is unpaid", () => {
    const c = pay(julyDays({ "2026-07-15": "comp_off" }));
    expect(c.compOffDays).toBe(0);
    expect(c.compOffUnpaidDays).toBe(1);
    expect(deductionsFor(c).rows.map(r => [r.key, r.days])).toEqual([["comp_off_unpaid", 1]]);
    expect(netPayable(c)).toBe(25000);
  });

  it("credits are good in their own pay cycle only", () => {
    // A holiday worked on 5 Jul belongs to June's cycle (10 Jun – 9 Jul) — July's computation never sees it.
    const c = computeSalary({
      month: "2026-07", monthlySalary: 26000, todayStr: "2026-08-20", period: JULY,
      days: [{ date: "2026-07-05", status: "holiday_work" }, ...julyDays({ "2026-07-15": "comp_off" })],
    });
    expect(c.holidayWorkDays).toBe(0);
    expect(c.compOffUnpaidDays).toBe(1);
  });

  it("an announced weekday holiday worked is still that paid holiday, plus a credit", () => {
    const c = pay(julyDays({ "2026-07-15": "holiday_work" })); // a Wednesday festival, worked
    expect(c.holidayDays).toBe(1);
    expect(c.compOffLeft).toBe(1);
    expect(netPayable(c)).toBe(26000);
  });

  it("Apply picks the earliest absences, as many as there are credits — never a leave", () => {
    const days = julyDays({
      "2026-07-12": "holiday_work", "2026-07-19": "holiday_work",
      "2026-07-16": "leave", "2026-07-21": "absent", "2026-07-15": "absent", "2026-07-28": "absent",
    });
    expect(compOffToApply(days)).toEqual(["2026-07-15", "2026-07-21"]);
    expect(tallyAttendance(days).compOffLeft).toBe(2);
  });

  it("the grid counts W and C the way the salary does", () => {
    const days = julyDays({ "2026-07-12": "holiday_work", "2026-07-15": "comp_off", "2026-07-16": "comp_off" });
    const s = summarize(days);
    expect([s.holidayWork, s.compOff, s.compOffUnpaid, s.compOffLeft]).toEqual([1, 1, 1, 0]);
  });
});

describe("Payroll applies comp off with one click", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 20, 11, 0)); // 20 Aug 2026 — July's cycle has closed
    mem.__reset();
    notify.mockClear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("offers the covered absences, writes Comp Off, and the row is paid in full", async () => {
    for (const d of periodDates(JULY)) {
      if (!isSundayDate(d) && d !== "2026-07-15" && d !== "2026-07-21") mem.__seed(`daily_checkins/asha_${d}`, { memberId: "asha", date: d });
    }
    mem.__seed("attendance/asha_2026-07-12", { memberId: "asha", date: "2026-07-12", month: "2026-07", status: "holiday_work" });
    const asha = { uid: "asha", name: "Asha", role: "tech_member", salary: 26000, isActive: true } as AppUser;
    const { result } = renderHook(() => useMonthPayroll([asha], "2026-07"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows[0].netSalary).toBe(24000);
    expect(result.current.rows[0].compOffToApply).toEqual(["2026-07-15"]); // one credit, two absences

    await act(async () => { await applyCompOff(asha, result.current.rows[0].compOffToApply, { uid: "admin" }); });
    await waitFor(() => expect(result.current.rows[0].netSalary).toBe(25000));
    expect(mem.__read("attendance/asha_2026-07-15")?.status).toBe("comp_off");
    expect(result.current.rows[0].compOffToApply).toEqual([]);
    expect(notify.mock.calls.at(-1)?.[0].link).toBe("/tech/salary");
  });
});

describe("the grid's mark picker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 11, 0)); // Thu 8 Oct 2026 — the 10 Sep → 9 Oct cycle
    mem.__reset();
    mem.__seed("users/admin", { name: "Admin", role: "tech_admin", isActive: true });
    mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", isActive: true, createdBy: "admin", employmentType: "full_time" });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const cell = (title: string) => {
    const table = screen.getByTestId("attendance-table");
    return [...table.querySelectorAll("tbody td button[title]")].find(b => b.getAttribute("title")?.includes(title)) as HTMLElement;
  };

  it("offers Worked on holiday on a Sunday, and Comp Off on a working day only once a credit exists", async () => {
    render(<TeamAttendance />);
    await waitFor(() => expect(within(screen.getByTestId("attendance-table")).getByText("Arjun")).toBeTruthy());

    fireEvent.click(cell("Mon 05 Oct"));
    const off = await screen.findByTestId("mark-comp-off");
    expect((off as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("mark-holiday-work")).toBeNull();
    fireEvent.click(screen.getByText("Auto (from check-in)"));

    await waitFor(() => expect(screen.queryByTestId("mark-comp-off")).toBeNull());
    fireEvent.click(cell("Sun 04 Oct"));
    fireEvent.click(await screen.findByTestId("mark-holiday-work"));
    await waitFor(() => expect(mem.__read("attendance/arjun_2026-10-04")?.status).toBe("holiday_work"));

    fireEvent.click(await screen.findByText("Done"));
    fireEvent.click(cell("Mon 05 Oct"));
    const off2 = await screen.findByTestId("mark-comp-off");
    expect((off2 as HTMLButtonElement).disabled).toBe(false);
    expect(off2.textContent).toContain("1 left");
  });
});
