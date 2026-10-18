/**
 * The Development OS engine running in THIS browser — DEV only (`VITE_DEVOS_LOCAL=1`) and the browser test harness.
 * It is the same router the server runs (`devos/engine/router.dispatch`), over the client SDK. Production never loads
 * this file: `services/devosApi` imports it only behind `import.meta.env.DEV`.
 *
 * Its secrets are a fixed DEV value (items sealed here cannot be read by the server and vice versa — DEV data only),
 * its AI is Gemini with the build's keys, or the deterministic fake when `window.__DEVOS_FAKE_AI` is set (harness).
 */
import * as firestore from "firebase/firestore";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { deriveSecrets } from "@/devos/core/crypto";
import { clientStore, type ClientSdk } from "@/devos/engine/store";
import { DevError, type Actor, type Deps } from "@/devos/engine/context";
import { dispatch } from "@/devos/engine/router";
import { geminiPort } from "@/devos/engine/geminiPort";
import { fakeAi } from "@/devos/engine/fakeAi";
import { DevOsError } from "@/services/devosApi";

declare global {
  interface Window { __DEVOS_FAKE_AI?: boolean | Record<string, boolean>; __DEVOS_NOW?: number }
}

function envKeys(): string[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const keys: string[] = [];
  for (let i = 1; i <= 40; i++) for (const p of ["API_KEY_", "VITE_API_KEY_"]) if (env[`${p}${i}`]) keys.push(env[`${p}${i}`]!);
  return keys;
}

export function makeLocalDispatch() {
  const store = clientStore(firestore as unknown as ClientSdk, db);
  const secretsP = deriveSecrets("dts-devos-dev-only-secret-material-not-for-production");
  return async (action: string, body: Record<string, unknown>) => {
    const u = useAuthStore.getState().user;
    if (!u) throw new DevOsError(401, "signin", "Please sign in again.");
    const actor: Actor = { uid: u.uid, name: u.name, role: u.role, team: u.createdBy ?? "", isActive: u.isActive !== false, externalCreator: !!u.externalCreator };
    const fake = typeof window !== "undefined" ? window.__DEVOS_FAKE_AI : undefined;
    const deps: Deps = {
      store,
      ai: fake ? fakeAi(typeof fake === "object" ? fake : {}) : geminiPort({ keys: envKeys(), maxCalls: 10 }),
      secrets: await secretsP,
      now: () => (typeof window !== "undefined" && window.__DEVOS_NOW) || Date.now(),
      notify: {
        async send(n) {
          const id = n.key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 1400);
          const existing = await getDoc(doc(db, "notifications", id)).catch(() => null);
          if (existing?.exists()) return false;
          await setDoc(doc(db, "notifications", id), { userId: n.uid, type: n.type, title: n.title, message: n.message, link: n.link, read: false, createdAt: serverTimestamp(), meta: { source: "devos", key: n.key } });
          return true;
        },
      },
      log: (level, msg, data) => (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(`[devos] ${msg}`, data ?? ""),
    };
    try {
      return await dispatch(deps, actor, action, body);
    } catch (e) {
      if (e instanceof DevError) throw new DevOsError(e.status, e.code, e.message);
      throw e;
    }
  };
}
