import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Boxes, Briefcase, ClipboardCheck, DoorOpen, FileSignature, IdCard, Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { watchEmployeeProfile } from "@/services/hr";
import { watchMemberDocuments } from "@/services/hrDocuments";
import { departmentOfRole, kycCompletion, lifecycleSteps } from "@/utils/hrPolicy";
import type { EmployeeProfile, HrDocument } from "@/types/hr";
import LifecycleTracker from "./LifecycleTracker";
import DocumentsPanel from "./DocumentsPanel";
import EmploymentTermsCard from "./EmploymentTermsCard";
import KycPanel from "./KycPanel";
import AssetsPanel from "./AssetsPanel";
import ProbationPanel from "./ProbationPanel";
import SeparationPanel from "./SeparationPanel";
import IdCardPanel from "./IdCardPanel";
import { EngagementChip, SectionCard, StageChip } from "./ui";

/**
 * The employee's own view of their employment — the same record their admin sees, minus the
 * controls that are not theirs.
 *
 * They can do exactly the three things that are genuinely theirs to do: sign the documents they
 * have been sent, confirm the assets they were given, and resign. Everything else is read-only,
 * including their own probation reviews — which they should see, because a review nobody shows
 * you is not feedback.
 */

type TabKey = "employment" | "details" | "documents" | "idcard" | "assets" | "exit";

const TABS: { key: TabKey; label: string; Icon: typeof Briefcase }[] = [
  { key: "employment", label: "My employment", Icon: Briefcase },
  { key: "details", label: "My details", Icon: IdCard },
  { key: "documents", label: "Documents", Icon: FileSignature },
  { key: "idcard", label: "ID card", Icon: BadgeCheck },
  { key: "assets", label: "Assets", Icon: Boxes },
  { key: "exit", label: "Resignation", Icon: DoorOpen },
];

export default function MyEmploymentPanel() {
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  /** False until HR has actually set this person's terms — see MemberProfileDetail for why. */
  const [hasHrRecord, setHasHrRecord] = useState(false);
  const [documents, setDocuments] = useState<HrDocument[]>([]);
  const [tab, setTab] = useState<TabKey>("employment");

  const department = departmentOfRole(user?.role) || "tech";

  useEffect(() => {
    if (!user?.uid) return;
    const unsubs = [
      watchEmployeeProfile(user.uid, department, (p, exists) => { setProfile(p); setHasHrRecord(exists); }),
      watchMemberDocuments(user.uid, setDocuments),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, department]);

  const steps = useMemo(
    () => (profile ? lifecycleSteps(profile, documents, { employeeId: user?.employeeId }) : []),
    [profile, documents, user?.employeeId],
  );

  if (!user) return null;

  if (!profile) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  const actor = { uid: user.uid, name: user.name };
  // The user too, so an avatar uploaded before the HR record existed counts as the photograph.
  const kyc = kycCompletion(profile, user);
  const pendingSignatures = documents.filter((d) => d.requiresEmployeeSignature && d.status === "issued").length;
  const unacknowledged = (profile.assets || []).filter((a) => !a.returnedOn && !a.acknowledgedAt).length;

  const badge: Partial<Record<TabKey, string>> = {
    documents: pendingSignatures ? String(pendingSignatures) : "",
    assets: unacknowledged ? String(unacknowledged) : "",
    details: kyc.complete ? "" : `${kyc.done}/${kyc.total}`,
  };

  return (
    <div className="space-y-4" data-test="my-employment">
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-test={`my-tab-${key}`}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
            {badge[key] && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === key ? "bg-primary-foreground/20" : "bg-warning/20 text-warning"}`}>
                {badge[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "employment" && (
        <div className="space-y-4">
          {/* The employee fills their own employment record in — see EmploymentTermsCard for why
              their entries stay marked self-declared until an admin confirms them. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {hasHrRecord ? (
              <>
                <StageChip stage={profile.stage} engagement={profile.engagementType} />
                <EngagementChip engagement={profile.engagementType} />
              </>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Not set up yet
              </span>
            )}
          </div>

          <EmploymentTermsCard
            profile={profile}
            actor={actor}
            mode="employee"
            employeeId={user.employeeId}
          />

          <LifecycleTracker steps={steps} />

          {/* Your own reviews. A review nobody shows you is not feedback. */}
          <ProbationPanel profile={profile} actor={actor} readOnly />
        </div>
      )}

      {tab === "details" && <KycPanel profile={profile} actor={actor} user={user} />}

      {tab === "documents" && (
        <DocumentsPanel
          member={user}
          profile={profile}
          documents={documents}
          readOnly
          canSign
        />
      )}

      {tab === "idcard" && (
        <SectionCard
          title="My ID card"
          icon={<BadgeCheck size={15} className="text-primary" />}
        >
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Your card is generated from your employment record, so it stays correct on its own —
            change your photo or your details and the card follows. Download the PNG to send it to
            anyone, or the PDF to print it at real card size.
          </p>
          <IdCardPanel member={user} profile={profile} />
        </SectionCard>
      )}

      {tab === "assets" && (
        <AssetsPanel profile={profile} actor={actor} readOnly canAcknowledge />
      )}

      {tab === "exit" && <SeparationPanel profile={profile} actor={actor} mode="employee" />}
    </div>
  );
}
