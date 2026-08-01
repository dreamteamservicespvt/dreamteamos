import { useState } from "react";
import { format } from "date-fns";
import { BadgeCheck, Boxes, Check, Loader2, PackageCheck, Plus, Trash2, Undo2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { acknowledgeAsset, issueAsset, removeAsset, returnAsset } from "@/services/hr";
import type { Actor } from "@/services/hr";
import { todayIso } from "@/utils/hrPolicy";
import { ASSET_LABELS } from "@/types/hr";
import type { AssetKind, AssetRecord, EmployeeProfile } from "@/types/hr";
import { EmptyState, Input, SectionCard, Select } from "./ui";

/**
 * The asset issue record: what the company handed over, when, and whether it came back.
 *
 * The employee's acknowledgement is the part that matters — an asset register nobody confirmed
 * proves nothing on the day someone leaves — so it is theirs to give, from their own profile, and
 * an unacknowledged item is visibly flagged until they do.
 */
export default function AssetsPanel({ profile, actor, readOnly, canAcknowledge, memberLink }: {
  profile: EmployeeProfile;
  actor: Actor;
  /** True for a viewer who cannot issue or return assets (the employee themselves). */
  readOnly?: boolean;
  /** True when the viewer IS the employee — only they can confirm receipt. */
  canAcknowledge?: boolean;
  memberLink?: string;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: AssetKind; label: string; identifier: string; issuedOn: string; note: string }>({
    kind: "laptop", label: "", identifier: "", issuedOn: todayIso(), note: "",
  });

  const assets = profile.assets || [];
  const outstanding = assets.filter((a) => !a.returnedOn);
  const unacknowledged = outstanding.filter((a) => !a.acknowledgedAt).length;

  const handleAdd = async () => {
    if (!form.label.trim()) {
      toast({ title: "Name the asset", description: "e.g. Dell Inspiron 15, or Company SIM.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const asset: AssetRecord = {
        id: `${Date.now()}`,
        kind: form.kind,
        label: form.label.trim(),
        identifier: form.identifier.trim() || null,
        issuedOn: form.issuedOn,
        issuedByName: actor.name,
        note: form.note.trim() || null,
        acknowledgedAt: null,
        returnedOn: null,
      };
      await issueAsset(profile, asset, actor, { memberLink });
      toast({ title: "Recorded", description: `${asset.label} issued — the employee has been asked to confirm receipt.` });
      setForm({ kind: "laptop", label: "", identifier: "", issuedOn: todayIso(), note: "" });
      setAdding(false);
    } catch {
      toast({ title: "Error", description: "Could not record the asset.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAcknowledge = async (asset: AssetRecord) => {
    setBusyId(asset.id);
    try {
      await acknowledgeAsset(profile, asset.id, actor);
      toast({ title: "Confirmed", description: `You confirmed receipt of ${asset.label}.` });
    } catch {
      toast({ title: "Error", description: "Could not confirm it. Try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleReturn = async (asset: AssetRecord) => {
    const { confirmed, inputValue } = await confirm({
      title: `Mark ${asset.label} returned?`,
      description: "Recorded against today's date. Add a note on its condition if there is anything to say.",
      confirmText: "Mark returned",
      withInput: true,
      inputPlaceholder: "Condition / note (optional)",
    });
    if (!confirmed) return;
    setBusyId(asset.id);
    try {
      await returnAsset(profile, asset.id, {
        returnedOn: todayIso(),
        returnCondition: "good",
        returnNote: inputValue || null,
      }, actor);
      toast({ title: "Returned", description: `${asset.label} marked as returned.` });
    } catch {
      toast({ title: "Error", description: "Could not update the record.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (asset: AssetRecord) => {
    const { confirmed } = await confirm({
      title: "Delete this record?",
      description: `${asset.label} will be removed from the asset register entirely. Use "returned" instead if it simply came back.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    await removeAsset(profile, asset.id, actor);
  };

  const ackDate = (a: AssetRecord): string => {
    const seconds = (a.acknowledgedAt as { seconds?: number } | null)?.seconds;
    return seconds ? format(new Date(seconds * 1000), "dd MMM yyyy") : "";
  };

  return (
    <SectionCard
      title="Company assets"
      icon={<Boxes size={15} className="text-primary" />}
      action={readOnly ? (
        unacknowledged > 0 ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {unacknowledged} to confirm
          </span>
        ) : null
      ) : (
        <button onClick={() => setAdding((v) => !v)} data-test="issue-asset-btn"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
          {adding ? <X size={13} /> : <Plus size={13} />} {adding ? "Cancel" : "Issue asset"}
        </button>
      )}
    >
      {ConfirmDialog}

      {adding && !readOnly && (
        <div className="mb-4 rounded-lg border border-border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AssetKind })}>
              {(Object.keys(ASSET_LABELS) as AssetKind[]).map((k) => (
                <option key={k} value={k}>{ASSET_LABELS[k]}</option>
              ))}
            </Select>
            <Input label="What was given *" value={form.label} placeholder="Dell Inspiron 15"
              onChange={(e) => setForm({ ...form, label: e.target.value })} data-test="asset-label" />
            <Input label="Serial / number / account" value={form.identifier}
              placeholder="SN-8891234 · +91… · ravi@company.com"
              onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            <Input label="Issued on" type="date" value={form.issuedOn}
              onChange={(e) => setForm({ ...form, issuedOn: e.target.value })} />
            <Input label="Note" value={form.note} className="sm:col-span-2"
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button onClick={handleAdd} disabled={saving} data-test="asset-submit"
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Record asset
          </button>
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState icon={<Boxes size={26} />} title="No assets recorded"
          hint="ID card, laptop, phone/SIM, email account, keys — anything issued to this employee." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {assets.map((a) => {
            const returned = !!a.returnedOn;
            const acknowledged = !!a.acknowledgedAt;
            return (
              <div key={a.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${returned ? "opacity-60" : ""}`}>
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {ASSET_LABELS[a.kind]}
                </span>
                <div className="min-w-[140px] flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.identifier ? `${a.identifier} · ` : ""}issued {a.issuedOn} by {a.issuedByName}
                    {returned ? ` · returned ${a.returnedOn}` : ""}
                    {a.returnNote ? ` (${a.returnNote})` : ""}
                  </p>
                </div>
                {acknowledged ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck size={10} /> Confirmed{ackDate(a) ? ` ${ackDate(a)}` : ""}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Awaiting confirmation
                  </span>
                )}

                {canAcknowledge && !acknowledged && !returned && (
                  <button onClick={() => handleAcknowledge(a)} disabled={busyId === a.id} data-test="acknowledge-asset"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {busyId === a.id ? <Loader2 size={11} className="animate-spin" /> : <PackageCheck size={11} />} I received this
                  </button>
                )}

                {!readOnly && !returned && (
                  <button onClick={() => handleReturn(a)} disabled={busyId === a.id} title="Mark returned"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary">
                    <Undo2 size={14} />
                  </button>
                )}
                {!readOnly && (
                  <button onClick={() => handleRemove(a)} title="Delete record"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {outstanding.length > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {outstanding.length} item{outstanding.length === 1 ? "" : "s"} still with this employee — all of it
          has to come back before the exit can be closed.
        </p>
      )}
    </SectionCard>
  );
}
