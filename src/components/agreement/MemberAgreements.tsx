import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileText, Printer, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";
import { uploadToCloudinary } from "@/services/cloudinary";
import { Agreement, signAgreement, watchMemberAgreements } from "@/services/agreements";
import AgreementView from "./AgreementView";
import SignaturePad from "./SignaturePad";
import { printAgreementElement } from "@/utils/agreementPrint";

/** Member's own agreements section (shown in their profile). */
export default function MemberAgreements() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [list, setList] = useState<Agreement[]>([]);
  const [open, setOpen] = useState<Agreement | null>(null);
  const [saving, setSaving] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = watchMemberAgreements(user.uid, setList);
    return () => unsub();
  }, [user?.uid]);

  if (!user) return null;

  const handleSign = async (file: File) => {
    if (!open) return;
    setSaving(true);
    try {
      const url = await uploadToCloudinary(file);
      await signAgreement(open, { signatureUrl: url, signedName: user.name, signedDate: format(new Date(), "yyyy-MM-dd") });
      toast({ title: "Signed", description: "Your agreement has been signed and saved." });
      setOpen({ ...open, status: "signed", signatureUrl: url, signedName: user.name, signedDate: format(new Date(), "yyyy-MM-dd") });
    } catch {
      toast({ title: "Error", description: "Could not save your signature. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!paperRef.current) return;
    try {
      await printAgreementElement(paperRef.current);
    } catch {
      toast({ title: "Error", description: "Could not open the print dialog.", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-display font-semibold text-foreground flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-primary" /> My Agreements
      </h3>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agreements yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <button key={a.id} onClick={() => setOpen(a)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-background hover:bg-accent px-3 py-2.5 text-left">
              <div className="min-w-0">
                <div className="font-medium text-foreground text-sm truncate">{a.title}</div>
                <div className="text-[11px] text-muted-foreground">From {a.sentByName}</div>
              </div>
              {a.status === "signed" ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                  <CheckCircle2 className="w-3 h-3" /> Signed
                </span>
              ) : (
                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">Sign required</span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-2 sm:p-4" onClick={() => setOpen(null)}>
          <div className="mx-auto max-w-3xl my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {open.status === "signed" && (
                  <button onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/90 text-slate-800 hover:bg-white">
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                )}
              </div>
              <button onClick={() => setOpen(null)} className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="rounded-lg overflow-hidden">
              <AgreementView
                ref={paperRef}
                bodyText={open.bodyText}
                memberName={open.memberName}
                memberPhone={open.memberPhone}
                signatureUrl={open.signatureUrl}
                signedName={open.signedName}
                signedDate={open.signedDate}
              />
            </div>

            {open.status !== "signed" && (
              <div className="mt-3">
                <p className="text-xs text-white/80 mb-2">Add your signature to accept and sign this agreement:</p>
                <SignaturePad onSave={handleSign} saving={saving} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
