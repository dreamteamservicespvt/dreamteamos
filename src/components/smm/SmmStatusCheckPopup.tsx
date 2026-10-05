/**
 * "Update your posts" — the social-media team's check at 11 AM and 5 PM (2026-10-05, owner).
 *
 * The owner asked for a popup to everybody who does social-media work, twice a day, to update the status
 * of everything they are working on. It opens the first time the app is open after 11:00 and after 17:00
 * (`utils/smmStatusCheck`), for anyone holding a seat on a month running today, and lists each such month
 * with every post not yet live — theirs first, late ones next — each with its status to change right
 * there (the same `setItemStatus` as the month's page: nothing is scheduled or posted without the
 * client's approval). "All updated" answers the slot on this device; "Later" brings it back in 30
 * minutes. It waits while another popup (the daily check-in, an update) is on screen, so two never stack.
 *
 * Reads: one scoped read of the person's own months when a slot comes due (`fetchMyCampaigns`), and a
 * live listener on the same query only while the popup is open. Nothing for anybody with no seat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MONEY_TEXT } from "@/components/smm/money/tone";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { fetchMyCampaigns, setItemStatus, watchMyCampaigns } from "@/services/smm";
import { canPublish, isOverdue, isoDay } from "@/utils/smmPlan";
import {
  answerSlot, parseStatusCheckMemory, slotToShow, snoozeSlot, statusCheckMonths, statusCheckStorageKey, isMine,
  type StatusCheckMemory, type StatusCheckSlot,
} from "@/utils/smmStatusCheck";
import { POSTABLE_STATUSES, SMM_CONTENT_KINDS, SMM_ITEM_STATUSES, type SmmCampaign, type SmmContentItem, type SmmItemStatus } from "@/types/smm";

const TICK_MS = 60_000;

function readMemory(uid: string, day: string): StatusCheckMemory {
  try {
    return parseStatusCheckMemory(localStorage.getItem(statusCheckStorageKey(uid)), day);
  } catch {
    return parseStatusCheckMemory(null, day);
  }
}

function writeMemory(uid: string, memory: StatusCheckMemory): void {
  try { localStorage.setItem(statusCheckStorageKey(uid), JSON.stringify(memory)); } catch { /* private window: it asks again */ }
}

/**
 * Another popup on screen right now — never stack two. The app's own prompts (daily check-in, profile,
 * agreement, update, birthday, the renewal countdown) are plain full-screen `fixed inset-0` overlays, not
 * Radix dialogs, so both are looked for; nothing in the app keeps such an overlay mounted while hidden,
 * and one that is `display: none` has no box. The AI studio counts too: the check waits until it closes.
 */
function anotherPopupOpen(): boolean {
  const open = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .fixed.inset-0');
  return Array.from(open).some((el) => el.getClientRects().length > 0);
}

export default function SmmStatusCheckPopup() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid || "";
  const [slot, setSlot] = useState<StatusCheckSlot | null>(null);
  const [months, setMonths] = useState<SmmCampaign[]>([]);
  const checking = useRef(false);

  /* ── When to open ─────────────────────────────────────────────────────────────────────────── */
  const check = useCallback(async () => {
    if (!uid || slot || checking.current || document.visibilityState === "hidden") return;
    const now = new Date();
    const day = isoDay(now);
    const memory = readMemory(uid, day);
    const due = slotToShow(now, memory);
    if (!due) return;
    checking.current = true;
    try {
      const mine = await fetchMyCampaigns(uid);
      if (statusCheckMonths(mine, uid, day).length === 0) {
        // Nothing of theirs is open: nothing to ask, so this slot is answered.
        writeMemory(uid, answerSlot(memory, due));
        return;
      }
      if (anotherPopupOpen()) return; // the next tick tries again
      setMonths(mine);
      setSlot(due);
    } catch {
      /* offline or refused — the next tick tries again */
    } finally {
      checking.current = false;
    }
  }, [uid, slot]);

  useEffect(() => {
    if (!uid) return;
    const first = window.setTimeout(check, 8000); // after the page and any morning prompt (check-in) settle
    const timer = window.setInterval(check, TICK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [uid, check]);

  // Live while open, so a change made here (or by a teammate) shows at once.
  useEffect(() => {
    if (!slot || !uid) return;
    return watchMyCampaigns(uid, setMonths);
  }, [slot, uid]);

  const close = (answered: boolean) => {
    if (!slot || !uid) return;
    const now = new Date();
    const memory = readMemory(uid, isoDay(now));
    writeMemory(uid, answered ? answerSlot(memory, slot) : snoozeSlot(memory, now));
    setSlot(null);
  };

  if (!slot || !user) return null;
  return <StatusCheckDialog slot={slot} months={months} user={user} onDone={() => close(true)} onLater={() => close(false)} />;
}

/* ── The popup ────────────────────────────────────────────────────────────────────────────── */

function StatusCheckDialog({ slot, months, user, onDone, onLater }: {
  slot: StatusCheckSlot;
  months: SmmCampaign[];
  user: { uid: string; name: string; role?: string };
  onDone: () => void;
  onLater: () => void;
}) {
  const today = isoDay(new Date());
  const list = useMemo(() => statusCheckMonths(months, user.uid, today), [months, user.uid, today]);
  const openCount = list.reduce((s, m) => s + m.open.length, 0);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState("");
  const { toast } = useToast();

  const change = async (campaign: SmmCampaign, item: SmmContentItem, status: SmmItemStatus) => {
    const key = `${campaign.id}:${item.id}`;
    setSaving(key);
    try {
      await setItemStatus(campaign.id, item.id, status, { uid: user.uid, name: user.name, role: user.role });
      setChanged((prev) => new Set(prev).add(key));
    } catch (err) {
      toast({ title: "Not changed", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving("");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onLater(); }}>
      <DialogContent data-test="smm-status-check" className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck size={18} className="text-primary" /> {slot.label} check — update your posts
          </DialogTitle>
          <DialogDescription className="text-xs">
            {openCount} post{openCount === 1 ? "" : "s"} not live yet on {list.length} client{list.length === 1 ? "" : "s"}.
            Set each one to where it really is now, then press <b>All updated</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {list.length === 0 && (
            <p data-test="smm-status-check-empty" className="flex items-center gap-2 rounded-xl bg-viz-done/10 p-4 text-sm font-medium text-foreground">
              <CheckCircle2 size={18} className="text-viz-done" /> Everything of yours is posted. Nothing to update.
            </p>
          )}
          {list.map(({ campaign, open, posted, promised }) => (
            <section key={campaign.id} data-test="smm-status-check-month" className="rounded-xl border border-border">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{campaign.businessName || campaign.clientName}</p>
                <span className="text-xs text-muted-foreground"><b className="text-foreground">{posted}/{promised}</b> posted</span>
                <Link to={`/smm/${campaign.id}`} onClick={onLater}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10">
                  <ExternalLink size={12} /> Open month
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {open.map((item) => {
                  const key = `${campaign.id}:${item.id}`;
                  const late = isOverdue(item, today);
                  const kind = SMM_CONTENT_KINDS.find((k) => k.key === item.kind)?.singular || "Post";
                  const publishable = canPublish(item, campaign);
                  return (
                    <li key={item.id} data-test="smm-status-check-item" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                      {/* The name keeps room for itself; the status box wraps under it on a phone. */}
                      <div className="min-w-[11rem] flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                          <span className="truncate">{item.title?.trim() || kind}</span>
                          {item.extra && <span className="shrink-0 text-[10px] font-medium uppercase text-muted-foreground">extra</span>}
                          {isMine(item, user.uid) && <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">You</span>}
                        </p>
                        <p className={`flex flex-wrap items-center gap-x-1.5 text-[11px] ${late ? "font-medium text-viz-late" : "text-muted-foreground"}`}>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            {late && <AlertTriangle size={11} />}
                            {item.uploadDate
                              ? `${late ? "Late — was due" : "Goes up"} ${format(parseISO(item.uploadDate), "d MMM")}`
                              : "No upload date yet"}
                          </span>
                          {changed.has(key) && <span className={`inline-flex items-center gap-0.5 whitespace-nowrap font-medium ${MONEY_TEXT}`}><CheckCircle2 size={11} /> Updated</span>}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        {saving === key && <Loader2 size={14} className="animate-spin text-primary" />}
                        <select
                          aria-label={`Status of ${item.title || kind}`}
                          data-test="smm-status-check-select"
                          value={item.status}
                          disabled={saving === key}
                          onChange={(e) => change(campaign, item, e.target.value as SmmItemStatus)}
                          className="h-9 max-w-[11.5rem] rounded-lg border border-border bg-card px-2 text-xs font-medium text-foreground outline-none focus:border-primary">
                          {SMM_ITEM_STATUSES.map((s) => {
                            const blocked = POSTABLE_STATUSES.includes(s.key) && !publishable;
                            return (
                              <option key={s.key} value={s.key} disabled={blocked}>
                                {s.label}{blocked ? " (client must approve first)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onLater} data-test="smm-status-check-later"
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            Later (30 min)
          </button>
          <button type="button" onClick={onDone} data-test="smm-status-check-done"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <CheckCircle2 size={16} /> All updated
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
