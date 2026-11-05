/**
 * Pausing a running SMM month (owner, 2026-11-05) — the writes on the in-memory Firestore: the renewal day,
 * the pieces' dates, the pause record, the order's and the open jobs' deadline, who may, the 15-day cap and
 * the people told.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn(async (_n: Record<string, unknown>) => undefined) }));
vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));

const mem = await import("./memoryFirestore");
const { useAuthStore } = await import("@/store/authStore");
const svc = await import("@/services/smmPause");
import { month as fixtureMonth, piece } from "./smmDeliveryFixtures";
import type { AppUser } from "@/types";

const person = (uid: string, role: string, over: Partial<AppUser> = {}) =>
  ({ uid, id: uid, name: uid[0].toUpperCase() + uid.slice(1), role, isActive: true, ...over }) as unknown as AppUser;
const KIRAN = person("kiran", "tech_admin");
const SITA = person("sita", "sales_member");
const RAVI = person("ravi", "tech_member");
const MANASA = person("manasa", "tech_member", { smmLeader: true });
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });
const act = (u: AppUser) => ({ uid: u.uid, name: (u as any).name, role: (u as any).role });

const PATH = "smm_campaigns/m1";
const read = () => mem.__read(PATH) as any;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T11:00:00"));
  mem.__reset();
  sendNotification.mockClear();
  const m = fixtureMonth({
    watchers: ["ravi", "priya", "mani", "sita"],
    items: [
      piece({ id: "a", uploadDate: "2026-10-22", status: "planned" }),
      piece({ id: "c", uploadDate: "2026-10-23", status: "posted" }),
    ],
  });
  mem.__seed(PATH, { ...m, id: undefined } as never);
  mem.__seed("orders/o_1", { id: "o_1", promise: { presetKey: "smm_month", label: "by 14 Nov" } } as never);
  mem.__seed("work_assignments/j1", { orderId: "o_1", smmCampaignId: "m1", status: "assigned", promise: null } as never);
  mem.__seed("work_assignments/j2", { orderId: "o_1", smmCampaignId: "m1", status: "completed", promise: { label: "old" } } as never);
});
afterEach(() => vi.useRealTimers());

describe("pauseMonth", () => {
  it("moves the renewal day, the unposted pieces and the deadlines, and tells the team", async () => {
    signIn(SITA);
    await svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-10-25", reasonKind: "client_asked", note: "owner travelling" }, act(SITA));
    const m = read();
    expect(m.cycle.endDate).toBe("2026-11-20");
    expect(m.items.find((i: any) => i.id === "a").uploadDate).toBe("2026-10-27");
    expect(m.items.find((i: any) => i.id === "c").uploadDate).toBe("2026-10-23");
    expect(m.pause).toMatchObject({ from: "2026-10-20", until: "2026-10-25", endBefore: "2026-11-15", byUid: "sita", byName: "Sita", note: "owner travelling" });
    expect((mem.__read("orders/o_1") as any).promise.label).toBe("by 19 Nov");
    expect((mem.__read("work_assignments/j1") as any).promise.label).toBe("by 19 Nov");
    expect((mem.__read("work_assignments/j2") as any).promise.label).toBe("old"); // handed in — left alone
    const told = sendNotification.mock.calls.map((c) => c[0] as any);
    expect(told.map((n) => n.userId).sort()).toEqual(["mani", "priya", "ravi"]);
    expect(told[0]).toMatchObject({ type: "smm_paused", link: "/smm/m1" });
    expect(told[0].message).toBe("Lakshmi Jewellers: Pauses 20–24 Oct · back on 25 Oct · renewal moved to 20 Nov. Why: Client asked — owner travelling. Paused by Sita.");
  });

  it("refuses a member, the view-only lead, and more than 15 days unless an admin", async () => {
    signIn(RAVI);
    await expect(svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-10-25", reasonKind: "client_asked" }, act(RAVI)))
      .rejects.toThrow(/salesperson or an admin/);
    signIn(MANASA);
    await expect(svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-10-25", reasonKind: "client_asked" }, act(MANASA)))
      .rejects.toThrow(/View only/);
    signIn(SITA);
    await expect(svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-11-05", reasonKind: "client_asked" }, act(SITA)))
      .rejects.toThrow(/at most 15 days/);
    expect(read().pause ?? null).toBeNull();
    expect(read().cycle.endDate).toBe("2026-11-15");
    signIn(KIRAN);
    await svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-11-05", reasonKind: "client_asked" }, act(KIRAN));
    expect(read().cycle.endDate).toBe("2026-12-01");
  });
});

describe("changing and cancelling", () => {
  it("resume now records the days taken and pulls the renewal day back", async () => {
    signIn(SITA);
    await svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-10-25", reasonKind: "festival" }, act(SITA));
    vi.setSystemTime(new Date("2026-10-22T10:00:00"));
    await svc.changePauseRestart("m1", "2026-10-22", act(SITA));
    const m = read();
    expect(m.pause).toBeNull();
    expect(m.pauses).toEqual([expect.objectContaining({ from: "2026-10-20", until: "2026-10-22", days: 2 })]);
    expect(m.cycle.endDate).toBe("2026-11-17");
    expect(m.items.find((i: any) => i.id === "a").uploadDate).toBe("2026-10-24");
    expect((mem.__read("orders/o_1") as any).promise.label).toBe("by 16 Nov");
  });

  it("cancel before it starts puts everything back", async () => {
    signIn(SITA);
    await svc.pauseMonth("m1", { from: "2026-10-20", until: "2026-10-25", reasonKind: "festival" }, act(SITA));
    await svc.cancelUpcomingPause("m1", act(SITA));
    const m = read();
    expect(m.pause).toBeNull();
    expect(m.cycle.endDate).toBe("2026-11-15");
    expect(m.items.find((i: any) => i.id === "a").uploadDate).toBe("2026-10-22");
    expect((mem.__read("orders/o_1") as any).promise.label).toBe("by 14 Nov");
  });
});
