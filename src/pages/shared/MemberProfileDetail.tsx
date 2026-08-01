import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";
import {
  ArrowLeft, BarChart3, Banknote, Boxes, Briefcase, Check, ClipboardCheck, DoorOpen, ExternalLink,
  FileSignature, IdCard, Loader2, MessageCircle, Pencil, Phone, ShoppingBag, User as UserIcon, X,
} from "lucide-react";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { setEmployeeId } from "@/services/employment";
import { watchEmployeeProfile } from "@/services/hr";
import { watchMemberDocuments } from "@/services/hrDocuments";
import { watchEmployeeBank, accountSummary } from "@/services/payroll";
import { departmentOfRole, kycCompletion, lifecycleSteps, noticePeriodFor } from "@/utils/hrPolicy";
import { getRoleColor, getRoleLabel } from "@/utils/roleHelpers";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getCallUrl, getWhatsAppUrl } from "@/utils/phone";
import { PAYOUT_METHOD_LABELS, type EmployeeBank } from "@/types/payroll";
import type { AppUser } from "@/types";
import type { Department, EmployeeProfile, HrDocument, HrDocumentType } from "@/types/hr";
import EditMemberModal from "@/components/EditMemberModal";
import LifecycleTracker from "@/components/hr/LifecycleTracker";
import EmploymentTermsCard from "@/components/hr/EmploymentTermsCard";
import KycPanel from "@/components/hr/KycPanel";
import DocumentsPanel from "@/components/hr/DocumentsPanel";
import ProbationPanel from "@/components/hr/ProbationPanel";
import AssetsPanel from "@/components/hr/AssetsPanel";
import SeparationPanel from "@/components/hr/SeparationPanel";
import IssueDocumentDialog from "@/components/hr/IssueDocumentDialog";
import { EngagementChip, Field, SectionCard, StageChip } from "@/components/hr/ui";

/**
 * One team member, in full.
 *
 * Reached by clicking a member anywhere in My Team. Everything the company knows about that
 * person is here — their account, their pay, their employment terms, their KYC, the documents
 * they have signed, their probation reviews, the assets they hold and their exit if they are
 * leaving. The tabs exist only because it is a lot to show at once; nothing is hidden behind them
 * that the summary and the lifecycle strip do not already announce.
 *
 * The same page serves the tech admin and the sales admin; the department decides which
 * department-specific links appear and, more importantly, whose signature signs the paperwork.
 */

type TabKey = "overview" | "kyc" | "documents" | "probation" | "assets" | "exit";

const TABS: { key: TabKey; label: string; Icon: typeof UserIcon }[] = [
  { key: "overview", label: "Overview", Icon: Briefcase },
  { key: "kyc", label: "Personal & KYC", Icon: IdCard },
  { key: "documents", label: "Documents", Icon: FileSignature },
  { key: "probation", label: "Probation", Icon: ClipboardCheck },
  { key: "assets", label: "Assets", Icon: Boxes },
  { key: "exit", label: "Exit", Icon: DoorOpen },
];

/** Where the member reads and signs what they are sent. */
const memberProfileLink = (role?: string): string =>
  role === "sales_member" ? "/sales/profile"
    : role === "tech_member" ? "/tech/profile"
      : role === "tech_team_leader" ? "/team-leader/profile"
        : "";

export default function MemberProfileDetail() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const [member, setMember] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  /**
   * Whether an HR record has ever been saved for this person. Every member who predates this
   * feature has none, and calling them all "Probation" because that is the default stage would be
   * simply untrue — so the stage is shown only once someone has actually set their terms.
   */
  const [hasHrRecord, setHasHrRecord] = useState(false);
  const [documents, setDocuments] = useState<HrDocument[]>([]);
  const [bank, setBank] = useState<EmployeeBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [issueType, setIssueType] = useState<HrDocumentType | null>(null);
  const [empIdDraft, setEmpIdDraft] = useState<string | null>(null);
  const [savingEmpId, setSavingEmpId] = useState(false);

  const adminBase = currentUser?.role === "sales_admin" ? "/sales-admin" : "/tech-admin";
  const department: Department = departmentOfRole(member?.role) || (currentUser?.role === "sales_admin" ? "sales" : "tech");

  useEffect(() => {
    if (!memberId) return;
    const unsub = onSnapshot(
      doc(db, "users", memberId),
      (snap) => {
        setMember(snap.exists() ? ({ uid: snap.id, ...snap.data() } as AppUser) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [memberId]);

  useEffect(() => {
    if (!memberId || !member) return;
    const dept = departmentOfRole(member.role) || department;
    const unsubs = [
      watchEmployeeProfile(memberId, dept, (p, exists) => { setProfile(p); setHasHrRecord(exists); }),
      watchMemberDocuments(memberId, setDocuments),
      watchEmployeeBank(memberId, setBank),
    ];
    return () => unsubs.forEach((u) => u());
  }, [memberId, member?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(
    () => (profile ? lifecycleSteps(profile, documents, { employeeId: member?.employeeId }) : []),
    [profile, documents, member?.employeeId],
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!member || !profile) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm text-muted-foreground">This member no longer exists.</p>
        <button onClick={() => navigate(`${adminBase}/team`)} className="mt-3 text-sm font-medium text-primary hover:underline">
          Back to My Team
        </button>
      </div>
    );
  }

  const actor = { uid: currentUser?.uid || "", name: currentUser?.name || "" };

  const handleSaveEmployeeId = async () => {
    if (empIdDraft === null || !memberId) return;
    setSavingEmpId(true);
    try {
      await setEmployeeId(memberId, empIdDraft);
      toast({ title: "Saved", description: `Employee ID set to ${empIdDraft.trim().toUpperCase()}.` });
      setEmpIdDraft(null);
    } catch {
      toast({ title: "Error", description: "Could not save the employee ID.", variant: "destructive" });
    } finally {
      setSavingEmpId(false);
    }
  };

  const notice = noticePeriodFor(profile);
  const kyc = kycCompletion(profile);
  const pendingSignatures = documents.filter((d) => d.requiresEmployeeSignature && d.status === "issued").length;
  const primaryAccount = (bank?.accounts || []).find((a) => a.isPrimary) || (bank?.accounts || [])[0] || null;
  const createdAt = (member.createdAt as { seconds?: number } | null)?.seconds;

  const tabBadge: Partial<Record<TabKey, string>> = {
    documents: pendingSignatures ? String(pendingSignatures) : "",
    kyc: kyc.complete ? "" : `${kyc.done}/${kyc.total}`,
    assets: String((profile.assets || []).filter((a) => !a.returnedOn).length || ""),
  };

  return (
    <div className="space-y-4 md:space-y-5" data-test="member-profile-detail">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <Link to={`${adminBase}/team`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> My Team
        </Link>

        <div className="rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-primary/10">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={member.name} className="h-full w-full object-cover" />
              ) : (
                <div className="font-display flex h-full w-full items-center justify-center text-2xl font-bold text-primary">
                  {member.name?.charAt(0)}
                </div>
              )}
            </div>

            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">{member.name}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getRoleColor(member.role)}`}>
                  {getRoleLabel(member.role)}
                </span>
                {hasHrRecord ? (
                  <>
                    <StageChip stage={profile.stage} engagement={profile.engagementType} />
                    <EngagementChip engagement={profile.engagementType} />
                  </>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    No employment record yet
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${member.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                  {member.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile.designation || "No designation set"}
                {member.employeeId ? ` · ${member.employeeId}` : ""}
                {profile.joiningDate ? ` · joined ${profile.joiningDate}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{member.email}</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {member.phone && (
                <>
                  <a href={getCallUrl(member.phone)} title="Call"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-success hover:bg-success/10">
                    <Phone size={15} />
                  </a>
                  <a href={getWhatsAppUrl(member.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-success hover:bg-success/10">
                    <MessageCircle size={15} />
                  </a>
                </>
              )}
              <button onClick={() => setEditing(true)} data-test="edit-account"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
                <Pencil size={13} /> Edit account
              </button>
            </div>
          </div>

          {/* Where else this member's record lives */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
            {department === "tech" ? (
              <>
                <Link to={`/tech-admin/team/${member.uid}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-foreground hover:bg-accent/70">
                  <ShoppingBag size={13} /> Work history
                </Link>
                <Link to={`/tech-admin/team/${member.uid}/analytics`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-foreground hover:bg-accent/70">
                  <BarChart3 size={13} /> Analytics
                </Link>
              </>
            ) : (
              <>
                <Link to={`/sales-admin/team/${member.uid}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-foreground hover:bg-accent/70">
                  <ShoppingBag size={13} /> Sales history
                </Link>
                <Link to={`/sales-admin/leads/${member.uid}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-foreground hover:bg-accent/70">
                  <Phone size={13} /> Leads
                </Link>
              </>
            )}
            <Link to={`${adminBase}/attendance`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-foreground hover:bg-accent/70">
              <ExternalLink size={13} /> Attendance
            </Link>
            <Link to={`${adminBase}/payroll`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-foreground hover:bg-accent/70">
              <Banknote size={13} /> Payroll
            </Link>
          </div>
        </div>
      </div>

      {/* ── Lifecycle ────────────────────────────────────────────────────── */}
      <LifecycleTracker steps={steps} />

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-test={`tab-${key}`}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
            {tabBadge[key] && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === key ? "bg-primary-foreground/20" : "bg-warning/20 text-warning"}`}>
                {tabBadge[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Panels ───────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <EmploymentTermsCard profile={profile} actor={actor} />

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Account" icon={<UserIcon size={15} className="text-primary" />}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Login email" value={member.email} />
                <Field label="Phone" value={member.phone ? formatPhoneDisplay(member.phone) : null} mono />
                {/* Assigning the ID card number is part of onboarding, so it is set here rather
                    than only from Payroll — the lifecycle step waits on it. */}
                <Field
                  label="Employee ID"
                  mono
                  value={empIdDraft === null ? (
                    <span className="inline-flex items-center gap-1.5">
                      {member.employeeId || "—"}
                      <button
                        onClick={() => setEmpIdDraft(member.employeeId || "")}
                        title="Set employee ID"
                        data-test="edit-employee-id"
                        className="rounded p-0.5 text-muted-foreground hover:text-primary"
                      >
                        <Pencil size={11} />
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        value={empIdDraft}
                        onChange={(e) => setEmpIdDraft(e.target.value)}
                        placeholder="DTS-014"
                        autoFocus
                        data-test="employee-id-input"
                        className="h-8 w-28 rounded-lg border border-border bg-background px-2 font-mono text-sm text-foreground outline-none focus:border-primary"
                      />
                      <button onClick={handleSaveEmployeeId} disabled={savingEmpId}
                        className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50">
                        {savingEmpId ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEmpIdDraft(null)} className="rounded p-1 text-muted-foreground hover:bg-accent">
                        <X size={13} />
                      </button>
                    </span>
                  )}
                />
                <Field label="Role" value={getRoleLabel(member.role)} />
                <Field label="Account created" value={createdAt ? format(new Date(createdAt * 1000), "dd MMM yyyy") : null} />
                <Field label="Status" value={member.isActive ? "Active" : "Deactivated"} />
                {member.googleDriveBaseUrl && (
                  <Field
                    label="Drive folder"
                    className="sm:col-span-2"
                    value={
                      <a href={member.googleDriveBaseUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline">
                        Open <ExternalLink size={11} />
                      </a>
                    }
                  />
                )}
              </div>
            </SectionCard>

            <SectionCard title="Pay & targets" icon={<Banknote size={15} className="text-primary" />}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Salary on record" value={formatCurrency(member.salary || 0)} mono />
                <Field label="Agreed monthly CTC" value={profile.ctcMonthly ? formatCurrency(profile.ctcMonthly) : null} mono />
                {department === "sales" ? (
                  <>
                    <Field label="Daily target" value={formatCurrency(member.dailyTarget || 0)} mono />
                    <Field label="Monthly target" value={formatCurrency(member.monthlyTarget || member.target || 0)} mono />
                    <Field
                      label="Earnings plan"
                      value={member.earningsOption === "stipend_plus_5" ? "Stipend + 5% incentive"
                        : member.earningsOption === "incentive_10" ? "10% direct incentive" : null}
                      className="sm:col-span-2"
                    />
                  </>
                ) : (
                  <Field label="Target" value={formatCurrency(member.target || 0)} mono />
                )}
                <Field
                  label="Salary is paid to"
                  className="sm:col-span-2"
                  value={primaryAccount
                    ? `${PAYOUT_METHOD_LABELS[primaryAccount.method]} · ${accountSummary(primaryAccount)}${primaryAccount.verified ? " · verified" : ""}`
                    : null}
                />
                <Field label="Notice period" value={`${notice.days} days · ${notice.label}`} className="sm:col-span-2" />
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === "kyc" && <KycPanel profile={profile} actor={actor} />}

      {tab === "documents" && (
        <DocumentsPanel
          member={member}
          profile={profile}
          documents={documents}
          signatory={currentUser}
          settingsPath={`${adminBase}/settings`}
          memberLink={memberProfileLink(member.role)}
        />
      )}

      {tab === "probation" && (
        <ProbationPanel
          profile={profile}
          actor={actor}
          onIssueConfirmation={() => setIssueType("confirmation_letter")}
          onIssueExtension={() => setIssueType("probation_extension")}
        />
      )}

      {tab === "assets" && (
        <AssetsPanel profile={profile} actor={actor} memberLink={memberProfileLink(member.role)} />
      )}

      {tab === "exit" && (
        <SeparationPanel
          profile={profile}
          actor={actor}
          mode="admin"
          onIssueRelieving={() => setIssueType("relieving_letter")}
          onIssueExperience={() => setIssueType("experience_letter")}
        />
      )}

      {editing && (
        <EditMemberModal
          member={member}
          variant={department === "sales" ? "sales" : "tech"}
          onClose={() => setEditing(false)}
          onUpdated={(updated) => setMember(updated)}
        />
      )}

      {issueType && currentUser && (
        <IssueDocumentDialog
          member={member}
          profile={profile}
          signatory={currentUser}
          settingsPath={`${adminBase}/settings`}
          defaultType={issueType}
          memberLink={memberProfileLink(member.role)}
          onClose={() => setIssueType(null)}
        />
      )}
    </div>
  );
}
