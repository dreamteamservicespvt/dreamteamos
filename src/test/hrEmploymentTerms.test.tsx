import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Who fills in the employment record, and what that costs.
 *
 * The employee fills it in themselves — waiting on an admin left the card empty and useless. But
 * these fields print on an offer or appointment letter under the company's signature, so what an
 * employee enters is marked self-declared until an admin confirms it, and the policy levers that
 * decide how much notice they owe never move to their side at all.
 */

const { saveEmploymentTerms, confirmEmploymentTerms } = vi.hoisted(() => ({
  saveEmploymentTerms: vi.fn().mockResolvedValue(undefined),
  confirmEmploymentTerms: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/hr", () => ({ saveEmploymentTerms, confirmEmploymentTerms }));

import EmploymentTermsCard from "@/components/hr/EmploymentTermsCard";
import type { EmployeeProfile } from "@/types/hr";

const actor = { uid: "a1", name: "Asha Rao" };

const blank = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "m1", department: "tech", stage: "probation",
  probationReviews: [], assets: [], kycDocuments: [], separation: null,
  ...over,
});

const filled = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => blank({
  engagementType: "full_time", designation: "Software Developer",
  joiningDate: "2026-01-05", probationMonths: 3, ctcMonthly: 25000,
  workLocation: "Kakinada", workingHours: "10–7", workingDays: "Mon–Sat",
  ...over,
});

configure({ testIdAttribute: "data-test" });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("the employee looking at their own record", () => {
  it("cannot edit it — these are the company's terms, not a form to fill in", () => {
    // Letting one party to an agreement type the salary, designation and joining date, then print
    // them on a letter under the company's signature, made the admin an auditor of a form rather
    // than the person setting the term.
    render(<EmploymentTermsCard profile={blank()} actor={actor} mode="employee" />);
    expect(screen.queryByTestId("edit-terms")).not.toBeInTheDocument();
    expect(screen.queryByTestId("save-terms")).not.toBeInTheDocument();
  });

  it("is told who sets it and who to go to, rather than shown a dead screen", () => {
    render(<EmploymentTermsCard profile={blank()} actor={actor} mode="employee" />);
    expect(screen.getByTestId("terms-admin-only")).toHaveTextContent(/admin hasn't set your employment terms/i);
  });

  it("says the same thing once the terms are actually set", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="employee" />);
    expect(screen.getByTestId("terms-admin-only")).toHaveTextContent(/Set by your admin/i);
  });

  it("is never offered the Confirm button — confirming is the admin's act", () => {
    render(<EmploymentTermsCard actor={actor} mode="employee"
      profile={filled({ termsSelfDeclared: true, termsSelfDeclaredOn: "2026-02-01" })} />);
    expect(screen.queryByTestId("confirm-terms")).not.toBeInTheDocument();
  });

  it("still sees an unconfirmed record explained, from records entered before the lock", () => {
    render(<EmploymentTermsCard actor={actor} mode="employee"
      profile={filled({ termsSelfDeclared: true, termsSelfDeclaredOn: "2026-02-01" })} />);
    expect(screen.getByTestId("self-declared-banner")).toHaveTextContent(/not confirmed yet/i);
  });

  it("can read their notice period, which is theirs to know and not to set", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="employee" />);
    expect(screen.getByTestId("notice-period")).toBeInTheDocument();
  });

  it("shows them their employee ID, which lives outside the HR record", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="employee" employeeId="DTS-014" />);
    expect(screen.getByText("DTS-014")).toBeInTheDocument();
  });
});

describe("the admin reviewing it", () => {
  const selfDeclared = filled({ termsSelfDeclared: true, termsSelfDeclaredOn: "2026-02-01" });

  it("is told the employee entered it and what that means for a letter", () => {
    render(<EmploymentTermsCard profile={selfDeclared} actor={actor} mode="admin" />);
    expect(screen.getByTestId("self-declared-banner")).toHaveTextContent(/Entered by the employee/i);
    expect(screen.getByTestId("self-declared-banner")).toHaveTextContent(/under your signature/i);
  });

  it("can confirm without having to re-type correct values", async () => {
    render(<EmploymentTermsCard profile={selfDeclared} actor={actor} mode="admin" />);
    fireEvent.click(screen.getByTestId("confirm-terms"));
    await waitFor(() => expect(confirmEmploymentTerms).toHaveBeenCalledWith("m1", actor));
    expect(saveEmploymentTerms).not.toHaveBeenCalled();
  });

  it("confirms implicitly by editing — an admin's own save is the company's position", async () => {
    render(<EmploymentTermsCard profile={selfDeclared} actor={actor} mode="admin" />);
    fireEvent.click(screen.getByTestId("edit-terms"));
    fireEvent.click(screen.getByTestId("save-terms"));

    await waitFor(() => expect(saveEmploymentTerms).toHaveBeenCalled());
    expect(saveEmploymentTerms.mock.calls[0][3]).toEqual({ bySelf: false });
  });

  it("shows no confirm prompt once the terms are the company's record", () => {
    render(<EmploymentTermsCard actor={actor} mode="admin"
      profile={filled({ termsConfirmedByName: "Asha Rao", termsConfirmedOn: "2026-02-03" })} />);
    expect(screen.queryByTestId("self-declared-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("terms-confirmed")).toHaveTextContent("Confirmed by Asha Rao on 2026-02-03");
  });

  it("keeps the policy levers on the admin's side", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="admin" />);
    fireEvent.click(screen.getByTestId("edit-terms"));
    expect(screen.getByText(/critical senior role/i)).toBeInTheDocument();
  });

  it("can set a notice period for one member, whatever the policy says", async () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="admin" />);
    fireEvent.click(screen.getByTestId("edit-terms"));
    fireEvent.change(screen.getByTestId("terms-notice-days"), { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("save-terms"));

    await waitFor(() => expect(saveEmploymentTerms).toHaveBeenCalled());
    expect(saveEmploymentTerms.mock.calls[0][1].noticeDaysOverride).toBe(45);
  });

  it("clearing the box hands the member back to company policy", async () => {
    render(<EmploymentTermsCard profile={filled({ noticeDaysOverride: 45 })} actor={actor} mode="admin" />);
    fireEvent.click(screen.getByTestId("edit-terms"));
    fireEvent.change(screen.getByTestId("terms-notice-days"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("save-terms"));

    await waitFor(() => expect(saveEmploymentTerms).toHaveBeenCalled());
    expect(saveEmploymentTerms.mock.calls[0][1].noticeDaysOverride).toBeNull();
  });

  it("says when a notice period was set for this person rather than derived", () => {
    // An admin checking the figure needs to know which of the two it is.
    render(<EmploymentTermsCard profile={filled({ noticeDaysOverride: 45 })} actor={actor} mode="admin" />);
    expect(screen.getByTestId("notice-period")).toHaveTextContent("45 days");
    expect(screen.getByTestId("notice-period")).toHaveTextContent(/Set for this member/i);
  });

  it("says nothing of the sort when the policy produced it", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="admin" />);
    expect(screen.getByTestId("notice-period")).not.toHaveTextContent(/Set for this member/i);
  });
});

describe("an empty record", () => {
  it("states no probation and no notice period, rather than two fields disagreeing", () => {
    render(<EmploymentTermsCard profile={blank()} actor={actor} mode="employee" />);
    // The old card read "Probation: None" beside "15 days · During probation" for the same person.
    expect(screen.queryByTestId("notice-period")).not.toBeInTheDocument();
    expect(screen.queryByText(/During probation/i)).not.toBeInTheDocument();
  });

  it("states both once the record actually says something", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="employee" />);
    expect(screen.getByTestId("notice-period")).toHaveTextContent("15 days · During probation");
  });
});
