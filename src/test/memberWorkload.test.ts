import { describe, it, expect } from "vitest";
import {
  assignedAtMs, buildMemberWorkload, filterMemberWorkload, RECENT_WORKLOAD_LIMIT,
} from "@/utils/memberWorkload";
import type { AppUser, WorkAssignment } from "@/types";

/**
 * The Team Workload wall regressed twice in the same way: members vanished from the roster, and
 * their finished work vanished from their cards. Both had the same shape — a filter that treated
 * "nothing live" as "nothing to show". These tests pin the roster behaviour so it cannot come back.
 */

const member = (uid: string, name: string, extra: Partial<AppUser> = {}): AppUser => ({
  uid, name, email: `${uid}@dts.test`, role: "tech_member", isActive: true, ...extra,
} as AppUser);

let seq = 0;
const work = (
  assignedTo: string,
  status: WorkAssignment["status"],
  overrides: Partial<WorkAssignment> = {},
): WorkAssignment => ({
  id: `a${seq++}`,
  assignedTo,
  status,
  uniqueId: `P${100 + seq}`,
  totalPrice: 499,
  assignedAt: { seconds: 1_700_000_000 + seq, nanoseconds: 0 },
  ...overrides,
} as WorkAssignment);

const digits = (v: string) => v.replace(/\D/g, "");

describe("buildMemberWorkload — the roster", () => {
  it("keeps a member on the wall when all of their work is verified", () => {
    const members = [member("u1", "Anjali")];
    const workload = buildMemberWorkload(members, [work("u1", "verified"), work("u1", "verified")]);

    expect(workload).toHaveLength(1);
    expect(workload[0].activeCount).toBe(0);
    // The whole point: the finished work is still listed on the card.
    expect(workload[0].assignments).toHaveLength(2);
    expect(workload[0].totalCount).toBe(2);
  });

  it("keeps a member on the wall when they have never been assigned anything", () => {
    const workload = buildMemberWorkload([member("u1", "Swathi")], []);

    expect(workload).toHaveLength(1);
    expect(workload[0].assignments).toEqual([]);
    expect(workload[0].totalCount).toBe(0);
    expect(workload[0].activeValue).toBe(0);
  });

  it("shows work at every status, not just the live ones", () => {
    const all: WorkAssignment["status"][] = ["assigned", "in_progress", "completed", "verified"];
    const workload = buildMemberWorkload(
      [member("u1", "Hasini")],
      all.map(s => work("u1", s)),
    );

    expect(workload[0].assignments).toHaveLength(4);
    expect(workload[0].activeCount).toBe(3); // everything except verified
  });

  it("counts and prices only live work as active", () => {
    const workload = buildMemberWorkload([member("u1", "Bhavani")], [
      work("u1", "assigned", { totalPrice: 999 }),
      work("u1", "in_progress", { totalPrice: 499 }),
      work("u1", "verified", { totalPrice: 5000 }),
    ]);

    expect(workload[0].activeCount).toBe(2);
    expect(workload[0].activeValue).toBe(1498);
    expect(workload[0].totalCount).toBe(3);
  });

  it("puts members with live work ahead of members without", () => {
    const workload = buildMemberWorkload(
      [member("u1", "Idle"), member("u2", "Busy")],
      [work("u1", "verified"), work("u2", "assigned")],
    );

    expect(workload.map(w => w.member.name)).toEqual(["Busy", "Idle"]);
  });

  it("orders each member's work newest first", () => {
    const older = work("u1", "assigned", { uniqueId: "P001", assignedAt: { seconds: 100, nanoseconds: 0 } as never });
    const newer = work("u1", "assigned", { uniqueId: "P002", assignedAt: { seconds: 900, nanoseconds: 0 } as never });

    const workload = buildMemberWorkload([member("u1", "Yamini")], [older, newer]);
    expect(workload[0].assignments.map(a => a.uniqueId)).toEqual(["P002", "P001"]);
  });

  it("caps the listed work but still reports the true total", () => {
    const many = Array.from({ length: RECENT_WORKLOAD_LIMIT + 5 }, () => work("u1", "verified"));
    const workload = buildMemberWorkload([member("u1", "Manasa")], many);

    expect(workload[0].assignments).toHaveLength(RECENT_WORKLOAD_LIMIT);
    expect(workload[0].totalCount).toBe(RECENT_WORKLOAD_LIMIT + 5);
  });

  it("ignores assignments belonging to someone outside the roster", () => {
    const workload = buildMemberWorkload([member("u1", "Siva")], [work("u9", "assigned")]);
    expect(workload[0].totalCount).toBe(0);
  });
});

describe("assignedAtMs — every stamp a document might carry", () => {
  it("reads a Firestore Timestamp", () => {
    expect(assignedAtMs(work("u1", "assigned", {
      assignedAt: { seconds: 1_700_000_000, nanoseconds: 0 } as never,
    }))).toBe(1_700_000_000_000);
  });

  it("falls back to the ISO mirror while serverTimestamp is still unresolved", () => {
    // A just-created assignment has a null assignedAt until the server round-trips. Without this
    // fallback the newest work on the page sorts to the very bottom.
    const ms = assignedAtMs(work("u1", "assigned", {
      assignedAt: undefined as never,
      assignedAtIso: "2026-07-23T09:30:00.000Z",
    }));
    expect(ms).toBe(Date.parse("2026-07-23T09:30:00.000Z"));
  });

  it("falls back to the plain date, then to zero", () => {
    expect(assignedAtMs(work("u1", "assigned", {
      assignedAt: undefined as never, assignedAtIso: undefined, date: "2026-07-23",
    }))).toBe(Date.parse("2026-07-23T00:00:00"));

    expect(assignedAtMs(work("u1", "assigned", {
      assignedAt: undefined as never, assignedAtIso: undefined, date: undefined,
    }))).toBe(0);
  });
});

describe("filterMemberWorkload — the wall's search box", () => {
  const workload = buildMemberWorkload(
    [member("u1", "Anjali", { phone: "9876543210" }), member("u2", "Bhanu Sri")],
    [
      work("u1", "assigned", { uniqueId: "P1262", businessName: "Sri Surya Traders" }),
      work("u2", "verified", { uniqueId: "P1237", businessName: "Mahatma Stores", businessWhatsapp: "9123456780" }),
    ],
  );

  it("returns everyone for an empty query", () => {
    expect(filterMemberWorkload(workload, "   ", digits)).toHaveLength(2);
  });

  it("matches a member by name", () => {
    expect(filterMemberWorkload(workload, "bhanu", digits).map(w => w.member.name)).toEqual(["Bhanu Sri"]);
  });

  it("matches a member by phone", () => {
    expect(filterMemberWorkload(workload, "98765", digits).map(w => w.member.name)).toEqual(["Anjali"]);
  });

  it("matches on business name and ad ID, verified work included", () => {
    expect(filterMemberWorkload(workload, "mahatma", digits).map(w => w.member.name)).toEqual(["Bhanu Sri"]);
    expect(filterMemberWorkload(workload, "p1262", digits).map(w => w.member.name)).toEqual(["Anjali"]);
  });

  it("matches the business's WhatsApp number", () => {
    expect(filterMemberWorkload(workload, "912345", digits).map(w => w.member.name)).toEqual(["Bhanu Sri"]);
  });
});
