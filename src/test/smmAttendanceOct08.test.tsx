/**
 * Social Media → Attendance — the TODAY board for the Social Media Team Lead's daily meeting (2026-10-08).
 *
 * First built as the pay-cycle grid of the people on the RUNNING months; the owner, live: "only today; some members
 * are not showing; she needs to know who is absent before the meeting." Chosen: grouped with the call list first,
 * the team automatic + editable by the lead, Call and WhatsApp beside the people to chase. Pinned here:
 *   • who is on the team — every month on the board (running, on hold, not started, history on hold), its seats AND
 *     its posts' own maker / publisher; a finished, renewed, not-renewing, removed or deleted month adds nobody;
 *     the lead's corrections (taken off wins; added by hand);
 *   • what a day says — an admin's mark, then the check-in, then Sunday / a holiday, then a pending leave request,
 *     then a team leader's "no check-in record", else "not checked in" (it used to be a blank cell all day);
 *   • the real board on the in-memory Firestore: the groups and counts, Call / WhatsApp links, a check-in moving a
 *     person to Present while it is open, Edit team writing `app_settings/smm_team` and the board following it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));

const mem = await import("./memoryFirestore");
const SmmAttendanceView = (await import("@/components/smm/SmmAttendanceView")).default;
import {
  applyTeamEdits, canSeeSmmAttendance, handlesHeading, leaveAskedOn, smmTeamFromMonths, todayCounts, todayStatusOf,
} from "@/utils/smmAttendance";
import type { SmmCampaign } from "@/types/smm";

configure({ testIdAttribute: "data-test" });

const TODAY = "2026-10-08";

const month = (over: Partial<SmmCampaign> & { id: string }): SmmCampaign => ({
  orderId: over.id, leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" },
  platforms: ["instagram"], commitments: { poster: 0, ai_ad: 4, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "arjun", name: "Arjun" }, publisher: { uid: "ravi", name: "Ravi" }, marketer: null, assistants: [{ uid: "bhanu", name: "Bhanu" }] },
  soldBy: "anil", soldByName: "Anil", watchers: [], status: "active", renewal: { state: "none" }, ...over,
} as SmmCampaign);
const nobody = { creator: null, publisher: null, marketer: null, assistants: [] };

const BOARD = [
  // Running.
  month({ id: "m1" }),
  // A post given to somebody with no seat on the month.
  month({ id: "m2", businessName: "Bhavani Sweets", team: { ...nobody, creator: { uid: "bhanu", name: "Bhanu" } },
    items: [{ id: "i1", makerUid: "chitra", makerName: "Chitra", publisherUid: null } as never] }),
  // On hold — ended, no renewal decision: still on the board, still the team.
  month({ id: "hold", businessName: "Old Client", cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" },
    team: { ...nobody, creator: { uid: "divya", name: "Divya" } } }),
  // Not started yet.
  month({ id: "later", businessName: "Next Month", cycle: { month: "2026-10", startDate: "2026-10-20", endDate: "2026-11-20" },
    team: { ...nobody, assistants: [{ uid: "gopi", name: "Gopi" }] } }),
  // Its seat holder has left the company.
  month({ id: "left", businessName: "Farah's Client", team: { ...nobody, marketer: { uid: "farah", name: "Farah" } } }),
];
const OFF_BOARD = [
  month({ id: "renewed", status: "renewed", team: { ...nobody, creator: { uid: "kiran", name: "Kiran" } } } as never),
  month({ id: "done", status: "completed", team: { ...nobody, creator: { uid: "kiran", name: "Kiran" } } } as never),
  month({ id: "lapsed", status: "lapsed", team: { ...nobody, creator: { uid: "kiran", name: "Kiran" } } } as never),
  month({ id: "gone", status: "deleted", team: { ...nobody, creator: { uid: "kiran", name: "Kiran" } } }),
];

describe("who is on the Social Media team", () => {
  it("is everybody on a month on the board — seats and posts, running, on hold or not started", () => {
    const team = smmTeamFromMonths([...BOARD, ...OFF_BOARD], TODAY);
    expect(team.map((p) => p.uid)).toEqual(["arjun", "bhanu", "chitra", "divya", "farah", "gopi", "ravi"]);
    expect(team.every((p) => p.source === "months")).toBe(true);
    const bhanu = team.find((p) => p.uid === "bhanu")!;
    expect(bhanu.seats).toEqual(["Creator", "Assistant"]);
    // The post's maker is on the team though she holds no seat.
    expect(team.find((p) => p.uid === "chitra")).toMatchObject({ seats: ["Creator"], clients: ["Bhavani Sweets"] });
  });

  it("says, for each person, which clients they handle and what they do for each (owner: write it on the card)", () => {
    const team = smmTeamFromMonths([...BOARD, ...OFF_BOARD], TODAY);
    const of = (uid: string) => team.find((p) => p.uid === uid)!;
    expect(of("bhanu").handles).toEqual([
      { client: "Bhavani Sweets", seats: ["Creator"], state: "running", startDate: "2026-10-01" },
      { client: "Lakshmi Jewellers", seats: ["Assistant"], state: "running", startDate: "2026-10-01" },
    ]);
    expect(handlesHeading(of("bhanu"))).toBe("Handles 2 clients");
    // A month on hold and one not started yet say so.
    expect(of("divya").handles).toEqual([{ client: "Old Client", seats: ["Creator"], state: "ended", startDate: "2026-09-01" }]);
    expect(of("gopi").handles).toEqual([{ client: "Next Month", seats: ["Assistant"], state: "upcoming", startDate: "2026-10-20" }]);
    // A post given to her is handling too.
    expect(of("chitra").handles).toEqual([{ client: "Bhavani Sweets", seats: ["Creator"], state: "running", startDate: "2026-10-01" }]);
    // Two months of one client (the next one already set up) are one line, the running one's state.
    const twice = smmTeamFromMonths([
      month({ id: "a", cycle: { month: "2026-10", startDate: "2026-10-20", endDate: "2026-11-20" }, team: { ...nobody, publisher: { uid: "x", name: "X" } } }),
      month({ id: "b", team: { ...nobody, creator: { uid: "x", name: "X" } } }),
    ], TODAY);
    expect(twice[0].handles).toEqual([{ client: "Lakshmi Jewellers", seats: ["Creator", "Publisher"], state: "running", startDate: "2026-10-01" }]);
  });

  it("follows the lead's corrections: taken off wins, added by hand joins", () => {
    const fromMonths = smmTeamFromMonths(BOARD, TODAY);
    const team = applyTeamEdits(fromMonths, { added: ["esha", "arjun"], removed: ["gopi", "esha2"] }, (uid) => (uid === "esha" ? "Esha" : ""));
    expect(team.map((p) => p.uid)).toEqual(["arjun", "bhanu", "chitra", "divya", "esha", "farah", "ravi"]);
    expect(team.find((p) => p.uid === "esha")).toMatchObject({ source: "added", seats: [], handles: [] });
    expect(handlesHeading(team.find((p) => p.uid === "esha")!)).toBe("Added to the team by the lead — no Social Media client yet");
    // Somebody added by hand AND taken off is off.
    expect(applyTeamEdits(fromMonths, { added: ["esha"], removed: ["esha"] }).some((p) => p.uid === "esha")).toBe(false);
  });

  it("is the lead's board, and the tech and main admin's", () => {
    expect(canSeeSmmAttendance({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(canSeeSmmAttendance({ role: "tech_admin" })).toBe(true);
    expect(canSeeSmmAttendance({ role: "main_admin" })).toBe(true);
    for (const role of ["tech_member", "tech_team_leader", "sales_admin", "sales_member", "accounts_admin"]) {
      expect(canSeeSmmAttendance({ role }), role).toBe(false);
    }
    expect(canSeeSmmAttendance(null)).toBe(false);
  });
});

describe("what a person's day says today", () => {
  const base = { checksIn: true, dayOff: false, leaveAsked: false };
  const at = new Date(2026, 9, 8, 9, 42);
  it("says 'not checked in' in words — it was a blank cell until the day was over", () => {
    expect(todayStatusOf(base).kind).toBe("not_in");
  });
  it("puts an admin's mark first, then the check-in, the day off, a leave request, a team leader", () => {
    expect(todayStatusOf({ ...base, mark: "leave", checkin: { inAt: at, outAt: null } })).toMatchObject({ kind: "leave", marked: true });
    expect(todayStatusOf({ ...base, mark: "half" }).kind).toBe("half");
    expect(todayStatusOf({ ...base, mark: "absent" }).kind).toBe("absent");
    expect(todayStatusOf({ ...base, checkin: { inAt: at, outAt: null }, leaveAsked: true })).toMatchObject({ kind: "present", inAt: at });
    // Somebody who came in on a holiday is here.
    expect(todayStatusOf({ ...base, dayOff: true, checkin: { inAt: at, outAt: null } }).kind).toBe("present");
    expect(todayStatusOf({ ...base, dayOff: true }).kind).toBe("holiday");
    expect(todayStatusOf({ ...base, leaveAsked: true }).kind).toBe("leave_asked");
    expect(todayStatusOf({ ...base, checksIn: false }).kind).toBe("no_checkin");
  });
  it("counts present, not checked in, leave (asked or approved) and absent", () => {
    expect(todayCounts(["present", "half", "not_in", "leave", "leave_asked", "absent", "no_checkin", "holiday"]))
      .toEqual({ present: 2, notIn: 1, leave: 2, absent: 1 });
  });
  it("finds the undecided leave requests that cover the day", () => {
    const reqs = [
      { memberId: "a", fromDate: "2026-10-07", toDate: "2026-10-09", status: "pending" },
      { memberId: "b", fromDate: "2026-10-09", toDate: "2026-10-09", status: "pending" },
      { memberId: "c", fromDate: "2026-10-08", toDate: "2026-10-08", status: "approved" },
    ];
    expect([...leaveAskedOn(reqs, "2026-10-08")]).toEqual(["a"]);
  });
});

describe("the board, on the in-memory Firestore", () => {
  const lead = { uid: "lakshmi", name: "Lakshmi", role: "tech_member" as const, smmLeader: true };
  const phone = (n: number) => `+9198765000${String(n).padStart(2, "0")}`;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 11, 0)); // Thursday 8 October
    mem.__reset();
    const u = (id: string, name: string, n: number, extra: Record<string, unknown> = {}) =>
      mem.__seed(`users/${id}`, { name, role: "tech_member", isActive: true, phone: phone(n), ...extra });
    u("arjun", "Arjun", 1);
    u("bhanu", "Bhanu", 2);
    u("chitra", "Chitra", 3);
    u("divya", "Divya", 4);
    u("esha", "Esha", 5);
    u("farah", "Farah", 6, { isActive: false });
    u("gopi", "Gopi", 7);
    u("hari", "Hari", 8);
    u("ravi", "Ravi", 9, { role: "tech_team_leader" });
    // Arjun came in at 9:42; Bhanu's approved leave is an admin's mark; Divya asked for leave nobody decided yet.
    mem.__seed("daily_checkins/c1", { memberId: "arjun", date: "2026-10-08", status: "checked_in", checkedInAt: mem.Timestamp.fromDate(new Date(2026, 9, 8, 9, 42)) });
    mem.__seed("daily_checkins/old", { memberId: "chitra", date: "2026-10-07", status: "approved", checkedInAt: mem.Timestamp.fromDate(new Date(2026, 9, 7, 9, 30)) });
    mem.__seed("attendance/bhanu_2026-10-08", { memberId: "bhanu", date: "2026-10-08", month: "2026-10", status: "leave" });
    mem.__seed("leave_requests/r1", { memberId: "divya", memberName: "Divya", fromDate: "2026-10-08", toDate: "2026-10-09", status: "pending" });
    // The lead added Esha by hand and took Gopi off.
    mem.__seed("app_settings/smm_team", { added: ["esha"], removed: ["gopi"] });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const group = (g: string) => screen.queryByTestId(`smm-group-${g}`);
  const namesIn = (g: string) => [...(group(g)?.querySelectorAll("[data-test='smm-today-name']") || [])].map((n) => n.textContent);

  it("groups today for the meeting: who to call first, who is not coming, who is in", async () => {
    render(<SmmAttendanceView campaigns={[...BOARD, ...OFF_BOARD]} user={lead} />);
    await waitFor(() => expect(namesIn("present")).toEqual(["Arjun"]));
    expect(screen.getByTestId("smm-attendance-date").textContent).toBe("Thursday, 8 October 2026");

    // Not checked in — the post's maker and the hand-added person — each with Call and WhatsApp.
    expect(namesIn("call")).toEqual(["Chitra", "Esha"]);
    const chitra = within(group("call")!).getAllByTestId("smm-today-person")[0];
    expect(within(chitra).getByTestId("smm-today-status").textContent).toBe("Not checked in");
    // Each card says what Social Media work the person handles — the client and what they do for it.
    expect(within(chitra).getByTestId("smm-today-handles").textContent).toBe("Handles 1 clientBhavani Sweets — Creator");
    const bhanuCard = within(group("away")!).getAllByTestId("smm-today-person")[0];
    expect(within(bhanuCard).getAllByTestId("smm-today-handle").map((li) => li.textContent))
      .toEqual(["Bhavani Sweets — Creator", "Lakshmi Jewellers — Assistant"]);
    const divyaCard = within(group("away")!).getAllByTestId("smm-today-person")[1];
    expect(within(divyaCard).getByTestId("smm-today-handle").textContent).toBe("Old Client — Creatormonth ended");
    const eshaCard = within(group("call")!).getAllByTestId("smm-today-person")[1];
    expect(within(eshaCard).getByTestId("smm-today-handles").textContent).toBe("Added to the team by the lead — no Social Media client yet");
    expect(within(chitra).getByTestId("smm-today-call").getAttribute("href")).toBe("tel:+919876500003");
    expect(within(chitra).getByTestId("smm-today-whatsapp").getAttribute("href")).toBe("https://wa.me/919876500003");

    // Not coming: the approved leave and the undecided request — no buttons, nobody needs to call them.
    expect(namesIn("away")).toEqual(["Bhanu", "Divya"]);
    expect(group("away")!.textContent).toContain("On leave");
    expect(group("away")!.textContent).toContain("Asked for leave — not approved yet");
    expect(within(group("away")!).queryByTestId("smm-today-call")).toBeNull();

    // Present, with the time.
    expect(within(group("present")!).getByTestId("smm-today-status").textContent).toBe("In at 9:42 AM");

    // The team leader on a seat is listed, not hidden: no check-in record, and reachable.
    expect(namesIn("unknown")).toEqual(["Ravi"]);
    expect(group("unknown")!.textContent).toContain("Tech Team Leader — doesn't check in");
    expect(within(group("unknown")!).getByTestId("smm-today-call")).toBeTruthy();

    // Taken off (Gopi), left the company (Farah) and off-board months' people (Kiran) are nowhere.
    expect(screen.getByTestId("smm-attendance").textContent).not.toMatch(/Gopi|Farah|Kiran/);

    // The four numbers.
    const n = (id: string) => screen.getByTestId(id).querySelector("p")!.textContent;
    expect([n("smm-count-present"), n("smm-count-notin"), n("smm-count-leave"), n("smm-count-absent")]).toEqual(["1", "2", "2", "0"]);
  });

  it("moves a person to Present the moment they check in, while the board is open", async () => {
    render(<SmmAttendanceView campaigns={BOARD} user={lead} />);
    await waitFor(() => expect(namesIn("call")).toEqual(["Chitra", "Esha"]));
    mem.__seed("daily_checkins/c2", { memberId: "chitra", date: "2026-10-08", status: "checked_in", checkedInAt: mem.Timestamp.fromDate(new Date(2026, 9, 8, 10, 58)) });
    await waitFor(() => expect(namesIn("present")).toEqual(["Arjun", "Chitra"]));
    expect(namesIn("call")).toEqual(["Esha"]);
  });

  it("says when nobody needs a call", async () => {
    mem.__seed("app_settings/smm_team", { added: [], removed: ["gopi", "chitra"] });
    render(<SmmAttendanceView campaigns={BOARD} user={lead} />);
    await waitFor(() => expect(screen.getByTestId("smm-attendance-allin")).toBeTruthy());
    expect(group("call")).toBeNull();
  });

  it("lets the lead add somebody, take somebody off and put them back — saved for everybody", async () => {
    render(<SmmAttendanceView campaigns={BOARD} user={lead} />);
    await waitFor(() => expect(namesIn("present")).toEqual(["Arjun"]));
    fireEvent.click(screen.getByTestId("smm-team-edit"));
    const dialog = await screen.findByTestId("smm-team-editor");

    // Add Hari (on no month).
    const pick = within(dialog).getByTestId("smm-team-pick") as HTMLSelectElement;
    await waitFor(() => expect([...pick.options].map((o) => o.value)).toContain("hari"));
    // Only people not on the team are offered.
    expect([...pick.options].map((o) => o.value)).not.toContain("arjun");
    fireEvent.change(pick, { target: { value: "hari" } });
    fireEvent.click(within(dialog).getByTestId("smm-team-add"));
    await waitFor(() => expect((mem.__read("app_settings/smm_team") as { added: string[] }).added).toContain("hari"));
    await waitFor(() => expect(namesIn("call")).toContain("Hari"));

    // Take Arjun (on a month) off: remembered as taken off, gone from the board.
    const arjunRow = within(within(dialog).getByTestId("smm-team-list")).getByText("Arjun").closest("li")!;
    fireEvent.click(within(arjunRow).getByTestId("smm-team-remove"));
    await waitFor(() => expect((mem.__read("app_settings/smm_team") as { removed: string[] }).removed).toContain("arjun"));
    await waitFor(() => expect(group("present")).toBeNull());

    // And back.
    const takenOff = await within(dialog).findByTestId("smm-team-takenoff");
    const arjunBack = within(takenOff).getByText("Arjun").closest("li")!;
    fireEvent.click(within(arjunBack).getByTestId("smm-team-putback"));
    await waitFor(() => expect((mem.__read("app_settings/smm_team") as { removed: string[] }).removed).not.toContain("arjun"));
    await waitFor(() => expect(namesIn("present")).toEqual(["Arjun"]));
    // A month's person put back is not "added by hand".
    expect((mem.__read("app_settings/smm_team") as { added: string[] }).added).not.toContain("arjun");
  });

  it("on a Sunday says the office is closed, and nobody is on the call list", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 10, 0)); // Sunday 11 October
    render(<SmmAttendanceView campaigns={BOARD} user={lead} />);
    expect((await screen.findByTestId("smm-attendance-dayoff")).textContent).toContain("Sunday");
    await waitFor(() => expect(namesIn("off").length).toBeGreaterThan(0));
    expect(group("call")).toBeNull();
  });

  it("says so when nobody is on the team, and shows no Edit team to someone who may not edit", async () => {
    mem.__seed("app_settings/smm_team", { added: [], removed: [] });
    render(<SmmAttendanceView campaigns={[]} user={{ uid: "x", name: "X", role: "tech_member" }} />);
    expect((await screen.findByTestId("smm-attendance-empty")).textContent).toContain("Nobody is on the Social Media team yet");
    expect(screen.queryByTestId("smm-team-edit")).toBeNull();
  });
});
