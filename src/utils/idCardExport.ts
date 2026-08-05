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

/** An image's own pixel dimensions, or null when it cannot be read. */
export async function naturalSize(
  src: string | null | undefined,
): Promise<{ width: number; height: number } | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Centre-crop an image to an aspect ratio, in pixels.
 *
 * The card's photograph is cropped here rather than by `object-fit: cover`, because the exporter
 * does not implement object-fit and drew the uncropped picture stretched to the box — the download
 * showed a face a third wider than the one on screen. Cropping the pixels puts the two beyond
 * disagreement. See `PHOTO_BOX` in utils/idCard.
 *
 * Returns the original on any failure: a correctly-shaped card with a slightly-off photo beats no
 * photo at all.
 */
export async function cropToAspect(
  src: string | null | undefined,
  aspect: number,
): Promise<string | null> {
  if (!src || !(aspect > 0)) return src ?? null;
  const size = await naturalSize(src);
  if (!size) return src;

  const { width, height } = size;
  // The largest rectangle of this aspect that fits inside the picture, centred.
  const cropWidth = Math.min(width, height * aspect);
  const cropHeight = Math.min(height, width / aspect);
  const sx = (width - cropWidth) / 2;
  const sy = (height - cropHeight) / 2;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropWidth));
    canvas.height = Math.max(1, Math.round(cropHeight));
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = src;
    });
    if (!img) return src;
    ctx.drawImage(img, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return src;
  }
}

/**
 * One side of the card, rasterised.
 *
 * html2canvas re-lays-out a clone of the page and paints that, so the clone has to be laid out the
 * way the real page is. This used to pass `windowWidth`/`windowHeight` set to the card's own size —
 * a 336 px viewport — which laid the cloned document out at a width the real one never had and was
 * a large part of why the downloaded card did not match the one on screen. The defaults are the
 * real viewport and the real scroll position, which is exactly what is wanted.
 *
 * `imageTimeout: 0` disables the fetch timeout: every image here is already a data URL (see
 * `inlineImage`), so there is nothing to wait for and nothing to give up on.
 */
async function capture(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    imageTimeout: 0,
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
