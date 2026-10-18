/**
 * The push endpoint takes signed-in, active staff only (2026-10-18). Until then `/api/send-notification` pushed to any
 * userId it was given — anybody on the internet could ring a staff member's phone with any words or fake a call
 * (CLAUDE.md §26.1). The handler runs here on a fake firebase-admin; the app's `sendNotification` is checked to send the
 * member's ID token, and to send no push when nobody is signed in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const tokens = new Map<string, string>(); // ID token → uid
  const sent: { tokens: string[]; data: Record<string, string> }[] = [];
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
    }),
    firestore: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => ({ exists: name === "users" && users.has(id), data: () => users.get(id) }),
          delete: async () => undefined,
        }),
        where: (_f: string, _op: string, uid: string) => ({
          get: async () => {
            const docs = name === "fcmTokens" && uid === "u_target" ? [{ id: "tok1", data: () => ({ token: "tok1", userId: uid }) }] : [];
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
      batch: () => ({ delete: () => undefined, commit: async () => undefined }),
    }),
    messaging: () => ({
      sendEachForMulticast: async (m: { tokens: string[]; data: Record<string, string> }) => {
        sent.push({ tokens: m.tokens, data: m.data });
        return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) };
      },
    }),
  };
  return { users, tokens, sent, admin };
});

vi.mock("firebase-admin", () => ({ default: h.admin }));

// The app side: the in-memory Firestore and a signed-in member whose token the push must carry.
const session = vi.hoisted(() => ({ user: null as null | { getIdToken: () => Promise<string> } }));
vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, get auth() { return { currentUser: session.user }; } }));

import handler from "../../api/send-notification";
import { sendNotification } from "@/services/notifications";

function call(headers: Record<string, string>, body: Record<string, unknown> = { userId: "u_target", title: "Hello", message: "Test" }) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: () => res,
    status(c: number) { res.statusCode = c; return res; },
    json(b: unknown) { res.body = b; return res; },
    end() { return res; },
  };
  return (handler as unknown as (req: unknown, r: typeof res) => Promise<unknown>)({ method: "POST", headers, body }, res).then(() => res);
}

beforeEach(() => {
  h.users.clear();
  h.tokens.clear();
  h.sent.length = 0;
  h.users.set("u_staff", { role: "tech_member", isActive: true });
  h.users.set("u_left", { role: "sales_member", isActive: false });
  h.users.set("u_target", { role: "sales_member", isActive: true });
  h.tokens.set("good", "u_staff");
  h.tokens.set("left", "u_left");
  h.tokens.set("guest", "guest_o_123");
});

describe("api/send-notification — who may push", () => {
  it("refuses a request with no token — the open door that let anybody push to anybody", async () => {
    const r = await call({});
    expect(r.statusCode).toBe(401);
    expect(h.sent).toHaveLength(0);
  });

  it("refuses a token Firebase does not accept", async () => {
    expect((await call({ authorization: "Bearer forged" })).statusCode).toBe(401);
    expect(h.sent).toHaveLength(0);
  });

  it("refuses a client-chat guest (no staff record) and a switched-off account", async () => {
    expect((await call({ authorization: "Bearer guest" })).statusCode).toBe(403);
    expect((await call({ authorization: "Bearer left" })).statusCode).toBe(403);
    expect(h.sent).toHaveLength(0);
  });

  it("pushes for an active staff member, as before", async () => {
    const r = await call({ authorization: "Bearer good" });
    expect(r.statusCode).toBe(200);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].tokens).toEqual(["tok1"]);
    expect(h.sent[0].data.title).toBe("Hello");
  });

  it("answers the preflight and allows the Authorization header", async () => {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 0,
      setHeader: (k: string, v: string) => { headers[k] = v; return res; },
      status(c: number) { res.statusCode = c; return res; },
      end() { return res; },
      json() { return res; },
    };
    await (handler as unknown as (req: unknown, r: typeof res) => Promise<unknown>)({ method: "OPTIONS", headers: { origin: "https://localhost" } }, res);
    expect(res.statusCode).toBe(204);
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/Authorization/);
  });
});

describe("services/notifications.sendNotification — the app sends its member's token", () => {
  it("calls the push API with the signed-in member's ID token", async () => {
    session.user = { getIdToken: async () => "member-token" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendNotification({ userId: "u_target", type: "work_assigned", title: "New work", message: "W-101" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/send-notification$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer member-token");
    fetchSpy.mockRestore();
  });

  it("writes the bell row but sends no push when nobody is signed in", async () => {
    session.user = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendNotification({ userId: "u_target", type: "work_assigned", title: "New work", message: "W-102" });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
