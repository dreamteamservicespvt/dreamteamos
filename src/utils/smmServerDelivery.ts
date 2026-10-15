/**
 * SMM Delivery Control — what the server checker WRITES and SENDS for an alert (2026-10-15, phase 6:
 * `api/smm-monitor.ts`). Pure, so the exact notification and push shapes are tested without Firebase.
 *
 * ── One sender ──────────────────────────────────────────────────────────────────────────────────
 * With the server checker on, only the server writes these notifications and sends their pushes; the apps only
 * display them. The notification's document id IS the alert's once key (`smm_alert_<subject>_<level>_<stamp>
 * _<uid>`), written with `create()` — which fails when the document exists. That failure is the dedupe: a key
 * is written, and pushed, exactly once, ever, however many runs (cron-job.org every 30 min, the Vercel daily
 * backup, a retry) see the same alert, and whether the person read, cleared or dismissed it since. A push goes
 * out only for a document THIS run created.
 *
 * ── Two kinds ───────────────────────────────────────────────────────────────────────────────────
 *   • `smm_urgent` — an alert that takes the screen (amber / full / red / critical): high-priority push, the
 *     Android `smm_urgent` channel where the phone has it, and on the web a notification that stays until it is
 *     acted on (`requireInteraction`), vibrates hard and is tagged with its key.
 *   • `smm_notice` — the bell only (the week's task list, "the lead is told", "the client keeps changing"):
 *     normal priority, the default channel.
 * "watch" (early warning) is never sent — it lives on the Today screen only.
 *
 * ── Why the Android channel is chosen per device ────────────────────────────────────────────────
 * A push names its channel in `data.channelId`, and the app's native background handler
 * (`DTSFirebaseMessagingService`) posts to exactly that channel. Android 8+ silently DROPS a notification
 * posted to a channel the phone does not have — and `smm_urgent` exists only on a phone whose app created it
 * (`services/fcm.ts`, from this phase). Such a device marks its token `channels: "smm_urgent"`; every other
 * token (older app builds, the web) gets "default", which every build has. So an urgent alert is never lost
 * to a missing channel.
 *
 * Pure and alias-free (the server loads it as Node ESM; it imports types only).
 */
import type { SmmAlert, SmmAlertAnswer, SmmAlertAnswerKind } from "./smmMonitor";

export const SMM_URGENT_TYPE = "smm_urgent";
export const SMM_NOTICE_TYPE = "smm_notice";
/** The Android notification channel for urgent alerts (created by the app, `services/fcm.ts`). */
export const SMM_URGENT_CHANNEL = "smm_urgent";
/** Where every alert opens: the Delivery Control page, which all six Social Media roles can open (phase 2). */
export const SMM_CONTROL_LINK = "/smm/control";
/** The app icon the other senders use (`api/send-notification.ts`). */
export const SMM_PUSH_ICON = "https://res.cloudinary.com/dvmrhs2ek/image/upload/v1774554466/jdqjbuvcdo40o5gzdlvz.png";

/** How long FCM keeps trying to reach a phone that is off: an urgent alert is stale after a few hours (the
 *  ladder sends a newer one every 2 h); a notice may wait a day, like the app's other notifications. */
export const SMM_URGENT_TTL_MS = 4 * 3_600_000;
export const SMM_NOTICE_TTL_MS = 24 * 3_600_000;

/* ── Who may run it ──────────────────────────────────────────────────────────────────────────── */

/** Compares without stopping at the first difference (no timing hint about the secret). */
function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const headerOf = (headers: Record<string, unknown> | null | undefined, name: string): string => {
  const v = headers?.[name] ?? headers?.[name.toLowerCase()];
  const one = Array.isArray(v) ? v[0] : v;
  return typeof one === "string" ? one.trim() : "";
};

/**
 * Why this request may not run the checker, or null when it may. The caller must hold `CRON_SECRET`: as
 * `Authorization: Bearer <secret>` (what Vercel Cron sends when the project has a `CRON_SECRET`) or as
 * `x-cron-secret: <secret>` (cron-job.org's custom header). No secret configured → nobody may run it.
 */
export function cronAuthProblem(
  headers: Record<string, unknown> | null | undefined,
  secret: string | null | undefined,
): { status: 401 | 500; error: string } | null {
  const want = (secret || "").trim();
  if (!want) return { status: 500, error: "CRON_SECRET not configured" };
  const auth = headerOf(headers, "authorization");
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() || "";
  const custom = headerOf(headers, "x-cron-secret");
  if ((bearer && sameSecret(bearer, want)) || (custom && sameSecret(custom, want))) return null;
  return { status: 401, error: "Unauthorized" };
}

/* ── What is sent ────────────────────────────────────────────────────────────────────────────── */

/** The alerts the server delivers now: due now, and not an early warning. Kept in the monitor's order (worst first). */
export function deliverableAlerts(alerts: readonly SmmAlert[]): SmmAlert[] {
  return alerts.filter((a) => a.deliverNow === true && a.level !== "watch");
}

/** The notification's document id: the once key (already safe; cleaned the way `sendNotification` cleans keys). */
export function notificationIdFor(alert: Pick<SmmAlert, "key">): string {
  return alert.key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 1500);
}

export function notificationTypeFor(alert: Pick<SmmAlert, "fullScreen">): typeof SMM_URGENT_TYPE | typeof SMM_NOTICE_TYPE {
  return alert.fullScreen ? SMM_URGENT_TYPE : SMM_NOTICE_TYPE;
}

export interface SmmNotificationDoc {
  userId: string;
  type: string;
  title: string;
  message: string;
  read: false;
  link: string;
  meta: {
    key: string;
    level: string;
    reason: string;
    alertType: string;
    campaignId: string;
    itemIds: string[];
    fullScreen: boolean;
    critical: boolean;
    subject: string;
  };
}

/**
 * The bell row for an alert, as `services/notifications.sendNotification` shapes rows (the caller adds
 * `createdAt: serverTimestamp()`). Every field is defined — Firestore refuses `undefined`.
 */
export function notificationDocFor(alert: SmmAlert): { id: string; data: SmmNotificationDoc } {
  return {
    id: notificationIdFor(alert),
    data: {
      userId: alert.uid,
      type: notificationTypeFor(alert),
      title: alert.title,
      message: alert.message,
      read: false,
      link: SMM_CONTROL_LINK,
      meta: {
        key: alert.key,
        level: alert.level,
        reason: alert.reason,
        alertType: alert.type,
        campaignId: alert.campaignId || "",
        itemIds: [...(alert.itemIds || [])],
        fullScreen: !!alert.fullScreen,
        critical: !!alert.critical,
        subject: alert.subject,
      },
    },
  };
}

/** One device's push token, as `fcmTokens/{token}` holds it. */
export interface SmmPushToken {
  token: string;
  /** "android" / "web" (absent on old rows). */
  platform?: string;
  /** Channels the app on this device created itself — "smm_urgent" since phase 6. */
  channels?: string;
}

/** The Android channel for this alert on this device (see the header: never a channel the phone lacks). */
export function channelFor(alert: Pick<SmmAlert, "fullScreen">, token: Pick<SmmPushToken, "channels">): string {
  const has = String(token.channels || "").split(/[\s,]+/).includes(SMM_URGENT_CHANNEL);
  return alert.fullScreen && has ? SMM_URGENT_CHANNEL : "default";
}

/** An FCM message (the Admin SDK's `Message`), kept as a plain shape so this file needs no SDK. */
export interface SmmPushMessage {
  token: string;
  data: Record<string, string>;
  android: { priority: "high" | "normal"; ttl: number };
  webpush: { headers: Record<string, string> };
}

/**
 * The push for one alert to one device. DATA-ONLY, like every push this app sends (`api/send-notification.ts`):
 * a `notification` block makes the browser show its own banner next to the service worker's, and Android draw
 * its own with the wrong icon. The service worker and the native handler render from `data` (all strings).
 */
export function pushMessageFor(alert: SmmAlert, token: SmmPushToken): SmmPushMessage {
  const urgent = !!alert.fullScreen;
  const ttl = urgent ? SMM_URGENT_TTL_MS : SMM_NOTICE_TTL_MS;
  return {
    token: token.token,
    data: {
      title: alert.title,
      body: alert.message,
      type: notificationTypeFor(alert),
      channelId: channelFor(alert, token),
      link: SMM_CONTROL_LINK,
      icon: SMM_PUSH_ICON,
      // The web notification's tag: one banner per alert, never merged with another.
      tag: alert.key,
      level: alert.level,
      critical: alert.critical ? "1" : "0",
    },
    android: { priority: urgent ? "high" : "normal", ttl },
    webpush: { headers: { Urgency: urgent ? "high" : "normal", TTL: String(Math.round(ttl / 1000)) } },
  };
}

/* ── What the SDK answers ────────────────────────────────────────────────────────────────────── */

/** `create()` refused because the document exists — this alert was already delivered. */
export function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  return e.code === 6 || e.code === "already-exists" || e.code === "ALREADY_EXISTS" || /ALREADY_EXISTS|already exists/i.test(String(e.message || ""));
}

/** FCM's answer for a token that will never work again — deleted, as `api/send-notification.ts` does. */
export function isDeadTokenCode(code: unknown): boolean {
  return code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered";
}

/* ── What people answered (`smm_alert_state/{uid}`) ──────────────────────────────────────────── */

const ANSWER_KINDS: readonly SmmAlertAnswerKind[] = ["on_it", "escalate", "remind", "called", "whatsapp"];

const msOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = v as { toMillis?: () => number } | null;
  if (t && typeof t.toMillis === "function") {
    const ms = t.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

/**
 * `smm_alert_state` documents (id = the person's uid, `{ answers: { [subject]: { kind, at, byName? } } }`) as the
 * monitor reads them: uid → subject → { kind, at }. Anything unreadable is skipped, never fatal.
 */
export function parseAlertAnswers(
  docs: readonly { id: string; data: unknown }[],
): Record<string, Record<string, SmmAlertAnswer>> {
  const out: Record<string, Record<string, SmmAlertAnswer>> = {};
  for (const d of docs) {
    const answers = (d.data as { answers?: unknown } | null)?.answers;
    if (!d.id || !answers || typeof answers !== "object" || Array.isArray(answers)) continue;
    for (const [subject, raw] of Object.entries(answers as Record<string, unknown>)) {
      const a = raw as { kind?: unknown; at?: unknown } | null;
      const at = msOf(a?.at);
      if (!a || !ANSWER_KINDS.includes(a.kind as SmmAlertAnswerKind) || at == null) continue;
      (out[d.id] ||= {})[subject] = { kind: a.kind as SmmAlertAnswerKind, at };
    }
  }
  return out;
}

/** Splits a list into pieces of at most `size` (Firestore's `in` takes 30; FCM's `sendEach` 500). */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += Math.max(1, size)) out.push(list.slice(i, i + Math.max(1, size)));
  return out;
}
