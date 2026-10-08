/**
 * The Invoice Builder's two settings documents, live.
 *
 * `useInvoiceAccess` is mounted by the sidebar for TEAM LEADERS ONLY (`enabled`), so the menu item
 * appears or disappears the moment the Tech Admin flips the switch — one small document listener
 * per team leader's session, and none for anyone else.
 */
import { useEffect, useState } from "react";
import { watchInvoiceAccess, watchInvoiceDefaults } from "@/services/invoiceSettings";
import type { InvoiceDefaults } from "@/types/invoice";

export function useInvoiceAccess(enabled = true): { teamLeadersEnabled: boolean; loaded: boolean } {
  const [state, setState] = useState({ teamLeadersEnabled: false, loaded: false });
  useEffect(() => {
    if (!enabled) return;
    return watchInvoiceAccess((s) => setState({ teamLeadersEnabled: s.teamLeadersEnabled === true, loaded: true }));
  }, [enabled]);
  return state;
}

export function useInvoiceDefaults(): { defaults: InvoiceDefaults; loaded: boolean } {
  const [state, setState] = useState<{ defaults: InvoiceDefaults; loaded: boolean }>({ defaults: {}, loaded: false });
  useEffect(() => watchInvoiceDefaults((d) => setState({ defaults: d, loaded: true })), []);
  return state;
}
