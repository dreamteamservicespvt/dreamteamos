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
import {
  Check, ExternalLink, FileText, Image as ImageIcon, Info, MapPin, MessageSquare, Mic, Sparkles, Video,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_GRADIENT, BRAND_TEXT } from '../brand';
import {
  actionableTasks, buildMissionTasks, isTaskDone, missionStages, nextTaskId, runSummary, tabKey,
  type MissionTask,
} from './mission';
import type { Checkpoint, RunProfile } from '@/utils/generationEta';
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
  /**
   * A quieter hero, for a card that already carries a heading. The number stays the same size class
   * of thing — a countdown, not a label — but it no longer competes with the card's own title.
   */
  compact?: boolean;
}> = ({ run, active, isDark, variant, target = 'until your ad kit is ready', compact = false }) => {
  const view = useRunClock(run, active);
  if (!view) return null;
  const over = !!view.overLabel;

  if (variant === 'inline') {
    return (
      <span
        data-test="run-countdown-inline"
        aria-live="off"
        className={cn('ag-chip ag-num h-7 px-2.5 text-[11px]', over ? 'ag-badge--warn' : 'ag-badge--run')}
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
        className={cn('ag-num leading-none', compact ? 'text-[26px]' : 'text-5xl sm:text-6xl', over ? 'text-amber-300' : BRAND_TEXT)}
      >
        {over ? `+${view.overLabel}` : view.label}
      </div>
      <p className={cn('ag-eyebrow', compact ? 'mt-0.5 text-[9px]' : 'mt-2 text-[10px]')}>
        {view.finishing ? 'Finishing up' : over ? 'Past the estimate' : compact ? 'left' : target}
      </p>
      {view.calibrating && !over && !compact && (
        <p className="ag-muted mt-1 text-[10px]">
          First run on this device — the estimate sharpens with every run
        </p>
      )}
    </div>
  );
};

// ── DTS's side: the pipeline, as milestones ─────────────────────────────────────────────────────

/** The icon each stage of the pipeline is known by — a brief to read, a line to write, a film to direct. */
const STAGE_ICON: Record<string, LucideIcon> = {
  brief: FileText,
  message: MessageSquare,
  script: Mic,
  scout: MapPin,
  assets: ImageIcon,
  direct: Video,
  concepts: ImageIcon,
};

/**
 * Where DTS is in this run, as numbered milestones.
 *
 * It lives in the Generation Status card (the member's first glance), which is why it is exported
 * rather than drawn inside the workspace below: the two must never disagree about which stage is
 * running, so both read the same `missionStages()`.
 */
export const MissionStepper: React.FC<{ profile: RunProfile; checkpoints: Checkpoint[] }> = ({ profile, checkpoints }) => {
  const reduce = useReducedMotion();
  const stages = missionStages(profile, checkpoints);
  const activeIndex = stages.findIndex((s) => s.state === 'active');
  return (
    <>
      <ol className="ag-steps" aria-label="DTS progress" data-test="mission-stepper">
        {stages.map((stage, i) => {
          const Icon = STAGE_ICON[stage.key] || FileText;
          return (
            <React.Fragment key={stage.key}>
              {i > 0 && <li aria-hidden className={cn('ag-stepline', stages[i - 1].state === 'done' && 'ag-stepline--done')} />}
              <li className="ag-steps__item" aria-current={stage.state === 'active' ? 'step' : undefined}>
                <motion.span
                  className={cn('ag-stepnode', stage.state === 'done' && 'ag-stepnode--done', stage.state === 'active' && 'ag-stepnode--active')}
                  animate={stage.state === 'active' && !reduce ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={{ duration: 2, repeat: stage.state === 'active' && !reduce ? Infinity : 0, ease: 'easeInOut' }}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  {stage.state === 'done' && (
                    <span className="ag-stepnode__check"><Check className="w-3 h-3" strokeWidth={3} /></span>
                  )}
                </motion.span>
                <span className={cn('ag-num mt-2 text-[11px]', stage.state === 'upcoming' ? 'text-slate-600' : 'text-slate-300')}>{i + 1}</span>
                {/* Five labels in a phone's width truncate into noise — there, one "Now" line says it instead. */}
                <span className={cn(
                  'mt-0.5 hidden sm:block text-[11px] leading-tight',
                  stage.state === 'active' ? 'text-slate-100 font-semibold' : stage.state === 'done' ? 'ag-muted' : 'text-slate-600',
                )} title={stage.label}>
                  {stage.label}
                </span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      {activeIndex >= 0 && (
        <p className="ag-muted sm:hidden mt-3 text-[11px]">
          Now: <span className="font-semibold text-slate-100">{stages[activeIndex].label}</span>
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
    <ol className="space-y-1.5">
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
              'ag-row ag-row--tight',
              isNext && 'ag-row--next',
              info && 'ag-row--info',
              complete && 'ag-row--done',
            )}
          >
            {/* number · what to do · the button that does it — the three columns of every guide row */}
            <div className="flex items-center gap-3">
              {info ? (
                <span className="ag-row__num ag-row__num--quiet shrink-0">
                  <Info className="w-4 h-4" />
                </span>
              ) : (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={complete}
                  aria-label={`Mark "${task.title}" ${complete ? 'not done' : 'done'}`}
                  onClick={() => onToggle(task.id, !complete)}
                  className={cn(
                    'ag-row__num shrink-0 transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                    complete && 'ag-btn--ok',
                  )}
                >
                  {complete ? <Check className="w-4 h-4" strokeWidth={3} /> : number}
                </button>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <p className={cn('text-[14px] font-semibold leading-snug',
                    complete || info ? 'ag-muted' : 'text-slate-100')}>
                    {task.title}
                  </p>
                  {isNext && (
                    <span className={cn('shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md text-white', BRAND_GRADIENT)}>
                      Next
                    </span>
                  )}
                </div>
                <p className="ag-muted mt-0.5 text-[12px] leading-snug">
                  {task.detail}
                </p>
              </div>

              {/* One tab per clip, or the one link this step is about. Right-aligned so every row
                  has its action in the same place, whatever the step says. */}
              {task.kind === 'tabs' && task.tabs && task.href && (
                <div className="shrink-0 flex flex-wrap justify-end gap-1.5 max-w-[180px]">
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
                        className={cn('ag-btn ag-btn--sm h-8 px-2.5 text-xs',
                          opened ? 'ag-btn--ok' : 'ag-btn--secondary')}
                      >
                        {opened ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <ExternalLink className="w-3.5 h-3.5 opacity-70" />}
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
                  className="ag-btn ag-btn--primary ag-btn--sm h-8 text-xs shrink-0"
                >
                  {task.linkLabel || 'Open'} <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>
              )}
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
  const start = tasks[0];

  return (
    <section
      data-test="mission-workspace"
      aria-label="Mission workspace"
      className="ag-card relative overflow-hidden"
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

      {/* The header reads like the card's own title bar: what this is, what run it belongs to, and
          the one link the whole checklist starts from. The pipeline's milestones are NOT repeated
          here — they live in the Generation Status card above (MissionStepper). */}
      <div className="relative">
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3">
          <span className="ag-ico ag-ico--sm shrink-0"><Sparkles className="w-[18px] h-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="ag-h2 text-[16px] sm:text-[17px] text-white leading-tight">AI Guide</h3>
            <p className="ag-muted mt-0.5 text-[12px] truncate">
              {poster ? 'Follow these steps while DTS writes your concepts' : 'Follow these steps while DTS writes your ad kit'}
              {' · '}{runSummary(run.facts)}
            </p>
          </div>
          <RunCountdown
            run={run}
            active
            isDark={isDark}
            variant="hero"
            compact
            target={poster ? 'until your concepts are ready' : 'until your ad kit is ready'}
          />
          {start?.href && (
            <a href={start.href} target="_blank" rel="noopener noreferrer"
              className="ag-btn ag-btn--primary ag-btn--sm hidden sm:inline-flex shrink-0">
              {poster ? 'Open in Gemini' : 'Open in ChatGPT'} <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          )}
        </div>

        <div className="px-4 sm:px-5 pb-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h4 className="ag-h2 text-[13px] text-slate-100">
              While DTS writes, set up your studio
            </h4>
            <span className={cn('ag-num shrink-0 text-[11px]', ready === total ? 'text-emerald-300' : 'ag-muted')}
              data-test="mission-ready-count">
              {ready === total ? 'Studio ready' : `${ready} of ${total} ready`}
            </span>
          </div>

          <MissionTaskList tasks={tasks} done={done} onToggle={onToggle} isDark={isDark} animate />

          <p className="ag-muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
            This workspace steps aside the moment your first asset arrives. Reopen it any time from AI Guide.
          </p>
        </div>
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
