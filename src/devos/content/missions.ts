/**
 * Team missions (FR-045): one shared objective per track per season, split into DISTINCT contributions — analyst,
 * designer, tester, reviewer — each a practical task with its own evidence and rubric. The team's reward is tied to
 * graded contributions and the outcome measure, never to a count of submissions.
 */
import type { DimensionId, EvidenceRequirement, RubricCriterion, TrackId } from "../core/types.js";

export interface MissionRole {
  role: string;
  dims: DimensionId[];
  brief: string;
  evidence: EvidenceRequirement[];
}

export interface MissionDef {
  id: string;
  track: TrackId;
  title: string;
  objective: string;
  outcomeMeasure: string;
  roles: MissionRole[];
}

export const MISSION_CRITERIA: RubricCriterion[] = [
  { id: "evidence", label: "Real evidence", weight: 30, anchors: { 0: "No data or invented numbers", 2: "Some real data", 4: "Real, specific numbers and examples" }, critical: true },
  { id: "quality", label: "Quality of the contribution", weight: 30, anchors: { 0: "Off-task or careless", 2: "Useful but thin", 4: "Thorough and directly useful to the team" } },
  { id: "objective", label: "Moves the team objective", weight: 20, anchors: { 0: "Unrelated to the objective", 2: "Partly related", 4: "Clearly moves the shared objective" } },
  { id: "handoff", label: "Clear hand-off", weight: 20, anchors: { 0: "Others could not use it", 2: "Usable with questions", 4: "A teammate can act on it straight away" } },
];

const T = (id: string, label: string): EvidenceRequirement => ({ id, kind: "text", label, required: true });
const N = (id: string, label: string): EvidenceRequirement => ({ id, kind: "number", label, required: true });

function roles(focus: string, measure: string): MissionRole[] {
  return [
    { role: "Analyst", dims: ["critical", "cognitive"], brief: `Collect last week's real numbers on ${focus} and find the two biggest causes. Share them with the team by mid-week.`, evidence: [T("numbers", "The numbers you collected (and where from)"), T("causes", "The two biggest causes, with evidence")] },
    { role: "Designer", dims: ["creativity", "problem"], brief: `Using the Analyst's findings, design one concrete change to improve ${focus}. Make it simple enough for everyone to try.`, evidence: [T("change", "The change, step by step"), T("why", "Why it should work (link it to the causes)")] },
    { role: "Tester", dims: ["execution", "learning"], brief: `Try the Designer's change on your own real work for at least 3 days and measure ${measure}.`, evidence: [T("tried", "What you did, day by day"), N("before", `${measure} before`), N("after", `${measure} after`)] },
    { role: "Reviewer", dims: ["decision", "communication"], brief: "Compare the before / after numbers, decide whether the team should keep the change, and write a 5-line note for everyone.", evidence: [T("compare", "The comparison"), T("decision", "Keep, change or drop — and why"), T("note", "Your 5-line note to the team")] },
  ];
}

export const MISSIONS: readonly MissionDef[] = [
  { id: "sales_first_call", track: "sales", title: "Faster first call", objective: "Call every new interested lead sooner.", outcomeMeasure: "Average hours from a lead's interest to the first call", roles: roles("the time from a lead showing interest to our first call", "average hours to the first call") },
  { id: "sales_renewal_rescue", track: "sales", title: "Renewal rescue", objective: "Renew more of this season's social-media clients.", outcomeMeasure: "Renewal rate of the clients due this season", roles: roles("social-media renewals", "renewals won out of clients due") },
  { id: "tech_zero_rerender", track: "technical", title: "Zero re-render week", objective: "Stop re-rendering clips because of mistakes found late.", outcomeMeasure: "Re-renders per delivered video", roles: roles("re-rendered clips", "re-renders per video") },
  { id: "tech_poster_speed", track: "technical", title: "Poster speed-up", objective: "Make festival posters faster without losing quality.", outcomeMeasure: "Average minutes per approved poster", roles: roles("time per festival poster", "minutes per approved poster") },
  { id: "admin_invoice_day", track: "admin", title: "Invoice within a day", objective: "Send every invoice within one working day of the sale.", outcomeMeasure: "Share of invoices sent within one working day", roles: roles("invoice turnaround", "invoices sent within one day (count)") },
  { id: "admin_clean_payroll", track: "admin", title: "Clean payroll", objective: "No attendance corrections after the payroll cut-off.", outcomeMeasure: "Corrections that arrived after the cut-off", roles: roles("late attendance corrections", "late corrections") },
];

export function missionFor(track: TrackId, seasonIndex: number): MissionDef {
  const list = MISSIONS.filter((m) => m.track === track);
  return list[Math.abs(seasonIndex) % list.length];
}
