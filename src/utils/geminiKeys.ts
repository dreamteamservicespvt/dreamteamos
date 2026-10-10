/**
 * Gemini API keys made in the team's Flow accounts — the pure rules (2026-10-10, types/aiAccounts).
 *
 * ── Why the team collects them ───────────────────────────────────────────────────────────────
 * DTS AdGen writes every ad's prompts with Gemini, and a free key is one project's quota (a few requests
 * a minute, a few hundred a day). Every Flow account is a Google account that can make its own free key
 * in AI Studio, so a key from each account is a pool large enough that the generator stops running dry.
 * On 2026-10-10, 11 of the 30 keys AdGen was built with answered "API key not valid" or "reported as
 * leaked" — this is how they are replaced.
 *
 * Members paste a key on the account's card; it is checked with Google (`keyCheckFrom`) before it is
 * saved. The tech admin copies a set (one per line) or downloads it as a .env (`keysAsEnvFile`) and
 * pastes it into Vercel — AdGen reads `API_KEY_1` … `API_KEY_30` from the environment.
 */
import type { AppUser } from "@/types";
import type { ApiKeyStatus, FlowAccount, GeminiApiKey } from "@/types/aiAccounts";

/**
 * Who sees every key — the tech admin only (owner, 2026-10-10); team leaders manage the accounts but
 * not their keys. (The main admin cannot open the tech admin's pages; the Firestore rule allows them too.)
 */
export function canSeeAllApiKeys(user: Pick<AppUser, "role"> | null | undefined): boolean {
  return user?.role === "tech_admin";
}

/** Who may see, add or replace one account's key: the tech admin, and the people the account is shown to. */
export function canHandleApiKey(user: Pick<AppUser, "uid" | "role"> | null | undefined, account: Pick<FlowAccount, "visibleTo">): boolean {
  return canSeeAllApiKeys(user) || (!!user?.uid && (account.visibleTo || []).includes(user.uid));
}

/** Where keys are made, what the owner asked each one to be called, and the project it goes in. */
export const AI_STUDIO_KEYS_URL = "https://aistudio.google.com/api-keys";
export const API_KEY_NAME = "Gemini API Key";
export const API_KEY_PROJECT = "aiads";
/** The variables AdGen reads (services/geminiService — `VITE_API_KEY_n || API_KEY_n`, n = 1 … 30). */
export const ENV_KEY_PREFIX = "API_KEY_";
export const ADGEN_ENV_KEY_LIMIT = 30;

/**
 * AI Studio opened in THIS Google account. A member signed in to several accounts in one browser would
 * otherwise make every key in the browser's default account — one project, so thirty keys sharing one
 * quota. Google's pages pick the signed-in account named by `authuser`; the dialog still asks them to
 * check the picture in the corner, since an account not signed in falls back to the default.
 */
export function aiStudioUrlFor(email?: string): string {
  return email ? `${AI_STUDIO_KEYS_URL}?authuser=${encodeURIComponent(email)}` : AI_STUDIO_KEYS_URL;
}

/** A Google API key: "AIza" and 35 more characters. */
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/;

/**
 * The key out of whatever was pasted — the key alone, `API_KEY_3="AIza…"`, a line of text around it,
 * or a key split by a line break when it was copied on a phone.
 */
export function normaliseApiKey(raw: string): string {
  const squeezed = (raw || "").replace(/\s+/g, "");
  const found = squeezed.match(GOOGLE_KEY);
  if (found) return found[0];
  // Not Google's usual shape: drop a `NAME=` in front and the quotes around it, and let Google decide.
  return squeezed.replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "").replace(/^["'`]+|["'`]+$/g, "");
}

/** Why this can't be a key, in words a member can act on — or null when it is worth asking Google. */
export function apiKeyProblem(key: string): string | null {
  if (!key) return "Paste the API key.";
  if (/^AIza[0-9A-Za-z_-]{35}$/.test(key)) return null;
  if (key.includes("@")) return "That is an email — paste the API key (it starts with AIza).";
  if (/^https?:/i.test(key)) return "That is a link — copy the key itself (it starts with AIza).";
  if (key.startsWith("AIza")) return "This key is cut short — copy the whole key (39 characters, starting with AIza).";
  if (key.length < 30) return "Too short for an API key — the key starts with AIza and is 39 characters long.";
  // Another shape Google may use one day: allowed through, and the check with Google decides.
  return /^[0-9A-Za-z_.-]+$/.test(key) ? null : "That doesn't look like an API key — copy it again from AI Studio.";
}

/**
 * A one-way fingerprint of a key (two 32-bit FNV-1a passes, 16 hex characters). The account list carries
 * this, never the key, so the same key pasted on two accounts is caught without reading any key.
 */
export function apiKeyFingerprint(key: string): string {
  const pass = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  return pass(2166136261) + pass(0x9e3779b9);
}

/** "AIzaSyA…9xQk" — enough to tell keys apart on screen. */
export function maskApiKey(key: string): string {
  return key && key.length >= 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : "••••••••";
}

/** A key's standing in plain words, with its badge colour (the owner reads status at a glance). */
export const API_KEY_STATUS: Record<ApiKeyStatus, { label: string; tone: string }> = {
  working: { label: "Working", tone: "bg-success/15 text-success" },
  failed: { label: "Not working", tone: "bg-destructive/15 text-destructive" },
  unchecked: { label: "Not checked", tone: "bg-warning/20 text-foreground" },
};

export interface KeyCheck {
  status: ApiKeyStatus;
  /** In plain words; absent when the key works. */
  message?: string;
}

/**
 * What Google's answer to a key means. The check is a models.list call — free, it spends none of the
 * key's generation quota — and, measured on 2026-10-10 against the 30 keys AdGen used, it answers 400
 * "API key not valid" for an invalid key and 403 "reported as leaked" for a blocked one, exactly as a
 * generation call does. A 429 means the key is real and only busy.
 */
export function keyCheckFrom(httpStatus: number, body: string): KeyCheck {
  if (httpStatus >= 200 && httpStatus < 300) return { status: "working" };
  if (httpStatus === 429) return { status: "working" };
  let google = "";
  try { google = JSON.parse(body)?.error?.message || ""; } catch { google = ""; }
  const text = `${google} ${body}`;
  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403) {
    if (/reported as leaked/i.test(text)) return { status: "failed", message: "Google blocked this key — it was reported as leaked. Make a new one." };
    if (/expired/i.test(text)) return { status: "failed", message: "This key has expired. Make a new one." };
    if (/API_KEY_INVALID|not valid/i.test(text)) return { status: "failed", message: "Google says this key is not valid. Copy it again from AI Studio." };
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(text)) return { status: "failed", message: "The Gemini API is turned off in this key's project. Make the key in the “aiads” project from AI Studio." };
    return { status: "failed", message: google || `Google refused this key (${httpStatus}).` };
  }
  return { status: "unchecked", message: "Google could not be reached to check this key." };
}

/** The keys one per line — what "Copy keys" puts on the clipboard. */
export function keysAsText(keys: Pick<GeminiApiKey, "key">[]): string {
  return keys.map((k) => k.key).join("\n");
}

/**
 * A .env with the keys as AdGen's variables, numbered from 1, each under a comment saying whose account
 * made it — ready to paste into Vercel (Settings → Environment Variables accepts a whole .env) or into
 * the local .env. Keys past AdGen's 30 are kept, with a line saying they are not read yet.
 */
export function keysAsEnvFile(
  keys: Pick<GeminiApiKey, "key" | "ownerName" | "accountEmail">[],
  meta: { date: string; byName?: string },
): string {
  const lines = [
    `# DTS AdGen — Gemini API keys (${keys.length})`,
    `# Downloaded ${meta.date}${meta.byName ? ` by ${meta.byName}` : ""} from DTS Manager → AI Accounts → API keys.`,
    `# AdGen reads ${ENV_KEY_PREFIX}1 … ${ENV_KEY_PREFIX}${ADGEN_ENV_KEY_LIMIT}. In Vercel: Settings → Environment Variables → paste these lines, save, then redeploy.`,
  ];
  keys.forEach((k, i) => {
    if (i === ADGEN_ENV_KEY_LIMIT) lines.push("", `# ── Keys ${ADGEN_ENV_KEY_LIMIT + 1} and after: AdGen reads only the first ${ADGEN_ENV_KEY_LIMIT} today. ──`);
    lines.push("", `# ${i + 1} · ${k.ownerName || "—"} · ${k.accountEmail}`, `${ENV_KEY_PREFIX}${i + 1}=${k.key}`);
  });
  return `${lines.join("\n")}\n`;
}

export const envFileName = (date: string) => `dts-adgen-gemini-keys-${date}.env`;

/**
 * The keys a set action (copy, .env) gives out: every key but the ones Google has refused — a dead key
 * in Vercel is a failed call in every ad — and how many were left out, so the admin is told.
 */
export function usableKeys<T extends Pick<GeminiApiKey, "status">>(keys: T[]): { keys: T[]; leftOut: number } {
  const kept = keys.filter((k) => k.status !== "failed");
  return { keys: kept, leftOut: keys.length - kept.length };
}

/** Fingerprints that appear on more than one key — the same key saved on two accounts. */
export function duplicateFingerprints(items: { fingerprint?: string }[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const { fingerprint } of items) {
    if (!fingerprint) continue;
    if (seen.has(fingerprint)) twice.add(fingerprint);
    seen.add(fingerprint);
  }
  return twice;
}

/** The account (other than this one) that already has this key, if any. */
export function accountWithKey(accounts: Pick<FlowAccount, "id" | "email" | "apiKey">[], fingerprint: string, exceptId?: string) {
  return accounts.find((a) => a.id !== exceptId && a.apiKey?.fingerprint === fingerprint) || null;
}

/**
 * A member's key progress over the accounts they opened: how many have a key, and which need one next —
 * the ones with none first (oldest first), then the ones whose key Google refused.
 */
export function apiKeyCoverage(accounts: FlowAccount[], ownerId: string) {
  const owned = accounts.filter((a) => a.ownerId === ownerId);
  const missing = owned.filter((a) => !a.apiKey).sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.email.localeCompare(b.email));
  const failed = owned.filter((a) => a.apiKey?.status === "failed");
  return {
    total: owned.length,
    /** Keys Google has not refused — a dead key counts as missing. */
    withKey: owned.length - missing.length - failed.length,
    failed: failed.length,
    /** In the order "Add next key" walks them. */
    queue: [...missing, ...failed],
  };
}

export interface KeyGroup {
  ownerId: string;
  ownerName: string;
  keys: GeminiApiKey[];
}

/** The tech admin's list: one group per person, by name; each person's keys by account email. */
export function groupKeysByOwner(keys: GeminiApiKey[]): KeyGroup[] {
  const groups = new Map<string, KeyGroup>();
  for (const k of keys) {
    const g = groups.get(k.ownerId) || { ownerId: k.ownerId, ownerName: k.ownerName || "—", keys: [] };
    g.keys.push(k);
    groups.set(k.ownerId, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, keys: [...g.keys].sort((a, b) => a.accountEmail.localeCompare(b.accountEmail)) }))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}
