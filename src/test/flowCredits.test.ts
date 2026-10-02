import { describe, it, expect } from "vitest";
import {
  DEFAULT_FLOW_SETTINGS, accountState, addMonths, canManageAiAccounts, canSeeFlowAccount, clipsAffordable, creditsFor,
  cycleStartOf, defaultRowsFor, expiryOf, hasRecordedCredits, isValidEmail, memberSummaries, nextResetOf, normaliseEmail, normalisePhone,
  pickDefaultAccount, targetProgress, teamAdminIdOf, teamTotals, validateFlowAccountInput, visibilityOf, withFlowDefaults,
} from "@/utils/flowCredits";
import type { FlowAccount } from "@/types/aiAccounts";

/**
 * The Flow accounts' arithmetic (2026-10-01): 1000 credits a month per account, refreshed on the day it
 * was created; 18 months of life; 15 / 12 / 10 / 7 credits for a 10 / 8 / 6 / 4-second clip; 30 accounts
 * per member by 29 October at two a day.
 */

const account = (over: Partial<FlowAccount> = {}): FlowAccount => ({
  id: "a@gmail.com", email: "a@gmail.com", phone: "9876543210", createdOn: "2026-10-01", expiresOn: "2028-04-01",
  monthlyCredits: 1000, addedBy: "m1", addedByName: "Ravi", addedByRole: "tech_member", ownerId: "m1", ownerName: "Ravi",
  holderId: "m1", holderName: "Ravi", visibleTo: ["m1"], teamAdminId: "admin", status: "active", usedByCycle: {}, ...over,
});

describe("the settings", () => {
  it("are the team's numbers by default", () => {
    expect(DEFAULT_FLOW_SETTINGS.clipCredits).toEqual({ 4: 7, 6: 10, 8: 12, 10: 15 });
    expect(DEFAULT_FLOW_SETTINGS.monthlyCredits).toBe(1000);
    expect(DEFAULT_FLOW_SETTINGS.validityMonths).toBe(18);
    expect(DEFAULT_FLOW_SETTINGS.targetPerMember).toBe(30);
    expect(DEFAULT_FLOW_SETTINGS.deadline).toBe("2026-10-29");
    expect(DEFAULT_FLOW_SETTINGS.dailyTarget).toBe(2);
  });

  it("take what was saved and keep the default for anything missing or broken", () => {
    const s = withFlowDefaults({ clipCredits: { 8: 14 } as never, monthlyCredits: 1200, deadline: "not a date" });
    expect(s.clipCredits).toEqual({ 4: 7, 6: 10, 8: 14, 10: 15 });
    expect(s.monthlyCredits).toBe(1200);
    expect(s.deadline).toBe("2026-10-29");
    expect(withFlowDefaults(null)).toEqual(DEFAULT_FLOW_SETTINGS);
  });
});

describe("dates: expiry and the monthly cycle", () => {
  it("adds calendar months, clamping to a shorter month", () => {
    expect(addMonths("2026-10-01", 18)).toBe("2028-04-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("expires an account 18 months after it was created", () => {
    expect(expiryOf("2026-10-01")).toBe("2028-04-01");
    expect(expiryOf("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("refreshes credits on the creation day each month", () => {
    expect(cycleStartOf("2026-10-05", "2026-10-05")).toBe("2026-10-05");
    expect(cycleStartOf("2026-10-05", "2026-10-31")).toBe("2026-10-05");
    expect(cycleStartOf("2026-10-05", "2026-11-04")).toBe("2026-10-05");
    expect(cycleStartOf("2026-10-05", "2026-11-05")).toBe("2026-11-05");
    expect(cycleStartOf("2026-01-31", "2026-03-15")).toBe("2026-02-28");
    expect(nextResetOf("2026-10-05", "2026-10-20")).toBe("2026-11-05");
    expect(nextResetOf("2026-01-31", "2026-02-28")).toBe("2026-03-31");
  });
});

describe("credits", () => {
  it("costs each clip by its length", () => {
    expect(creditsFor([{ seconds: 8, count: 4 }])).toBe(48);
    expect(creditsFor([{ seconds: 10, count: 2 }, { seconds: 6, count: 1 }, { seconds: 4, count: 3 }])).toBe(30 + 10 + 21);
    expect(creditsFor([{ seconds: 8, count: -2 }, { seconds: 8, count: 1.7 }])).toBe(12);
  });

  it("starts a job's entry at its clip count, every clip 8 seconds", () => {
    expect(defaultRowsFor(4)).toEqual([{ seconds: 8, count: 4 }]);
    expect(defaultRowsFor(0)).toEqual([{ seconds: 8, count: 1 }]);
  });

  it("knows what an account has left this cycle — and that a new cycle starts full", () => {
    const a = account({ createdOn: "2026-10-05", expiresOn: "2028-04-05", usedByCycle: { "2026-10-05": 960, "2026-09-05": 400 } });
    const now = accountState(a, "2026-10-20");
    expect(now).toMatchObject({ cycleStart: "2026-10-05", used: 960, remaining: 40, usable: true, expired: false });
    expect(accountState(a, "2026-11-06")).toMatchObject({ used: 0, remaining: 1000 });
    expect(accountState({ ...a, usedByCycle: { "2026-10-05": 1000 } }, "2026-10-20").usable).toBe(false);
    expect(accountState({ ...a, status: "disabled" }, "2026-10-20").usable).toBe(false);
    expect(accountState(a, "2028-04-05")).toMatchObject({ expired: true, usable: false });
  });

  it("knows when credits are recorded on an account (its creation date is then fixed)", () => {
    expect(hasRecordedCredits(account())).toBe(false);
    expect(hasRecordedCredits(account({ usedByCycle: { "2026-10-01": 0 } }))).toBe(false);
    expect(hasRecordedCredits(account({ usedByCycle: { "2026-09-01": 0, "2026-10-01": 12 } }))).toBe(true);
    expect(hasRecordedCredits(null)).toBe(false);
  });

  it("works out how many clips a number of credits buys", () => {
    expect(clipsAffordable(1000)).toEqual({ 4: 142, 6: 100, 8: 83, 10: 66 });
    expect(clipsAffordable(-5)).toEqual({ 4: 0, 6: 0, 8: 0, 10: 0 });
  });
});

describe("the account target — 30 by 29 October, two a day", () => {
  const s = DEFAULT_FLOW_SETTINGS;
  it("says who is ahead, on track or behind, and the pace still needed", () => {
    expect(targetProgress(4, s, "2026-10-01")).toMatchObject({ expectedByNow: 4, status: "on_track", remaining: 26, daysLeft: 29, perDayNeeded: 1 });
    expect(targetProgress(7, s, "2026-10-01").status).toBe("ahead");
    expect(targetProgress(2, s, "2026-10-05")).toMatchObject({ expectedByNow: 12, status: "behind", perDayNeeded: 2 });
    expect(targetProgress(30, s, "2026-10-10")).toMatchObject({ status: "done", remaining: 0, perDayNeeded: 0 });
    expect(targetProgress(20, s, "2026-10-30")).toMatchObject({ status: "missed", daysLeft: 0 });
    expect(targetProgress(29, s, "2026-10-29")).toMatchObject({ daysLeft: 1, perDayNeeded: 1 });
  });
});

describe("input", () => {
  it("cleans the email and the login phone", () => {
    expect(normaliseEmail("  Ravi.Flow01@Gmail.com ")).toBe("ravi.flow01@gmail.com");
    expect(isValidEmail("ravi@gmail.com")).toBe(true);
    expect(isValidEmail("ravi@gmail")).toBe(false);
    expect(normalisePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalisePhone("098765 43210")).toBe("9876543210");
    expect(normalisePhone("12345")).toBe("");
  });

  it("refuses an account with a field missing, wrong or in the future", () => {
    const ok = { email: "a@gmail.com", password: "pw", phone: "9876543210", createdOn: "2026-10-01" };
    expect(validateFlowAccountInput(ok, "2026-10-01")).toEqual({});
    const bad = validateFlowAccountInput({ email: "x", password: " ", phone: "1", createdOn: "2026-10-09" }, "2026-10-01");
    expect(Object.keys(bad).sort()).toEqual(["createdOn", "email", "password", "phone"]);
    expect(validateFlowAccountInput({ ...ok, password: "" }, "2026-10-01", { passwordRequired: false })).toEqual({});
  });
});

describe("who sees and manages what", () => {
  it("files every account under the tech admin's team", () => {
    expect(teamAdminIdOf({ uid: "admin", role: "tech_admin", createdBy: "main" })).toBe("admin");
    expect(teamAdminIdOf({ uid: "lead", role: "tech_team_leader", createdBy: "admin" })).toBe("admin");
    expect(teamAdminIdOf({ uid: "m1", role: "tech_member", createdBy: "admin" })).toBe("admin");
  });

  it("lets a member see what they added, own or hold — a manager sees all", () => {
    const a = account({ addedBy: "lead", ownerId: "lead", holderId: "m2" });
    expect(visibilityOf(a).sort()).toEqual(["lead", "m2"]);
    expect(canSeeFlowAccount({ uid: "m2", role: "tech_member" }, { visibleTo: visibilityOf(a) })).toBe(true);
    expect(canSeeFlowAccount({ uid: "m1", role: "tech_member" }, { visibleTo: visibilityOf(a) })).toBe(false);
    expect(canSeeFlowAccount({ uid: "x", role: "tech_team_leader" }, { visibleTo: [] })).toBe(true);
    expect(canManageAiAccounts({ role: "tech_member" })).toBe(false);
    expect(canManageAiAccounts({ role: "tech_team_leader" })).toBe(true);
  });

  it("starts a credit entry on the account in use, else the fullest one the member holds", () => {
    const today = "2026-10-10";
    const a = account({ id: "a", usedByCycle: { "2026-10-01": 990 } });
    const b = account({ id: "b", usedByCycle: { "2026-10-01": 100 } });
    const c = account({ id: "c", usedByCycle: { "2026-10-01": 1000 } });
    const someoneElse = account({ id: "d", holderId: "m9" });
    expect(pickDefaultAccount([a, b, c, someoneElse], "a", "m1", today)).toBe("a");
    expect(pickDefaultAccount([a, b, c], "c", "m1", today)).toBe("b");
    expect(pickDefaultAccount([someoneElse], "d", "m1", today)).toBe("");
  });
});

describe("the overview", () => {
  it("counts each member's accounts, what they hold and what is left", () => {
    const today = "2026-10-10";
    const accounts = [
      account({ id: "1", ownerId: "m1", holderId: "m1", usedByCycle: { "2026-10-01": 100 } }),
      account({ id: "2", ownerId: "m1", holderId: "m2", usedByCycle: { "2026-10-01": 50 } }),
      account({ id: "3", ownerId: "admin", holderId: "m2" }),
      account({ id: "4", ownerId: "m2", holderId: "m2", status: "disabled" }),
    ];
    const [m1, m2] = memberSummaries(accounts, [{ uid: "m1", name: "Ravi" }, { uid: "m2", name: "Kiran" }], DEFAULT_FLOW_SETTINGS, today);
    expect(m1).toMatchObject({ added: 2, holding: 1, used: 100, remaining: 900 });
    expect(m2).toMatchObject({ added: 1, holding: 3, used: 50, remaining: 950 + 1000 });
    expect(teamTotals(accounts, today)).toMatchObject({ accounts: 4, live: 3, capacity: 3000, used: 150, remaining: 2850 });
  });
});
