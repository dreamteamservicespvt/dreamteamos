import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import AiModal, { buttonClass } from "./AiModal";
import { importFlowAccount, type Actor, type FlowImportOutcome } from "@/services/aiAccounts";
import type { FlowAccount, FlowSettings } from "@/types/aiAccounts";
import { parseFlowAccountPaste } from "@/utils/flowCredits";

type Result = { added: number; passwords: number; unchanged: number; failed: { email: string; message: string }[] };

/**
 * "Paste accounts" — the tech admin pastes a list copied from a sheet (one account a line: the login,
 * then its password) and every account in it is added in one go (owner, 2026-10-22).
 *
 * A new account is the paster's own, with no phone and no opening day ("Opening day not set" until
 * someone sets it on Edit); an account already in the list is left as it is, except that its password
 * is filled in when none is saved. A saved password is never replaced from here. The preview shows
 * emails and counts only — never a pasted password.
 */
export default function PasteAccountsDialog({
  open, onClose, actor, settings, accounts,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  settings: FlowSettings;
  /** The accounts already in the list — to say which pasted ones are new. */
  accounts: FlowAccount[];
}) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setDone(0);
    setResult(null);
  }, [open]);

  const parsed = useMemo(() => parseFlowAccountPaste(text), [text]);
  const known = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const fresh = parsed.accounts.filter((a) => !known.has(a.email));
  const existing = parsed.accounts.filter((a) => known.has(a.email));
  const noPassword = parsed.accounts.filter((a) => !a.password).length;

  const run = async () => {
    if (busy.current || parsed.accounts.length === 0) return;
    busy.current = true;
    setRunning(true);
    setDone(0);
    const out: Result = { added: 0, passwords: 0, unchanged: 0, failed: [] };
    // One at a time: each line is its own transaction, and a failure stops nothing after it.
    for (const row of parsed.accounts) {
      try {
        const outcome: FlowImportOutcome = await importFlowAccount(row, actor, settings);
        if (outcome === "added") out.added += 1;
        else if (outcome === "password_added") out.passwords += 1;
        else out.unchanged += 1;
      } catch (err) {
        out.failed.push({ email: row.email, message: err instanceof Error ? err.message : "Could not be saved." });
      }
      setDone((n) => n + 1);
    }
    setResult(out);
    setRunning(false);
    busy.current = false;
  };

  const total = parsed.accounts.length;
  return (
    <AiModal
      open={open}
      onClose={running ? () => undefined : onClose}
      wide
      testId="paste-accounts-dialog"
      title="Paste Flow accounts"
      subtitle="One account a line — the email (or the Gmail login), then its password. Copy the rows straight from your sheet."
      footer={result ? (
        <button className={buttonClass.primary} onClick={onClose} data-test="paste-close">Done</button>
      ) : <>
        <button className={buttonClass.ghost} onClick={onClose} disabled={running}>Cancel</button>
        <button className={buttonClass.primary} onClick={run} disabled={running || total === 0} data-test="paste-save">
          {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving {done} / {total}</>
            : <><ClipboardPaste className="h-4 w-4" /> {fresh.length ? `Add ${fresh.length} account${fresh.length === 1 ? "" : "s"}` : "Save"}{existing.length ? ` · check ${existing.length}` : ""}</>}
        </button>
      </>}
    >
      {result ? (
        <div className="space-y-2 text-sm" data-test="paste-result">
          <p><b className="text-success" data-test="paste-added">{result.added}</b> added — yours, opening day not set.</p>
          <p><b className="text-foreground" data-test="paste-passwords">{result.passwords}</b> already in the list — their missing password filled in.</p>
          <p><b className="text-foreground" data-test="paste-unchanged">{result.unchanged}</b> already in the list — left as they were.</p>
          {result.failed.length ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs" data-test="paste-failed">
              <p className="font-semibold text-destructive">{result.failed.length} could not be saved — paste them again to retry:</p>
              <ul className="mt-1 space-y-0.5">{result.failed.map((f) => <li key={f.email} className="break-all">{f.email} — {f.message}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 min-w-0">
          <textarea
            className="w-full min-h-[180px] rounded-lg bg-background border border-border p-3 font-mono text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
            value={text} onChange={(e) => setText(e.target.value)} disabled={running} spellCheck={false} autoComplete="off"
            placeholder={"name.flow01@gmail.com\tPassword\nname.flow02\tPassword"} data-test="paste-text" />
          {total || parsed.skipped.length ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1" data-test="paste-preview">
              <p><b className="text-foreground" data-test="paste-total">{total}</b> account{total === 1 ? "" : "s"} in the list
                {parsed.repeats ? <> · {parsed.repeats} repeated line{parsed.repeats === 1 ? "" : "s"} counted once</> : null}</p>
              <p><b className="text-success" data-test="paste-new">{fresh.length}</b> new — added as yours, with no phone and no opening day (set it later on Edit).</p>
              <p><b className="text-foreground" data-test="paste-existing">{existing.length}</b> already in the list — kept as they are; a password is filled in only where none is saved.</p>
              {noPassword ? <p data-test="paste-no-password"><b className="text-warning">{noPassword}</b> without a password in the paste.</p> : null}
              {parsed.skipped.length ? (
                <details data-test="paste-skipped">
                  <summary className="cursor-pointer text-muted-foreground">{parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"} skipped — not an account</summary>
                  {/* Line numbers only — a stray line may be a password. */}
                  <p className="mt-1 break-all">Line {parsed.skipped.map((s) => s.line).join(", ")}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </AiModal>
  );
}
