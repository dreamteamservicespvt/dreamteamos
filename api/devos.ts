/**
 * DREAM TEAM AI Development OS — the server (2026-10-18).
 *
 * ── Why a server at all ───────────────────────────────────────────────────────────────────────────
 * The rest of DTS-OS writes Firestore from the browser. The Development OS cannot: answer keys must never reach a
 * browser before the learner answers, scores / XP / ranks must be computed by code the learner cannot change, and the
 * daily work must happen with every browser closed (MSRS FR-016, FR-029, FR-057, AC-020, AC-021). So every Dev OS write
 * goes through here, with the Admin SDK, and the engine (`src/devos/**`) runs here.
 *
 * ── Two doors ─────────────────────────────────────────────────────────────────────────────────────
 *   GET  (cron)  — `runTick`: Vercel's daily cron (`vercel.json`, Bearer CRON_SECRET) and cron-job.org every 30 minutes
 *                  (header `x-cron-secret`). The same check as `api/smm-monitor` (`utils/smmServerDelivery.cronAuthProblem`).
 *   POST {action, …} — a signed-in staff member: `Authorization: Bearer <Firebase ID token>`; who they are and their role
 *                  come from `users/{uid}`, never from the body; then `engine/router.dispatch`.
 *
 * ── Secrets ───────────────────────────────────────────────────────────────────────────────────────
 * The sealing / signing keys are derived from the service account's private key (`FIREBASE_SERVICE_ACCOUNT_KEY`,
 * already set for the other functions) — no new variable. Gemini keys: the `API_KEY_n` variables AdGen uses plus the
 * working keys in `gemini_api_keys` (AI Accounts). Nothing secret is ever returned or logged.
 *
 * ── Node ESM on Vercel ────────────────────────────────────────────────────────────────────────────
 * Every runtime relative import on this chain ends in `.js` (CLAUDE.md §28). Check after editing:
 *   npx esbuild api/devos.ts --bundle --platform=node --external:firebase-admin --external:@vercel/node --log-level=error > /dev/null
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { webcrypto } from "node:crypto";
import admin from "firebase-admin";
import { deriveSecrets, type DevSecrets } from "../src/devos/core/crypto.js";
import { istDay } from "../src/devos/core/days.js";
import { adminStore, type AdminDb } from "../src/devos/engine/store.js";
import { DevError, PATH, type Actor, type AiPort, type Deps, type Notice } from "../src/devos/engine/context.js";
import { geminiPort } from "../src/devos/engine/geminiPort.js";
import { dispatch } from "../src/devos/engine/router.js";
import { bumpQuality, deadKeyFingerprints, recordDeadKeys, runTick } from "../src/devos/engine/tick.js";
import { cronAuthProblem } from "../src/utils/smmServerDelivery.js";
import type { AiCallLog, HealthDoc } from "../src/devos/core/types.js";

export const config = { maxDuration: 60 };

// The engine seals and signs with WebCrypto (`globalThis.crypto.subtle`, core/crypto.ts). Node 20+ has it built in;
// this keeps an older runtime working instead of failing every request.
if (!globalThis.crypto) (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;

const APP_ICON = "https://res.cloudinary.com/dvmrhs2ek/image/upload/v1774554466/jdqjbuvcdo40o5gzdlvz.png";

const ALLOWED = [/^https:\/\/dreamteamos\.vercel\.app$/, /^https:\/\/dreamteamos-[a-z0-9-]+\.vercel\.app$/, /^https:\/\/localhost$/, /^http:\/\/localhost(:\d+)?$/];

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin ?? "");
  if (ALLOWED.some((re) => re.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

let serviceAccount: { private_key?: string } | null = null;
function adminApp() {
  if (!admin.apps.length) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount as admin.ServiceAccount) });
  } else if (!serviceAccount) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  }
  return admin;
}

let secretsPromise: Promise<DevSecrets> | null = null;
function secrets(): Promise<DevSecrets> {
  if (!secretsPromise) {
    const material = serviceAccount?.private_key || "";
    if (material.length < 100) throw new DevError(500, "no_secret", "The server is missing its service account.");
    secretsPromise = deriveSecrets(material);
  }
  return secretsPromise;
}

/** The Gemini keys: the deployment's API_KEY_n (as AdGen) + working keys saved in AI Accounts. */
async function geminiKeys(db: admin.firestore.Firestore): Promise<string[]> {
  const env: string[] = [];
  for (const prefix of ["API_KEY_", "VITE_API_KEY_"]) for (let i = 1; i <= 40; i++) {
    const v = process.env[`${prefix}${i}`];
    if (v) env.push(v);
  }
  for (const k of ["GEMINI_API_KEY", "API_KEY", "VITE_API_KEY"]) if (process.env[k]) env.push(process.env[k]!);
  try {
    const snap = await db.collection("gemini_api_keys").limit(60).get();
    for (const d of snap.docs) {
      const data = d.data() as { key?: string; status?: string };
      if (data.key && data.status !== "failed") env.push(data.key);
    }
  } catch {
    // AI Accounts unreadable — the environment keys still work.
  }
  return [...new Set(env.map((k) => k.trim()).filter((k) => k.length > 20))];
}

/**
 * A lazily-built, metered AI port: keys are read only when a request really calls the AI. Keys an earlier request
 * found dead are skipped (`devos_health/current.deadKeys`), and the ones this request finds are reported to `onDead`.
 */
function lazyAi(
  db: admin.firestore.Firestore, budget: () => Promise<{ left: number; skip: string[] }>,
  onDead: (fp: string, why: string) => void, calls: AiCallLog[], maxCalls: number,
): AiPort {
  let port: Promise<AiPort> | null = null;
  let left = 0;
  const get = () => (port ??= (async () => {
    const b = await budget();
    left = b.left;
    const keys = await geminiKeys(db);
    return geminiPort({ keys, maxCalls, timeoutMs: 25_000, allow: () => left-- > 0, skip: b.skip, onDeadKey: onDead });
  })());
  const wrap = <K extends keyof AiPort>(name: K) => async (...args: unknown[]) => {
    const p = await get();
    const fn = p[name] as unknown as (...a: unknown[]) => Promise<{ calls: AiCallLog[] }>;
    const r = await fn(...args);
    calls.push(...(r.calls ?? []));
    return r;
  };
  return {
    name: "gemini",
    generateItems: wrap("generateItems"), solveItems: wrap("solveItems"), judge: wrap("judge"), embed: wrap("embed"),
    coach: wrap("coach"), report: wrap("report"), practical: wrap("practical"),
  } as unknown as AiPort;
}

function notifier(db: admin.firestore.Firestore): Deps["notify"] {
  return {
    async send(n: Notice) {
      const id = n.key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 1400);
      try {
        await db.collection("notifications").doc(id).create({
          userId: n.uid, type: n.type, title: n.title, message: n.message, link: n.link, read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(), meta: { source: "devos", key: n.key },
        });
      } catch (e) {
        const code = (e as { code?: unknown }).code;
        if (code === 6 || code === "already-exists" || /already exists/i.test(String((e as Error).message))) return false;
        throw e;
      }
      if (n.push) {
        try {
          const tokens = (await db.collection("fcmTokens").where("userId", "==", n.uid).get()).docs.map((d) => String(d.data().token ?? d.id)).filter(Boolean);
          if (tokens.length) {
            const res = await admin.messaging().sendEachForMulticast({
              tokens,
              data: { title: n.title, body: n.message, type: n.type, channelId: "default", link: n.link || "/", icon: APP_ICON },
              android: { priority: "high", ttl: 86_400_000 },
              webpush: { headers: { Urgency: "normal" } },
            });
            const dead = res.responses.map((r, i) => (!r.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(String(r.error?.code)) ? tokens[i] : null)).filter((t): t is string => !!t);
            if (dead.length) {
              const b = db.batch();
              for (const t of dead) b.delete(db.collection("fcmTokens").doc(t));
              await b.commit();
            }
          }
        } catch (e) {
          console.warn("[devos] push failed:", e instanceof Error ? e.message : e);
        }
      }
      return true;
    },
  };
}

async function makeDeps(maxCalls: number): Promise<{ deps: Deps; calls: AiCallLog[]; dead: { fp: string; why: string }[] }> {
  const sdk = adminApp();
  const db = sdk.firestore();
  try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* already set on a warm instance */ }
  const store = adminStore(db as unknown as AdminDb);
  const calls: AiCallLog[] = [];
  const dead: { fp: string; why: string }[] = [];
  const budget = async () => {
    const h = (await store.get(PATH.health)) as unknown as HealthDoc | null;
    const policyDoc = await store.get(PATH.policy);
    const cap = Number((policyDoc as { ai?: { dailyCallBudget?: number } } | null)?.ai?.dailyCallBudget ?? 400);
    const used = h?.ai?.day === istDay(Date.now()) ? h.ai.calls : 0;
    return { left: Math.max(0, cap - used), skip: deadKeyFingerprints(h, Date.now()) };
  };
  const deps: Deps = {
    store, ai: lazyAi(db, budget, (fp, why) => dead.push({ fp, why }), calls, maxCalls), secrets: await secrets(), now: () => Date.now(),
    notify: notifier(db),
    log: (level, msg, data) => (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[devos] ${msg}`, data ?? ""),
  };
  return { deps, calls, dead };
}

/** After a request: count its AI calls and remember the dead keys it met (both never fatal). */
async function afterRequest(deps: Deps, calls: AiCallLog[], dead: { fp: string; why: string }[]): Promise<void> {
  if (calls.length) await bumpQuality(deps, istDay(Date.now()), {}, calls).catch(() => undefined);
  if (dead.length) await recordDeadKeys(deps, dead).catch(() => undefined);
}

async function actorFrom(req: VercelRequest): Promise<Actor> {
  const header = String(req.headers.authorization ?? "");
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) throw new DevError(401, "signin", "Please sign in again.");
  let uid: string;
  try {
    uid = (await adminApp().auth().verifyIdToken(token)).uid;
  } catch {
    throw new DevError(401, "signin", "Your session has expired — please sign in again.");
  }
  const snap = await adminApp().firestore().collection("users").doc(uid).get();
  if (!snap.exists) throw new DevError(403, "no_user", "Your account was not found.");
  const u = snap.data() as { name?: string; role?: string; createdBy?: string; isActive?: boolean; externalCreator?: boolean };
  return { uid, name: String(u.name ?? ""), role: String(u.role ?? ""), team: String(u.createdBy ?? ""), isActive: u.isActive !== false, externalCreator: !!u.externalCreator };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const denied = cronAuthProblem(req.headers as Record<string, unknown>, process.env.CRON_SECRET);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    try {
      const { deps, calls, dead } = await makeDeps(40);
      const summary = await runTick(deps, { reason: "cron", budgetMs: 48_000 });
      await afterRequest(deps, calls, dead);
      return res.status(200).json({ ok: true, ...summary });
    } catch (e) {
      console.error("[devos] tick failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const actor = await actorFrom(req);
    const { deps, calls, dead } = await makeDeps(action === "admin.tick" || action === "catchup" ? 30 : 8);
    const result = await dispatch(deps, actor, action, body);
    await afterRequest(deps, calls, dead);
    return res.status(200).json({ ok: true, result: result ?? null });
  } catch (e) {
    if (e instanceof DevError) return res.status(e.status).json({ ok: false, code: e.code, error: e.message });
    console.error("[devos] request failed:", e instanceof Error ? e.stack ?? e.message : e);
    return res.status(500).json({ ok: false, code: "server", error: "Something went wrong on the server. Your progress is safe — please try again." });
  }
}
