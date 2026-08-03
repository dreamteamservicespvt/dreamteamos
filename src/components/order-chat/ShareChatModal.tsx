/**
 * Handing the chat to the client.
 *
 * Replaces "create a WhatsApp group, add the client, add the member": one tap sends the customer a
 * link and the code they already have on the job. The message is editable because the person
 * sending it knows their client and may want to say it differently — and copyable, because plenty
 * of clients are reached somewhere other than WhatsApp.
 */
import { useState } from "react";
import { MessageCircle, Copy, Check, ExternalLink, KeyRound } from "lucide-react";
import { getWhatsAppUrl } from "@/utils/phone";
import { buildClientChatMessage, orderChatLink } from "@/services/orderChat";

interface Props {
  chatId: string;
  accessCode: string;
  businessName?: string;
  uniqueId?: string;
  /** What was ordered. The message names the work, never the member making it. */
  category?: string;
  /** The client's WhatsApp number, from the assignment. */
  clientPhone?: string;
  onOpenChat?: () => void;
  onClose: () => void;
}

export default function ShareChatModal({
  chatId, accessCode, businessName, uniqueId, category, clientPhone, onOpenChat, onClose,
}: Props) {
  const [message, setMessage] = useState(() =>
    buildClientChatMessage({ businessName, uniqueId, chatId, accessCode, category }));
  const [copied, setCopied] = useState<"message" | "link" | null>(null);

  const copy = (what: "message" | "link") => {
    navigator.clipboard.writeText(what === "message" ? message : orderChatLink(chatId));
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold text-foreground">Chat with client</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Send this to <b>{businessName || "the client"}</b>. They open the link, enter the code, and
          can message or call the team — no app and no phone numbers shared.
        </p>

        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Code</span>
            <code className="font-mono text-base font-bold tracking-widest text-foreground">{accessCode}</code>
          </div>
          <button onClick={() => copy("link")}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {copied === "link" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied === "link" ? "Copied" : "Link"}
          </button>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={10}
          className="mb-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        />

        {!clientPhone && (
          <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600">
            No client number saved on this job — copy the message and send it however you reach them.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-border bg-background py-2 text-sm font-medium text-foreground hover:bg-accent">
            Done
          </button>
          {onOpenChat && (
            <button onClick={() => { onOpenChat(); onClose(); }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-sm font-semibold text-foreground hover:bg-accent">
              <ExternalLink className="h-4 w-4" /> Open
            </button>
          )}
          <button onClick={() => copy("message")}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-sm font-semibold text-foreground hover:bg-accent">
            {copied === "message" ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied === "message" ? "Copied" : "Copy"}
          </button>
          <button
            disabled={!clientPhone}
            onClick={() => { window.open(getWhatsAppUrl(clientPhone!, message), "_blank"); }}
            className="inline-flex flex-[1.6] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
