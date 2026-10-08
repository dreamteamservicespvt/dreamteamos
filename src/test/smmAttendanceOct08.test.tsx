/**
 * Social Media → Attendance (2026-10-08) — the Social Media Team Lead's view of their team's days.
 *
 * The owner's choices: the people holding a seat on a Social Media month RUNNING NOW; view only; the
 * pay-cycle grid Team Attendance shows; inside Social Media. Pinned here:
 *   • who is listed — every seat on the running months, once each, with their seats and clients; a month on
 *     hold, not started yet, a past month or a deleted one adds nobody;
 *   • who may open it — the lead, the tech admin and the main admin;
 *   • the real view on the in-memory Firestore: the days are the same as Team Attendance's (check-ins,
 *     manual marks, holidays), nothing on it can be clicked to change a day, and a seat-holder who never
 *     checks in (a team leader) is named under the grid instead of being shown absent all month.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));

const mem = await import("./memoryFirestore");
const SmmAttendanceView = (await import("@/components/smm/SmmAttendanceView")).default;
import { canSeeSmmAttendance, isRunningMonth, seatLine, smmTeamPeople } from "@/utils/smmAttendance";
import type { SmmCampaign } from "@/types/smm";

configure({ testIdAttribute: "data-test" });

const TODAY = "2026-10-08";
const month = (over: Partial<SmmCampaign> & { id: string }): SmmCampaign => ({
  orderId: over.id, leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" },
  platforms: ["instagram"], commitments: { poster: 0, ai_ad: 4, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "arjun", name: "Arjun" }, publisher: { uid: "ravi", name: "Ravi" }, marketer: null, assistants: [{ uid: "bhanu", name: "Bhanu" }] },
  soldBy: "anil", soldByName: "Anil", watchers: ["anil", "arjun", "ravi", "bhanu"], status: "active", renewal: { state: "none" }, ...over,
} as SmmCampaign);

const RUNNING = [
  month({ id: "m1" }),
  month({ id: "m2", businessName: "Bhavani Sweets", team: { creator: { uid: "bhanu", name: "Bhanu" }, publisher: { uid: "arjun", name: "Arjun" }, marketer: null, assistants: [] } }),
];
const NOT_RUNNING = [
  // Ended, no renewal decision yet — on hold, not running.
  month({ id: "hold", businessName: "Old Client", cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" }, team: { creator: { uid: "chandu", name: "Chandu" }, publisher: null, marketer: null, assistants: [] } }),
  month({ id: "later", businessName: "Next Month", cycle: { month: "2026-10", startDate: "2026-10-20", endDate: "2026-11-20" }, team: { creator: { uid: "dinesh", name: "Dinesh" }, publisher: null, marketer: null, assistants: [] } }),
  month({ id: "past", businessName: "Filled In", history: true, team: { creator: { uid: "esha", name: "Esha" }, publisher: null, marketer: null, assistants: [] } } as Partial<SmmCampaign> & { id: string }),
  month({ id: "gone", businessName: "Deleted", status: "deleted", team: { creator: { uid: "farah", name: "Farah" }, publisher: null, marketer: null, assistants: [] } }),
];

describe("who is on the Social Media team today", () => {
  it("lists every seat on the months running today, once each, with their seats and clients", () => {
    expect(smmTeamPeople([...RUNNING, ...NOT_RUNNING], TODAY)).toEqual([
      { uid: "arjun", name: "Arjun", seats: ["Creator", "Publisher"], clients: ["Bhavani Sweets", "Lakshmi Jewellers"] },
      { uid: "bhanu", name: "Bhanu", seats: ["Creator", "Assistant"], clients: ["Bhavani Sweets", "Lakshmi Jewellers"] },
      { uid: "ravi", name: "Ravi", seats: ["Publisher"], clients: ["Lakshmi Jewellers"] },
    ]);
    expect(seatLine({ seats: ["Creator", "Publisher"], clients: ["A", "B"] })).toBe("Creator · Publisher — 2 clients");
    expect(seatLine({ seats: ["Assistant"], clients: ["A"] })).toBe("Assistant — 1 client");
  });

  it("counts a month as running from its first day to its last", () => {
    const m = month({ id: "x", cycle: { month: "2026-10", startDate: "2026-10-08", endDate: "2026-11-08" } });
    expect(isRunningMonth(m, "2026-10-07")).toBe(false);
    expect(isRunningMonth(m, "2026-10-08")).toBe(true);
    expect(isRunningMonth(m, "2026-11-08")).toBe(true);
    expect(isRunningMonth(m, "2026-11-09")).toBe(false);
  });

  it("is the Social Media Team Lead's view, and the tech and main admin's", () => {
    expect(canSeeSmmAttendance({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(canSeeSmmAttendance({ role: "tech_team_leader", smmLeader: true })).toBe(true);
    expect(canSeeSmmAttendance({ role: "tech_admin" })).toBe(true);
    expect(canSeeSmmAttendance({ role: "main_admin" })).toBe(true);
    for (const role of ["tech_member", "tech_team_leader", "sales_admin", "sales_member", "accounts_admin"]) {
      expect(canSeeSmmAttendance({ role }), role).toBe(false);
    }
    expect(canSeeSmmAttendance(null)).toBe(false);
  });
});

describe("the view, on the in-memory Firestore", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 11, 0));
    mem.__reset();
    mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", isActive: true, createdBy: "admin" });
    mem.__seed("users/bhanu", { name: "Bhanu", role: "tech_member", isActive: true, createdBy: "admin" });
    mem.__seed("users/ravi", { name: "Ravi", role: "tech_team_leader", isActive: true, createdBy: "admin" });
    // Arjun checked in on the 6th and 7th; Bhanu's 6th was marked Leave by an admin; the 2nd is a holiday.
    mem.__seed("daily_checkins/c1", { memberId: "arjun", date: "2026-10-06", status: "approved" });
    mem.__seed("daily_checkins/c2", { memberId: "arjun", date: "2026-10-07", status: "approved" });
    mem.__seed("attendance/bhanu_2026-10-06", { memberId: "bhanu", date: "2026-10-06", status: "leave" });
    mem.__seed("holidays/2026-10-02", { date: "2026-10-02", label: "Gandhi Jayanti" });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("shows the tech members' days read-only, and names the team leader instead of marking him absent", async () => {
    render(<SmmAttendanceView campaigns={[...RUNNING, ...NOT_RUNNING]} today={TODAY} />);
    const table = await screen.findByTestId("attendance-table");
    await waitFor(() => expect(within(table).getAllByText("Arjun").length).toBe(1));
    // The two tech members, A–Z; nobody from a month that is not running.
    const names = [...table.querySelectorAll("tbody tr td:first-child .font-medium")].map((n) => n.textContent);
    expect(names).toEqual(["Arjun", "Bhanu"]);
    expect(table.textContent).not.toMatch(/Chandu|Dinesh|Esha|Farah/);
    // Each one's seats under their name.
    expect(within(table).getAllByTestId("smm-attendance-seats").map((n) => n.textContent)).toEqual([
      "Creator · Publisher — 2 clients", "Creator · Assistant — 2 clients",
    ]);
    // Days as Team Attendance works them out: checked in = P, a manual Leave = L, the holiday, absent before today.
    const arjun = table.querySelectorAll("tbody tr")[0];
    const cell = (row: Element, day: string) => [...row.querySelectorAll("td span[title]")].find((s) => s.getAttribute("title")?.includes(day));
    await waitFor(() => expect(cell(arjun, "07 Oct")?.textContent).toBe("P"));
    expect(cell(arjun, "06 Oct")?.textContent).toBe("P");
    expect(cell(arjun, "05 Oct")?.textContent).toBe("A");
    expect(cell(arjun, "02 Oct")?.getAttribute("title")).toContain("Holiday");
    const bhanu = table.querySelectorAll("tbody tr")[1];
    await waitFor(() => expect(cell(bhanu, "06 Oct")?.textContent).toBe("L"));
    expect(cell(bhanu, "06 Oct")?.getAttribute("title")).toContain("(manual)");
    // View only: nothing in the grid can be pressed.
    expect(table.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByTestId("attendance-cards").querySelectorAll("button")).toHaveLength(0);
    // The team leader on a seat never checks in — named, not gridded.
    expect(screen.getByTestId("smm-attendance-not-listed").textContent).toContain("Ravi (Tech Team Leader — does not check in)");
    // The cycle it covers, 10th → 9th.
    expect(screen.getByTestId("smm-attendance-cycle").textContent).toContain("10 Sep – 09 Oct");
  });

  it("pages back to an earlier pay cycle and reads that cycle's days, and never past today's", async () => {
    // Arjun also checked in on 1 Sep — a day of the cycle before (10 Aug → 9 Sep).
    mem.__seed("daily_checkins/c0", { memberId: "arjun", date: "2026-09-01", status: "approved" });
    render(<SmmAttendanceView campaigns={RUNNING} today={TODAY} />);
    const cycle = await screen.findByTestId("smm-attendance-cycle");
    const next = within(cycle).getByRole("button", { name: "Next cycle" });
    expect(cycle.textContent).toContain("Sep 2026");
    // The cycle running today is the newest one there is.
    expect(next).toBeDisabled();

    fireEvent.click(within(cycle).getByRole("button", { name: "Previous cycle" }));
    expect(cycle.textContent).toContain("Aug 2026");
    expect(cycle.textContent).toContain("10 Aug – 09 Sep");
    expect(next).not.toBeDisabled();
    const table = screen.getByTestId("attendance-table");
    await waitFor(() => expect(within(table).getAllByText("Arjun").length).toBe(1));
    const arjun = table.querySelectorAll("tbody tr")[0];
    const cell = (day: string) => [...arjun.querySelectorAll("td span[title]")].find((s) => s.getAttribute("title")?.includes(day));
    // That cycle's own check-in is read; October's days are not on it.
    await waitFor(() => expect(cell("01 Sep")?.textContent).toBe("P"));
    expect(cell("07 Oct")).toBeUndefined();

    fireEvent.click(next);
    expect(cycle.textContent).toContain("10 Sep – 09 Oct");
    expect(next).toBeDisabled();
    await waitFor(() => expect(cell("07 Oct")?.textContent).toBe("P"));
  });

  it("says so when no month is running", async () => {
    render(<SmmAttendanceView campaigns={NOT_RUNNING} today={TODAY} />);
    expect((await screen.findByTestId("smm-attendance-empty")).textContent).toContain("No Social Media month is running today");
  });
});
