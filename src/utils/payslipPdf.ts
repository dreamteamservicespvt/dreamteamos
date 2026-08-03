import jsPDF from "jspdf";
import { format, parse } from "date-fns";
import { COMPANY, amountInWords } from "./company";
import type { SalaryComputation } from "@/types/payroll";

/**
 * Salary slip PDF — laid out like a real payslip.
 *
 * Drawn with jsPDF primitives rather than screenshotting a DOM node: the text stays selectable
 * and searchable, the file is a few KB instead of a few MB, and the output is identical on every
 * machine regardless of fonts, zoom, or theme.
 *
 * Deliberately shows **no per-day rate**. A payslip states what was earned and what was
 * deducted; exposing the daily divisor makes salary read like piece-work, and it is the one
 * thing employees objected to. Day *counts* stay, because those are the facts behind a
 * deduction and an employee needs to be able to check them.
 *
 * Generated from a stored `SalaryComputation`, so re-downloading a slip years later reproduces
 * exactly what was paid — see types/payroll.PayrollLine.
 */

export interface PayslipInput {
  month: string;                 // yyyy-MM
  employeeName: string;
  /** Company employee ID, assigned by the tech admin. Falls back to a short uid. */
  employeeId?: string;
  role?: string;
  department?: string;
  computation: SalaryComputation;
  /** What the employee is actually paid — may differ from the computation after adjustments. */
  netPayable: number;
  paymentDate?: Date | null;
  transactionId?: string;
  paymentMethod?: string;
  paymentStatus?: string;
}

// A4 in points
const W = 595.28;
const H = 841.89;
const MARGIN = 40;
const CONTENT_W = W - MARGIN * 2;

// Palette — one ink colour, one accent, one rule. Anything more reads like a template.
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [226, 232, 240];
const ACCENT: [number, number, number] = [37, 99, 235];

/**
 * Money, for print.
 *
 * Guards against NaN/Infinity: this document leaves the building, and "Rs. NaN" on a payslip is
 * the kind of thing an employee photographs and forwards. A zero is wrong but legible; NaN is
 * wrong and alarming.
 */
const rupees = (n: number) =>
  `Rs. ${(Number.isFinite(n) ? Math.round(n) : 0).toLocaleString("en-IN")}`;

/**
 * The company logo as a data URL, for the letterhead.
 * Returns null if it can't be loaded — the slip then falls back to a wordmark rather than failing.
 */
async function loadLogo(): Promise<string | null> {
  try {
    // The black mark: a payslip is a white page, printed or on screen.
    const res = await fetch("/black_logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generatePayslipPdf(input: PayslipInput): Promise<jsPDF> {
  const { computation: c } = input;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await loadLogo();

  const monthLabel = format(parse(input.month, "yyyy-MM", new Date()), "MMMM yyyy");
  const day = (d: string, fmt: string) => format(parse(d, "yyyy-MM-dd", new Date()), fmt);
  const periodLabel = c.periodStart && c.periodEnd
    ? `${day(c.periodStart, "dd MMM yyyy")} to ${day(c.periodEnd, "dd MMM yyyy")}`
    : monthLabel;

  // ── Letterhead ────────────────────────────────────────────────────────────
  let y = MARGIN;

  let logoDrawn = false;
  if (logo) {
    try {
      // jsPDF stretches to whatever box you give it, so derive the width from the real image
      // rather than hard-coding one — a squashed logo is the first thing anyone notices, and
      // swapping the asset later must not silently distort it.
      const props = pdf.getImageProperties(logo);
      const height = 36;
      const width = props.height > 0 ? (props.width / props.height) * height : height;
      pdf.addImage(logo, "PNG", MARGIN, y, width, height, undefined, "FAST");
      logoDrawn = true;
    } catch {
      // Corrupt or unsupported image — fall through to the wordmark.
    }
  }
  if (!logoDrawn) {
    pdf.setFont("helvetica", "bold").setFontSize(17).setTextColor(...INK);
    pdf.text(COMPANY.name.toUpperCase(), MARGIN, y + 22);
  }

  // Company block, right-aligned against the logo
  pdf.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK);
  pdf.text(COMPANY.name, W - MARGIN, y + 10, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  pdf.text(COMPANY.website, W - MARGIN, y + 23, { align: "right" });
  pdf.text(COMPANY.email, W - MARGIN, y + 34, { align: "right" });
  pdf.text(`GSTIN: ${COMPANY.gstin}`, W - MARGIN, y + 45, { align: "right" });

  y += 62;
  pdf.setDrawColor(...INK).setLineWidth(1.2);
  pdf.line(MARGIN, y, W - MARGIN, y);
  pdf.setLineWidth(0.5);

  // ── Document title ────────────────────────────────────────────────────────
  y += 26;
  pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
  pdf.text("SALARY SLIP", W / 2, y, { align: "center" });
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  pdf.text(`For the pay period ${periodLabel}`, W / 2, y + 15, { align: "center" });

  y += 36;

  // ── Employee details ──────────────────────────────────────────────────────
  y = sectionRule(pdf, "EMPLOYEE DETAILS", y);
  y = pairGrid(pdf, y, [
    ["Employee Name", input.employeeName],
    ["Employee ID", input.employeeId?.trim() || "—"],
    ["Designation", input.role || "—"],
    ["Department", input.department || (input.role?.includes("Sales") ? "Sales" : "Technology")],
    ["Pay Period", periodLabel],
    ["Pay Date", input.paymentDate ? format(input.paymentDate, "dd MMM yyyy") : "—"],
  ]);

  // ── Attendance ────────────────────────────────────────────────────────────
  y += 14;
  y = sectionRule(pdf, "ATTENDANCE SUMMARY", y);
  y = pairGrid(pdf, y, [
    ["Working Days", String(c.workingDays)],
    ["Days Present", String(c.fullDays)],
    ["Half Days", String(c.halfDays)],
    ["Paid Leave", String(c.paidLeaveDays)],
    ["Loss of Pay Days", String(c.unpaidLeaveDays + c.absentDays)],
    ["Holidays", String(c.holidayDays)],
  ]);

  // ── Earnings and deductions ───────────────────────────────────────────────
  y += 14;
  y = sectionRule(pdf, "EARNINGS & DEDUCTIONS", y);

  const rate = c.dailySalary;
  const deductions: [string, number][] = [];
  if (c.absentDays > 0) deductions.push([`Loss of Pay (${c.absentDays} ${c.absentDays === 1 ? "day" : "days"})`, c.absentDays * rate]);
  if (c.halfDays > 0) deductions.push([`Half Day Adjustment (${c.halfDays})`, c.halfDays * rate * 0.5]);
  if (c.unpaidLeaveDays > 0) deductions.push([`Leave Without Pay (${c.unpaidLeaveDays} ${c.unpaidLeaveDays === 1 ? "day" : "days"})`, c.unpaidLeaveDays * rate]);
  if (c.lines.some(l => l.key === "holiday" && l.factor === 0) && c.holidayDays > 0) {
    deductions.push([`Unpaid Holidays (${c.holidayDays})`, c.holidayDays * rate]);
  }

  const earnings: [string, number][] = [["Basic Salary", c.monthlySalary]];
  for (const adj of c.adjustments) {
    if (adj.amount >= 0) earnings.push([adj.label, adj.amount]);
    else deductions.push([adj.label, Math.abs(adj.amount)]);
  }

  y = twoColumnLedger(pdf, y, earnings, deductions);

  // ── Net pay ───────────────────────────────────────────────────────────────
  y += 16;
  pdf.setFillColor(...INK);
  pdf.rect(MARGIN, y, CONTENT_W, 36, "F");
  pdf.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(10.5);
  pdf.text("NET PAY", MARGIN + 14, y + 23);
  pdf.setFontSize(15);
  pdf.text(rupees(input.netPayable), W - MARGIN - 14, y + 24, { align: "right" });
  y += 36;

  const netForWords = Number.isFinite(input.netPayable) ? Math.round(input.netPayable) : 0;
  pdf.setFillColor(248, 250, 252);
  pdf.rect(MARGIN, y, CONTENT_W, 24, "F");
  pdf.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(...INK);
  pdf.text(`Rupees ${amountInWords(netForWords).replace(" Rupees Only", " Only")}`, MARGIN + 14, y + 16);
  y += 42;

  // ── Payment details ───────────────────────────────────────────────────────
  y = sectionRule(pdf, "PAYMENT DETAILS", y);
  pairGrid(pdf, y, [
    ["Payment Status", (input.paymentStatus || "Pending").replace(/_/g, " ").toUpperCase()],
    ["Payment Mode", input.paymentMethod || "—"],
    ["Transaction Reference", input.transactionId || "—"],
    ["Payment Date", input.paymentDate ? format(input.paymentDate, "dd MMM yyyy") : "—"],
  ]);

  // ── Signature + footer, pinned to the page bottom ─────────────────────────
  const signY = H - 132;
  pdf.setDrawColor(...RULE);
  pdf.line(W - MARGIN - 150, signY, W - MARGIN, signY);
  pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INK);
  pdf.text(`For ${COMPANY.name}`, W - MARGIN, signY + 14, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
  pdf.text("Authorised Signatory", W - MARGIN, signY + 26, { align: "right" });

  const footY = H - 62;
  pdf.setDrawColor(...RULE);
  pdf.line(MARGIN, footY, W - MARGIN, footY);
  pdf.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
  pdf.text(
    "This is a computer-generated payslip and does not require a physical signature.",
    W / 2, footY + 14, { align: "center" },
  );
  pdf.text(
    `${COMPANY.name}  ·  ${COMPANY.website}  ·  Generated ${format(new Date(), "dd MMM yyyy")}`,
    W / 2, footY + 26, { align: "center" },
  );

  return pdf;
}

/** Generate and download in one step. */
export async function downloadPayslip(input: PayslipInput): Promise<void> {
  const pdf = await generatePayslipPdf(input);
  const safeName = input.employeeName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  pdf.save(`payslip-${safeName}-${input.month}.pdf`);
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

/** Small-caps section heading with a hairline under it. */
function sectionRule(pdf: jsPDF, label: string, y: number): number {
  pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...ACCENT);
  pdf.text(label, MARGIN, y);
  pdf.setDrawColor(...RULE);
  pdf.line(MARGIN, y + 6, W - MARGIN, y + 6);
  return y + 20;
}

/** Two-column label/value grid. */
function pairGrid(pdf: jsPDF, y: number, pairs: [string, string][]): number {
  const colW = CONTENT_W / 2;
  let row = y;

  pairs.forEach(([key, value], i) => {
    const col = i % 2;
    if (col === 0 && i > 0) row += 16;
    const x = MARGIN + col * colW;

    pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    pdf.text(key, x, row);
    pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK);
    pdf.text(value, x + colW - 14, row, { align: "right" });
  });

  return row + 18;
}

/**
 * The classic payslip ledger: earnings on the left, deductions on the right, each column
 * totalled. Reads the way an accountant expects, and makes the arithmetic checkable at a glance.
 */
function twoColumnLedger(
  pdf: jsPDF,
  y: number,
  earnings: [string, number][],
  deductions: [string, number][],
): number {
  const colW = CONTENT_W / 2;
  const rows = Math.max(earnings.length, deductions.length);
  const headerH = 20;
  const rowH = 17;
  const bodyH = Math.max(rows, 1) * rowH;

  // Header band
  pdf.setFillColor(241, 245, 249);
  pdf.rect(MARGIN, y, CONTENT_W, headerH, "F");
  pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INK);
  pdf.text("EARNINGS", MARGIN + 10, y + 13.5);
  pdf.text("AMOUNT", MARGIN + colW - 10, y + 13.5, { align: "right" });
  pdf.text("DEDUCTIONS", MARGIN + colW + 10, y + 13.5);
  pdf.text("AMOUNT", W - MARGIN - 10, y + 13.5, { align: "right" });

  const bodyTop = y + headerH;

  // Rows
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK);
  for (let i = 0; i < rows; i++) {
    const rowY = bodyTop + i * rowH + 12;
    if (earnings[i]) {
      pdf.text(earnings[i][0], MARGIN + 10, rowY);
      pdf.text(rupees(earnings[i][1]), MARGIN + colW - 10, rowY, { align: "right" });
    }
    if (deductions[i]) {
      pdf.text(deductions[i][0], MARGIN + colW + 10, rowY);
      pdf.text(rupees(deductions[i][1]), W - MARGIN - 10, rowY, { align: "right" });
    }
  }

  // Totals band
  const totalsY = bodyTop + bodyH;
  const grossTotal = earnings.reduce((s, [, v]) => s + v, 0);
  const dedTotal = deductions.reduce((s, [, v]) => s + v, 0);

  pdf.setFillColor(248, 250, 252);
  pdf.rect(MARGIN, totalsY, CONTENT_W, headerH, "F");
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK);
  pdf.text("Gross Earnings", MARGIN + 10, totalsY + 13.5);
  pdf.text(rupees(grossTotal), MARGIN + colW - 10, totalsY + 13.5, { align: "right" });
  pdf.text("Total Deductions", MARGIN + colW + 10, totalsY + 13.5);
  pdf.text(dedTotal > 0 ? `- ${rupees(dedTotal)}` : rupees(0), W - MARGIN - 10, totalsY + 13.5, { align: "right" });

  // Frame + centre divider
  const tableH = headerH + bodyH + headerH;
  pdf.setDrawColor(...RULE);
  pdf.rect(MARGIN, y, CONTENT_W, tableH);
  pdf.line(MARGIN + colW, y, MARGIN + colW, y + tableH);
  pdf.line(MARGIN, bodyTop, W - MARGIN, bodyTop);
  pdf.line(MARGIN, totalsY, W - MARGIN, totalsY);

  return y + tableH;
}
