import { describe, it, expect } from "vitest";
import type { FlowAccount } from "@/types/flowAccounts";
import {
  DEFAULT_FLOW_SETTINGS, accountBalance, addMonths, canUseAccount, clipsAffordable, clipsSummary, creditCycleStart,
  creditsForClips, daysBetween, defaultClips, driveProgress, expiryFor, flowAccountDocId, holderOf, indianMobileDigits,
  flowCreditsQuestion, isIsoDay, maskSecret, nextAccountToUse, nextRefill, validateFlowAccountInput, withFlowDefaults,
} from "@/utils/flowAccounts";

const account = (over: Partial<FlowAccount> = {}): FlowAccount => ({
  id: over.id || "a@gmail.com",
  email: "a@gmail.com",
  password: "secret",
  authPhone: "+919876543210",
  createdOn: "2026-10-03",
  expiresOn: "2028-04-03",
  monthlyCredits: 1000,
  status: "active",
  addedBy: "m1",
  addedByName: "Ravi",
  addedByRole: "tech_member",
  assignedTo: null,
  memberIds: ["m1"],
  teamAdminId: "admin",
  inUseBy: null,
  used: {},
  history: [],
  ...over,
});

describe("the offer's dates", () => {
  it("expires 18 months after the account was made — on the same day, or the month's last", () => {
    expect(expiryFor("2026-10-03")).toBe("2028-04-03");
    expect(expiryFor("2026-08-31")).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("reads and checks calendar days", () => {
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2028-02-29")).toBe(true);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(daysBetween("2026-10-01", "2026-10-29")).toBe(28);
  });
});

describe("the credit month — it refills on the day the account was made", () => {
  it("starts on the creation day each month", () => {
    expect(creditCycleStart("2026-10-03", "2026-10-03")).toBe("2026-10-03");
    expect(creditCycleStart("2026-10-03", "2026-11-02")).toBe("2026-10-03");
    expect(creditCycleStart("2026-10-03", "2026-11-03")).toBe("2026-11-03");
    expect(nextRefill("2026-10-03", "2026-10-20")).toBe("2026-11-03");
  });

  it("refills on a short month's last day, and never drifts after it", () => {
    expect(creditCycleStart("2026-01-31", "2026-02-28")).toBe("2026-02-28");
    expect(creditCycleStart("2026-01-31", "2026-03-30")).toBe("2026-02-28");
    expect(creditCycleStart("2026-01-31", "2026-03-31")).toBe("2026-03-31");
  });

  it("counts only this month's spend against the 1,000", () => {
    const a = account({ used: { "2026-10-03": 960, "2026-11-03": 120 } });
    expect(accountBalance(a, "2026-10-20").remaining).toBe(40);
    expect(accountBalance(a, "2026-10-20").state).toBe("low");
    expect(accountBalance(a, "2026-11-04").remaining).toBe(880);
    expect(accountBalance(account({ used: { "2026-10-03": 995 } }), "2026-10-20").state).toBe("empty");
    expect(accountBalance(account({ expiresOn: "2026-10-10" }), "2026-10-20").state).toBe("expired");
    expect(accountBalance(account({ status: "blocked" }), "2026-10-20").state).toBe("blocked");
  });
});

describe("credits and clips", () => {
  it("prices clips by length — 15 / 12 / 10 / 7", () => {
    expect(creditsForClips({ s8: 4 })).toBe(48);
    expect(creditsForClips({ s10: 1, s8: 2, s6: 1, s4: 2 })).toBe(15 + 24 + 10 + 14);
    expect(creditsForClips({ s8: -3 })).toBe(0);
    expect(defaultClips(4)).toEqual({ s10: 0, s8: 4, s6: 0, s4: 0 });
  });

  it("says how many clips the credits can still make", () => {
    expect(clipsAffordable(1000)).toEqual({ s10: 66, s8: 83, s6: 100, s4: 142 });
    expect(clipsAffordable(0)).toEqual({ s10: 0, s8: 0, s6: 0, s4: 0 });
    expect(clipsSummary({ s8: 4, s10: 1 })).toBe("10s × 1 · 8s × 4");
  });

  it("takes stored settings, filling anything missing or broken with the defaults", () => {
    expect(withFlowDefaults(null)).toEqual(DEFAULT_FLOW_SETTINGS);
    const s = withFlowDefaults({ targetPerMember: 40, clipCosts: { s10: 20 } as never, driveDeadline: "nope" });
    expect(s.targetPerMember).toBe(40);
    expect(s.clipCosts).toEqual({ s10: 20, s8: 12, s6: 10, s4: 7 });
    expect(s.driveDeadline).toBe(DEFAULT_FLOW_SETTINGS.driveDeadline);
  });
});

describe("who holds an account, and which one to use next", () => {
  it("is held by whoever it was assigned to, else whoever added it", () => {
    expect(holderOf(account())).toBe("m1");
    expect(holderOf(account({ assignedTo: "m2" }))).toBe("m2");
    expect(canUseAccount(account({ assignedTo: "m2" }), "m1", "2026-10-20")).toBe(false);
    expect(canUseAccount(account(), "m1", "2026-10-20")).toBe(true);
  });

  it("uses the credits about to be lost first — the month that refills soonest — then the fuller one", () => {
    const refillsSoon = account({ id: "soon", createdOn: "2026-09-25", used: { "2026-09-25": 500 } });
    const refillsLate = account({ id: "late", createdOn: "2026-10-15", used: {} });
    const empty = account({ id: "empty", createdOn: "2026-10-01", used: { "2026-10-01": 1000 } });
    const others = account({ id: "theirs", addedBy: "m2", memberIds: ["m2"] });
    expect(nextAccountToUse([refillsLate, refillsSoon, empty, others], "m1", "2026-10-20")?.id).toBe("soon");
    expect(nextAccountToUse([refillsLate, refillsSoon], "m1", "2026-10-20", { exclude: "soon" })?.id).toBe("late");
    expect(nextAccountToUse([empty], "m1", "2026-10-20")).toBeNull();
  });
});

describe("the 30-account drive", () => {
  const settings = DEFAULT_FLOW_SETTINGS;
  const days = (n: number, day: string) => Array.from({ length: n }, () => day);

  it("measures a member against two a day from the drive's start", () => {
    // 3 Oct is day 5 of a drive that began on 29 Sep: the pace says 10 by now.
    const p = driveProgress([...days(6, "2026-10-01"), ...days(2, "2026-10-03")], settings, "2026-10-03");
    expect(p).toMatchObject({ target: 30, done: 8, addedToday: 2, expectedByToday: 10, behindBy: 2, status: "behind" });
    expect(p.daysLeft).toBe(27);
    expect(p.neededPerDay).toBe(1);
  });

  it("is done at the target, overdue after the deadline, on track at the pace", () => {
    expect(driveProgress(days(30, "2026-10-10"), settings, "2026-10-12").status).toBe("done");
    expect(driveProgress(days(10, "2026-10-01"), settings, "2026-10-30").status).toBe("overdue");
    expect(driveProgress(days(4, "2026-09-30"), settings, "2026-09-30").status).toBe("on_track");
    expect(driveProgress([], { ...settings, driveStart: "2026-11-01" }, "2026-10-20").status).toBe("not_started");
  });
});

describe("adding an account", () => {
  const today = "2026-10-02";
  it("needs an email, a password, an Indian mobile and a creation day that is not in the future", () => {
    expect(validateFlowAccountInput({ email: "x@gmail.com", password: "p", authPhone: "98765 43210", createdOn: today }, today)).toEqual({});
    const errors = validateFlowAccountInput({ email: "nope", password: "", authPhone: "12345", createdOn: "2026-10-05" }, today);
    expect(Object.keys(errors).sort()).toEqual(["authPhone", "createdOn", "email", "password"]);
  });

  it("reads a phone number however it is typed", () => {
    expect(indianMobileDigits("+91 98765-43210")).toBe("9876543210");
    expect(indianMobileDigits("09876543210")).toBe("9876543210");
    expect(indianMobileDigits("5876543210")).toBe("");
  });

  it("keys the account by its email, so it can only ever be recorded once", () => {
    expect(flowAccountDocId("  Ravi.Kumar+1@Gmail.com ")).toBe("ravi.kumar+1@gmail.com");
    expect(flowAccountDocId("a/b@gmail.com")).toBe("a_b@gmail.com");
  });

  it("masks a password until it is asked for", () => {
    expect(maskSecret("hunter22")).toBe("h••••••2");
    expect(maskSecret("ab")).toBe("••");
  });
});

describe("asking for the credits at hand-in", () => {
  const job = (over: Record<string, unknown> = {}) => ({ category: "promotional", assignedTo: "m1", flowCredits: null, ...over });
  const recorded = { total: 48, logIds: ["l1"], recordedAt: 1, recordedBy: "m1" };

  it("asks the member the job is assigned to, the first time, for every video job", () => {
    expect(flowCreditsQuestion(job(), "m1", false)).toBe("first");
    expect(flowCreditsQuestion(job({ category: "bulk_ads" }), "m1", false)).toBe("first");
  });

  it("never asks for a poster, someone else's job, or no job", () => {
    expect(flowCreditsQuestion(job({ category: "poster" }), "m1", false)).toBeNull();
    expect(flowCreditsQuestion(job(), "m2", false)).toBeNull();
    expect(flowCreditsQuestion(job(), null, false)).toBeNull();
    expect(flowCreditsQuestion(null, "m1", false)).toBeNull();
  });

  /** A job sent back for edits makes clips again — those cost credits too. */
  it("asks again on a later round, whether the first one recorded credits or none", () => {
    expect(flowCreditsQuestion(job({ flowCredits: recorded }), "m1", false)).toBe("again");
    expect(flowCreditsQuestion(job({ flowCredits: { ...recorded, total: 0, logIds: [], none: true } }), "m1", false)).toBe("again");
  });

  /** A hand-in that failed after the credits were saved is retried in the same sitting. */
  it("does not ask twice in one sitting", () => {
    expect(flowCreditsQuestion(job(), "m1", true)).toBeNull();
    expect(flowCreditsQuestion(job({ flowCredits: recorded }), "m1", true)).toBeNull();
  });
});
