/**
 * The AI service, imported on demand (SMM Delivery Control, phase 5).
 *
 * ── Why on demand ───────────────────────────────────────────────────────────────────────────────
 * `services/smmAi` pulls in `geminiService`, the largest chunk in the build (≈850 KB). Importing it statically
 * would make every page that shows a brief download Gemini before anything is asked. The AI parts call
 * `loadSmmAi()` when they need it; until then they show the plain text the rules write.
 */
export const loadSmmAi = () => import("@/services/smmAi");
