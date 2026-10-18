/**
 * What every engine operation receives: the store, the AI port, the server secrets, the clock, the notifier — and
 * the shared helpers (paths, errors, the cached policy, who may do what).
 */
import type { DevSecrets } from "../core/crypto.js";
import { DEFAULT_POLICY, parsePolicy, type DevPolicy } from "../core/policy.js";
import type { AiCallLog, ItemType, Rubric, TrackId } from "../core/types.js";
import type { DevStore } from "./store.js";

export class DevError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "DevError";
  }
}

/** The signed-in person as the server knows them (read from `users/{uid}` — never from the request body). */
export interface Actor {
  uid: string;
  name: string;
  role: string;
  /** users.createdBy — the team key. */
  team: string;
  isActive: boolean;
  externalCreator?: boolean;
}

export interface Notice {
  uid: string;
  type: string;
  title: string;
  message: string;
  link: string;
  /** Deterministic id: a notice with the same key is created once, ever (FR-059). */
  key: string;
  push?: boolean;
}

export interface NotifyPort {
  /** true when this call created the notification (false = it already existed). */
  send(n: Notice): Promise<boolean>;
}

// ── The AI port ─────────────────────────────────────────────────────────────────────────────────

export interface AiResult<T> {
  value: T | null;
  model: string;
  calls: AiCallLog[];
  error?: string;
}

export interface AiItemDraft {
  type: Extract<ItemType, "mcq" | "open">;
  scenario: string;
  question: string;
  options?: string[];
  correct?: number;
  explanation: string;
  hints: string[];
  rubric?: Pick<Rubric, "criteria" | "passMark">;
  exemplar?: string;
  solutionLogic: string;
  objective: string;
  difficulty: number;
  requiresCode: boolean;
}

export interface GenerateRequest {
  track: TrackId;
  dim: string;
  dimName: string;
  objective: string;
  difficulty: number;
  type: "mcq" | "open";
  count: number;
  /** One-line summaries of items to steer away from (never the learner's answers). */
  avoid: string[];
  codingAllowed: boolean;
  language: string;
}

export interface SolveRequest {
  scenario: string;
  question: string;
  options: string[];
}

export interface SolveAnswer {
  index: number | null;
  confidence: number;
  ambiguous: boolean;
  issues: string[];
}

export interface JudgeRequest {
  scenario: string;
  question: string;
  rubric: Rubric;
  exemplar?: string;
  answer: string;
  judge: 1 | 2 | 3;
  /** For the adjudicator: the two earlier verdicts' scores (never their reasoning text). */
  earlier?: number[];
}

export interface CoachRequest {
  scenario: string;
  question: string;
  answerText: string;
  correctText: string;
  explanation: string;
  ask: string;
}

export interface ReportRequest {
  scope: string;
  facts: { id: string; text: string }[];
}

export interface PracticalDraft {
  title: string;
  brief: string;
  evidence: { id: string; label: string; kind: "text" | "link" | "number" | "checklist"; required: boolean; items?: string[] }[];
  rubric: Pick<Rubric, "criteria" | "passMark">;
  exemplar: string;
}

export interface PracticalRequest {
  track: TrackId;
  difficulty: number;
  dims: string[];
  avoid: string[];
  codingAllowed: boolean;
}

export interface AiPort {
  name: string;
  generateItems(req: GenerateRequest): Promise<AiResult<AiItemDraft[]>>;
  solveItems(items: SolveRequest[]): Promise<AiResult<SolveAnswer[]>>;
  judge(req: JudgeRequest): Promise<AiResult<unknown>>;
  embed(texts: string[]): Promise<AiResult<number[][]>>;
  coach(req: CoachRequest): Promise<AiResult<string>>;
  report(req: ReportRequest): Promise<AiResult<{ claims: { text: string; facts: string[] }[]; nextActions: string[] }>>;
  practical(req: PracticalRequest): Promise<AiResult<PracticalDraft>>;
}

// ── Deps ────────────────────────────────────────────────────────────────────────────────────────

export interface Deps {
  store: DevStore;
  ai: AiPort | null;
  secrets: DevSecrets;
  now: () => number;
  notify: NotifyPort;
  log: (level: "info" | "warn" | "error", msg: string, data?: unknown) => void;
  /** Set per request by `loadPolicy` (one read per request at most). */
  policyCache?: DevPolicy;
}

export async function loadPolicy(deps: Deps): Promise<DevPolicy> {
  if (deps.policyCache) return deps.policyCache;
  const raw = await deps.store.get(PATH.policy);
  deps.policyCache = raw ? parsePolicy(raw) : DEFAULT_POLICY;
  return deps.policyCache;
}

// ── Paths ───────────────────────────────────────────────────────────────────────────────────────

export const PATH = {
  policy: "devos_config/policy",
  policyVersion: (v: string) => `devos_policies/${v}`,
  health: "devos_health/current",
  snapshot: "devos_snapshots/overview",
  user: (uid: string) => `devos_users/${uid}`,
  task: (uid: string, id: string) => `devos_users/${uid}/tasks/${id}`,
  tasks: (uid: string) => `devos_users/${uid}/tasks`,
  session: (uid: string, id: string) => `devos_users/${uid}/sessions/${id}`,
  attempt: (uid: string, id: string) => `devos_users/${uid}/attempts/${id}`,
  attempts: (uid: string) => `devos_users/${uid}/attempts`,
  exposure: (uid: string, qid: string) => `devos_users/${uid}/exposures/${qid}`,
  seen: (uid: string, shard: number) => `devos_users/${uid}/seen/s${shard}`,
  xp: (uid: string, id: string) => `devos_users/${uid}/xp/${id}`,
  xps: (uid: string) => `devos_users/${uid}/xp`,
  evidence: (uid: string, id: string) => `devos_users/${uid}/evidence/${id}`,
  evidences: (uid: string) => `devos_users/${uid}/evidence`,
  rankEvent: (uid: string, id: string) => `devos_users/${uid}/rank_events/${id}`,
  rankEvents: (uid: string) => `devos_users/${uid}/rank_events`,
  achievement: (uid: string, id: string) => `devos_users/${uid}/achievements/${id}`,
  achievements: (uid: string) => `devos_users/${uid}/achievements`,
  question: (qid: string) => `devos_questions/${qid}`,
  questions: "devos_questions",
  bankStats: "devos_bank/stats",
  season: (sid: string) => `devos_seasons/${sid}`,
  seasonScore: (sid: string, uid: string) => `devos_seasons/${sid}/scores/${uid}`,
  seasonScores: (sid: string) => `devos_seasons/${sid}/scores`,
  boards: (sid: string) => `devos_boards/${sid}`,
  league: (id: string) => `devos_leagues/${id}`,
  leagueEntry: (id: string, uid: string) => `devos_leagues/${id}/entries/${uid}`,
  leagueEntries: (id: string) => `devos_leagues/${id}/entries`,
  mission: (id: string) => `devos_missions/${id}`,
  job: (id: string) => `devos_jobs/${id}`,
  jobs: "devos_jobs",
  audit: (id: string) => `devos_audit/${id}`,
  audits: "devos_audit",
  report: (id: string) => `devos_reports/${id}`,
  reports: "devos_reports",
  correction: (id: string) => `devos_corrections/${id}`,
  run: (id: string) => `devos_runs/${id}`,
  users: "users",
  userDoc: (uid: string) => `users/${uid}`,
  holidays: "holidays",
  leaveRequests: "leave_requests",
};

// ── Who may do what (FR-002, MSRS §4: a learning track never grants a permission) ─────────────────

/** Platform administrators: configure the policy, see every learner, run the automation (main + tech admin). */
export const isPlatformAdmin = (a: Pick<Actor, "role">): boolean => a.role === "main_admin" || a.role === "tech_admin";

/** Department admins see their department's learners, read-only (the sales admin → Sales track). */
export function adminScopeTracks(a: Pick<Actor, "role">): TrackId[] | "all" | null {
  if (isPlatformAdmin(a)) return "all";
  if (a.role === "sales_admin") return ["sales"];
  return null;
}

export function assertActive(a: Actor) {
  if (!a.isActive) throw new DevError(403, "inactive", "Your account is not active.");
  if (a.externalCreator) throw new DevError(403, "external", "The Development OS is for team members only.");
}

export function assertPlatformAdmin(a: Actor) {
  assertActive(a);
  if (!isPlatformAdmin(a)) throw new DevError(403, "not_admin", "Only the main admin and the tech admin can do this.");
}

/** A short random id (not security-relevant; collisions are checked by `create` semantics where it matters). */
export function shortId(prefix = ""): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${r}`;
}
