import { useState } from "react";
import { Briefcase, Check, Loader2, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { saveEmploymentTerms } from "@/services/hr";
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
 * The notice period is shown here but never entered here: it is derived from engagement, stage and
 * seniority by policy. The override exists only for a term genuinely agreed in writing.
 */
export default function EmploymentTermsCard({ profile, actor, readOnly }: {
  profile: EmployeeProfile;
  actor: Actor;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(profile);

  const notice = noticePeriodFor(profile);
  const probationEnd = probationEndDate(profile);
  const daysLeft = probationDaysRemaining(profile);

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
        seniorRole: !!form.seniorRole,
        noticeDaysOverride: form.noticeDaysOverride ?? null,
        offerIssuedOn: form.offerIssuedOn || null,
        offerAcceptedOn: form.offerAcceptedOn || null,
      }, actor);
      toast({ title: "Saved", description: "Employment terms updated." });
      setEditing(false);
    } catch {
      toast({ title: "Error", description: "Could not save the terms.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Employment terms"
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
        <button onClick={startEdit} data-test="edit-terms"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
          <Pencil size={13} /> Edit
        </button>
      )}
    >
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
            onChange={(e) => set("ctcMonthly", e.target.value === "" ? null : Number(e.target.value))} />
          <Input label="Working hours" value={form.workingHours || ""} placeholder="10:00 AM – 7:00 PM"
            onChange={(e) => set("workingHours", e.target.value)} />
          <Input label="Working days" value={form.workingDays || ""} placeholder="Monday to Saturday"
            onChange={(e) => set("workingDays", e.target.value)} />
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
        </div>
      ) : (
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Engagement" value={profile.engagementType ? ENGAGEMENT_LABELS[profile.engagementType] : null} />
          <Field label="Designation" value={profile.designation} />
          <Field label="Reporting to" value={profile.reportingToName} />
          <Field label="Joining date" value={profile.joiningDate} />
          <Field label="Probation" value={profile.probationMonths ? `${profile.probationMonths} month(s)` : "None"} />
          <Field
            label="Probation ends"
            value={probationEnd
              ? `${probationEnd}${daysLeft !== null && !profile.confirmedOn ? ` · ${daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days overdue`}` : ""}`
              : null}
          />
          <Field label="Gross monthly salary" value={profile.ctcMonthly ? rupees(profile.ctcMonthly) : null} mono />
          <Field label="Work location" value={profile.workLocation} />
          <Field label="Working hours" value={profile.workingHours} />
          <Field label="Working days" value={profile.workingDays} />
          <Field label="Notice period" value={<span data-test="notice-period">{notice.days} days · {notice.label}</span>} />
          <Field label="Offer" value={profile.offerIssuedOn ? `Issued ${profile.offerIssuedOn}${profile.offerAcceptedOn ? ` · accepted ${profile.offerAcceptedOn}` : ""}` : null} />
        </div>
      )}
    </SectionCard>
  );
}
