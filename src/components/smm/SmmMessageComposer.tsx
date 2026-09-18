/**
 * The one door every message to a social-media client goes through.
 *
 * ── Why one composer and not a Send button per feature ────────────────────────────────────────
 * Five places produce a message — an approval request, a day's ad figures, the monthly report, the
 * renewal ask, a note about extra work — and every one of them needs the same three things
 * afterwards: a chance to edit the wording before it goes, a choice of where it goes, and the
 * option to keep it for next time. Built into each feature separately, that is five half-versions
 * of the same screen, and the one that skips the edit step is the one that sends a client a message
 * with a placeholder still in it.
 *
 * ── Why the message can go to the chat as well as to WhatsApp ─────────────────────────────────
 * Every sold order already has a client chat, keyed on the order — which is this campaign's own id.
 * A monthly report sent there is still readable in three months; the same report on WhatsApp is
 * twelve hundred messages up. WhatsApp is still offered first, because it is where the client
 * actually looks.
 */
import { useEffect, useState } from "react";
import { X, Copy, Check, MessageCircle, Send, Save, Loader2, BookMarked } from "lucide-react";
import { db } from "@/services/firebase";
import { sendOrderChatMessage, senderRoleOf } from "@/services/orderChat";
import { fetchTemplates, saveTemplate } from "@/services/smmTemplates";
import { useToast } from "@/hooks/use-toast";
import { getWhatsAppUrl } from "@/utils/phone";
import { renderTemplate } from "@/utils/smmMessages";
import { SMM_TEMPLATE_KINDS, type SmmCampaign, type SmmTemplate, type SmmTemplateKind } from "@/types/smm";
import type { AppUser } from "@/types";

export default function SmmMessageComposer({ campaign, initialText, kind = "custom", user, onClose }: {
  campaign: SmmCampaign;
  initialText: string;
  kind?: SmmTemplateKind;
  user: Pick<AppUser, "uid" | "name" | "role">;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [templates, setTemplates] = useState<SmmTemplate[]>([]);
  const [saveTitle, setSaveTitle] = useState("");
  const [showSave, setShowSave] = useState(false);

  useEffect(() => { fetchTemplates().then(setTemplates); }, []);

  /** The handful of names a saved template may use, filled from this campaign. */
  const tokens = {
    client: campaign.clientName || campaign.businessName,
    business: campaign.businessName,
    month: campaign.cycle?.month || "",
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it by hand.", variant: "destructive" });
    }
  };

  const toChat = async () => {
    setBusy("chat");
    try {
      await sendOrderChatMessage(db, {
        // The campaign's id IS the order's id, which is the chat's id for sold work — see
        // utils/orderChatId. Nothing to look up.
        chatId: campaign.id,
        senderId: user.uid,
        senderName: user.name,
        senderRole: senderRoleOf(user.role),
        text,
      });
      toast({ title: "Sent to the client's chat" });
      onClose();
    } catch (err) {
      toast({
        title: "Not sent",
        description: err instanceof Error ? err.message : "Try WhatsApp instead.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const keep = async () => {
    if (!saveTitle.trim()) { toast({ title: "Name it", description: "Give the template a short name." }); return; }
    setBusy("save");
    try {
      await saveTemplate({
        kind,
        title: saveTitle.trim(),
        body: text,
        createdBy: user.uid,
        createdByName: user.name,
      });
      setShowSave(false);
      setSaveTitle("");
      setTemplates(await fetchTemplates());
      toast({ title: "Saved for the team" });
    } catch {
      toast({ title: "Not saved", description: "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const mine = templates.filter((t) => t.kind === kind || kind === "custom");

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        data-test="smm-composer"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">Message to {campaign.clientName || campaign.businessName}</h3>
            <p className="text-xs text-muted-foreground">Read it through before it goes.</p>
          </div>
          <button onClick={onClose} data-test="smm-composer-close" aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {mine.length > 0 && (
          <div className="mb-2">
            <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <BookMarked size={11} /> Saved wording
            </label>
            <select
              data-test="smm-template-pick"
              defaultValue=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) setText(renderTemplate(t.body, tokens));
              }}
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">Use the message below</option>
              {mine.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {SMM_TEMPLATE_KINDS.find((k) => k.key === t.kind)?.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <textarea
          value={text}
          data-test="smm-message-text"
          rows={12}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary"
        />

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            onClick={copy}
            data-test="smm-message-copy"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={getWhatsAppUrl(campaign.clientPhone, text)}
            target="_blank"
            rel="noreferrer"
            data-test="smm-message-whatsapp"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-2.5 text-xs font-medium text-white hover:bg-success/90"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
          <button
            onClick={toChat}
            disabled={!!busy}
            data-test="smm-message-chat"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {busy === "chat" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Client chat
          </button>
          <button
            onClick={() => setShowSave((v) => !v)}
            data-test="smm-message-keep"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Save size={13} /> Keep
          </button>
        </div>

        {showSave && (
          <div className="mt-2 flex gap-2">
            <input
              value={saveTitle}
              data-test="smm-template-title"
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Name this wording, e.g. 'Friendly report'"
              className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              onClick={keep}
              disabled={busy === "save"}
              data-test="smm-template-save"
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
