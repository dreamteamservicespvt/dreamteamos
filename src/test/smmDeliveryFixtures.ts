/**
 * Shared fixtures for the SMM Delivery Control rule tests (`smmCadenceOct15`, `smmMonitorOct15`): one client,
 * Lakshmi Jewellers, whose month runs Thu 15 Oct → 15 Nov 2026 (its renewal day), on a renewal (not a first month),
 * with Ravi making, Priya posting, Mani on the ads and Sita its salesperson.
 */
import type { SmmDeliveryMonth } from "@/utils/smmCadence";

let seq = 0;

export const piece = (over: Record<string, unknown> = {}) => ({
  id: `p${++seq}`, kind: "ai_ad", title: "", status: "planned", uploadDate: null, uploadTime: "06:00", platforms: ["instagram"],
  approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] }, extra: false, ...over,
});

export function month(over: Record<string, unknown> = {}): SmmDeliveryMonth {
  return {
    id: "m1", orderId: "o_1", leadId: "l1", saleItemKey: "", clientPhone: "", clientPhoneId: "9", clientName: "Lakshmi",
    businessName: "Lakshmi Jewellers", packageKey: "pro", packageLabel: "Pro", amount: 20000,
    cycle: { month: "2026-10", startDate: "2026-10-15", endDate: "2026-11-15" }, platforms: ["instagram"],
    commitments: { ai_ad: 4, poster: 0, real_video: 0 }, items: [], ads: [], budgetPayments: [],
    team: { creator: { uid: "ravi", name: "Ravi" }, publisher: { uid: "priya", name: "Priya" }, marketer: { uid: "mani", name: "Mani" }, assistants: [] },
    soldBy: "sita", soldByName: "Sita", watchers: [], status: "active", renewal: { state: "none" }, renewalOf: "m0", monthNumber: 2,
    ...over,
  } as unknown as SmmDeliveryMonth;
}
