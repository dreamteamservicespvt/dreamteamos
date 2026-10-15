import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  POPUP_GAP_MS, POPUP_PENDING_LIMIT_MS, popupVerdict, recordClose, type PopupClaim, type PopupState,
} from "@/utils/popupCoordinator";
import {
  DEFAULT_SMM_DELIVERY, DEFAULT_SMM_DELIVERY_CHECKPOINTS, DEFAULT_SMM_DELIVERY_LADDER, SMM_DELIVERY_ADMIN_ONLY,
  SMM_DELIVERY_HISTORY_LIMIT, canManageSmmDelivery, canViewSmmDeliverySettings, cleanChaseDays, mergeTunables,
  modeChangeProblem, parseSmmDeliverySettings, tunablesInputProblem, tunablesProblem, withSwitch,
} from "@/utils/smmDeliverySettings";
import { deliveryHealth, excludedReason, monthHealth, type SmmHealthCode, type SmmHealthContext } from "@/utils/smmDeliveryHealth";
import type { SmmCampaign } from "@/types/smm";

/**
 * SMM Delivery Control, phase 0 (2026-10-15, `.claude/rules/smm.md` §9.9): the groundwork's pure rules — the popup
 * coordinator's verdict, the settings document's reading and checks, and the data health check run on a
 * month before it is switched on.
 */

/* ── The popup coordinator ──────────────────────────────────────────────────────────────────── */

const NOW = 1_800_000_000_000;
const claim = (kind: PopupClaim["kind"], over: Partial<PopupClaim> = {}): PopupClaim => ({ id: `${kind}-1`, kind, pending: false, since: NOW - 1000, ...over });
const state = (over: Partial<PopupState> = {}): PopupState => ({ claims: [], closes: [], busy: false, ...over });

describe("popup coordinator — when a popup that waits its turn may open", () => {
  it("opens on an empty screen", () => {
    expect(popupVerdict("smm_status_check", state(), NOW)).toEqual({ ok: true });
  });

  it.each([
    ["a call is ringing or on", [claim("call")], "call", "call"],
    ["the check-in gate is up", [claim("checkin")], "popup", "checkin"],
    ["the check-in is still loading (pending)", [claim("checkin", { pending: true })], "popup", "checkin"],
    ["the agreement gate is up", [claim("agreement")], "popup", "agreement"],
    ["the update popup is up", [claim("update")], "popup", "update"],
    ["the renewal countdown is up", [claim("smm_renewal")], "popup", "smm_renewal"],
    ["the birthday greeting is up", [claim("birthday")], "popup", "birthday"],
    ["the profile prompt is up", [claim("profile")], "popup", "profile"],
    ["the AI studio is open", [claim("studio")], "studio", "studio"],
    ["another status check is open", [claim("smm_status_check")], "popup", "smm_status_check"],
  ])("waits while %s", (_label, claims, wait, by) => {
    const v = popupVerdict("smm_status_check", state({ claims }), NOW);
    expect(v.ok).toBe(false);
    expect(v.wait).toBe(wait);
    expect(v.by).toBe(by);
  });

  it("a call outranks everything — it is named even with the studio and a popup up", () => {
    const v = popupVerdict("smm_alert", state({ claims: [claim("studio"), claim("update"), claim("call")] }), NOW);
    expect(v).toEqual({ ok: false, wait: "call", by: "call" });
  });

  it("a popup outranks the studio in the reason (the studio's strip is phase 4's)", () => {
    expect(popupVerdict("smm_alert", state({ claims: [claim("studio"), claim("profile")] }), NOW).wait).toBe("popup");
  });

  it("a pending claim stops counting after two minutes (a read that never answers cannot block all day)", () => {
    const stale = claim("checkin", { pending: true, since: NOW - POPUP_PENDING_LIMIT_MS - 1 });
    expect(popupVerdict("smm_status_check", state({ claims: [stale] }), NOW).ok).toBe(true);
    // A SHOWN gate is believed however long it has been up.
    const shown = claim("checkin", { pending: false, since: NOW - 10 * POPUP_PENDING_LIMIT_MS });
    expect(popupVerdict("smm_status_check", state({ claims: [shown] }), NOW).ok).toBe(false);
  });

  it("waits while the person has a window of their own open", () => {
    expect(popupVerdict("smm_status_check", state({ busy: true }), NOW)).toEqual({ ok: false, wait: "busy" });
  });

  it("leaves ten minutes after a DIFFERENT popup closed, and says until when", () => {
    const closes = [{ kind: "update" as const, at: NOW - 60_000 }];
    const v = popupVerdict("smm_status_check", state({ closes }), NOW);
    expect(v).toEqual({ ok: false, wait: "gap", by: "update", until: NOW - 60_000 + POPUP_GAP_MS });
    expect(popupVerdict("smm_status_check", state({ closes }), NOW - 60_000 + POPUP_GAP_MS).ok).toBe(true);
  });

  it("no gap after its own kind, a call or the studio", () => {
    for (const kind of ["smm_status_check", "call", "studio"] as const) {
      const closes = recordClose([], kind, NOW - 1000);
      expect(popupVerdict("smm_status_check", state({ closes }), NOW).ok).toBe(true);
    }
  });

  it("the gap follows the LATEST close of another kind; a test may pass its own gap", () => {
    let closes = recordClose([], "update", NOW - 9 * 60_000);
    closes = recordClose(closes, "birthday", NOW - 20 * 60_000);
    expect(popupVerdict("smm_status_check", state({ closes }), NOW).by).toBe("update");
    expect(popupVerdict("smm_status_check", state({ closes }), NOW, { gapMs: 5 * 60_000 }).ok).toBe(true);
  });

  it("the close log keeps one entry per kind, the latest", () => {
    let closes = recordClose([], "update", 1);
    closes = recordClose(closes, "update", 5);
    closes = recordClose(closes, "profile", 3);
    expect(closes).toEqual([{ kind: "update", at: 5 }, { kind: "profile", at: 3 }]);
  });
});

/* ── The settings document ──────────────────────────────────────────────────────────────────── */

describe("SMM Delivery Control settings — reading app_settings/smm_delivery", () => {
  it("a missing document is Preview with the plan's defaults", () => {
    const s = parseSmmDeliverySettings(null);
    expect(s.mode).toBe("preview");
    expect(s.deadlineHour).toBe(19);
    expect(s.checkpoints).toEqual({ sendVideo: 3, longVideoExtraDays: 1, longVideoClips: 6, sendPoster: 2, sendRealVideo: 2, footage: 4, approved: 1 });
    expect(s.quietHours).toEqual({ fromHour: 20, toHour: 9, sundays: true, holidays: true });
    expect(s.ladder.deadlineDayHour).toBe(10);
    expect(s.ladder.repeatHours).toBe(2);
    expect(s.ladder.clientChaseDays).toEqual([2, 4, 7]);
    expect(s.pilotUids).toEqual([]);
  });

  it("junk, wrong types and out-of-range numbers read as the defaults — never a broken board", () => {
    const s = parseSmmDeliverySettings({
      mode: "on", deadlineHour: 30, pilotUids: ["a", "a", " b ", 7, ""],
      checkpoints: { sendVideo: -1, sendPoster: "2", approved: 1.5, footage: 5 },
      quietHours: { fromHour: 21, toHour: "x", sundays: "yes" },
      ladder: { repeatHours: 3, onItHours: 99, clientChaseDays: [7, 2, 2, 0, 45, "x"] },
    });
    expect(s.mode).toBe("preview");
    expect(s.deadlineHour).toBe(19);
    expect(s.pilotUids).toEqual(["a", "b"]);
    expect(s.checkpoints.sendVideo).toBe(3);
    expect(s.checkpoints.sendPoster).toBe(2); // a numeric string from a hand edit is read
    expect(s.checkpoints.approved).toBe(1);
    expect(s.checkpoints.footage).toBe(5);
    expect(s.quietHours).toEqual({ fromHour: 21, toHour: 9, sundays: true, holidays: true });
    expect(s.ladder.repeatHours).toBe(3);
    expect(s.ladder.onItHours).toBe(4);
    expect(s.ladder.clientChaseDays).toEqual([2, 7]);
  });

  it("the off fields are read only while it is off", () => {
    expect(parseSmmDeliverySettings({ mode: "off", offReason: " Pilot paused ", offByName: "Kiran" })).toMatchObject({ mode: "off", offReason: "Pilot paused", offByName: "Kiran" });
    expect(parseSmmDeliverySettings({ mode: "live", offReason: "old", offByName: "Kiran" })).toMatchObject({ mode: "live", offReason: null, offByName: null });
  });

  it("chase days: whole, once each, in order, five at most; nothing usable → the defaults", () => {
    expect(cleanChaseDays([9, 1, 3, 5, 7, 11, 13])).toEqual([1, 3, 5, 7, 9]);
    expect(cleanChaseDays([])).toEqual([2, 4, 7]);
    expect(cleanChaseDays("2,4")).toEqual([2, 4, 7]);
  });

  it("the switch's history keeps the latest twenty", () => {
    let h = [] as ReturnType<typeof withSwitch>;
    for (let i = 0; i < 25; i++) h = withSwitch(h, { mode: i % 2 ? "live" : "preview", at: i, byUid: "u", byName: "U" });
    expect(h).toHaveLength(SMM_DELIVERY_HISTORY_LIMIT);
    expect(h[0].at).toBe(5);
    expect(h.at(-1)?.at).toBe(24);
  });
});

describe("SMM Delivery Control settings — who may change it and how", () => {
  it("only the tech admin and the main admin change it; team leaders see Settings", () => {
    for (const role of ["tech_admin", "main_admin"]) expect(canManageSmmDelivery({ role })).toBe(true);
    for (const role of ["tech_team_leader", "tech_member", "sales_admin", "sales_member", "accounts_admin", undefined]) {
      expect(canManageSmmDelivery({ role })).toBe(false);
    }
    expect(canViewSmmDeliverySettings({ role: "tech_team_leader" })).toBe(true);
    expect(canViewSmmDeliverySettings({ role: "tech_member" })).toBe(false);
  });

  it("turning it off needs a reason; Preview and Live do not", () => {
    const admin = { role: "tech_admin" };
    expect(modeChangeProblem("off", "", admin)).toMatch(/Say why/);
    expect(modeChangeProblem("off", "   .  ", admin)).toMatch(/Say why/);
    expect(modeChangeProblem("off", "Pilot paused for Diwali", admin)).toBe("");
    expect(modeChangeProblem("live", "", admin)).toBe("");
    expect(modeChangeProblem("preview", null, { role: "main_admin" })).toBe("");
    expect(modeChangeProblem("live", "", { role: "tech_team_leader" })).toBe(SMM_DELIVERY_ADMIN_ONLY);
    expect(modeChangeProblem("off", "Pilot paused", { role: "tech_member", smmLeader: true } as { role: string })).toBe(SMM_DELIVERY_ADMIN_ONLY);
    expect(modeChangeProblem("paused" as never, "", admin)).toMatch(/Off, Preview or Live/);
  });

  it("the defaults pass their own checks", () => {
    expect(tunablesProblem(DEFAULT_SMM_DELIVERY)).toBe("");
  });

  it.each([
    ["approval not after every send", { checkpoints: { ...DEFAULT_SMM_DELIVERY_CHECKPOINTS, approved: 2 } }, /approval checkpoint/],
    ["footage not before the real video is sent", { checkpoints: { ...DEFAULT_SMM_DELIVERY_CHECKPOINTS, footage: 2 } }, /footage/],
    ["quiet hours of no length", { quietHours: { fromHour: 9, toHour: 9, sundays: true, holidays: true } }, /Quiet hours/],
    ["admins not after the leads", { ladder: { ...DEFAULT_SMM_DELIVERY_LADDER, adminAfterWorkingDays: 1 } }, /admins must be alerted after/],
    ["sales admin not after the salesperson", { ladder: { ...DEFAULT_SMM_DELIVERY_LADDER, approvalSalesAdminDays: 2 } }, /sales admin/],
    ["deadline-day alert not before the deadline", { deadlineHour: 10 }, /deadline-day alert/],
  ])("refuses numbers out of order: %s", (_label, over, problem) => {
    expect(tunablesProblem({ ...DEFAULT_SMM_DELIVERY, ...over })).toMatch(problem);
  });

  it("refuses a typed number outside its range instead of quietly saving the default", () => {
    expect(tunablesInputProblem({ deadlineHour: 25 })).toMatch(/deadline hour/);
    expect(tunablesInputProblem({ deadlineHour: 18.5 })).toMatch(/deadline hour/);
    expect(tunablesInputProblem({ checkpoints: { sendVideo: 9 } as never })).toMatch(/sendVideo/);
    expect(tunablesInputProblem({ quietHours: { fromHour: 24 } as never })).toMatch(/Quiet hours/);
    expect(tunablesInputProblem({ ladder: { repeatHours: 0 } as never })).toMatch(/repeatHours/);
    expect(tunablesInputProblem({ ladder: { clientChaseDays: [] } as never })).toMatch(/chase days/);
    expect(tunablesInputProblem({ deadlineHour: 18, ladder: { repeatHours: 3, clientChaseDays: [1, 3] } as never })).toBe("");
  });

  it("a partial change merges into what is saved", () => {
    const current = parseSmmDeliverySettings({ deadlineHour: 18, ladder: { repeatHours: 3 } });
    const next = mergeTunables(current, { ladder: { onItHours: 2 } as never, pilotUids: ["ravi", "ravi"] });
    expect(next.deadlineHour).toBe(18);
    expect(next.ladder.repeatHours).toBe(3);
    expect(next.ladder.onItHours).toBe(2);
    expect(next.pilotUids).toEqual(["ravi"]);
  });

  it("the settings rules are written without the @/ alias — the server checker (api/) reuses them", () => {
    const src = readFileSync(resolve(__dirname, "../utils/smmDeliverySettings.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\//);
    expect(src).not.toMatch(/import\(["']@\//);
  });
});

/* ── The data health check ──────────────────────────────────────────────────────────────────── */

const TODAY = "2026-10-15"; // a Thursday
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "ai_ad", title: "", status: "planned", uploadDate: null, uploadTime: null, platforms: ["instagram"],
  approval: { state: "not_sent" }, extra: false, makerUid: "arjun", publisherUid: "divya", ...over,
});
const TEAM = { creator: { uid: "arjun", name: "Arjun" }, publisher: { uid: "divya", name: "Divya" }, marketer: null, assistants: [] };
/** Lakshmi Jewellers, 10 Oct → 10 Nov: 2 videos + 2 posters, both rows present and planned. */
const month = (over: Record<string, unknown> = {}) => ({
  id: "m1", businessName: "Lakshmi Jewellers", clientName: "Lakshmi", status: "active", origin: "sale",
  cycle: { month: "2026-10", startDate: "2026-10-10", endDate: "2026-11-10" },
  commitments: { ai_ad: 2, poster: 2, real_video: 0 },
  items: [item("v1", { uploadDate: "2026-10-17" }), item("v2", { uploadDate: "2026-10-24" }), item("p1", { kind: "poster", uploadDate: "2026-10-19" }), item("p2", { kind: "poster", uploadDate: "2026-10-26" })],
  team: TEAM, soldBy: "gov", soldByName: "Govind", watchers: [], renewal: { state: "none" }, renewalOf: "m0", monthNumber: 2,
  ...over,
}) as unknown as SmmCampaign;
const ctx: SmmHealthContext = { today: TODAY, holidays: new Set<string>() };
const codes = (c: SmmCampaign, context = ctx) => monthHealth(c, context).findings.map((f) => f.code);
const finding = (c: SmmCampaign, code: SmmHealthCode, context = ctx) => monthHealth(c, context).findings.find((f) => f.code === code);

describe("data health check — which months are left out", () => {
  it.each([
    ["deleted", { status: "deleted" }, /Deleted/],
    ["removed with its order", { status: "removed" }, /order was removed/],
    ["a past (history) month", { history: true }, /past month/],
    ["finished", { status: "renewed" }, /Finished/],
    ["on hold — ended, renewal not done", { cycle: { month: "2026-09", startDate: "2026-09-10", endDate: "2026-10-10" } }, /On hold .* No production alerts/],
    ["ended with the renewal decided", { cycle: { month: "2026-09", startDate: "2026-09-10", endDate: "2026-10-10" }, renewal: { state: "won", nextCampaignId: "m2" } }, /^Ended/],
  ])("%s", (_label, over, why) => {
    const h = monthHealth(month(over), ctx);
    expect(h.state).toBe("excluded");
    expect(h.findings).toHaveLength(1);
    expect(h.findings[0].message).toMatch(why);
  });

  it("a direct or no-sale month is checked like a sold one", () => {
    expect(excludedReason(month({ origin: "no_sale", amount: 0 }), TODAY)).toBeNull();
    expect(excludedReason(month({ origin: "direct" }), TODAY)).toBeNull();
  });
});

describe("data health check — a month that cannot be planned", () => {
  it("missing or backwards dates block it", () => {
    expect(monthHealth(month({ cycle: { startDate: "2026-10-20", endDate: "2026-10-20" } }), ctx)).toMatchObject({ state: "blocked", findings: [{ code: "bad_dates" }] });
    expect(monthHealth(month({ cycle: null }), ctx).state).toBe("blocked");
  });

  it("a month too short for four weeks blocks; a long last week is a warning", () => {
    expect(finding(month({ cycle: { startDate: "2026-10-10", endDate: "2026-10-30" } }), "too_short")?.severity).toBe("block");
    const long = finding(month({ cycle: { startDate: "2026-10-10", endDate: "2026-11-25" } }), "long_last_week");
    expect(long?.message).toMatch(/week 4 is 25 days/);
    expect(long?.message).toMatch(/10 Nov 2026/);
  });

  it("28- to 31-day months are normal, including February (W4 of 7–10 days)", () => {
    for (const [start, end] of [["2027-01-31", "2027-02-28"], ["2026-10-01", "2026-11-01"], ["2026-01-31", "2026-02-28"]]) {
      expect(codes(month({ cycle: { startDate: start, endDate: end } }), { ...ctx, today: start })).not.toContain("too_short");
      expect(codes(month({ cycle: { startDate: start, endDate: end } }), { ...ctx, today: start })).not.toContain("long_last_week");
    }
  });

  it("nothing promised blocks it", () => {
    expect(monthHealth(month({ commitments: { ai_ad: 0, poster: 0, real_video: 0 }, items: [] }), ctx)).toMatchObject({ state: "blocked" });
  });
});

describe("data health check — a month ready to switch on", () => {
  it("a clean renewal month is ready with nothing to say", () => {
    expect(monthHealth(month(), ctx)).toEqual({ campaignId: "m1", name: "Lakshmi Jewellers", state: "ready", findings: [] });
  });

  it("nobody on it → setup (the tech admin's one SETUP alert)", () => {
    const h = monthHealth(month({ team: { creator: null, publisher: null, marketer: null, assistants: [] } }), ctx);
    expect(h.state).toBe("setup");
    expect(h.findings[0]).toMatchObject({ code: "not_set_up", severity: "warn" });
  });

  it("an empty Makes / Posts seat is a warning (nobody owns those tasks)", () => {
    const h = monthHealth(month({ team: { ...TEAM, publisher: null } }), ctx);
    expect(h.state).toBe("attention");
    expect(finding(month({ team: { ...TEAM, publisher: null } }), "seat_empty")?.message).toMatch(/"Posts it"/);
  });

  it("a seat or a piece held by a deactivated person is flagged when the people are known", () => {
    const users = new Map([["arjun", { isActive: false, name: "Arjun" }], ["divya", { isActive: true }]]);
    const c = month();
    expect(finding(c, "seat_inactive", { ...ctx, users })?.message).toMatch(/Arjun holds "Makes the content" but is deactivated/);
    expect(finding(c, "owner_inactive", { ...ctx, users })?.itemIds).toEqual(["v1", "v2", "p1", "p2"]);
    expect(codes(c)).not.toContain("seat_inactive"); // without the people, nothing is guessed
  });

  it("rows that do not match what was promised", () => {
    const fewer = finding(month({ items: [item("v1"), item("p1", { kind: "poster" }), item("p2", { kind: "poster" })] }), "rows_missing");
    expect(fewer?.message).toBe("2 videos promised but only 1 row — 1 would be planned with no row to work on. Set the counts again in Edit setup to add the rows.");
    const more = finding(month({ items: [...month().items, item("p3", { kind: "poster" })] }), "rows_extra");
    expect(more?.message).toMatch(/^3 poster rows for 2 promised/);
    // Extra work is outside the count; a carried piece is inside it (its month's count went up with it).
    expect(codes(month({ items: [...month().items, item("x1", { extra: true, uploadDate: "2026-10-20" })] }))).not.toContain("rows_extra");
  });

  it("dates outside the month are listed with their pieces (the Dhana Lakshmi case)", () => {
    // The end date (10 Nov) is the renewal day — the next month's first day — so a piece dated on it is outside.
    const f = finding(month({ items: [item("v1", { uploadDate: "2026-09-12" }), item("v2", { uploadDate: "2026-11-10" }), item("p1", { kind: "poster", uploadDate: "2026-11-09" }), item("p2", { kind: "poster" })] }), "dates_outside");
    expect(f?.itemIds).toEqual(["v1", "v2"]);
    expect(f?.message).toMatch(/^2 pieces are dated outside the month \(10 Oct → 9 Nov 2026\)/);
  });

  it("lateness that exists before the switch goes to the Starting line, never escalated", () => {
    const f = finding(month({ items: [item("v1", { uploadDate: "2026-10-12" }), item("v2", { uploadDate: "2026-10-12", status: "posted", postUrls: { instagram: "https://i/1" } }), item("p1", { kind: "poster", uploadDate: TODAY }), item("p2", { kind: "poster" })] }), "already_late");
    expect(f?.itemIds).toEqual(["v1"]);
    expect(f?.message).toMatch(/Starting line .* never escalates\.$/);
  });

  it("extra work needs its own date and an owner", () => {
    const c = month({ items: [...month().items, item("x1", { extra: true, uploadDate: null }), item("x2", { extra: true, uploadDate: "2026-10-20", makerUid: null, publisherUid: null }), item("x3", { extra: true, uploadDate: "2026-10-20" })] });
    expect(finding(c, "extra_incomplete")?.itemIds).toEqual(["x1", "x2"]);
  });

  it("posted with no date / no link, undated rows and carried pieces are said, not warned", () => {
    const c = month({ items: [
      item("v1", { status: "posted" }),
      item("v2", { status: "posted", uploadDate: "2026-10-11", postUrls: { instagram: "https://i/2" } }),
      item("p1", { kind: "poster", carriedFrom: { campaignId: "m0", label: "September" } }),
      item("p2", { kind: "poster", uploadDate: "2026-10-20" }),
    ] });
    const h = monthHealth(c, ctx);
    expect(h.state).toBe("ready");
    expect(h.findings.map((f) => [f.code, f.severity, f.itemIds])).toEqual([
      ["posted_no_date", "info", ["v1"]],
      ["posted_no_link", "info", ["v1"]],
      ["undated", "info", ["p1"]],
      ["carried", "info", ["p1"]],
    ]);
  });

  it("a client's first month: no post before day 4", () => {
    expect(finding(month({ renewalOf: null, monthNumber: 1 }), "first_month")?.message).toMatch(/not before 13 Oct 2026/);
    expect(codes(month())).not.toContain("first_month");
  });

  it("a month starting on a Sunday or a holiday, and holidays that could not be read", () => {
    expect(finding(month({ cycle: { startDate: "2026-10-11", endDate: "2026-11-11" } }), "starts_on_day_off")?.message).toMatch(/Sunday/);
    expect(finding(month(), "starts_on_day_off", { ...ctx, holidays: new Set(["2026-10-10"]) })?.message).toMatch(/company holiday/);
    expect(finding(month(), "holidays_unknown", { ...ctx, holidays: null })?.severity).toBe("warn");
  });

  it("a month that reaches a year with no festival dates says so (2027 has them since 2026-10-15; 2028 does not)", () => {
    expect(codes(month({ cycle: { startDate: "2026-12-20", endDate: "2027-01-20" } }), { ...ctx, today: "2026-12-20" })).not.toContain("festivals_missing");
    const f = finding(month({ cycle: { startDate: "2027-12-20", endDate: "2028-01-20" } }), "festivals_missing", { ...ctx, today: "2027-12-20" });
    expect(f?.message).toMatch(/2028 are not in the app yet/);
    expect(codes(month())).not.toContain("festivals_missing");
  });

  it("an upcoming month is planned now and says when it starts", () => {
    expect(finding(month({ cycle: { startDate: "2026-10-20", endDate: "2026-11-20" } }), "starts_later")?.message).toMatch(/Starts on 20 Oct 2026/);
  });

  it("findings come worst first", () => {
    const sev = monthHealth(month({ team: { ...TEAM, publisher: null }, commitments: { ai_ad: 0, poster: 0, real_video: 0 } }), ctx).findings.map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ["block", "warn", "info"].indexOf(a) - ["block", "warn", "info"].indexOf(b)));
    expect(sev[0]).toBe("block");
  });
});

describe("data health check — the whole board", () => {
  it("worst first, with counts per state", () => {
    const list = [
      month({ id: "ready", businessName: "B Ready" }),
      month({ id: "held", businessName: "A Held", cycle: { startDate: "2026-09-10", endDate: "2026-10-10" } }),
      month({ id: "blocked", businessName: "C Blocked", commitments: { ai_ad: 0, poster: 0, real_video: 0 }, items: [] }),
      month({ id: "setup", businessName: "D Setup", team: { assistants: [] } }),
      month({ id: "attn", businessName: "E Attention", team: { ...TEAM, creator: null } }),
    ];
    const h = deliveryHealth(list, ctx);
    expect(h.months.map((m) => m.campaignId)).toEqual(["blocked", "setup", "attn", "ready", "held"]);
    expect(h.counts).toEqual({ blocked: 1, setup: 1, attention: 1, ready: 1, excluded: 1 });
  });
});
