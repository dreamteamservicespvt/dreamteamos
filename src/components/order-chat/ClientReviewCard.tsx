/**
 * What the customer sees once their ad has been delivered.
 *
 * Two things, in the order they matter to a business that has just been handed something it paid
 * for: tell us how it went, and — while you are pleased — here is how to order the next one.
 *
 * ── Why both scores start at five ─────────────────────────────────────────────────────────────
 * Because most deliveries are fine, and the alternative is worse than it looks. An empty rating
 * asks a customer to do arithmetic about a company they have thought about for ten minutes, and
 * the commonest answer to that is to close the tab — so the feature collects nothing, from anyone,
 * including the unhappy people it exists to catch. Pre-set to five, submitting is one tap for a
 * happy customer and dragging a star down is a deliberate act by an unhappy one. The scores that
 * come back mean something precisely because lowering one took effort.
 *
 * ── Why the comment box only appears on a low score ───────────────────────────────────────────
 * "Any other feedback?" under a five-star rating is a box nobody fills in. Under a three it is the
 * only question worth asking, and it is asked at the one moment the reason is still in their head.
 *
 * ── Why it stays editable ─────────────────────────────────────────────────────────────────────
 * A customer who rates an ad three because a file would not open, and then finds it opens fine,
 * has no way to take that back — and a review nobody can correct is a review the team learns to
 * dismiss. Editing writes over the same record; there is one verdict per ad, not a history of moods.
 */
import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Pencil, Send, Star } from "lucide-react";
import { fetchEnquiryTarget, submitClientReview, type EnquiryTarget } from "@/services/orderChatGuest";
import type { ClientReview } from "@/types/orderChat";

/** One row of five stars. Tapping a star sets the score to it — no half stars, no clearing to zero. */
function StarRow({ label, hint, value, onChange, testId }: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-slate-800">{label}</p>
      <p className="mb-1.5 text-[11.5px] leading-snug text-slate-500">{hint}</p>
      <div className="flex items-center gap-1" data-test={testId}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} out of 5 for ${label}`}
            aria-pressed={value === n}
            data-test={`${testId}-${n}`}
            className="p-0.5 transition-transform active:scale-90"
          >
            <Star
              className={`h-7 w-7 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
            />
          </button>
        ))}
        <span className="ml-1 text-[12px] font-semibold text-slate-500">{value}/5</span>
      </div>
    </div>
  );
}

/** Read-only stars, for the summary shown after submitting. */
function StarsRead({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

export interface ClientReviewCardProps {
  chatId: string;
  /** What they already told us, when they have been here before. */
  review?: ClientReview | null;
  /** The business, for the enquiry message. */
  businessName?: string;
  /** The job id, so an enquiry can be tied back to what they already bought. */
  uniqueId?: string;
}

export default function ClientReviewCard({ chatId, review, businessName, uniqueId }: ClientReviewCardProps) {
  const [editing, setEditing] = useState(!review);
  const [work, setWork] = useState(review?.work ?? 5);
  const [service, setService] = useState(review?.service ?? 5);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enquiry, setEnquiry] = useState<EnquiryTarget | null>(null);

  // The review can also arrive from the other side of the live listener — a second device, or the
  // server's mirror landing after the local write. Track it while they are not mid-edit.
  useEffect(() => {
    if (!review) return;
    setWork(review.work);
    setService(review.service);
    setComment(review.comment ?? "");
  }, [review?.work, review?.service, review?.comment]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    fetchEnquiryTarget(chatId).then((t) => { if (alive) setEnquiry(t); });
    return () => { alive = false; };
  }, [chatId]);

  const lowered = work < 5 || service < 5;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await submitClientReview(chatId, { work, service, comment: lowered ? comment : "" });
      setEditing(false);
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const enquiryUrl = enquiry?.phone
    ? `https://wa.me/${enquiry.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
        [
          `Hi${enquiry.name ? ` ${enquiry.name}` : ""}! 👋`,
          "",
          `We're ${businessName || "a happy customer"}${uniqueId ? ` (${uniqueId})` : ""} — you delivered our last ad.`,
          "We'd like to enquire about another one.",
        ].join("\n"),
      )}`
    : null;

  return (
    <div
      data-test="client-review-card"
      className="border-t border-black/10 bg-white px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      {editing ? (
        <>
          <p className="text-[15px] font-semibold text-slate-900">How did we do?</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
            It takes one tap, and it is the only way we find out when something went wrong.
          </p>

          <div className="mt-3 space-y-3.5">
            <StarRow
              label="The ad itself"
              hint="Is it what you wanted — the look, the words, the quality?"
              value={work} onChange={setWork} testId="review-work"
            />
            <StarRow
              label="Working with us"
              hint="Replies, timing, being kept in the loop."
              value={service} onChange={setService} testId="review-service"
            />
          </div>

          {lowered && (
            <div className="mt-3">
              <label htmlFor="review-comment" className="text-[13px] font-semibold text-slate-800">
                What could we have done better?
              </label>
              <p className="mb-1.5 text-[11.5px] text-slate-500">
                It goes to the people who made your ad, not to a form.
              </p>
              <textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={500}
                data-test="review-comment"
                placeholder="Tell us what happened…"
                className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
              />
            </div>
          )}

          {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            data-test="review-submit"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? "Sending…" : review ? "Update my review" : "Submit"}
          </button>
        </>
      ) : (
        <div data-test="client-review-done">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-slate-900">Thank you — that's noted.</p>
              <div className="mt-1.5 space-y-1">
                <p className="flex items-center gap-2 text-[12.5px] text-slate-600">
                  <StarsRead value={work} /> The ad itself
                </p>
                <p className="flex items-center gap-2 text-[12.5px] text-slate-600">
                  <StarsRead value={service} /> Working with us
                </p>
              </div>
              {!!comment && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] italic text-slate-600">
                  “{comment}”
                </p>
              )}
            </div>
            <button
              onClick={() => setEditing(true)}
              data-test="review-edit"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
        </div>
      )}

      {/*
        The next sale, offered at the only moment it is ever this easy to ask for.

        Deliberately WhatsApp rather than a form: it opens a conversation with the person who sold
        them the last one, on the number they already have in their phone, and the reply lands
        somewhere that seller actually watches. A form would land in a queue.
      */}
      {enquiryUrl && (
        <a
          href={enquiryUrl}
          target="_blank"
          rel="noreferrer"
          data-test="review-enquiry"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <MessageCircle className="h-4 w-4" />
          Enquire about another ad
        </a>
      )}
    </div>
  );
}
