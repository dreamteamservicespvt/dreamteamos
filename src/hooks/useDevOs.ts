/**
 * The Development OS's reads in the browser (2026-10-18). The learner reads ONLY their own documents (profile, tasks,
 * sessions, attempts, ledgers) plus the published boards / league / mission documents; everything is written by the
 * server (`services/devosApi`). Listeners are scoped and limited (read quota, CLAUDE.md §28) and keyed on the uid.
 */
import { useEffect, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/services/firebase";
import { parsePolicy, DEFAULT_POLICY, type DevPolicy } from "@/devos/core/policy";
import type { Achievement, BoardsDoc, DevAttempt, DevProfile, DevSession, DevTask, LeagueRound, RankEvent, TeamMission, XpTransaction } from "@/devos/core/types";

export interface Live<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

function useDocLive<T>(path: string | null, initial: T): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: initial, loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: initial, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(doc(db, path), (snap) => setState({ data: (snap.exists() ? snap.data() : initial) as T, loading: false, error: null }),
      (e) => setState({ data: initial, loading: false, error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return state;
}

function useQueryLive<T>(path: string | null, order: string, max: number): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    return onSnapshot(query(collection(db, path), orderBy(order, "desc"), limit(max)),
      (snap) => setState({ data: snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T), loading: false, error: null }),
      (e) => setState({ data: [], loading: false, error: e.message }));
  }, [path, order, max]);
  return state;
}

export const useDevProfile = (uid: string | undefined) => useDocLive<DevProfile | null>(uid ? `devos_users/${uid}` : null, null);

export const useDevTasks = (uid: string | undefined, max = 40) => useQueryLive<DevTask>(uid ? `devos_users/${uid}/tasks` : null, "createdAt", max);

export const useDevTask = (uid: string | undefined, taskId: string | undefined) =>
  useDocLive<DevTask | null>(uid && taskId ? `devos_users/${uid}/tasks/${taskId}` : null, null);

export const useDevSession = (uid: string | undefined, taskId: string | undefined) =>
  useDocLive<DevSession | null>(uid && taskId ? `devos_users/${uid}/sessions/${taskId}` : null, null);

export const useDevAttempt = (uid: string | undefined, attemptId: string | undefined) =>
  useDocLive<DevAttempt | null>(uid && attemptId ? `devos_users/${uid}/attempts/${attemptId}` : null, null);

export const useDevAttempts = (uid: string | undefined, max = 50) => useQueryLive<DevAttempt>(uid ? `devos_users/${uid}/attempts` : null, "createdAt", max);

export const useDevXp = (uid: string | undefined, max = 60) => useQueryLive<XpTransaction>(uid ? `devos_users/${uid}/xp` : null, "recordedAt", max);

export const useBoards = (seasonId: string | undefined) => useDocLive<BoardsDoc | null>(seasonId ? `devos_boards/${seasonId}` : null, null);

export const useLeague = (roundId: string | undefined) => useDocLive<LeagueRound | null>(roundId ? `devos_leagues/${roundId}` : null, null);

export const useMission = (missionId: string | undefined) => useDocLive<TeamMission | null>(missionId ? `devos_missions/${missionId}` : null, null);

/** The policy, read leniently (a missing document = the defaults). */
export function usePolicy(): { policy: DevPolicy; loading: boolean } {
  const live = useDocLive<Record<string, unknown> | null>("devos_config/policy", null);
  return { policy: live.data ? parsePolicy(live.data) : DEFAULT_POLICY, loading: live.loading };
}

/** One-shot reads for the Career page (they change rarely). */
export function useCareer(uid: string | undefined) {
  const [state, setState] = useState<{ ranks: RankEvent[]; badges: Achievement[]; loading: boolean }>({ ranks: [], badges: [], loading: true });
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    Promise.all([getDocs(collection(db, `devos_users/${uid}/rank_events`)), getDocs(collection(db, `devos_users/${uid}/achievements`))])
      .then(([r, b]) => alive && setState({ ranks: r.docs.map((d) => d.data() as RankEvent), badges: b.docs.map((d) => d.data() as Achievement), loading: false }))
      .catch(() => alive && setState((s) => ({ ...s, loading: false })));
    return () => { alive = false; };
  }, [uid]);
  return state;
}
