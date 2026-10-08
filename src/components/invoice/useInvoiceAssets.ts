/**
 * The two images an invoice prints, ready for the canvas that makes the PDF.
 *
 * - The UPI QR code is drawn HERE, in the browser, with the `qrcode` package the ID cards already use.
 *   The old invoice tool fetched it from a public QR website, which put every client's payment
 *   details in somebody else's server logs and printed a blank square whenever that site was slow.
 * - An uploaded logo is inlined as a data URL, because html2canvas leaves a gap where an image it
 *   would have to fetch should be (the same reason `useCompanyLogo` exists).
 *
 * Each hook reports the source it was made from, so the PDF can wait for the one that matches what
 * is on screen now rather than print a QR for last minute's total.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { inlineImage } from "@/utils/idCardExport";

export function useQrDataUrl(text: string): { src: string | null; ready: boolean } {
  const [state, setState] = useState<{ text: string; src: string | null }>({ text: "", src: null });
  useEffect(() => {
    if (!text) { setState({ text: "", src: null }); return; }
    let alive = true;
    QRCode.toDataURL(text, { margin: 0, width: 384, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      .then((src) => { if (alive) setState({ text, src }); })
      .catch(() => { if (alive) setState({ text, src: null }); });
    return () => { alive = false; };
  }, [text]);
  const ready = state.text === text;
  return { src: ready ? state.src : null, ready };
}

/** The natural size of an image, once it has loaded — so the paper can draw a logo at its own shape. */
export function useImageSize(src: string | null): { width: number; height: number } | null {
  const [size, setSize] = useState<{ src: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!src) { setSize(null); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setSize({ src, width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { if (alive) setSize(null); };
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  return size && size.src === src ? { width: size.width, height: size.height } : null;
}

/**
 * An uploaded QR image made square on a white page before it is stored.
 *
 * Merchant QRs come as all sorts of shapes — a phone screenshot, a PhonePe poster with a heading. The
 * invoice draws the QR in a fixed square, and html2canvas ignores `object-fit`, so anything not square
 * would print stretched. Centred on a white square once, at upload, it prints as it was photographed.
 */
export async function squareImageFile(file: File, maxSide = 900): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("not an image"));
      el.src = url;
    });
    const side = Math.min(maxSide, Math.max(img.naturalWidth, img.naturalHeight));
    const scale = side / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, side, side);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new File([blob], "upi-qr.png", { type: "image/png" }) : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useInlinedImage(url: string): { src: string | null; ready: boolean } {
  const [state, setState] = useState<{ url: string; src: string | null }>({ url: "", src: null });
  useEffect(() => {
    if (!url) { setState({ url: "", src: null }); return; }
    let alive = true;
    inlineImage(url).then((src) => { if (alive) setState({ url, src: src || null }); });
    return () => { alive = false; };
  }, [url]);
  const ready = state.url === url;
  return { src: ready ? state.src : null, ready };
}
