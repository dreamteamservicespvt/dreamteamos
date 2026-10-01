/**
 * Live data for the AI Accounts screens — every listener scoped to the team or to the person, and
 * keyed on primitive ids, never on the user object (a new object arrives on every profile snapshot).
 *
 *  • a manager (tech admin / team leader) listens to their team: `teamAdminId == X`;
 *  • a member listens to what they can see: `visibleTo array-contains uid` / `assignedTo array-contains uid`;
 *  • usage history is read by month (`month == yyyy-MM`) — two equality filters, so no composite
 *    index is needed and a month's history is the only thing read.
 */
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { AppUser } from "@/types";
import type { FlowAccount, FlowSettings, FlowUsageEntry, PaidAccount } from "@/types/aiAccounts";
import { FLOW_ACCOUNTS, FLOW_SETTINGS_DOC, FLOW_USAGE, PAID_ACCOUNTS } from "@/services/aiAccounts";
import { canManageAiAccounts, teamAdminIdOf, withFlowDefaults } from "@/utils/flowCredits";

type Viewer = Pick<AppUser, "uid" | "role" | "createdBy"> | null | undefined;

/** The credit rates, monthly credits, validity and target — saved values over the defaults. */
export function useFlowSettings(): FlowSettings {
  const [settings, setSettings] = useState<FlowSettings>(() => withFlowDefaults());
  useEffect(() => onSnapshot(
    doc(db, ...FLOW_SETTINGS_DOC),
    (snap) => {
      const next = withFlowDefaults(snap.exists() ? (snap.data() as Partial<FlowSettings>) : null);
      // The same object while nothing changed (a cache answer then the server's): the settings
      // dialog re-reads these whenever they change, and must not be reset under someone typing.
      setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    },
    (err) => console.warn("Flow settings could not be read; using the defaults.", err),
  ), []);
  return settings;
}

const scopeOf = (viewer: Viewer) => ({
  uid: viewer?.uid || "",
  manager: canManageAiAccounts(viewer),
  team: teamAdminIdOf(viewer),
});

/** The Flow accounts this viewer may see, live. */
export function useFlowAccounts(viewer: Viewer): { accounts: FlowAccount[]; loading: boolean } {
  const { uid, manager, team } = scopeOf(viewer);
  const [accounts, setAccounts] = useState<FlowAccount[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const q = manager
      ? query(collection(db, FLOW_ACCOUNTS), where("teamAdminId", "==", team))
      : query(collection(db, FLOW_ACCOUNTS), where("visibleTo", "array-contains", uid));
    return onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map((d) => ({ ...(d.data() as FlowAccount), id: d.id }))
        .sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || "") || a.createdOn.localeCompare(b.createdOn)));
      setLoading(false);
    }, (err) => { console.warn("Flow accounts could not be read.", err); setLoading(false); });
  }, [uid, manager, team]);
  return { accounts, loading };
}

/** One month of credit entries — the whole team's for a manager (or just their own, when asked), a member's own. */
export function useFlowUsage(viewer: Viewer, month: string, options: { own?: boolean } = {}): { entries: FlowUsageEntry[]; loading: boolean } {
  const { uid, manager, team } = scopeOf(viewer);
  const teamWide = manager && !options.own;
  const [entries, setEntries] = useState<FlowUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid || !month) return;
    setLoading(true);
    const q = teamWide
      ? query(collection(db, FLOW_USAGE), where("teamAdminId", "==", team), where("month", "==", month))
      : query(collection(db, FLOW_USAGE), where("userId", "==", uid), where("month", "==", month));
    return onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ ...(d.data() as FlowUsageEntry), id: d.id }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoading(false);
    }, (err) => { console.warn("Credit entries could not be read.", err); setLoading(false); });
  }, [uid, teamWide, team, month]);
  return { entries, loading };
}

/** The paid accounts this viewer may see — every one for a manager, the ones assigned to them for a member. */
export function usePaidAccounts(viewer: Viewer): { accounts: PaidAccount[]; loading: boolean } {
  const { uid, manager, team } = scopeOf(viewer);
  const [accounts, setAccounts] = useState<PaidAccount[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const q = manager
      ? query(collection(db, PAID_ACCOUNTS), where("teamAdminId", "==", team))
      : query(collection(db, PAID_ACCOUNTS), where("assignedTo", "array-contains", uid));
    return onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map((d) => ({ ...(d.data() as PaidAccount), id: d.id }))
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label)));
      setLoading(false);
    }, (err) => { console.warn("Paid accounts could not be read.", err); setLoading(false); });
  }, [uid, manager, team]);
  return { accounts, loading };
}

/**
 * The tech team behind a tech admin: its members and team leaders (active, not external creators) —
 * who accounts are assigned to and who the target applies to. The admin themselves is listed first,
 * so a backup account they hold has a name.
 */
export function useTechTeam(teamAdminId: string): { people: AppUser[]; loading: boolean } {
  const [people, setPeople] = useState<AppUser[]>([]);
  const [admin, setAdmin] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!teamAdminId) return;
    const unsubTeam = onSnapshot(query(collection(db, "users"), where("createdBy", "==", teamAdminId)), (snap) => {
      setPeople(snap.docs
        .map((d) => ({ ...(d.data() as AppUser), uid: d.id }))
        .filter((u) => (u.role === "tech_member" || u.role === "tech_team_leader") && u.isActive !== false && !u.externalCreator)
        .sort((a, b) => (a.role === b.role ? (a.name || "").localeCompare(b.name || "") : a.role === "tech_team_leader" ? -1 : 1)));
      setLoading(false);
    }, (err) => { console.warn("The tech team could not be read.", err); setLoading(false); });
    const unsubAdmin = onSnapshot(doc(db, "users", teamAdminId), (snap) => {
      setAdmin(snap.exists() ? ({ ...(snap.data() as AppUser), uid: snap.id }) : null);
    }, () => setAdmin(null));
    return () => { unsubTeam(); unsubAdmin(); };
  }, [teamAdminId]);
  return { people: admin ? [admin, ...people.filter((p) => p.uid !== admin.uid)] : people, loading };
}
