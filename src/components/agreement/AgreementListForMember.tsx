import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileText, Download, CheckCircle2, Clock, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Agreement, watchMemberAgreements } from "@/services/agreements";
import AgreementView, { companySideOf } from "./AgreementView";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { downloadAgreementPdf } from "@/utils/agreementPdf";

/**
 * Read-only list of a specific member's agreements — for admins / team leads viewing a
 * member's profile. Open to read the beautified document and download the (signed) PDF.
 */
export default function AgreementListForMember({ memberId }: { memberId: string }) {
  const { toast } = useToast();
  // Inlined so a generated letter's letterhead survives the PDF export.
  const logo = useCompanyLogo();
  const [list, setList] = useState<Agreement[]>([]);
  const [open, setOpen] = useState<Agreement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!memberId) return;
    const unsub = watchMemberAgreements(memberId, setList);
    return () => unsub();
  }, [memberId]);

  const handleDownload = async () => {
    if (!paperRef.current || !open || downloading) return;
    setDownloading(true);
    try {
      await downloadAgreementPdf(paperRef.current, `${open.title.replace(/[^\w]+/g, "_")}.pdf`);
    } catch {
      toast({ title: "Error", description: "Could not generate the PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
        <FileText size={16} /> Agreements
      </h2>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agreements sent to this member yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <button key={a.id} onClick={() => setOpen(a)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-background hover:bg-accent px-3 py-2.5 text-left">
              <div className="min-w-0">
                <div className="font-medium text-foreground text-sm truncate">{a.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  From {a.sentByName}{a.createdAt?.seconds ? ` · ${format(new Date(a.createdAt.seconds * 1000), "dd MMM yyyy")}` : ""}
                </div>
              </div>
              {a.status === "signed" ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                  <CheckCircle2 className="w-3 h-3" /> Signed
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                  <Clock className="w-3 h-3" /> Awaiting signature
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-2 sm:p-4" onClick={() => setOpen(null)}>
          <div className="mx-auto max-w-3xl my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-2 mb-2">
              {open.status === "signed" && (
                <button onClick={handleDownload} disabled={downloading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/90 text-slate-800 hover:bg-white">
                  {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download PDF
                </button>
              )}
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
                logoUrl={logo}
                {...companySideOf(open)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
