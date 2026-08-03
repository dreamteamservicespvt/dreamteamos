/**
 * Settings → Company Documents. Everything a letter needs to prove who issued it.
 *
 * These details used to be a constant in the source code, which meant that moving office, adding
 * an MSME registration or appointing a CTO all required a developer and a deploy. They are company
 * facts, they change, and the people they change for cannot edit TypeScript.
 *
 * The three marks are asked for as photographs of the real thing rather than anything drawn on
 * screen: a signature traced with a fingertip and a stamp drawn in software both look exactly like
 * what they are, on the one class of document where that is expensive. Signatures and the stamp go
 * through the same background-stripping pass employees' signatures already get, so what lands on a
 * letter is ink on the page rather than a grey photograph of a desk.
 *
 * Only the tech and sales admins reach this screen at all — it is mounted on their Settings pages
 * and nowhere else — because these fields sign every document the company issues.
 */
import { useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, PenLine, Stamp, Trash2, Upload } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { uploadToCloudinary } from "@/services/cloudinary";
import { saveCompanyAssets, watchCompanyAssets } from "@/services/companyAssets";
import { normalizeSignatureFile, optimizeLogoFile } from "@/utils/signatureImage";
import { COMPANY_DEFAULTS, OFFICER_FALLBACK_TITLE, resolveCompany, type CompanyAssets } from "@/utils/company";

const MAX_BYTES = 5 * 1024 * 1024;

/** Which uploaded mark is in flight. */
type MarkKind = "ceo" | "cto" | "stamp" | "logo";

const MARK_FIELD: Record<MarkKind, keyof CompanyAssets> = {
  ceo: "ceoSignatureUrl",
  cto: "ctoSignatureUrl",
  stamp: "stampUrl",
  logo: "logoUrl",
};

/** The text fields, in the order they appear on a letterhead — so proofreading follows the page. */
const TEXT_FIELDS: {
  key: keyof CompanyAssets;
  label: string;
  placeholder: string;
  hint?: string;
  multiline?: boolean;
}[] = [
  { key: "name", label: "Company name", placeholder: COMPANY_DEFAULTS.name },
  {
    key: "address",
    label: "Registered address",
    placeholder: "Building, street\nArea, city\nState PIN",
    hint: "One line per line of the address. Left blank, letters print no address at all rather than a made-up one.",
    multiline: true,
  },
  { key: "website", label: "Website", placeholder: COMPANY_DEFAULTS.website },
  { key: "email", label: "Support email", placeholder: COMPANY_DEFAULTS.email },
  { key: "phone", label: "Phone number", placeholder: "+91 90000 00000" },
  { key: "gstin", label: "GSTIN", placeholder: "37XXXXXXXXXXXZX" },
  { key: "msme", label: "MSME / Udyam number", placeholder: "UDYAM-AP-00-0000000" },
];

export default function CompanyDocumentsCard() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [assets, setAssets] = useState<CompanyAssets>({});
  const [busy, setBusy] = useState<MarkKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  /**
   * The stored document is only allowed to seed the form once.
   *
   * Without this, the live subscription overwrites whatever the admin is halfway through typing
   * every time anyone anywhere saves this document.
   */
  const seeded = useRef(false);

  useEffect(() => watchCompanyAssets((a) => {
    setAssets(a);
    if (seeded.current) return;
    seeded.current = true;
    setDraft({
      name: a.name || "",
      address: (a.address || []).join("\n"),
      website: a.website || "",
      email: a.email || "",
      phone: a.phone || "",
      gstin: a.gstin || "",
      msme: a.msme || "",
      ceoName: a.ceoName || "",
      ceoDesignation: a.ceoDesignation || "",
      ctoName: a.ctoName || "",
      ctoDesignation: a.ctoDesignation || "",
    });
  }), []);

  if (!user) return null;

  const preview = resolveCompany({
    ...assets,
    name: draft.name,
    address: (draft.address || "").split("\n").map((l) => l.trim()).filter(Boolean),
    website: draft.website,
    email: draft.email,
    phone: draft.phone,
    gstin: draft.gstin,
    msme: draft.msme,
  });

  const set = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const saveDetails = async () => {
    setSaving(true);
    try {
      const clean = (v?: string) => (v || "").trim() || null;
      await saveCompanyAssets({
        name: clean(draft.name),
        address: (draft.address || "").split("\n").map((l) => l.trim()).filter(Boolean),
        website: clean(draft.website),
        email: clean(draft.email),
        phone: clean(draft.phone),
        gstin: clean(draft.gstin),
        msme: clean(draft.msme),
        ceoName: clean(draft.ceoName),
        ceoDesignation: clean(draft.ceoDesignation),
        ctoName: clean(draft.ctoName),
        ctoDesignation: clean(draft.ctoDesignation),
      }, user.name);
      toast({
        title: "Company details saved",
        description: "Every letter, ID card and payslip issued from now on uses these.",
      });
    } catch {
      toast({ title: "Error", description: "Could not save the details.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: MarkKind, file?: File) => {
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
      // A logo is resized but never background-stripped: that pass assumes ink on paper and would
      // eat the light parts of a logo. Signatures and the stamp are exactly ink on paper.
      const prepared = kind === "logo"
        ? await optimizeLogoFile(file)
        : await normalizeSignatureFile(file);
      const url = await uploadToCloudinary(prepared);
      await saveCompanyAssets({ [MARK_FIELD[kind]]: url } as Partial<CompanyAssets>, user.name);
      toast({ title: "Saved", description: MARK_SAVED[kind] });
    } catch {
      toast({ title: "Upload failed", description: "Could not save it. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const clear = async (kind: MarkKind) => {
    const { confirmed } = await confirm({
      title: `Remove the ${MARK_LABEL[kind].toLowerCase()}?`,
      description: "Documents issued after this will not carry it. Letters already issued keep theirs.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    setBusy(kind);
    try {
      await saveCompanyAssets({ [MARK_FIELD[kind]]: null } as Partial<CompanyAssets>, user.name);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5" data-test="company-documents-card">
      {ConfirmDialog}
      <div className="mb-4 flex items-start gap-2.5">
        <Building2 size={18} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <h3 className="font-display text-base font-bold text-foreground">Company Documents</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What every letter, ID card and payslip this company issues says about itself. Changing
            it here changes all of them — no developer, no deploy.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={String(f.key)} className={f.multiline ? "sm:col-span-2" : undefined}>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{f.label}</label>
            {f.multiline ? (
              <textarea
                rows={3}
                value={draft[String(f.key)] ?? ""}
                onChange={(e) => set(String(f.key), e.target.value)}
                placeholder={f.placeholder}
                data-test={`company-${String(f.key)}`}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <input
                value={draft[String(f.key)] ?? ""}
                onChange={(e) => set(String(f.key), e.target.value)}
                placeholder={f.placeholder}
                data-test={`company-${String(f.key)}`}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />
            )}
            {f.hint && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
      </div>

      {/* What a reader sees at the top of the page, assembled from exactly what is typed above.
          Cheaper than issuing a test letter to find out the address wrapped badly. */}
      <div className="mt-3 rounded-lg border border-dashed border-border bg-accent/30 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          As it will print on a letterhead
        </p>
        <p className="mt-1 text-sm font-bold text-foreground">{preview.name}</p>
        {preview.address.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{preview.address.join(", ")}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {[preview.phone, preview.email, preview.website].filter(Boolean).join("  ·  ")}
        </p>
        <p className="text-[11px] font-medium text-foreground/80">
          {[
            preview.gstin ? `GSTIN: ${preview.gstin}` : "",
            preview.msme ? `MSME/Udyam: ${preview.msme}` : "",
          ].filter(Boolean).join("  ·  ")}
        </p>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <PenLine size={13} className="text-primary" /> Who signs the company's letters
        </p>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          The CEO signs almost everything the company issues. The CTO countersigns the NDA and IP
          agreement. These are the company's signatures — not yours — so the same letter looks the
          same whichever admin generated it. Where an office has no signature here, whoever issues
          the letter signs it instead.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Officer
            kind="ceo"
            name={draft.ceoName ?? ""}
            designation={draft.ceoDesignation ?? ""}
            url={assets.ceoSignatureUrl}
            busy={busy === "ceo"}
            onName={(v) => set("ceoName", v)}
            onDesignation={(v) => set("ceoDesignation", v)}
            onPick={(f) => upload("ceo", f)}
            onClear={() => clear("ceo")}
          />
          <Officer
            kind="cto"
            name={draft.ctoName ?? ""}
            designation={draft.ctoDesignation ?? ""}
            url={assets.ctoSignatureUrl}
            busy={busy === "cto"}
            onName={(v) => set("ctoName", v)}
            onDesignation={(v) => set("ctoDesignation", v)}
            onPick={(f) => upload("cto", f)}
            onClear={() => clear("cto")}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <Mark
          label="Company stamp"
          hint="Press the stamp on white paper and photograph it. The background is removed automatically."
          url={assets.stampUrl}
          busy={busy === "stamp"}
          testId="company-stamp"
          icon={<Stamp size={13} />}
          onPick={(f) => upload("stamp", f)}
          onClear={() => clear("stamp")}
        />
        <Mark
          label="Company logo"
          hint="Printed on the letterhead and ID cards. A transparent PNG looks best. Resized automatically."
          url={assets.logoUrl}
          busy={busy === "logo"}
          testId="company-logo"
          icon={<Building2 size={13} />}
          onPick={(f) => upload("logo", f)}
          onClear={() => clear("logo")}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={saveDetails}
          disabled={saving}
          data-test="save-company-details"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? "Saving…" : "Save company details"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Uploads save immediately; the text fields save with this button.
        </span>
      </div>
    </div>
  );
}

const MARK_LABEL: Record<MarkKind, string> = {
  ceo: "CEO signature",
  cto: "CTO signature",
  stamp: "Company stamp",
  logo: "Company logo",
};

const MARK_SAVED: Record<MarkKind, string> = {
  ceo: "The CEO's signature now signs the letters this company issues.",
  cto: "The CTO's signature now countersigns the NDA and IP agreement.",
  stamp: "The stamp will be applied to the documents you issue.",
  logo: "The logo now prints on letterheads and ID cards.",
};

function Officer({ kind, name, designation, url, busy, onName, onDesignation, onPick, onClear }: {
  kind: "ceo" | "cto";
  name: string;
  designation: string;
  url?: string | null;
  busy: boolean;
  onName: (v: string) => void;
  onDesignation: (v: string) => void;
  onPick: (file?: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3" data-test={`officer-${kind}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{kind}</p>
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="Full name, as it should be printed"
        data-test={`${kind}-name`}
        className="mb-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
      />
      <input
        value={designation}
        onChange={(e) => onDesignation(e.target.value)}
        placeholder={OFFICER_FALLBACK_TITLE[kind]}
        data-test={`${kind}-designation`}
        className="mb-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
      />
      <SignatureWell
        url={url}
        busy={busy}
        testId={`${kind}-signature`}
        hint="Sign on plain paper, photograph it, upload that."
        onPick={onPick}
        onClear={onClear}
      />
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
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">{icon} {label}</p>
      <SignatureWell url={url} busy={busy} testId={testId} hint={hint} onPick={onPick} onClear={onClear} />
    </div>
  );
}

/** The preview well plus its upload/replace/remove controls — identical for every mark. */
function SignatureWell({ url, busy, testId, hint, onPick, onClear }: {
  url?: string | null;
  busy: boolean;
  testId: string;
  hint: string;
  onPick: (file?: File) => void;
  onClear: () => void;
}) {
  return (
    <>
      {/* Checkerboard, so a transparent background is visibly transparent rather than "white". */}
      <div
        className="mb-2 flex h-20 items-center justify-center rounded-md border border-dashed border-border"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
          backgroundColor: "#ffffff",
        }}
      >
        {url ? (
          <img src={url} alt="" data-test={`${testId}-preview`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="text-[11px] text-slate-400">Not uploaded</span>
        )}
      </div>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      <div className="flex gap-1.5">
        <label className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-accent">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          <input
            type="file" accept="image/*" className="hidden" data-test={`${testId}-input`}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onPick(f); }}
          />
        </label>
        {url && (
          <button
            onClick={onClear} disabled={busy} aria-label="Remove"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </>
  );
}
