/**
 * One piece of content, opened.
 *
 * ── Why the approval lives in the same dialog as the work ─────────────────────────────────────
 * "Sent for approval", "they said yes", "they want a change" and "it is up" are four moments in
 * one short life, and splitting them across screens is how the middle two stop being recorded at
 * all. They are all here, in the order they happen, and the stages that would break the rule —
 * scheduled, posted — are visibly locked until the client has said yes.
 *
 * ── Why there is no Save button ───────────────────────────────────────────────────────────────
 * There was one, and it was the single most common way to lose work: a member typed a title, tapped
 * the backdrop, and the title was gone. Nothing in here is a draft — a date is a date the moment
 * somebody picks it — so every field saves itself a moment after it stops changing, and the header
 * says when it last did. Debounced rather than per-keystroke so a title costs one write, not forty.
 */
import { useEffect, useRef, useState } from "react";
import {
  X, Loader2, Send, Check, Trash2, Phone, Link2, CloudUpload, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addApprovalChase, assignItem, recordApproval, removeItem, requestApproval, setItemStatus,
  updateItem,
} from "@/services/smm";
import { approvalWaitDays, canPublish, postLinks } from "@/utils/smmPlan";
import { approvalRequestMessage, postingUpdateMessage } from "@/utils/smmMessages";
import { SMM_CONTENT_KINDS, SMM_PLATFORMS } from "@/types/smm";
import type { SmmCampaign, SmmContentItem, SmmItemStatus, SmmPlatform, SmmTemplateKind } from "@/types/smm";
import { StatusChip } from "@/components/smm/SmmChips";
import SmmStageBar from "@/components/smm/SmmStageBar";
import type { AppUser } from "@/types";

/** How long the fields sit still before they are written. Long enough to type a title in. */
const AUTOSAVE_MS = 900;

export default function SmmItemDialog({ campaign, item, user, members, onClose, onMessage }: {
  campaign: SmmCampaign;
  item: SmmContentItem;
  user: Pick<AppUser, "uid" | "name" | "role">;
  /** The team this post can be put on. Empty when the viewer cannot assign. */
  members: Pick<AppUser, "uid" | "name">[];
  onClose: () => void;
  /** Hand a ready-written message to the composer — the one place messages actually go out. */
  onMessage: (text: string, kind: SmmTemplateKind) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title || "");
  const [uploadDate, setUploadDate] = useState(item.uploadDate || "");
  const [uploadTime, setUploadTime] = useState(item.uploadTime || "");
  const [platforms, setPlatforms] = useState<SmmPlatform[]>(item.platforms || []);
  const [notes, setNotes] = useState(item.notes || "");
  const [postUrls, setPostUrls] = useState<Partial<Record<SmmPlatform, string>>>(
    // An older item carries one link and no account against it; show it on the first account so it
    // is not silently dropped the moment somebody edits the others.
    () => {
      const seeded: Partial<Record<SmmPlatform, string>> = { ...(item.postUrls || {}) };
      if (!item.postUrls && item.postUrl?.trim()) {
        const first = (item.platforms || [])[0];
        if (first) seeded[first] = item.postUrl.trim();
      }
      return seeded;
    },
  );
  const [approvalNote, setApprovalNote] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /**
   * Folded unless the approval IS the outstanding thing.
   *
   * A post sitting with the client, or one they have come back on, is a post somebody opened this
   * dialog to deal with — so it opens ready. Everything else opens closed.
   */
  const [approvalOpen, setApprovalOpen] = useState(
    () => item.approval?.state === "waiting" || item.approval?.state === "changes",
  );
  const [saving, setSaving] = useState(false);

  const kindLabel = SMM_CONTENT_KINDS.find((k) => k.key === item.kind)?.singular || item.kind;
  const waiting = item.approval?.state === "waiting" || item.approval?.state === "changes";
  const waitDays = approvalWaitDays(item.approval);
  const approved = canPublish(item);
  const liveLinks = postLinks({ ...item, platforms, postUrls });

  /**
   * Save the fields once they stop changing.
   *
   * `skipFirst` matters: the effect runs on mount with the values it was given, and writing them
   * straight back would stamp "saved just now" on a dialog nobody has touched — and cost a write
   * every time anybody so much as opens a post.
   */
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    const handle = setTimeout(async () => {
      setSaving(true);
      try {
        await updateItem(campaign.id, item.id, {
          title: title.trim(),
          uploadDate: uploadDate || null,
          uploadTime: uploadTime || null,
          platforms,
          notes: notes.trim() || null,
          // Blank boxes are dropped rather than stored as empty strings, so `postLinks` never has
          // to decide whether "" counts as a link.
          postUrls: Object.fromEntries(
            Object.entries(postUrls).map(([k, v]) => [k, (v || "").trim()]).filter(([, v]) => v),
          ),
        });
        setSavedAt(Date.now());
      } catch {
        toast({ title: "Not saved", description: "Check your connection — your typing is still here.", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [title, uploadDate, uploadTime, platforms, notes, postUrls]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="mt-1 flex items-center gap-2">
              <StatusChip status={item.status} />
              {/* The reassurance that replaces the Save button. */}
              <span data-test="smm-autosave" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                {saving
                  ? <><Loader2 size={9} className="animate-spin" /> Saving…</>
                  : savedAt
                    ? <><Check size={9} className="text-success" /> Saved</>
                    : <><CloudUpload size={9} /> Saves as you type</>}
              </span>
            </div>
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
                  className={`h-8 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                    platforms.includes(key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              rows={2}
              data-test="smm-item-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the person making this needs to know"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

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
        </div>

        {/* ── Client approval ────────────────────────────────────────────────────────────── */}
        {/*
          Folded away, because the approval is a STAGE of the job rather than a field of it. Left
          open it put four buttons — two of them green and red — between the post's own details and
          where it has got to, on every post, including ones nobody has made yet. The header still
          states where the approval stands, so folding it hides the controls and never the answer.
        */}
        <div className="mt-4 rounded-lg border border-border bg-background">
          <button
            type="button"
            data-test="smm-approval-toggle"
            aria-expanded={approvalOpen}
            onClick={() => setApprovalOpen((v) => !v)}
            className="flex w-full items-center gap-2 p-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">Client approval</span>
              <span className={`block truncate text-[11px] ${waiting ? "text-warning" : approved ? "text-success" : "text-muted-foreground"}`}>
                {waiting
                  ? `Waiting ${waitDays} day${waitDays === 1 ? "" : "s"}`
                  : approved
                    ? `Approved${item.approval?.byName ? ` · ${item.approval.byName}` : ""}`
                    : "Not sent yet — tap to record it"}
              </span>
            </span>
            <ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform ${approvalOpen ? "rotate-180" : ""}`} />
          </button>

          {approvalOpen && (
          <div data-test="smm-approval-body" className="border-t border-border/60 p-3">
          <p className="text-[11px] text-muted-foreground">Nothing goes up without it.</p>
          {item.approval?.note && (
            <p className="mt-1 rounded bg-muted/60 px-2 py-1 text-[11px] italic text-foreground">“{item.approval.note}”</p>
          )}

          {!approved && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  data-test="smm-send-approval"
                  disabled={!!busy}
                  onClick={() => run("ask", async () => {
                    await requestApproval(campaign.id, item.id);
                    onMessage(approvalRequestMessage(campaign, { ...item, title, uploadDate: uploadDate || null, uploadTime: uploadTime || null, platforms }), "approval_request");
                  })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-info px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-info/90 disabled:opacity-50"
                >
                  <Send size={12} /> Send for approval
                </button>
                {waiting && (
                  <button
                    data-test="smm-chase"
                    disabled={!!busy}
                    onClick={() => run("chase", () => addApprovalChase(campaign.id, item.id, user, "Followed up"), "Follow-up recorded")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Phone size={12} /> Followed up ({item.approval?.chases?.length || 0})
                  </button>
                )}
              </div>

              <input
                value={approvalNote}
                data-test="smm-approval-note"
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="What did they say?"
                className="mt-2 h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  data-test="smm-approved"
                  disabled={!!busy}
                  onClick={() => run("yes", () => recordApproval(campaign.id, item.id, { approved: true, note: approvalNote.trim() || null }, user), "Approval recorded")}
                  className="h-8 flex-1 rounded-md bg-success px-2 text-[11px] font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                >
                  They approved
                </button>
                <button
                  data-test="smm-changes"
                  disabled={!!busy}
                  onClick={() => run("no", () => recordApproval(campaign.id, item.id, { approved: false, note: approvalNote.trim() || null }, user), "Changes recorded")}
                  className="h-8 flex-1 rounded-md border border-warning/50 bg-warning/10 px-2 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
                >
                  They want changes
                </button>
              </div>
            </>
          )}
          </div>
          )}
        </div>

        {/* ── Stage ──────────────────────────────────────────────────────────────────────── */}
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-foreground">Stage</p>
          <SmmStageBar
            status={item.status}
            approved={approved}
            busy={busy}
            disabled={!!busy}
            onPick={(next: SmmItemStatus) => run(next, () => setItemStatus(campaign.id, item.id, next, user))}
          />
          {!approved && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Scheduled and Posted unlock once the client's approval is recorded above.
            </p>
          )}
        </div>

        {/* ── Where it went live ─────────────────────────────────────────────────────────── */}
        {item.status === "posted" && (
          <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Link2 size={12} /> Links to the live posts
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              One per account. These go into the update the group gets.
            </p>

            {/* A box per account this post was actually planned for — two accounts, two links. */}
            <div className="mt-2 space-y-2">
              {platforms.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Pick the accounts above first.</p>
              )}
              {SMM_PLATFORMS.filter((p) => platforms.includes(p.key)).map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
                  <input
                    value={postUrls[key] || ""}
                    data-test={`smm-post-url-${key}`}
                    onChange={(e) => setPostUrls((u) => ({ ...u, [key]: e.target.value }))}
                    placeholder={`Paste the ${label} post link`}
                    className="mt-0.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>

            <button
              data-test="smm-posting-update"
              disabled={liveLinks.length === 0}
              onClick={() => onMessage(
                postingUpdateMessage(campaign, { ...item, title, uploadDate: uploadDate || null, uploadTime: uploadTime || null, platforms, postUrls }),
                "posting_update",
              )}
              title={liveLinks.length === 0 ? "Paste at least one link first" : undefined}
              className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-success text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
            >
              <Send size={14} />
              {liveLinks.length === 0
                ? "Paste a link to send the update"
                : `Send posting update (${liveLinks.length} link${liveLinks.length === 1 ? "" : "s"})`}
            </button>
          </div>
        )}

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
