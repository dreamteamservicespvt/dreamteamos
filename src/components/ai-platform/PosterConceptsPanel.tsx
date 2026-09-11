/**
 * Poster Creation output — the concepts, each ready to run in an image generator.
 *
 * One card per concept: what the idea is, why it suits this client, the exact words on the poster,
 * and the prompt with a copy button. A refine box per card rewrites just that concept. The logo
 * reminder sits at the top because every prompt refers to "the attached logo" — a prompt run
 * without the logo attached produces a poster with an invented one.
 */
import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Paperclip, Wand2, Lightbulb, Type as TypeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PosterConcept } from '@/types/aiPlatform';
import { posterStyleLabel } from '@/services/posterStyles';
import { posterSizeLabel } from '@/utils/posterSpec';
import { posterConceptAsText } from '@/utils/posterConcepts';

const BRAND_GRADIENT = 'bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500';

/** Where the member runs the prompts — Gemini's image model takes an attached logo. */
export const POSTER_GENERATOR_URL = 'https://gemini.google.com/app';

interface PosterConceptsPanelProps {
  concepts: PosterConcept[];
  posterSize: string;
  occasion?: string;
  hasLogo: boolean;
  isDark: boolean;
  refiningIndex: number | null;
  onRefine: (index: number, instruction: string) => Promise<void> | void;
}

export default function PosterConceptsPanel({
  concepts, posterSize, occasion, hasLogo, isDark, refiningIndex, onRefine,
}: PosterConceptsPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [refineText, setRefineText] = useState<Record<number, string>>({});

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };

  const card = isDark ? 'bg-slate-900/70 border-slate-800 shadow-black/10' : 'bg-white border-slate-200 shadow-slate-200/50';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-slate-100' : 'text-slate-800';

  return (
    <div className="space-y-4" data-test="poster-concepts">
      <div className={cn('rounded-2xl border p-4 shadow-lg', card)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={cn('text-sm font-bold uppercase tracking-wide', strong)}>
              Poster concepts ({concepts.length})
            </h3>
            <p className={cn('mt-0.5 text-xs', muted)}>
              {posterSizeLabel(posterSize)}{occasion ? ` · 🎊 ${occasion}` : ''} · pick one, copy its prompt, run it in the image generator.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-test="poster-copy-all"
              onClick={() => copy('all', concepts.map((c, i) => posterConceptAsText(c, i)).join('\n\n────────\n\n'))}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}
            >
              {copied === 'all' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'all' ? 'Copied all' : 'Copy all'}
            </button>
            <a
              href={POSTER_GENERATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow', BRAND_GRADIENT)}
            >
              Open image generator <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </a>
          </div>
        </div>
        {hasLogo && (
          <p className={cn('mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
            isDark ? 'border-amber-700/50 bg-amber-950/30 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-800')}>
            <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Attach the client's <b>logo</b> with every prompt. The prompts say "the attached logo" and never describe it, so the generator uses the real one.</span>
          </p>
        )}
      </div>

      {concepts.map((c, i) => {
        const key = `c${i}`;
        const refining = refiningIndex === i;
        return (
          <div key={key} data-test="poster-concept" className={cn('overflow-hidden rounded-2xl border shadow-lg', card)}>
            <div className={cn('relative flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3',
              isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50')}>
              <div className={cn('absolute bottom-0 left-0 top-0 w-1', BRAND_GRADIENT)} />
              <div className="min-w-0 pl-1.5">
                <p className={cn('text-[10px] font-semibold uppercase tracking-wider', muted)}>Concept {i + 1}</p>
                <h4 className={cn('truncate text-sm font-bold', strong)}>{c.title}</h4>
              </div>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium',
                isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-100 text-violet-700')}>
                {posterStyleLabel(c.style)}
              </span>
            </div>

            <div className="space-y-3 p-4">
              {c.idea && (
                <p className={cn('flex items-start gap-2 text-sm', strong)}>
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>{c.idea}{c.whyItWorks ? <span className={cn('block text-xs', muted)}>{c.whyItWorks}</span> : null}</span>
                </p>
              )}

              {(c.headline || c.subline) && (
                <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2',
                  isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50')}>
                  <TypeIcon className={cn('mt-0.5 h-4 w-4 shrink-0', muted)} />
                  <div className="min-w-0">
                    {c.headline && <p className={cn('text-sm font-extrabold', strong)}>“{c.headline}”</p>}
                    {c.subline && <p className={cn('text-xs', muted)}>{c.subline}</p>}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={cn('text-[11px] font-semibold uppercase tracking-wide', muted)}>Image prompt</span>
                  <button
                    type="button"
                    data-test={`poster-copy-${i}`}
                    onClick={() => copy(key, c.imagePrompt + (c.negativePrompt ? `\n\nAvoid: ${c.negativePrompt}` : ''))}
                    className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                      copied === key
                        ? (isDark ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
                        : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'))}
                  >
                    {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === key ? 'Copied' : 'Copy prompt'}
                  </button>
                </div>
                <p data-test={`poster-prompt-${i}`} className={cn('whitespace-pre-wrap rounded-lg border p-3 text-sm leading-relaxed',
                  isDark ? 'border-slate-700 bg-slate-950/40 text-slate-200' : 'border-slate-200 bg-white text-slate-700')}>
                  {c.imagePrompt}
                </p>
                {c.negativePrompt && (
                  <p className={cn('mt-1.5 text-[11px]', muted)}><b>Avoid:</b> {c.negativePrompt}</p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={refineText[i] || ''}
                  onChange={(e) => setRefineText((prev) => ({ ...prev, [i]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (refineText[i] || '').trim() && !refining) {
                      onRefine(i, refineText[i].trim());
                    }
                  }}
                  placeholder="Change this concept — e.g. use a lotus instead, warmer colours, bigger logo"
                  className={cn('min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2',
                    isDark ? 'border-slate-700 bg-slate-800 text-slate-200 placeholder-slate-500 focus:ring-blue-800' : 'border-slate-300 bg-white text-slate-700 placeholder-slate-400 focus:ring-blue-200')}
                />
                <button
                  type="button"
                  disabled={refining || !(refineText[i] || '').trim()}
                  onClick={() => onRefine(i, (refineText[i] || '').trim())}
                  className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50', BRAND_GRADIENT)}
                >
                  {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {refining ? 'Refining…' : 'Refine'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
