import { normalizeSignatureUrl } from "@/utils/signatureImage";

/**
 * Printing a document straight to paper, or to the browser's own "Save as PDF".
 *
 * Distinct from the PDF export next door, and worth having as well as it. That one photographs the
 * page into a JPEG per sheet — reliable, identical everywhere, and a 1 MB file whose text cannot be
 * selected or searched. This one hands the browser real text: it prints crisper, it is far smaller
 * if saved as a PDF, and the words in it can be copied. Which is what somebody actually wants when
 * they are printing a letter to sign it.
 *
 * The document is cloned into a body-level container and everything else on the page is hidden,
 * rather than being printed in place, because the app shell is a fixed-height flex layout with
 * `overflow: hidden` — printed in place it clips to exactly one sheet.
 *
 * The letterhead and foot rule are pulled out and fixed to the page edges so they repeat on every
 * printed sheet, matching the exported PDF. A reader holding page 3 of an offer letter has to be
 * able to see whose page 3 it is.
 */

/** Marks the body while printing; the rules live in `index.css` under `@media print`. */
const BODY_CLASS = "printing-agreement";
const ROOT_CLASS = "agreement-print-root";

/** A4 less generous margins, in CSS px. Deliberately narrow — see the measuring note below. */
const MEASURE_WIDTH = 640;
/** Clear space between the running head/foot and the text, so nothing ever touches. */
const GAP = 10;

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

/**
 * Strip the whitish background out of photographed signatures, as the PDF path does.
 *
 * Best-effort: a signature that cannot be re-fetched with CORS keeps its original image, which
 * still prints — just with the paper it was photographed on.
 */
async function normalizeSignatures(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-signature]"));
  await Promise.all(
    imgs.map(async (img) => {
      const clean = await normalizeSignatureUrl(img.src);
      if (clean) img.src = clean;
    }),
  );
}

/**
 * Print one rendered document.
 *
 * Resolves once the print dialog has been dismissed and the page has been put back as it was.
 */
export async function printAgreementElement(paperEl: HTMLElement): Promise<void> {
  const existing = document.querySelector(`.${ROOT_CLASS}`);
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  /**
   * Laid out off-screen, not hidden, until the header and footer have been measured.
   *
   * `.agreement-print-root` is `display: none` on screen, and an element that is not displayed
   * reports a height of zero — so measuring it while hidden set the running-head padding to 0px
   * and let the first paragraph print underneath the letterhead. Inline styles beat the class
   * rule; the print stylesheet then beats these with `!important`.
   *
   * The width is A4 less typical margins, and slightly narrower than that: measuring narrow makes
   * the header wrap sooner, which errs towards a little extra space rather than an overlap.
   */
  root.style.cssText = `display:block;position:fixed;left:-20000px;top:0;width:${MEASURE_WIDTH}px;`;

  const paper = paperEl.cloneNode(true) as HTMLElement;
  paper.classList.remove("max-w-[820px]", "mx-auto", "shadow-sm");

  // Lift the running header and footer out of the flow so they can be pinned to the sheet.
  const head = paper.querySelector<HTMLElement>('[data-pdf="letterhead"]');
  const foot = paper.querySelector<HTMLElement>('[data-pdf="letterfoot"]');
  const running = document.createElement("div");
  running.className = "print-running-head";
  const runningFoot = document.createElement("div");
  runningFoot.className = "print-running-foot";
  if (head) { head.remove(); running.appendChild(head); }
  if (foot) { foot.remove(); runningFoot.appendChild(foot); }

  const flow = document.createElement("div");
  flow.className = "print-flow";
  flow.appendChild(paper);

  root.appendChild(running);
  root.appendChild(flow);
  root.appendChild(runningFoot);
  document.body.appendChild(root);

  await normalizeSignatures(root);
  await waitForImages(root);

  /**
   * Reserve the space the pinned header and footer occupy.
   *
   * Measured rather than guessed: the letterhead's height depends on how many address lines the
   * company has, and a hardcoded padding would either overlap the first paragraph or leave a band
   * of white space on every page.
   */
  const headH = running.offsetHeight + GAP;
  const footH = runningFoot.offsetHeight + GAP;

  // Done measuring: drop the off-screen positioning so the print stylesheet governs the layout.
  root.style.cssText = "";
  root.style.setProperty("--print-head-h", `${headH}px`);
  root.style.setProperty("--print-foot-h", `${footH}px`);

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
    // Let the browser lay the clone out before the dialog freezes it.
    setTimeout(() => {
      window.print();
      // Safari never fires afterprint from a programmatic print; this is its safety net.
      setTimeout(cleanup, 1000);
    }, 120);
  });
}
