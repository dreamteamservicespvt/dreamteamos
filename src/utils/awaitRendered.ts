/**
 * Wait for a preview that has just been asked to open to actually be on the page.
 *
 * Downloading or printing from a composer means forcing the preview open first — the paper only
 * exists once it is rendered. The obvious way to wait for that is a fixed `setTimeout`, and it is
 * wrong in both directions: too short on a slow machine or a long letter, and dead time on every
 * fast one. Worse, the failure is silent-ish — the ref is still null, and the user gets an error
 * for something that would have worked a frame later.
 *
 * This polls across animation frames instead, so it returns as soon as React has painted and gives
 * up only if the element genuinely never appears.
 */
export async function awaitRendered<T extends HTMLElement>(
  ref: { current: T | null },
  timeoutMs = 3000,
): Promise<T> {
  const started = Date.now();
  // A first frame lets a `setState` in the same tick flush before the first check.
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  while (Date.now() - started < timeoutMs) {
    const el = ref.current;
    // offsetParent is null for a node that is present but not laid out; html2canvas measures zero
    // against one of those and produces a blank page.
    if (el && (el.offsetHeight > 0 || el.offsetParent !== null)) return el;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  throw new Error("preview did not render");
}
