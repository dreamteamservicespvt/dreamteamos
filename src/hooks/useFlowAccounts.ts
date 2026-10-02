/**
 * The live data behind the Flow Accounts section, scoped to who is looking.
 *
 * A member listens to their own accounts (the ones they added and the ones assigned to them); the
 * tech admin and team leaders listen to their team's. Every effect is keyed on primitives — the uid,
 * the team id — never on the user object, which is a new object on every profile snapshot and would
 * re-open the listeners each time (the read-quota rule in CLAUDE.md §28).
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import {
  isFlowManager, subscribeFlowCreditLogs, subscribeFlowSettings, subscribeMemberFlowAccounts, subscribeMemberPaidAccounts,
  subscribeTeamFlowAccounts, subscribeTeamPaidAccounts, teamAdminIdOf,
} from "@/services/flowAccounts";
import type { AppUser } from "@/types";
import type { FlowAccount, FlowCreditLog, FlowSettings, PaidAccount } from "@/types/flowAccounts";
import { DEFAULT_FLOW_SETTINGS } from "@/utils/flowAccounts";

type Viewer = Pick<AppUser, "uid" | "role" | "createdBy"> | null | undefined;

/** The accounts this person may see, live. */
export function useFlowAccountList(user: Viewer) {
  const uid = user?.uid || "";
  const manager = isFlowManager(user);
  const teamAdminId = user ? teamAdminIdOf(user) : "";
  const [accounts, setAccounts] = useState<FlowAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    setError("");
    const done = (list: FlowAccount[]) => { setAccounts(list); setLoading(false); };
    const failed = (e: Error) => { setError(e.message || "Could not load accounts"); setLoading(false); };
    return manager
      ? subscribeTeamFlowAccounts(teamAdminId, done, failed)
      : subscribeMemberFlowAccounts(uid, done, failed);
  }, [uid, manager, teamAdminId]);

  return { accounts, loading, error, manager, teamAdminId };
}

/** The drive's target and the price list, live. */
export function useFlowSettings(): FlowSettings {
  const [settings, setSettings] = useState<FlowSettings>(DEFAULT_FLOW_SETTINGS);
  useEffect(() => subscribeFlowSettings(setSettings), []);
  return settings;
}

/** One calendar month of spending — the member's own, or the whole team's for a manager. */
export function useFlowCreditLogs(user: Viewer, month: string) {
  const uid = user?.uid || "";
  const manager = isFlowManager(user);
  const teamAdminId = user ? teamAdminIdOf(user) : "";
  const [logs, setLogs] = useState<FlowCreditLog[]>([]);
  useEffect(() => {
    if (!uid || !month) return;
    return subscribeFlowCreditLogs(manager ? { teamAdminId } : { userId: uid }, month, setLogs);
  }, [uid, manager, teamAdminId, month]);
  return logs;
}

/** The paid accounts this person may see, live: all of the team's for a manager, the shared ones for a member. */
export function usePaidAccounts(user: Viewer) {
  const uid = user?.uid || "";
  const manager = isFlowManager(user);
  const teamAdminId = user ? teamAdminIdOf(user) : "";
  const [accounts, setAccounts] = useState<PaidAccount[]>([]);
  useEffect(() => {
    if (!uid) return;
    return manager ? subscribeTeamPaidAccounts(teamAdminId, setAccounts) : subscribeMemberPaidAccounts(uid, setAccounts);
  }, [uid, manager, teamAdminId]);
  return accounts;
}

export interface TechTeamMember {
  uid: string;
  name: string;
  role: AppUser["role"];
  isActive?: boolean;
}

/**
 * The tech team a manager assigns accounts to: the members and team leaders the tech admin created,
 * active, without the external creators (outsiders who only use the ad tool). One equality query.
 */
export function useTechTeam(teamAdminId: string, enabled = true) {
  const [members, setMembers] = useState<TechTeamMember[]>([]);
  useEffect(() => {
    if (!teamAdminId || !enabled) return;
    return onSnapshot(query(collection(db, "users"), where("createdBy", "==", teamAdminId)), (snap) => {
      setMembers(snap.docs
        .map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, "uid">) }) as AppUser)
        .filter((u) => (u.role === "tech_member" || u.role === "tech_team_leader") && u.isActive !== false && !u.externalCreator)
        .map((u) => ({ uid: u.uid, name: u.name || u.email || "Member", role: u.role, isActive: u.isActive }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => console.error("[useTechTeam]", err));
  }, [teamAdminId, enabled]);
  return members;
}

/** Name of a user, from the team list or from what the account itself recorded. */
export function useNameOf(members: TechTeamMember[], accounts: FlowAccount[]) {
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const a of accounts) {
      if (a.addedBy && a.addedByName) names.set(a.addedBy, a.addedByName);
      if (a.assignedTo && a.assignedToName) names.set(a.assignedTo, a.assignedToName);
    }
    for (const m of members) names.set(m.uid, m.name);
    return (uid?: string | null) => (uid ? names.get(uid) || "Member" : "");
  }, [members, accounts]);
}
