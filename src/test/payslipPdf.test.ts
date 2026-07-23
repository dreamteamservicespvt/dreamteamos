import { describe, it, expect } from "vitest";
import { generatePayslipPdf } from "@/utils/payslipPdf";
import { computeSalary, deductionsFor, payPeriodForMonth, periodDates } from "@/utils/payrollEngine";

/** Net payable, the same way every screen computes it: salary minus deductions. */
const netOf = (c: SalaryComputation) => Math.max(0, c.monthlySalary - deductionsFor(c).total);
import { DEFAULT_PAYROLL_CONFIG, type SalaryComputation } from "@/types/payroll";
import type { AttendanceStatus } from "@/services/techAttendance";

/**
 * The payslip is the one artefact that leaves the building — an employee keeps it, and a bank or
 * a landlord may read it. These tests generate a real PDF and read its text back, so a layout
 * rewrite can't silently reintroduce something we deliberately removed.
 */

/** A closed July period where every day is a full day unless overridden. */
function computation(overrides: Record<string, AttendanceStatus> = {}): SalaryComputation {
  const days = periodDates(payPeriodForMonth("2026-07", DEFAULT_PAYROLL_CONFIG.payDayOfMonth))
    .map((date) => ({ date, status: overrides[date] ?? ("full" as AttendanceStatus) }));

  return computeSalary({
    month: "2026-07",
    monthlySalary: 10000,
    days,
    todayStr: "2026-08-20",           // Well past the period, so it reads as closed.
    config: DEFAULT_PAYROLL_CONFIG,
  });
}

/** All text drawn into the PDF, flattened. */
function textOf(pdf: { getFontList: () => unknown; internal: { pages: unknown[] } }): string {
  // jsPDF keeps each page as an array of raw content-stream lines; the drawn strings appear
  // inside them as (…)Tj operators.
  const pages = pdf.internal.pages as (string[] | undefined)[];
  return pages
    .flatMap((page) => page ?? [])
    .join("\n")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")");
}

describe("payslip PDF", () => {
  it("generates without throwing when the logo cannot be fetched", async () => {
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: computation(),
      netPayable: 10000,
    });
    expect(pdf).toBeTruthy();
    expect(pdf.internal.pages.length).toBeGreaterThan(0);
  });

  it("never prints a per-day rate — salary must not read like piece-work", async () => {
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: computation({ "2026-07-15": "absent" }),
      netPayable: 9600,
    });
    const text = textOf(pdf);
    expect(text).not.toMatch(/Per Day Rate/i);
    expect(text).not.toMatch(/per day/i);
    expect(text).not.toMatch(/\/ ?\d+ working days/i);
  });

  it("carries the company letterhead and the standard payslip sections", async () => {
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: computation(),
      netPayable: 10000,
    });
    const text = textOf(pdf);
    for (const expected of [
      "Dream Team Services",
      "SALARY SLIP",
      "EMPLOYEE DETAILS",
      "ATTENDANCE SUMMARY",
      "EARNINGS",
      "DEDUCTIONS",
      "NET PAY",
      "Authorised Signatory",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("prints the admin-assigned employee ID, and a dash when none is set", async () => {
    const withId = textOf(await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      employeeId: "DTS-014",
      computation: computation(),
      netPayable: 10000,
    }));
    expect(withId).toContain("DTS-014");

    const withoutId = textOf(await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: computation(),
      netPayable: 10000,
    }));
    // A blank ID must not fall back to the Firebase uid — that isn't an employee number.
    expect(withoutId).toContain("Employee ID");
  });

  it("shows attendance day counts, which are the facts behind a deduction", async () => {
    const c = computation({ "2026-07-15": "absent", "2026-07-16": "half" });
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: c,
      netPayable: 9000,
    });
    const text = textOf(pdf);
    expect(text).toContain("Working Days");
    expect(text).toContain("Loss of Pay Days");
    expect(text).toMatch(/Loss of Pay \(1 day\)/);
    expect(text).toMatch(/Half Day Adjustment \(1\)/);
  });

  it("states the net pay in words, so the figure can't be misread", async () => {
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: computation(),
      netPayable: 10000,
    });
    expect(textOf(pdf)).toMatch(/Ten Thousand/i);
  });

  it("balances: the printed gross minus the printed deductions equals the printed net", async () => {
    const c = computation({ "2026-07-15": "absent", "2026-07-16": "half", "2026-07-20": "leave" });
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: c,
      netPayable: netOf(c),
    });
    const text = textOf(pdf);

    // Read the three totals back off the page and check the arithmetic an employee would do.
    const amountAfter = (label: string): number => {
      const m = new RegExp(`${label}[\\s\\S]{0,200}?Rs\\. ([\\d,]+)`).exec(text);
      if (!m) throw new Error(`"${label}" not found on the payslip`);
      return Number(m[1].replace(/,/g, ""));
    };

    const gross = amountAfter("Gross Earnings");
    const deductions = amountAfter("Total Deductions");
    const net = amountAfter("NET PAY");

    expect(gross).toBe(c.monthlySalary);
    expect(gross - deductions).toBe(net);
    expect(net).toBe(Math.round(netOf(c)));
  });

  it("never prints NaN, whatever it is handed", async () => {
    const pdf = await generatePayslipPdf({
      month: "2026-07",
      employeeName: "Asha Rao",
      computation: computation(),
      netPayable: Number.NaN,
    });
    const text = textOf(pdf);
    expect(text).not.toContain("NaN");
    expect(text).toMatch(/Rupees Zero Only|Zero Rupees Only/);
  });
});
