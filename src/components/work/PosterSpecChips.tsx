/**
 * The poster brief as chips, for every card that lists a job — the member's, the leader's and the
 * admin's. Renders nothing for video work, so it can sit above the ad-spec chips unconditionally.
 */
import { isPosterCategory, posterSizeLabel } from "@/utils/posterSpec";
import { posterStyleLabel } from "@/services/posterStyles";

interface PosterSpecChipsProps {
  a: { category?: string; posterSize?: string; posterStyle?: string; posterCount?: number; festival?: string };
  className?: string;
}

export default function PosterSpecChips({ a, className = "" }: PosterSpecChipsProps) {
  if (!isPosterCategory(a.category)) return null;
  const chip = "text-[10px] px-1.5 py-0.5 rounded-full";
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} data-test="poster-spec-chips">
      <span className={`${chip} bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 font-medium`}>
        🖼️ Poster{a.posterCount && a.posterCount > 1 ? ` × ${a.posterCount}` : ""}
      </span>
      <span className={`${chip} font-mono bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>
        {posterSizeLabel(a.posterSize)}
      </span>
      <span className={`${chip} bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300`}>
        {posterStyleLabel(a.posterStyle)}
      </span>
      {a.festival?.trim() && (
        <span className={`${chip} bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`}>
          🎊 {a.festival.trim()}
        </span>
      )}
    </div>
  );
}
