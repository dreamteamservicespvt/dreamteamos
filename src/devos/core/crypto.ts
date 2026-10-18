/**
 * Sealing answer keys and signing ledgers (2026-10-18).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The Firestore rules that would keep `devos_questions` and the ledgers away from browsers are written in
 * `docs/firestore-rules.md`, but their publication is NOT confirmed (backend-security.md §14) — any signed-in account
 * may be able to read or write any collection. So:
 *   • an answer key is stored AES-256-GCM encrypted (`seal` / `open`): reading the bank gives a learner nothing;
 *   • XP transactions, attempts, rank events, corrections, audit events and the profile carry an HMAC-SHA-256 `sig`
 *     over their important fields (`sign` / `verify`): a record edited by hand is detectable, and the server rebuilds a
 *     profile whose signature fails from its ledgers.
 * The secret never leaves the server: `deriveSecrets` hashes the service account's private key (present on Vercel as
 * `FIREBASE_SERVICE_ACCOUNT_KEY`), so no new environment variable is needed. `kid` names which key sealed a box; a
 * rotated service account makes old boxes unreadable (those items are retired and regenerated), not wrong.
 *
 * WebCrypto only (`globalThis.crypto.subtle`), so the same code runs on Node 18+ and in the browser harness.
 */
import type { SealedBox } from "./types.js";

export interface DevSecrets {
  kid: string;
  aesKey: CryptoKey;
  hmacKey: CryptoKey;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is not available");
  return s;
}

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromB64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const toHex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text: string): Promise<ArrayBuffer> {
  return subtle().digest("SHA-256", enc.encode(text));
}

/** Derive the sealing and signing keys from a secret only the server holds. */
export async function deriveSecrets(material: string): Promise<DevSecrets> {
  if (!material || material.length < 16) throw new Error("devos: secret material missing");
  const aesRaw = await sha256(`devos-aes-v1:${material}`);
  const macRaw = await sha256(`devos-hmac-v1:${material}`);
  const kid = toHex(await sha256(`devos-kid-v1:${material}`)).slice(0, 8);
  const aesKey = await subtle().importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const hmacKey = await subtle().importKey("raw", macRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return { kid, aesKey, hmacKey };
}

export type { SealedBox };

export async function seal(secrets: DevSecrets, value: unknown): Promise<SealedBox> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, secrets.aesKey, enc.encode(JSON.stringify(value)));
  return { kid: secrets.kid, iv: toB64(iv), ct: toB64(ct) };
}

/** The sealed value, or null when the box is from another key or was tampered with. */
export async function open<T>(secrets: DevSecrets, box: SealedBox | null | undefined): Promise<T | null> {
  if (!box || box.kid !== secrets.kid) return null;
  try {
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, secrets.aesKey, fromB64(box.ct));
    return JSON.parse(dec.decode(plain)) as T;
  } catch {
    return null;
  }
}

/** Canonical JSON: object keys sorted at every level, undefined dropped — the same bytes on server and browser. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

/** `kid.hex` HMAC over the canonical form of `fields`. */
export async function sign(secrets: DevSecrets, fields: unknown): Promise<string> {
  const mac = await subtle().sign("HMAC", secrets.hmacKey, enc.encode(canonical(fields)));
  return `${secrets.kid}.${toHex(mac).slice(0, 40)}`;
}

/** "ok" — signed by this key and unchanged; "tampered" — signed by this key, changed since; "unknown" — no sig or another key. */
export async function verify(secrets: DevSecrets, fields: unknown, sig: string | undefined): Promise<"ok" | "tampered" | "unknown"> {
  if (!sig) return "unknown";
  const [kid] = sig.split(".");
  if (kid !== secrets.kid) return "unknown";
  return (await sign(secrets, fields)) === sig ? "ok" : "tampered";
}
