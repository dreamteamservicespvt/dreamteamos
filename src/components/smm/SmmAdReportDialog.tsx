/**
 * One day of a Meta campaign, written down.
 *
 * ── Why the screenshot and the boxes both exist ───────────────────────────────────────────────
 * The numbers come off a phone screenshot of Ads Manager, and copying three of them into three
 * boxes every day for a month is the kind of chore people quietly stop doing around the tenth. So
 * the screenshot can be read for them. But the boxes are always there and always editable, because
 * a reading can be wrong and a member looking at the dashboard is the better authority. The
 * screenshot is uploaded either way: it is the proof behind numbers that go into a client's report.
 */
import { useState } from "react";
import { X, Loader2, Upload, Wand2, Send } from "lucide-react";
import { uploadToCloudinary } from "@/services/cloudinary";
import { readMetaAdsReport } from "@/services/geminiService";
import { saveAdDayReport } from "@/services/smm";
import { useToast } from "@/hooks/use-toast";
import { dailyAdReportMessage } from "@/utils/smmMessages";
import { isoDay } from "@/utils/smmPlan";
import type { SmmAdDayReport, SmmAdRun, SmmCampaign } from "@/types/smm";

export default function SmmAdReportDialog({ campaign, run, existing, actorName, onClose, onMessage }: {
  campaign: SmmCampaign;
  run: SmmAdRun;
  /** The day being corrected, when one is already recorded. */
  existing?: SmmAdDayReport | null;
  actorName: string;
  onClose: () => void;
  onMessage: (text: string) => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(existing?.date || isoDay(new Date()));
  const [leads, setLeads] = useState<string>(existing ? String(existing.leads) : "");
  const [spend, setSpend] = useState<string>(existing ? String(existing.spend) : "");
  const [cpr, setCpr] = useState<string>(existing ? String(existing.costPerResult) : "");
  const [reach, setReach] = useState<string>(existing?.reach ? String(existing.reach) : "");
  const [shot, setShot] = useState(existing?.screenshotUrl || "");
  const [busy, setBusy] = useState<"upload" | "read" | "save" | null>(null);

  /**
   * Upload first, then read. In that order deliberately: the proof is saved even when the reading
   * fails, which is the case where the member most needs the picture to still be there.
   */
  const handleFile = async (file: File) => {
    setBusy("upload");
    try {
      const url = await uploadToCloudinary(file);
      setShot(url);
      setBusy("read");
      const reading = await readMetaAdsReport(file);
      if (reading.leads !== null) setLeads(String(reading.leads));
      if (reading.spend !== null) setSpend(String(reading.spend));
      if (reading.costPerResult !== null) setCpr(String(reading.costPerResult));
      if (reading.reach !== null) setReach(String(reading.reach));
      if (reading.date) setDate(reading.date);
      const gotSomething = reading.leads !== null || reading.spend !== null;
      toast({
        title: gotSomething ? "Read from the screenshot" : "Screenshot saved",
        description: gotSomething ? "Check the figures before saving." : "Type the figures in — the picture is kept as proof.",
      });
    } catch {
      toast({ title: "Couldn't read it", description: "The screenshot is saved. Type the figures in.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const save = async (andMessage: boolean) => {
    const report: Omit<SmmAdDayReport, "at"> = {
      date,
      leads: Math.max(0, Math.round(Number(leads) || 0)),
      spend: Math.max(0, Number(spend) || 0),
      costPerResult: Math.max(0, Number(cpr) || 0),
      reach: reach ? Math.max(0, Math.round(Number(reach))) : null,
      screenshotUrl: shot || null,
      byName: actorName,
    };
    setBusy("save");
    try {
      await saveAdDayReport(campaign.id, run.id, report);
      if (andMessage) onMessage(dailyAdReportMessage(campaign, run, { ...report, at: null } as SmmAdDayReport));
      toast({ title: "Saved" });
      onClose();
    } catch {
      toast({ title: "Not saved", description: "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, test: string, hint?: string) => (
    <div className="flex-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        data-test={test}
        placeholder={hint}
        onChange={(e) => set(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        data-test="smm-ad-report-dialog"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">Day's ad report</h3>
            <p className="text-xs text-muted-foreground">{run.name} · {campaign.businessName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent">
          {busy === "upload" ? <Loader2 size={14} className="animate-spin" />
            : busy === "read" ? <Wand2 size={14} className="animate-pulse" />
            : <Upload size={14} />}
          {busy === "upload" ? "Uploading…" : busy === "read" ? "Reading the screenshot…" : shot ? "Screenshot attached — tap to replace" : "Upload the Meta dashboard screenshot"}
          <input
            type="file"
            accept="image/*"
            data-test="smm-ad-screenshot"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>

        <div className="mt-3 space-y-2.5">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Date</label>
            <input
              type="date"
              value={date}
              data-test="smm-ad-date"
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            {field("Leads / results", leads, setLeads, "smm-ad-leads", "0")}
            {field("Spent (₹)", spend, setSpend, "smm-ad-spend", "0")}
          </div>
          <div className="flex gap-2">
            {field("Cost per result (₹)", cpr, setCpr, "smm-ad-cpr", "0")}
            {field("Reach (optional)", reach, setReach, "smm-ad-reach", "—")}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => save(false)}
            disabled={!!busy}
            data-test="smm-ad-save"
            className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={!!busy}
            data-test="smm-ad-save-send"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Save & message client
          </button>
        </div>
      </div>
    </div>
  );
}
