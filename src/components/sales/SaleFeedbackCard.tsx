/**
 * One delivered job, worked like a lead: where the follow-up call has got to, what the client said
 * about it, and the button that turns it into the next sale.
 *
 * ── Why this is not a separate "Feedback & Upsell" page ──────────────────────────────────────
 * Because it is the same job as the Clients page, and a second page would mean a second list of the
 * same customers going stale against the first. A delivered sale IS the thing you ring about; the
 * row it already has is where the call belongs.
 *
 * ── Why the upsell is gated on the feedback ──────────────────────────────────────────────────
 * Selling the next thing to somebody whose last ad you have not asked about is how a client who was
 * quietly unhappy gets pitched a ₹20,000 month. The gate is both ratings, not either: "the ad was
 * outstanding" and "nobody answered my calls for a week" are the two answers that most change what
 * to say next, and having heard only one of them is not being ready.
 *
 * The two ratings are deliberately about different people — the WORK is the tech team's, the
 * SERVICE is ours — which is why both are shown to the tech admin and the team leader, and why
 * neither of them can enter one. See `canRecordFeedback`.
 */
import { useEffect, useState } from "react";
import { Loader2, MessageSquarePlus, Sparkles, Star, UserCheck, Wrench } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { canRecordFeedback, saveSaleFeedback, type FeedbackPatch } from "@/services/saleFeedback";
import { bulkCategoryLabel } from "@/utils/serviceCatalog";
import { formatCurrency } from "@/utils/formatters";
import { CLIENT_FOLLOWUP_STATUSES, FEEDBACK_RATINGS, feedbackComplete } from "@/types";
import type { FeedbackRating, Order } from "@/types";
import { format } from "date-fns";

/** Warm for praise, cool for a complaint — readable before the words are. */
const RATING_TONE: Record<FeedbackRating, string> = {
  outstanding: "border-success bg-success/15 text-success",
  good: "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  not_bad: "border-warning bg-warning/15 text-warning",
  bad: "border-destructive bg-destructive/15 text-destructive",
};

function RatingRow({ label, icon, hint, value, disabled, onPick }: {
  label: string;
  icon: React.ReactNode;
  hint: string;
  value?: FeedbackRating | null;
  disabled: boolean;
  onPick: (r: FeedbackRating) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-medium text-foreground">
        {icon} {label}
        <span className="font-normal text-muted-foreground">— {hint}</span>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {FEEDBACK_RATINGS.map((r) => (
          <button
            key={r.key}
            type="button"
            disabled={disabled}
            data-test={`feedback-${label.toLowerCase()}-${r.key}`}
            onClick={() => onPick(r.key)}
            className={`h-7 rounded-md border text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              value === r.key
                ? RATING_TONE[r.key]
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SaleFeedbackCard({ order, onUpsell }: {
  order: Order;
  /**
   * Opens the ordinary sale form on this client. Absent for anyone who is not the seller — an
   * upsell claims the number to whoever starts it, so an admin pressing it would take the client
   * off the member who owns them.
   */
  onUpsell?: (order: Order) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const feedback = order.feedback || null;
  const mayEdit = canRecordFeedback(order, user);

  const [notes, setNotes] = useState(feedback?.notes || "");
  const [saving, setSaving] = useState(false);

  // The row is live — another screen (or the member's own phone) can move it while this is open —
  // so a note nobody is editing follows the document rather than freezing at first render.
  useEffect(() => { setNotes(feedback?.notes || ""); }, [feedback?.notes]);

  const save = async (patch: FeedbackPatch) => {
    if (!user) return;
    setSaving(true);
    const res = await saveSaleFeedback({
      order, patch,
      actor: { uid: user.uid, name: user.name, role: user.role },
    });
    setSaving(false);
    if (!res.ok) toast({ title: "Not saved", description: res.message, variant: "destructive" });
  };

  const ready = feedbackComplete(feedback);
  const deliveredAt = order.completedAt || order.verifiedAt;

  return (
    <div
      data-test="sale-feedback-card"
      data-ready={ready ? "yes" : "no"}
      className="space-y-2.5 rounded-lg border border-border bg-card p-3"
    >
      {/* What it was, and — the part nobody could see before — who did each half of it. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {bulkCategoryLabel(order.category, order.bulkAdType)}
            {order.packageKey && order.packageKey !== "custom" && (
              <span className="font-normal text-muted-foreground"> · {order.packageKey}</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <UserCheck size={9} /> Sold by <b className="text-foreground">{order.soldByName || "—"}</b>
            </span>
            {/*
              Who actually made it. It was on the tech side's screens and nowhere the seller could
              see, so "who do I thank" and "who do I ask about the re-edit" were questions that had
              to be asked in a group chat.
            */}
            <span className="inline-flex items-center gap-0.5">
              <Wrench size={9} /> Made by <b className="text-foreground">{order.assignedToName || "—"}</b>
            </span>
            {!!deliveredAt && (
              <span>
                Delivered {format(new Date((deliveredAt as { seconds: number }).seconds * 1000), "dd MMM yyyy")}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs font-medium text-primary">{formatCurrency(order.amount)}</span>
      </div>

      {/* Where the follow-up call has got to. The same shape as a lead's own status, because it is
          the same job — this row is worked, not merely read. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-test="feedback-status"
          disabled={!mayEdit || saving}
          value={feedback?.status || "not_contacted"}
          onChange={(e) => save({ status: e.target.value as never })}
          className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary disabled:opacity-60"
        >
          {CLIENT_FOLLOWUP_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {saving && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        {/* The customer's own stars, when they left any — a different voice from the one below,
            and worth seeing side by side before ringing them. */}
        {!!order.clientReview && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            title="What the client rated in their own chat"
          >
            <Star size={9} /> {order.clientReview.work}★ work · {order.clientReview.service}★ service
          </span>
        )}
      </div>

      <RatingRow
        label="Work" icon={<Sparkles size={11} className="text-primary" />}
        hint="the ad itself"
        value={feedback?.work} disabled={!mayEdit || saving}
        onPick={(r) => save({ work: r })}
      />
      <RatingRow
        label="Service" icon={<MessageSquarePlus size={11} className="text-primary" />}
        hint="how we dealt with them, and whether we kept our promises"
        value={feedback?.service} disabled={!mayEdit || saving}
        onPick={(r) => save({ service: r })}
      />

      <div>
        <label className="text-[10px] text-muted-foreground">Your notes</label>
        <textarea
          data-test="feedback-notes"
          value={notes}
          disabled={!mayEdit}
          onChange={(e) => setNotes(e.target.value)}
          // Saved on blur rather than on every keystroke: this is a phone, on a call, on a free
          // Firestore tier, and a write per character is a write per character.
          onBlur={() => { if ((feedback?.notes || "") !== notes) save({ notes }); }}
          maxLength={500}
          placeholder="What they actually said — anything worth knowing before the next call."
          className="mt-1 h-14 w-full resize-none rounded-md border border-border bg-background p-2 text-[11px] text-foreground outline-none focus:border-primary disabled:opacity-60"
        />
      </div>

      {/*
        The upsell, and the reason it is off.

        A disabled button with no explanation reads as broken, and the explanation is the whole
        point of the feature — so the sentence next to it says what is missing rather than that
        something is.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-[10px] text-muted-foreground">
          {!onUpsell
            ? "Only the member who sold this can upsell them."
            : ready
              ? "Feedback taken — sell them the next thing."
              : `Take the feedback first${feedback?.work ? " (service still missing)" : feedback?.service ? " (work still missing)" : ""}.`}
        </span>
        <button
          type="button"
          data-test="feedback-upsell"
          disabled={!onUpsell || !ready}
          onClick={() => onUpsell?.(order)}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Sparkles size={11} /> Upsell
        </button>
      </div>
    </div>
  );
}
