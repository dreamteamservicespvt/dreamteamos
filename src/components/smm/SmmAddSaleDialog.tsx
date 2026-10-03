/**
 * "Add SMM sale" — the tech side putting a salesperson's social-media sale into the system
 * (2026-10-03). Replaces "Start a month", which made months with no sale behind them.
 *
 * ── The number decides ────────────────────────────────────────────────────────────────────────
 * It starts from the client's WhatsApp number because that is what tells an old sale from a new
 * one. Every SMM sale ever recorded for the number is listed, by any salesperson:
 *
 *   • A sale already there is SET UP, never recorded again. Deleting its order or month on the tech
 *     side left the sale itself on the salesperson's lead, still counted in their revenue and
 *     commission — recording it a second time would pay them twice. Setting it up brings its own
 *     order back and gives it a month on the original dates (history, if those are over).
 *   • Only a number with no SMM sale at all gets "Record a new sale": the ordinary sale form, on the
 *     salesperson's own lead, in their name, waiting for the sales admin like any other sale.
 *   • A client who already has months is renewed by their salesperson, not from here.
 *   • A client the company was serving BEFORE sales were recorded in the app gets "Add a month that
 *     had no sale" (2026-10-03): the salesperson who looks after them, then the month set up by hand.
 *     It shows in the salesperson's login with its dates and counts in nobody's revenue or commission;
 *     their Renew makes the next month a sale (services/smmSetup.addNoSaleMonth).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BellRing, ExternalLink, History, Info, Loader2, Plus, Search, Settings2, UserCheck, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SaleForm from "@/components/sales/SaleForm";
import SmmSetupForm, {
  assignSummary, countsLine, setupInputOf, setupValueOf, type SmmSetupValue,
} from "@/components/smm/SmmSetupForm";
import { fetchAssignableMembers, remindSellerToRenew } from "@/services/smm";
import {
  addNoSaleMonth, canSetUpSale, fetchSalesPeople, findSmmSalesForPhone, leadForSeller, noSaleSetupProblem,
  notifySellerOfEnteredSale, setupProblem, setupSaleMonth, updateLeadDoc, type SmmSaleRecord, type SmmSaleState,
} from "@/services/smmSetup";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, normalizePhone } from "@/utils/phone";
import { isoDay } from "@/utils/smmPlan";
import {
  NO_SALE_NOTE, canAddNoSaleMonth, canRecordSmmSaleForSeller, dayLabel, normaliseClipsPerVideo,
} from "@/utils/smmPackage";
import { platformsForPackage, commitmentsForPackage } from "@/utils/smmPricing";
import { PACKAGES } from "@/utils/serviceCatalog";
import { SMM_PLATFORMS } from "@/types/smm";
import type { AppUser, Lead, SaleDetail } from "@/types";
import type { SmmContentKind, SmmPlatform } from "@/types/smm";

type Step = "number" | "seller" | "sale" | "setup" | "held" | "nosale";

/** The packages a no-sale month can be described by — the same catalogue the sale form sells from. */
const SMM_PACKAGE_NAMES: string[] = (PACKAGES.social_media_management || []).map((p) => p.label);

const STATE_LABEL: Record<SmmSaleState, { label: string; cls: string }> = {
  rejected: { label: "Rejected by the sales admin", cls: "bg-destructive/15 text-destructive" },
  held: { label: "Waiting for discount approval", cls: "bg-warning/15 text-warning" },
  needs_setup: { label: "Needs setup", cls: "bg-warning/15 text-warning" },
  live: { label: "Running", cls: "bg-success/15 text-success" },
  finished: { label: "Finished", cls: "bg-muted text-muted-foreground" },
  history: { label: "History", cls: "bg-info/15 text-info" },
  removed: { label: "Order removed", cls: "bg-destructive/10 text-destructive" },
  deleted: { label: "Month deleted", cls: "bg-destructive/10 text-destructive" },
  no_order: { label: "Order deleted for good", cls: "bg-destructive/10 text-destructive" },
};

const VERIFY_LABEL: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "bg-success/15 text-success" },
  pending: { label: "Pending approval", cls: "bg-warning/15 text-warning" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive" },
};

/** The sale chosen for setup, with what the form needs to know about it. */
interface Chosen {
  leadId: string;
  itemIndex: number;
  sellerName: string;
  businessName: string;
  platforms: SmmPlatform[];
  /** What the sale promised — the counts the setup starts from, and shows beside its own. */
  soldCommitments: Record<SmmContentKind, number>;
}

function chosenOf(r: Pick<SmmSaleRecord, "leadId" | "itemIndex" | "sellerName" | "businessName" | "item">): Chosen {
  const sold = r.item.smm;
  return {
    leadId: r.leadId,
    itemIndex: r.itemIndex,
    sellerName: r.sellerName,
    businessName: r.businessName,
    platforms: sold?.platforms?.length ? sold.platforms : platformsForPackage(r.item.packageKey),
    soldCommitments: sold?.commitments ?? commitmentsForPackage(r.item.packageKey),
  };
}

export default function SmmAddSaleDialog({ user, onClose, onCreated }: {
  user: Pick<AppUser, "uid" | "name" | "role" | "createdBy">;
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}) {
  const { toast } = useToast();
  const today = isoDay(new Date());
  const canRecord = canRecordSmmSaleForSeller(user);
  const canNoSale = canAddNoSaleMonth(user);
  const actor = { uid: user.uid, name: user.name, role: user.role, createdBy: user.createdBy };

  const [step, setStep] = useState<Step>("number");
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [records, setRecords] = useState<SmmSaleRecord[] | null>(null);

  const [sellers, setSellers] = useState<{ uid: string; name: string; createdBy?: string | null }[]>([]);
  const [sellerUid, setSellerUid] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [lead, setLead] = useState<Lead | null>(null);

  const [members, setMembers] = useState<{ uid: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [setup, setSetup] = useState<SmmSetupValue | null>(null);
  const [saving, setSaving] = useState(false);

  // A month that had no sale: the package it ran on ("" for a custom month) and the accounts it covered.
  const [noSalePackage, setNoSalePackage] = useState<string>(SMM_PACKAGE_NAMES[0] || "");
  const [noSalePlatforms, setNoSalePlatforms] = useState<SmmPlatform[]>(() => platformsForPackage(SMM_PACKAGE_NAMES[0]));

  useEffect(() => { fetchAssignableMembers().then(setMembers); }, []);
  useEffect(() => {
    if ((step === "seller" || step === "nosale") && sellers.length === 0) fetchSalesPeople().then(setSellers);
  }, [step, sellers.length]);

  const seller = sellers.find((s) => s.uid === sellerUid) || null;
  const normalized = normalizePhone(phone);

  const search = async () => {
    if (normalized.replace(/\D/g, "").length < 10) {
      toast({ title: "Enter the client's 10-digit WhatsApp number", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      setRecords(await findSmmSalesForPhone(normalized));
    } catch {
      toast({ title: "Could not look the number up", description: "Try again.", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  /** A client with any month at all is renewed by their salesperson — only a fresh number gets a new sale here. */
  const allowNewSale = !!records && records.every((r) => r.state === "rejected");
  const existingMonth = records?.find((r) => r.campaign && (r.state === "live" || r.state === "needs_setup")) || null;

  const startSetup = (r: SmmSaleRecord) => {
    setChosen(chosenOf(r));
    const keepCurrent = r.state === "needs_setup" && r.campaign;
    const chosenSale = chosenOf(r);
    const value = setupValueOf(
      keepCurrent ? r.campaign : null,
      keepCurrent ? undefined : r.soldDay,
      keepCurrent ? undefined : r.businessName,
      keepCurrent ? undefined : chosenSale.soldCommitments,
    );
    setSetup({ ...value, clipsPerVideo: normaliseClipsPerVideo(r.item.smm?.clipsPerVideo || value.clipsPerVideo) });
    setStep("setup");
  };

  const continueToSale = async () => {
    if (!seller) return;
    setLeadBusy(true);
    setLeadError("");
    try {
      const result = await leadForSeller({ seller, phone: normalized, displayName: businessName.trim() || normalized, actor });
      // Spelled out: this project's TypeScript runs non-strict, which does not narrow on `ok`.
      if ("message" in result) { setLeadError(result.message); return; }
      setLead(result.lead);
      setStep("sale");
    } finally {
      setLeadBusy(false);
    }
  };

  const onSaleDone = async (result?: { heldForApproval: boolean; leadId?: string; itemIndex?: number; item?: SaleDetail }) => {
    if (!result?.item || result.leadId === undefined || result.itemIndex === undefined || !seller) return;
    const business = result.item.requirement?.businessName?.trim() || businessName.trim();
    await notifySellerOfEnteredSale({ sellerUid: seller.uid, actorName: user.name, businessName: business, item: result.item, leadId: result.leadId });
    if (result.heldForApproval) { setStep("held"); return; }
    const chosenSale = chosenOf({ leadId: result.leadId, itemIndex: result.itemIndex, sellerName: seller.name, businessName: business, item: result.item });
    setChosen(chosenSale);
    setSetup({
      ...setupValueOf(null, today, business, chosenSale.soldCommitments),
      clipsPerVideo: normaliseClipsPerVideo(result.item.smm?.clipsPerVideo || 4),
    });
    setStep("setup");
  };

  /** A client served before sales were recorded here: the month on its own, set up by hand. */
  const startNoSale = () => {
    const pkg = SMM_PACKAGE_NAMES[0] || "";
    setNoSalePackage(pkg);
    setNoSalePlatforms(platformsForPackage(pkg));
    setSetup(setupValueOf(null, today, records?.find((r) => r.businessName)?.businessName || "", commitmentsForPackage(pkg)));
    setStep("nosale");
  };
  /** A package fills in its counts and accounts; "Custom" leaves whatever is typed. */
  const chooseNoSalePackage = (pkg: string) => {
    setNoSalePackage(pkg);
    if (!pkg) return;
    setNoSalePlatforms(platformsForPackage(pkg));
    setSetup((s) => (s ? { ...s, commitments: commitmentsForPackage(pkg) } : s));
  };
  const toggleNoSalePlatform = (p: SmmPlatform) =>
    setNoSalePlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  const problem = useMemo(() => {
    if (!setup) return "";
    if (step === "nosale") {
      return noSaleSetupProblem({ phone: normalized, seller, setup: setupInputOf(setup) }, today)
        || (noSalePlatforms.length === 0 ? "Tick the accounts the month ran on." : "");
    }
    return setupProblem(setupInputOf(setup), today);
  }, [setup, today, step, normalized, seller, noSalePlatforms]);

  const saveNoSale = async () => {
    if (!setup || !seller || problem) return;
    setSaving(true);
    try {
      const result = await addNoSaleMonth({
        phone: normalized,
        seller,
        packageKey: noSalePackage,
        platforms: noSalePlatforms,
        setup: setupInputOf(setup),
        actor,
      });
      toast({
        title: result.history ? "Earlier month recorded" : "Month added",
        description: result.history
          ? `On ${seller.name}'s Social Media page with its dates — not counted in revenue or commission.`
          : `${assignSummary(result.assign) || "The month is on the board."} Not counted in revenue or commission.`,
      });
      onCreated(result.campaignId);
    } catch (err) {
      toast({ title: "Not added", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  const saveSetup = async () => {
    if (!chosen || !setup || problem) return;
    setSaving(true);
    try {
      const result = await setupSaleMonth({ leadId: chosen.leadId, itemIndex: chosen.itemIndex, setup: setupInputOf(setup), actor });
      toast({
        title: result.history ? "Recorded as history" : "Month set up",
        description: result.history
          ? `${chosen.businessName || "The month"} is on the record with its original dates.`
          : assignSummary(result.assign) || "The month is on the board.",
      });
      onCreated(result.campaignId);
    } catch (err) {
      toast({ title: "Not set up", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  const title = step === "setup" ? "Set up the month"
    : step === "sale" ? "Record the sale"
      : step === "nosale" ? "Add a month that had no sale"
        : "Add SMM sale";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !saving && onClose()}>
      <div data-test="smm-add-sale" onClick={(e) => e.stopPropagation()}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-2xl sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {step === "number" && "Start with the client's number — it shows every social media sale already recorded for them."}
              {step === "seller" && "Who made this sale? It is recorded in their name and counts as their sale."}
              {step === "sale" && seller && `On ${seller.name}'s lead for ${formatPhoneDisplay(normalized)}.`}
              {step === "setup" && chosen && `${chosen.businessName || formatPhoneDisplay(normalized)} · sold by ${chosen.sellerName}`}
              {step === "held" && "Waiting on the sales admin."}
              {step === "nosale" && `${formatPhoneDisplay(normalized)} · a client from before sales were recorded in the app`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" data-test="smm-add-sale-close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* ── 1. The number ──────────────────────────────────────────────────────────────── */}
        {step === "number" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                data-test="smm-add-sale-phone"
                placeholder="Client's WhatsApp number"
                onChange={(e) => { setPhone(e.target.value); setRecords(null); }}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              />
              <button onClick={search} disabled={searching} data-test="smm-add-sale-find"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Find
              </button>
            </div>

            {records && records.length === 0 && (
              <p data-test="smm-add-sale-none" className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No social media sale has been recorded for {formatPhoneDisplay(normalized)}.
              </p>
            )}

            {records && records.length > 0 && (
              <div className="space-y-2" data-test="smm-add-sale-records">
                {records.map((r) => {
                  const st = STATE_LABEL[r.state];
                  const vf = VERIFY_LABEL[r.item.verificationStatus] || VERIFY_LABEL.pending;
                  const monthId = r.campaign?.id;
                  return (
                    <div key={`${r.leadId}_${r.itemIndex}`} data-test="smm-add-sale-record" data-state={r.state}
                      className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{r.businessName || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            Sold by <b className="text-foreground">{r.sellerName}</b> on {dayLabel(r.soldDay)} · {r.item.packageKey || "Custom"} · {formatCurrency(r.item.amount || 0)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${vf.cls}`}>{vf.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {canSetUpSale(r.state) && (
                          <button onClick={() => startSetup(r)} data-test="smm-add-sale-setup"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                            <Settings2 size={13} /> Set up this sale
                          </button>
                        )}
                        {monthId && (r.state === "live" || r.state === "finished" || r.state === "history" || r.state === "needs_setup") && (
                          <Link to={`/smm/${monthId}`} onClick={onClose}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
                            <ExternalLink size={13} /> Open month
                          </Link>
                        )}
                        {r.state === "held" && (
                          <span className="text-xs text-muted-foreground">Set it up once the sales admin has approved the discount.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {records && records.length > 0 && !allowNewSale && (
              <div data-test="smm-add-sale-renew-note" className="rounded-lg border border-info/40 bg-info/10 p-3 text-xs text-foreground">
                This client already has social media months. A new month for them is a renewal — the
                salesperson records it by pressing <b>Renew</b> on the month, so it counts as their sale.
                {existingMonth?.campaign && (
                  <button
                    onClick={async () => {
                      await remindSellerToRenew(existingMonth.campaign!, user).catch(() => undefined);
                      toast({ title: `${existingMonth.sellerName} has been reminded` });
                    }}
                    data-test="smm-add-sale-remind"
                    className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent">
                    <BellRing size={13} /> Remind {existingMonth.sellerName}
                  </button>
                )}
              </div>
            )}

            {records && allowNewSale && canRecord && (
              <button onClick={() => setStep("seller")} data-test="smm-add-sale-new"
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 text-sm font-medium text-primary hover:bg-primary/20">
                <Plus size={14} /> Record a new sale for a salesperson
              </button>
            )}

            {records && canNoSale && (
              <div data-test="smm-add-sale-no-sale-offer" className="rounded-lg border border-dashed border-border p-3">
                <button onClick={startNoSale} data-test="smm-add-sale-no-sale"
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent">
                  <History size={14} /> Add a month that had no sale
                </button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  For a client we were already serving before sales were recorded in the app. The salesperson
                  sees it in their login with its dates, but it is not a sale — it counts in nobody's revenue or
                  commission. Their next month is a renewal, which is a sale.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── A month that had no sale ───────────────────────────────────────────────────── */}
        {step === "nosale" && setup && (
          <div className="space-y-4">
            <p data-test="smm-no-sale-note" className="flex gap-2 rounded-lg border border-info/40 bg-info/10 p-2.5 text-xs text-foreground">
              <Info size={14} className="mt-0.5 shrink-0 text-info" />
              <span>
                {NO_SALE_NOTE} It shows on the salesperson's Social Media page with its dates. When it ends,
                they renew it — that month is a sale, and counts as theirs.
              </span>
            </p>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Salesperson who looks after this client
              <select value={sellerUid} data-test="smm-no-sale-seller" onChange={(e) => setSellerUid(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
                <option value="">Choose the salesperson…</option>
                {sellers.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-[11px] font-medium text-muted-foreground">
                Package it ran on
                <select value={noSalePackage} data-test="smm-no-sale-package" onChange={(e) => chooseNoSalePackage(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
                  {SMM_PACKAGE_NAMES.map((p) => (
                    <option key={p} value={p}>{p} · {countsLine(commitmentsForPackage(p))}</option>
                  ))}
                  <option value="">Custom — set the counts below</option>
                </select>
              </label>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">Accounts it covered</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SMM_PLATFORMS.map((p) => {
                    const on = noSalePlatforms.includes(p.key);
                    return (
                      <button key={p.key} type="button" aria-pressed={on} data-test={`smm-no-sale-platform-${p.key}`}
                        onClick={() => toggleNoSalePlatform(p.key)}
                        className={`h-8 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                          on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                        }`}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <SmmSetupForm value={setup} onChange={setSetup} members={members} platforms={noSalePlatforms} />
            <div className="flex gap-2">
              <button onClick={() => setStep("number")} disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
                <ArrowLeft size={14} /> Back
              </button>
              {/* The reason it cannot be added yet reads on the button, so it may run to two lines. */}
              <button onClick={saveNoSale} disabled={saving || !!problem} data-test="smm-no-sale-save"
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-sm font-medium leading-tight text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Adding…" : problem || "Add the month"}
              </button>
            </div>
          </div>
        )}

        {/* ── 2. Whose sale ──────────────────────────────────────────────────────────────── */}
        {step === "seller" && (
          <div className="space-y-3">
            <label className="block text-[11px] font-medium text-muted-foreground">
              Salesperson who made this sale
              <select value={sellerUid} data-test="smm-add-sale-seller" onChange={(e) => { setSellerUid(e.target.value); setLeadError(""); }}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
                <option value="">Choose the salesperson…</option>
                {sellers.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Business / page name
              <input value={businessName} data-test="smm-add-sale-business" placeholder="e.g. Sri Sai Silks"
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
            </label>
            {leadError && <p data-test="smm-add-sale-lead-error" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{leadError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep("number")} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent">
                <ArrowLeft size={14} /> Back
              </button>
              <button onClick={continueToSale} disabled={!seller || leadBusy} data-test="smm-add-sale-continue"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {leadBusy ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── 3. The sale, in the ordinary sale form ─────────────────────────────────────── */}
        {step === "sale" && lead && seller && (
          <div>
            <SaleForm
              lead={lead}
              updateLead={updateLeadDoc}
              onDone={onSaleDone}
              initialCategory="social_media_management"
              lockCategory
              onBehalfOf={seller}
              initialBusinessName={businessName.trim() || undefined}
            />
            <button onClick={() => setStep("seller")} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        )}

        {step === "held" && (
          <div className="space-y-3">
            <p data-test="smm-add-sale-held" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              The sale is recorded for {seller?.name || "the salesperson"}, but its discount is more than a salesperson
              may give, so it waits for the sales admin. Once they approve it, the month appears under
              <b> Needs setup</b> on the board.
            </p>
            <button onClick={onClose} className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground">Done</button>
          </div>
        )}

        {/* ── 4. The month ───────────────────────────────────────────────────────────────── */}
        {step === "setup" && chosen && setup && (
          <div>
            <SmmSetupForm value={setup} onChange={setSetup} members={members}
              platforms={chosen.platforms} soldCommitments={chosen.soldCommitments} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep("number")} disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
                <ArrowLeft size={14} /> Back
              </button>
              <button onClick={saveSetup} disabled={saving || !!problem} data-test="smm-add-sale-save"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Setting up…" : problem || "Save the month"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
