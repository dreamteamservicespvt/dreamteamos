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

describe("the employee filling in their own record", () => {
  it("is invited to fill it in rather than told to wait for an admin", () => {
    render(<EmploymentTermsCard profile={blank()} actor={actor} mode="employee" />);
    expect(screen.getByTestId("fill-in-hint")).toHaveTextContent(/Press Fill in to enter your role/i);
    expect(screen.getByTestId("edit-terms")).toHaveTextContent("Fill in");
  });

  it("saves what they entered, marked as self-declared", async () => {
    render(<EmploymentTermsCard profile={blank()} actor={actor} mode="employee" />);
    fireEvent.click(screen.getByTestId("edit-terms"));

    fireEvent.change(screen.getByTestId("terms-designation"), { target: { value: "Video Editor" } });
    fireEvent.change(screen.getByTestId("terms-joining"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByTestId("terms-salary"), { target: { value: "22000" } });
    fireEvent.click(screen.getByTestId("save-terms"));

    await waitFor(() => expect(saveEmploymentTerms).toHaveBeenCalledTimes(1));
    const [uid, terms, who, opts] = saveEmploymentTerms.mock.calls[0];
    expect(uid).toBe("m1");
    expect(terms.designation).toBe("Video Editor");
    expect(terms.joiningDate).toBe("2026-02-01");
    expect(terms.ctcMonthly).toBe(22000);
    expect(who).toBe(actor);
    expect(opts).toEqual({ bySelf: true });
  });

  it("is never offered the levers that decide its own notice period", () => {
    render(<EmploymentTermsCard profile={filled()} actor={actor} mode="employee" />);
    fireEvent.click(screen.getByTestId("edit-terms"));

    expect(screen.queryByLabelText(/notice period override/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/critical senior role/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/offer issued on/i)).not.toBeInTheDocument();
    expect(screen.getByText(/set by your admin/i)).toBeInTheDocument();
  });

  it("does not send those company terms even if they were already on the record", async () => {
    render(<EmploymentTermsCard actor={actor} mode="employee"
      profile={filled({ seniorRole: true, noticeDaysOverride: 60, offerIssuedOn: "2025-12-01" })} />);
    fireEvent.click(screen.getByTestId("edit-terms"));
    fireEvent.click(screen.getByTestId("save-terms"));

    await waitFor(() => expect(saveEmploymentTerms).toHaveBeenCalled());
    const [, terms] = saveEmploymentTerms.mock.calls[0];
    expect(terms).not.toHaveProperty("seniorRole");
    expect(terms).not.toHaveProperty("noticeDaysOverride");
    expect(terms).not.toHaveProperty("offerIssuedOn");
  });

  it("tells them their entry is awaiting confirmation, and offers them no Confirm button", () => {
    render(<EmploymentTermsCard actor={actor} mode="employee"
      profile={filled({ termsSelfDeclared: true, termsSelfDeclaredOn: "2026-02-01" })} />);
    expect(screen.getByTestId("self-declared-banner")).toHaveTextContent(/Your admin will check and confirm/i);
    expect(screen.queryByTestId("confirm-terms")).not.toBeInTheDocument();
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
