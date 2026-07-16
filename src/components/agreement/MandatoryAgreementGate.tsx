import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileSignature, Loader2, Download, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";
import { uploadToCloudinary } from "@/services/cloudinary";
import { Agreement, signAgreement, watchMemberAgreements } from "@/services/agreements";
import AgreementView from "./AgreementView";
import SignaturePad from "./SignaturePad";
import { exportElementToPdf } from "@/utils/agreementPdf";

const MEMBER_ROLES = new Set(["tech_member", "sales_member", "tech_team_leader"]);

/**
 * MANDATORY agreement acknowledgement gate.
 * As soon as a member has any unsigned agreement, this full-screen popup opens with the
 * agreement itself and the signature pad embedded. There is NO close button and clicking
 * the backdrop does nothing — the only way forward is to sign. Signing updates the doc,
 * the live watcher removes it from the unsigned queue, and the gate advances to the next
 * unsigned agreement (or disappears when none remain).
 */
export default function MandatoryAgreementGate() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [unsigned, setUnsigned] = useState<Agreement[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSigned, setJustSigned] = useState<Agreement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !MEMBER_ROLES.has(user.role)) return;
    const unsub = watchMemberAgreements(user.uid, (list) => {
      setUnsigned(list.filter((a) => a.status !== "signed"));
    });
    return () => unsub();
  }, [user?.uid, user?.role]);

  if (!user || !MEMBER_ROLES.has(user.role)) return null;

  const current = unsigned[0];
  if (!current && !justSigned) return null;

  const handleSign = async (file: File) => {
    if (!current || saving) return;
    setSaving(true);
    try {
      const url = await uploadToCloudinary(file);
      const signedDate = format(new Date(), "yyyy-MM-dd");
      await signAgreement(current, { signatureUrl: url, signedName: user.name, signedDate });
      setJustSigned({ ...current, status: "signed", signatureUrl: url, signedName: user.name, signedDate });
      toast({ title: "Agreement signed", description: "Thank you — your acknowledgement has been recorded." });
    } catch {
      toast({ title: "Error", description: "Could not save your signature. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!paperRef.current || !justSigned) return;
    setDownloading(true);
    try {
      await exportElementToPdf(paperRef.current, `${justSigned.title.replace(/[^\w]+/g, "_")}.pdf`);
    } catch {
      toast({ title: "Error", description: "Could not generate the PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  // Success screen for the one just signed — the only dismissible moment (Continue button).
  if (justSigned) {
    return (
      <div className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm overflow-y-auto p-2 sm:p-4">
        <div className="mx-auto max-w-3xl my-4">
          <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 mb-2 flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4" /> Signed successfully — keep a copy if you like.
            </span>
            <div className="flex items-center gap-2">
              <button onClick={handleDownload} disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25">
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF
              </button>
              <button onClick={() => setJustSigned(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-50">
                Continue {unsigned.length > 0 ? `(${unsigned.length} more to sign)` : ""}
              </button>
            </div>
          </div>
          <div className="rounded-lg overflow-hidden">
            <AgreementView
              ref={paperRef}
              bodyText={justSigned.bodyText}
              memberName={justSigned.memberName}
              memberPhone={justSigned.memberPhone}
              signatureUrl={justSigned.signatureUrl}
              signedName={justSigned.signedName}
              signedDate={justSigned.signedDate}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm overflow-y-auto p-2 sm:p-4">
      <div className="mx-auto max-w-3xl my-4">
        <div className="rounded-xl bg-amber-500 text-amber-950 px-4 py-3 mb-2 flex items-center gap-2 font-semibold text-sm">
          <FileSignature className="w-4 h-4 shrink-0" />
          Action required: you must read and sign this agreement to continue
          {unsigned.length > 1 ? ` (1 of ${unsigned.length})` : ""}.
        </div>

        <div className="rounded-lg overflow-hidden">
          <AgreementView
            bodyText={current.bodyText}
            memberName={current.memberName}
            memberPhone={current.memberPhone}
          />
        </div>

        <div className="mt-3">
          <p className="text-xs text-white/90 mb-2">
            From {current.sentByName}. Add your signature below to accept and acknowledge this agreement:
          </p>
          <SignaturePad onSave={handleSign} saving={saving} />
        </div>
      </div>
    </div>
  );
}
