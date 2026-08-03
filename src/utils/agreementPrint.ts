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
    /*
      Sized in real millimetres, exactly matching `@page { size: A4 }`.
      They were laid out in px to be photographed, and `height: auto` was tried first — but a sheet
      that shrinks to its content makes the last page of a letter a short strip with the rest of
      the paper cut away beneath it. Fixed A4 means every printed sheet is a whole sheet. mm rather
      than px because 1123px is 297.05mm, and that fifth of a millimetre is enough to spill each
      page onto a blank one after it.
    */
    page.style.width = "210mm";
    page.style.height = "297mm";
    page.style.minHeight = "297mm";
    page.style.overflow = "hidden";
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
