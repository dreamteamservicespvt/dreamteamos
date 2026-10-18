/**
 * What every Development OS screen shares: the signed-in person, their live profile and tasks (one listener each,
 * for the whole page), the policy, whether they may open the Control Center, and `run` — a server action with a
 * toast on failure.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { callDevOs, DevOsError } from "@/services/devosApi";
import { useDevProfile, useDevTasks, usePolicy } from "@/hooks/useDevOs";
import type { DevPolicy } from "@/devos/core/policy";
import type { DevProfile, DevTask } from "@/devos/core/types";
import type { AppUser } from "@/types";

export interface DevOsCtx {
  user: AppUser;
  profile: DevProfile | null;
  profileLoading: boolean;
  tasks: DevTask[];
  policy: DevPolicy;
  isPlatformAdmin: boolean;
  canSeeAdmin: boolean;
  busy: string | null;
  run: <T = unknown>(action: string, body?: Record<string, unknown>, opts?: { quiet?: boolean; label?: string }) => Promise<T | null>;
  /** Why there is no quest today, as the server said on opening ("day_off", "on_leave", …) — null when unknown / none. */
  todayReason: string | null;
  setTodayReason: (r: string | null) => void;
}

const Ctx = createContext<DevOsCtx | null>(null);

export function DevOsProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user) as AppUser;
  const { toast } = useToast();
  const { data: rawProfile, loading: profileLoading } = useDevProfile(user?.uid);
  // Only a complete profile reaches the screens: a half-written one (see engine/learner.ensureProfile) is treated as
  // "not started" — the bootstrap that runs on opening completes it, and the live listener then brings it in.
  const profile = rawProfile && rawProfile.onboarding && rawProfile.dims && rawProfile.stats && rawProfile.gates ? rawProfile : null;
  const { data: tasks } = useDevTasks(user?.uid);
  const { policy } = usePolicy();
  const [busy, setBusy] = useState<string | null>(null);
  const [todayReason, setTodayReason] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const run = useCallback(async <T,>(action: string, body: Record<string, unknown> = {}, opts: { quiet?: boolean; label?: string } = {}): Promise<T | null> => {
    const key = `${action}:${JSON.stringify(body)}`;
    if (inFlight.current.has(key)) return null; // a double tap never sends twice
    inFlight.current.add(key);
    setBusy(opts.label ?? action);
    try {
      return await callDevOs<T>(action, body);
    } catch (e) {
      if (!opts.quiet) {
        const msg = e instanceof DevOsError ? e.message : "Something went wrong — please try again.";
        toast({ title: e instanceof DevOsError && e.status === 429 ? "Slow down a little" : "Could not finish that", description: msg, variant: "destructive" });
      }
      return null;
    } finally {
      inFlight.current.delete(key);
      setBusy(null);
    }
  }, [toast]);

  const value = useMemo<DevOsCtx>(() => {
    const isPlatformAdmin = user?.role === "main_admin" || user?.role === "tech_admin";
    return { user, profile, profileLoading, tasks, policy, isPlatformAdmin, canSeeAdmin: isPlatformAdmin || user?.role === "sales_admin", busy, run, todayReason, setTodayReason };
  }, [user, profile, profileLoading, tasks, policy, busy, run, todayReason]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevOs(): DevOsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDevOs outside DevOsProvider");
  return v;
}
