import { describe, it, expect, afterEach } from "vitest";
import { cleanup, configure, render, screen } from "@testing-library/react";
import SalesEarningsCard from "@/components/sales/SalesEarningsCard";

/**
 * What a sales member sees their work has earned them.
 *
 * The card used to read "+ Incentives ₹0" until the 75% target gate opened, and then counted only
 * salary in the total. True of the payslip that minute and useless to the person selling: their own
 * month of work simply did not appear anywhere on the card meant to motivate them.
 *
 * So the accrued incentive is now counted in the headline. That is only honest while the condition
 * travels with the number, which is what these tests pin: the figure and the words "settled at 75%"
 * must both be on the card, so the total can never be read as money already banked.
 */

configure({ testIdAttribute: "data-test" });
afterEach(() => cleanup());

describe("incentives that have not reached the target yet", () => {
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

  /** Salary ₹5,000 + the ₹1,200 built up. The member's whole period, in one number. */
  it("counts it in the total", () => {
    render(<SalesEarningsCard {...withheld} />);
    expect(screen.getByTestId("earnings-total").textContent).toBe("₹6,200");
  });

  /**
   * The condition is what keeps the total above from being a promise. A number that big with no
   * qualifier next to it would read as money already due, so the words are not decoration.
   */
  it("says on the card that the total only settles at 75%", () => {
    render(<SalesEarningsCard {...withheld} />);
    const note = screen.getByTestId("incentive-withheld").textContent || "";
    expect(note).toContain("settled at 75% of target");
    expect(note).toContain("1,200"); // how much of the total is conditional
  });

  /** "You are at 61%" is a fact; "₹12,400 short" is an instruction. */
  it("says how much more selling locks it in", () => {
    render(<SalesEarningsCard {...withheld} />);
    const note = screen.getByTestId("incentive-withheld").textContent || "";
    expect(note).toContain("61% there");
    expect(note).toContain("12,400");
  });

  it("copes when the shortfall is not known", () => {
    render(<SalesEarningsCard {...withheld} incentiveShortfall={undefined} />);
    expect(screen.getByTestId("incentive-withheld").textContent).toContain("61%");
  });
});

describe("incentives that have been earned", () => {
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
