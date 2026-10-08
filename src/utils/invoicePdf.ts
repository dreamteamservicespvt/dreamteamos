/**
 * The invoice as a file, and on paper — from the very sheets the live preview shows.
 *
 * `InvoicePreview.capturePages()` renders the current page plan at full A4 size off-screen and hands
 * the sheets here. The PDF photographs each one; print sends clones of them to the browser's dialog
 * through the same path the HR letters use (`agreementPrint.printDocumentPages`). Neither lays
 * anything out again, which is the whole guarantee that the file matches the preview.
 *
 * Photographed at 3× (288 dpi on A4) — sharp on paper and on a phone zoomed into the GSTIN — and
 * saved as JPEG, which keeps a one-page invoice well under a megabyte. jsPDF and html2canvas are
 * loaded on the first download, not with the builder.
 */
import { PAGE_H, PAGE_W } from "@/components/invoice/InvoicePaper";
import { printDocumentPages } from "@/utils/agreementPrint";

/**
 * html2canvas finds where text sits by measuring a 1×1 probe `<img>` it adds to the LIVE page
 * (`FontMetrics.parseMetrics`, html2canvas 1.4.1). Tailwind's base styles make every `img`
 * `display: block`, which throws that measurement off — every line in the file landed about 5 px
 * low (the PAID pill's word sat on its border, "Total" on the bottom of its box), found in the
 * 2026-10-08 browser run. The probe is recognised by its fixed source and put back inline for the
 * duration of the capture; nothing else on the page is touched.
 */
const HTML2CANVAS_PROBE = 'img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"]';

async function withTrueBaselines<T>(run: () => Promise<T>): Promise<T> {
  const style = document.createElement("style");
  style.setAttribute("data-invoice-pdf", "");
  style.textContent = `${HTML2CANVAS_PROBE}{display:inline !important}`;
  document.head.appendChild(style);
  try {
    return await run();
  } finally {
    style.remove();
  }
}

async function imagesReady(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  }))));
}

export async function downloadInvoicePdf(pages: HTMLElement[], filename: string, title: string): Promise<void> {
  if (pages.length === 0) throw new Error("Nothing to export.");
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  if (document.fonts?.ready) await document.fonts.ready;

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  pdf.setProperties({ title, subject: "Invoice", creator: "DTS Manager" });
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();

  await withTrueBaselines(async () => {
    for (let i = 0; i < pages.length; i++) {
      await imagesReady(pages[i]);
      const canvas = await html2canvas(pages[i], {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width: PAGE_W,
        height: PAGE_H,
        windowWidth: PAGE_W,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h, undefined, "FAST");
    }
  });
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function printInvoicePages(pages: HTMLElement[]): Promise<void> {
  if (pages.length === 0) throw new Error("Nothing to print.");
  // Clones: the originals belong to React and must stay where it put them.
  const clones = pages.map((p) => p.cloneNode(true) as HTMLElement);
  await printDocumentPages(clones);
}
