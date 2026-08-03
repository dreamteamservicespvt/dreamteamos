import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { normalizeSignatureUrl } from "@/utils/signatureImage";

/**
 * Multi-page agreement PDF export with REAL pagination.
 *
 * Instead of screenshotting one tall element and slicing it blindly (which cuts lines of
 * text in half at page boundaries), the agreement is re-laid-out into true A4 page shells:
 * its blocks (title, each paragraph/heading, the signature box, footer) are distributed
 * page by page, and a block that would cross a page boundary moves to the next page whole.
 * Every page is rendered to canvas individually, so every page of the PDF is complete and
 * nothing is ever clipped mid-line — regardless of agreement length.
 *
 * Signatures: before rendering, each signature image is re-fetched with CORS and
 * normalized (whitish photo background → transparent), so even legacy raw-photo
 * signatures come out clean in the PDF.
 */

const PAGE_W = 794;  // A4 width in CSS px @ 96dpi
const PAGE_H = 1123; // A4 height in CSS px @ 96dpi

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

/** Replace signature imgs with normalized (background-stripped) data-URLs when possible. */
async function normalizeSignatureImgs(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-signature]"));
  await Promise.all(
    imgs.map(async (img) => {
      const clean = await normalizeSignatureUrl(img.src);
      if (clean) {
        img.src = clean;
        img.classList.remove("mix-blend-multiply"); // already clean; html2canvas ignores blends anyway
      }
    }),
  );
}

/**
 * "Page 2 of 4", written into the PDF itself.
 *
 * Drawn with jsPDF's own text rather than rendered into the HTML and photographed with the rest of
 * the page, for two reasons. The count is not knowable until every block has been distributed, so
 * the markup would have to be re-rendered once the answer was already in hand; and vector text
 * stays sharp at any zoom, where a number captured at 2× goes soft exactly when somebody is
 * squinting at it to check nothing is missing.
 *
 * Skipped entirely for a single-page letter, where "Page 1 of 1" is noise.
 */
function stampPageNumber(pdf: jsPDF, page: number, total: number, pdfW: number, pdfH: number): void {
  if (total < 2) return;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(130, 138, 150);
  pdf.text(`Page ${page} of ${total}`, pdfW / 2, pdfH - 18, { align: "center" });
}

export async function downloadAgreementPdf(paperEl: HTMLElement, filename: string): Promise<void> {
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-20000px;top:0;z-index:-1;";
  document.body.appendChild(stage);
  try {
    // 1) Clone the on-screen paper at a fixed A4 width so measurements match the output.
    const src = paperEl.cloneNode(true) as HTMLElement;
    src.classList.remove("max-w-[820px]", "mx-auto", "shadow-sm");
    src.style.width = `${PAGE_W}px`;
    src.style.maxWidth = "none";
    const measureWrap = document.createElement("div");
    measureWrap.style.cssText = `width:${PAGE_W}px;background:#fff;`;
    measureWrap.appendChild(src);
    stage.appendChild(measureWrap);

    await normalizeSignatureImgs(src);
    await waitForImages(src);

    // 2) Collect the paginatable blocks (marked by AgreementView).
    const title = src.querySelector<HTMLElement>('[data-pdf="title"]');
    const bodyEl = src.querySelector<HTMLElement>('[data-pdf="body"]');
    const footer = src.querySelector<HTMLElement>('[data-pdf="footer"]');
    const blocks: HTMLElement[] = [];
    if (title) blocks.push(title);
    if (bodyEl) blocks.push(...(Array.from(bodyEl.children) as HTMLElement[]));
    if (footer) blocks.push(footer);
    if (blocks.length === 0) blocks.push(src); // fallback: whole paper as one block

    // 3) Distribute blocks into true A4 page shells — breaks happen BETWEEN blocks only.
    const paperClasses = paperEl.className
      .replace("max-w-[820px]", "")
      .replace("mx-auto", "")
      .replace("shadow-sm", "");
    const pages: HTMLElement[] = [];
    const newPage = (): HTMLElement => {
      const page = document.createElement("div");
      page.className = paperClasses;
      page.style.cssText = `width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;box-shadow:none;color-scheme:light;`;
      const inner = document.createElement("div");
      inner.className = bodyEl?.className || "";
      page.appendChild(inner);
      stage.appendChild(page);
      pages.push(page);
      return inner;
    };
    let inner = newPage();
    for (const block of blocks) {
      inner.appendChild(block);
      const page = pages[pages.length - 1];
      // If this block overflows the page (and it isn't the only block), move it whole
      // to a fresh page so no line of text is ever cut in half.
      if (page.scrollHeight > PAGE_H && inner.children.length > 1) {
        inner = newPage();
        inner.appendChild(block);
      }
    }

    // 4) Render each page individually and assemble the PDF.
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width: PAGE_W,
        height: PAGE_H,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pdfW, pdfH);
      stampPageNumber(pdf, i + 1, pages.length, pdfW, pdfH);
    }
    pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    stage.remove();
  }
}
