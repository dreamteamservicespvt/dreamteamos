import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { normalizeSignatureUrl } from "@/utils/signatureImage";

/**
 * Multi-page document export with real pagination and a real letterhead.
 *
 * Instead of screenshotting one tall element and slicing it blindly (which cuts lines of text in
 * half at page boundaries), the document is re-laid-out into true A4 page shells: its blocks
 * (title, reference block, each paragraph/heading, each signature, the footer) are distributed
 * page by page, and a block that would cross a boundary moves to the next page whole.
 *
 * **Every page gets the letterhead and the foot rule.** This used to be the single worst thing
 * about the downloaded file: the letterhead node was never collected into any page shell, so a
 * letter that looked properly headed on screen arrived as bare text with no company name, no
 * address and no GSTIN on it — page one included. A letter nobody can tell the origin of is not a
 * letter. Page two onwards gets the same header for the same reason: a bank looking at page 3 of
 * an offer letter has to be able to see whose page 3 it is.
 *
 * Signatures: before rendering, each signature image is re-fetched with CORS and normalized
 * (whitish photo background → transparent), so even legacy raw-photo signatures come out clean.
 */

const PAGE_W = 794;  // A4 width in CSS px @ 96dpi
const PAGE_H = 1123; // A4 height in CSS px @ 96dpi

/** Breathing room under the footer so a descender never touches the page-number line. */
const FOOT_GAP = 14;

/**
 * Clear space kept between the last line on a page and the foot rule.
 *
 * Taken off the flowing column by pushing the footer down, NOT by relaxing the overflow test.
 * `scrollHeight` is defined as at least `clientHeight`, so `scrollHeight > clientHeight - safety`
 * is true even for an empty column — that version broke every block onto its own page and turned a
 * three-page letter into thirty-seven.
 */
const BOTTOM_SAFETY = 18;

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
  pdf.text(`Page ${page} of ${total}`, pdfW / 2, pdfH - 16, { align: "center" });
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

    // 2) The furniture that repeats on every page, and the blocks that flow between them.
    const letterhead = src.querySelector<HTMLElement>('[data-pdf="letterhead"]');
    const letterfoot = src.querySelector<HTMLElement>('[data-pdf="letterfoot"]');
    const title = src.querySelector<HTMLElement>('[data-pdf="title"]');
    const headerBlock = src.querySelector<HTMLElement>('[data-pdf="header-block"]');
    const bodyEl = src.querySelector<HTMLElement>('[data-pdf="body"]');
    const footer = src.querySelector<HTMLElement>('[data-pdf="footer"]');

    const blocks: HTMLElement[] = [];
    if (title) blocks.push(title);
    if (headerBlock) blocks.push(headerBlock);
    if (bodyEl) blocks.push(...(Array.from(bodyEl.children) as HTMLElement[]));
    if (footer) blocks.push(footer);
    if (blocks.length === 0) blocks.push(src); // fallback: whole paper as one block

    // 3) Distribute blocks into true A4 page shells — breaks happen BETWEEN blocks only.
    const paperClasses = paperEl.className
      .replace("max-w-[820px]", "")
      .replace("mx-auto", "")
      .replace("shadow-sm", "");

    const pages: HTMLElement[] = [];
    /**
     * A page: letterhead pinned at the top, foot rule pinned at the bottom, content between.
     *
     * Flex column with the content flexing, so `inner.scrollHeight` overflowing its own box is the
     * signal to break — measured against the space actually left after the furniture, not against
     * the whole sheet. That is what stopped a page ending mid-clause with white space below it.
     */
    const newPage = (): HTMLElement => {
      const page = document.createElement("div");
      page.className = paperClasses;
      page.style.cssText = [
        `width:${PAGE_W}px`, `height:${PAGE_H}px`,
        "overflow:hidden", "box-shadow:none", "color-scheme:light",
        "display:flex", "flex-direction:column",
      ].join(";");

      if (letterhead) {
        const head = letterhead.cloneNode(true) as HTMLElement;
        head.style.flex = "0 0 auto";
        page.appendChild(head);
      }

      const inner = document.createElement("div");
      inner.className = bodyEl?.className || "";
      inner.style.cssText = "flex:1 1 auto;min-height:0;";
      if (bodyEl) {
        // Carry the body's own type settings onto the flowing column, so a paragraph reads the
        // same on page 3 as it did on page 1.
        inner.style.fontSize = bodyEl.style.fontSize;
        inner.style.lineHeight = bodyEl.style.lineHeight;
      }
      page.appendChild(inner);

      if (letterfoot) {
        const foot = letterfoot.cloneNode(true) as HTMLElement;
        foot.style.flex = "0 0 auto";
        foot.style.marginTop = `${BOTTOM_SAFETY}px`;
        foot.style.paddingBottom = `${FOOT_GAP}px`;
        page.appendChild(foot);
      }

      stage.appendChild(page);
      pages.push(page);
      return inner;
    };

    /**
     * Blocks that must not be the last thing on a page.
     *
     * A heading stranded at the foot of a sheet with its clause overleaf is the classic printing
     * fault, and it reads as carelessness on a document somebody is about to sign. Blank spacers
     * count too: a page ending in whitespace has simply wasted the room the next paragraph needed.
     */
    const keepWithNext = (el: Element | null): boolean => {
      if (!el) return false;
      if (el.getAttribute("data-pdf") === "heading") return true;
      return (el.textContent || "").trim() === "";
    };

    let inner = newPage();
    for (const block of blocks) {
      inner.appendChild(block);
      // Overflowing its own flex box — not the sheet — is what "this block does not fit" means
      // once a header and a footer are taking up part of every page.
      if (inner.scrollHeight > inner.clientHeight && inner.children.length > 1) {
        const previous = inner;
        previous.removeChild(block);

        // Drag any heading (and trailing blank space) across with the block it introduces.
        const carried: Element[] = [];
        while (previous.children.length > 1 && keepWithNext(previous.lastElementChild)) {
          carried.unshift(previous.removeChild(previous.lastElementChild!));
        }

        inner = newPage();
        carried.forEach((el) => inner.appendChild(el));
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
