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
