import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { PAGE_H, PAGE_W, paginateDocument } from "@/utils/documentPages";

/**
 * Multi-page document export.
 *
 * The layout work — distributing blocks into A4 sheets, each with its own letterhead and foot rule
 * — lives in `documentPages`, shared with the print path so a downloaded PDF and a printed copy
 * break in exactly the same places. All this file does is photograph each finished sheet and
 * assemble them.
 *
 * Photographed rather than written as text, which is a real trade: the file is a megabyte and its
 * words cannot be selected. What it buys is a page that looks identical everywhere, on any printer
 * and any PDF reader, with the signatures and the seal exactly where they were on screen. Print
 * (`agreementPrint`) is the other side of that trade and is offered alongside it.
 */

/**
 * "Page 2 of 4", written into the PDF itself.
 *
 * Drawn with jsPDF's own text rather than rendered into the sheet and photographed with it: the
 * count is not knowable until every block has been distributed, and vector text stays sharp at any
 * zoom, where a number captured at 2× goes soft exactly when somebody is squinting to check nothing
 * is missing. Skipped for a single-page letter, where "Page 1 of 1" is noise.
 */
function stampPageNumber(pdf: jsPDF, page: number, total: number, pdfW: number, pdfH: number): void {
  if (total < 2) return;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(130, 138, 150);
  pdf.text(`Page ${page} of ${total}`, pdfW / 2, pdfH - 16, { align: "center" });
}

export async function downloadAgreementPdf(paperEl: HTMLElement, filename: string): Promise<void> {
  const { pages, stage } = await paginateDocument(paperEl);
  try {
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
