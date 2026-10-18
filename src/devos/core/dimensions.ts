/**
 * The official ten-dimension framework (MSRS §6) and the three role tracks (MSRS §7), word for word where the
 * specification gives words. Fixed in v1: no extra top-level dimension, no renaming (MSRS §6, FR-014).
 *
 * Every track develops the SAME ten dimensions with different scenarios — `TRACK_OBJECTIVES` is the per-track
 * learning objective the Director and the AI generator aim at, and what the learner reads under each dimension.
 */
import type { DimensionId, TrackId } from "./types.js";

export interface DimensionDef {
  id: DimensionId;
  no: number;
  name: string;
  short: string;
  /** What it measures (MSRS §6). */
  measures: string;
  /** Example assessment (MSRS §6). */
  example: string;
  /** What the item mix leans on for this dimension (open answers need an AI grader). */
  leansOpen: boolean;
}

export const DIMENSIONS: readonly DimensionDef[] = [
  { id: "cognitive", no: 1, name: "Cognitive Ability", short: "Cognitive", leansOpen: false,
    measures: "How quickly and accurately a person understands and processes information.",
    example: "Explain a new concept and apply it to a novel situation." },
  { id: "logical", no: 2, name: "Logical Reasoning", short: "Logic", leansOpen: false,
    measures: "Ability to identify patterns and draw logical conclusions.",
    example: "Solve a logic puzzle or infer what follows from a set of facts." },
  { id: "learning", no: 3, name: "Learning Agility", short: "Learning", leansOpen: false,
    measures: "How quickly a person learns unfamiliar skills and transfers learning.",
    example: "Teach an unfamiliar tool or method and assess use on a new task." },
  { id: "critical", no: 4, name: "Critical Thinking", short: "Critical", leansOpen: false,
    measures: "Ability to evaluate information, assumptions, claims, and evidence.",
    example: "Critique a campaign, vendor claim, report, or proposed solution." },
  { id: "problem", no: 5, name: "Problem-Solving", short: "Problems", leansOpen: false,
    measures: "Ability to identify root causes and develop effective solutions.",
    example: "Investigate a realistic business or workflow failure and propose a fix." },
  { id: "creativity", no: 6, name: "Creativity & Innovation", short: "Creativity", leansOpen: true,
    measures: "Ability to generate original, useful, relevant alternatives.",
    example: "Develop multiple distinct concepts or improve a process under constraints." },
  { id: "decision", no: 7, name: "Decision-Making", short: "Decisions", leansOpen: false,
    measures: "Ability to choose effectively under constraints, uncertainty, and trade-offs.",
    example: "Choose a response when time, cost, quality, risk, and resources conflict." },
  { id: "communication", no: 8, name: "Communication", short: "Communication", leansOpen: true,
    measures: "Ability to explain ideas clearly and understand what others need.",
    example: "Explain a solution to a non-specialist and respond to clarifying questions." },
  { id: "emotional", no: 9, name: "Emotional Intelligence", short: "EQ", leansOpen: true,
    measures: "Ability to interpret social context, manage reactions, and work constructively with people.",
    example: "Respond to a frustrated customer or disagreement using a structured scenario." },
  { id: "execution", no: 10, name: "Execution & Adaptability", short: "Execution", leansOpen: false,
    measures: "Ability to turn plans into results and adjust when requirements change.",
    example: "Complete a task to a standard and adapt to a change in requirements." },
];

export const DIMENSION_IDS: readonly DimensionId[] = DIMENSIONS.map((d) => d.id);

export const DIMENSION_BY_ID: Readonly<Record<DimensionId, DimensionDef>> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.id, d]),
) as Record<DimensionId, DimensionDef>;

export const dimensionName = (id: DimensionId): string => DIMENSION_BY_ID[id]?.name ?? id;

export interface TrackDef {
  id: TrackId;
  name: string;
  purpose: string;
}

export const TRACKS: readonly TrackDef[] = [
  { id: "sales", name: "Sales",
    purpose: "Understand customers, qualify leads, communicate value, handle objections, prioritize follow-ups, make trade-offs, and turn sound decisions into measurable sales execution." },
  { id: "technical", name: "Technical",
    purpose: "Understand and use technology, AI tools and software, investigate issues, make technical decisions and improve workflows. Not coding by default — coding only when the job requires it." },
  { id: "admin", name: "Admin & Operations",
    purpose: "Planning, interpreting information, process management, coordination, prioritization, reporting, risk awareness and execution across business operations." },
];

export const TRACK_BY_ID: Readonly<Record<TrackId, TrackDef>> = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<TrackId, TrackDef>;

export const trackName = (id: TrackId): string => TRACK_BY_ID[id]?.name ?? id;

/** MSRS §7.1–7.3, one objective per dimension per track. */
export const TRACK_OBJECTIVES: Readonly<Record<TrackId, Record<DimensionId, string>>> = {
  sales: {
    cognitive: "Extract key customer needs from a brief or conversation summary.",
    logical: "Analyse funnel data and identify which conclusions the numbers support.",
    learning: "Learn a new qualification or follow-up framework and apply it to an unseen prospect.",
    critical: "Challenge assumptions about why a prospect did not convert.",
    problem: "Diagnose lead leakage using evidence such as response time, qualification, and objections.",
    creativity: "Propose distinct value propositions or outreach approaches without inventing offers.",
    decision: "Prioritize prospects under limited time and explain trade-offs.",
    communication: "Explain value clearly and respond appropriately to simulated objections.",
    emotional: "Respond constructively to frustration, hesitation, or disagreement in a scenario.",
    execution: "Complete a follow-up plan, respect deadlines, and adapt to changed lead information.",
  },
  technical: {
    cognitive: "Learn a new software tool from instructions and complete a novel task.",
    logical: "Diagnose a process failure from the order of steps and the available evidence.",
    learning: "Learn an unfamiliar AI, CRM, networking, project-management, or productivity tool.",
    critical: "Compare software products and identify unsupported vendor claims.",
    problem: "Investigate a slow website, connectivity issue, access problem, or broken workflow using evidence.",
    creativity: "Design a more efficient workflow with existing software, AI tools, or no-code automation.",
    decision: "Compare options across cost, usability, security, reliability, and delivery time.",
    communication: "Explain a technical issue and resolution to a non-technical colleague or customer.",
    emotional: "Respond calmly and constructively when a customer or teammate is frustrated by a technical issue.",
    execution: "Configure a tool in an approved environment, test the result, document steps, and adapt to changed requirements.",
  },
  admin: {
    cognitive: "Interpret an unfamiliar report and summarize the important information.",
    logical: "Detect inconsistencies in schedules, resource plans, or operational data.",
    learning: "Learn a new business workflow or management application and use it correctly.",
    critical: "Separate facts from assumptions in a proposed policy or management update.",
    problem: "Identify root causes of repeated delays, errors, or hand-off failures.",
    creativity: "Redesign a process to reduce effort or prevent mistakes.",
    decision: "Allocate limited resources and document trade-offs and risks.",
    communication: "Communicate instructions, decisions, and status unambiguously.",
    emotional: "Resolve workplace misunderstandings and respond constructively to difficult conversations.",
    execution: "Complete an operational task on time and update the plan when a requirement changes.",
  },
};

/** The six ranks, in order (FR-035). Labels are configurable in the policy; these are the defaults. */
export const RANK_LABELS = ["Basic", "Intermediate", "Advanced", "Pro", "Pro Max", "Ultra Pro Max"] as const;

/** The MSRS §1.3 disclaimer, shown wherever scores are shown (AC-030). */
export const MEASUREMENT_DISCLAIMER =
  "Scores are estimates of demonstrated performance on defined tasks. They are not an IQ score, a medical or psychological diagnosis, or a measure of a person's worth or potential, and are never the sole basis for an employment decision.";
