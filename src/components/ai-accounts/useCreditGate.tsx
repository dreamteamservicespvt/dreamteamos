import { useCallback, useRef, useState } from "react";
import CreditUsageDialog from "./CreditUsageDialog";
import { useAuthStore } from "@/store/authStore";
import { useFlowAccounts, useFlowSettings } from "@/hooks/useAiAccounts";
import { isPosterCategory } from "@/utils/posterSpec";
import type { WorkAssignment } from "@/types";

/**
 * The credit step in front of "Mark complete": a video job cannot be handed in until the member has
 * said how many Flow credits it used (CreditUsageDialog). One hook, so My Work and Recent Ads — the two
 * places a job is submitted from — ask the same way.
 *
 * A poster job is made in ChatGPT, not Flow, so it goes straight through. If the credits were saved but
 * the completion itself then failed, the retry does not ask again — the credits are already recorded,
 * and asking twice would charge the ad twice.
 */
export function useCreditGate() {
  const user = useAuthStore((s) => s.user);
  const settings = useFlowSettings();
  const { accounts } = useFlowAccounts(user);
  const [pending, setPending] = useState<{ assignment: WorkAssignment; proceed: () => Promise<unknown> } | null>(null);
  const recordedFor = useRef(new Set<string>());

  const request = useCallback(async (assignment: WorkAssignment | null, proceed: () => Promise<unknown>) => {
    if (!assignment || isPosterCategory(assignment.category) || assignment.status === "completed" || assignment.status === "verified"
      || recordedFor.current.has(assignment.id)) {
      await proceed();
      return;
    }
    setPending({ assignment, proceed });
  }, []);

  const dialog = user ? (
    <CreditUsageDialog
      open={!!pending}
      onClose={() => setPending(null)}
      actor={user}
      settings={settings}
      accounts={accounts.filter((a) => a.holderId === user.uid)}
      activeId={user.activeFlowAccountId}
      mode="completion"
      assignment={pending?.assignment}
      onDone={async () => {
        const current = pending;
        setPending(null);
        if (!current) return;
        recordedFor.current.add(current.assignment.id);
        await current.proceed();
      }}
    />
  ) : null;

  return { request, dialog };
}
