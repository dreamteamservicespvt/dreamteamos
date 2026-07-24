import { describe, it, expect } from "vitest";
import { buildMemberPickerOptions, filterMemberPickerOptions } from "@/utils/memberPicker";
import type { AppUser, DailyCheckin, WorkAssignment } from "@/types";

/**
 * The Assign-To list leads with whoever is checked in and carrying the least live work, so the
 * obvious choice is on top — but it never removes anyone: the admin can still pick or search
 * for any member.
 */

const m = (uid: string, name: string, phone = ""): AppUser => ({ uid, name, phone, role: "tech_member" } as AppUser);
const job = (assignedTo: string, status: string): WorkAssignment => ({ assignedTo, status } as WorkAssignment);
const checkin = (memberId: string, extra: Partial<DailyCheckin> = {}): DailyCheckin =>
  ({ memberId, ...extra } as DailyCheckin);

const members = [m("a", "Anjali"), m("b", "Bhanu"), m("c", "Chetan")];
const checkinMap = (...cs: DailyCheckin[]) => new Map(cs.map((c) => [c.memberId, c]));

describe("buildMemberPickerOptions", () => {
  it("puts checked-in members above those who aren't", () => {
    const opts = buildMemberPickerOptions(members, [], checkinMap(checkin("c")));
    expect(opts[0].member.uid).toBe("c");
    expect(opts[0].checkedIn).toBe(true);
  });

  it("among equally-active members, the most vacant comes first", () => {
    const assignments = [job("a", "assigned"), job("a", "in_progress"), job("b", "assigned")];
    const opts = buildMemberPickerOptions(members, assignments, checkinMap(checkin("a"), checkin("b"), checkin("c")));
    expect(opts.map((o) => o.member.uid)).toEqual(["c", "b", "a"]);
    expect(opts.map((o) => o.activeCount)).toEqual([0, 1, 2]);
  });

  it("doesn't count delivered work against a member", () => {
    const assignments = [job("a", "completed"), job("a", "verified")];
    const opts = buildMemberPickerOptions(members, assignments, new Map());
    expect(opts.find((o) => o.member.uid === "a")!.activeCount).toBe(0);
  });

  it("treats a checked-out member as no longer active", () => {
    const opts = buildMemberPickerOptions(members, [], checkinMap(checkin("a", { checkedOutAt: {} as any })));
    expect(opts.find((o) => o.member.uid === "a")!.checkedIn).toBe(false);
  });

  it("never drops anyone — ranking is a suggestion, not a filter", () => {
    const opts = buildMemberPickerOptions(members, [], checkinMap(checkin("a")));
    expect(opts).toHaveLength(3);
  });
});

describe("filterMemberPickerOptions", () => {
  const digits = (v: string) => v.replace(/\D/g, "");
  const opts = buildMemberPickerOptions([m("a", "Anjali", "+919876543210"), m("b", "Bhanu")], [], new Map());

  it("returns the full ranked list when the search is empty", () => {
    expect(filterMemberPickerOptions(opts, "", digits)).toHaveLength(2);
  });

  it("matches on name, case-insensitively", () => {
    expect(filterMemberPickerOptions(opts, "anj", digits).map((o) => o.member.uid)).toEqual(["a"]);
  });

  it("matches on phone digits", () => {
    expect(filterMemberPickerOptions(opts, "543210", digits).map((o) => o.member.uid)).toEqual(["a"]);
  });
});
