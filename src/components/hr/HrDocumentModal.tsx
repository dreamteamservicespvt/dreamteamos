import { useRef, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { uploadToCloudinary } from "@/services/cloudinary";
import { declineDocument, signDocument } from "@/services/hrDocuments";
import { downloadAgreementPdf } from "@/utils/agreementPdf";
import AgreementView from "@/components/agreement/AgreementView";
import SignaturePad from "@/components/agreement/SignaturePad";
import type { HrDocument } from "@/types/hr";

/**
 * One issued document, full width, exactly as it will print.
 *
 * The same component serves the admin (reading and downloading) and the employee (reading and
 * signing) — a document should not look different depending on who opened it, least of all one
 * that carries signatures.
 */
export default function HrDocumentModal({ document, canSign, signerName, onClose, onSigned }: {
  document: HrDocument;
  /** True only when the viewer is the employee the document was issued to and it is unsigned. */
  canSign?: boolean;
  signerName?: string;
  onClose: () => void;
  onSigned?: (doc: HrDocument) => void;
}) {
  const { toast } = useToast();
  const paperRef = useRef<HTMLDivElement>(null);
  const logo = useCompanyLogo();
  const [doc, setDoc] = useState<HrDocument>(document);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  const awaitingSignature = canSign && doc.requiresEmployeeSignature && doc.status === "issued";

  const handleSign = async (file: File) => {
    setSaving(true);
    try {
      const url = await uploadToCloudinary(file);
      const signedDate = format(new Date(), "yyyy-MM-dd");
      await signDocument(doc, { signatureUrl: url, signedName: signerName || doc.memberName, signedDate });
      const next: HrDocument = {
        ...doc,
        status: "signed",
        employeeSignatureUrl: url,
        signedName: signerName || doc.memberName,
        signedDate,
      };
      setDoc(next);
      onSigned?.(next);
      toast({ title: "Signed", description: "Your signature has been saved on this document." });
    } catch {
      toast({ title: "Error", description: "Could not save your signature. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await declineDocument(doc, declineReason.trim());
      setDoc({ ...doc, status: "declined", declinedReason: declineReason.trim() });
      setShowDecline(false);
      toast({ title: "Recorded", description: "Your objection has been sent to the issuer." });
    } catch {
      toast({ title: "Error", description: "Could not record it. Try again.", variant: "destructive" });
    } finally {
      setDeclining(false);
    }
  };

  const handleDownload = async () => {
    if (!paperRef.current || downloading) return;
    setDownloading(true);
    try {
      await downloadAgreementPdf(paperRef.current, `${doc.title.replace(/[^\w]+/g, "_")}.pdf`);
    } catch {
      toast({ title: "Error", description: "Could not generate the PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div className="mx-auto my-4 max-w-3xl" onClick={(e) => e.stopPropagation()} data-test="hr-document-modal">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-lg bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white/90">
            {doc.memberName} · {doc.issuedOn}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload} disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF
            </button>
            <button onClick={onClose} className="rounded-lg bg-white/90 p-1.5 text-slate-800 hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg">
          <AgreementView
            ref={paperRef}
            letterhead
            logoUrl={logo}
            bodyText={doc.bodyText}
            memberName={doc.memberName}
            memberPhone={doc.memberPhone}
            signatureUrl={doc.employeeSignatureUrl || undefined}
            signedName={doc.signedName || undefined}
            signedDate={doc.signedDate || undefined}
            companySignatureUrl={doc.companySignatureUrl}
            companySignedName={doc.issuedByName}
            companyDesignation={doc.issuedByDesignation}
            companySignedDate={doc.issuedOn}
            companyStampUrl={doc.companyStampUrl}
          />
        </div>

        {doc.status === "declined" && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            Not signed{doc.declinedReason ? ` — ${doc.declinedReason}` : ""}. The issuer has been informed.
          </p>
        )}

        {awaitingSignature && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-white/80">
              Read the document above. Adding your signature records your acceptance of it.
            </p>
            <SignaturePad onSave={handleSign} saving={saving} saveLabel="Sign this document" />
            {showDecline ? (
              <div className="mt-2 rounded-xl border border-border bg-card p-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Why are you not signing this?
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setShowDecline(false)}
                    className="flex-1 rounded-lg border border-border bg-background py-2 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDecline} disabled={declining || !declineReason.trim()}
                    className="flex-1 rounded-lg bg-destructive py-2 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                  >
                    {declining ? "Sending…" : "Send objection"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDecline(true)}
                className="mt-2 text-xs text-white/70 underline underline-offset-2 hover:text-white"
              >
                I do not agree with this document
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
