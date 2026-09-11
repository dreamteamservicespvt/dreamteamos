import { useEffect, useRef, useState } from "react";
import { MessageCircle, Copy, Check, Loader2 } from "lucide-react";
import { getWhatsAppUrl } from "@/utils/phone";

/**
 * Share an assignment's requirements with the member on WhatsApp.
 *
 * Deliberately reachable from the member's assignment list, not only from the moment of creation:
 * the message is rebuilt from the saved assignment, so it can be re-sent whenever it's needed.
 */
export default function RequirementsShareModal({ memberName, phone, message, loading = false, onClose }: {
  memberName: string;
  phone?: string;
  message: string;
  /** The client's brief is still being read from the order — the message will fill in. */
  loading?: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);
  /**
   * Follows the message until the admin types in the box. For a job assigned before the business
   * info was carried onto it, that text arrives a moment later from the order — without this the
   * box would keep the first, incomplete version. Once somebody edits it, it is theirs.
   */
  const edited = useRef(false);
  useEffect(() => {
    if (!edited.current) setText(message);
  }, [message]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold text-foreground">Share ad requirements</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          For <b>{memberName}</b>. Copy or send this so they generate exactly what was configured.
        </p>
        {loading && (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Adding the business info from the sale…
          </p>
        )}
        <textarea
          value={text}
          data-test="requirements-text"
          onChange={(e) => { edited.current = true; setText(e.target.value); }}
          rows={9}
          className="mb-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm leading-relaxed text-foreground"
        />
        {!phone && (
          <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600">
            This member has no phone number saved — you can still copy the message.
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-border bg-background py-2 text-sm font-medium text-foreground hover:bg-accent">
            Done
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-sm font-semibold text-foreground hover:bg-accent">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
          </button>
          <button
            disabled={!phone}
            onClick={() => { window.open(getWhatsAppUrl(phone!, text), "_blank"); onClose(); }}
            className="inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
