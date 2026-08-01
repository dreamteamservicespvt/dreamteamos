import { useState } from "react";
import { BadgeCheck, Briefcase, Check, Loader2, Pencil, ShieldQuestion, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { confirmEmploymentTerms, saveEmploymentTerms } from "@/services/hr";
import type { Actor } from "@/services/hr";
import {
  defaultProbationMonths, noticePeriodFor, probationDaysRemaining, probationEndDate,
} from "@/utils/hrPolicy";
import { ENGAGEMENT_LABELS } from "@/types/hr";
import type { EmployeeProfile, EngagementType } from "@/types/hr";
import { rupees } from "@/utils/hrTemplates";
import { Field, Input, SectionCard, Select } from "./ui";

/**
 * The employment terms — the same set that the offer letter and the appointment letter are built
 * from, which is exactly why they are edited in one place rather than typed into each letter.
 *
 * Both sides fill this in. The employee knows their own joining date, role and what they were
 * offered, and a record that stays empty until an admin gets round to it is no record at all — so
 * they enter it from their own profile. What they enter is marked self-declared until an admin
 * confirms it, because these fields print on a letter carrying the company's signature.
 *
 * The policy levers — senior-role flag, notice-period override, offer dates — stay with the admin
 * in every case. They change what notice an employee owes, and that is the company's term to set,
 * not one to be self-selected.
 *
 * The notice period itself is shown but never entered: it is derived from engagement, stage and
 * seniority by policy.
 */
export default function EmploymentTermsCard({
  profile, actor, readOnly, mode = "admin", title, employeeId,
}: {
  profile: EmployeeProfile;
  actor: Actor;
  /** Nobody may edit — a viewer who owns neither side of this record. */
  readOnly?: boolean;
  /** Who is looking. Decides which fields appear and whether confirmation is offered. */
  mode?: "admin" | "employee";
  title?: string;
  /** Shown alongside the terms; it lives on the user document, not the HR record. */
  employeeId?: string | null;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState(profile);

  const isAdmin = mode === "admin";
  const notice = noticePeriodFor(profile);
  const probationEnd = probationEndDate(profile);
  const daysLeft = probationDaysRemaining(profile);
  /** Nothing has been set at all — don't state a probation or a notice period for an empty record. */
  const blank = !profile.engagementType && !profile.joiningDate && !profile.designation;
  const needsConfirming = !!profile.termsSelfDeclared;

  const startEdit = () => { setForm(profile); setEditing(true); };

  const set = <K extends keyof EmployeeProfile>(key: K, v: EmployeeProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const handleEngagement = (engagement: EngagementType) =>
    setForm((prev) => ({
      ...prev,
      engagementType: engagement,
      // Switching to an internship or a contract should not leave a stale 3-month probation behind.
      probationMonths: prev.probationMonths === null || prev.probationMonths === undefined
        ? defaultProbationMonths(engagement)
        : engagement === "intern" || engagement === "contract" ? 0 : prev.probationMonths,
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveEmploymentTerms(profile.uid, {
        engagementType: form.engagementType,
        designation: form.designation?.trim() || null,
        workLocation: form.workLocation?.trim() || null,
        reportingToName: form.reportingToName?.trim() || null,
        joiningDate: form.joiningDate || null,
        probationMonths: form.probationMonths ?? null,
        ctcMonthly: form.ctcMonthly ?? null,
        workingHours: form.workingHours?.trim() || null,
        workingDays: form.workingDays?.trim() || null,
        // Company terms — only an admin may set these, so an employee's save leaves them untouched.
        ...(isAdmin ? {
          seniorRole: !!form.seniorRole,
          noticeDaysOverride: form.noticeDaysOverride ?? null,
          offerIssuedOn: form.offerIssuedOn || null,
          offerAcceptedOn: form.offerAcceptedOn || null,
        } : {}),
      }, actor, { bySelf: !isAdmin });
      toast({
        title: "Saved",
        description: isAdmin
          ? "Employment terms updated."
          : "Saved. Your admin will confirm these details.",
      });
      setEditing(false);
    } catch {
      toast({ title: "Error", description: "Could not save the terms.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await confirmEmploymentTerms(profile.uid, actor);
      toast({ title: "Confirmed", description: "These terms are now the company's record." });
    } catch {
      toast({ title: "Error", description: "Could not confirm the terms.", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SectionCard
      title={title || (isAdmin ? "Employment terms" : "My employment")}
      icon={<Briefcase size={15} className="text-primary" />}
      action={readOnly ? null : editing ? (
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent">
            <X size={13} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} data-test="save-terms"
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isAdmin && needsConfirming && (
            <button onClick={handleConfirm} disabled={confirming} data-test="confirm-terms"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-semibold text-success-foreground hover:opacity-90 disabled:opacity-50">
              {confirming ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} Confirm
            </button>
          )}
          <button onClick={startEdit} data-test="edit-terms"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
            <Pencil size={13} /> {blank ? "Fill in" : "Edit"}
          </button>
        </div>
      )}
    >
      {/* Who filled this in, and whether anyone has agreed to it */}
      {needsConfirming && !editing && (
        <div className="mb-3 flex flex-wrap items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
          data-test="self-declared-banner">
          <ShieldQuestion size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {isAdmin ? (
              <>
                <b className="text-warning">Entered by the employee</b>
                {profile.termsSelfDeclaredOn ? ` on ${profile.termsSelfDeclaredOn}` : ""} and not confirmed yet.
                Check the salary, joining date and designation, then press <b className="text-foreground">Confirm</b> —
                these are the figures an offer or appointment letter will print under your signature.
              </>
            ) : (
              <>
                You filled these in yourself. Your admin will check and confirm them — until then they
                are your own record of what was agreed, not the company's.
              </>
            )}
          </p>
        </div>
      )}
      {isAdmin && !needsConfirming && profile.termsConfirmedByName && !editing && !blank && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground" data-test="terms-confirmed">
          <BadgeCheck size={12} className="text-success" />
          Confirmed by {profile.termsConfirmedByName}
          {profile.termsConfirmedOn ? ` on ${profile.termsConfirmedOn}` : ""}.
        </p>
      )}
      {!isAdmin && blank && !editing && (
        <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
          data-test="fill-in-hint">
          Nothing here yet. Press <b className="text-foreground">Fill in</b> to enter your role, joining
          date and the terms you were offered — your admin will confirm them.
        </p>
      )}

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Engagement" value={form.engagementType || ""} onChange={(e) => handleEngagement(e.target.value as EngagementType)} data-test="terms-engagement">
            <option value="">Not set</option>
            {(Object.keys(ENGAGEMENT_LABELS) as EngagementType[]).map((k) => (
              <option key={k} value={k}>{ENGAGEMENT_LABELS[k]}</option>
            ))}
          </Select>
          <Input label="Designation" value={form.designation || ""} placeholder="Software Developer"
            onChange={(e) => set("designation", e.target.value)} data-test="terms-designation" />
          <Input label="Work location" value={form.workLocation || ""} placeholder="Kakinada, Andhra Pradesh"
            onChange={(e) => set("workLocation", e.target.value)} />
          <Input label="Reporting to" value={form.reportingToName || ""}
            onChange={(e) => set("reportingToName", e.target.value)} />
          <Input label="Joining date" type="date" value={form.joiningDate || ""}
            onChange={(e) => set("joiningDate", e.target.value)} data-test="terms-joining" />
          <Input label="Probation (months)" type="number" min={0} max={12} value={form.probationMonths ?? ""}
            onChange={(e) => set("probationMonths", e.target.value === "" ? null : Number(e.target.value))}
            hint="0 for an internship or a contract" />
          <Input label="Gross monthly salary (₹)" type="number" min={0} value={form.ctcMonthly ?? ""}
            onChange={(e) => set("ctcMonthly", e.target.value === "" ? null : Number(e.target.value))}
            data-test="terms-salary"
            hint={isAdmin ? undefined : "What you were offered — your admin will confirm it"} />
          <Input label="Working hours" value={form.workingHours || ""} placeholder="10:00 AM – 7:00 PM"
            onChange={(e) => set("workingHours", e.target.value)} />
          <Input label="Working days" value={form.workingDays || ""} placeholder="Monday to Saturday"
            onChange={(e) => set("workingDays", e.target.value)} />

          {isAdmin && (
            <>
              <Input label="Offer issued on" type="date" value={form.offerIssuedOn || ""}
                onChange={(e) => set("offerIssuedOn", e.target.value)} />
              <Input label="Offer accepted on" type="date" value={form.offerAcceptedOn || ""}
                onChange={(e) => set("offerAcceptedOn", e.target.value)} />
              <Input label="Notice period override (days)" type="number" min={0} value={form.noticeDaysOverride ?? ""}
                onChange={(e) => set("noticeDaysOverride", e.target.value === "" ? null : Number(e.target.value))}
                hint="Leave blank to follow company policy" />
              <label className="flex items-center gap-2 self-end pb-2 sm:col-span-2">
                <input type="checkbox" checked={!!form.seniorRole} onChange={(e) => set("seniorRole", e.target.checked)}
                  className="rounded border-border" />
                <span className="text-sm text-foreground">Team lead / critical senior role</span>
                <span className="text-[11px] text-muted-foreground">— attracts the longer notice period once confirmed</span>
              </label>
            </>
          )}
          {!isAdmin && (
            <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
              Your notice period, seniority and offer dates are set by your admin — they are company
              terms, not details to enter here.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Designation" value={profile.designation} />
          <Field label="Engagement" value={profile.engagementType ? ENGAGEMENT_LABELS[profile.engagementType] : null} />
          {!isAdmin && <Field label="Employee ID" value={employeeId} mono />}
          <Field label="Reporting to" value={profile.reportingToName} />
          <Field label="Joining date" value={profile.joiningDate} />
          <Field label="Probation" value={blank ? null : profile.probationMonths ? `${profile.probationMonths} month(s)` : "None"} />
          <Field
            label={profile.confirmedOn ? "Confirmed on" : "Probation ends"}
            value={profile.confirmedOn || (probationEnd
              ? `${probationEnd}${daysLeft !== null && !profile.confirmedOn ? ` · ${daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days overdue`}` : ""}`
              : null)}
          />
          <Field label="Gross monthly salary" value={profile.ctcMonthly ? rupees(profile.ctcMonthly) : null} mono />
          <Field label="Work location" value={profile.workLocation} />
          <Field label="Working hours" value={profile.workingHours} />
          <Field label="Working days" value={profile.workingDays} />
          {/* An empty record has no notice period to state — saying "15 days · During probation"
              next to "Probation: —" was two fields disagreeing about the same person. */}
          <Field
            label={isAdmin ? "Notice period" : "My notice period"}
            value={blank ? null : <span data-test="notice-period">{notice.days} days · {notice.label}</span>}
          />
          {isAdmin && (
            <Field label="Offer" value={profile.offerIssuedOn ? `Issued ${profile.offerIssuedOn}${profile.offerAcceptedOn ? ` · accepted ${profile.offerAcceptedOn}` : ""}` : null} />
          )}
        </div>
      )}
    </SectionCard>
  );
}
