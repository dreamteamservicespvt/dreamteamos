/**
 * The client's brief for a job — "Business info & what to include" and the address — wherever it
 * actually lives.
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
  /** True while the order is being read for an older job. */
  loading: boolean;
}

interface BriefSource {
  id?: string;
  orderId?: string;
  businessInfo?: string;
  businessAddress?: string;
}

export function useAssignmentBrief(a: BriefSource | null | undefined): AssignmentBrief {
  const own = {
    businessInfo: a?.businessInfo?.trim() || "",
    businessAddress: a?.businessAddress?.trim() || "",
  };
  const needsOrder = !!a?.orderId && (!own.businessInfo || !own.businessAddress);
  const [fromOrder, setFromOrder] = useState<{ key: string; businessInfo: string; businessAddress: string } | null>(null);
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
      });
    });
    return () => { cancelled = true; };
    // Keyed on the job and its order only — the assignment object is replaced on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const order = fromOrder && fromOrder.key === key ? fromOrder : null;
  return {
    businessInfo: own.businessInfo || order?.businessInfo || "",
    businessAddress: own.businessAddress || order?.businessAddress || "",
    loading: needsOrder && !order,
  };
}
