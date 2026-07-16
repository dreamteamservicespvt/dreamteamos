/**
 * Signature image normalization.
 *
 * Turns a photo/scan of a signature (ink on whitish paper) into a clean PNG with a
 * TRANSPARENT background: light pixels become transparent, mid tones fade, dark ink
 * stays. Already-transparent pixels (drawn signatures) are preserved, so running it
 * on any signature is safe. Used at sign time (uploads) and again defensively at
 * PDF-export time so even legacy raw-photo signatures render perfectly.
 */

const MAX_W = 900;
const LIGHT = 208; // luminance ≥ this → fully transparent (paper)
const DARK = 140;  // luminance ≤ this → fully opaque (ink)

function stripBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 20) continue; // already transparent (drawn signature) — leave untouched
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum >= LIGHT) {
      d[i + 3] = 0;
    } else if (lum > DARK) {
      d[i + 3] = Math.round(((LIGHT - lum) / (LIGHT - DARK)) * 255);
    }
    // else: keep fully opaque ink, original colour (works for blue/black pens)
  }
  ctx.putImageData(imageData, 0, 0);
}

/** Crop away fully transparent borders (with a small margin) so the signature sits tight. */
function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas; // nothing visible — keep as is
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function drawToCanvas(img: HTMLImageElement | HTMLCanvasElement, srcW: number, srcH: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_W / srcW);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  stripBackground(ctx, canvas.width, canvas.height);
  return trimTransparent(canvas);
}

const loadImage = (src: string, crossOrigin?: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });

/** Normalize an uploaded/captured signature file → clean transparent PNG file. */
export async function normalizeSignatureFile(file: File): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return file;
      return new File([blob], "signature.png", { type: "image/png" });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file; // never block signing on normalization
  }
}

/**
 * Normalize a remote signature URL → PNG data-URL (for PDF export of legacy signatures).
 * Returns null when the image can't be fetched with CORS — caller keeps the original.
 */
export async function normalizeSignatureUrl(url: string): Promise<string | null> {
  try {
    const img = await loadImage(url, "anonymous");
    const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
