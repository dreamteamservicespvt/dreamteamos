import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Download, Loader2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadToCloudinary } from "@/services/cloudinary";
import { downloadAgreementPdf } from "@/utils/agreementPdf";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import AgreementView from "@/components/agreement/AgreementView";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import SignaturePad from "@/components/agreement/SignaturePad";
import type { FrozenLetter } from "@/types/onboarding";

/**
 * One letter, as the person being hired sees it: read it, sign it, keep a copy, move on.
 *
 * The paper is the same `AgreementView` the company uses internally and the PDF is the same
 * paginated export — what a candidate downloads on their phone is byte-identical to what the admin
 * downloads later from the member's Documents tab. There is no candidate-flavoured version of a
 * legal document.
 *
 * Signing is deliberately one action. There is no separate "I agree" checkbox above the signature
 * pad, because a signature IS the agreement — asking for both suggests one of them is decorative.
 */
export default function LetterStep({
  letter, candidateName, candidatePhone, companySignatureUrl, companyStampUrl, companySignedName, companyDesignation,
  signatureUrl, signedOn, signed, signLabel, continueLabel, onSigned, onContinue, onDecline,
}: {
  letter: FrozenLetter;
  candidateName: string;
  candidatePhone?: string;
  companySignatureUrl: string;
  companyStampUrl?: string | null;
  companySignedName: string;
  companyDesignation: string;
  /** The candidate's signature, once it exists. */
  signatureUrl?: string | null;
  signedOn?: string | null;
  signed: boolean;
  signLabel: string;
  continueLabel: string;
  /** Given the uploaded signature's URL. Resolves false when the server refused it. */
  onSigned: (signatureUrl: string) => Promise<boolean>;
  onContinue: () => void;
  onDecline: (reason: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const paperRef = useRef<HTMLDivElement>(null);
  const { printing, print } = usePrintDocument(paperRef);
  const logo = useCompanyLogo();
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);

  const handleSign = async (file: File) => {
    setSaving(true);
    try {
      const url = await uploadToCloudinary(file);
      const ok = await onSigned(url);
      if (ok) toast({ title: "Signed", description: "Your signature has been recorded on this letter." });
    } catch {
      toast({
        title: "Could not save your signature",
        description: "Please check your connection and try once more.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!paperRef.current || downloading) return;
    setDownloading(true);
    try {
      await downloadAgreementPdf(paperRef.current, `${letter.title.replace(/[^\w]+/g, "_")}.pdf`);
    } catch {
      toast({ title: "Could not create the PDF", description: "Please try again.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline(declineReason.trim());
    } finally {
      setDeclining(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl bg-slate-200 p-2 md:p-4">
        <AgreementView
          ref={paperRef}
          letterhead
          logoUrl={logo}
          bodyText={letter.bodyText}
          memberName={candidateName}
          memberPhone={candidatePhone}
          signatureUrl={signatureUrl || undefined}
          signedName={signed ? candidateName : undefined}
          signedDate={signedOn || undefined}
          companySignatureUrl={companySignatureUrl}
          companyStampUrl={companyStampUrl}
          companySignedName={companySignedName}
          companyDesignation={companyDesignation}
          companySignedDate={letter.issuedOn}
        />
      </div>

      {signed ? (
        <div className="space-y-3" data-test="letter-signed">
          <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">Signed and accepted</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Please download a copy for your own records — you can also find it in the platform later.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={print}
              disabled={printing}
              data-test="print-document"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              data-test="letter-download"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
            <button
              onClick={onContinue}
              data-test="letter-continue"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {continueLabel} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Please read the letter above in full. Adding your signature records your acceptance of it.
            You can sign with your finger, or photograph your signature from paper.
          </p>
          <SignaturePad onSave={handleSign} saving={saving} saveLabel={signLabel} />

          {showDecline ? (
            <div className="rounded-xl border border-border bg-card p-3" data-test="decline-form">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Please tell us why, and we will get back to you
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setShowDecline(false)}
                  className="flex-1 rounded-lg border border-border bg-background py-2.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDecline}
                  disabled={declining || !declineReason.trim()}
                  data-test="decline-submit"
                  className="flex-1 rounded-lg bg-destructive py-2.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                >
                  {declining ? "Sending…" : "Send my reply"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDecline(true)}
              className="w-full py-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              I have a question, or I cannot accept this
            </button>
          )}
        </div>
      )}
    </div>
  );
}
