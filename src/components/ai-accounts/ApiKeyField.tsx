import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ClipboardPaste, Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { buttonClass, fieldClass } from "./AiModal";
import type { ApiKeyEntry } from "@/hooks/useApiKeyEntry";
import { API_KEY_NAME, API_KEY_PROJECT, aiStudioUrlFor } from "@/utils/geminiKeys";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * The Gemini API key steps and box (2026-10-10) — shared by the key dialog on a card (ApiKeyDialog) and the
 * "Add a Flow account" form. What was entered, and Google's answer, live in hooks/useApiKeyEntry.
 */

/** A word the person types into AI Studio, copied with one tap so it is spelt the same every time. */
function CopyChip({ text, mono = true }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { /* it is on screen to type */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${text}`}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 align-middle text-[11px] font-semibold text-foreground hover:bg-accent", mono && "font-mono")}>
      <span className="truncate">{text}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-success" /> : <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </button>
  );
}

/**
 * Copies the AI Studio link (with this account's `?authuser=`) — for when the account is signed in on another
 * Chrome profile or device, where "Open AI Studio" from here would land in the wrong account (owner, 2026-10-10).
 */
function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    setState((await copyText(url)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <button type="button" onClick={copy} className={buttonClass.small} aria-label="Copy the AI Studio link" data-test="api-key-copy-studio">
      {state === "copied" ? <><Check className="h-3.5 w-3.5 text-success" /> Copied</>
        : state === "failed" ? <>Could not copy</>
          : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
    </button>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 min-w-0">
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{n}</span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </li>
  );
}

/**
 * The steps in AI Studio — opened in THIS account (`?authuser=`), the key's name and project ready to
 * copy — then the box the key is pasted into, with Google's answer under it.
 */
export function ApiKeySteps({ entry, email, stepsOpen, onShowSteps }: {
  entry: ApiKeyEntry;
  /** The account the key is made in; before a valid email is typed, AI Studio opens in the browser's account. */
  email: string;
  stepsOpen: boolean;
  onShowSteps: () => void;
}) {
  const { value, setValue, result, checking, shownError, paste } = entry;
  const studioUrl = aiStudioUrlFor(email || undefined);
  return (
    <ol className="space-y-3 text-xs text-muted-foreground" data-test="api-key-steps">
      <Step n={1}>
        <div className="flex flex-wrap items-center gap-2">
          <span>Open AI Studio <b className="text-foreground">in this account</b></span>
          <a href={studioUrl} target="_blank" rel="noopener noreferrer" className={`${buttonClass.small} border-primary/40 text-primary`} data-test="api-key-open-studio">
            Open AI Studio <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <CopyLinkButton url={studioUrl} />
        </div>
        <p className="mt-1">
          The picture at the top right must be {email ? <CopyChip text={email} /> : <b className="text-foreground">this account's email</b>} — if it is another account, tap it and switch (or sign in).
        </p>
      </Step>
      {stepsOpen ? (
        <>
          <Step n={2}>Click <b className="text-foreground">Create API key</b>.</Step>
          <Step n={3}>Name your key: <CopyChip text={API_KEY_NAME} mono={false} /></Step>
          <Step n={4}>
            Under <b className="text-foreground">Choose an imported project</b>, choose <b className="text-foreground">Create project</b>, name it <CopyChip text={API_KEY_PROJECT} /> and click <b className="text-foreground">Create project</b>.
            <span className="block mt-0.5">Already made “{API_KEY_PROJECT}” in this account? Just choose it.</span>
          </Step>
          <Step n={5}>Click <b className="text-foreground">Create key</b>, then copy the key — it starts with <span className="font-mono text-foreground">AIza</span>.</Step>
        </>
      ) : (
        <li className="pl-7">
          <button type="button" className="text-primary font-medium hover:underline" onClick={onShowSteps} data-test="api-key-show-steps">Show steps 2–5</button>
        </li>
      )}
      <Step n={6}>
        <span>Paste the key here:</span>
        <div className="mt-1.5 flex gap-2">
          <input className={cn(fieldClass, "font-mono", shownError && "border-destructive")} value={value} autoComplete="off" spellCheck={false} autoCapitalize="off"
            onChange={(e) => setValue(e.target.value)} placeholder="AIza…" aria-label="Gemini API key" data-test="api-key-input" />
          <button type="button" className={buttonClass.ghost} onClick={paste} aria-label="Paste from clipboard"><ClipboardPaste className="h-4 w-4" /> Paste</button>
        </div>
        <div className="mt-1.5 min-h-[1.25rem] text-[11px]" data-test="api-key-status" aria-live="polite">
          {shownError ? <span className="flex items-start gap-1 text-destructive"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {shownError}</span>
            : checking ? <span className="flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the key with Google…</span>
              : result?.status === "working" ? <span className="flex items-center gap-1 font-medium text-success"><ShieldCheck className="h-3.5 w-3.5" /> Google accepted this key.</span>
                : result?.status === "unchecked" ? <span className="text-warning">Google could not be reached to check it. You can still save it — it is checked again later.</span>
                  : <span>It starts with AIza and is 39 characters long.</span>}
        </div>
      </Step>
    </ol>
  );
}
