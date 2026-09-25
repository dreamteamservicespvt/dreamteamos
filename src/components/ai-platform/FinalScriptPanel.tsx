/**
 * "Input Final Script" — the script the team will actually record, put into a finished kit.
 *
 * Scripts are finished outside the studio: the client sends their own wording, or the member corrects
 * the script in ChatGPT or Gemini. This lives INSIDE deliverable 4 (Voice Over Script) — where a member
 * looking at the script is — as a highlighted strip that says in one sentence when to use it, and opens
 * into three plain steps: copy the format, paste the script, update. On update the voice-over becomes
 * that script word for word, and everything built FROM the script — 5 Veo 3 Video Prompts, 6 Stock
 * Image Prompts, 7 Overlay Text Images — is rewritten, each showing its own progress. Frames, label and
 * poster do not depend on the words and are left as they are. See utils/finalScript.
 */
import { useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ClipboardCopy, Copy, Download, Loader2, PenLine, RotateCcw, Sparkles, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { finalScriptAiInstruction, finalScriptFromKit, finalScriptTemplate, readFinalScript } from '@/utils/finalScript';
import type { Speaker } from '@/utils/dialogueFormat';

export type SectionProgress = 'run' | 'done' | 'error';
export type FinalScriptSection = 'veo' | 'stock' | 'overlay';

export interface FinalScriptProgress {
  /** When the script was applied — ties the progress to one apply. */
  appliedAt: number;
  sections: Record<FinalScriptSection, SectionProgress>;
}

const SECTION_NAMES: Record<FinalScriptSection, string> = {
  veo: '5 · Veo 3 Video Prompts',
  stock: '6 · Stock Image Prompts (B-Roll)',
  overlay: '7 · Overlay Text Images',
};

export interface FinalScriptInputProps {
  speakers: Speaker[];
  clipCount: number;
  language?: string;
  /** The kit's voice-over as it stands — "Load current script" starts from it. */
  currentScript: string;
  open: boolean;
  onToggle: () => void;
  progress: FinalScriptProgress | null;
  onApply: (script: string) => void;
  onRetry: (section: FinalScriptSection) => void;
}

/** A button that copies text and says so for a moment. */
function CopyButton({ text, label, icon: Icon, test }: { text: string; label: string; icon: typeof Copy; test: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" data-test={test}
      onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className={cn('ag-btn ag-btn--sm h-auto min-h-8 py-1.5 px-2.5 text-[12px] max-w-full !whitespace-normal text-left', copied ? 'ag-btn--ok' : 'ag-btn--secondary')}>
      {copied ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Icon className="w-3.5 h-3.5 shrink-0" />}<span className="min-w-0">{copied ? 'Copied' : label}</span>
    </button>
  );
}

/** One of the three steps: its number, what to do, and why. */
function Step({ n, title, hint, done, children }: { n: number; title: string; hint: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cn('ag-row__num shrink-0 !w-7 !h-7 !text-[12px]', done && 'ag-row__num--done')}>{done ? <Check className="w-3.5 h-3.5" /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white">{title}</p>
        <p className="text-[12px] ag-muted mt-0.5">{hint}</p>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}

export default function FinalScriptInput({
  speakers, clipCount, language, currentScript, open, onToggle, progress, onApply, onRetry,
}: FinalScriptInputProps) {
  const [text, setText] = useState('');
  const template = useMemo(() => finalScriptTemplate(speakers, clipCount), [speakers, clipCount]);
  const aiInstruction = useMemo(() => finalScriptAiInstruction(speakers, clipCount), [speakers, clipCount]);
  const reading = useMemo(
    () => (text.trim() ? readFinalScript(text, speakers, { expectedClips: clipCount, language }) : null),
    [text, speakers, clipCount, language],
  );
  const running = !!progress && Object.values(progress.sections).includes('run');
  const applied = !!progress && !running;
  const cast = speakers.length === 0
    ? 'one line per clip'
    : speakers.length === 1
      ? `one [${speakers[0].name}]: line per clip`
      : `a ${speakers.map(s => `[${s.name}]:`).join(' and a ')} line in every clip`;

  return (
    // Full width on purpose: .ag-row centres its children, which shrank this strip to its text.
    <div className="w-full self-stretch px-3 pb-3 sm:px-4 sm:pb-4">
      {/* The strip — always in sight on row 4, saying when this is for. */}
      <div data-test="final-script-callout" className="ag-callout flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
        <span className="ag-ico ag-ico--sm shrink-0"><PenLine className="w-[18px] h-[18px]" /></span>
        <div className="min-w-0 flex-1 basis-[min(100%,260px)]">
          {running ? (
            <p className="text-[13px] font-semibold text-white flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-200" />Rebuilding 5 · 6 · 7 from your final script…
            </p>
          ) : applied ? (
            <>
              <p className="text-[13px] font-semibold text-emerald-200 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Your final script is in use</p>
              <p className="text-[12px] text-slate-300 mt-0.5">The voice-over below is your script, and 5 · 6 · 7 were rebuilt from it.</p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-white">Have the final script? Input it here.</p>
              <p className="text-[12px] text-slate-300 mt-0.5">
                Given by the client, or corrected in ChatGPT or Gemini — paste the final version and the Veo prompts, B-roll and overlay images are rebuilt to match it.
              </p>
            </>
          )}
        </div>
        <button type="button" data-test="final-script-open" onClick={onToggle} aria-expanded={open}
          className={cn('ag-btn ag-btn--sm shrink-0', open ? 'ag-btn--secondary' : 'ag-btn--primary')}>
          {open ? <><X className="w-3.5 h-3.5" />Close</> : <><PenLine className="w-3.5 h-3.5" />{applied ? 'Change final script' : 'Input Final Script'}</>}
        </button>
      </div>

      {open && (
        <div data-test="final-script-panel" className="mt-3 rounded-[16px] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
          <ol className="space-y-5">
            <Step n={1} title="Copy the format"
              hint={`The script has to be in this shape — ${clipCount} clip${clipCount === 1 ? '' : 's'}, ${cast} — so every line lands on the right frame. Writing it in ChatGPT or Gemini? Copy the instruction and paste it there with your script: it comes back in this format, word for word.`}>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <pre className="max-h-32 overflow-auto font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap">{template}</pre>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={template} label="Copy format" icon={Copy} test="final-script-copy-format" />
                <CopyButton text={aiInstruction} label="Copy instruction for ChatGPT / Gemini" icon={Sparkles} test="final-script-copy-ai" />
              </div>
            </Step>

            <Step n={2} title="Paste the final script" done={!!reading?.ok}
              hint="Exactly as it will be recorded. For a small correction, load the current script and change only the words that are different.">
              <textarea data-test="final-script-input" rows={7} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={template.split('\n').slice(0, speakers.length > 1 ? 3 : 2).join('\n')}
                className="w-full rounded-xl border border-white/[0.14] bg-[#0B1020] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-100 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-violet-500/40 resize-y" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" data-test="final-script-load-current" disabled={!currentScript.trim()}
                  onClick={() => setText(finalScriptFromKit(currentScript, speakers))}
                  className="ag-btn ag-btn--secondary ag-btn--sm h-8 px-2.5 text-[12px] disabled:opacity-50">
                  <Download className="w-3.5 h-3.5" />Load current script
                </button>
                {text && (
                  <button type="button" onClick={() => setText('')} className="ag-btn ag-btn--secondary ag-btn--sm h-8 px-2.5 text-[12px]">
                    <X className="w-3.5 h-3.5" />Clear
                  </button>
                )}
              </div>
              {/* What the paste reads as — before anything is spent on it. */}
              {reading && (
                <div data-test="final-script-reading" className="mt-2 space-y-1 text-[12px]">
                  {reading.ok ? (
                    <p className="flex items-center gap-1.5 text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />Reads as {reading.clips} clip{reading.clips === 1 ? '' : 's'}{speakers.length ? ` · ${speakers.map(s => s.name).join(' & ')}` : ''} — ready to use.
                    </p>
                  ) : reading.problems.map((p) => (
                    <p key={p} className="flex items-start gap-1.5 text-rose-300"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{p}</span></p>
                  ))}
                  {reading.notes.map((n) => (
                    <p key={n} className="flex items-start gap-1.5 text-amber-200/90"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{n}</span></p>
                  ))}
                </div>
              )}
            </Step>

            <Step n={3} title="Update the kit" done={applied}
              hint="The voice-over becomes your script, word for word. The Veo prompts, B-roll and overlay images are rewritten from it. Frames, the bottom label and the poster stay as they are.">
              <button type="button" data-test="final-script-apply"
                disabled={!reading?.ok || running}
                onClick={() => reading?.ok && onApply(reading.script)}
                className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Use this script · update 5 · 6 · 7
              </button>
              {/* Each section's own progress — they are written in parallel and finish at different times. */}
              {progress && (
                <ul data-test="final-script-progress" className="mt-3 space-y-1.5">
                  {(Object.keys(SECTION_NAMES) as FinalScriptSection[]).map((key) => {
                    const state = progress.sections[key];
                    return (
                      <li key={key} data-test={`final-script-progress-${key}`} className="flex items-center gap-2 text-[12px]">
                        <span className={cn('ag-state', state === 'run' ? 'ag-state--run' : state === 'done' ? 'ag-state--ok' : 'ag-state--bad')}>
                          {state === 'run' ? <Loader2 className="w-3 h-3 animate-spin" /> : state === 'done' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {state === 'run' ? 'Regenerating…' : state === 'done' ? 'Updated' : 'Failed'}
                        </span>
                        <span className="text-slate-200">{SECTION_NAMES[key]}</span>
                        {state === 'error' && (
                          <button type="button" onClick={() => onRetry(key)} className="ag-btn ag-btn--secondary ag-btn--sm h-6 px-2 text-[11px]">
                            <RotateCcw className="w-3 h-3" />Retry
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Step>
          </ol>
          <p className="mt-4 flex items-start gap-1.5 text-[11px] ag-muted">
            <ClipboardCopy className="w-3.5 h-3.5 mt-px shrink-0" />
            A different number of clips needs new frames: put the script in Configuration → custom script and generate again.
          </p>
        </div>
      )}
    </div>
  );
}
