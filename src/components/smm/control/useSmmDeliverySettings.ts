/**
 * SMM Delivery Control's settings, live (one document, `app_settings/smm_delivery`) — kept in a file of its own so
 * the classic Social Media page, the alert host and the check-out step can read the switch without loading the
 * rest of Delivery Control. A missing document is Preview with the defaults; so is a read that is refused or fails
 * (`loaded` still turns true, so nothing waits on it for ever — and Preview alerts nobody, so the old reminders stay).
 */
import { useEffect, useState } from "react";
import { watchSmmDeliverySettings } from "@/services/smmDeliverySettings";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import type { SmmDeliverySettings } from "@/types/smmDelivery";

export function useSmmDeliverySettings(): { settings: SmmDeliverySettings; loaded: boolean; saved: boolean } {
  const [state, setState] = useState({ settings: DEFAULT_SMM_DELIVERY, loaded: false, saved: false });
  useEffect(() => watchSmmDeliverySettings(
    (settings, meta) => setState({ settings, loaded: true, saved: meta.exists }),
    () => setState({ settings: DEFAULT_SMM_DELIVERY, loaded: true, saved: false }),
  ), []);
  return state;
}
