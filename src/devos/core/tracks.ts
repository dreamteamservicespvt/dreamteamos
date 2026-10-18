/**
 * Track assignment at onboarding (MSRS §7.4): the person says what their work actually involves; the answers and the
 * role suggest a track; the person confirms it (an admin can change it later, effective-dated — FR-005). A track
 * changes the training content only — never a permission (FR-002).
 */
import type { TrackId } from "./types.js";

export interface OnboardingQuestion {
  id: string;
  text: string;
  multi: boolean;
  options: { id: string; label: string; track?: TrackId; coding?: boolean }[];
}

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: "work",
    text: "What does most of your working day involve? (pick all that apply)",
    multi: true,
    options: [
      { id: "calls", label: "Calling or meeting clients to sell", track: "sales" },
      { id: "followups", label: "Following up leads and renewals", track: "sales" },
      { id: "ads", label: "Making ads, posters or videos with AI tools", track: "technical" },
      { id: "edit", label: "Editing videos and fixing technical problems", track: "technical" },
      { id: "social", label: "Running clients' social media pages", track: "technical" },
      { id: "plan", label: "Planning, scheduling and coordinating work", track: "admin" },
      { id: "records", label: "Accounts, invoices, payroll or HR records", track: "admin" },
      { id: "lead", label: "Leading a team" },
    ],
  },
  {
    id: "tools",
    text: "Which tools do you use most?",
    multi: true,
    options: [
      { id: "phone", label: "Phone and WhatsApp with clients", track: "sales" },
      { id: "ai", label: "Gemini, ChatGPT, Flow / Veo", track: "technical" },
      { id: "editor", label: "Video or image editors", track: "technical" },
      { id: "sheets", label: "Sheets, invoices, the payroll screens", track: "admin" },
    ],
  },
  {
    id: "coding",
    text: "Does your job require writing code?",
    multi: false,
    options: [
      { id: "no", label: "No (most people)", coding: false },
      { id: "yes", label: "Yes, coding is part of my job", coding: true },
    ],
  },
];

/** The suggested track: the most-chosen track in the answers; a tie goes to the role's default. */
export function suggestTrack(answers: Record<string, string[]>, roleDefault: TrackId): TrackId {
  const votes: Record<TrackId, number> = { sales: 0, technical: 0, admin: 0 };
  for (const q of ONBOARDING_QUESTIONS) {
    for (const id of answers[q.id] ?? []) {
      const opt = q.options.find((o) => o.id === id);
      if (opt?.track) votes[opt.track] += q.id === "work" ? 2 : 1;
    }
  }
  const best = Math.max(...Object.values(votes));
  if (best === 0) return roleDefault;
  const top = (Object.keys(votes) as TrackId[]).filter((t) => votes[t] === best);
  return top.includes(roleDefault) ? roleDefault : top[0];
}

export function codingFromAnswers(answers: Record<string, string[]>): boolean {
  return (answers.coding ?? []).includes("yes");
}

/** Only known question / option ids are kept (the answers are stored on the profile). */
export function cleanAnswers(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const q of ONBOARDING_QUESTIONS) {
    const v = (raw as Record<string, unknown>)[q.id];
    if (!Array.isArray(v)) continue;
    const ids = v.filter((x): x is string => typeof x === "string" && q.options.some((o) => o.id === x));
    out[q.id] = q.multi ? [...new Set(ids)] : ids.slice(0, 1);
  }
  return out;
}
