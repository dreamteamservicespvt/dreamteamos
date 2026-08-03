/**
 * An employee's ID card, on screen before it is anywhere else.
 *
 * One component for both readers — the admin looking at a member, and the member looking at
 * themselves. A card should not differ by who opened it, least of all one people are asked to
 * carry. Both sides are shown at once rather than behind a flip, because the thing anyone
 * actually checks on an ID card is usually printed on the back.
 *
 * Downloads offer PNG and PDF side by side: one is for sending, the other for printing, and
 * making somebody guess which of the two a single "Download" button produces is exactly how a
 * card ends up printed at the wrong size.
 */
import { useEffect, useRef, useState } from "react";
import { Download, FileImage, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildIdCard, idCardVerifyUrl, CARD_HEIGHT, CARD_WIDTH } from "@/utils/idCard";
import { downloadIdCardPdf, downloadIdCardPng, inlineImage } from "@/utils/idCardExport";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";
import QRCode from "qrcode";
import { watchCompanyAssets, type CompanyAssets } from "@/services/companyAssets";
import { IdCardBack, IdCardFront } from "./IdCardView";

export default function IdCardPanel({ member, profile, provisionalHint }: {
  member: AppUser;
  /** Absent for a member with no HR record — the card falls back to the user record. */
  profile?: EmployeeProfile | null;
  /** What to tell this reader when no employee ID has been assigned. Admins can fix it; members can't. */
  provisionalHint?: string;
}) {
  const { toast } = useToast();
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  /** Photo and logo as data URLs — see idCardExport.inlineImage for why this must happen first. */
  const [photo, setPhoto] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  /** The verification QR, drawn locally — no network, so it exports with the rest of the card. */
  const [qr, setQr] = useState<string | null>(null);
  /** The company's own marks — the CEO signature the card is issued under. */
  const [marks, setMarks] = useState<CompanyAssets>({});
  const [ceoSignature, setCeoSignature] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => watchCompanyAssets(setMarks), []);

  const base = buildIdCard(member, profile);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      const [p, l, sig, ceo, code] = await Promise.all([
        inlineImage(base.photoUrl),
        inlineImage("/dts-logo-full.png"),
        inlineImage(base.signatureUrl),
        inlineImage(marks.ceoSignatureUrl || null),
        // Deep navy on white: a QR needs contrast far more than it needs to match the brand, and
        // a mid-blue code is the one that phones fail to read in a badge holder under strip lights.
        QRCode.toDataURL(idCardVerifyUrl(base.uid), {
          margin: 1,
          width: 240,
          errorCorrectionLevel: "M",
          color: { dark: "#0b1f5cff", light: "#ffffffff" },
        }).catch(() => null),
      ]);
      if (cancelled) return;
      setPhoto(p);
      setLogo(l);
      setSignature(sig);
      setCeoSignature(ceo);
      setQr(code);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [base.photoUrl, base.signatureUrl, base.uid, marks.ceoSignatureUrl]);

  // If the photo could not be inlined, drop it rather than exporting a card with a blank hole.
  const data = { ...base, photoUrl: photo, signatureUrl: signature };

  const run = async (kind: "png" | "pdf") => {
    if (!frontRef.current || busy) return;
    setBusy(kind);
    try {
      const download = kind === "png" ? downloadIdCardPng : downloadIdCardPdf;
      await download(frontRef.current, backRef.current, data.name);
      toast({ title: "Downloaded", description: `${data.name}'s ID card saved as ${kind.toUpperCase()}.` });
    } catch {
      toast({ title: "Error", description: `Could not generate the ${kind.toUpperCase()}.`, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-test="id-card-panel">
      {base.employeeIdIsProvisional && (
        <p
          className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
          data-test="provisional-id-warning"
        >
          <span className="font-semibold text-warning">No employee ID has been assigned yet.</span>{" "}
          The card shows <span className="font-mono">{data.employeeId}</span>, generated from this
          account so it is never blank.{" "}
          {provisionalHint || "Once your admin sets the real one it replaces this everywhere."}
        </p>
      )}

      {/* Both sides, at their true size. Scrolls sideways on a phone rather than shrinking. */}
      <div className="overflow-x-auto rounded-xl bg-slate-200 p-4">
        <div className="mx-auto flex w-max gap-6">
          {ready ? (
            <>
              <IdCardFront
                ref={frontRef}
                data={data}
                logoUrl={logo}
                qrUrl={qr}
                ceoSignatureUrl={ceoSignature}
                ceoName={marks.ceoName}
              />
              <IdCardBack ref={backRef} data={data} qrUrl={qr} />
            </>
          ) : (
            <div
              className="flex items-center justify-center rounded-2xl bg-white"
              style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
            >
              <Loader2 className="animate-spin text-primary" size={22} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run("png")}
          disabled={!ready || !!busy}
          data-test="download-id-png"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {busy === "png" ? <Loader2 size={15} className="animate-spin" /> : <FileImage size={15} />}
          {busy === "png" ? "Preparing…" : "Download PNG"}
        </button>
        <button
          onClick={() => run("pdf")}
          disabled={!ready || !!busy}
          data-test="download-id-pdf"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
        >
          {busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {busy === "pdf" ? "Preparing…" : "Download PDF"}
        </button>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Download size={11} /> PNG to send · PDF prints at real card size (54 × 86 mm)
        </span>
        <p className="w-full text-[11px] leading-relaxed text-muted-foreground">
          The QR opens this card's verification page, so anyone can check the badge is genuine
          without calling the office.
        </p>
      </div>
    </div>
  );
}
