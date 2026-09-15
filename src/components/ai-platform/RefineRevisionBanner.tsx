/**
 * What the last voice-over refine did — shown above the script until the member dismisses it.
 *
 * A refine used to redraw the whole script with no indication of what had moved, so a member had to
 * reread every clip to check their one change had landed and nothing else had shifted. This names
 * what was understood, shows each changed clip before and after, and offers Undo, which restores the
 * script and the video prompts exactly as they were.
 */
import React from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clipLabel } from '@/utils/voiceOverFormat';
import { parseVoiceOverClips } from './GeneratedCard';

export interface VoiceOverRevision {
  instruction: string;
  understood: string;
  before: string;
  after: string;
  /** 0-based clips whose words changed. */
  changed: number[];
  /** The video prompts before the refine, restored by Undo. */
  previousVeo: string[];
}

export const RefineRevisionBanner: React.FC<{
  revision: VoiceOverRevision;
  isDark: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}> = ({ revision, isDark, onUndo, onDismiss }) => {
  const before = parseVoiceOverClips(revision.before);
  const after = parseVoiceOverClips(revision.after);
  const labels = revision.changed.map((i) => clipLabel(i).replace(/\[.*$/, '')).join(', ');

  return (
    <div
      data-test="refine-revision"
      role="status"
      className={cn('mx-4 mt-4 rounded-xl border px-4 py-3',
        isDark ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-emerald-200 bg-emerald-50/70')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('flex items-center gap-1.5 text-sm font-bold', isDark ? 'text-emerald-300' : 'text-emerald-700')}>
            <Check className="w-4 h-4" strokeWidth={3} /> Updated {labels}
          </p>
          {revision.understood && (
            <p className={cn('mt-0.5 text-xs leading-relaxed', isDark ? 'text-slate-300' : 'text-slate-600')}>
              Understood: {revision.understood}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onUndo} data-test="refine-undo"
            className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
              isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200')}>
            <RotateCcw className="w-3.5 h-3.5" /> Undo
          </button>
          <button type="button" onClick={onDismiss} aria-label="Dismiss"
            className={cn('rounded-lg p-1.5 transition-colors', isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-white')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {revision.changed.map((i) => (
          <div key={i} className="text-xs leading-relaxed">
            <p className={cn('font-mono font-semibold', isDark ? 'text-slate-400' : 'text-slate-500')}>{clipLabel(i)}</p>
            <p className={cn('mt-0.5 whitespace-pre-wrap line-through decoration-1', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {before[i]?.text ?? ''}
            </p>
            <p className={cn('mt-0.5 whitespace-pre-wrap', isDark ? 'text-slate-100' : 'text-slate-800')}>
              {after[i]?.text ?? ''}
            </p>
          </div>
        ))}
      </div>

      <p className={cn('mt-3 text-[11px] leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500')}>
        The video prompts for {revision.changed.length === 1 ? 'this clip were' : 'these clips were'} re-directed for the new words.
        Their Main Frame prompts were written for the old line — check the scene still fits.
      </p>
    </div>
  );
};
