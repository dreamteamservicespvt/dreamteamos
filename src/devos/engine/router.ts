/**
 * The one action router: `api/devos.ts` (production) and the DEV fallback call the same `dispatch`, so the browser
 * never has a second path to the engine. Inputs are validated here (shape, length, enums) before any engine call;
 * identity is the server-verified `Actor`, never a field of the body (AC-020).
 */
import { DIMENSION_IDS } from "../core/dimensions.js";
import type { AttemptResponse, DimensionId, TrackId } from "../core/types.js";
import {
  adminAudit, adminExceptions, adminExport, adminGenerateReport, adminIntegrity, adminOverview, adminPerson, adminQuarantine,
  adminQuestions, adminRegrade, adminReports, adminSavePolicy, adminSetEnrollment, adminSetTrack, adminStaff, adminVoid,
} from "./admin.js";
import { replenishPool, type PoolTarget } from "./aipool.js";
import { joinLeague, refreshBoardsIfStale } from "./competition.js";
import { assertActive, assertPlatformAdmin, DevError, loadPolicy, PATH, type Actor, type Deps } from "./context.js";
import { answer, ensureProfile, ensureToday, gradeMine, hint, nextItem, onboard, setBoardPrivacy, startPractice, startRankAssessment, startTask, updatePreferences } from "./learner.js";
import { appeal, coach, submitPractical } from "./review.js";
import { catchupDue, runTick } from "./tick.js";

const TRACKS: TrackId[] = ["sales", "technical", "admin"];

const s = (v: unknown, name: string, max = 200): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new DevError(400, "bad_input", `${name} is missing or too long.`);
  return v.trim();
};
const id = (v: unknown, name: string) => {
  const x = s(v, name, 120);
  if (!/^[A-Za-z0-9_.-]+$/.test(x)) throw new DevError(400, "bad_input", `${name} is not valid.`);
  return x;
};
const int = (v: unknown, name: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new DevError(400, "bad_input", `${name} is not valid.`);
  return v;
};

function response(v: unknown): AttemptResponse {
  if (!v || typeof v !== "object") throw new DevError(400, "bad_answer", "No answer was sent.");
  const r = v as Record<string, unknown>;
  if (r.kind === "choice" && Array.isArray(r.selected)) return { kind: "choice", selected: r.selected.slice(0, 10).map((x) => int(x, "choice", 0, 20)) };
  if (r.kind === "number" && typeof r.value === "number" && Number.isFinite(r.value)) return { kind: "number", value: r.value };
  if (r.kind === "order" && Array.isArray(r.order)) return { kind: "order", order: r.order.slice(0, 12).map((x) => int(x, "order", 0, 20)) };
  if (r.kind === "text" && typeof r.text === "string") return { kind: "text", text: r.text.slice(0, 6000) };
  throw new DevError(400, "bad_answer", "That answer is not in a form the system accepts.");
}

export const ACTIONS = [
  "bootstrap", "onboard", "today", "start", "next", "hint", "answer", "submit", "practice", "rank", "appeal", "coach", "privacy",
  "league.join", "boards", "catchup", "grade", "profile.update",
  "admin.overview", "admin.staff", "admin.person", "admin.track", "admin.enrol", "admin.policy", "admin.void", "admin.regrade",
  "admin.quarantine", "admin.questions", "admin.audit", "admin.exceptions", "admin.reports", "admin.report", "admin.export",
  "admin.integrity", "admin.tick", "admin.generate",
] as const;
export type Action = (typeof ACTIONS)[number];

export async function dispatch(deps: Deps, actor: Actor, action: string, body: Record<string, unknown>): Promise<unknown> {
  // Every action, before anything is read: a switched-off account (its ID token stays valid for up to an hour after
  // the switch) and an external creator are refused here, whatever each operation checks on its own.
  assertActive(actor);
  const result = await route(deps, actor, action, body);
  // An action that returns nothing answers `{ ok: true }`: the screens read `null` as "it failed" (the browser test
  // found the Change-track dialog staying open after a successful save, inviting a second, audited save).
  return result === undefined || result === null ? { ok: true } : result;
}

async function route(deps: Deps, actor: Actor, action: string, body: Record<string, unknown>): Promise<unknown> {
  switch (action as Action) {
    case "bootstrap": {
      const profile = await ensureProfile(deps, actor);
      const today = profile.status === "active" ? await ensureToday(deps, actor) : { created: [] };
      return { profile: await deps.store.get(PATH.user(actor.uid)), today, catchupDue: await catchupDue(deps).catch(() => false) };
    }
    case "onboard": {
      const track = s(body.track, "track", 20) as TrackId;
      if (!TRACKS.includes(track)) throw new DevError(400, "track", "Pick Sales, Technical or Admin.");
      return onboard(deps, actor, { consent: body.consent === true, answers: body.answers, track, language: typeof body.language === "string" ? body.language : undefined });
    }
    case "today": return ensureToday(deps, actor);
    case "start": return startTask(deps, actor, id(body.taskId, "taskId"));
    case "next": return nextItem(deps, actor, id(body.taskId, "taskId"));
    case "hint": return hint(deps, actor, id(body.taskId, "taskId"), int(body.slotIndex, "slotIndex", 0, 30));
    case "answer": return answer(deps, actor, { taskId: id(body.taskId, "taskId"), slotIndex: int(body.slotIndex, "slotIndex", 0, 30), response: response(body.response), defer: body.defer === true });
    case "submit": {
      const fields = body.fields && typeof body.fields === "object" ? (body.fields as Record<string, unknown>) : {};
      return submitPractical(deps, actor, { taskId: id(body.taskId, "taskId"), fields, defer: body.defer === true });
    }
    case "practice": {
      const dim = typeof body.dim === "string" && DIMENSION_IDS.includes(body.dim as DimensionId) ? (body.dim as DimensionId) : undefined;
      return startPractice(deps, actor, dim);
    }
    case "rank": return startRankAssessment(deps, actor);
    case "appeal": return appeal(deps, actor, { attemptId: id(body.attemptId, "attemptId"), reason: s(body.reason, "reason", 500) });
    case "coach": return coach(deps, actor, { attemptId: id(body.attemptId, "attemptId"), ask: s(body.ask, "question", 500) });
    case "grade": return gradeMine(deps, actor, {
      attemptId: typeof body.attemptId === "string" ? id(body.attemptId, "attemptId") : undefined,
      taskId: typeof body.taskId === "string" ? id(body.taskId, "taskId") : undefined,
    });
    case "profile.update": {
      const track = s(body.track, "track", 20) as TrackId;
      if (!TRACKS.includes(track)) throw new DevError(400, "track", "Pick Sales, Technical or Admin.");
      return updatePreferences(deps, actor, { answers: body.answers, track });
    }
    case "privacy": return setBoardPrivacy(deps, actor, body.hidden === true);
    case "league.join": return joinLeague(deps, actor);
    case "boards": {
      await refreshBoardsIfStale(deps, await loadPolicy(deps), 5 * 60_000);
      return { ok: true };
    }
    case "catchup": {
      if (!(await catchupDue(deps))) return { ran: false };
      return { ran: true, summary: await runTick(deps, { reason: "catchup", budgetMs: 40_000 }) };
    }
    case "admin.overview": return adminOverview(deps, actor, body.fresh === true);
    case "admin.staff": return adminStaff(deps, actor);
    case "admin.person": return adminPerson(deps, actor, id(body.uid, "uid"));
    case "admin.track": {
      const track = s(body.track, "track", 20) as TrackId;
      return adminSetTrack(deps, actor, { uid: id(body.uid, "uid"), track, reason: s(body.reason, "reason", 300) });
    }
    case "admin.enrol": return adminSetEnrollment(deps, actor, { uid: id(body.uid, "uid"), enrolled: body.enrolled === true, reason: typeof body.reason === "string" ? body.reason : "" });
    case "admin.policy": return adminSavePolicy(deps, actor, { policy: body.policy, reason: s(body.reason, "reason", 300) });
    case "admin.void": return adminVoid(deps, actor, { uid: id(body.uid, "uid"), attemptId: id(body.attemptId, "attemptId"), reason: s(body.reason, "reason", 300) });
    case "admin.regrade": return adminRegrade(deps, actor, { uid: id(body.uid, "uid"), attemptId: id(body.attemptId, "attemptId") });
    case "admin.quarantine": return adminQuarantine(deps, actor, { qid: id(body.qid, "qid"), reason: s(body.reason, "reason", 300) });
    case "admin.questions": return adminQuestions(deps, actor);
    case "admin.audit": return adminAudit(deps, actor);
    case "admin.exceptions": return adminExceptions(deps, actor);
    case "admin.reports": return adminReports(deps, actor);
    case "admin.report": return adminGenerateReport(deps, actor);
    case "admin.export": return adminExport(deps, actor, { uid: typeof body.uid === "string" ? id(body.uid, "uid") : undefined });
    case "admin.integrity": return adminIntegrity(deps, actor, { uid: id(body.uid, "uid"), repair: body.repair === true });
    case "admin.tick": {
      assertPlatformAdmin(actor);
      return runTick(deps, { reason: "manual", budgetMs: 45_000 });
    }
    case "admin.generate": {
      assertPlatformAdmin(actor);
      const policy = await loadPolicy(deps);
      const t = body.target as Partial<PoolTarget> | undefined;
      if (!t || !TRACKS.includes(t.track as TrackId) || !DIMENSION_IDS.includes(t.dim as DimensionId)) throw new DevError(400, "target", "Pick a track and a dimension.");
      return replenishPool(deps, policy, [{ track: t.track as TrackId, dim: t.dim as DimensionId, difficulty: Math.min(5, Math.max(1, Number(t.difficulty) || 3)) as PoolTarget["difficulty"], kind: t.kind === "open" ? "open" : "objective" }], 1);
    }
    default:
      throw new DevError(400, "unknown_action", `Unknown action "${action}".`);
  }
}
