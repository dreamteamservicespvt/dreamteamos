/**
 * The client's brief for a job — "Business info & what to include", the address and the client's own
 * notes — wherever it actually lives.
 *
 * New jobs carry it on the assignment itself (copied from the order at assignment time). Every job
 * assigned before that fix does not: the text is still on the order the sale created, and nowhere
 * else. So the assignment's own copy wins when there is one, and otherwise the order is read — ONE
 * document, only when this job is actually being looked at (the share dialog, the generator), never
 * for a whole list of cards, because the free-tier daily read budget is the binding constraint.
 */
import { useEffect, useState } from "react";
import { fetchOrder } from "@/services/orders";

export interface AssignmentBrief {
  businessInfo: string;
  businessAddress: string;
  /** The client's notes from the sale ("mention the 20% offer"). Empty when there are none. */
  notes: string;
  /** True while the order is being read for an older job. */
  loading: boolean;
}

interface BriefSource {
  id?: string;
  orderId?: string;
  businessInfo?: string;
  businessAddress?: string;
  requirementNotes?: string;
}

export function useAssignmentBrief(a: BriefSource | null | undefined): AssignmentBrief {
  const own = {
    businessInfo: a?.businessInfo?.trim() || "",
    businessAddress: a?.businessAddress?.trim() || "",
    notes: a?.requirementNotes?.trim() || "",
  };
  /*
    Only a field the job has never carried is looked up on the order. A job is created without empty
    fields (services/workAssign), so an empty string here is an admin CLEARING it in the edit dialog —
    and reading the order's copy back would bring a removed address straight back into the ad.
  */
  const never = (v?: string) => v === undefined || v === null;
  const needsOrder = !!a?.orderId && (never(a?.businessInfo) || never(a?.businessAddress));
  const [fromOrder, setFromOrder] = useState<{ key: string; businessInfo: string; businessAddress: string; notes: string } | null>(null);
  const key = needsOrder ? `${a?.id || ""}|${a?.orderId}` : "";

  useEffect(() => {
    if (!key || !a?.orderId) return;
    let cancelled = false;
    fetchOrder(a.orderId).then((order) => {
      if (cancelled) return;
      setFromOrder({
        key,
        businessInfo: order?.requirement?.businessInfo?.trim() || "",
        businessAddress: order?.requirement?.businessAddress?.trim() || "",
        notes: order?.requirement?.notes?.trim() || "",
      });
    });
    return () => { cancelled = true; };
    // Keyed on the job and its order only — the assignment object is replaced on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const order = fromOrder && fromOrder.key === key ? fromOrder : null;
  return {
    businessInfo: never(a?.businessInfo) ? order?.businessInfo || "" : own.businessInfo,
    businessAddress: never(a?.businessAddress) ? order?.businessAddress || "" : own.businessAddress,
    notes: never(a?.requirementNotes) ? order?.notes || "" : own.notes,
    loading: needsOrder && !order,
  };
}
