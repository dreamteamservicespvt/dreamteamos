import { useState } from "react";
import {
  AlertTriangle, CalendarCheck, Check, CheckCircle2, ClipboardCheck, Clock, Loader2, Plus, Star,
  Trash2, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { addProbationReview, confirmEmployment, extendProbation, removeProbationReview } from "@/services/hr";
import type { Actor } from "@/services/hr";
import { probationEndDate, probationSchedule, todayIso } from "@/utils/hrPolicy";
import { MILESTONE_LABELS, REVIEW_CRITERIA, REVIEW_OUTCOME_LABELS } from "@/types/hr";
import type {
  EmployeeProfile, ProbationMilestone, ProbationReview, ReviewCriterionKey, ReviewOutcome,
} from "@/types/hr";
import { EmptyState, Input, SectionCard, Select, Textarea } from "./ui";

const OUTCOME_TONE: Record<ReviewOutcome, string> = {
  on_track: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  needs_improvement: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  at_risk: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

/**
 * Probation: the 30/60/90 schedule, what was actually reviewed against it, and the decision at
 * the end — confirm, extend, or conclude.
 *
 * Extending is a first-class outcome rather than a workaround, because the policy allows it and
 * an admin who has no button for it just leaves someone on probation indefinitely with nothing on
 * record saying why.
 */
export default function ProbationPanel({ profile, actor, readOnly, onIssueConfirmation, onIssueExtension }: {
  profile: EmployeeProfile;
  actor: Actor;
  readOnly?: boolean;
  /** Offered right after confirming, so the letter follows the decision instead of being forgotten. */
  onIssueConfirmation?: () => void;
  onIssueExtension?: () => void;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendTo, setExtendTo] = useState("");
  const [extendNote, setExtendNote] = useState("");

  const [milestone, setMilestone] = useState<ProbationMilestone>("day_30");
  const [reviewedOn, setReviewedOn] = useState(todayIso());
  const [scores, setScores] = useState<Partial<Record<ReviewCriterionKey, number>>>({});
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome>("on_track");

  const reviews = [...(profile.probationReviews || [])].sort((a, b) => b.reviewedOn.localeCompare(a.reviewedOn));
  const schedule = probationSchedule(profile);
  const endDate = probationEndDate(profile);
  const isIntern = profile.engagementType === "intern";

  const resetForm = () => {
    setMilestone("day_30"); setReviewedOn(todayIso()); setScores({});
    setStrengths(""); setImprovements(""); setOutcome("on_track");
  };

  const handleAdd = async () => {
    const given = Object.values(scores).filter((v): v is number => typeof v === "number");
    if (given.length === 0) {
      toast({ title: "Score at least one area", description: "A review with no rating says nothing.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const review: ProbationReview = {
        id: `${Date.now()}`,
        milestone,
        reviewedOn,
        reviewedById: actor.uid,
        reviewedByName: actor.name,
        scores,
        averageScore: Math.round((given.reduce((s, v) => s + v, 0) / given.length) * 10) / 10,
        strengths: strengths.trim() || null,
        improvements: improvements.trim() || null,
        outcome,
        createdAt: null,
      };
      await addProbationReview(profile, review, actor);
      toast({ title: "Review recorded", description: `${MILESTONE_LABELS[milestone]} saved.` });
      resetForm();
      setAdding(false);
    } catch {
      toast({ title: "Error", description: "Could not save the review.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    const { confirmed } = await confirm({
      title: "Confirm this employee?",
      description:
        "Their employment continues under the existing agreement — confirmation records that probation was completed successfully. The confirmed-employee notice period applies from today.",
      confirmText: "Confirm employment",
    });
    if (!confirmed) return;
    try {
      await confirmEmployment(profile, todayIso(), actor);
      toast({
        title: "Confirmed",
        description: "Now issue the confirmation letter so they have it in writing.",
      });
      onIssueConfirmation?.();
    } catch {
      toast({ title: "Error", description: "Could not confirm.", variant: "destructive" });
    }
  };

  const handleExtend = async () => {
    if (!extendTo) {
      toast({ title: "Pick a date", description: "An extension has to say when it ends.", variant: "destructive" });
      return;
    }
    try {
      await extendProbation(profile, extendTo, extendNote.trim(), actor);
      toast({ title: "Probation extended", description: `Now ends ${extendTo}. Issue the extension letter next.` });
      setExtendOpen(false);
      setExtendNote("");
      onIssueExtension?.();
    } catch {
      toast({ title: "Error", description: "Could not extend probation.", variant: "destructive" });
    }
  };

  const handleRemove = async (review: ProbationReview) => {
    const { confirmed } = await confirm({
      title: "Delete this review?",
      description: `The ${MILESTONE_LABELS[review.milestone].toLowerCase()} from ${review.reviewedOn} will be removed.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    await removeProbationReview(profile, review.id, actor);
  };

  if (isIntern) {
    return (
      <SectionCard title="Probation" icon={<ClipboardCheck size={15} className="text-primary" />}>
        <EmptyState
          icon={<ClipboardCheck size={26} />}
          title="Not applicable to an internship"
          hint="An internship is a fixed-term engagement with its own terms — it does not end in confirmation. Record performance reviews as interim reviews if you need them."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}

      <SectionCard
        title="Probation"
        icon={<ClipboardCheck size={15} className="text-primary" />}
        action={!readOnly && !profile.confirmedOn ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setExtendOpen((v) => !v)} data-test="extend-probation"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
              <Clock size={13} /> Extend
            </button>
            <button onClick={handleConfirm} data-test="confirm-employment"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-semibold text-success-foreground hover:opacity-90">
              <CheckCircle2 size={13} /> Confirm employee
            </button>
          </div>
        ) : null}
      >
        {profile.confirmedOn ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            <p className="text-sm text-foreground">
              Confirmed on <b>{profile.confirmedOn}</b> — employment continues under the existing agreement.
            </p>
          </div>
        ) : profile.probationExtendedTo ? (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Clock size={15} className="shrink-0 text-amber-500" />
              Probation extended to <b>{profile.probationExtendedTo}</b>
            </p>
            {profile.probationExtensionNote && (
              <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{profile.probationExtensionNote}</p>
            )}
          </div>
        ) : null}

        {extendOpen && !readOnly && (
          <div className="mb-4 rounded-lg border border-border bg-background p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Extend probation to *" type="date" value={extendTo}
                onChange={(e) => setExtendTo(e.target.value)} data-test="extend-to" />
              <Input label="What must improve" value={extendNote} onChange={(e) => setExtendNote(e.target.value)} />
            </div>
            <button onClick={handleExtend}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Check size={13} /> Extend probation
            </button>
          </div>
        )}

        {/* 30 / 60 / 90 schedule */}
        <div className="grid gap-2 sm:grid-cols-3">
          {schedule.map((s) => (
            <div key={s.milestone}
              className={`rounded-lg border px-3 py-2.5 ${
                s.done ? "border-emerald-500/30 bg-emerald-500/5"
                  : s.overdue ? "border-rose-500/30 bg-rose-500/5"
                    : "border-dashed border-border"
              }`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                {s.done ? <CheckCircle2 size={12} className="text-emerald-500" />
                  : s.overdue ? <AlertTriangle size={12} className="text-rose-500" />
                    : <CalendarCheck size={12} className="text-muted-foreground" />}
                {MILESTONE_LABELS[s.milestone]}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {s.done ? "Recorded" : s.dueOn ? `Due ${s.dueOn}${s.overdue ? " · overdue" : ""}` : "Set a joining date"}
              </p>
            </div>
          ))}
        </div>
        {endDate && !profile.confirmedOn && (
          <p className="mt-2 text-[11px] text-muted-foreground">Probation ends {endDate}.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Performance reviews"
        icon={<Star size={15} className="text-primary" />}
        action={readOnly ? null : (
          <button onClick={() => setAdding((v) => !v)} data-test="add-review-btn"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            {adding ? <X size={13} /> : <Plus size={13} />} {adding ? "Cancel" : "Add review"}
          </button>
        )}
      >
        {adding && !readOnly && (
          <div className="mb-4 rounded-lg border border-border bg-background p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Review" value={milestone} onChange={(e) => setMilestone(e.target.value as ProbationMilestone)}>
                {(Object.keys(MILESTONE_LABELS) as ProbationMilestone[]).map((m) => (
                  <option key={m} value={m}>{MILESTONE_LABELS[m]}</option>
                ))}
              </Select>
              <Input label="Reviewed on" type="date" value={reviewedOn} onChange={(e) => setReviewedOn(e.target.value)} />
              <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as ReviewOutcome)} data-test="review-outcome">
                {(Object.keys(REVIEW_OUTCOME_LABELS) as ReviewOutcome[]).map((o) => (
                  <option key={o} value={o}>{REVIEW_OUTCOME_LABELS[o]}</option>
                ))}
              </Select>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {REVIEW_CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs text-foreground">{c.label}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setScores((p) => ({ ...p, [c.key]: n }))}
                        data-test={`score-${c.key}-${n}`}
                        className={`h-6 w-6 rounded text-[11px] font-semibold transition-colors ${
                          scores[c.key] === n
                            ? "bg-primary text-primary-foreground"
                            : "bg-accent text-muted-foreground hover:bg-accent/70"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Textarea label="Strengths" rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
              <Textarea label="What to improve" rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)} />
            </div>

            <button onClick={handleAdd} disabled={saving} data-test="review-submit"
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save review
            </button>
          </div>
        )}

        {reviews.length === 0 ? (
          <EmptyState icon={<Star size={26} />} title="No reviews recorded"
            hint="Evaluate attendance, discipline, work quality, productivity, communication, teamwork, learning and policy adherence." />
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{MILESTONE_LABELS[r.milestone]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${OUTCOME_TONE[r.outcome]}`}>
                    {REVIEW_OUTCOME_LABELS[r.outcome]}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {r.averageScore}/5
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {r.reviewedOn} · {r.reviewedByName}
                  </span>
                  {!readOnly && (
                    <button onClick={() => handleRemove(r)} title="Delete"
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {REVIEW_CRITERIA.filter((c) => typeof r.scores[c.key] === "number").map((c) => (
                    <span key={c.key} className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c.label} <b className="text-foreground">{r.scores[c.key]}</b>
                    </span>
                  ))}
                </div>
                {r.strengths && <p className="mt-2 text-xs text-muted-foreground"><b className="text-foreground">Strengths:</b> {r.strengths}</p>}
                {r.improvements && <p className="mt-1 text-xs text-muted-foreground"><b className="text-foreground">To improve:</b> {r.improvements}</p>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
