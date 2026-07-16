import { useState } from "react";
import { UserRoundPen, Loader2, ArrowRightLeft, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { reassignWork } from "@/services/workReassign";
import type { AppUser, WorkAssignment } from "@/types";

interface Props {
  assignment: WorkAssignment;
  /** Candidate members (active tech members). The current assignee is filtered out here. */
  members: AppUser[];
  currentUser: { uid: string; name: string };
  /** Optional: called after a successful reassign (e.g. to refresh local state). */
  onDone?: () => void;
}

/**
 * "Reassign" action for a work assignment: pick another tech member and move the work to
 * them. The task leaves the first member's list entirely and restarts as "assigned" for
 * the new member; both are notified.
 */
export default function ReassignWork({ assignment, members, currentUser, onDone }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = members.filter((m) => m.uid !== assignment.assignedTo && m.isActive !== false);
  const title = assignment.businessName || assignment.clientName || assignment.displayTitle || "this work";

  const handleReassign = async () => {
    const member = candidates.find((m) => m.uid === target);
    if (!member || busy) return;
    setBusy(true);
    try {
      await reassignWork(assignment, { uid: member.uid, name: member.name }, currentUser);
      toast({ title: "Work reassigned", description: `"${title}" moved to ${member.name}.` });
      setOpen(false);
      setTarget("");
      onDone?.();
    } catch {
      toast({ title: "Error", description: "Could not reassign the work.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center space-x-1 px-2.5 py-1 text-[10px] md:text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-900/50 rounded-lg transition-colors">
        <UserRoundPen className="w-3 h-3 md:w-3.5 md:h-3.5" /><span>Reassign</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-violet-500" /> Reassign work
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-accent"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              "{title}" will be REMOVED from the current member and assigned fresh to the member you pick. Progress and sessions reset; both members get notified.
            </p>
            <select value={target} onChange={(e) => setTarget(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground mb-4">
              <option value="">Select new member…</option>
              {candidates.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
            <button onClick={handleReassign} disabled={!target || busy}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              {busy ? "Reassigning…" : "Reassign now"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
