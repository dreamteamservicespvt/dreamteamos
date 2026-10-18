/**
 * Staff logins are created on the server (2026-10-18) so Firebase's public sign-up can be switched off — with it on,
 * anybody could register an account the Firestore rules treat as staff (rules audit G1). `api/staff-account` runs here
 * on a fake firebase-admin: who may create whom, the error codes the screens read, and refusals.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const tokens = new Map<string, string>();
  const created: { email: string; password: string }[] = [];
  const taken = new Set<string>();
  const admin = {
    apps: [{}],
    initializeApp: () => undefined,
    credential: { cert: () => ({}) },
    auth: () => ({
      verifyIdToken: async (t: string) => {
        const uid = tokens.get(t);
        if (!uid) throw new Error("bad token");
        return { uid };
      },
      createUser: async (u: { email: string; password: string }) => {
        if (taken.has(u.email)) throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
        created.push(u);
        taken.add(u.email);
        return { uid: `new_${created.length}` };
      },
    }),
    firestore: () => ({
      collection: () => ({ doc: (id: string) => ({ get: async () => ({ exists: users.has(id), data: () => users.get(id) }) }) }),
    }),
  };
  return { users, tokens, created, taken, admin };
});

vi.mock("firebase-admin", () => ({ default: h.admin }));

import handler from "../../api/staff-account";

async function call(token: string | null, body: Record<string, unknown>) {
  const res = {
    statusCode: 200,
    body: undefined as unknown as { uid?: string; code?: string; error?: string },
    setHeader: () => res,
    status(c: number) { res.statusCode = c; return res; },
    json(b: typeof res.body) { res.body = b; return res; },
    end() { return res; },
  };
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  await (handler as unknown as (req: unknown, r: typeof res) => Promise<unknown>)({ method: "POST", headers, body }, res);
  return res;
}

beforeEach(() => {
  h.users.clear(); h.tokens.clear(); h.created.length = 0; h.taken.clear();
  for (const [uid, role] of [["owner", "main_admin"], ["ta", "tech_admin"], ["sa", "sales_admin"], ["tm", "tech_member"], ["acc", "accounts_admin"]] as const) {
    h.users.set(uid, { role, isActive: true });
    h.tokens.set(`t_${uid}`, uid);
  }
  h.users.set("gone", { role: "tech_admin", isActive: false });
  h.tokens.set("t_gone", "gone");
});

describe("api/staff-account — who may create whom (as the screens)", () => {
  it.each([
    ["owner", "tech_admin"], ["owner", "sales_admin"], ["owner", "accounts_admin"],
    ["ta", "tech_member"], ["ta", "tech_team_leader"], ["sa", "sales_member"],
  ])("%s may create a %s", async (who, role) => {
    const r = await call(`t_${who}`, { email: `${role}@x.in`, password: "secret12", role });
    expect(r.statusCode).toBe(200);
    expect(r.body.uid).toMatch(/^new_/);
  });

  it.each([
    ["ta", "sales_member"], ["ta", "tech_admin"], ["sa", "tech_member"], ["tm", "tech_member"], ["acc", "sales_member"],
    ["owner", "main_admin"],
  ])("%s may NOT create a %s", async (who, role) => {
    const r = await call(`t_${who}`, { email: "a@x.in", password: "secret12", role });
    expect(r.statusCode).toBe(403);
    expect(h.created).toHaveLength(0);
  });

  it("refuses no token, a bad token and a switched-off admin", async () => {
    expect((await call(null, { email: "a@x.in", password: "secret12", role: "tech_member" })).statusCode).toBe(401);
    expect((await call("forged", { email: "a@x.in", password: "secret12", role: "tech_member" })).statusCode).toBe(401);
    expect((await call("t_gone", { email: "a@x.in", password: "secret12", role: "tech_member" })).statusCode).toBe(403);
    expect(h.created).toHaveLength(0);
  });

  it("answers the client error codes the screens read", async () => {
    h.taken.add("dup@x.in");
    const dup = await call("t_ta", { email: "dup@x.in", password: "secret12", role: "tech_member" });
    expect(dup.statusCode).toBe(409);
    expect(dup.body.code).toBe("auth/email-already-in-use");
    const weak = await call("t_ta", { email: "w@x.in", password: "123", role: "tech_member" });
    expect(weak.body.code).toBe("auth/weak-password");
    const bad = await call("t_ta", { email: "not-an-email", password: "secret12", role: "tech_member" });
    expect(bad.body.code).toBe("auth/invalid-email");
  });
});
