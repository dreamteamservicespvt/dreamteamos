import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));

import * as mem from "./memoryFirestore";
import { adminStore, type AdminDb, type Doc } from "@/devos/engine/store";
import { deriveSecrets, open } from "@/devos/core/crypto";
import { fakeAi } from "@/devos/engine/fakeAi";
import { PATH, type Actor, type Deps, type Notice } from "@/devos/engine/context";
import { dispatch } from "@/devos/engine/router";
import { runTick } from "@/devos/engine/tick";
import type { AttemptResponse, DevProfile, DevTask, Exposure, ItemKey, PublicItem, QuestionDoc } from "@/devos/core/types";

/**
 * The server's storage adapter (`adminStore`, firebase-admin) — the one `api/devos.ts` runs in production — driven
 * through the real router over a fake shaped like the Admin SDK (a snapshot's `exists` is a PROPERTY, `doc(path)` and
 * `collection(path)` live on the db, queries chain) and as STRICT as real Firestore about what it stores: no
 * `undefined`, no array directly inside an array, only plain objects, document paths with an even number of segments,
 * documents under 1 MiB. Every other test uses the client adapter; without this one the production adapter never ran.
 */

const problems: string[] = [];

function assertStorable(path: string, data: unknown): void {
  if (path.split("/").length % 2 !== 0) problems.push(`${path}: not a document path`);
  const walk = (v: unknown, where: string, inArray: boolean): void => {
    if (v === undefined) { problems.push(`${path}: undefined at ${where || "(root)"}`); return; }
    if (Array.isArray(v)) {
      if (inArray) problems.push(`${path}: an array inside an array at ${where}`);
      v.forEach((x, i) => walk(x, `${where}[${i}]`, true));
      return;
    }
    if (v && typeof v === "object") {
      if (Object.getPrototypeOf(v) !== Object.prototype) problems.push(`${path}: a ${v.constructor?.name ?? "non-plain"} object at ${where}`);
      for (const [k, x] of Object.entries(v)) {
        if (!k || /^__.*__$/.test(k)) problems.push(`${path}: field name "${k}" at ${where}`);
        walk(x, where ? `${where}.${k}` : k, false);
      }
    }
  };
  walk(data, "", false);
  const size = new TextEncoder().encode(JSON.stringify(data)).length;
  if (size > 1_000_000) problems.push(`${path}: ${size} bytes`);
}

type Snap = { exists: boolean; data(): Doc | undefined };
interface FakeRef { path: string; get(): Promise<Snap>; set(d: Doc, o?: { merge?: boolean }): Promise<void>; delete(): Promise<void> }

function strictAdminDb(): AdminDb {
  const ref = (path: string): FakeRef => {
    if (path.split("/").length % 2 !== 0) throw new Error(`Value for argument "documentPath" must point to a document, but was "${path}".`);
    const r = mem.doc({}, path);
    return {
      path,
      async get() { const s = await mem.getDoc(r); return { exists: s.exists(), data: () => s.data() as Doc | undefined }; },
      async set(d, o) { assertStorable(path, d); await mem.setDoc(r, d, o); },
      async delete() { await mem.deleteDoc(r); },
    };
  };
  type Q = { where(f: string, op: string, v: unknown): Q; orderBy(f: string, d: "asc" | "desc"): Q; limit(n: number): Q; get(): Promise<{ docs: { id: string; ref: { path: string }; data(): Doc }[] }> };
  const query = (path: string, cs: unknown[], filtered: string[], ordered: string | null): Q => ({
    where: (f, op, v) => query(path, [...cs, mem.where(f, op, v)], [...filtered, f], ordered),
    orderBy: (f, d) => {
      // Real Firestore needs a composite index for a filter on one field ordered by another — none is deployed.
      if (filtered.some((x) => x !== f)) problems.push(`${path}: where(${filtered.join(",")}) + orderBy(${f}) needs a composite index`);
      return query(path, [...cs, mem.orderBy(f, d)], filtered, f);
    },
    limit: (n) => query(path, [...cs, mem.limit(n)], filtered, ordered),
    async get() {
      if (path.split("/").length % 2 !== 1) throw new Error(`"${path}" is not a collection`);
      const s = await mem.getDocs(mem.query(mem.collection({}, path), ...(cs as never[])));
      return { docs: s.docs.map((d) => ({ id: d.id, ref: { path: d.ref.path }, data: () => d.data() as Doc })) };
    },
  });
  return {
    doc: (path) => ref(path),
    collection: (path) => query(path, [], [], null),
    runTransaction: (fn) => mem.runTransaction({}, async (raw) => {
      const t = raw as { get(r: unknown): Promise<{ exists(): boolean; data(): unknown }>; set(r: unknown, d: unknown, o?: unknown): unknown; delete(r: unknown): unknown };
      return fn({
        async get(r) { const s = await t.get(mem.doc({}, (r as FakeRef).path)); return { exists: s.exists(), data: () => s.data() as Doc | undefined }; },
        set(r, d, o) { assertStorable((r as FakeRef).path, d); return t.set(mem.doc({}, (r as FakeRef).path), d, o); },
        delete(r) { return t.delete(mem.doc({}, (r as FakeRef).path)); },
      } as never);
    }) as never,
    batch() {
      const b = mem.writeBatch({});
      return {
        set: (r: unknown, d: Doc, o?: { merge?: boolean }) => { assertStorable((r as FakeRef).path, d); return b.set(mem.doc({}, (r as FakeRef).path), d, o); },
        delete: (r: unknown) => b.delete(mem.doc({}, (r as FakeRef).path)),
        commit: () => b.commit(),
      };
    },
  } as AdminDb;
}

let clock = Date.UTC(2026, 9, 20, 1, 30); // Tue 20 Oct 2026, 07:00 IST
const notices: Notice[] = [];
async function makeDeps(): Promise<Deps> {
  return {
    store: adminStore(strictAdminDb()), ai: fakeAi(), secrets: await deriveSecrets("unit-test-secret-material-0123456789"), now: () => clock,
    notify: { send: async (n) => { if (notices.some((x) => x.key === n.key)) return false; notices.push(n); return true; } },
    log: () => undefined,
  };
}

const ravi: Actor = { uid: "u_ravi", name: "Ravi Kumar", role: "sales_member", team: "sa1", isActive: true };
const boss: Actor = { uid: "u_boss", name: "Owner", role: "main_admin", team: "", isActive: true };

interface Play { item: PublicItem | null; slotIndex: number }

async function rightAnswer(deps: Deps, uid: string, item: PublicItem): Promise<AttemptResponse> {
  const q = mem.__read(PATH.question(item.qid)) as unknown as QuestionDoc;
  const key = (await open<ItemKey>(deps.secrets, q.key))!;
  const ex = mem.__read(PATH.exposure(uid, item.qid)) as unknown as Exposure;
  if (item.type === "mcq" || item.type === "multi") return { kind: "choice", selected: key.correct!.map((o) => ex.optionOrder!.indexOf(o)) };
  if (item.type === "numeric") return { kind: "number", value: key.value! };
  if (item.type === "order") return { kind: "order", order: key.order!.map((o) => ex.optionOrder!.indexOf(o)) };
  return { kind: "text", text: key.exemplar ?? "I would acknowledge the concern, explain the reason clearly, and give a specific next step with a time." };
}

async function playAll(deps: Deps, actor: Actor, taskId: string, hintFirst = false) {
  let play = (await dispatch(deps, actor, "start", { taskId })) as Play;
  let n = 0;
  while (play.item && n++ < 20) {
    if (hintFirst && n === 1) await dispatch(deps, actor, "hint", { taskId, slotIndex: play.slotIndex });
    await dispatch(deps, actor, "answer", { taskId, slotIndex: play.slotIndex, response: await rightAnswer(deps, actor.uid, play.item) });
    play = (await dispatch(deps, actor, "next", { taskId })) as Play;
  }
  return n;
}

beforeEach(() => {
  mem.__reset();
  notices.length = 0;
  problems.length = 0;
  clock = Date.UTC(2026, 9, 20, 1, 30);
  mem.__seed("users/u_ravi", { uid: "u_ravi", name: "Ravi Kumar", role: "sales_member", createdBy: "sa1", isActive: true });
  mem.__seed("users/u_boss", { uid: "u_boss", name: "Owner", role: "main_admin", createdBy: "", isActive: true });
});

describe("the production storage adapter (firebase-admin), through the server's router", () => {
  it("runs a learner's whole journey and the Control Center with nothing Firestore would refuse", async () => {
    const deps = await makeDeps();
    await dispatch(deps, ravi, "bootstrap", {});
    await dispatch(deps, ravi, "onboard", { consent: true, answers: { coding: ["no"] }, track: "sales" });
    expect(await playAll(deps, ravi, "baseline")).toBe(10); // an assessment: no hints
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(p.onboarding.baseline).toBe("complete");

    // The tick (the cron's door) on the store the server uses: quests, the weekly challenge, boards, snapshot, report.
    const tick = await runTick(await makeDeps(), { reason: "cron" });
    expect(tick.errors).toBe(0);
    const quest = mem.__read(PATH.task("u_ravi", "quest_2026-10-20")) as unknown as DevTask;
    expect(quest?.kind).toBe("quest");
    expect(await playAll(deps, ravi, quest.id, true)).toBe(quest.blueprint?.length ?? 3);

    // A practical, the league, practice, privacy, the boards, a coach question and an appeal.
    const ch = mem.__read(PATH.task("u_ravi", "challenge_2026-10-19")) as unknown as DevTask;
    const fields: Record<string, unknown> = {};
    for (const e of ch.evidence!) {
      if (e.kind === "text") fields[e.id] = "Plan: call Krishna Real Estate on Monday at 11 AM with two samples, then Sai Dental on Tuesday, ordered by value; results reported Saturday with numbers.";
      if (e.kind === "number") fields[e.id] = 5;
      if (e.kind === "checklist") fields[e.id] = (e.items ?? []).map(() => true);
      if (e.kind === "link") fields[e.id] = "https://drive.google.com/file/d/abc";
    }
    const graded = (await dispatch(deps, ravi, "submit", { taskId: ch.id, fields })) as DevTask;
    expect(["passed", "failed"]).toContain(graded.state);
    expect(graded.submissionPending).toBe(false);
    const league = (await dispatch(deps, ravi, "league.join", {})) as { taskId: string };
    await playAll(deps, ravi, league.taskId);
    const practice = (await dispatch(deps, ravi, "practice", { dim: "communication" })) as { taskId: string };
    await playAll(deps, ravi, practice.taskId);
    await dispatch(deps, ravi, "privacy", { hidden: true });
    await dispatch(deps, ravi, "boards", {});
    const attemptId = "baseline_0";
    const c = (await dispatch(deps, ravi, "coach", { attemptId, ask: "Why is that the right order?" })) as { reply: string };
    expect(c.reply.length).toBeGreaterThan(10);
    await dispatch(deps, ravi, "appeal", { attemptId, reason: "I think my answer was also defensible." });

    // The Control Center, read and write, as the server runs it.
    for (const action of ["admin.overview", "admin.staff", "admin.questions", "admin.audit", "admin.exceptions", "admin.reports", "admin.report"]) {
      await dispatch(deps, boss, action, { fresh: true });
    }
    await dispatch(deps, boss, "admin.person", { uid: "u_ravi" });
    await dispatch(deps, boss, "admin.track", { uid: "u_ravi", track: "admin", reason: "moved to the office team" });
    await dispatch(deps, boss, "admin.enrol", { uid: "u_boss", enrolled: true, reason: "the owner joins" });
    await dispatch(deps, boss, "admin.policy", { policy: { cadence: { questItems: 4 } }, reason: "four a day" });
    expect((mem.__read(PATH.policy) as { version: string }).version).toBe("v1");
    await dispatch(deps, boss, "admin.void", { uid: "u_ravi", attemptId: "baseline_1", reason: "a test void" });
    await dispatch(deps, boss, "admin.regrade", { uid: "u_ravi", attemptId: "baseline_2" }).catch(() => undefined); // objective: nothing to regrade
    const integrity = (await dispatch(deps, boss, "admin.integrity", { uid: "u_ravi", repair: false })) as { xpTampered: number };
    expect(integrity.xpTampered).toBe(0);
    await dispatch(deps, boss, "admin.export", { uid: "u_ravi" });
    await dispatch(deps, boss, "admin.generate", { target: { track: "sales", dim: "logical", difficulty: 3, kind: "objective" } });
    await dispatch(deps, boss, "admin.tick", {});

    expect(problems).toEqual([]);
  }, 30_000); // a whole journey (~5 s alone) — the 5 s default timed out under a busy machine, never on a failure

  it("the strict fake really refuses what Firestore refuses (so the clean run above means something)", async () => {
    const db = strictAdminDb();
    await (db.doc("devos_x/a") as FakeRef).set({ grid: [[1, 2], [3]] });
    await (db.doc("devos_x/b") as FakeRef).set({ when: new Date(0) as unknown as number });
    expect(() => db.doc("devos_x")).toThrow(/document/);
    expect(problems.some((p) => p.includes("an array inside an array"))).toBe(true);
    expect(problems.some((p) => p.includes("a Date object"))).toBe(true);
    await adminStore(db).query("devos_users", [["status", "==", "active"]], { orderBy: ["createdAt", "desc"] });
    expect(problems.some((p) => p.includes("composite index"))).toBe(true);
  });
});
