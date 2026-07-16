/**
 * Print the agreement "paper" using the browser's native print dialog.
 *
 * The element is cloned into a body-level print root; print CSS (index.css) hides
 * everything else while printing. Native printing renders the REAL DOM — crisp vector
 * text and pixel-perfect signature images (both drawn and uploaded) — unlike the old
 * html2canvas→jsPDF pipeline, which rasterized the page and could drop remote images.
 * The print dialog also offers "Save as PDF", so a PDF copy stays one click away.
 */
export async function printAgreementElement(el: HTMLElement): Promise<void> {
  const root = document.createElement("div");
  root.className = "agreement-print-root";
  root.appendChild(el.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add("printing-agreement");

  // Make sure every image in the clone (e.g. the signature) is fully loaded first.
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

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("printing-agreement");
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  window.print();
  // Fallback for browsers that don't fire afterprint reliably.
  setTimeout(cleanup, 1500);
}
