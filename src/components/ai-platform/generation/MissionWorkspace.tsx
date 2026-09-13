/**
 * The Mission Workspace — the empty "Generated Assets" area, while DTS is still generating.
 *
 * Two crews, one launch: across the top, where DTS is in its own work and exactly how long is left;
 * underneath, the member's side of the same job, in the order it is worth doing, with the next step
 * lit. It leaves the moment the first real asset lands, and the same checklist lives on in the AI
 * Guide. See ./mission for why the wait is spent this way.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ExternalLink, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_GRADIENT, BRAND_TEXT } from '../brand';
import {
  actionableTasks, buildMissionTasks, isTaskDone, missionStages, nextTaskId, runSummary, tabKey,
  type MissionTask,
} from './mission';
import type { GenerationRun } from './run';
import { useRunClock } from './useRunClock';

const EASE = [0.22, 1, 0.36, 1] as const;

// ── Countdown ───────────────────────────────────────────────────────────────────────────────────

export const RunCountdown: React.FC<{
  run: GenerationRun | null;
  active: boolean;
  isDark: boolean;
  variant: 'hero' | 'inline';
  /** What the countdown runs to, for the hero caption. */
  target?: string;
}> = ({ run, active, isDark, variant, target = 'until your ad kit is ready' }) => {
  const view = useRunClock(run, active);
  if (!view) return null;
  const over = !!view.overLabel;

  if (variant === 'inline') {
    return (
      <span
        data-test="run-countdown-inline"
        aria-live="off"
        className={cn(
          'font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
          over
            ? (isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')
            : (isDark ? 'bg-slate-800 text-violet-300' : 'bg-violet-50 text-violet-700'),
        )}
        title={over ? 'Taking longer than estimated' : 'Estimated time remaining'}
      >
        {view.finishing ? 'finishing' : over ? `+${view.overLabel} over` : `${view.label} left`}
      </span>
    );
  }

  return (
    <div className="sm:text-right" data-test="run-countdown-hero">
      <div
        role="timer"
        aria-live="off"
        aria-label={over ? `${view.overLabel} past the estimate` : `${view.label} remaining`}
        className={cn(
          'font-semibold tabular-nums tracking-tight leading-none text-5xl sm:text-6xl',
          over ? (isDark ? 'text-amber-300' : 'text-amber-600') : BRAND_TEXT,
        )}
      >
        {over ? `+${view.overLabel}` : view.label}
      </div>
      <p className={cn('mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]', isDark ? 'text-slate-400' : 'text-slate-500')}>
        {view.finishing ? 'Finishing up' : over ? 'Past the estimate · still working' : target}
      </p>
      {view.calibrating && !over && (
        <p className={cn('mt-1 text-[10px]', isDark ? 'text-slate-500' : 'text-slate-400')}>
          First run on this device — the estimate sharpens with every run
        </p>
      )}
    </div>
  );
};

// ── DTS's side: the pipeline rail ───────────────────────────────────────────────────────────────

const StageRail: React.FC<{ run: GenerationRun; isDark: boolean }> = ({ run, isDark }) => {
  const reduce = useReducedMotion();
  const stages = missionStages(run.profile, run.checkpoints);
  const activeIndex = stages.findIndex((s) => s.state === 'active');
  return (
    <>
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} aria-label="DTS progress">
      {stages.map((stage) => (
        <li key={stage.key} className="min-w-0" aria-current={stage.state === 'active' ? 'step' : undefined}>
          <div className={cn('relative h-1 rounded-full overflow-hidden', isDark ? 'bg-slate-800' : 'bg-slate-200/80')}>
            {stage.state === 'done' && <div className={cn('absolute inset-0', BRAND_GRADIENT)} />}
            {stage.state === 'active' && (
              reduce
                ? <div className={cn('absolute inset-y-0 left-0 w-1/2', BRAND_GRADIENT)} />
                : (
                  <motion.div
                    className={cn('absolute inset-y-0 w-1/2 rounded-full', BRAND_GRADIENT)}
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )
            )}
          </div>
          {/* Four labels in a phone's width truncate into noise — there, one "Now" line says it instead. */}
          <p className={cn(
            'mt-1.5 hidden sm:block text-[11px] leading-tight truncate',
            stage.state === 'active'
              ? (isDark ? 'text-slate-100 font-semibold' : 'text-slate-800 font-semibold')
              : stage.state === 'done'
                ? (isDark ? 'text-slate-400' : 'text-slate-500')
                : (isDark ? 'text-slate-600' : 'text-slate-400'),
          )} title={stage.label}>
            {stage.label}
          </p>
        </li>
      ))}
    </ol>
    {activeIndex >= 0 && (
      <p className={cn('sm:hidden mt-2 text-[11px]', isDark ? 'text-slate-400' : 'text-slate-500')}>
        Now: <span className={cn('font-semibold', isDark ? 'text-slate-100' : 'text-slate-800')}>{stages[activeIndex].label}</span>
        {' '}· step {activeIndex + 1} of {stages.length}
      </p>
    )}
    </>
  );
};

// ── The member's side: the checklist ────────────────────────────────────────────────────────────

export const MissionTaskList: React.FC<{
  tasks: MissionTask[];
  done: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
  isDark: boolean;
  animate?: boolean;
}> = ({ tasks, done, onToggle, isDark, animate = false }) => {
  const reduce = useReducedMotion();
  const next = nextTaskId(tasks, done);
  let number = 0;

  return (
    <ol className="space-y-2">
      {tasks.map((task, i) => {
        const info = task.kind === 'info';
        const complete = !info && isTaskDone(task, done);
        const isNext = task.id === next;
        if (!info) number += 1;
        return (
          <motion.li
            key={task.id}
            data-test={`mission-task-${task.id}`}
            initial={animate ? (reduce ? { opacity: 0 } : { opacity: 0, y: 6 }) : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: animate ? 0.12 + i * 0.05 : 0, ease: EASE }}
            className={cn(
              'relative rounded-xl border p-3.5 sm:p-4 transition-colors',
              isNext
                ? (isDark ? 'border-violet-500/50 bg-violet-500/[0.07]' : 'border-violet-300 bg-violet-50/70')
                : info
                  ? (isDark ? 'border-slate-800 bg-transparent' : 'border-slate-200/70 bg-transparent')
                  : (isDark ? 'border-slate-700/60 bg-slate-800/40' : 'border-slate-200 bg-white/70'),
            )}
          >
            <div className="flex gap-3">
              {info ? (
                <span className={cn('mt-0.5 shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center',
                  isDark ? 'text-slate-500' : 'text-slate-400')}>
                  <Info className="w-3.5 h-3.5" />
                </span>
              ) : (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={complete}
                  aria-label={`Mark "${task.title}" ${complete ? 'not done' : 'done'}`}
                  onClick={() => onToggle(task.id, !complete)}
                  className={cn(
                    'mt-0.5 shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1',
                    complete
                      ? cn(BRAND_GRADIENT, 'text-white shadow-md shadow-blue-600/25')
                      : isNext
                        ? (isDark ? 'border border-violet-400 text-violet-300' : 'border border-violet-500 text-violet-600')
                        : (isDark ? 'border border-slate-600 text-slate-400 hover:border-slate-400' : 'border border-slate-300 text-slate-500 hover:border-slate-400'),
                  )}
                >
                  {complete ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : number}
                </button>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-semibold leading-snug',
                    complete ? (isDark ? 'text-slate-500' : 'text-slate-400')
                      : info ? (isDark ? 'text-slate-400' : 'text-slate-500')
                        : (isDark ? 'text-slate-100' : 'text-slate-800'))}>
                    {task.title}
                  </p>
                  {isNext && (
                    <span className={cn('shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md text-white', BRAND_GRADIENT)}>
                      Next
                    </span>
                  )}
                </div>
                <p className={cn('mt-0.5 text-xs leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  {task.detail}
                </p>

                {task.kind === 'tabs' && task.tabs && task.href && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {Array.from({ length: task.tabs }, (_, t) => {
                      const key = tabKey(task, t);
                      const opened = !!done[key];
                      return (
                        <a
                          key={key}
                          href={task.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-test={`mission-tab-${t + 1}`}
                          onClick={() => onToggle(key, true)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-[0.97]',
                            opened
                              ? (isDark ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700')
                              : (isDark ? 'border-slate-600 text-slate-200 hover:border-violet-400 hover:text-white' : 'border-slate-300 text-slate-700 hover:border-violet-400 hover:text-violet-700 bg-white'),
                          )}
                        >
                          {opened ? <Check className="w-3 h-3" strokeWidth={3} /> : <ExternalLink className="w-3 h-3 opacity-60" />}
                          Tab {t + 1}
                        </a>
                      );
                    })}
                  </div>
                )}

                {task.kind === 'link' && task.href && (
                  <a
                    href={task.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onToggle(task.id, true)}
                    className={cn(
                      'mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition-all active:scale-[0.98]',
                      BRAND_GRADIENT,
                    )}
                  >
                    {task.linkLabel || 'Open'} <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                )}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
};

// ── The workspace ───────────────────────────────────────────────────────────────────────────────

export const MissionWorkspace: React.FC<{
  run: GenerationRun;
  done: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
  isDark: boolean;
}> = ({ run, done, onToggle, isDark }) => {
  const reduce = useReducedMotion();
  const tasks = buildMissionTasks(run.facts);
  const ready = actionableTasks(tasks).filter((t) => isTaskDone(t, done)).length;
  const total = actionableTasks(tasks).length;
  const poster = run.facts.mode === 'poster';

  return (
    <section
      data-test="mission-workspace"
      aria-label="Mission workspace"
      className={cn(
        'relative overflow-hidden rounded-2xl border shadow-xl',
        isDark ? 'bg-slate-900/80 border-slate-800 shadow-black/30' : 'bg-white/95 border-slate-200 shadow-slate-200/60',
      )}
    >
      {/* A slow wash of the brand colours behind the countdown — atmosphere, never information. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-24 -left-16 w-72 h-72 rounded-full bg-violet-500 blur-3xl"
          style={{ opacity: isDark ? 0.14 : 0.1 }}
          animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 16, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -top-20 right-[-4rem] w-72 h-72 rounded-full bg-cyan-400 blur-3xl"
          style={{ opacity: isDark ? 0.1 : 0.08 }}
          animate={reduce ? undefined : { x: [0, -32, 0], y: [0, 24, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative px-5 py-5 sm:px-7 sm:py-7">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="min-w-0">
            <p className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]', isDark ? 'text-violet-300' : 'text-violet-600')}>
              <Sparkles className="w-3.5 h-3.5" /> Mission Workspace
            </p>
            <h3 className={cn('mt-2 text-xl sm:text-2xl font-extrabold tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
              {poster ? 'Your poster concepts are being written' : 'Your ad kit is being built'}
            </h3>
            <p className={cn('mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>{runSummary(run.facts)}</p>
          </div>
          <RunCountdown
            run={run}
            active
            isDark={isDark}
            variant="hero"
            target={poster ? 'until your concepts are ready' : 'until your ad kit is ready'}
          />
        </div>

        <div className="mt-6">
          <StageRail run={run} isDark={isDark} />
        </div>

        <div className={cn('my-6 h-px bg-gradient-to-r from-transparent to-transparent', isDark ? 'via-slate-700' : 'via-slate-200')} />

        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h4 className={cn('text-sm font-bold', isDark ? 'text-slate-100' : 'text-slate-800')}>
            While DTS writes, set up your studio
          </h4>
          <span className={cn('shrink-0 text-[11px] font-semibold tabular-nums', ready === total
            ? (isDark ? 'text-emerald-300' : 'text-emerald-600')
            : (isDark ? 'text-slate-400' : 'text-slate-500'))}
            data-test="mission-ready-count">
            {ready === total ? 'Studio ready' : `${ready} of ${total} ready`}
          </span>
        </div>

        <MissionTaskList tasks={tasks} done={done} onToggle={onToggle} isDark={isDark} animate />

        <p className={cn('mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed', isDark ? 'text-slate-500' : 'text-slate-400')}>
          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
          This workspace steps aside the moment your first asset arrives. Reopen it any time from AI Guide.
        </p>
      </div>
    </section>
  );
};

/** The workspace's entrance and exit — a lift in, and a soft dissolve out as the assets take over. */
export const missionMotion = (reduce: boolean | null) => reduce
  ? {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.2 } },
      exit: { opacity: 0, transition: { duration: 0.15 } },
    }
  : {
      initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
      animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE } },
      exit: { opacity: 0, y: -10, scale: 0.985, filter: 'blur(8px)', transition: { duration: 0.38, ease: EASE } },
    };
