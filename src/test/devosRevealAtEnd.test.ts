/**
 * 2026-10-19 — the owner's Development OS fixes, on the in-memory Firestore with the fake AI:
 *  - a written answer sent with `defer` is saved and queued at once (no judges in that request), then graded by the
 *    learner's own `grade` request — the baseline completes from it (it stayed "Being graded" for hours before);
 *  - `grade` takes only the caller's own answers and one claim a minute;
 *  - `profile.update`: the person edits their work answers and track (effective-dated, audited), validated.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.setConfig({ testTimeout: 30_000 });

import * as sdk from "firebase/firestore";
import * as mem from "./memoryFirestore";
import { clientStore, type ClientSdk } from "@/devos/engine/store";
import { deriveSecrets, open } from "@/devos/core/crypto";
import { fakeAi } from "@/devos/engine/fakeAi";
import type { Actor, Deps } from "@/devos/engine/context";
import { PATH } from "@/devos/engine/context";
import { answer, nextItem, onboard, startTask } from "@/devos/engine/learner";
import { dispatch } from "@/devos/engine/router";
import { QUEUE_PATH } from "@/devos/engine/queue";
import type { AttemptResponse, DevAttempt, DevProfile, DevTask, Exposure, ItemKey, PublicItem, QuestionDoc } from "@/devos/core/types";

const store = clientStore(sdk as unknown as ClientSdk, {});
let clock = Date.UTC(2026, 9, 20, 5, 0); // Tue 20 Oct 2026, 10:30 IST

async function makeDeps(ai: Deps["ai"] = fakeAi()): Promise<Deps> {
  return {
    store, ai, secrets: await deriveSecrets("unit-test-secret-material-0123456789"), now: () => clock,
    notify: { send: async () => true }, log: () => undefined,
  };
}

const ravi: Actor = { uid: "u_ravi", name: "Ravi Kumar", role: "sales_member", team: "sa1", isActive: true };
const teja: Actor = { uid: "u_teja", name: "Teja Rao", role: "tech_member", team: "ta1", isActive: true };

async function rightAnswer(deps: Deps, uid: string, item: PublicItem): Promise<AttemptResponse> {
  const q = mem.__read(PATH.question(item.qid)) as unknown as QuestionDoc;
  const key = (await open<ItemKey>(deps.secrets, q.key))!;
  const ex = mem.__read(PATH.exposure(uid, item.qid)) as unknown as Exposure;
  if (item.type === "mcq" || item.type === "multi") return { kind: "choice", selected: key.correct!.map((o) => ex.optionOrder!.indexOf(o)) };
  if (item.type === "numeric") return { kind: "number", value: key.value! };
  if (item.type === "order") return { kind: "order", order: key.order!.map((o) => ex.optionOrder!.indexOf(o)) };
  return { kind: "text", text: key.exemplar ?? "I would acknowledge the concern, explain the reason clearly, and give a specific next step with a time." };
}

const queued = (uid: string) => (((mem.__read(QUEUE_PATH)?.items as { uid: string; id: string }[]) ?? []).filter((x) => x.uid === uid).map((x) => x.id));

beforeEach(() => {
  mem.__reset();
  clock = Date.UTC(2026, 9, 20, 5, 0);
  mem.__seed("users/u_ravi", { uid: "u_ravi", name: "Ravi Kumar", role: "sales_member", createdBy: "sa1", isActive: true });
  mem.__seed("users/u_teja", { uid: "u_teja", name: "Teja Rao", role: "tech_member", createdBy: "ta1", isActive: true });
});

describe("a written answer is saved at once and graded by the learner's own request", () => {
  it("defers grading, then `grade` grades it and the baseline completes", async () => {
    const judge = vi.fn();
    const base = fakeAi();
    const deps = await makeDeps({ ...base, judge: async (req) => { judge(); return base.judge(req); } });
    await onboard(deps, ravi, { consent: true, answers: { work: ["calls"] }, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    const openIds: string[] = [];
    while (play.item) {
      const r = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item), defer: true });
      if (play.item.type === "open") {
        // Saved, queued, NOT judged in this request, and nothing revealed yet.
        expect(r.attempt.outcome).toBe("pending_validation");
        expect(r.attempt.reveal).toBeUndefined();
        openIds.push(r.attempt.id);
      }
      play = await nextItem(deps, ravi, "baseline");
    }
    expect(openIds.length).toBeGreaterThan(0);
    expect(judge).not.toHaveBeenCalled();
    expect(queued("u_ravi").sort()).toEqual([...openIds].sort());
    // Every answer is in but a written one waits: the baseline task is "completed", the profile still in progress.
    expect((mem.__read(PATH.task("u_ravi", "baseline")) as unknown as DevTask).state).toBe("completed");
    expect((mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).onboarding.baseline).toBe("in_progress");

    for (const id of openIds) {
      const r = (await dispatch(deps, ravi, "grade", { attemptId: id })) as { graded: number };
      expect(r.graded).toBe(1);
      const a = mem.__read(PATH.attempt("u_ravi", id)) as unknown as DevAttempt;
      expect(["passed", "failed"]).toContain(a.outcome);
      expect(a.appliedAt).toBeTruthy();
    }
    expect(judge).toHaveBeenCalled();
    expect(queued("u_ravi")).toEqual([]);
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(p.onboarding.baseline).toBe("complete");
    expect(p.stats.pending).toBe(0);
    expect(Object.values(p.dims).filter((d) => d.score !== null).length).toBe(10);
  });

  it("grades only the caller's own answers, once a minute per answer, and picks the oldest queued one without an id", async () => {
    const deps = await makeDeps({ ...fakeAi(), judge: async () => ({ value: null, model: "", calls: [], error: "down" }) });
    await onboard(deps, ravi, { consent: true, answers: { work: ["calls"] }, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    let openId = "";
    while (play.item && !openId) {
      const r = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item), defer: true });
      if (play.item.type === "open") openId = r.attempt.id;
      else play = await nextItem(deps, ravi, "baseline");
    }
    expect(openId).toBeTruthy();
    await onboard(deps, teja, { consent: true, answers: { work: ["ads"] }, track: "technical" });
    // Someone else asking for Ravi's answer reaches only their own (empty) record.
    expect(await dispatch(deps, teja, "grade", { attemptId: openId })).toMatchObject({ graded: 0, waiting: 0 });
    expect((mem.__read(PATH.attempt("u_ravi", openId)) as unknown as DevAttempt).gradeTries).toBeUndefined();
    // The AI is down: the try is counted, the answer stays waiting and queued.
    expect(await dispatch(deps, ravi, "grade", {})).toMatchObject({ graded: 0, waiting: 1 });
    expect((mem.__read(PATH.attempt("u_ravi", openId)) as unknown as DevAttempt).gradeTries).toBe(1);
    // Asked again within the minute: not taken again (no stacked AI calls, no burnt tries).
    clock += 20_000;
    await dispatch(deps, ravi, "grade", { attemptId: openId });
    expect((mem.__read(PATH.attempt("u_ravi", openId)) as unknown as DevAttempt).gradeTries).toBe(1);
    clock += 61_000;
    await dispatch(deps, ravi, "grade", { attemptId: openId });
    expect((mem.__read(PATH.attempt("u_ravi", openId)) as unknown as DevAttempt).gradeTries).toBe(2);
  });

  it("an answer sent without `defer` is still graded in its own request (unchanged)", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: { work: ["calls"] }, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    while (play.item) {
      const r = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item) });
      if (play.item.type === "open") expect(["passed", "failed"]).toContain(r.attempt.outcome);
      play = await nextItem(deps, ravi, "baseline");
    }
    expect((mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).onboarding.baseline).toBe("complete");
  });
});

describe("a practical is saved at once and graded by the learner's own request", () => {
  it("submit with defer queues it ungraded; grade {taskId} grades and applies it", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: { work: ["calls"] }, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    while (play.item) {
      await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item) });
      play = await nextItem(deps, ravi, "baseline");
    }
    await dispatch(deps, ravi, "today", {});
    const ch = mem.__read(PATH.task("u_ravi", "challenge_2026-10-19")) as unknown as DevTask;
    expect(ch).toBeTruthy();
    const fields: Record<string, unknown> = {};
    for (const e of ch.evidence!) {
      if (e.kind === "text") fields[e.id] = "Plan: call Krishna Real Estate on Monday at 11 AM with two samples, then Sai Dental on Tuesday, ordered by value and likelihood; results reported Saturday with numbers.";
      if (e.kind === "number") fields[e.id] = 5;
      if (e.kind === "checklist") fields[e.id] = (e.items ?? []).map(() => true);
      if (e.kind === "link") fields[e.id] = "https://drive.google.com/file/d/abc";
    }
    const saved = (await dispatch(deps, ravi, "submit", { taskId: ch.id, fields, defer: true })) as DevTask;
    expect(saved.state).toBe("completed");
    expect(saved.scoring).toBeUndefined();
    expect(queued("u_ravi")).toContain(ch.id);
    // Someone else cannot grade it; the owner can.
    expect(await dispatch(deps, teja, "grade", { taskId: ch.id })).toMatchObject({ graded: 0 });
    expect(await dispatch(deps, ravi, "grade", { taskId: ch.id })).toMatchObject({ graded: 1, waiting: 0 });
    const t = mem.__read(PATH.task("u_ravi", ch.id)) as unknown as DevTask;
    expect(t.scoring).toBeTruthy();
    expect(["passed", "failed"]).toContain(t.state);
    expect(queued("u_ravi")).not.toContain(ch.id);
  });
});

describe("profile.update — the person edits their preferences and track", () => {
  it("saves the answers, changes the track effective-dated and audited, and validates", async () => {
    const deps = await makeDeps();
    await expect(dispatch(deps, ravi, "profile.update", { answers: { work: ["calls"] }, track: "sales" })).rejects.toMatchObject({ status: 409 });
    await onboard(deps, ravi, { consent: true, answers: { work: ["calls"], coding: ["no"] }, track: "sales" });
    await expect(dispatch(deps, ravi, "profile.update", { answers: { work: [] }, track: "sales" })).rejects.toMatchObject({ status: 400 });
    await expect(dispatch(deps, ravi, "profile.update", { answers: { work: ["calls"] }, track: "boss" })).rejects.toMatchObject({ status: 400 });

    clock += 60_000;
    await dispatch(deps, ravi, "profile.update", { answers: { work: ["ads", "edit", "bogus"], tools: ["ai"], coding: ["yes"] }, track: "technical" });
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(p.track).toBe("technical");
    expect(p.onboarding.answers).toEqual({ work: ["ads", "edit"], tools: ["ai"], coding: ["yes"] });
    expect(p.onboarding.suggested).toBe("technical");
    expect(p.codingRequired).toBe(true);
    expect(p.onboarding.baseline).toBe("in_progress"); // nothing else changes
    expect(p.trackHistory.map((h) => h.track)).toEqual(["sales", "technical"]);
    expect(p.trackHistory[0].to).toBe(clock);
    expect(p.trackHistory[1]).toMatchObject({ by: "u_ravi", from: clock });
    const audits = mem.__all("devos_audit") as unknown as { action: string; target: string }[];
    expect(audits.some((a) => a.action === "self_set_track" && a.target === "u_ravi")).toBe(true);

    // The same track again: answers saved, no new history row.
    await dispatch(deps, ravi, "profile.update", { answers: { work: ["plan"] }, track: "technical" });
    const p2 = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(p2.trackHistory.length).toBe(2);
    expect(p2.onboarding.answers?.work).toEqual(["plan"]);
  });
});
