import { describe, it, expect, afterEach } from "vitest";
import { cleanup, configure, render, screen } from "@testing-library/react";
import SalesEarningsCard from "@/components/sales/SalesEarningsCard";

/**
 * What a sales member sees their work has earned them.
 *
 * The card used to read "+ Commission ₹0" until the 75% target gate opened. True of the payslip and
 * useless to the person selling: the number they want to watch all cycle is the one their work has
 * built up, and hiding it until the last week removes the only running feedback the job has.
 *
 * The line it must not cross is claiming the money is due. The accrued figure is shown, marked
 * pending, and the TOTAL stays exactly what will actually be paid.
 */

configure({ testIdAttribute: "data-test" });
afterEach(() => cleanup());

describe("commission that has not reached the target yet", () => {
  const withheld = {
    totalEarnings: 5000,
    salaryPayable: 5000,
    commission: 0,
    incentiveWithheld: true,
    commissionBeforeTarget: 1200,
    achievement: 0.61,
    incentiveShortfall: 12400,
  };

  it("shows what has been built up, not zero", () => {
    render(<SalesEarningsCard {...withheld} />);
    expect(screen.getByTestId("commission-pending").textContent).toContain("1,200");
  });

  /** It must still be legible as "building up", never as money already banked. */
  it("marks it as running, so it cannot read as money already due", () => {
    render(<SalesEarningsCard {...withheld} />);
    expect(screen.getByTestId("commission-pending").textContent).toContain("so far");
  });

  /** The total is what will actually be paid. Inflating it would be a lie about somebody's wages. */
  it("leaves it out of the total", () => {
    render(<SalesEarningsCard {...withheld} />);
    // Salary alone — the ₹1,200 accrued above is deliberately not added in.
    expect(screen.getByTestId("earnings-total").textContent).toBe("₹5,000");
    expect(screen.getByTestId("incentive-withheld").textContent).toContain("75%");
  });

  /** "You are at 61%" is a fact; "₹12,400 short" is an instruction. */
  it("says how much more selling unlocks it", () => {
    render(<SalesEarningsCard {...withheld} />);
    const note = screen.getByTestId("incentive-withheld").textContent || "";
    expect(note).toContain("61% there");
    expect(note).toContain("12,400");
    expect(note).toContain("1,200");
  });

  it("copes when the shortfall is not known", () => {
    render(<SalesEarningsCard {...withheld} incentiveShortfall={undefined} />);
    expect(screen.getByTestId("incentive-withheld").textContent).toContain("61%");
  });
});

describe("commission that has been earned", () => {
  it("shows it plainly, with no pending marker", () => {
    render(
      <SalesEarningsCard
        totalEarnings={6200}
        salaryPayable={5000}
        commission={1200}
        incentiveWithheld={false}
      />,
    );
    expect(screen.queryByTestId("commission-pending")).toBeNull();
    expect(screen.queryByTestId("incentive-withheld")).toBeNull();
    expect(screen.getByTestId("earnings-total").textContent).toBe("₹6,200");
  });
});
