/**
 * Content → the paper model the A4 sheets render, with its two images ready.
 *
 * Shared by the builder and Invoices → Settings (its live preview), so both draw the logo and the QR
 * the same way: the uploaded QR image when there is one, otherwise a QR made here from the UPI ID with
 * the total in it; the invoice's own logo, otherwise the company's — drawn at its natural proportions
 * (`fitLogo`), because the PDF's renderer ignores `object-fit`.
 *
 * `ready` is true once every image the sheets need matches the content — the PDF waits for it.
 */
import { useMemo } from "react";
import type { InvoiceContent, InvoiceStatus } from "@/types/invoice";
import { computeInvoice } from "@/utils/invoiceMath";
import { upiPaymentLink } from "@/utils/invoiceDraft";
import { buildPaperModel } from "@/components/invoice/InvoicePaper";
import { useImageSize, useInlinedImage, useQrDataUrl } from "@/components/invoice/useInvoiceAssets";

export function useInvoicePaper(input: {
  content: InvoiceContent | null;
  number: string | null;
  status: InvoiceStatus;
  /** The company logo, inlined (`useCompanyLogo`) — used when the invoice has none of its own. */
  companyLogo: string | null;
}) {
  const { content, number, status, companyLogo } = input;
  const totals = useMemo(() => (content ? computeInvoice(content) : null), [content]);

  const uploadedQrUrl = content?.payment.qrImageUrl || "";
  const upiLink = content && totals && content.payment.showQr && !uploadedQrUrl
    ? upiPaymentLink({ upiId: content.payment.upiId, payeeName: content.seller.name, amount: totals.grandTotal, note: number ? `Invoice ${number}` : "Invoice" })
    : "";
  const generatedQr = useQrDataUrl(upiLink);
  const uploadedQr = useInlinedImage(content?.payment.showQr ? uploadedQrUrl : "");
  const qrSrc = uploadedQrUrl ? uploadedQr.src : generatedQr.src;
  const qrWanted = !!content?.payment.showQr && (!!uploadedQrUrl || !!upiLink);

  const ownLogoUrl = content?.seller.logoUrl || "";
  const uploadedLogo = useInlinedImage(ownLogoUrl);
  const logoSrc = ownLogoUrl ? uploadedLogo.src : companyLogo;
  const logoNatural = useImageSize(logoSrc);

  const model = useMemo(() => (content && totals ? buildPaperModel({
    content, totals, number, status, logoSrc, logoNatural, qrSrc, showQr: qrWanted,
  }) : null), [content, totals, number, status, logoSrc, logoNatural, qrSrc, qrWanted]);

  const ready = (!qrWanted || (uploadedQrUrl ? uploadedQr.ready : generatedQr.ready))
    && (!ownLogoUrl || uploadedLogo.ready)
    && (!logoSrc || !!logoNatural);

  return { model, totals, qrSrc, logoSrc, ready };
}
