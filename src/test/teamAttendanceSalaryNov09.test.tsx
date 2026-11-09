/**
 * 2026-11-09 — Team Attendance as the tech team leader: each member's salary for the period under their totals
 * (Payroll's own figure from this attendance; the paid amount once paid), and 🎉 for an announced holiday while a
 * Sunday keeps "—". The sales side shows no salary line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
const AUTH: { user: Record<string, unknown> } = { user: {} };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));

const mem = await import("./memoryFirestore");
const TeamAttendance = (await import("@/pages/shared/TeamAttendance")).default;

configure({ testIdAttribute: "data-test" });

// 2026-10-20: the running period is 10 Oct → 9 Nov; the one before (Sep 10 → Oct 9) has ended.
describe("Team Attendance — salary line and holiday mark", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 11, 0));
    mem.__reset();
    AUTH.user = { uid: "lead", name: "Lead", role: "tech_team_leader", createdBy: "admin" };
    mem.__seed("users/admin", { name: "Admin", role: "tech_admin", isActive: true });
    mem.__seed("users/lead", { name: "Lead", role: "tech_team_leader", isActive: true, createdBy: "admin" });
    mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", isActive: true, createdBy: "admin", salary: 26000 });
    mem.__seed("users/bina", { name: "Bina", role: "tech_member", isActive: true, createdBy: "admin" });
    mem.__seed("holidays/2026-10-14", { date: "2026-10-14", label: "Company day", createdBy: "admin" });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("shows each member's salary, days paid and an estimate note to the team leader", async () => {
    render(<TeamAttendance />);
    const table = await screen.findByTestId("attendance-table");
    await waitFor(() => expect(within(table).getByText("Arjun")).toBeTruthy());
    const amounts = within(table).getAllByTestId("grid-pay-amount").map((n) => n.textContent);
    // Arjun never checked in: 10–19 Oct are absent → salary less those days. Bina has no salary set.
    expect(amounts.some((t) => t?.startsWith("₹"))).toBe(true);
    expect(amounts).toContain("No salary set");
    const notes = within(table).getAllByTestId("grid-pay-note").map((n) => n.textContent);
    expect(notes.every((t) => t?.startsWith("Est. · "))).toBe(true);
    const daysText = within(table).getAllByTestId("grid-pay-days")[0].textContent!;
    expect(daysText).toMatch(/\/ \d+ days paid$/);
  });

  it("an announced holiday shows 🎉, a Sunday keeps —, and the legend names both", async () => {
    render(<TeamAttendance />);
    const table = await screen.findByTestId("attendance-table");
    await waitFor(() => expect(within(table).getByText("Arjun")).toBeTruthy());
    const cells = [...table.querySelectorAll("tbody tr:first-child td button[title]")];
    await waitFor(() => expect(cells.find((b) => b.getAttribute("title")?.includes("14 Oct"))?.textContent).toBe("🎉"));
    const sunday = cells.find((b) => b.getAttribute("title")?.includes("Sun 11 Oct"))!;
    expect(sunday.textContent).toBe("—");
    expect(sunday.getAttribute("title")).toContain("Sunday");
    expect(screen.getByTestId("legend-holiday").textContent).toContain("Holiday");
    expect(screen.getByText("— · Sunday")).toBeTruthy();
  });

  it("a paid period shows the amount paid and Paid", async () => {
    mem.__seed("payroll_lines/2026-10_arjun", {
      month: "2026-10", memberId: "arjun", paymentStatus: "completed", netSalary: 21500,
    });
    render(<TeamAttendance />);
    const table = await screen.findByTestId("attendance-table");
    await waitFor(() => expect(within(table).getAllByTestId("grid-pay-amount").map((n) => n.textContent)).toContain("₹21,500"));
    expect(within(table).getAllByTestId("grid-pay-note").map((n) => n.textContent)).toContain("Paid");
  });

  it("the sales side shows no salary line", async () => {
    AUTH.user = { uid: "sadmin", name: "Sales Admin", role: "sales_admin" };
    mem.__seed("users/sadmin", { name: "Sales Admin", role: "sales_admin", isActive: true });
    mem.__seed("users/sam", { name: "Sam", role: "sales_member", isActive: true, createdBy: "sadmin", salary: 20000 });
    render(<TeamAttendance />);
    const table = await screen.findByTestId("attendance-table");
    await waitFor(() => expect(within(table).getByText("Sam")).toBeTruthy());
    expect(within(table).queryAllByTestId("grid-pay")).toHaveLength(0);
  });
});
