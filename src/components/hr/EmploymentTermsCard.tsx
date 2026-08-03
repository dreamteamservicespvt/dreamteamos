import { useMemo, useState } from "react";
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
import {
  DAY_OPTIONS, EMPLOYMENT_DEFAULTS, TIME_OPTIONS, applyEmploymentDefaults, formatDays, formatHours,
  matchDayOption, matchTimeOption, splitRange,
} from "@/utils/employmentDefaults";
import { Field, Input, SectionCard, Select, Textarea } from "./ui";

/**
 * The employment terms — the same set that the offer letter and the appointment letter are built
 * from, which is exactly why they are edited in one place rather than typed into each letter.
 *
 * ── Only the admin writes these ───────────────────────────────────────────────────────────────
 * Employees used to fill their own in, marked "self-declared" until an admin confirmed. It reads
 * fairly and works badly: these are the terms of an agreement between two parties, and letting one
 * party type the salary, the designation and the joining date — then print them on a letter under
 * the company's signature — puts the admin in the position of auditing a form instead of setting a
 * term. So the record is now the company's: a sales member's terms are set by their sales admin, a
 * tech member's by their tech admin, and the employee sees exactly what has been agreed.
 *
 * Employees keep everything that genuinely IS theirs — their own KYC details, signing what they are
 * sent, acknowledging assets, resigning. This card is not one of them.
 *
 * Notice period is derived from engagement, stage and seniority, unless the admin sets a number for
 * this specific person — which overrides the policy for them alone.
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
  /** An employee reads their terms; only their admin writes them. */
  const canEdit = isAdmin && !readOnly;
  const notice = noticePeriodFor(profile);
  const probationEnd = probationEndDate(profile);
  const daysLeft = probationDaysRemaining(profile);
  /** Nothing has been set at all — don't state a probation or a notice period for an empty record. */
  const blank = !profile.engagementType && !profile.joiningDate && !profile.designation;
  const needsConfirming = !!profile.termsSelfDeclared;

  /**
   * Open the form with the blanks already filled in.
   *
   * Applied on entering edit rather than on save, so the admin SEES what will be stored and can
   * change any of it. Filling silently at save time would put a designation on somebody's letter
   * that nobody chose.
   */
  const startEdit = () => {
    setForm(applyEmploymentDefaults(profile, profile.engagementType) as EmployeeProfile);
    setEditing(true);
  };

  const hours = useMemo(() => {
    const { from, to } = splitRange(form.workingHours);
    return { from: matchTimeOption(from), to: matchTimeOption(to) };
  }, [form.workingHours]);

  const days = useMemo(() => {
    const { from, to } = splitRange(form.workingDays);
    return { from: matchDayOption(from), to: matchDayOption(to) };
  }, [form.workingDays]);

  const set = <K extends keyof EmployeeProfile>(key: K, v: EmployeeProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const handleEngagement = (engagement: EngagementType) =>
    setForm((prev) => ({
      ...prev,
      ...applyEmploymentDefaults(prev, engagement),
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
        internshipEndDate: form.engagementType === "intern" ? (form.internshipEndDate || null) : null,
        internshipFocus: form.engagementType === "intern" ? (form.internshipFocus?.trim() || null) : null,
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
      action={!canEdit ? null : editing ? (
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
                These were entered before your admin took over this record, so they are not confirmed
                yet. Your admin will check and confirm them.
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
      {/* An employee's copy is a statement of what has been agreed, so it says who sets it and who
          to go to — an unexplained read-only screen just looks broken. */}
      {!isAdmin && (
        <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
          data-test="terms-admin-only">
          {blank
            ? "Your admin hasn't set your employment terms yet. Ask them to fill this in — these are the details your offer and appointment letters are printed from."
            : "Set by your admin. If anything here is wrong, tell them and they'll correct it — these are the details your letters are printed from."}
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
          <Input label="Designation" value={form.designation || ""} placeholder={EMPLOYMENT_DEFAULTS.designation}
            onChange={(e) => set("designation", e.target.value)} data-test="terms-designation" />
          <Input label="Work location" value={form.workLocation || ""} placeholder="Kakinada, Andhra Pradesh"
            onChange={(e) => set("workLocation", e.target.value)} />
          <Input label="Reporting to" value={form.reportingToName || ""} placeholder={EMPLOYMENT_DEFAULTS.reportingToName}
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
          {/* Pickers rather than free text: the same shift typed by three people produced "10-7",
              "10:00-7:00" and "10 AM to 7 PM" across three employees' letters. */}
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Working hours</span>
            <div className="flex items-center gap-1.5">
              <select
                value={hours.from} data-test="terms-hours-from"
                onChange={(e) => set("workingHours", formatHours(e.target.value, hours.to) || e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Start</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="shrink-0 text-xs text-muted-foreground">to</span>
              <select
                value={hours.to} data-test="terms-hours-to"
                onChange={(e) => set("workingHours", formatHours(hours.from, e.target.value) || e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">End</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Working days</span>
            <div className="flex items-center gap-1.5">
              <select
                value={days.from} data-test="terms-days-from"
                onChange={(e) => set("workingDays", formatDays(e.target.value, days.to) || e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">From</option>
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="shrink-0 text-xs text-muted-foreground">to</span>
              <select
                value={days.to} data-test="terms-days-to"
                onChange={(e) => set("workingDays", formatDays(days.from, e.target.value) || e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">To</option>
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* An intern's college needs the end date and the training list in writing, so both are
              asked for here rather than at the point a letter is issued — they are standing facts
              about the engagement, and a letter that had to ask each time would print a different
              answer each time somebody forgot. */}
          {form.engagementType === "intern" && (
            <>
              <Input label="Internship ends on" type="date" value={form.internshipEndDate || ""}
                data-test="terms-internship-end"
                onChange={(e) => set("internshipEndDate", e.target.value)}
                hint="Printed on the offer and joining letters the college reads" />
              <Textarea label="What this intern is trained on" rows={3}
                value={form.internshipFocus || ""}
                data-test="terms-internship-focus"
                onChange={(e) => set("internshipFocus", e.target.value)}
                className="sm:col-span-2"
                hint="One per line. Leave blank to print the standard list for their department." />
            </>
          )}

          {isAdmin && (
            <>
              <Input label="Offer issued on" type="date" value={form.offerIssuedOn || ""}
                onChange={(e) => set("offerIssuedOn", e.target.value)} />
              <Input label="Offer accepted on" type="date" value={form.offerAcceptedOn || ""}
                onChange={(e) => set("offerAcceptedOn", e.target.value)} />
              {/* The per-person lever. Policy covers the normal cases; this is for the ones that
                  were actually negotiated, and it wins over everything else for this employee. */}
              <Input label="Notice period for this member (days)" type="number" min={0}
                value={form.noticeDaysOverride ?? ""} data-test="terms-notice-days"
                onChange={(e) => set("noticeDaysOverride", e.target.value === "" ? null : Number(e.target.value))}
                hint={`Blank = company policy (${noticePeriodFor({ ...form, noticeDaysOverride: null }).days} days for this person)`} />
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
          {/* Says where the number came from: a figure set for this person alone reads differently
              from one the policy produced, and an admin checking it needs to know which it is. */}
          <Field
            label={isAdmin ? "Notice period" : "My notice period"}
            value={blank ? null : (
              <span data-test="notice-period">
                {notice.days} days · {notice.label}
                {notice.basis === "override" && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Set for this member
                  </span>
                )}
              </span>
            )}
          />
          {isAdmin && (
            <Field label="Offer" value={profile.offerIssuedOn ? `Issued ${profile.offerIssuedOn}${profile.offerAcceptedOn ? ` · accepted ${profile.offerAcceptedOn}` : ""}` : null} />
          )}
        </div>
      )}
    </SectionCard>
  );
}
