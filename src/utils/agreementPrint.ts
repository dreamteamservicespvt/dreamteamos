import { PAGE_H, PAGE_W, paginateDocument } from "@/utils/documentPages";

/**
 * Printing a document straight to paper, or to the browser's own "Save as PDF".
 *
 * Prints the **same A4 sheets the PDF export builds** — each one carrying its own letterhead and
 * foot rule — with a page break after each. That is a deliberate replacement for what was here
 * before: one long flow with the letterhead `position: fixed` so it would repeat. CSS can reserve
 * space for a fixed band at the *start* of a flow and nowhere else, so the title printed underneath
 * the letterhead and the last line of every sheet printed underneath the footer. Building the pages
 * is the only version of this that works, and it has the happy side effect that a printed copy and
 * a downloaded one now break in exactly the same places.
 *
 * Unlike the PDF, this hands the browser real text: crisper on paper, far smaller if saved as a
 * PDF from the dialog, and the words can be copied.
 *
 * The sheets are moved into a body-level container and the app is hidden around them, rather than
 * printed in place, because the app shell is a fixed-height flex layout with `overflow: hidden` —
 * printed in place it clips to exactly one sheet however long the letter is.
 */

/** Marks the body while printing; the rules live in `index.css` under `@media print`. */
const BODY_CLASS = "printing-agreement";
const ROOT_CLASS = "agreement-print-root";

/**
 * Print one rendered document.
 *
 * Resolves once the print dialog has been dismissed and the page has been put back as it was.
 */
export async function printAgreementElement(paperEl: HTMLElement): Promise<void> {
  document.querySelector(`.${ROOT_CLASS}`)?.remove();

  const { pages, stage } = await paginateDocument(paperEl);

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.style.setProperty("--page-w", `${PAGE_W}px`);
  root.style.setProperty("--page-h", `${PAGE_H}px`);

  pages.forEach((page, idx) => {
    // The sheets were sized in px to be photographed. On paper the @page box decides the size, so
    // they scale to its width and let their own content set the height — a sheet pinned to 1123px
    // while the printer's page box is shorter would spill a sliver onto a blank extra page.
    page.style.width = "100%";
    page.style.height = "auto";
    page.style.minHeight = "0";
    page.style.overflow = "visible";
    // Last sheet gets no break, or every print ends with a blank page.
    page.style.breakAfter = idx === pages.length - 1 ? "auto" : "page";
    page.style.pageBreakAfter = idx === pages.length - 1 ? "auto" : "always";
    page.style.breakInside = "avoid";
    root.appendChild(page);
  });

  stage.remove();
  document.body.appendChild(root);
  document.body.classList.add(BODY_CLASS);

  await new Promise<void>((resolve) => {
    // `afterprint` is the only reliable signal across browsers that the dialog is gone; the
    // timeout is a floor, not the mechanism, so a cancelled dialog still cleans up.
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove(BODY_CLASS);
      root.remove();
      resolve();
    };
    window.addEventListener("afterprint", cleanup);
    // Let the browser lay the sheets out before the dialog freezes them.
    setTimeout(() => {
      window.print();
      // Safari never fires afterprint from a programmatic print; this is its safety net.
      setTimeout(cleanup, 1000);
    }, 150);
  });
}
