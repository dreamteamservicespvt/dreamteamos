/**
 * The Development OS frame: the product's name, the person's rank, and the sections as tabs (sideways-scrolling on a
 * phone). On first open it asks the server to make sure today's tasks exist (`bootstrap`) and, in the background, to
 * catch up the scheduled work if the cron has not run (`catchup` — the server does it; nothing waits for it).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, BrainCircuit, History, Home, Map, ShieldCheck, Swords, Trophy, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { rankLabel } from "@/devos/core/policy";
import { useDevOs } from "./context";
import { purgeOtherDrafts } from "./drafts";
import { RankBadge } from "./kit";
import { useAutoGrade } from "./useAutoGrade";
import { useDevAttempts } from "@/hooks/useDevOs";

const TABS = [
  { to: "/dev-os", label: "Home", icon: Home, end: true },
  { to: "/dev-os/skills", label: "Skills", icon: BarChart3 },
  { to: "/dev-os/path", label: "My path", icon: Map },
  { to: "/dev-os/rank", label: "Career", icon: Trophy },
  { to: "/dev-os/arena", label: "Arena", icon: Swords },
  { to: "/dev-os/history", label: "History", icon: History },
  { to: "/dev-os/profile", label: "Profile", icon: UserRound },
];

export function DevOsShell({ children }: { children: ReactNode }) {
  const { user, profile, policy, canSeeAdmin, run, setTodayReason } = useDevOs();
  const booted = useRef(false);
  const location = useLocation();
  const playing = location.pathname.startsWith("/dev-os/play/");
  // External creators and switched-off accounts are not part of it (the server refuses them too): say so plainly
  // instead of showing the first-run invitation that only fails at the end of onboarding (found in the browser test).
  const outsider = !!user?.externalCreator || user?.isActive === false;

  useEffect(() => {
    if (!user?.uid || booted.current || outsider) return;
    booted.current = true;
    purgeOtherDrafts(user.uid); // a shared browser never shows one person's unsent work to the next (drafts.ts)
    void (async () => {
      const r = await run<{ catchupDue?: boolean; today?: { reason?: string } }>("bootstrap", {}, { quiet: true });
      setTodayReason(r?.today?.reason ?? null);
      if (r?.catchupDue) void run("catchup", {}, { quiet: true });
      void run("boards", {}, { quiet: true });
    })();
  }, [user?.uid, run, outsider, setTodayReason]);

  if (outsider) {
    return (
      <div className="max-w-6xl mx-auto w-full space-y-4" data-test="devos-shell">
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2" data-test="devos-outsider">
          <BrainCircuit className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden />
          <p className="font-semibold">The Development OS is for active team members</p>
          <p className="text-sm text-muted-foreground">{user?.isActive === false ? "Your account is switched off." : "Your account is set up for the ad studio only."} If you think this is a mistake, ask your admin.</p>
        </div>
      </div>
    );
  }

  const active = profile?.status === "active";
  return (
    // AppLayout's <main> already pads the page (p-4 / md:p-6) and is the page's one main landmark, so the frame adds
    // neither: a second padding cost 24px of a 390px phone, and a nested <main> is invalid.
    <div className="max-w-6xl mx-auto w-full space-y-4" data-test="devos-shell">
      {!playing && (
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary via-fuchsia-500 to-sky-500 grid place-items-center shadow-md">
              <BrainCircuit className="h-6 w-6 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-bold leading-tight truncate">AI Development OS</h1>
              <p className="text-xs text-muted-foreground truncate">Ten skills · fresh challenges every day · ranks you earn</p>
            </div>
          </div>
          {/* The badge keeps its size; the title truncates instead (at 390px the label read "B…" — browser test). */}
          {active && profile && <div className="shrink-0"><RankBadge level={profile.rank.level} label={rankLabel(policy, profile.rank.level)} size="md" /></div>}
        </header>
      )}
      {!playing && (
        <nav className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto" aria-label="Development OS sections">
          <div className="flex gap-1.5 min-w-max border-b border-border pb-2">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors min-h-[40px]",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                data-test={`devos-tab-${t.label.toLowerCase().replace(/\s/g, "-")}`}>
                <t.icon className="h-4 w-4" aria-hidden /> {t.label}
              </NavLink>
            ))}
            {canSeeAdmin && (
              <NavLink to="/dev-os/admin"
                className={({ isActive }) => cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors min-h-[40px] border border-dashed",
                  isActive ? "bg-foreground text-background border-foreground" : "text-foreground border-border hover:bg-muted")}
                data-test="devos-tab-admin">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Control Center
              </NavLink>
            )}
          </div>
        </nav>
      )}
      <div className="min-w-0">{children}</div>
      {/* While any written answer of theirs waits for a grade, it is graded from whichever screen is open. */}
      {active && profile && profile.stats.pending > 0 && <PendingGrader uid={user.uid} onToday={setTodayReason} />}
    </div>
  );
}

function PendingGrader({ uid, onToday }: { uid: string; onToday: (r: string | null) => void }) {
  const { data } = useDevAttempts(uid, 20);
  useAutoGrade(data, onToday);
  return null;
}
