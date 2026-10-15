import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SMM Delivery Control's switch and numbers on the in-memory Firestore (2026-10-15, phase 0): only the tech
 * admin and the main admin change `app_settings/smm_delivery`; turning it off needs a reason and the owner
 * (every other main admin) is told; the numbers are checked before they are saved; a reader never breaks.
 */

/** What the service hands the notifier. */
type Note = { userId: string; type: string; title: string; message: string; link: string };
type Switch = { mode: string; reason: string | null };
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn(async (_note: Note) => {}) }));
vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/services/notifications", () => ({ sendNotification }));

const mem = await import("./memoryFirestore");
const { useAuthStore } = await import("@/store/authStore");
const svc = await import("@/services/smmDeliverySettings");
import type { AppUser } from "@/types";

const DOC = "app_settings/smm_delivery";
const person = (uid: string, role: string, over: Partial<AppUser> = {}) => ({ uid, id: uid, name: uid[0].toUpperCase() + uid.slice(1), role, isActive: true, ...over }) as unknown as AppUser;
const KIRAN = person("kiran", "tech_admin");
const OWNER = person("owner", "main_admin");
const OWNER2 = person("partner", "main_admin");
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  for (const u of [KIRAN, OWNER, OWNER2, person("gone", "main_admin", { isActive: false }), person("lead", "tech_team_leader")]) {
    mem.__seed(`users/${u.uid}`, u as never);
  }
  signIn(KIRAN);
});

describe("reading the settings", () => {
  it("no document yet: Preview with the defaults, and the watcher says it does not exist", async () => {
    expect((await svc.fetchSmmDeliverySettings()).mode).toBe("preview");
    const seen: { mode: string; exists: boolean }[] = [];
    const stop = svc.watchSmmDeliverySettings((s, meta) => seen.push({ mode: s.mode, exists: meta.exists }));
    await Promise.resolve(); // the first answer arrives asynchronously, as from the SDK
    mem.__seed(DOC, { mode: "live" });
    stop();
    expect(seen).toEqual([{ mode: "preview", exists: false }, { mode: "live", exists: true }]);
  });
});

describe("the switch", () => {
  it("the tech admin turns it Live: saved with who and when, and in the history", async () => {
    const saved = await svc.setSmmDeliveryMode("live");
    expect(saved.mode).toBe("live");
    const doc = mem.__read(DOC)!;
    expect(doc).toMatchObject({ mode: "live", updatedByUid: "kiran", updatedByName: "Kiran", offReason: null });
    expect(doc.history).toEqual([expect.objectContaining({ mode: "live", byUid: "kiran", byName: "Kiran", reason: null })]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("turning it off needs a reason — refused without one, nothing written", async () => {
    await expect(svc.setSmmDeliveryMode("off", "  ")).rejects.toThrow(/Say why/);
    expect(mem.__read(DOC)).toBeUndefined();
  });

  it("turned off with a reason: the reason is kept and every other active main admin is told", async () => {
    await svc.setSmmDeliveryMode("live");
    await svc.setSmmDeliveryMode("off", "  Pilot paused for Diwali week ");
    const doc = mem.__read(DOC)!;
    expect(doc).toMatchObject({ mode: "off", offReason: "Pilot paused for Diwali week", offByUid: "kiran", offByName: "Kiran" });
    expect((doc.history as Switch[]).map((h) => [h.mode, h.reason])).toEqual([["live", null], ["off", "Pilot paused for Diwali week"]]);
    const told = sendNotification.mock.calls.map((c) => c[0]);
    expect(told.map((n) => n.userId).sort()).toEqual(["owner", "partner"]); // not the deactivated one
    expect(told[0]).toMatchObject({ type: "smm_delivery_off", link: "/smm", title: "SMM Delivery Control turned off" });
    expect(told[0].message).toMatch(/Kiran turned off SMM Delivery Control: "Pilot paused for Diwali week"/);
  });

  it("the main admin turning it off tells the other main admins, not themself", async () => {
    signIn(OWNER);
    await svc.setSmmDeliveryMode("off", "Testing the off switch");
    expect(sendNotification.mock.calls.map((c) => c[0].userId)).toEqual(["partner"]);
  });

  it("turned back on: the off reason is cleared, the history keeps it", async () => {
    await svc.setSmmDeliveryMode("off", "Pilot paused");
    await svc.setSmmDeliveryMode("preview");
    const doc = mem.__read(DOC)!;
    expect(doc).toMatchObject({ mode: "preview", offReason: null, offByUid: null, offByName: null });
    expect((doc.history as Switch[]).at(0)).toMatchObject({ mode: "off", reason: "Pilot paused" });
  });

  it("the mode it already has writes nothing", async () => {
    await svc.setSmmDeliveryMode("live");
    const before = JSON.stringify(mem.__read(DOC));
    await svc.setSmmDeliveryMode("live");
    expect(JSON.stringify(mem.__read(DOC))).toBe(before);
  });

  it.each([
    ["a tech team leader", person("lead", "tech_team_leader")],
    ["the Social Media Team Lead", person("manasa", "tech_member", { smmLeader: true })],
    ["a sales admin", person("sa", "sales_admin")],
    ["nobody signed in", null],
  ])("%s cannot change it", async (_label, who) => {
    signIn(who as AppUser | null);
    await expect(svc.setSmmDeliveryMode("off", "Because I can")).rejects.toThrow(/Only the tech admin or the main admin/);
    await expect(svc.saveSmmDeliveryTunables({ deadlineHour: 18 })).rejects.toThrow(/Only the tech admin or the main admin/);
    expect(mem.__read(DOC)).toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("the numbers", () => {
  it("a partial change is merged and saved; a first save also records the mode in force", async () => {
    const saved = await svc.saveSmmDeliveryTunables({ deadlineHour: 18, ladder: { repeatHours: 3 } as never, pilotUids: ["ravi", "ravi", "sita"] });
    expect(saved.deadlineHour).toBe(18);
    const doc = mem.__read(DOC)!;
    expect(doc).toMatchObject({ mode: "preview", deadlineHour: 18, pilotUids: ["ravi", "sita"], updatedByName: "Kiran" });
    expect((doc.ladder as Record<string, number>).repeatHours).toBe(3);
    expect((doc.ladder as Record<string, number>).onItHours).toBe(4);
    expect((doc.checkpoints as Record<string, number>).sendVideo).toBe(3);
  });

  it("does not touch the switch", async () => {
    await svc.setSmmDeliveryMode("off", "Pilot paused");
    await svc.saveSmmDeliveryTunables({ deadlineHour: 18 });
    expect(mem.__read(DOC)).toMatchObject({ mode: "off", offReason: "Pilot paused", deadlineHour: 18 });
  });

  it("refuses a number out of range, and steps out of order — nothing written", async () => {
    await expect(svc.saveSmmDeliveryTunables({ deadlineHour: 25 })).rejects.toThrow(/deadline hour/);
    await expect(svc.saveSmmDeliveryTunables({ checkpoints: { approved: 3 } as never })).rejects.toThrow(/approval checkpoint/);
    expect(mem.__read(DOC)).toBeUndefined();
  });

  it("a later save keeps what an earlier one set", async () => {
    await svc.saveSmmDeliveryTunables({ quietHours: { fromHour: 21 } as never });
    await svc.saveSmmDeliveryTunables({ ladder: { focusMinutes: 30 } as never });
    const s = await svc.fetchSmmDeliverySettings();
    expect(s.quietHours.fromHour).toBe(21);
    expect(s.ladder.focusMinutes).toBe(30);
  });
});
