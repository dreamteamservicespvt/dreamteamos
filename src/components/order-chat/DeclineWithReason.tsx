/**
 * Turning down a call, and saying why.
 *
 * ── Why a bare decline was the wrong answer ───────────────────────────────────────────────────
 * A red button that just stops the ringing tells the person on the other end nothing, and what
 * they conclude is "they saw me calling and hung up on me". For a customer that is the last
 * impression of the company they take away from the day; for a member being rung by a client
 * mid-render it is an accusation they cannot answer.
 *
 * So a decline sends a sentence. It is written for the recipient rather than logged for the
 * sender — every option is a promise or a fact the other side can act on, and none of them is
 * "declined". Typing is optional and one tap is always enough, because this appears while a phone
 * is ringing and nobody composes prose at that moment.
 *
 * Used by both sides. The member's reasons and the customer's reasons differ, so the caller says
 * which set to show.
 */
import { useState } from "react";
import { X } from "lucide-react";

export interface DeclineReason {
  /** What the other side is told, verbatim. */
  message: string;
}

const TEAM_REASONS = [
  "Busy right now — I'll call you back shortly.",
  "In a meeting. Please send a message and I'll reply.",
  "Can't talk at the moment — I'll ring you in a few minutes.",
  "Please send your details as a message and I'll get straight on it.",
];

const CLIENT_REASONS = [
  "Can't talk right now — please send a message.",
  "Busy at the moment. I'll call you back.",
  "Please call me a little later.",
];

export default function DeclineWithReason({ side, onCancel, onDecline }: {
  /** Whose vocabulary to use — "team" is a member declining, "client" is the customer. */
  side: "team" | "client";
  onCancel: () => void;
  onDecline: (reason: DeclineReason) => void;
}) {
  const [custom, setCustom] = useState("");
  const reasons = side === "team" ? TEAM_REASONS : CLIENT_REASONS;

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-black/60 sm:items-center sm:justify-center"
      onClick={onCancel} data-test="decline-reason">
      <div
        className="w-full rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-slate-800 shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-4 dark:bg-[#202c33] dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-base font-semibold">Can't take the call?</p>
          <button onClick={onCancel} aria-label="Back"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-[12.5px] text-slate-500 dark:text-slate-400">
          Pick a reason and they'll see it in the chat straight away.
        </p>

        <div className="space-y-1.5">
          {reasons.map((r) => (
            <button
              key={r}
              onClick={() => onDecline({ message: r })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-[13.5px] leading-snug transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:border-white/10 dark:hover:border-emerald-500 dark:hover:bg-white/5"
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={1}
            placeholder="Or type your own reason"
            className="max-h-24 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-[#2a3942] dark:text-slate-100"
          />
          <button
            onClick={() => onDecline({ message: custom.trim() || "Can't take the call right now." })}
            data-test="decline-send"
            className="h-[42px] shrink-0 rounded-xl bg-rose-600 px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
