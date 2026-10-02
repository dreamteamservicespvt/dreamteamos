/**
 * The Flow credits step of Mark Complete, with the member's own accounts loaded live.
 *
 * Mounted by the generator when a finished video job is handed in (AIPlatformApp markComplete,
 * utils/flowAccounts flowCreditsQuestion): the first time with the whole ad to record, a later round
 * (`again`) with only what that round made. The form opens once the member's accounts have arrived,
 * so it can start on the account they are using; saving continues straight into the completion.
 */
import { Loader2 } from "lucide-react";
import { useFlowAccountList, useFlowSettings } from "@/hooks/useFlowAccounts";
import type { AppUser, WorkAssignment } from "@/types";
import FlowCreditsDialog from "./FlowCreditsDialog";
import { Modal } from "./FlowParts";

export default function FlowCreditsGate({ user, assignment, again = false, onClose, onSaved }: {
  user: Pick<AppUser, "uid" | "name" | "role" | "createdBy">;
  assignment: Pick<WorkAssignment, "id" | "uniqueId" | "businessName" | "displayTitle" | "category" | "clipCount" | "flowCredits">;
  /** The job's credits are already in from an earlier round — ask only for this one. */
  again?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accounts, loading } = useFlowAccountList(user);
  const settings = useFlowSettings();
  if (loading) {
    return (
      <Modal z="z-[70]" title={again ? "Flow credits for this round" : "Flow credits used for this ad"} onClose={onClose} testId="flow-credits-loading">
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
      </Modal>
    );
  }
  return (
    <FlowCreditsDialog
      mode="complete"
      z="z-[70]"
      actor={{ uid: user.uid, name: user.name, role: user.role, createdBy: user.createdBy }}
      settings={settings}
      accounts={accounts}
      assignment={assignment}
      previous={again ? assignment.flowCredits ?? null : null}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
