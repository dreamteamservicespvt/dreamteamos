/**
 * Getting an ID card out of the browser, as a picture or as something printable.
 *
 * Two formats because they answer two different questions. PNG is what somebody puts in a
 * WhatsApp message or a Slack profile — one image, both sides, nothing to open. PDF is what goes
 * to a printer: the card is placed at its true 53.98 × 85.6 mm so it comes off the sheet the size
 * of a real badge and drops into a holder without being rescaled by hand.
 *
 * Photos are inlined as data URLs *before* capture (see `inlineImage`). html2canvas cannot read
 * pixels from a cross-origin image it did not fetch itself, and the failure mode is silent — a
 * card that exports with a blank hole where the face was. Fetching first turns that into a
 * fallback to initials, which is at least honest.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CARD_MM } from "@/utils/idCard";

/** Space between the two cards in the exported picture, in canvas px. */
const GAP = 24;

/**
 * Fetch an image and return it as a data URL. Null when it cannot be had — callers fall back to
 * whatever they render without a photo rather than failing the whole export.
 */
export async function inlineImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function capture(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    // The card is a fixed-size box; letting html2canvas infer the window can clip the shadow.
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** A safe file name from a person's name — "Asha Devi" → "Asha_Devi_ID_Card". */
export function idCardFilename(name: string, extension: string): string {
  const slug = (name || "employee").trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "employee";
  return `${slug}_ID_Card.${extension}`;
}

/**
 * Both sides, side by side, as one PNG.
 *
 * Rendered at 3× so the text stays sharp when someone views it full-screen on a phone — the card
 * is only 336 px wide on screen, and a 1× export looks like a screenshot of a screenshot.
 */
export async function downloadIdCardPng(front: HTMLElement, back: HTMLElement | null, name: string): Promise<void> {
  const scale = 3;
  const frontCanvas = await capture(front, scale);
  const backCanvas = back ? await capture(back, scale) : null;

  const gap = backCanvas ? GAP * scale : 0;
  const sheet = document.createElement("canvas");
  sheet.width = frontCanvas.width + gap + (backCanvas?.width || 0);
  sheet.height = Math.max(frontCanvas.height, backCanvas?.height || 0);

  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.drawImage(frontCanvas, 0, 0);
  if (backCanvas) ctx.drawImage(backCanvas, frontCanvas.width + gap, 0);

  triggerDownload(sheet.toDataURL("image/png"), idCardFilename(name, "png"));
}

/** Both sides on one A4 page, at print size, centred with a cutting gap between them. */
export async function downloadIdCardPdf(front: HTMLElement, back: HTMLElement | null, name: string): Promise<void> {
  const frontCanvas = await capture(front, 3);
  const backCanvas = back ? await capture(back, 3) : null;

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const gapMm = 8;
  const totalW = CARD_MM.width * (backCanvas ? 2 : 1) + (backCanvas ? gapMm : 0);
  const x = (pageW - totalW) / 2;
  const y = 24;

  pdf.addImage(frontCanvas.toDataURL("image/png"), "PNG", x, y, CARD_MM.width, CARD_MM.height, undefined, "FAST");
  if (backCanvas) {
    pdf.addImage(
      backCanvas.toDataURL("image/png"), "PNG",
      x + CARD_MM.width + gapMm, y, CARD_MM.width, CARD_MM.height, undefined, "FAST",
    );
  }

  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    `${name} — employee ID card. Print at 100% (no "fit to page") and cut along the card edges.`,
    pageW / 2, y + CARD_MM.height + 8, { align: "center" },
  );

  pdf.save(idCardFilename(name, "pdf"));
}
