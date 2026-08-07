/**
 * The videos of one bulk order, as a board you can point at.
 *
 * ── Why tiles and not a list ──────────────────────────────────────────────────────────────────
 * Ten videos in a table is ten rows of text you have to read to find out that three are unassigned.
 * As a grid of numbered tiles it is a glance: grey means nobody has it, blue means somebody is
 * making it, green with a tick means it is done. Somebody who cannot read the labels can still
 * see three grey squares and know three videos need giving out — which is the actual requirement.
 *
 * ── Why assigning is select-then-choose ───────────────────────────────────────────────────────
 * A dropdown on every tile means ten dropdowns and ten chances to pick the wrong name. Tapping
 * tiles to select them and then choosing one member is the same gesture as picking photos on a
 * phone: it reads as "these ones, to her", which is exactly what is being decided. "Select all
 * free" is there because giving the whole remainder to one person is the commonest thing anyone
 * does here.
 *
 * ── Who can do what ───────────────────────────────────────────────────────────────────────────
 * Admins and the team leader hand videos out; a member cannot, including to themselves — bulk work
 * is shared out deliberately, and self-service is how the easy videos go first. Anyone may tick
 * off a video that is theirs, and the leader may tick off anyone's, so a member on leave with two
 * finished-but-unticked videos cannot hold up the order.
 */
import { useMemo, useState } from "react";
import { Check, Loader2, UserPlus, X, Users, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  bulkVideoStats, bulkVideosOf, canAssignBulkVideos, canCompleteBulkVideo, memberProgress,
} from "@/utils/bulkVideos";
import { assignBulkVideos, setBulkVideoComplete, unassignBulkVideo } from "@/services/bulkVideos";
import type { AppUser, BulkVideoSlot, Order } from "@/types";

export default function BulkVideoBoard({ order, user, members, defaultOpen = true }: {
  order: Order;
  user: Pick<AppUser, "uid" | "name" | "role"> | null;
  /** The team this order can be shared across. Empty for a member's own view. */
  members?: Pick<AppUser, "uid" | "name">[];
  defaultOpen?: boolean;
}) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | "assign" | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  const slots = useMemo(() => bulkVideosOf(order), [order]);
  const stats = useMemo(() => bulkVideoStats(slots), [slots]);
  const team = useMemo(() => memberProgress(slots), [slots]);

  const mayAssign = canAssignBulkVideos(user?.role) && (members?.length || 0) > 0;
  /** A member sees only their own videos — the rest of the order is not their business. */
  const mine = !canAssignBulkVideos(user?.role);
  const visible = mine ? slots.filter((s) => s.assignedTo === user?.uid) : slots;

  if (visible.length === 0) return null;

  const toggle = (n: number) => {
    if (!mayAssign) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const selectFree = () => setPicked(new Set(
    slots.filter((s) => s.status !== "completed" && !s.assignedTo).map((s) => s.n),
  ));

  const giveTo = async (uid: string) => {
    if (!user || picked.size === 0) return;
    const member = members?.find((m) => m.uid === uid);
    if (!member) return;
    setBusy("assign");
    try {
      const count = await assignBulkVideos({
        order, numbers: [...picked], member: { uid: member.uid, name: member.name }, actor: user,
      });
      setPicked(new Set());
      toast({
        title: count > 0 ? "Assigned" : "Nothing to assign",
        description: count > 0
          ? `${member.name} now has ${count} video${count === 1 ? "" : "s"} on this order.`
          : "Those videos were already finished or already theirs.",
      });
    } catch {
      toast({ title: "Not saved", description: "Couldn't assign those videos. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const complete = async (slot: BulkVideoSlot, next: boolean) => {
    if (!user) return;
    setBusy(slot.n);
    try {
      await setBulkVideoComplete({ order, n: slot.n, complete: next, actor: user });
    } catch {
      toast({ title: "Not saved", description: "Couldn't update that video. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const takeBack = async (slot: BulkVideoSlot) => {
    if (!user) return;
    setBusy(slot.n);
    try {
      await unassignBulkVideo({ order, n: slot.n, actor: user });
    } catch {
      toast({ title: "Not saved", description: "Couldn't free that video. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-test="bulk-video-board"
      className={`rounded-xl border p-3 ${
        stats.percent >= 100 ? "border-green-500/40 bg-green-500/5" : "border-indigo-500/30 bg-indigo-500/5"
      }`}
    >
      {/* Headline: the four numbers, in words rather than jargon. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold text-foreground">
            {mine ? "Your videos on this order" : "Videos in this order"}
            <span className="ml-1.5 font-mono text-xs font-medium text-muted-foreground">
              {stats.completed}/{stats.total}
            </span>
          </span>
          <span className="block text-[11px] text-muted-foreground" data-test="bulk-board-summary">
            {stats.percent >= 100
              ? "All videos delivered"
              : `${stats.completed} done · ${stats.assigned} being made · ${stats.unassigned} not given out`}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
          stats.percent >= 100 ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
        }`}>
          {stats.percent}%
        </span>
      </button>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${stats.percent >= 100 ? "bg-green-500" : "bg-indigo-500"}`}
          style={{ width: `${stats.percent}%` }}
        />
      </div>

      {open && (
        <>
          {/* The tiles. One per video, big enough to hit with a thumb. */}
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5" data-test="bulk-video-grid">
            {visible.map((slot) => {
              const done = slot.status === "completed";
              const owned = !!slot.assignedTo;
              const selected = picked.has(slot.n);
              const canTick = canCompleteBulkVideo(slot, user);
              const working = busy === slot.n;

              return (
                <div
                  key={slot.n}
                  data-test={`bulk-video-${slot.n}`}
                  data-status={done ? "completed" : owned ? "assigned" : "unassigned"}
                  onClick={() => !done && toggle(slot.n)}
                  className={`relative rounded-lg border p-2 transition-colors ${
                    mayAssign && !done ? "cursor-pointer" : ""
                  } ${
                    done
                      ? "border-green-500/50 bg-green-500/10"
                      : selected
                        ? "border-primary bg-primary/15 ring-1 ring-primary"
                        : owned
                          ? "border-indigo-500/40 bg-card"
                          : "border-dashed border-border bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className={`font-mono text-xs font-bold ${done ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                      #{slot.n}
                    </span>
                    {done && <Check size={13} className="shrink-0 text-green-600 dark:text-green-400" strokeWidth={3} />}
                  </div>

                  {/* Who has it — a name, not an id, because that is what gets asked out loud. */}
                  <p className={`mt-0.5 truncate text-[10px] leading-tight ${
                    owned ? "font-medium text-foreground" : "italic text-muted-foreground"
                  }`}>
                    {owned ? slot.assignedToName || "Assigned" : "Not given out"}
                  </p>

                  <div className="mt-1.5 flex items-center gap-1">
                    {canTick && (
                      <button
                        type="button"
                        disabled={working}
                        data-test={`bulk-video-toggle-${slot.n}`}
                        onClick={(e) => { e.stopPropagation(); complete(slot, !done); }}
                        title={done ? "Mark as not finished" : "Mark this video finished"}
                        className={`inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md text-[10px] font-bold transition-colors disabled:opacity-50 ${
                          done
                            ? "bg-green-500/20 text-green-700 dark:text-green-400"
                            : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        {working
                          ? <Loader2 size={10} className="animate-spin" />
                          : done ? <><Undo2 size={10} /> Undo</> : <><Check size={11} strokeWidth={3} /> Done</>}
                      </button>
                    )}
                    {mayAssign && owned && !done && !working && (
                      <button
                        type="button"
                        data-test={`bulk-video-free-${slot.n}`}
                        onClick={(e) => { e.stopPropagation(); takeBack(slot); }}
                        title="Take this video back off them"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assigning. Appears only once something is selected, so it is never in the way. */}
          {mayAssign && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
              {picked.size === 0 ? (
                stats.unassigned > 0 ? (
                  <>
                    <span className="text-[11px] text-muted-foreground">
                      Tap the videos you want to give out, then pick who makes them.
                    </span>
                    <button
                      type="button"
                      onClick={selectFree}
                      data-test="bulk-select-free"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-foreground hover:bg-accent"
                    >
                      <UserPlus size={11} /> Select all {stats.unassigned} not given out
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Every video has someone on it. Tap any to move it to a different member.
                  </span>
                )
              ) : (
                <>
                  <span className="text-[11px] font-semibold text-foreground" data-test="bulk-picked-count">
                    {picked.size} video{picked.size === 1 ? "" : "s"} selected →
                  </span>
                  <select
                    value=""
                    disabled={busy === "assign"}
                    data-test="bulk-assign-to"
                    onChange={(e) => e.target.value && giveTo(e.target.value)}
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="">Give to…</option>
                    {members!.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                  </select>
                  {busy === "assign" && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                  <button
                    type="button"
                    onClick={() => setPicked(new Set())}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {/* Who is carrying what — the answer to "who do I give the next one to". */}
          {!mine && team.length > 0 && (
            <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2.5" data-test="bulk-member-progress">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Users size={11} /> Who is making them
              </p>
              {team.map((m) => (
                <div key={m.uid} className="flex items-center gap-2" data-test={`bulk-member-${m.uid}`}>
                  <span className="w-24 shrink-0 truncate text-[11px] font-medium text-foreground">{m.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={`block h-full rounded-full ${m.percent >= 100 ? "bg-green-500" : "bg-indigo-500"}`}
                      style={{ width: `${m.percent}%` }}
                    />
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {m.completed}/{m.assigned}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
