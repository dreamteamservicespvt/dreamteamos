/**
 * The technical career ladder: the roles, what each one pays, and what follows what.
 *
 * Three facts travel together for every rung — the title, the starting salary and the notice
 * period — because they are decided together and were previously typed separately into three
 * boxes. That is how a company ends up with two Associate engineers on different money and a
 * Senior on a fortnight's notice.
 *
 * Every figure here is a **starting point**, not a rule. Picking a role fills the salary and the
 * notice period in, and an admin is free to change either afterwards: people are hired above and
 * below the band, and the letter must print what was actually agreed.
 *
 * Pure — no React, no Firestore.
 */
import type { Department, EmployeeProfile } from "@/types/hr";

export interface LadderRole {
  title: string;
  /** Gross monthly salary this rung starts at, in rupees. */
  monthlySalary: number;
  /** Notice period the rung carries once confirmed. Seniority costs the company more to replace. */
  noticeDays: number;
  /** True for a rung the notice ladder treats as a critical senior role. */
  senior: boolean;
}

/**
 * The technical ladder, lowest rung first.
 *
 * Order is load-bearing: it is what "the next role up" means, and what the promotion letter reads
 * to work out where somebody is going.
 */
export const TECH_ROLE_LADDER: LadderRole[] = [
  { title: "Associate AI Software Engineer", monthlySalary: 5000, noticeDays: 15, senior: false },
  { title: "AI Software Engineer", monthlySalary: 10000, noticeDays: 30, senior: false },
  { title: "Senior AI Software Engineer", monthlySalary: 15000, noticeDays: 45, senior: true },
];

/** Which ladder applies to a department. Sales has no fixed rungs yet, so it stays free text. */
export function ladderFor(department?: Department | null): LadderRole[] {
  return department === "tech" ? TECH_ROLE_LADDER : [];
}

/** The rung a title sits on, or null for a designation that is not on the ladder at all. */
export function roleByTitle(title?: string | null, department: Department = "tech"): LadderRole | null {
  const wanted = (title || "").trim().toLowerCase();
  if (!wanted) return null;
  return ladderFor(department).find((r) => r.title.toLowerCase() === wanted) || null;
}

/**
 * The next rung up, or null at the top — and null for a title off the ladder, because there is no
 * honest answer to "what comes after" a role nobody has placed.
 */
export function nextRole(title?: string | null, department: Department = "tech"): LadderRole | null {
  const ladder = ladderFor(department);
  const idx = ladder.findIndex((r) => r.title.toLowerCase() === (title || "").trim().toLowerCase());
  return idx >= 0 && idx < ladder.length - 1 ? ladder[idx + 1] : null;
}

/**
 * The terms that come with a rung, ready to merge into a form.
 *
 * The notice period is written as this person's own override rather than left to the stage-based
 * policy, because on this ladder the role IS the reason — a Senior engineer's month and a half is
 * a fact about the job, not about how long they have been in it.
 */
export function termsForRole(role: LadderRole): Partial<EmployeeProfile> {
  return {
    designation: role.title,
    ctcMonthly: role.monthlySalary,
    noticeDaysOverride: role.noticeDays,
    seniorRole: role.senior,
  };
}
