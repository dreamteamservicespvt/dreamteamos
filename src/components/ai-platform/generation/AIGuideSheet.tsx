/**
 * The AI Guide — the Mission Workspace's checklist, reopened beside the finished assets.
 *
 * The workspace steps aside the moment the first asset lands, which is exactly when the member
 * starts moving prompts into tabs. So the guide carries the same checklist, in the same state, plus
 * the one thing the workspace could not have: a paste map — each clip's frame and video prompt with
 * the photo it needs, one copy away.
 *
 * A Radix sheet, so it is portaled to the body. The output panels use backdrop-blur, which traps a
 * position:fixed child inside them, and a drawer rendered in place would open inside a card.
 */
import React, { useState } from 'react';
import { Check, Copy, Paperclip, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { splitAttachmentDirective } from '@/utils/locationAssignment';
import type { GeneratedOutputs } from '@/types/aiPlatform';
import { BRAND_GRADIENT } from '../brand';
import { buildMissionTasks, runSummary } from './mission';
import { MissionTaskList, RunCountdown } from './MissionWorkspace';
import type { GenerationRun, RunFacts } from './run';

/** A prompt as the member pastes it: no markdown fences, and no instruction meant for them. */
export function promptForPaste(text: string): string {
  const { body } = splitAttachmentDirective(text || '');
  return body
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
}

const CopyChip: React.FC<{ label: string; text: string; isDark: boolean; testId: string }> = ({ label, text, isDark, testId }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-test={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(promptForPaste(text));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (an insecure context, or permission denied): the card below still has it.
        }
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-all active:scale-[0.97]',
        copied
          ? (isDark ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700')
          : (isDark ? 'border-white/[0.14] text-slate-200 hover:border-violet-400' : 'border-slate-300 text-slate-700 hover:border-violet-400 bg-white'),
      )}
    >
      {copied ? <Check className="w-3 h-3" strokeWidth={3} /> : <Copy className="w-3 h-3 opacity-70" />}
      {copied ? 'Copied' : label}
    </button>
  );
};

export const AIGuideSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The run in progress, or null when the guide is opened on a finished or saved generation. */
  run: GenerationRun | null;
  processing: boolean;
  facts: RunFacts;
  outputs: GeneratedOutputs | null;
  done: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
  isDark: boolean;
}> = ({ open, onOpenChange, run, processing, facts, outputs, done, onToggle, isDark }) => {
  const tasks = buildMissionTasks(facts);
  const frames = (outputs?.mainFramePrompts || []).filter((p) => p?.trim());
  const videos = outputs?.veoPrompts || [];
  const clips = Math.max(frames.length, videos.filter((p) => p?.trim()).length);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-test="ai-guide"
        className={cn(
          'w-full sm:max-w-md p-0 overflow-y-auto border-l',
          isDark ? 'bg-slate-950 border-white/[0.07] text-slate-100' : 'bg-white border-slate-200 text-slate-900',
        )}
      >
        <div className="relative px-6 pt-7 pb-5">
          <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-1', BRAND_GRADIENT)} />
          <p className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]', isDark ? 'text-violet-300' : 'text-violet-600')}>
            <Sparkles className="w-3.5 h-3.5" /> AI Guide
          </p>
          <SheetTitle className={cn('mt-2 text-xl font-extrabold tracking-tight text-left', isDark ? 'text-white' : 'text-slate-900')}>
            Your production checklist
          </SheetTitle>
          <SheetDescription className={cn('mt-1 text-xs text-left', isDark ? 'text-slate-400' : 'text-slate-500')}>
            {runSummary(facts)}
          </SheetDescription>
          {processing && run && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>DTS is still generating</span>
              <RunCountdown run={run} active isDark={isDark} variant="inline" />
            </div>
          )}
        </div>

        <div className="px-6">
          <MissionTaskList tasks={tasks} done={done} onToggle={onToggle} isDark={isDark} />
        </div>

        {facts.mode === 'video' && clips > 0 && (
          <div className="px-6 mt-7">
            <h4 className={cn('text-sm font-bold', isDark ? 'text-slate-100' : 'text-slate-800')}>Paste map</h4>
            <p className={cn('mt-0.5 text-xs leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500')}>
              Each clip's frame prompt goes into its own ChatGPT tab with what it needs attached. Its video prompt goes into Flow.
            </p>
            <ol className="mt-3 space-y-2" data-test="paste-map">
              {Array.from({ length: clips }, (_, i) => {
                const frame = frames[i] || '';
                const video = videos[i] || '';
                const directive = frame ? splitAttachmentDirective(frame).directive : null;
                const attach = directive
                  ? directive.replace(/^[📎🎨]\s*/u, '')
                  : facts.hasLogo ? 'Attach the logo' : 'Nothing to attach';
                return (
                  <li key={i} className={cn('rounded-xl border p-3', isDark ? 'border-white/[0.07] bg-[rgba(7,17,38,0.55)]' : 'border-slate-200 bg-slate-50/70')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-xs font-bold', isDark ? 'text-slate-100' : 'text-slate-800')}>Clip {i + 1} · Tab {i + 1}</p>
                      <div className="flex gap-1.5">
                        {frame && <CopyChip label="Frame" text={frame} isDark={isDark} testId={`paste-frame-${i + 1}`} />}
                        {video.trim() && <CopyChip label="Video" text={video} isDark={isDark} testId={`paste-video-${i + 1}`} />}
                      </div>
                    </div>
                    <p className={cn('mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug', isDark ? 'text-slate-400' : 'text-slate-500')}>
                      <Paperclip className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{attach}{directive && facts.hasLogo ? ' · plus the logo' : ''}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Clear of the app-update banner, which is fixed to the bottom of the screen on phones. */}
        <div className="h-24" />
      </SheetContent>
    </Sheet>
  );
};
