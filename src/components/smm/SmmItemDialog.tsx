/**
 * One piece of content, opened.
 *
 * ── Why the approval lives in the same dialog as the work ─────────────────────────────────────
 * "Sent for approval", "they said yes", "they want a change" and "it is up" are four moments in
 * one short life, and splitting them across screens is how the middle two stop being recorded at
 * all. They are all here, in the order they happen, and the buttons that would break the rule —
 * schedule, post — simply are not offered until the client has said yes.
 *
 * Deliberately one column of plain fields. The people using this are on a phone between other
 * jobs; a clever layout is a slow layout.
 */
import { useState } from "react";
import { X, Loader2, Send, Check, Trash2, Phone, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addApprovalChase, assignItem, recordApproval, removeItem, requestApproval, setItemStatus,
  updateItem,
} from "@/services/smm";
import { approvalWaitDays, canPublish } from "@/utils/smmPlan";
import { approvalRequestMessage } from "@/utils/smmMessages";
import { SMM_CONTENT_KINDS, SMM_ITEM_STATUSES, SMM_PLATFORMS } from "@/types/smm";
import type { SmmCampaign, SmmContentItem, SmmItemStatus, SmmPlatform } from "@/types/smm";
import { StatusChip } from "@/components/smm/SmmChips";
import type { AppUser } from "@/types";

/** The statuses a member may pick directly. Approval moves the rest — see the header. */
const MANUAL_STATUSES: SmmItemStatus[] = ["planned", "in_progress", "scheduled", "posted"];

export default function SmmItemDialog({ campaign, item, user, members, onClose, onMessage }: {
  campaign: SmmCampaign;
  item: SmmContentItem;
  user: Pick<AppUser, "uid" | "name" | "role">;
  /** The team this post can be put on. Empty when the viewer cannot assign. */
  members: Pick<AppUser, "uid" | "name">[];
  onClose: () => void;
  /** Hand a ready-written message to the composer — the one place messages actually go out. */
  onMessage: (text: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title || "");
  const [uploadDate, setUploadDate] = useState(item.uploadDate || "");
  const [uploadTime, setUploadTime] = useState(item.uploadTime || "");
  const [platforms, setPlatforms] = useState<SmmPlatform[]>(item.platforms || []);
  const [scheduled, setScheduled] = useState(!!item.scheduled);
  const [story, setStory] = useState(!!item.story);
  const [notes, setNotes] = useState(item.notes || "");
  const [postUrl, setPostUrl] = useState(item.postUrl || "");
  const [approvalNote, setApprovalNote] = useState("");

  const kindLabel = SMM_CONTENT_KINDS.find((k) => k.key === item.kind)?.singular || item.kind;
  const waiting = item.approval?.state === "waiting" || item.approval?.state === "changes";
  const waitDays = approvalWaitDays(item.approval);

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ title: ok });
    } catch (err) {
      toast({
        title: "Not saved",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveDetails = () => run("save", async () => {
    await updateItem(campaign.id, item.id, {
      title: title.trim(),
      uploadDate: uploadDate || null,
      uploadTime: uploadTime || null,
      platforms,
      scheduled,
      story,
      notes: notes.trim() || null,
      postUrl: postUrl.trim() || null,
    });
  }, "Saved");

  const togglePlatform = (p: SmmPlatform) =>
    setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        data-test="smm-item-dialog"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{kindLabel}{item.extra ? " · extra" : ""}</p>
            <h3 className="truncate text-base font-semibold text-foreground">{item.title || "Untitled"}</h3>
            <div className="mt-1"><StatusChip status={item.status} /></div>
          </div>
          <button onClick={onClose} data-test="smm-item-close" aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* ── What it is ─────────────────────────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Title</label>
            <input
              value={title}
              data-test="smm-item-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this post about?"
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-medium text-muted-foreground">Upload date</label>
              <input
                type="date"
                value={uploadDate}
                data-test="smm-item-date"
                onChange={(e) => setUploadDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="w-28">
              <label className="text-[11px] font-medium text-muted-foreground">Time</label>
              <input
                type="time"
                value={uploadTime}
                data-test="smm-item-time"
                onChange={(e) => setUploadTime(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Accounts</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SMM_PLATFORMS.filter((p) => campaign.platforms.includes(p.key)).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  data-test={`smm-item-platform-${key}`}
                  aria-pressed={platforms.includes(key)}
                  onClick={() => togglePlatform(key)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    platforms.includes(key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* The label is the tap target, not the 13px box inside it — `py-1.5` is what makes
              these reachable with a thumb. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-foreground">
              <input type="checkbox" checked={scheduled} data-test="smm-item-scheduled" onChange={(e) => setScheduled(e.target.checked)} className="h-4 w-4 accent-primary" />
              Pre-scheduled in the app
            </label>
            <label className="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-foreground">
              <input type="checkbox" checked={story} data-test="smm-item-story" onChange={(e) => setStory(e.target.checked)} className="h-4 w-4 accent-primary" />
              Also a story
            </label>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the person making this needs to know"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {item.status === "posted" && (
            <div>
              <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Link2 size={11} /> Link to the live post
              </label>
              <input
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          )}

          {members.length > 0 && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground">Makes it</label>
                <select
                  value={item.makerUid || ""}
                  data-test="smm-item-maker"
                  onChange={(e) => {
                    const m = members.find((x) => x.uid === e.target.value);
                    run("maker", () => assignItem(campaign.id, item.id, "maker", m ? { uid: m.uid, name: m.name } : null));
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Nobody yet</option>
                  {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground">Posts it</label>
                <select
                  value={item.publisherUid || ""}
                  data-test="smm-item-publisher"
                  onChange={(e) => {
                    const m = members.find((x) => x.uid === e.target.value);
                    run("publisher", () => assignItem(campaign.id, item.id, "publisher", m ? { uid: m.uid, name: m.name } : null));
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Nobody yet</option>
                  {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <button
            onClick={saveDetails}
            disabled={busy === "save"}
            data-test="smm-item-save"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save details
          </button>
        </div>

        {/* ── Approval ───────────────────────────────────────────────────────────────────── */}
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-semibold text-foreground">Client approval</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Nothing goes up without it. {waiting ? `Waiting ${waitDays} day${waitDays === 1 ? "" : "s"}.` : item.approval?.state === "approved" ? `Approved${item.approval.byName ? ` — recorded by ${item.approval.byName}` : ""}.` : "Not sent yet."}
          </p>
          {item.approval?.note && (
            <p className="mt-1 rounded bg-muted/60 px-2 py-1 text-[11px] italic text-foreground">“{item.approval.note}”</p>
          )}

          {item.approval?.state !== "approved" && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  data-test="smm-send-approval"
                  disabled={!!busy}
                  onClick={() => run("ask", async () => {
                    await requestApproval(campaign.id, item.id);
                    onMessage(approvalRequestMessage(campaign, { ...item, title, uploadDate: uploadDate || null, uploadTime: uploadTime || null, platforms }));
                  })}
                  className="inline-flex items-center gap-1.5 rounded-md bg-info px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-info/90 disabled:opacity-50"
                >
                  <Send size={12} /> Send for approval
                </button>
                {waiting && (
                  <button
                    data-test="smm-chase"
                    disabled={!!busy}
                    onClick={() => run("chase", () => addApprovalChase(campaign.id, item.id, user, "Followed up"), "Follow-up recorded")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Phone size={12} /> Followed up ({item.approval?.chases?.length || 0})
                  </button>
                )}
              </div>

              <input
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="What did they say?"
                className="mt-2 h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  data-test="smm-approved"
                  disabled={!!busy}
                  onClick={() => run("yes", () => recordApproval(campaign.id, item.id, { approved: true, note: approvalNote.trim() || null }, user), "Approval recorded")}
                  className="flex-1 rounded-md bg-success px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                >
                  They approved
                </button>
                <button
                  data-test="smm-changes"
                  disabled={!!busy}
                  onClick={() => run("no", () => recordApproval(campaign.id, item.id, { approved: false, note: approvalNote.trim() || null }, user), "Changes recorded")}
                  className="flex-1 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
                >
                  They want changes
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Where it has got to ────────────────────────────────────────────────────────── */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-foreground">Stage</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MANUAL_STATUSES.map((s) => {
              const locked = (s === "scheduled" || s === "posted") && !canPublish(item);
              const meta = SMM_ITEM_STATUSES.find((x) => x.key === s);
              return (
                <button
                  key={s}
                  data-test={`smm-set-status-${s}`}
                  disabled={!!busy || locked}
                  title={locked ? "Record the client's approval first" : undefined}
                  onClick={() => run(s, () => setItemStatus(campaign.id, item.id, s, user))}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    item.status === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {meta?.label}
                </button>
              );
            })}
          </div>
          {!canPublish(item) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Scheduling and posting unlock once the client's approval is recorded above.
            </p>
          )}
        </div>

        <button
          data-test="smm-item-delete"
          disabled={!!busy}
          onClick={() => run("del", async () => { await removeItem(campaign.id, item.id); onClose(); })}
          className="mt-4 -mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 size={12} /> Remove from the plan
        </button>
      </div>
    </div>
  );
}
