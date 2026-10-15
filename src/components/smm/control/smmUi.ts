/**
 * Which Social Media screen this browser used last (owner's decision 16, SMM Delivery Control 2026-10-15): the
 * classic board or Delivery Control. Classic stays the default for anyone who never pressed the button; the new
 * page sets "control" when it opens and "← Classic view" sets "classic". A per-browser convenience, so it may be
 * missing or unreadable (a private window) — then it is Classic.
 */
export const SMM_UI_KEY = "dts_smm_ui";

export function rememberSmmUi(ui: "classic" | "control"): void {
  try { localStorage.setItem(SMM_UI_KEY, ui); } catch { /* private window */ }
}

export function lastSmmUi(): "classic" | "control" {
  try { return localStorage.getItem(SMM_UI_KEY) === "control" ? "control" : "classic"; } catch { return "classic"; }
}
