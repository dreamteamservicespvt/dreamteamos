/**
 * SMM Delivery Control — the SERVER CHECKER: the supervisor run when every app is closed (2026-10-15,
 * phase 6 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why it exists ───────────────────────────────────────────────────────────────────────────────
 * The owner: "the work is not done … we have to inform them manually every time." Everything else in the app
 * runs when somebody opens a page ("on-open sweeps"); there is no scheduler. A piece that falls late at 7 PM
 * while the maker's phone is in their pocket must still reach them — so this function runs the SAME rules the
 * app runs (`utils/smmMonitor.monitorSmm` on `utils/smmCadence`, both pure and alias-free) on the server, and
 * delivers what is due as a bell row + a push.
 *
 * ── How it is woken (Vercel is on the FREE plan) ────────────────────────────────────────────────
 *   • cron-job.org (free) calls GET https://dreamteamos.vercel.app/api/smm-monitor every 30 minutes from 09:00 to
 *     20:00 Asia/Kolkata, with the header `x-cron-secret: <CRON_SECRET>`. That is the real clock.
 *   • Vercel Cron (`vercel.json` → "30 4 * * *" = 10:00 IST) is the BACKUP: a Hobby project may run a cron once a
 *     day, ±59 min. Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has that variable.
 * Both may land in the same minute; that is harmless (one sender, below). Outside 09:00–20:00 nothing gates it:
 * the monitor itself holds everything but criticals in quiet hours, and escalation days start at 09:00.
 *
 * ── One sender, and it never writes anything else ───────────────────────────────────────────────
 * With the checker on, only this function writes the alerts' notifications and sends their pushes; the apps
 * only display them. A notification's document id is the alert's once key, written with `create()` — which
 * fails when it exists, so a key is delivered (and pushed) once, ever, however many runs see it. Beyond those
 * rows it writes exactly two fields: `app_settings/smm_delivery.lastRunAt` + `lastRunSummary` (the heartbeat
 * Settings shows as "supervisor checked n min ago"; merge, never another field) — and deletes push tokens FCM
 * says are dead, as `api/send-notification.ts` does. It never touches a month: the checker never writes (the
 * plan's pre-mortem — only human answers write).
 *
 * ── The switch ──────────────────────────────────────────────────────────────────────────────────
 * Off → nothing but the heartbeat. Preview (also a missing settings document) → everything computed, nothing
 * delivered (the alerts come back held), the heartbeat with the counts. Live → delivered.
 *
 * ── Limits ──────────────────────────────────────────────────────────────────────────────────────
 * 60 s at most (`config.maxDuration`). Each month is checked in its own try/catch inside the monitor. New
 * notifications stop after SEND_BUDGET_MS; whatever is left is reported as deferred and goes on the next run
 * (its document was not created). Times are India time throughout (`istDay`); the server runs in UTC.
 *
 * ── Protection ──────────────────────────────────────────────────────────────────────────────────
 * `CRON_SECRET` (Vercel environment variable) is required: missing → 500, wrong or absent header → 401. The
 * secret is never logged and never sent back. Unlike `/api/send-notification`, this function uses the Admin SDK's
 * messaging directly and takes no recipient from the request — the request can only say "run now".
 *
 * ── Why the imports end in `.js` ────────────────────────────────────────────────────────────────
 * package.json is `"type": "module"`, so Vercel transpiles each `.ts` file on its own into Node ESM, and Node ESM
 * only finds "../src/utils/smmMonitor.js" (the extensionless form loads under `vercel dev`'s tsx, then fails in
 * production). Vercel's tracer maps the `.js` back to the `.ts`. Every runtime import in the chain does the same;
 * `src/test/smmServerCheckerOct15.test.ts` checks it. Check this file after editing it:
 *   npx esbuild api/smm-monitor.ts --bundle --platform=node --external:firebase-admin --external:@vercel/node
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";
import { monitorSmm } from "../src/utils/smmMonitor.js";
import { istDay, type SmmDeliveryMonth } from "../src/utils/smmCadence.js";
import { parseSmmDeliverySettings } from "../src/utils/smmDeliverySettings.js";
import { liveSinceAt } from "../src/utils/smmDeliveryBaseline.js";
import { monitorPeopleFrom, type ServerUserDoc } from "../src/utils/smmServerPresence.js";
import {
  chunk, cronAuthProblem, deliverableAlerts, isAlreadyExists, isDeadTokenCode, notificationDocFor, parseAlertAnswers,
  pushMessageFor, type SmmPushMessage, type SmmPushToken,
} from "../src/utils/smmServerDelivery.js";
import type { SmmDeliveryRunSummary } from "../src/types/smmDelivery.js";
import type { SmmAlert } from "../src/utils/smmMonitor.js";

export const config = { maxDuration: 60 };

/** No new notification is started after this many ms of the run; the rest go next run. Leaves time for the
 *  pushes of what was written, the heartbeat and the reply inside the 60 s limit. */
export const SEND_BUDGET_MS = 40_000;
/** Notifications written at once (each `create` is one round trip). */
const CREATE_BATCH = 10;

/* ── The run, with its dependencies passed in (the handler passes the real SDK; tests a fake) ── */

type Db = ReturnType<typeof admin.firestore>;

export interface SmmMonitorDeps {
  db: Db;
  /** Sends FCM messages one per device (`admin.messaging().sendEach`). */
  sendEach: (messages: SmmPushMessage[]) => Promise<{ responses: { success: boolean; error?: { code?: string } }[] }>;
  serverTimestamp: () => unknown;
  /** ms — the run's "now" (India time is derived from it). */
  now: number;
  /** Elapsed-time clock (ms); `Date.now` in production. */
  clock?: () => number;
  budgetMs?: number;
}

export interface SmmMonitorRun extends SmmDeliveryRunSummary {
  deliverable: number;
  alreadySent: number;
  deferred: number;
  pushed: number;
  pushFailed: number;
  tokensCleaned: number;
  readErrors: string[];
}

const docsOf = (snap: { docs: { id: string; data: () => unknown }[] }) =>
  snap.docs.map((d) => ({ id: d.id, data: (d.data() || {}) as Record<string, unknown> }));

export async function runSmmMonitor(deps: SmmMonitorDeps): Promise<SmmMonitorRun> {
  const clock = deps.clock || Date.now;
  const started = clock();
  const budget = deps.budgetMs ?? SEND_BUDGET_MS;
  const { db, now } = deps;
  const today = istDay(now);
  const settingsRef = db.collection("app_settings").doc("smm_delivery");
  const settingsSnap = await settingsRef.get();
  const settings = parseSmmDeliverySettings(settingsSnap.exists ? settingsSnap.data() : null);

  const run: SmmMonitorRun = {
    at: now, mode: settings.mode, months: 0, alerts: 0, delivered: 0, errors: 0, ms: 0,
    deliverable: 0, alreadySent: 0, deferred: 0, pushed: 0, pushFailed: 0, tokensCleaned: 0, readErrors: [],
  };

  const heartbeat = async () => {
    run.ms = Math.max(0, clock() - started);
    const summary: SmmDeliveryRunSummary = {
      at: run.at, mode: run.mode, months: run.months, alerts: run.alerts, delivered: run.delivered, errors: run.errors,
      ms: run.ms, deferred: run.deferred, pushed: run.pushed,
    };
    // Merge: the heartbeat's two fields only — the switch, its numbers and its history are the admins'.
    await settingsRef.set({ lastRunAt: deps.serverTimestamp(), lastRunSummary: summary }, { merge: true });
  };

  if (settings.mode === "off") {
    await heartbeat();
    return run;
  }

  // ── Read: the months and the people are required; the rest only sharpen the answer ───────────
  const optional = async <T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read();
    } catch (e) {
      run.readErrors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  };
  const [monthSnap, userSnap, holidays, marks, checkins, leaveRequests, stateDocs] = await Promise.all([
    db.collection("smm_campaigns").where("status", "==", "active").get(),
    // Only what the rules need — never the profile's phone, salary or anything else.
    db.collection("users").select("name", "role", "smmLeader", "isActive").get(),
    // Null = unreadable: working days are then Mon–Sat only (the plan's "holidays missing" rule).
    optional<ReadonlySet<string> | null>("holidays", async () => {
      const snap = await db.collection("holidays").get();
      return new Set(docsOf(snap).map((d) => (typeof d.data.date === "string" ? d.data.date : d.id)));
    }, null),
    optional("attendance", async () => docsOf(await db.collection("attendance").where("date", "==", today).get()).map((d) => d.data), []),
    optional("daily_checkins", async () => docsOf(await db.collection("daily_checkins").where("date", "==", today).get()).map((d) => d.data), []),
    // One range on one field (no composite index): every request ending today or later; filtered in the rule.
    optional("leave_requests", async () => docsOf(await db.collection("leave_requests").where("toDate", ">=", today).get()).map((d) => d.data), []),
    optional("smm_alert_state", async () => docsOf(await db.collection("smm_alert_state").get()), []),
  ]);
  run.errors += run.readErrors.length;

  const months = docsOf(monthSnap).map((d) => ({ ...d.data, id: d.id }) as unknown as SmmDeliveryMonth);
  const users: ServerUserDoc[] = docsOf(userSnap).map((d) => ({ uid: d.id, ...d.data }));
  const people = monitorPeopleFrom(users, { day: today, marks, checkins, holidays, leaveRequests });
  run.months = months.length;

  const result = monitorSmm({
    now,
    months,
    settings,
    holidays,
    people,
    answers: parseAlertAnswers(stateDocs),
    // Months switched on one by one carry their own `delivery.baselineAt`; the rest start when it went live.
    baselineAt: liveSinceAt(settings, now) ?? undefined,
  });
  run.alerts = result.alerts.length;
  run.errors += result.errors.length;
  if (result.errors.length) console.warn("[smm-monitor] months not checked:", result.errors.map((e) => e.campaignId).join(", "));

  if (settings.mode !== "live") {
    await heartbeat();
    return run;
  }

  // ── Deliver: worst first, each key once ───────────────────────────────────────────────────────
  const due = deliverableAlerts(result.alerts);
  run.deliverable = due.length;
  const tokensOf = new Map<string, SmmPushToken[]>();
  const deadTokens = new Set<string>();

  const loadTokens = async (uids: string[]) => {
    const missing = uids.filter((u) => !tokensOf.has(u));
    missing.forEach((u) => tokensOf.set(u, []));
    for (const group of chunk(missing, 30)) {
      const snap = await db.collection("fcmTokens").where("userId", "in", group).get();
      for (const d of docsOf(snap)) {
        const uid = typeof d.data.userId === "string" ? d.data.userId : "";
        const token = typeof d.data.token === "string" && d.data.token ? d.data.token : d.id;
        if (!uid || !token) continue;
        tokensOf.get(uid)?.push({
          token,
          platform: typeof d.data.platform === "string" ? d.data.platform : undefined,
          channels: typeof d.data.channels === "string" ? d.data.channels : undefined,
        });
      }
    }
  };

  const groups = chunk(due, CREATE_BATCH);
  for (let g = 0; g < groups.length; g++) {
    if (clock() - started > budget) {
      run.deferred = groups.slice(g).reduce((n, list) => n + list.length, 0);
      console.warn(`[smm-monitor] time budget used — ${run.deferred} alert(s) deferred to the next run`);
      break;
    }
    const created: SmmAlert[] = [];
    await Promise.all(groups[g].map(async (alert) => {
      const { id, data } = notificationDocFor(alert);
      try {
        await db.collection("notifications").doc(id).create({ ...data, createdAt: deps.serverTimestamp() });
        created.push(alert);
      } catch (e) {
        if (isAlreadyExists(e)) run.alreadySent += 1;
        else {
          run.errors += 1;
          console.error("[smm-monitor] notification not written:", id, e instanceof Error ? e.message : e);
        }
      }
    }));
    run.delivered += created.length;
    if (!created.length) continue;

    // A push only for what THIS run wrote — a push failure never undoes the bell row.
    try {
      await loadTokens([...new Set(created.map((a) => a.uid))]);
      const messages = created.flatMap((a) => (tokensOf.get(a.uid) || []).map((t) => pushMessageFor(a, t)));
      for (const batch of chunk(messages, 500)) {
        const res = await deps.sendEach(batch);
        res.responses.forEach((r, i) => {
          if (r.success) run.pushed += 1;
          else {
            run.pushFailed += 1;
            if (isDeadTokenCode(r.error?.code)) deadTokens.add(batch[i].token);
          }
        });
      }
    } catch (e) {
      run.errors += 1;
      console.error("[smm-monitor] push failed:", e instanceof Error ? e.message : e);
    }
  }

  if (deadTokens.size) {
    try {
      const batch = db.batch();
      for (const token of deadTokens) batch.delete(db.collection("fcmTokens").doc(token));
      await batch.commit();
      run.tokensCleaned = deadTokens.size;
    } catch (e) {
      console.error("[smm-monitor] dead tokens not cleaned:", e instanceof Error ? e.message : e);
    }
  }

  await heartbeat();
  return run;
}

/* ── The HTTP handler ───────────────────────────────────────────────────────────────────────────── */

function adminApp() {
  // Initialised on the first authorised call, not at load: an unauthorised caller gets its 401 even when the
  // service account is missing, and nothing is set up for a request that will be refused.
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const denied = cronAuthProblem(req.headers as Record<string, unknown>, process.env.CRON_SECRET);
  if (denied) return res.status(denied.status).json({ error: denied.error });

  try {
    const sdk = adminApp();
    const messaging = sdk.messaging();
    const run = await runSmmMonitor({
      db: sdk.firestore(),
      sendEach: (messages) => messaging.sendEach(messages),
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      now: Date.now(),
    });
    return res.status(200).json({ ok: true, ...run });
  } catch (error) {
    // No heartbeat on a failed run: a stale "last checked" is how the admins see the checker stopped.
    console.error("[smm-monitor] run failed:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
