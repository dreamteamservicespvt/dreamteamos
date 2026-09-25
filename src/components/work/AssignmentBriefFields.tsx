/**
 * The half of an assignment an edit dialog never showed: the occasion of a wishes video, and the
 * client's brief — what the business does and what the ad must carry, the address, the client's notes.
 *
 * Work Assign asked for all four when the job was created. The three dialogs that edit a job already
 * out (the tech admin's and the team leader's member pages, and Work Reports) offered none of them, so
 * a wrong festival or a wrong address could only be fixed by unassigning the job and assigning it again.
 * The member's generator reads every one of them (AIPlatformApp), so an edit here reaches the person
 * doing the work.
 */
import OccasionPicker from "./OccasionPicker";
import type { BriefEditFields } from "@/utils/assignmentEdit";

export interface AssignmentBriefFieldsProps extends BriefEditFields {
  category: string;
  festival: string;
  onChange: (patch: Partial<BriefEditFields & { festival: string }>) => void;
  className?: string;
}

const field = "w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20";
const label = "block text-[11px] font-medium text-muted-foreground mb-1";

export default function AssignmentBriefFields({
  category, festival, businessInfo, businessAddress, requirementNotes, onChange, className = "",
}: AssignmentBriefFieldsProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`} data-test="assignment-brief-fields">
      {/* The whole greeting is themed from it — changing the festival changes the ad. */}
      {category === "wishes" && (
        <div className="sm:col-span-2">
          <label className={label}>Occasion / function</label>
          <OccasionPicker size="sm" value={festival} onChange={(value) => onChange({ festival: value })} testPrefix="edit-occasion" />
        </div>
      )}
      <div className="sm:col-span-2">
        <label className={label}>Business info &amp; what to include</label>
        <textarea rows={3} value={businessInfo} data-test="edit-business-info"
          onChange={(e) => onChange({ businessInfo: e.target.value })}
          placeholder="What the business does, and what the ad must say or show"
          className={`${field} resize-y`} />
      </div>
      <div>
        <label className={label}>Address <span className="font-normal">(leave empty if the ad shows none)</span></label>
        <textarea rows={2} value={businessAddress} data-test="edit-business-address"
          onChange={(e) => onChange({ businessAddress: e.target.value })}
          placeholder="Exactly as it should appear in the ad"
          className={`${field} resize-y`} />
      </div>
      <div>
        <label className={label}>Client's notes</label>
        <textarea rows={2} value={requirementNotes} data-test="edit-requirement-notes"
          onChange={(e) => onChange({ requirementNotes: e.target.value })}
          placeholder="Anything else the client asked for"
          className={`${field} resize-y`} />
      </div>
    </div>
  );
}
