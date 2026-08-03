/**
 * The company's own signature and seal, uploaded once and used on everything it issues.
 *
 * Separate from the "my signature" card beside it, and the distinction matters: that one signs
 * what YOU personally issue and follows you around. These two belong to the business — the ID card
 * in every employee's pocket is signed by the company, and the stamp on a letter is the company's
 * mark whoever happens to press it. Held once, centrally, so two admins cannot produce two
 * different-looking versions of the same document.
 *
 * Both are asked for as photographs of the real thing rather than anything drawn on screen: a
 * signature traced with a fingertip and a stamp drawn in software both look exactly like what they
 * are, on the one class of document where that is expensive.
 */
import { useEffect, useState } from "react";
import { Building2, Check, Loader2, Stamp, Upload, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { uploadToCloudinary } from "@/services/cloudinary";
import { saveCompanyAssets, watchCompanyAssets, type CompanyAssets } from "@/services/companyAssets";
import { COMPANY } from "@/utils/company";

const MAX_BYTES = 5 * 1024 * 1024;

export default function CompanyMarksCard() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [assets, setAssets] = useState<CompanyAssets>({});
  const [busy, setBusy] = useState<"ceo" | "stamp" | null>(null);
  const [ceoName, setCeoName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => watchCompanyAssets((a) => {
    setAssets(a);
    setCeoName((prev) => prev || a.ceoName || "");
  }), []);

  if (!user) return null;

  const upload = async (kind: "ceo" | "stamp", file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image", description: "Upload a photo or scan of it.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    setBusy(kind);
    try {
      const url = await uploadToCloudinary(file);
      await saveCompanyAssets(
        kind === "ceo" ? { ceoSignatureUrl: url } : { stampUrl: url },
        user.name,
      );
      toast({
        title: kind === "ceo" ? "CEO signature saved" : "Company stamp saved",
        description: kind === "ceo"
          ? "It now prints on every employee ID card."
          : "It will be applied to the documents you issue.",
      });
    } catch {
      toast({ title: "Upload failed", description: "Could not save it. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const clear = async (kind: "ceo" | "stamp") => {
    const { confirmed } = await confirm({
      title: kind === "ceo" ? "Remove the CEO signature?" : "Remove the company stamp?",
      description: kind === "ceo"
        ? "Every ID card printed after this shows an empty signature line."
        : "Documents issued after this carry no stamp. Letters already issued keep theirs.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    setBusy(kind);
    try {
      await saveCompanyAssets(kind === "ceo" ? { ceoSignatureUrl: null } : { stampUrl: null }, user.name);
    } finally {
      setBusy(null);
    }
  };

  const saveCeoName = async () => {
    setSavingName(true);
    try {
      await saveCompanyAssets({ ceoName: ceoName.trim() || null }, user.name);
      toast({ title: "Saved", description: "The name under the signature was updated." });
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5" data-test="company-marks-card">
      {ConfirmDialog}
      <div className="mb-3 flex items-start gap-2.5">
        <Building2 size={18} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <h3 className="font-display text-base font-bold text-foreground">Company signature &amp; stamp</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {COMPANY.name}'s own marks — not yours. The CEO's signature is printed on every employee
            ID card, and the stamp goes on the letters this company issues.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Mark
          label="CEO signature"
          hint="Sign on plain paper, photograph it, upload that."
          url={assets.ceoSignatureUrl}
          busy={busy === "ceo"}
          testId="ceo-signature"
          onPick={(f) => upload("ceo", f)}
          onClear={() => clear("ceo")}
        />
        <Mark
          label="Company stamp"
          hint="Press the stamp on white paper and photograph it."
          url={assets.stampUrl}
          busy={busy === "stamp"}
          testId="company-stamp"
          icon={<Stamp size={14} />}
          onPick={(f) => upload("stamp", f)}
          onClear={() => clear("stamp")}
        />
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
          Name printed under the CEO signature
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            value={ceoName}
            onChange={(e) => setCeoName(e.target.value)}
            placeholder="e.g. G. Govardhan · Chief Executive Officer"
            data-test="ceo-name"
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={saveCeoName}
            disabled={savingName}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            {savingName ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Mark({ label, hint, url, busy, testId, icon, onPick, onClear }: {
  label: string;
  hint: string;
  url?: string | null;
  busy: boolean;
  testId: string;
  icon?: React.ReactNode;
  onPick: (file?: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        {icon} {label}
      </p>
      <div className="mb-2 flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-white">
        {url ? (
          <img src={url} alt={label} data-test={`${testId}-preview`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="text-[11px] text-slate-400">Not uploaded</span>
        )}
      </div>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      <div className="flex gap-1.5">
        <label className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-accent">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          <input type="file" accept="image/*" className="hidden" data-test={`${testId}-input`}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onPick(f); }} />
        </label>
        {url && (
          <button onClick={onClear} disabled={busy} aria-label={`Remove ${label}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
