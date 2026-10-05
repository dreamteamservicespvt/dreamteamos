/**
 * The calendar's three marks (2026-10-05) — ✔ posted, ✖ not posted, ◷ coming up.
 *
 * Each is a shape, a colour and (beside it, wherever there is room) a word, so it reads for a colour-blind
 * person and for someone who does not read English well alike. Solid circles with a white sign: the
 * strongest thing on the page, and the same everywhere — the three counts, a day, a post.
 */
import { Check, Clock3, X } from "lucide-react";
import type { DayMark } from "@/utils/smmCalendar";

const STYLE: Record<DayMark, { circle: string; Icon: typeof Check }> = {
  posted: { circle: "bg-viz-done text-white", Icon: Check },
  notPosted: { circle: "bg-viz-late text-white", Icon: X },
  coming: { circle: "bg-muted-foreground/25 text-foreground", Icon: Clock3 },
};

/**
 * Fixed sizes — the calendar picks one by the room it measures for itself, never by the screen (it sits
 * beside the sidebar, the client list or inside a tab). `xs` leads a post's name inside a day, `day` is a
 * day's mark when there is no room for names, `md` a post's card and a count.
 */
const SIZE = {
  xs: { box: "h-3.5 w-3.5", icon: "h-2.5 w-2.5", stroke: 3.5 },
  day: { box: "h-5 w-5", icon: "h-3 w-3", stroke: 3.5 },
  md: { box: "h-8 w-8", icon: "h-[17px] w-[17px]", stroke: 3 },
  lg: { box: "h-10 w-10", icon: "h-[22px] w-[22px]", stroke: 3 },
};

export function MarkIcon({ mark, size = "day" }: { mark: DayMark; size?: keyof typeof SIZE }) {
  const { circle, Icon } = STYLE[mark];
  const s = SIZE[size];
  return (
    <span aria-hidden data-mark={mark} className={`inline-flex shrink-0 items-center justify-center rounded-full ${s.box} ${circle}`}>
      <Icon className={s.icon} strokeWidth={s.stroke} />
    </span>
  );
}
