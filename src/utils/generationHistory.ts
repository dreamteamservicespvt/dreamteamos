/**
 * Ad Generation History — one row per AD, not one row per save.
 *
 * ── Why the history showed every ad three times ───────────────────────────────────────────────
 * The generator writes a new `ai_generations` document every time a member generates, and it used
 * to write another one every time they pressed Save. A normal job — generate, tweak, save, maybe
 * generate again — left three documents behind, and the history listed every document. The page
 * did pick "the latest generation" for each completed job, but then added all the OTHER versions
 * of that same job back in as if they were separate ads, and every job still in progress appeared
 * once per version with no status at all.
 *
 * ── Why the name differed from the member's screen ────────────────────────────────────────────
 * Each generation stores the business name the AI read off the logo or visiting card — "WOOD CRAFT
 * DECOR" on one run, "Wood Craft Decor" on the next — while the member's own list shows the name on
 * the assignment. For a job, the assignment's name is the one everybody else sees, so it is the one
 * shown here too.
 *
 * Kept pure so the grouping can be tested without Firestore.
 */

export interface GenerationLike {
  id?: string;
  userId?: string;
  userName?: string;
  businessName?: string;
  businessType?: string;
  creationMode?: string;
  duration?: number | string;
  festivalName?: string;
  workAssignmentId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface AssignmentLike {
  id: string;
  assignedTo?: string;
  status?: string;
  businessName?: string;
  clientName?: string;
  displayTitle?: string;
  uniqueId?: string;
  category?: string;
  duration?: string;
  savedGenerationId?: string;
  completedAt?: unknown;
  assignedAt?: unknown;
}

export interface HistoryEntry {
  /** Stable React key. */
  key: string;
  /** The generation to open — the newest one. Null for a delivered job with nothing saved. */
  generation: GenerationLike | null;
  userId: string;
  /** The name to show: the assignment's for a job, the generation's own otherwise. */
  businessName: string;
  businessType: string;
  creationMode?: string;
  duration: number;
  festivalName?: string;
  /** Milliseconds of the newest activity — what the list sorts and filters by. */
  timestampMs: number;
  /** The raw timestamp, for callers that format it themselves. */
  timestamp: unknown;
  /** How many saved generations this row stands for (1 = no other versions). */
  versions: number;
  assignmentId?: string;
  uniqueId?: string;
  status?: string;
}

/** Firestore Timestamp, `{seconds}`, Date, ISO string or millis → millis (0 when unreadable). */
export function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "string") {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof ts === "object") {
    const o = ts as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof o.toMillis === "function") return o.toMillis();
    if (typeof o.seconds === "number") return o.seconds * 1000;
    if (typeof o._seconds === "number") return o._seconds * 1000;
  }
  return 0;
}

/** A generation's newest moment: when it was last saved, else when it was made. */
export function generationMillis(g: GenerationLike): number {
  return Math.max(toMillis(g.updatedAt), toMillis(g.createdAt));
}

/** "WOOD CRAFT DECOR" and "Wood Craft Décor " are the same business. */
export function normalizeBusinessName(name?: string): string {
  return (name || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // Letters, marks and digits of ANY script — a Telugu business name must not normalise to "".
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

const isUsableName = (n?: string) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "untitled";

const dayKey = (ms: number) => {
  if (!ms) return "undated";
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const newest = (list: GenerationLike[]) =>
  list.reduce((best, g) => (generationMillis(g) > generationMillis(best) ? g : best), list[0]);

/**
 * Builds the history.
 *
 *  - Generations made for a job are grouped by that job: one row, the newest generation, the job's
 *    name, status and id, and how many versions sit behind it.
 *  - A delivered job with no saved generation still gets a row (it was done — just not saved).
 *  - Generations made outside a job (the tool used directly) are grouped by person + business +
 *    kind + day, which collapses a generate-then-save pair into one row while keeping a different
 *    business, or the same one on another day, apart.
 */
export function buildGenerationHistory(
  generations: GenerationLike[],
  assignments: AssignmentLike[],
  resolveName?: (g: GenerationLike) => string,
): HistoryEntry[] {
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const assignmentBySavedGen = new Map(
    assignments.filter((a) => a.savedGenerationId).map((a) => [a.savedGenerationId as string, a]),
  );
  const nameOf = (g: GenerationLike) => (resolveName ? resolveName(g) : g.businessName || "Untitled");

  const byJob = new Map<string, GenerationLike[]>();
  const loose = new Map<string, GenerationLike[]>();

  for (const g of generations) {
    // A generation linked only through the job's `savedGenerationId` (older saves did not always
    // carry `workAssignmentId`) still belongs to that job.
    const jobId = g.workAssignmentId || (g.id ? assignmentBySavedGen.get(g.id)?.id : undefined);
    if (jobId) {
      const list = byJob.get(jobId);
      if (list) list.push(g); else byJob.set(jobId, [g]);
      continue;
    }
    const key = [g.userId || "", normalizeBusinessName(nameOf(g)), g.creationMode || "video", dayKey(generationMillis(g))].join("|");
    const list = loose.get(key);
    if (list) list.push(g); else loose.set(key, [g]);
  }

  const entries: HistoryEntry[] = [];

  for (const [jobId, list] of byJob) {
    const latest = newest(list);
    const a = assignmentById.get(jobId);
    const jobName = a ? (a.businessName || a.clientName || "") : "";
    const ms = generationMillis(latest);
    entries.push({
      key: `job:${jobId}`,
      generation: latest,
      userId: latest.userId || a?.assignedTo || "",
      businessName: isUsableName(jobName) ? jobName.trim() : nameOf(latest),
      businessType: (latest.businessType as string) || a?.category || "",
      creationMode: latest.creationMode,
      duration: Number(latest.duration) || 0,
      festivalName: latest.festivalName,
      timestampMs: ms,
      timestamp: latest.updatedAt || latest.createdAt,
      versions: list.length,
      assignmentId: jobId,
      uniqueId: a?.uniqueId,
      status: a?.status,
    });
  }

  for (const a of assignments) {
    if (byJob.has(a.id)) continue;
    if (a.status !== "completed" && a.status !== "verified") continue;
    const when = a.completedAt || a.assignedAt;
    entries.push({
      key: `job:${a.id}`,
      generation: null,
      userId: a.assignedTo || "",
      businessName: a.businessName || a.displayTitle || a.clientName || "Untitled",
      businessType: a.category || "",
      creationMode: a.category === "poster" ? "poster" : undefined,
      duration: parseInt(a.duration || "", 10) || 0,
      timestampMs: toMillis(when),
      timestamp: when,
      versions: 0,
      assignmentId: a.id,
      uniqueId: a.uniqueId,
      status: a.status,
    });
  }

  for (const [key, list] of loose) {
    const latest = newest(list);
    entries.push({
      key: `gen:${latest.id || key}`,
      generation: latest,
      userId: latest.userId || "",
      businessName: nameOf(latest),
      businessType: (latest.businessType as string) || "",
      creationMode: latest.creationMode,
      duration: Number(latest.duration) || 0,
      festivalName: latest.festivalName,
      timestampMs: generationMillis(latest),
      timestamp: latest.updatedAt || latest.createdAt,
      versions: list.length,
    });
  }

  return entries.sort((x, y) => y.timestampMs - x.timestampMs);
}
