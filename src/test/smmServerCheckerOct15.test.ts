/**
 * SMM Delivery Control, phase 6 — the server checker (`api/smm-monitor.ts`) and its pure parts:
 *   • the chain the server loads is alias-free and every RUNTIME relative import ends in `.js` (Vercel runs api/ as
 *     Node ESM because package.json is "type": "module"; an extensionless import loads under `vercel dev` and fails
 *     in production with ERR_MODULE_NOT_FOUND);
 *   • the starting line (`smmDeliveryBaseline`), today's presence from the raw attendance documents
 *     (`smmServerPresence`, held to the Attendance board's `todayStatusOf` by a parity table), and what is written
 *     and pushed (`smmServerDelivery`);
 *   • the handler itself on a fake firebase-admin: 401 / 500 without the secret, Preview delivers nothing, Live
 *     writes each alert once and pushes it once per device, a second run sends nothing, the heartbeat;
 *   • the service worker's urgent banner, and the Vercel cron entry.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveSinceAt, monthBaselineAt } from "@/utils/smmDeliveryBaseline";
import { monitorPeopleFrom, presenceByUid, serverTodayKind, type ServerDayMark } from "@/utils/smmServerPresence";
import {
  channelFor, chunk, cronAuthProblem, deliverableAlerts, isAlreadyExists, isDeadTokenCode, notificationDocFor, parseAlertAnswers,
  pushMessageFor, SMM_CONTROL_LINK,
} from "@/utils/smmServerDelivery";
import { monitorSmm, type SmmAlert, type SmmMonitorPerson } from "@/utils/smmMonitor";
import { istMoment, type SmmDeliveryMonth } from "@/utils/smmCadence";
import { cleanRunSummary, DEFAULT_SMM_DELIVERY, parseSmmDeliverySettings } from "@/utils/smmDeliverySettings";
import { todayStatusOf, type DayMark } from "@/utils/smmAttendance";
import type { SmmDeliverySettings } from "@/types/smmDelivery";
import { month, piece } from "./smmDeliveryFixtures";

const at = (day: string, h: number, m = 0) => istMoment(day, h, m);
const ROOT = resolve(__dirname, "../..");

/* ── The chain the server loads ─────────────────────────────────────────────────────────────── */

/** Runtime (non-type) relative imports of one source file. */
function runtimeRelativeImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s+["']([^"']+)["']/gm)) {
    const [, , typeOnly, clause, spec] = m;
    if (typeOnly || !spec.startsWith(".")) continue;
    // `import { type A, type B } from` is erased too.
    const names = /\{([\s\S]*)\}/.exec(clause)?.[1];
    if (names && !/^\s*\w/.test(clause) && names.split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
    out.push(spec);
  }
  return out;
}

describe("the server's module chain — alias-free, and Node-ESM-loadable", () => {
  const visited = new Map<string, string[]>();
  const walk = (file: string) => {
    if (visited.has(file)) return;
    const src = readFileSync(file, "utf8");
    const specs = runtimeRelativeImports(src);
    visited.set(file, specs);
    for (const spec of specs) {
      const target = resolve(dirname(file), spec.replace(/\.js$/, ".ts"));
      if (existsSync(target)) walk(target);
    }
  };
  walk(resolve(ROOT, "api/smm-monitor.ts"));
  const files = [...visited.keys()].map((f) => f.slice(ROOT.length + 1).replace(/\\/g, "/")).sort();

  it("loads the rules, the settings and the three phase-6 utils at run time", () => {
    expect(files).toEqual(expect.arrayContaining([
      "api/smm-monitor.ts", "src/utils/smmMonitor.ts", "src/utils/smmCadence.ts", "src/utils/smmDeliverySettings.ts",
      "src/utils/smmDeliveryBaseline.ts", "src/utils/smmServerPresence.ts", "src/utils/smmServerDelivery.ts",
    ]));
  });

  it.each([...visited.entries()].map(([f, specs]) => [f.slice(ROOT.length + 1).replace(/\\/g, "/"), f, specs] as const))(
    "%s: no @/ import, every runtime relative import ends in .js and exists",
    (_name, file, specs) => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from\s+["']@\//);
      expect(src).not.toMatch(/import\(["']@\//);
      for (const spec of specs) {
        expect(spec, `${spec} needs ".js" — Node ESM cannot find it otherwise`).toMatch(/\.js$/);
        expect(existsSync(resolve(dirname(file), spec.replace(/\.js$/, ".ts")))).toBe(true);
      }
    },
  );

  it("reads the import lists right (type-only imports are erased and need nothing)", () => {
    expect(runtimeRelativeImports('import type { A } from "./a";\nimport { type B, type C } from "./b";\nimport { d, type E } from "./d.js";\n'))
      .toEqual(["./d.js"]);
  });
});

/* ── The starting line ──────────────────────────────────────────────────────────────────────── */

describe("the starting line (smmDeliveryBaseline)", () => {
  const NOW = at("2026-10-21", 11);
  const went = (mode: SmmDeliverySettings["mode"], history: { mode: SmmDeliverySettings["mode"]; at: number }[]) =>
    ({ mode, history: history.map((h) => ({ ...h, byUid: "ta", byName: "Tech Admin" })) });

  it("a month's own baseline wins", () => {
    expect(monthBaselineAt({ delivery: { baselineAt: at("2026-10-16", 9) } }, went("live", [{ mode: "live", at: at("2026-10-10", 9) }]), NOW))
      .toBe(at("2026-10-16", 9));
    // A Firestore Timestamp reads too.
    expect(monthBaselineAt({ delivery: { baselineAt: { toMillis: () => at("2026-10-17", 9) } } }, null, NOW)).toBe(at("2026-10-17", 9));
  });

  it("otherwise the moment it last went live — the NEWEST live change, by its time", () => {
    const s = went("live", [
      { mode: "live", at: at("2026-10-12", 9) }, { mode: "preview", at: at("2026-10-13", 9) }, { mode: "live", at: at("2026-10-14", 9) },
    ]);
    expect(liveSinceAt(s, NOW)).toBe(at("2026-10-14", 9));
    expect(monthBaselineAt({ delivery: null }, s, NOW)).toBe(at("2026-10-14", 9));
    expect(liveSinceAt(went("live", [{ mode: "live", at: at("2026-10-14", 9) }, { mode: "live", at: at("2026-10-12", 9) }]), NOW)).toBe(at("2026-10-14", 9));
  });

  it("otherwise now — and in Preview / Off an old live change does not count (Preview shows switching on NOW)", () => {
    expect(monthBaselineAt({}, went("live", []), NOW)).toBe(NOW);
    expect(liveSinceAt(went("preview", [{ mode: "live", at: at("2026-10-12", 9) }]), NOW)).toBeNull();
    expect(monthBaselineAt(null, went("off", [{ mode: "live", at: at("2026-10-12", 9) }]), NOW)).toBe(NOW);
    expect(liveSinceAt(null, NOW)).toBeNull();
  });

  it("a live change stamped in the future (a wrong clock) reads as now", () => {
    expect(liveSinceAt(went("live", [{ mode: "live", at: NOW + 3_600_000 }]), NOW)).toBe(NOW);
  });
});

/* ── Presence from the raw attendance documents ─────────────────────────────────────────────── */

describe("today's presence on the server (smmServerPresence)", () => {
  it("gives the Attendance board's answer for every mark, check-in, day off and leave request (parity)", () => {
    const marks: (DayMark | null)[] = [null, "full", "half", "absent", "leave", "half_leave", "holiday", "holiday_work", "comp_off"];
    const checkins = [null, { inAt: new Date(at("2026-10-21", 9, 40)), outAt: null }, { inAt: new Date(at("2026-10-21", 9, 40)), outAt: new Date(at("2026-10-21", 18)) }];
    let cases = 0;
    for (const mark of marks) for (const checkin of checkins) for (const dayOff of [false, true]) for (const leaveAsked of [false, true])
      for (const leaveAskedHalf of [false, true]) for (const checksIn of [false, true]) {
        const input = { checksIn, mark, checkin, dayOff, leaveAsked, leaveAskedHalf };
        expect(serverTodayKind({ ...input, mark: mark as ServerDayMark | null }), JSON.stringify(input)).toBe(todayStatusOf(input).kind);
        cases += 1;
      }
    expect(cases).toBe(9 * 3 * 2 * 2 * 2 * 2);
  });

  const USERS = [
    { uid: "ravi", name: "Ravi", role: "tech_member" }, { uid: "priya", name: "Priya", role: "tech_member" },
    { uid: "mani", name: "Mani", role: "tech_member" }, { uid: "kiran", name: "Kiran", role: "tech_team_leader" },
    { uid: "sita", name: "Sita", role: "sales_member" }, { uid: "gone", name: "Gone", role: "tech_member", isActive: false },
  ];
  const WED = "2026-10-21";
  const base = { day: WED, marks: [], checkins: [], holidays: new Set<string>(), leaveRequests: [] };

  it("checked in → working; checked out → away; not checked in yet → working; no check-in record → unknown (at work)", () => {
    const p = presenceByUid(USERS, {
      ...base,
      checkins: [
        { memberId: "ravi", date: WED, checkedInAt: { toMillis: () => at(WED, 9) }, checkedOutAt: null },
        { memberId: "priya", date: WED, checkedInAt: null, checkedOutAt: { toMillis: () => at(WED, 18) } },
        { memberId: "mani", date: "2026-10-20", checkedInAt: null, checkedOutAt: { toMillis: () => 1 } }, // yesterday: ignored
      ],
    });
    expect(p.get("ravi")).toBe("working");
    expect(p.get("priya")).toBe("away");
    expect(p.get("mani")).toBe("working");
    // A team leader / salesperson never checks in here: not known — which the monitor treats as at work.
    expect(p.get("kiran")).toBe("unknown");
    expect(p.get("sita")).toBe("unknown");
  });

  it("an admin's mark wins: leave / absent / comp off → away, half → in for the half, worked → working", () => {
    const p = presenceByUid(USERS, {
      ...base,
      marks: [
        { memberId: "ravi", date: WED, status: "leave" }, { memberId: "priya", date: WED, status: "half" },
        { memberId: "mani", date: WED, status: "comp_off" }, { memberId: "kiran", date: WED, status: "full" },
        { memberId: "sita", date: WED, status: "absent" }, { memberId: "gone", date: WED, status: "nonsense" },
      ],
      // A pending request does not beat the mark.
      leaveRequests: [{ memberId: "kiran", fromDate: WED, toDate: WED, status: "pending" }],
    });
    expect([...p.entries()]).toEqual([["ravi", "away"], ["priya", "half_in"], ["mani", "away"], ["kiran", "working"], ["sita", "away"], ["gone", "working"]]);
  });

  it("leave requests: pending → away; a half day only while checked in; approved with no mark → away; other days ignored", () => {
    const p = presenceByUid(USERS, {
      ...base,
      checkins: [{ memberId: "mani", date: WED, checkedInAt: { toMillis: () => at(WED, 9) } }],
      leaveRequests: [
        { memberId: "ravi", fromDate: "2026-10-20", toDate: "2026-10-22", status: "pending" },
        { memberId: "priya", fromDate: WED, toDate: WED, status: "pending", duration: "half_day" },
        { memberId: "sita", fromDate: WED, toDate: WED, status: "approved" },
        { memberId: "kiran", fromDate: "2026-10-22", toDate: "2026-10-23", status: "approved" },
        { memberId: "gone", fromDate: WED, toDate: WED, status: "rejected" },
        { memberId: "mani", fromDate: WED, toDate: WED, status: "pending", duration: "half_day" }, // but checked in
      ],
    });
    expect(p.get("ravi")).toBe("away");
    expect(p.get("priya")).toBe("away"); // half-day asked, not checked in
    expect(p.get("sita")).toBe("away");
    expect(p.get("kiran")).toBe("unknown"); // tomorrow's leave does not count today
    expect(p.get("gone")).toBe("working");
    expect(p.get("mani")).toBe("working"); // a check-in wins over the request (present, as on the board)
  });

  it("Sunday or a company holiday is a day off (away); unreadable holidays = Sundays only", () => {
    expect(presenceByUid(USERS, { ...base, day: "2026-10-25" }).get("kiran")).toBe("away"); // Sunday
    expect(presenceByUid(USERS, { ...base, holidays: new Set([WED]) }).get("ravi")).toBe("away");
    expect(presenceByUid(USERS, { ...base, holidays: null }).get("ravi")).toBe("working");
  });

  it("builds the supervisor's people: name, role, lead flag, active, presence", () => {
    const people = monitorPeopleFrom([...USERS, { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true }], base);
    expect(people.find((p) => p.uid === "manasa")).toEqual({ uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true, isActive: true, presence: "working" });
    expect(people.find((p) => p.uid === "gone")?.isActive).toBe(false);
  });
});

/* ── What is written and sent ───────────────────────────────────────────────────────────────── */

const alert = (over: Partial<SmmAlert> = {}): SmmAlert => ({
  key: "smm_alert_a_full_2026-10-21_ravi", subject: "a", uid: "ravi", name: "Ravi", audience: "owner", level: "full",
  type: "ai_video", reason: "deadline_today", campaignId: "m1", clientName: "Lakshmi Jewellers", itemIds: ["a"], week: 1,
  title: "🎬 AI VIDEO · Lakshmi Jewellers", message: "Lakshmi Jewellers: the video must be live today by 7 PM.",
  deadlineAt: at("2026-10-21", 19), fullScreen: true, critical: false, deliverNow: true, heldBecause: null, ...over,
});

describe("who may run it (cronAuthProblem)", () => {
  it.each([
    ["no secret configured", { authorization: "Bearer s3cret" }, "", { status: 500, error: "CRON_SECRET not configured" }],
    ["no header", {}, "s3cret", { status: 401, error: "Unauthorized" }],
    ["a wrong bearer", { authorization: "Bearer nope" }, "s3cret", { status: 401, error: "Unauthorized" }],
    ["a prefix of the secret", { "x-cron-secret": "s3cre" }, "s3cret", { status: 401, error: "Unauthorized" }],
    ["Vercel Cron's bearer", { authorization: "Bearer s3cret" }, "s3cret", null],
    ["cron-job.org's header", { "x-cron-secret": "s3cret" }, "s3cret", null],
    ["a header given twice", { "x-cron-secret": ["s3cret", "x"] }, "s3cret", null],
  ])("%s", (_l, headers, secret, want) => {
    expect(cronAuthProblem(headers, secret)).toEqual(want);
  });
});

describe("the bell row and the push (smmServerDelivery)", () => {
  it("delivers only alerts due now, never an early warning, in the monitor's order", () => {
    const list = [alert({ key: "k1" }), alert({ key: "k2", level: "watch" }), alert({ key: "k3", deliverNow: false, heldBecause: "quiet_hours" }), alert({ key: "k4", level: "notice", fullScreen: false })];
    expect(deliverableAlerts(list).map((a) => a.key)).toEqual(["k1", "k4"]);
  });

  it("the notification: id = the once key, smm_urgent for a full screen, smm_notice otherwise, /smm/control, the meta", () => {
    const { id, data } = notificationDocFor(alert());
    expect(id).toBe("smm_alert_a_full_2026-10-21_ravi");
    expect(data).toEqual({
      userId: "ravi", type: "smm_urgent", title: "🎬 AI VIDEO · Lakshmi Jewellers", message: "Lakshmi Jewellers: the video must be live today by 7 PM.",
      read: false, link: SMM_CONTROL_LINK,
      meta: { key: "smm_alert_a_full_2026-10-21_ravi", level: "full", reason: "deadline_today", alertType: "ai_video", campaignId: "m1", itemIds: ["a"], fullScreen: true, critical: false, subject: "a" },
    });
    expect(notificationDocFor(alert({ level: "notice", fullScreen: false })).data.type).toBe("smm_notice");
    // Nothing undefined (Firestore refuses it).
    const loose = notificationDocFor(alert({ campaignId: undefined as unknown as string, itemIds: undefined as unknown as string[] })).data;
    expect(JSON.stringify(loose)).not.toContain("undefined");
    expect(loose.meta).toMatchObject({ campaignId: "", itemIds: [] });
  });

  it("the push is data-only, all strings; urgent = high priority, short TTL; notice = normal", () => {
    const urgent = pushMessageFor(alert(), { token: "t1", platform: "web" });
    expect(urgent).not.toHaveProperty("notification");
    expect(urgent.webpush).not.toHaveProperty("notification");
    expect(urgent.android).not.toHaveProperty("notification");
    expect(Object.values(urgent.data).every((v) => typeof v === "string")).toBe(true);
    expect(urgent.data).toMatchObject({ type: "smm_urgent", link: "/smm/control", tag: "smm_alert_a_full_2026-10-21_ravi", channelId: "default", body: alert().message });
    expect(urgent.android.priority).toBe("high");
    expect(urgent.webpush.headers.Urgency).toBe("high");
    const notice = pushMessageFor(alert({ level: "notice", fullScreen: false }), { token: "t1" });
    expect(notice.android.priority).toBe("normal");
    expect(notice.webpush.headers.Urgency).toBe("normal");
    expect(notice.android.ttl).toBeGreaterThan(urgent.android.ttl);
  });

  it("the smm_urgent Android channel only on a phone whose app created it — never a channel the phone lacks", () => {
    expect(channelFor(alert(), { channels: "smm_urgent" })).toBe("smm_urgent");
    expect(channelFor(alert(), {})).toBe("default");
    expect(channelFor(alert({ fullScreen: false, level: "notice" }), { channels: "smm_urgent" })).toBe("default");
  });

  it("reads the SDK's answers: an existing document; a dead token", () => {
    expect(isAlreadyExists({ code: 6, message: "6 ALREADY_EXISTS: Document already exists" })).toBe(true);
    expect(isAlreadyExists({ code: "already-exists" })).toBe(true);
    expect(isAlreadyExists({ code: 14, message: "UNAVAILABLE" })).toBe(false);
    expect(isAlreadyExists(null)).toBe(false);
    expect(isDeadTokenCode("messaging/registration-token-not-registered")).toBe(true);
    expect(isDeadTokenCode("messaging/internal-error")).toBe(false);
  });

  it("reads people's answers (smm_alert_state) leniently", () => {
    expect(parseAlertAnswers([
      { id: "manasa", data: { answers: { a: { kind: "on_it", at: 5, byName: "Manasa" }, b: { kind: "shrug", at: 5 }, c: { kind: "escalate", at: { toMillis: () => 9 } } } } },
      { id: "kiran", data: { answers: "nope" } },
      { id: "", data: { answers: { a: { kind: "on_it", at: 1 } } } },
    ])).toEqual({ manasa: { a: { kind: "on_it", at: 5 }, c: { kind: "escalate", at: 9 } } });
  });

  it("splits lists for `in` (30) and sendEach (500)", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 30)).toEqual([]);
  });
});

describe("the heartbeat's summary, read back (parseSmmDeliverySettings)", () => {
  it("is passed through, cleaned; absent or unreadable → null", () => {
    expect(parseSmmDeliverySettings({ lastRunSummary: { at: 5, mode: "live", months: 3, alerts: 7, delivered: 2.9, errors: -1, ms: 812, deferred: 0, pushed: 4 } }).lastRunSummary)
      .toEqual({ at: 5, mode: "live", months: 3, alerts: 7, delivered: 2, errors: 0, ms: 812, deferred: 0, pushed: 4 });
    expect(parseSmmDeliverySettings({}).lastRunSummary).toBeNull();
    expect(cleanRunSummary({ mode: "live" })).toBeNull();
    expect(cleanRunSummary({ at: 1, mode: "loud" })).toMatchObject({ mode: "preview", months: 0 });
  });
});

/* ── The handler on a fake firebase-admin ───────────────────────────────────────────────────── */

const h = vi.hoisted(() => {
  type Doc = Record<string, unknown>;
  const SERVER_TIME = { __serverTime: true };
  const state = {
    collections: new Map<string, Map<string, Doc>>(),
    sent: [] as { token: string; data: Record<string, string>; android: { priority: string } }[][],
    deadTokens: new Set<string>(),
    reads: [] as string[],
    failReads: new Set<string>(),
  };
  const coll = (name: string) => {
    if (!state.collections.has(name)) state.collections.set(name, new Map());
    return state.collections.get(name)!;
  };
  const merge = (a: Doc, b: Doc): Doc => {
    const out: Doc = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) && v !== SERVER_TIME && out[k] && typeof out[k] === "object" ? merge(out[k] as Doc, v as Doc) : v;
    }
    return out;
  };
  const snapOf = (name: string, id: string) => {
    const d = coll(name).get(id);
    return { id, exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) };
  };
  const docRef = (name: string, id: string) => ({
    _name: name, _id: id,
    async get() { state.reads.push(`${name}/${id}`); return snapOf(name, id); },
    async create(data: Doc) {
      if (coll(name).has(id)) throw Object.assign(new Error(`6 ALREADY_EXISTS: Document already exists: ${name}/${id}`), { code: 6 });
      coll(name).set(id, data);
    },
    async set(data: Doc, opts?: { merge?: boolean }) { coll(name).set(id, opts?.merge ? merge(coll(name).get(id) || {}, data) : data); },
    async delete() { coll(name).delete(id); },
  });
  type Filter = [string, string, unknown];
  const query = (name: string, filters: Filter[], fields: string[] | null): unknown => ({
    where: (f: string, op: string, v: unknown) => query(name, [...filters, [f, op, v]], fields),
    select: (...fs: string[]) => query(name, filters, fs),
    async get() {
      state.reads.push(`${name}?${filters.map((f) => f.join(" ")).join("&")}`);
      if (state.failReads.has(name)) throw new Error(`${name} unreadable`);
      const docs = [...coll(name).entries()].filter(([, d]) => filters.every(([f, op, v]) => {
        const x = d[f];
        if (op === "==") return x === v;
        if (op === ">=") return typeof x === "string" && x >= (v as string);
        if (op === "in") return (v as unknown[]).includes(x);
        throw new Error(`op ${op}`);
      })).map(([id, d]) => {
        const data = fields ? Object.fromEntries(fields.filter((f) => f in d).map((f) => [f, d[f]])) : d;
        return { id, data: () => JSON.parse(JSON.stringify(data)) };
      });
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(name, id), ...(query(name, [], null) as object) }),
    batch: () => {
      const ops: (() => Promise<void>)[] = [];
      return { delete: (ref: ReturnType<typeof docRef>) => { ops.push(() => ref.delete()); }, commit: async () => { for (const op of ops) await op(); } };
    },
  };
  const admin = {
    apps: [] as unknown[],
    initializeApp: () => { admin.apps.push({}); },
    credential: { cert: () => ({}) },
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => SERVER_TIME } }),
    messaging: () => ({
      sendEach: async (messages: { token: string; data: Record<string, string>; android: { priority: string } }[]) => {
        state.sent.push(messages);
        return {
          responses: messages.map((m) => (state.deadTokens.has(m.token)
            ? { success: false, error: { code: "messaging/registration-token-not-registered" } }
            : { success: true })),
        };
      },
    }),
  };
  return { state, coll, admin, SERVER_TIME };
});

vi.mock("firebase-admin", () => ({ default: h.admin }));

// Imported after the mock is registered (vi.mock is hoisted above the imports).
import handler, { runSmmMonitor } from "../../api/smm-monitor";

const SECRET = "test-cron-secret";
const LIVE_SINCE = at("2026-10-15", 0);
const WED_1030 = at("2026-10-21", 10, 30);

const PEOPLE: SmmMonitorPerson[] = [
  { uid: "ravi", name: "Ravi", role: "tech_member" }, { uid: "priya", name: "Priya", role: "tech_member" },
  { uid: "mani", name: "Mani", role: "tech_member" }, { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true },
  { uid: "kiran", name: "Kiran", role: "tech_team_leader" }, { uid: "ta", name: "Tech Admin", role: "tech_admin" },
  { uid: "owner", name: "Owner", role: "main_admin" }, { uid: "sita", name: "Sita", role: "sales_member" },
  { uid: "sa", name: "Sales Admin", role: "sales_admin" },
];

/** Lakshmi Jewellers' month, switched on 15 Oct; week 1's video "a" is due Wed 21 Oct, 7 PM and not started. */
const lakshmi = () => month({
  delivery: { activatedAt: LIVE_SINCE, activatedByName: "Kiran", baselineAt: LIVE_SINCE, rule: "front_back_v1" },
  items: [piece({ id: "a", title: "Diwali offer" }), piece({ id: "b" }), piece({ id: "c" }), piece({ id: "d" })],
});

function seed(mode: "off" | "preview" | "live" | null) {
  h.state.collections.clear();
  h.state.sent.length = 0;
  h.state.reads.length = 0;
  h.state.deadTokens.clear();
  h.state.failReads.clear();
  if (mode) {
    h.coll("app_settings").set("smm_delivery", {
      mode, pilotUids: [], history: [{ mode, at: LIVE_SINCE, byUid: "ta", byName: "Tech Admin" }], ladder: { repeatHours: 2 },
    });
  }
  const m = lakshmi();
  h.coll("smm_campaigns").set(m.id, JSON.parse(JSON.stringify(m)));
  h.coll("smm_campaigns").set("old", { ...JSON.parse(JSON.stringify(m)), id: "old", status: "completed" });
  // Users carry more than the checker may read — it must ask only for name, role, smmLeader, isActive.
  for (const p of PEOPLE) h.coll("users").set(p.uid, { ...p, phone: "+91 90000 00000", salary: 25000 });
  h.coll("daily_checkins").set("ci-ravi", { memberId: "ravi", date: "2026-10-21", checkedInAt: { seconds: 1 } });
  h.coll("fcmTokens").set("tok-ravi-web", { userId: "ravi", token: "tok-ravi-web", platform: "web" });
  h.coll("fcmTokens").set("tok-ravi-phone", { userId: "ravi", token: "tok-ravi-phone", platform: "android", channels: "smm_urgent" });
  h.coll("fcmTokens").set("tok-kiran-old", { userId: "kiran", token: "tok-kiran-old", platform: "android" });
}

function response() {
  const res = {
    statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
    setHeader(k: string, v: string) { res.headers[k] = v; return res; },
  };
  return res;
}

async function call(headers: Record<string, string> = { "x-cron-secret": SECRET }, method = "GET") {
  const res = response();
  await handler({ method, headers } as never, res as never);
  return res as typeof res & { body: Record<string, unknown> };
}

/** What the supervisor says at `now` for the seeded data, computed independently of the handler. */
const expectedDue = (now: number, settings: SmmDeliverySettings) =>
  deliverableAlerts(monitorSmm({
    now, months: [lakshmi()], settings, holidays: new Set(), people: PEOPLE.map((p) => ({ ...p, presence: "working" as const })),
    answers: {}, baselineAt: LIVE_SINCE,
  }).alerts);

const LIVE: SmmDeliverySettings = { ...DEFAULT_SMM_DELIVERY, mode: "live", history: [{ mode: "live", at: LIVE_SINCE, byUid: "ta", byName: "Tech Admin" }] };

describe("api/smm-monitor — the handler on a fake firebase-admin", () => {
  const savedSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WED_1030);
    process.env.CRON_SECRET = SECRET;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
  });

  it("refuses without the secret (401), with no secret configured (500), and other methods (405) — reading nothing", async () => {
    seed("live");
    expect((await call({})).statusCode).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).statusCode).toBe(401);
    delete process.env.CRON_SECRET;
    const r = await call({ "x-cron-secret": "anything" });
    expect([r.statusCode, r.body]).toEqual([500, { error: "CRON_SECRET not configured" }]);
    process.env.CRON_SECRET = SECRET;
    expect((await call({ "x-cron-secret": SECRET }, "PUT")).statusCode).toBe(405);
    expect(h.state.reads).toEqual([]);
    expect(h.coll("notifications").size).toBe(0);
  });

  it("Preview (here: no settings document at all) computes, delivers nothing, writes the heartbeat with the counts", async () => {
    seed(null);
    const r = await call();
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ ok: true, mode: "preview", months: 1, delivered: 0 });
    expect(r.body.alerts).toBeGreaterThan(0);
    expect(h.coll("notifications").size).toBe(0);
    expect(h.state.sent).toEqual([]);
    const s = h.coll("app_settings").get("smm_delivery")!;
    expect(s.lastRunAt).toBe(h.SERVER_TIME);
    expect(s.lastRunSummary).toMatchObject({ at: WED_1030, mode: "preview", months: 1, delivered: 0, alerts: r.body.alerts });
    expect(Object.keys(s).sort()).toEqual(["lastRunAt", "lastRunSummary"]); // nothing else written
  });

  it("Off writes only the heartbeat — no month or person is read", async () => {
    seed("off");
    const r = await call();
    expect(r.body).toMatchObject({ ok: true, mode: "off", months: 0, alerts: 0, delivered: 0 });
    expect(h.state.reads).toEqual(["app_settings/smm_delivery"]);
    expect(h.coll("app_settings").get("smm_delivery")!.lastRunSummary).toMatchObject({ mode: "off" });
    expect(h.coll("app_settings").get("smm_delivery")!.mode).toBe("off"); // the switch untouched
  });

  it("Live writes each due alert once, pushes it once per device, and a second run sends nothing new", async () => {
    seed("live");
    const due = expectedDue(WED_1030, LIVE);
    expect(due.find((a) => a.uid === "ravi" && a.reason === "deadline_today")).toBeTruthy(); // the scenario is real

    const first = await call();
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({ ok: true, mode: "live", months: 1, delivered: due.length, alreadySent: 0, deferred: 0 });
    // Exactly the supervisor's due alerts, each under its once key, in the app's notification shape.
    expect([...h.coll("notifications").keys()].sort()).toEqual(due.map((a) => a.key).sort());
    const ravi = due.find((a) => a.uid === "ravi" && a.reason === "deadline_today")!;
    expect(h.coll("notifications").get(ravi.key)).toEqual({ ...notificationDocFor(ravi).data, createdAt: h.SERVER_TIME });
    // One push per new key per device: Ravi's web and phone; the phone (which has the channel) on smm_urgent.
    const messages = h.state.sent.flat();
    const toRavi = messages.filter((m) => m.data.tag === ravi.key);
    expect(toRavi.map((m) => [m.token, m.data.type, m.data.channelId, m.android.priority]).sort()).toEqual([
      ["tok-ravi-phone", "smm_urgent", "smm_urgent", "high"], ["tok-ravi-web", "smm_urgent", "default", "high"],
    ]);
    const keys = messages.map((m) => `${m.data.tag}|${m.token}`);
    expect(new Set(keys).size).toBe(keys.length);
    const settingsDoc = h.coll("app_settings").get("smm_delivery")!;
    expect(settingsDoc.lastRunSummary).toMatchObject({ mode: "live", delivered: due.length, pushed: messages.length });
    expect(settingsDoc.mode).toBe("live");
    // The users were read with the four fields only.
    expect(h.state.reads.some((r) => r.startsWith("users?"))).toBe(true);

    // A second run (cron-job.org 30 min later, or Vercel's backup in the same minute): nothing new.
    h.state.sent.length = 0;
    const second = await call({ authorization: `Bearer ${SECRET}` });
    expect(second.body).toMatchObject({ delivered: 0, alreadySent: due.length, pushed: 0 });
    expect(h.state.sent).toEqual([]);
    expect(h.coll("notifications").size).toBe(due.length);
  });

  it("nobody away is alerted: Ravi on leave today → his alert is held, the leads are asked to reassign", async () => {
    seed("live");
    h.coll("attendance").set("ravi_2026-10-21", { memberId: "ravi", date: "2026-10-21", status: "leave" });
    await call();
    const rows = [...h.coll("notifications").values()] as { userId: string; meta: { reason: string } }[];
    expect(rows.filter((n) => n.userId === "ravi")).toEqual([]);
    expect(rows.filter((n) => n.meta.reason === "owner_away").map((n) => n.userId).sort()).toEqual(["kiran", "manasa"]);
  });

  it("an unreadable optional source never stops the run (counted as an error); dead tokens are deleted", async () => {
    seed("live");
    h.state.failReads.add("daily_checkins");
    h.state.deadTokens.add("tok-ravi-web");
    const r = await call();
    expect(r.statusCode).toBe(200);
    expect(r.body.errors).toBeGreaterThanOrEqual(1);
    expect(r.body.readErrors).toEqual(["daily_checkins: daily_checkins unreadable"]);
    expect(r.body.tokensCleaned).toBe(1);
    expect(h.coll("fcmTokens").has("tok-ravi-web")).toBe(false);
    expect(h.coll("fcmTokens").has("tok-ravi-phone")).toBe(true);
  });

  it("a failed run (the months unreadable) answers 500 and writes no heartbeat — a stale 'last checked' shows it stopped", async () => {
    seed("live");
    h.state.failReads.add("smm_campaigns");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call();
    expect(r.statusCode).toBe(500);
    expect(h.coll("app_settings").get("smm_delivery")!.lastRunAt).toBeUndefined();
  });

  it("stops writing new notifications when the time budget is used — the rest are deferred to the next run", async () => {
    seed("live");
    // Thirteen running months, each with work due → more than one batch of ten.
    for (let i = 0; i < 12; i++) {
      const m = JSON.parse(JSON.stringify(lakshmi()));
      Object.assign(m, { id: `m${i + 2}`, businessName: `Client ${i + 2}` });
      m.items = m.items.map((it: { id: string }) => ({ ...it, id: `${it.id}-${i}` })); // ids are unique per piece
      h.coll("smm_campaigns").set(m.id, m);
    }
    let t = 0;
    const run = await runSmmMonitor({
      db: h.admin.firestore() as never,
      sendEach: async (msgs) => ({ responses: msgs.map(() => ({ success: true })) }),
      serverTimestamp: () => h.SERVER_TIME,
      now: WED_1030,
      clock: () => (t += 30_000), // every check of the clock is 30 s later
      budgetMs: 45_000,
    });
    expect(run.deliverable).toBeGreaterThan(10);
    expect(run.delivered).toBe(10); // one batch, then the budget was gone
    expect(run.deferred).toBe(run.deliverable - 10);
    expect(h.coll("notifications").size).toBe(10);
    expect(h.coll("app_settings").get("smm_delivery")!.lastRunSummary).toMatchObject({ delivered: 10, deferred: run.deferred });
  });
});

/* ── The web banner and the cron entry ──────────────────────────────────────────────────────── */

describe("the service worker shows an urgent SMM alert until it is acted on", () => {
  function loadWorker() {
    const handlers: Record<string, ((e: unknown) => void)[]> = {};
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const self = {
      addEventListener: (type: string, fn: (e: unknown) => void) => { (handlers[type] ||= []).push(fn); },
      registration: { showNotification: (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); return Promise.resolve(); } },
      skipWaiting: () => {},
      clients: { claim: () => Promise.resolve() },
    };
    const clients = { matchAll: () => Promise.resolve([]), openWindow: (url: string) => { opened.push(url); return Promise.resolve(null); } };
    const source = readFileSync(resolve(ROOT, "public/firebase-messaging-sw.js"), "utf8");
    // The repo's own worker file, evaluated with the globals it uses (as `pushNotifications.test.ts` does).
    new Function("self", "clients", "firebase", "importScripts", "caches", source)(
      self, clients, { initializeApp: () => {} }, () => {}, { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
    );
    const fire = async (type: string, event: Record<string, unknown>) => {
      const waits: Promise<unknown>[] = [];
      (handlers[type] || []).forEach((fn) => fn({ ...event, waitUntil: (p: Promise<unknown>) => { waits.push(p); } }));
      await Promise.all(waits);
    };
    return { fire, shown, opened };
  }

  it("requireInteraction, a hard vibration, its own tag; a tap opens /smm/control; other pushes unchanged", async () => {
    const w = loadWorker();
    const data = pushMessageFor(alert(), { token: "t" }).data;
    await w.fire("push", { data: { json: () => ({ data }) } });
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0].title).toBe("🎬 AI VIDEO · Lakshmi Jewellers");
    expect(w.shown[0].options).toMatchObject({ requireInteraction: true, renotify: true, tag: alert().key, actions: [] });
    expect((w.shown[0].options.vibrate as number[]).length).toBeGreaterThan(3);
    await w.fire("notificationclick", { notification: { close: () => {}, data: w.shown[0].options.data }, action: "" });
    expect(w.opened).toEqual(["/smm/control"]);

    const notice = pushMessageFor(alert({ level: "notice", fullScreen: false }), { token: "t" }).data;
    await w.fire("push", { data: { json: () => ({ data: notice }) } });
    await w.fire("push", { data: { json: () => ({ data: { type: "chat_message", title: "x", body: "y", link: "/l" } }) } });
    expect(w.shown[1].options).toMatchObject({ requireInteraction: false, vibrate: [180] });
    expect(w.shown[2].options).toMatchObject({ requireInteraction: false, vibrate: [180], tag: "chat-/l" });
  });
});

describe("vercel.json", () => {
  it("adds the daily backup cron (10:00 IST) and keeps the rewrites and headers", () => {
    const v = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
    expect(v.crons).toEqual([{ path: "/api/smm-monitor", schedule: "30 4 * * *" }]);
    expect(v.rewrites).toEqual([{ source: "/(.*)", destination: "/" }]);
    expect(v.headers.map((x: { source: string }) => x.source)).toEqual(["/assets/(.*)", "/", "/index.html", "/firebase-messaging-sw.js", "/manifest.webmanifest", "/version.json"]);
    expect(istMoment("2026-10-21", 10)).toBe(Date.UTC(2026, 9, 21, 4, 30)); // 04:30 UTC is 10:00 India time
  });
});
