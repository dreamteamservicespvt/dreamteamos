import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, Copy, Eye, FileSignature, Loader2, MessageCircle, PenTool, Send, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/utils/phone";
import { getWhatsAppUrl } from "@/utils/phone";
import { COMPANY } from "@/utils/company";
import { todayIso, addDaysIso, SIGNATORY_TITLE, NOTICE_DAYS, defaultProbationMonths } from "@/utils/hrPolicy";
import { nextEmployeeId } from "@/utils/employeeId";
import { buildInviteLetters, draftProbationEnd, suggestOfferNumber } from "@/utils/onboardingLetters";
import { buildInviteMessage, createInvite, nextOfferSequence, type CreatedInvite } from "@/services/onboarding";
import AgreementView from "@/components/agreement/AgreementView";
import { Input, Select, Textarea } from "@/components/hr/ui";
import type { AppUser, UserRole } from "@/types";
import type { Department, EngagementType } from "@/types/hr";
import type { InviteDraft } from "@/types/onboarding";

/**
 * Hiring someone, in one form.
 *
 * Every field here is a sentence in a letter the candidate will read and sign, which is why the
 * form is grouped the way the letter is rather than the way the database is. The two letters can be
 * previewed at any point in exactly the renderer the candidate will see them in — an admin should
 * never send an offer they have not read.
 *
 * Creating the link is blocked without a stored signature, for the same reason the Issue Document
 * dialog blocks: a letter with an empty signature line is worse than no letter.
 */
export default function OnboardInviteModal({
  department, signatory, roleOptions, settingsPath, existingEmployeeIds, onClose, onCreated,
}: {
  department: Department;
  /** The admin doing the hiring — their signature signs both letters. */
  signatory: AppUser;
  /** The roles this admin may hire into. */
  roleOptions: { value: UserRole; label: string }[];
  /** Where they go to add a signature if they have none. */
  settingsPath: string;
  /** Every employee number already issued, so the next one is proposed rather than invented. */
  existingEmployeeIds?: (string | null | undefined)[];
  onClose: () => void;
  onCreated?: (invite: CreatedInvite) => void;
}) {
  const { toast } = useToast();
  const designation = signatory.designation || SIGNATORY_TITLE[department];
  const hasSignature = !!signatory.signatureUrl;

  const [role, setRole] = useState<UserRole>(roleOptions[0].value);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [engagementType, setEngagementType] = useState<EngagementType>("full_time");
  /**
   * Proposed, not blank. Typing this by hand is how two people end up sharing a number — and the
   * person onboarding a joiner has no way of knowing what the last one was.
   */
  const [employeeId, setEmployeeId] = useState(() => nextEmployeeId(existingEmployeeIds || []));
  const [reportingToName, setReportingToName] = useState(signatory.name);
  const [workLocation, setWorkLocation] = useState("Kakinada, Andhra Pradesh");

  const [joiningDate, setJoiningDate] = useState(addDaysIso(todayIso(), 7) || todayIso());
  const [probationMonths, setProbationMonths] = useState(3);
  const [offerValidUntil, setOfferValidUntil] = useState(addDaysIso(todayIso(), 5) || todayIso());
  const [offerLetterNumber, setOfferLetterNumber] = useState("");

  const [ctcMonthly, setCtcMonthly] = useState(0);
  const [salaryPayDay, setSalaryPayDay] = useState(10);
  const [target, setTarget] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [googleDriveBaseUrl, setGoogleDriveBaseUrl] = useState("");

  const [workingDays, setWorkingDays] = useState("Monday to Saturday");
  const [workingHours, setWorkingHours] = useState("10:00 AM – 7:00 PM");
  const [shiftDetails, setShiftDetails] = useState("");
  const [noticeDays, setNoticeDays] = useState<number>(NOTICE_DAYS.probation);

  const [preview, setPreview] = useState<"offer" | "joining" | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const isSales = department === "sales";

  // The offer number is a filing reference, so it is suggested from what this admin has already
  // raised this year and left editable — every company numbers its paperwork differently.
  useEffect(() => {
    let alive = true;
    nextOfferSequence(signatory.uid).then((n) => {
      if (alive) setOfferLetterNumber((current) => current || suggestOfferNumber(n));
    });
    return () => { alive = false; };
  }, [signatory.uid]);

  // Probation follows the engagement: an intern or a contractor serves none, and leaving "3" behind
  // when the engagement changes would print a probation the company did not intend to offer.
  useEffect(() => {
    setProbationMonths(defaultProbationMonths(engagementType));
    setNoticeDays(engagementType === "intern" ? NOTICE_DAYS.intern : NOTICE_DAYS.probation);
  }, [engagementType]);

  useEffect(() => {
    if (role === "tech_team_leader") setNoticeDays(NOTICE_DAYS.senior);
  }, [role]);

  const draft: InviteDraft = useMemo(() => ({
    department,
    role,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    personalEmail: personalEmail.trim().toLowerCase() || null,
    phone: phone.trim() ? normalizePhone(phone.trim()) : "",
    address: address.trim() || null,
    designation: jobTitle.trim(),
    engagementType,
    employeeId: employeeId.trim() || null,
    reportingToName: reportingToName.trim() || null,
    workLocation: workLocation.trim(),
    joiningDate,
    probationMonths,
    offerValidUntil: offerValidUntil || null,
    ctcMonthly,
    salaryPayDay,
    target: isSales ? target : null,
    dailyTarget: isSales ? dailyTarget : null,
    monthlyTarget: isSales ? monthlyTarget : null,
    googleDriveBaseUrl: !isSales ? (googleDriveBaseUrl.trim() || null) : null,
    workingDays: workingDays.trim(),
    workingHours: workingHours.trim(),
    shiftDetails: shiftDetails.trim() || null,
    noticeDays,
    offerLetterNumber: offerLetterNumber.trim(),
  }), [
    department, role, name, email, personalEmail, phone, address, jobTitle, engagementType, employeeId,
    reportingToName, workLocation, joiningDate, probationMonths, offerValidUntil, ctcMonthly,
    salaryPayDay, isSales, target, dailyTarget, monthlyTarget, googleDriveBaseUrl, workingDays,
    workingHours, shiftDetails, noticeDays, offerLetterNumber,
  ]);

  const letters = useMemo(
    () => buildInviteLetters({ draft, signatory: { name: signatory.name, designation } }),
    [draft, signatory.name, designation],
  );

  const probationEnds = draftProbationEnd(draft);

  const missing: string[] = [];
  if (!draft.name) missing.push("full name");
  if (!draft.email) missing.push("email");
  if (!draft.designation) missing.push("designation");
  if (!draft.workLocation) missing.push("work location");
  if (!draft.joiningDate) missing.push("joining date");
  if (!draft.ctcMonthly) missing.push("gross monthly salary");

  const handleCreate = async () => {
    if (missing.length > 0) {
      toast({
        title: "Not enough to write a letter yet",
        description: `Please fill in the ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const invite = await createInvite({ draft, signatory, designation });
      setCreated(invite);
      onCreated?.(invite);
    } catch (err) {
      toast({
        title: "Could not create the link",
        description: (err as Error).message === "no_signature"
          ? "Add your signature in Settings first."
          : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const copy = async (what: "link" | "code", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
    } catch {
      toast({ title: "Could not copy", description: "Please copy it by hand.", variant: "destructive" });
    }
  };

  const shareOnWhatsApp = () => {
    if (!created) return;
    const message = buildInviteMessage({
      name: draft.name,
      designation: draft.designation,
      url: created.url,
      code: created.accessCode,
      companyName: COMPANY.name,
    });
    window.open(getWhatsAppUrl(draft.phone, message), "_blank", "noopener,noreferrer");
  };

  /* ── After creation: the link and the code, and how to send them ───────────────────────────── */
  if (created) {
    return (
      <Frame title="Hiring link ready" onClose={onClose}>
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {draft.name} can now read and sign their offer.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing exists for them yet — no account, no password. Their login is created the moment
            they sign the joining letter, and you will be notified when they do.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Their link</label>
            <div className="flex items-center gap-2">
              <input
                readOnly value={created.url} data-test="invite-url"
                className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none"
              />
              <button onClick={() => copy("link", created.url)} title="Copy link"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
                {copied === "link" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Their 4-digit code — the link asks for it before it shows anything
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly value={created.accessCode} data-test="invite-code"
                className="h-11 w-32 rounded-lg border border-border bg-background px-3 text-center font-mono text-lg font-bold tracking-[0.35em] text-foreground outline-none"
              />
              <button onClick={() => copy("code", created.accessCode)} title="Copy code"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
                {copied === "code" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {draft.phone && (
            <button onClick={shareOnWhatsApp} data-test="invite-whatsapp"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-success text-sm font-semibold text-white hover:opacity-90">
              <MessageCircle className="h-4 w-4" /> Send on WhatsApp
            </button>
          )}
          <button onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold text-foreground hover:bg-accent">
            Done
          </button>
        </div>
      </Frame>
    );
  }

  /* ── The form ──────────────────────────────────────────────────────────────────────────────── */
  return (
    <Frame title="Onboard a new employee" subtitle="They read the offer, sign it, sign the joining letter, and get their login." onClose={onClose}>
      {!hasSignature && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="invite-no-signature">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <PenTool size={13} /> You have not added your signature yet
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Both letters go out signed by you as {designation}. Add your signature once in Settings
            and every letter you ever send carries it.
          </p>
          <Link to={settingsPath}
            className="mt-2 inline-flex h-8 items-center rounded-lg bg-warning px-3 text-[11px] font-semibold text-warning-foreground hover:opacity-90">
            Add my signature →
          </Link>
        </div>
      )}

      <Group title="The person">
        <Select label="Role *" value={role} onChange={(e) => setRole(e.target.value as UserRole)} data-test="invite-role">
          {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        <Input label="Full name *" value={name} onChange={(e) => setName(e.target.value)} data-test="invite-name" />
        <Input label="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          hint="This becomes their login" data-test="invite-email" />
        {/* Asked for here so it exists before the first letter is written. Every document prints
            this rather than the login, which stops working the day the person leaves — the day a
            relieving letter or an employment verification most needs to reach them. */}
        <Input label="Personal email" type="email" value={personalEmail}
          onChange={(e) => setPersonalEmail(e.target.value)}
          placeholder="their own address" data-test="invite-personal-email"
          hint="Printed on every letter. Not the login — this one outlives the job." />
        <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="9876543210" hint="+91 added automatically" data-test="invite-phone" />
        <Textarea label="Address (optional)" rows={2} value={address} onChange={(e) => setAddress(e.target.value)}
          className="sm:col-span-2" />
      </Group>

      <Group title="The position">
        <Input label="Designation *" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g. Video Editor" data-test="invite-designation" />
        <Select label="Engagement *" value={engagementType} onChange={(e) => setEngagementType(e.target.value as EngagementType)}>
          <option value="full_time">Full-Time</option>
          <option value="part_time">Part-Time</option>
          <option value="intern">Intern</option>
          <option value="contract">Contract</option>
        </Select>
        <Input label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
          placeholder={nextEmployeeId([])} data-test="employee-id" />
        <Input label="Reporting to" value={reportingToName} onChange={(e) => setReportingToName(e.target.value)} />
        <Input label="Work location *" value={workLocation} onChange={(e) => setWorkLocation(e.target.value)}
          className="sm:col-span-2" />
      </Group>

      <Group title="Dates">
        <Input label="Date of joining *" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)}
          data-test="invite-joining" />
        <Input label="Probation (months)" type="number" min={0} max={12} value={probationMonths}
          onChange={(e) => setProbationMonths(Number(e.target.value) || 0)}
          hint={probationMonths > 0 && probationEnds ? `Ends ${probationEnds}` : "No probation"} />
        <Input label="Offer valid until" type="date" value={offerValidUntil}
          onChange={(e) => setOfferValidUntil(e.target.value)}
          hint="After this the link stops accepting" />
        <Input label="Offer letter number" value={offerLetterNumber} onChange={(e) => setOfferLetterNumber(e.target.value)} />
      </Group>

      <Group title="Money">
        <Input label="Gross monthly salary (₹) *" type="number" min={0} value={ctcMonthly || ""}
          onChange={(e) => setCtcMonthly(Number(e.target.value) || 0)} data-test="invite-ctc" />
        <Input label="Salary paid on (day of month)" type="number" min={1} max={31} value={salaryPayDay}
          onChange={(e) => setSalaryPayDay(Number(e.target.value) || 0)} />
        {isSales ? (
          <>
            <Input label="Target (₹)" type="number" min={0} value={target || ""} onChange={(e) => setTarget(Number(e.target.value) || 0)} />
            <Input label="Daily target (₹)" type="number" min={0} value={dailyTarget || ""} onChange={(e) => setDailyTarget(Number(e.target.value) || 0)} />
            <Input label="Monthly target (₹)" type="number" min={0} value={monthlyTarget || ""} onChange={(e) => setMonthlyTarget(Number(e.target.value) || 0)} />
          </>
        ) : (
          <Input label="Google Drive base URL (optional)" type="url" value={googleDriveBaseUrl}
            onChange={(e) => setGoogleDriveBaseUrl(e.target.value)} className="sm:col-span-2" />
        )}
      </Group>

      <Group title="Schedule">
        <Input label="Working days" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} />
        <Input label="Working hours" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
        <Input label="Shift (optional)" value={shiftDetails} onChange={(e) => setShiftDetails(e.target.value)}
          placeholder="e.g. General shift" />
        <Input label="Notice period (days)" type="number" min={0} value={noticeDays}
          onChange={(e) => setNoticeDays(Number(e.target.value) || 0)}
          hint="Printed in the joining letter" />
      </Group>

      <p className="mt-4 rounded-lg bg-accent/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        These letters are a professional baseline for an Indian employer, not legal advice. Have them
        reviewed once by an employment/labour-law professional for your state.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setPreview(preview === "offer" ? null : "offer")}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent">
          <Eye size={15} /> {preview === "offer" ? "Hide offer" : "Preview offer"}
        </button>
        <button onClick={() => setPreview(preview === "joining" ? null : "joining")}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent">
          <Eye size={15} /> {preview === "joining" ? "Hide joining letter" : "Preview joining letter"}
        </button>
        <button onClick={handleCreate} disabled={creating || !hasSignature} data-test="invite-submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {creating ? "Creating…" : "Create hiring link"}
        </button>
        {hasSignature && (
          <span className="text-[11px] text-muted-foreground">Signed as {signatory.name} · {designation}</span>
        )}
      </div>

      {preview && (
        <div className="mt-4 overflow-x-auto rounded-lg bg-slate-200 p-2 md:p-4" data-test="invite-preview">
          <AgreementView
            bodyText={preview === "offer" ? letters.offer.bodyText : letters.joining.bodyText}
            memberName={draft.name || "—"}
            memberPhone={draft.phone}
            companySignatureUrl={signatory.signatureUrl}
            companySignedName={signatory.name}
            companyDesignation={designation}
            companySignedDate={letters.offer.issuedOn}
          />
        </div>
      )}
    </Frame>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function Frame({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="mx-auto my-4 w-full max-w-3xl rounded-xl border border-border bg-card p-4 md:p-5"
        onClick={(e) => e.stopPropagation()} data-test="onboard-invite-modal">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display flex items-center gap-2 text-lg font-bold text-foreground">
              <FileSignature size={18} className="text-primary" /> {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
