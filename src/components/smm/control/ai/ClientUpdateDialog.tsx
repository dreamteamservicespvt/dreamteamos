/**
 * SMM Delivery Control — the client's weekly WhatsApp update, drafted for the salesperson (2026-10-15, phase 5).
 *
 * ── How the draft is made ───────────────────────────────────────────────────────────────────────
 * The plain draft appears at once (`utils/smmAiRules.fallbackClientUpdate`: a greeting, what went live with its
 * links, what is coming and when, what we wait on the client for, a thank-you). The AI then writes a warmer
 * opening and closing in English or Telugu (`services/smmAi.clientWeeklyUpdate`); the lists between them stay
 * the code's, so no title, link or day can be wrong. A draft the person has started editing is never replaced
 * — switching the language starts a new draft in that language.
 *
 * Nothing is sent from here: Copy puts it on the clipboard, Open WhatsApp opens the client's chat with the
 * text filled in (`utils/phone.getWhatsAppUrl`, the app's one wa.me builder). The salesperson presses Send.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { getWhatsAppUrl } from "@/utils/phone";
import { fallbackClientUpdate, type ClientWeeklyUpdateInput } from "@/utils/smmAiRules";
import { AiTag } from "./aiShared";
import { loadSmmAi } from "./aiLoader";

export interface ClientUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ClientWeeklyUpdateInput;
  /** The client's number — Open WhatsApp needs it. */
  phone?: string | null;
}

type Lang = "en" | "te";

export default function ClientUpdateDialog({ open, onOpenChange, input, phone }: ClientUpdateDialogProps) {
  const [lang, setLang] = useState<Lang>(input?.language === "te" ? "te" : "en");
  const [text, setText] = useState(() => fallbackClientUpdate(input, lang));
  const [usedAi, setUsedAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const edited = useRef(false);
  const run = useRef(0);
  const latest = useRef(input);
  latest.current = input;

  const draft = async (language: Lang, fresh: boolean) => {
    const id = ++run.current;
    setLoading(true);
    setProblem(null);
    try {
      const ai = await loadSmmAi();
      const result = await ai.clientWeeklyUpdate({ ...latest.current, language }, { fresh });
      if (id !== run.current || edited.current) return;
      setText(result.text);
      setUsedAi(result.usedAi);
      setProblem(result.problem || null);
    } catch (err) {
      if (id === run.current) setProblem(err instanceof Error ? err.message : "The AI could not be reached.");
    } finally {
      if (id === run.current) setLoading(false);
    }
  };

  // Each time it opens, and on a language switch: the plain draft at once, then the AI's.
  useEffect(() => {
    if (!open) {
      run.current += 1;
      return;
    }
    edited.current = false;
    setText(fallbackClientUpdate(latest.current, lang));
    setUsedAi(false);
    setCopied(null);
    void draft(lang, false);
    // A new draft only when it opens or the language changes — never on a parent re-render.
  }, [open, lang]);

  const digits = (phone || "").replace(/\D/g, "");
  const waUrl = digits.length >= 10 ? getWhatsAppUrl(phone as string, text) : null;

  const copy = async () => {
    const ok = await copyText(text);
    setCopied(ok ? "ok" : "failed");
    if (ok) setTimeout(() => setCopied(null), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-test="smm-client-update" className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Weekly update for {input?.clientName || "the client"} <AiTag usedAi={usedAi} />
          </DialogTitle>
          <DialogDescription>A draft to send on WhatsApp — read it, change anything, then copy or open WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Language">
          {(["en", "te"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              data-test={`smm-client-update-lang-${l}`}
              onClick={() => setLang(l)}
              className={cn(
                "h-11 rounded-md border px-3 text-sm font-medium sm:h-9",
                lang === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              {l === "en" ? "English" : "తెలుగు"}
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              edited.current = false;
              void draft(lang, true);
            }}
            disabled={loading}
            data-test="smm-client-update-again"
            className="h-11 gap-1.5 sm:h-9"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {loading ? "Writing…" : "Write again"}
          </Button>
        </div>

        <Textarea
          value={text}
          onChange={(e) => {
            edited.current = true;
            setText(e.target.value);
          }}
          rows={12}
          aria-label="Message draft"
          data-test="smm-client-update-text"
          className="min-h-[220px] flex-1 overflow-y-auto text-sm"
        />
        {problem && !usedAi && <p data-test="smm-client-update-problem" className="text-xs text-muted-foreground">Plain draft — {problem}</p>}
        {copied === "failed" && <p className="text-xs text-viz-late">Couldn't copy — select the text and copy it by hand.</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={copy} data-test="smm-client-update-copy" className="h-11 gap-1.5 sm:h-10">
            {copied === "ok" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied === "ok" ? "Copied" : "Copy"}
          </Button>
          {waUrl ? (
            <Button asChild className="h-11 gap-1.5 sm:h-10" data-test="smm-client-update-whatsapp">
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" aria-hidden /> Open WhatsApp
              </a>
            </Button>
          ) : (
            <Button type="button" disabled className="h-11 gap-1.5 sm:h-10" data-test="smm-client-update-whatsapp" title="No client number on this month">
              <MessageCircle className="h-4 w-4" aria-hidden /> No client number
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
