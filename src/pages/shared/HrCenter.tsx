/**
 * HR & Documents — the whole team's paperwork on one page.
 *
 * Documents used to be reachable only through the person who held them, which answers "what has
 * Asha got?" and no other question. The ones people actually ask are team-shaped: who has never
 * been given an appointment letter, who has not signed their NDA, what went out last month. Each
 * of those was a walk through every member's profile.
 *
 * The old Agreements page is folded in here rather than left beside it. It was already half this
 * page — it carried the missing-letters panel — and having two places called "documents" meant
 * every letter had two plausible homes. Pasting an agreement is still its own tab, because it is a
 * genuinely different job: somebody else's document reproduced verbatim, versus a letter this
 * company generates from its own records.
 *
 * Costs: one chunked subscription for the team's documents and one for their profiles — the same
 * two the Agreements page already opened. Reads scale with the number of documents, not with the
 * number of employees, which is what keeps this affordable on a Firestore free tier.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { FileSignature, FileStack, FolderOpen, Users } from "lucide-react";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { watchTeamProfiles } from "@/services/hr";
import { watchTeamDocuments } from "@/services/hrDocuments";
import { departmentOfRole } from "@/utils/hrPolicy";
import { findMissingLetters } from "@/utils/missingLetters";
import AllDocumentsPanel from "@/components/hr/AllDocumentsPanel";
import MissingLettersPanel from "@/components/hr/MissingLettersPanel";
import SendAgreement from "@/pages/shared/SendAgreement";
import type { AppUser } from "@/types";
import type { EmployeeProfile, HrDocument } from "@/types/hr";

const memberProfileLink = (role: string): string =>
  role === "sales_member" ? "/sales/profile" : role === "tech_member" ? "/tech/profile" : "";

type TabKey = "documents" | "missing" | "agreements";

const TABS: { key: TabKey; label: string; Icon: typeof FileStack }[] = [
  { key: "documents", label: "All documents", Icon: FileStack },
  { key: "missing", label: "Missing paperwork", Icon: Users },
  { key: "agreements", label: "Agreements", Icon: FileSignature },
];

export default function HrCenter() {
  const user = useAuthStore((s) => s.user);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [profiles, setProfiles] = useState<Map<string, EmployeeProfile>>(new Map());
  const [documents, setDocuments] = useState<HrDocument[]>([]);
  const [tab, setTab] = useState<TabKey>("documents");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => setAllUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))),
    );
    return () => unsub();
  }, []);

  /** Exactly the people this admin is responsible for — the same rule the Agreements page used. */
  const members = useMemo(() => {
    if (!user) return [] as AppUser[];
    let allowedRoles: string[] = [];
    let teamAdminUid = user.uid;
    if (user.role === "tech_admin") allowedRoles = ["tech_member", "tech_team_leader"];
    else if (user.role === "sales_admin") allowedRoles = ["sales_member"];
    else if (user.role === "tech_team_leader") { allowedRoles = ["tech_member"]; teamAdminUid = user.createdBy; }
    return allUsers
      .filter((u) => allowedRoles.includes(u.role) && u.createdBy === teamAdminUid && u.isActive !== false)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allUsers, user]);

  // Keyed on the uid list rather than the array so this does not re-subscribe on every render.
  const memberUidKey = members.map((m) => m.uid).sort().join(",");
  const department = departmentOfRole(user?.role) || "tech";

  useEffect(() => {
    const uids = memberUidKey ? memberUidKey.split(",") : [];
    if (uids.length === 0) { setProfiles(new Map()); setDocuments([]); return; }
    const stopProfiles = watchTeamProfiles(uids, department, setProfiles);
    const stopDocs = watchTeamDocuments(uids, setDocuments);
    return () => { stopProfiles(); stopDocs(); };
  }, [memberUidKey, department]);

  const missingLetters = useMemo(
    () => findMissingLetters(members, profiles, documents),
    [members, profiles, documents],
  );

  const awaiting = documents.filter((d) => d.requiresEmployeeSignature && d.status === "issued").length;
  const missingCount = missingLetters.reduce((n, r) => n + r.missing.length, 0);
  const settingsPath = user?.role === "sales_admin" ? "/sales-admin/settings" : "/tech-admin/settings";

  const badge = (key: TabKey): number =>
    key === "documents" ? awaiting : key === "missing" ? missingCount : 0;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="font-display flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
          <FolderOpen className="h-5 w-5 text-primary" /> HR &amp; Documents
        </h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          Every letter this company has issued, who is still missing theirs, and the agreements
          waiting to be signed.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-test={`hr-tab-${key}`}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
            {badge(key) > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                tab === key ? "bg-primary-foreground/20" : "bg-warning/20 text-warning"
              }`}>
                {badge(key)}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "documents" && <AllDocumentsPanel documents={documents} />}

      {tab === "missing" && user && (
        <MissingLettersPanel
          rows={missingLetters}
          signatory={user}
          settingsPath={settingsPath}
          memberLink={(m) => memberProfileLink(m.role)}
        />
      )}

      {tab === "agreements" && <SendAgreement embedded />}
    </div>
  );
}
