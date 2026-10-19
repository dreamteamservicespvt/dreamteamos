/**
 * DREAM TEAM AI Development OS — the shared data contract (2026-10-18).
 *
 * ── Why one file ──────────────────────────────────────────────────────────────────────────────────
 * The same shapes are written by the server (`api/devos.ts`, firebase-admin), read by the browser (the learner's own
 * profile, attempts and tasks through Firestore listeners) and exercised by the tests on an in-memory store. One
 * contract, alias-free (no `@/`), so `api/` can import it as Node ESM.
 *
 * ── Conventions ───────────────────────────────────────────────────────────────────────────────────
 * • Every time is milliseconds since epoch (number) and every day is the India day `yyyy-MM-dd` (CLAUDE.md §28) — no
 *   Firestore Timestamp, so the admin SDK, the client SDK and the tests see the same values.
 * • Everything added later is optional: absent means the default (CLAUDE.md §28, backward compatibility).
 * • Records the MSRS calls immutable (attempts, XP transactions, rank events, exposures, audit events) are written once;
 *   corrections are separate records (`DevCorrection`) and the original result is kept (MSRS §12.1).
 * • `sig` = an HMAC of the record's important fields (core/crypto.ts). Firestore rules publication is not confirmed
 *   (backend-security.md §14), so a record a browser edited by hand is detectable even where a rule would not stop it.
 */

// ── The framework ─────────────────────────────────────────────────────────────────────────────────

/** The ten official dimensions (MSRS §6). Fixed in v1 — never add or rename one. */
export type DimensionId =
  | "cognitive" | "logical" | "learning" | "critical" | "problem"
  | "creativity" | "decision" | "communication" | "emotional" | "execution";

/** The three development tracks (MSRS §7). A permission level is NOT a track (FR-002). */
export type TrackId = "sales" | "technical" | "admin";

/** 1 = Basic … 6 = Ultra Pro Max (FR-035). */
export type RankLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Item difficulty, 1 (foundation) … 5 (expert). */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type ItemType = "mcq" | "multi" | "numeric" | "order" | "open";

/** Why an item or session exists — recorded on every attempt so scores are interpreted fairly (MSRS §6.1). */
export type Purpose =
  | "baseline" | "quest" | "practice" | "remediation" | "transfer" | "retention" | "rank" | "league" | "challenge"
  | "mission" | "capstone";

// ── Questions ─────────────────────────────────────────────────────────────────────────────────────

/** A rubric criterion with scoring anchors (FR-007). Score 0–4 per criterion; weight is a share of 100. */
export interface RubricCriterion {
  id: string;
  label: string;
  weight: number;
  /** What a 0, 2 and 4 look like — the anchors a grader scores against. */
  anchors: { 0: string; 2: string; 4: string };
  /** A critical criterion that scores 0 fails the item whatever the total (MSRS §11.4). */
  critical?: boolean;
}

export interface Rubric {
  /** Versioned: an answer is graded against the rubric it was served with, never a newer one (MSRS §13.2). */
  version: string;
  criteria: RubricCriterion[];
  /** Weighted percentage needed to pass (default 60). */
  passMark: number;
  /** Words the answer should stay within (soft — over-length is never rewarded). */
  maxWords?: number;
}

/** The part of a question a learner may see while answering. */
export interface PublicItem {
  qid: string;
  version: number;
  type: ItemType;
  dim: DimensionId;
  difficulty: Difficulty;
  track: TrackId;
  /** The situation (may hold a table as markdown). Fictional scenarios say so in `fictional`. */
  scenario: string;
  question: string;
  /** mcq / multi / order: the choices, in the order this learner sees them. */
  options?: string[];
  /** numeric: the unit shown beside the box ("₹", "credits", "hours"). */
  unit?: string;
  /** open: the criteria are shown (what good looks like), never the model answer. */
  rubric?: Pick<Rubric, "criteria" | "passMark" | "maxWords">;
  hintCount: number;
  /** Seconds suggested; the server allows `timeLimitSec + grace`. */
  timeLimitSec: number;
  fictional: boolean;
  /** "Learn" items teach a method in the scenario first (Learning Agility, transfer checks). */
  teaches?: boolean;
}

/** The private part: never sent to a browser before the learner answers (FR-007, MSRS §8 of the brief). */
export interface ItemKey {
  /** mcq / multi: correct option indices in the ORIGINAL (unshuffled) option order. */
  correct?: number[];
  /** numeric */
  value?: number;
  tolerance?: number;
  /** order: the correct order as original option indices. */
  order?: number[];
  rubric?: Rubric;
  /** The worked solution / why — shown after answering. */
  explanation: string;
  /** Progressive hints, approach first (FR-023). */
  hints: string[];
  /** open: a model answer for the graders' calibration — never shown to the learner before they answer. */
  exemplar?: string;
}

export type QuestionSource = "template" | "ai";

/** Similarity fingerprints (FR-009, FR-012). */
export interface Fingerprint {
  /** Exact text hash. */
  x: string;
  /** Hash of the normalized text (names, numbers, punctuation stripped). */
  n: string;
  /** MinHash signature of word shingles (hex, fixed length). */
  m: string;
  /** SimHash of the semantic embedding (hex), when an embedding was available. */
  e?: string;
  /** Solution signature: template `family:form:setting` or the AI's canonical answer-logic hash. */
  s: string;
}

export type QuestionStatus = "pool" | "served" | "retired" | "quarantined" | "rejected";

export interface ValidationCheck {
  id: string;
  passed: boolean;
  note?: string;
}

/** devos_questions/{qid} — server-only (the rule denies every browser). */
export interface QuestionDoc {
  id: string;
  version: number;
  source: QuestionSource;
  /** template family id, or "ai". */
  family: string;
  form: string;
  setting: string;
  track: TrackId;
  dim: DimensionId;
  difficulty: Difficulty;
  type: ItemType;
  /** `${track}|${dim}|${difficulty}|${status}` — one equality query finds a pool (no composite index). */
  poolState: string;
  status: QuestionStatus;
  public: Omit<PublicItem, "qid" | "version" | "hintCount" | "options"> & { options?: string[] };
  /** The `ItemKey`, AES-GCM encrypted (core/crypto.ts) — `{kid, iv, ct}`. */
  key: SealedBox;
  fp: Fingerprint;
  objective: string;
  /** The reasoning gap the coach names when this item is missed (FR-022). */
  gap?: GapKind;
  validation: { status: "valid" | "rejected" | "quarantined"; checks: ValidationCheck[]; solverAgreed?: boolean; at: number };
  provenance: {
    generator: string;
    /** template version or prompt version */
    version: string;
    model?: string;
    jobId?: string;
    at: number;
  };
  /** How many people saw it (AI items are served to one person by default — policy `aiItemMaxServes`). */
  serves: number;
  stats?: { answered: number; correct: number; totalMs: number; flags: number };
  servedTo?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SealedBox {
  kid: string;
  iv: string;
  ct: string;
}

/** One entry of a learner's seen index (`devos_users/{uid}/seen/{shard}.e[]`). Compact on purpose. */
export interface SeenEntry {
  q: string;
  x: string;
  n: string;
  m: string;
  e?: string;
  s: string;
  /** dimension id, so a check can be narrowed. */
  d: DimensionId;
  t: number;
}

export interface SimilarityDecision {
  duplicate: boolean;
  /** "exact" | "normalized" | "signature" | "lexical" | "semantic" | "none" */
  reason: string;
  /** The closest earlier question, when one was close. */
  nearest?: string;
  score?: number;
  checked: number;
  method: string;
}

/** devos_users/{uid}/exposures/{qid} — recorded BEFORE the content reaches the learner (MSRS §12.1). */
export interface Exposure {
  qid: string;
  version: number;
  sessionId: string;
  taskId?: string;
  purpose: Purpose;
  dim: DimensionId;
  difficulty: Difficulty;
  servedAt: number;
  state: "served" | "answered" | "expired" | "voided";
  answeredAt?: number;
  similarity: SimilarityDecision;
  /** The option order this learner saw (original indices), so the attempt can be scored and replayed. */
  optionOrder?: number[];
  hintsShown: number;
}

// ── Sessions, attempts ───────────────────────────────────────────────────────────────────────────

/** One slot of a session: what the Director asked for, and what was served into it. */
export interface SessionSlot {
  dim: DimensionId;
  difficulty: Difficulty;
  purpose: Purpose;
  /** Ask for this item type (e.g. an open answer for Communication). */
  type?: ItemType;
  /** Restrict to a family/form (league variants share a blueprint). */
  family?: string;
  form?: string;
  /** A transfer check must use a different setting than these. */
  avoidSettings?: string[];
  /** Serve in another track's setting (a transfer check across roles). */
  trackOverride?: TrackId;
  qid?: string;
  /** The public item as served (no key). */
  item?: PublicItem;
  servedAt?: number;
  attemptId?: string;
  state: "pending" | "served" | "answered" | "expired" | "skipped_system";
  /** Why the Director chose it, in one sentence (FR-021). */
  reason?: string;
  /** Mirrors of the attempt's result, so a session reads its own progress in one document. */
  score?: number;
  passed?: boolean;
  /** An open answer still being graded. */
  pending?: boolean;
}

export interface DevSession {
  id: string;
  uid: string;
  taskId?: string;
  purpose: Purpose;
  track: TrackId;
  language: string;
  policyVersion: string;
  slots: SessionSlot[];
  state: "open" | "complete" | "expired" | "voided";
  createdAt: number;
  startedAt?: number;
  dueAt: number;
  completedAt?: number;
  /**
   * Percentage over the scored slots AND the expired ones (each counted as 0), when complete; `expired` = items the
   * person let run out. A platform fault (`skipped_system`) is never counted.
   */
  result?: { score: number; passed: boolean; answered: number; correct: number; pending: number; expired?: number };
  /** A rank assessment: the level it was for. */
  forRank?: RankLevel;
  /** A league round's id. */
  roundId?: string;
}

export type Outcome = "passed" | "failed" | "expired" | "system_error" | "pending_validation" | "partial";

export type Confidence = "none" | "low" | "medium" | "high";

export interface CriterionScore {
  id: string;
  label: string;
  /** 0–4 */
  score: number;
  weight: number;
  /** A short quote from the answer that supports the score (verified to exist in the answer). */
  evidence?: string;
  note?: string;
}

export interface JudgeVerdict {
  model: string;
  /** 0–100 weighted */
  score: number;
  criteria: CriterionScore[];
  confidence: number;
  summary: string;
  /** What the judge said was missing / wrong, in plain words. */
  gaps: string[];
  at: number;
  /** The judge's raw output failed a check and was discarded (kept for audit). */
  rejectedReason?: string;
}

export type GapKind =
  | "knowledge" | "assumption" | "evidence" | "calculation" | "tradeoff" | "communication" | "incomplete" | "reading"
  | "none";

export interface Feedback {
  /** One sentence: what happened. */
  headline: string;
  /** What to do differently, as steps. */
  steps: string[];
  /** The worked solution / model reasoning (after answering). */
  explanation: string;
  gap: GapKind;
  /** The next step the coach scheduled (a fresh retry, a retention check …). */
  next?: string;
}

export interface Scoring {
  method: "deterministic" | "rubric_ai" | "rubric_ai_2" | "rubric_ai_adjudicated" | "none";
  /** 0–100 */
  score: number;
  passed: boolean;
  /** objective: was the answer right (after hint deductions it can still be "correct" with a lower score). */
  correct?: boolean;
  criteria?: CriterionScore[];
  judges?: JudgeVerdict[];
  /** Absolute difference between the first two judges. */
  disagreement?: number;
  confidence: Confidence;
  /** Reason codes ("hint_penalty", "late", "injection_suspected", "evidence_unverified" …). */
  codes: string[];
  at: number;
}

/** devos_users/{uid}/attempts/{attemptId} — one answer to one item; never overwritten (FR-048). */
export interface DevAttempt {
  id: string;
  uid: string;
  sessionId: string;
  taskId?: string;
  purpose: Purpose;
  track: TrackId;
  dim: DimensionId;
  difficulty: Difficulty;
  qid: string;
  qversion: number;
  family: string;
  form: string;
  setting: string;
  source: QuestionSource;
  /** The item as the learner saw it (for history — no key). */
  item: PublicItem;
  /** The learner's answer: option indices (as SHOWN), a number, an order (as shown) or text. */
  response: AttemptResponse;
  servedAt: number;
  submittedAt: number;
  ms: number;
  hintsUsed: number;
  language: string;
  rubricVersion?: string;
  policyVersion: string;
  /** Set once when the attempt is scored (deterministic at once; open answers when the judges finish). */
  scoring?: Scoring;
  /** The answer key revealed AFTER submission, in the learner's option order. */
  reveal?: { correct?: number[]; value?: number; order?: number[]; explanation: string; exemplar?: string };
  feedback?: Feedback;
  outcome: Outcome;
  /** Why it is not counted, for a system error / expiry ("ai_unavailable", "deadline", …). */
  reasonCode?: string;
  /** Set only by a correction (the original `scoring` is kept). */
  current?: { score: number; outcome: Outcome; correctionId: string; at: number };
  /** The learner's review of this answer (one per answer), whatever it decided — the correction record has the detail. */
  appeal?: { at: number; outcome: "changed" | "upheld" | "voided" | "pending"; detail: string };
  /** Applied to XP / mastery / season (idempotency marker; `applyAttempt` sets it once). */
  appliedAt?: number;
  /** Grading jobs tried for an open answer (bounded — policy `gradeRetryLimit`). */
  gradeTries?: number;
  /** When the learner's own `grade` request last took this answer (2026-10-19) — one grading at a time, at most once
   *  a minute, so a reloading page never stacks AI calls or burns the bounded tries. Not signed. */
  gradeClaimAt?: number;
  createdAt: number;
  sig?: string;
}

export type AttemptResponse =
  | { kind: "choice"; selected: number[] }
  | { kind: "number"; value: number }
  | { kind: "order"; order: number[] }
  | { kind: "text"; text: string };

// ── Tasks ────────────────────────────────────────────────────────────────────────────────────────

/** FR-028 — Assigned → In Progress → Completed (submitted) → Passed / Failed; Expired; Cancelled; System Error. */
export type TaskState = "assigned" | "in_progress" | "completed" | "passed" | "failed" | "expired" | "cancelled" | "system_error";

export type TaskKind =
  | "baseline" | "quest" | "practice" | "remediation" | "retention" | "transfer" | "challenge" | "rank" | "league"
  | "mission_part" | "capstone";

export interface TaskEvent {
  from: TaskState | null;
  to: TaskState;
  at: number;
  /** uid or "system" */
  by: string;
  reason: string;
  ref?: string;
}

export interface EvidenceRequirement {
  id: string;
  kind: "text" | "link" | "checklist" | "number";
  label: string;
  required: boolean;
  /** checklist items */
  items?: string[];
  hint?: string;
}

export interface TaskSubmission {
  fields: Record<string, string | number | string[] | boolean[]>;
  at: number;
}

/** devos_users/{uid}/tasks/{taskId} */
export interface DevTask {
  id: string;
  uid: string;
  kind: TaskKind;
  title: string;
  /** One line: why this task, for this person, now (FR-021). */
  why: string;
  track: TrackId;
  dims: DimensionId[];
  day: string;
  createdAt: number;
  dueAt: number;
  state: TaskState;
  events: TaskEvent[];
  /** Question-based tasks run a session. */
  sessionId?: string;
  /** Planned slots (copied into the session when it starts). */
  blueprint?: SessionSlot[];
  estMinutes: number;
  xpReward: number;
  difficulty: Difficulty;
  /** Practical tasks (weekly challenge, mission part, capstone). */
  brief?: string;
  evidence?: EvidenceRequirement[];
  rubric?: Rubric;
  submission?: TaskSubmission;
  scoring?: Scoring;
  feedback?: Feedback;
  /** Mission / league links. */
  missionId?: string;
  roundId?: string;
  /** A requirement changed mid-task (FR-032): what changed and when. */
  changes?: { at: number; what: string }[];
  /** Key that made it, so a retried job never makes two (FR-059). */
  idem: string;
  appliedAt?: number;
  /** The practical challenge it came from (library id, or "ai:<hash>"). */
  challengeId?: string;
  /** A practical answer the judges could not settle yet (re-graded by the tick). */
  gradeTries?: number;
  /** When the learner's own `grade` request last took this practical (2026-10-19; one claim a minute — learner.gradeMine). */
  gradeClaimAt?: number;
  /** A submitted practical still waiting for its grade (true from the submission until graded or given up) — what the
   *  tick's daily roll-over looks for to re-queue one the queue lost (engine/queue.ts). Absent on older tasks. */
  submissionPending?: boolean;
  /** For a rank assessment task. */
  forRank?: RankLevel;
  sig?: string;
}

// ── Mastery, XP, ranks ──────────────────────────────────────────────────────────────────────────

export type EvidenceKind = "baseline" | "practice" | "assessment" | "transfer" | "retention" | "practical" | "capstone" | "league";

/** devos_users/{uid}/evidence/{id} — the mastery record (MasteryEvidence, MSRS §12). */
export interface DevEvidence {
  id: string;
  uid: string;
  dim: DimensionId;
  kind: EvidenceKind;
  sourceType: "attempt" | "task";
  sourceId: string;
  /** 0–100 */
  score: number;
  difficulty: Difficulty;
  /** 0.4 … 1.2 (core/mastery.ts EVIDENCE_QUALITY) */
  quality: number;
  confidence: Confidence;
  setting: string;
  family: string;
  policyVersion: string;
  recordedAt: number;
  /** 1/k guessing chance for a k-option single-choice item (the estimate corrects for lucky guesses). */
  guess?: number;
}

/** The compact evidence kept on the profile (the last N per dimension) — mastery is computed from it. */
export interface EvidenceDigest {
  s: number;
  d: Difficulty;
  q: number;
  t: number;
  k: EvidenceKind;
  /** setting (for transfer detection) */
  g: string;
  /** source id */
  i: string;
  /** guessing chance (1/k) of a choice item, when there was one */
  c?: number;
}

export interface DimensionState {
  /** 0–100, null = not measured yet (FR-004: never invent a score). */
  score: number | null;
  confidence: Confidence;
  /** Valid evidence items counted. */
  n: number;
  /** The first measured score (baseline). */
  baseline: number | null;
  /** Adaptive level for the next item (FR-024). */
  level: Difficulty;
  /** consecutive passes / fails at the current level */
  run: number;
  lastAt: number | null;
  /** Last N evidence digests (newest last). */
  recent: EvidenceDigest[];
  /** Spaced retention boxes (Leitner) per difficulty passed. */
  retention?: { level: Difficulty; box: number; due: string }[];
  /** Highest difficulty passed with a valid attempt. */
  bestLevel: number;
}

export type GateId = "onboarding" | "assessment" | "dimensions" | "practical" | "transfer" | "retention" | "evidence" | "capstone";

export interface GateResult {
  id: GateId;
  label: string;
  passed: boolean;
  /** "2 of 2 fresh assessments at 75%+" */
  detail: string;
  /** What to do next to pass it. */
  todo?: string;
  evidenceIds: string[];
}

export interface RankEvaluation {
  current: RankLevel;
  next: RankLevel | null;
  eligible: boolean;
  gates: GateResult[];
  policyVersion: string;
}

/** devos_users/{uid}/rank_events/{id} — FR-037 */
export interface RankEvent {
  id: string;
  uid: string;
  oldRank: RankLevel;
  newRank: RankLevel;
  gates: GateResult[];
  evidenceIds: string[];
  policyVersion: string;
  effectiveAt: number;
  sig?: string;
}

/** devos_users/{uid}/xp/{txId} — FR-034 (txId IS the idempotency key) */
export interface XpTransaction {
  id: string;
  uid: string;
  amount: number;
  reason: string;
  sourceType: "attempt" | "task" | "badge" | "rank" | "streak" | "season";
  sourceId: string;
  ruleVersion: string;
  seasonId: string;
  day: string;
  recordedAt: number;
  sig?: string;
}

export interface Achievement {
  id: string;
  uid: string;
  badge: string;
  title: string;
  detail: string;
  evidence: string[];
  earnedAt: number;
  permanent: true;
}

// ── The profile (summary document) ──────────────────────────────────────────────────────────────

export interface TrackAssignment {
  track: TrackId;
  from: number;
  to?: number;
  by: string;
  reason: string;
  policyVersion: string;
}

export interface DayStat {
  day: string;
  /** Daily quests assigned that day (written when the quest is created). */
  assigned: number;
  /** Tasks of any kind finished that day. */
  done: number;
  /** Daily quests finished that day — what the Control Center's "Quests" compares with `assigned` (2026-10-18; absent on
   *  older entries = 0: before, `done` counted every task against an `assigned` nothing wrote — "11 of 0 done"). */
  questDone?: number;
  items: number;
  correct: number;
  xp: number;
}

/** The gate counters the rank engine reads (recomputable from evidence — `reconcileProfile`). */
export interface GateCounters {
  /** Rank assessments taken: level → [{score, at, sessionId}] */
  assessments: { level: RankLevel; score: number; at: number; sessionId: string; valid: boolean }[];
  /** practical tasks passed: [{difficulty, score, at, taskId, kind}] */
  practicals: { difficulty: Difficulty; score: number; at: number; taskId: string; kind: TaskKind }[];
  /** transfer checks passed: [{dim, at, id}] */
  transfers: { dim: DimensionId; at: number; id: string }[];
  /** retention checks passed: [{dim, gapDays, at, id}] */
  retentions: { dim: DimensionId; gapDays: number; at: number; id: string }[];
  /** Valid scored attempts. */
  validAttempts: number;
  /** Capstone passed + impact evidence accepted. */
  capstone?: { taskId: string; score: number; at: number; impact: boolean };
}

/** devos_users/{uid} — what the learner's Home reads in ONE document (read quota, CLAUDE.md §28). */
export interface DevProfile {
  uid: string;
  name: string;
  role: string;
  /** users.createdBy — the team key. */
  team: string;
  status: "invited" | "active" | "paused" | "excluded";
  track: TrackId;
  trackHistory: TrackAssignment[];
  codingRequired: boolean;
  language: string;
  onboarding: {
    consentAt?: number;
    answers?: Record<string, string[]>;
    suggested?: TrackId;
    baseline: "not_started" | "in_progress" | "complete";
    baselineTaskId?: string;
    completedAt?: number;
  };
  rank: { level: RankLevel; since: number; eventId?: string };
  xp: { total: number; season: number; seasonId: string; week: number; weekKey: string; today: number; day: string };
  dims: Record<DimensionId, DimensionState>;
  /** Role-weighted 0–100 (MSRS §11.2) — null until every dimension is measured. */
  summary: number | null;
  /** The weighted summary at the start of the current season (Most Improved). */
  seasonStartSummary?: number | null;
  plan: { focus: DimensionId[]; reasons: string[]; updatedAt: number };
  streak: { current: number; best: number; lastDay: string | null; freezes: number; freezeUsedOn?: string[] };
  stats: {
    attempts: number; passed: number; failed: number; expired: number; systemErrors: number; pending: number;
    tasksDone: number; tasksExpired: number; remediationTried: number; remediationPassed: number;
    retentionTried: number; retentionPassed: number; transferTried: number; transferPassed: number;
    questsDone?: number; perfectQuests?: number; hardCorrect?: number; practicalPassed?: number; practicalFailed?: number;
    missionParts?: number; leaguePodiums?: number;
  };
  /** How many shards the seen index has (`seen/s0` …). */
  seenShards?: number;
  /** The learner chose to appear as "A teammate" on published boards (privacy — research lesson 16). */
  boardPrivate?: boolean;
  /** An admin's explicit enrolment decision (true / false); absent = the policy's role default. */
  enrolled?: boolean;
  /** Start reminders sent before onboarding (auto-invite). */
  invites?: { count: number; lastDay: string };
  /** Practical challenges already given (library ids or AI fingerprints) — never the same one twice. */
  practicalSeen?: string[];
  days: DayStat[];
  gates: GateCounters;
  badges: string[];
  /** Season / league rating (Elo-like), reset each season (FR-033: separate from XP and mastery). */
  rating: { seasonId: string; value: number; rounds: number; best: number };
  lastActiveAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Rate guard for answers (abuse). */
  rate?: { minute: number; count: number };
  /** Set when the stored profile failed its signature check and was rebuilt (an admin sees it). */
  integrity?: { at: number; note: string }[];
  sig?: string;
}

// ── Competition ─────────────────────────────────────────────────────────────────────────────────

export type BoardId = "mastery" | "improved" | "execution" | "team";

export interface SeasonScore {
  uid: string;
  name: string;
  track: TrackId;
  team: string;
  seasonId: string;
  /** Σ effective × quality over the season's valid evidence, and Σ quality. */
  masteryNum: number;
  masteryDen: number;
  items: number;
  questsAssigned: number;
  questsOnTime: number;
  practicalAssigned: number;
  practicalOnTime: number;
  startSummary: number | null;
  missionPoints: number;
  updatedAt: number;
  /** The person's weighted summary now (Most Improved) and their board privacy — copied at every update. */
  summary?: number | null;
  hidden?: boolean;
}

export interface BoardEntry {
  uid: string;
  name: string;
  track: TrackId;
  value: number;
  label: string;
  position: number;
}

export interface TeamEntry {
  team: TrackId;
  label: string;
  value: number;
  members: number;
  position: number;
  detail: string;
}

/** devos_boards/{seasonId} — published standings: approved fields only (FR-047). */
export interface BoardsDoc {
  seasonId: string;
  start: string;
  end: string;
  boards: Record<Exclude<BoardId, "team">, BoardEntry[]>;
  teams: TeamEntry[];
  /** How each board is calculated (FR-043, AC-029). */
  rules: Record<BoardId, string>;
  policyVersion: string;
  builtAt: number;
  final: boolean;
}

export interface LeagueRound {
  id: string;
  track: TrackId;
  weekKey: string;
  seasonId: string;
  opensAt: number;
  closesAt: number;
  blueprint: SessionSlot[];
  rubricVersion: string;
  state: "open" | "closed";
  /** uid → result (after close) */
  results?: { uid: string; name: string; score: number; ms: number; position: number; ratingBefore: number; ratingAfter: number }[];
  createdAt: number;
}

export interface MissionPart {
  uid: string;
  name: string;
  role: string;
  taskId: string;
  state: TaskState;
  score?: number;
}

export interface TeamMission {
  id: string;
  track: TrackId;
  seasonId: string;
  title: string;
  objective: string;
  outcomeMeasure: string;
  parts: MissionPart[];
  state: "open" | "complete" | "expired";
  dueAt: number;
  score?: number;
  createdAt: number;
}

// ── Operations ──────────────────────────────────────────────────────────────────────────────────

export interface DevCorrection {
  id: string;
  uid: string;
  attemptId: string;
  kind: "appeal" | "regrade" | "void_system_error" | "admin_override";
  reason: string;
  before: { score: number; outcome: Outcome };
  after: { score: number; outcome: Outcome };
  by: string;
  at: number;
  detail?: string;
  /** An appeal the graders could not answer yet: waiting in the grading queue, re-graded by the tick (2026-10-18). */
  pending?: boolean;
  /** Re-grading tries of a pending appeal (bounded — policy `gradeRetryLimit`). */
  tries?: number;
  sig?: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  actorName: string;
  action: string;
  target: string;
  at: number;
  policyVersion: string;
  detail?: string;
  sig?: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed" | "dead";

export interface AiCallLog {
  purpose: string;
  model: string;
  ms: number;
  ok: boolean;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
}

export interface DevJob {
  id: string;
  type: string;
  status: JobStatus;
  tries: number;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  calls: AiCallLog[];
  createdAt: number;
  updatedAt: number;
  leaseUntil?: number;
}

export interface HealthDoc {
  lastTickAt: number | null;
  lastTick?: TickSummary;
  ai: { day: string; calls: number; failures: number; tokensIn: number; tokensOut: number; lastError?: string; lastOkAt?: number };
  /** Rolling counters for the admin's quality view. */
  quality: { day: string; generated: number; rejected: number; duplicatesBlocked: number; judgeDisagreements: number; pendingValidation: number };
  /** Key fingerprints Google refused recently (skip them for a day). */
  deadKeys?: { fp: string; until: number; why: string }[];
  updatedAt: number;
}

export interface TickSummary {
  at: number;
  ms: number;
  mode: string;
  steps: { id: string; ok: boolean; note: string; ms: number }[];
  questsCreated: number;
  expired: number;
  graded: number;
  generated: number;
  notifications: number;
  errors: number;
  /** What woke it: a Vercel cron's schedule ("0 4 * * *"), "open" (no CRON_SECRET), "cron", "catchup" or "manual". */
  trigger?: string;
}

export interface ReportClaim {
  text: string;
  facts: string[];
  kind: "fact" | "hypothesis";
}

export interface ReportFact {
  id: string;
  text: string;
  value: number | string;
  ref?: string;
}

export interface DevReport {
  id: string;
  scope: string;
  period: { from: string; to: string };
  facts: ReportFact[];
  claims: ReportClaim[];
  nextActions: string[];
  generator: "ai" | "template";
  model?: string;
  generatedAt: number;
}
