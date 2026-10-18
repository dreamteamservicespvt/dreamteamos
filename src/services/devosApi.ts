/**
 * The browser's door to the Development OS server (`api/devos.ts`).
 *
 * Every Dev OS change goes through here — never a direct Firestore write — because scores, XP, ranks and answer keys
 * are the server's (see the header of `api/devos.ts`). The person is identified by their Firebase ID token.
 *
 * Where the server is: the same origin on the web; the production URL in the Android app and during `vite dev` (which
 * does not serve `/api`). With `VITE_DEVOS_LOCAL=1` in a DEV build the engine runs in this browser against Firestore
 * instead (for working offline from the deployment); production never does.
 */
import { auth } from "@/services/firebase";
import { isNative } from "@/utils/platform";

const PROD = "https://dreamteamos.vercel.app";

export class DevOsError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "DevOsError";
  }
}

const LOCAL = import.meta.env.DEV && import.meta.env.VITE_DEVOS_LOCAL === "1";

function base(): string {
  if (isNative()) return PROD;
  if (import.meta.env.DEV) return PROD;
  return "";
}

let localDispatch: ((action: string, body: Record<string, unknown>) => Promise<unknown>) | null = null;

export async function callDevOs<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (LOCAL) {
    if (!localDispatch) localDispatch = (await import("./devosLocal")).makeLocalDispatch();
    return (await localDispatch(action, body)) as T;
  }
  const user = auth.currentUser;
  if (!user) throw new DevOsError(401, "signin", "Please sign in again.");
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(`${base()}/api/devos`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, action }),
    });
  } catch {
    throw new DevOsError(0, "offline", "You seem to be offline — your progress is safe. Try again when you are connected.");
  }
  let json: { ok?: boolean; result?: T; error?: string; code?: string } = {};
  try {
    json = await res.json();
  } catch {
    // a non-JSON answer (a gateway page) — handled below
  }
  if (!res.ok || !json.ok) {
    throw new DevOsError(res.status, json.code ?? "server", json.error ?? (res.status === 504 ? "The server took too long — your answer is saved; check back in a minute." : "Something went wrong — please try again."));
  }
  return json.result as T;
}
