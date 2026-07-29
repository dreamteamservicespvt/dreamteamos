import { useCallback, useRef, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification, notifyTechTeamLeaders } from "@/services/notifications";
import { markOrderCompleted } from "@/services/orders";
import { upsertClientOnWorkComplete } from "@/services/clients";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import type { WorkAssignment } from "@/types";

/**
 * Submitting a finished ad.
 *
 * Shared because there is more than one place a member can be working when they finish. Recent Ads
 * opens the very same generator as My Work — and even flips the job to "in progress" when you open
 * it — but it had no way to submit, so a member who started a job from there had to go and find it
 * again on the other page to hand it in.
 *
 * Duplicating the handler was the obvious fix and the wrong one: it does five ordered writes with a
 * notification contract on top (one alert per event, per recipient), and two copies of that drift.
 * One implementation, two callers.
 *
 * ── Why the in-flight guard is a ref ──────────────────────────────────────────────────────────
 * Two taps in the same tick would both read a stale `false` from state and both proceed, which is
 * where the bursts of identical notifications came from. The ref is set synchronously, so the
 * second tap sees it immediately. State exists only to drive the button's busy look.
 */
export function useCompleteWork() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const completingRef = useRef(false);
  const [completing, setCompleting] = useState(false);

  /**
   * Marks the assignment complete and tells everyone who needs to know.
   * Resolves true when it landed, so the caller knows whether to close the generator.
   */
  const complete = useCallback(async (
    assignment: WorkAssignment | null,
    options: { sessionStart?: Date | null } = {},
  ): Promise<boolean> => {
    if (!assignment) return false;
    if (completingRef.current) return false;
    // Already submitted — a stale render or a back-navigation must not send the whole round again.
    if (assignment.status === "completed" || assignment.status === "verified") return true;

    completingRef.current = true;
    setCompleting(true);
    try {
      const { sessionStart } = options;
      const base = {
        status: "completed" as const,
        completedAt: serverTimestamp(),
        completedDate: format(new Date(), "yyyy-MM-dd"),
      };

      if (sessionStart) {
        const durationSeconds = Math.round((Date.now() - sessionStart.getTime()) / 1000);
        await updateDoc(doc(db, "work_assignments", assignment.id), {
          ...base,
          sessions: [
            ...(assignment.sessions || []),
            { openedAt: sessionStart.toISOString(), closedAt: new Date().toISOString(), durationSeconds },
          ],
          totalDurationSeconds: (assignment.totalDurationSeconds || 0) + durationSeconds,
        });
      } else {
        await updateDoc(doc(db, "work_assignments", assignment.id), base);
      }

      const title = assignment.businessName || assignment.displayTitle;

      // Notify whoever assigned the work (admin or team leader). Keyed on the job and the
      // recipient, so "this work was completed" is one notification no matter how it is re-sent.
      if (assignment.assignedBy) {
        await sendNotification({
          userId: assignment.assignedBy,
          type: "work_completed",
          title: "Work Completed",
          message: `${user?.name || "A member"} has completed work: ${title}`,
          link: `/tech-admin/work-assign/${user?.uid}?verify=${assignment.id}`,
          dedupeKey: `work_completed_${assignment.id}_${assignment.assignedBy}`,
        });
      }

      // Keep the member's tech team leader(s) in the loop on completions, even when the admin
      // assigned the work directly. Skip the assigner so a team leader who assigned it isn't
      // notified twice.
      if (user?.createdBy) {
        await notifyTechTeamLeaders({
          teamAdminUid: user.createdBy,
          excludeUserId: assignment.assignedBy,
          type: "work_completed",
          title: "Team Work Completed",
          message: `${user?.name || "A team member"} completed work: ${title}`,
          link: `/team-leader/work-assign/${user?.uid}?verify=${assignment.id}`,
          dedupeKey: `work_completed_${assignment.id}`,
        });
      }

      // Order-driven work → reflect completion on the order (queue shows "Awaiting verify").
      if (assignment.orderId) await markOrderCompleted(assignment.orderId);

      // The customer now has something delivered, so they become an upsell target immediately —
      // including for work assigned directly (no order), which never reached Clients before.
      await upsertClientOnWorkComplete({ assignment, deliveredByName: user?.name });

      return true;
    } catch (error) {
      console.error("Failed to mark complete:", error);
      toast({
        title: "Couldn't submit",
        description: "Your work was not submitted. Check your connection and try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      completingRef.current = false;
      setCompleting(false);
    }
  }, [user?.uid, user?.name, user?.createdBy, toast]);

  return { completing, complete };
}
