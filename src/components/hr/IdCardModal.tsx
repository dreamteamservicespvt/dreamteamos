/**
 * The admin's way into an employee's ID card: a dialog over whatever they were looking at.
 *
 * The card itself lives in IdCardPanel, which the member's own profile renders inline — so the
 * two of them are looking at the same card, not at two things that resemble each other.
 */
import { IdCard, X } from "lucide-react";
import { buildIdCard } from "@/utils/idCard";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";
import IdCardPanel from "./IdCardPanel";

export default function IdCardModal({ member, profile, onClose }: {
  member: AppUser;
  profile?: EmployeeProfile | null;
  onClose: () => void;
}) {
  const data = buildIdCard(member, profile);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto my-4 w-full max-w-3xl rounded-xl border border-border bg-card p-4 md:p-5"
        data-test="id-card-modal"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display flex items-center gap-2 text-lg font-bold text-foreground">
              <IdCard size={18} className="text-primary" /> Employee ID card
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.name} · {data.designation} · built from their employment record.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <IdCardPanel
          member={member}
          profile={profile}
          provisionalHint="Set the real one on the Overview tab and it will replace this everywhere."
        />
      </div>
    </div>
  );
}
