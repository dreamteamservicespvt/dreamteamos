/**
 * Splitting a social-media month across the team.
 *
 * A month is three jobs — make the ads, put them up, run the campaigns — and they do not have to
 * belong to one person. The tech leader can put each on a different member, or all three on one.
 *
 * One work assignment is created per *distinct member*, not per job: someone holding two of the
 * three gets a single card listing both, because two cards for one month is two things to keep
 * straight and one of them will be forgotten.
 */
import { useMemo, useState } from "react";
import { Loader2, Split } from "lucide-react";
import { createWorkAssignment, nextWorkUniqueId } from "@/services/workAssign";
import { setOrderTracks } from "@/services/orders";
import { activeTracks } from "@/utils/orderProgress";
import { useToast } from "@/hooks/use-toast";
import { ORDER_TRACKS } from "@/types";
import type { AppUser, Order, OrderTrack, WorkAssignment } from "@/types";

export default function AssignTracksDialog({ order, members, assignments, assignerUid, assigner, onClose, onDone }: {
  order: Order;
  members: AppUser[];
  /** Existing work, so each new assignment gets the next sequential id. */
  assignments: WorkAssignment[];
  assignerUid: string;
  /** The signed-in user, so each job handed out is recorded in the tech activity feed. */
  assigner?: AppUser | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const tracks = useMemo(() => (order.progress ? activeTracks(order.progress) : []), [order.progress]);
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const t of tracks) initial[t] = order.progress?.tracks?.[t]?.uid || "";
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const chosen = tracks.filter((t) => picked[t]);

  /** Everyone at once — the common case, and tedious to click three times. */
  const assignAll = (uid: string) => setPicked(Object.fromEntries(tracks.map((t) => [t, uid])));

  const save = async () => {
    if (chosen.length === 0) {
      toast({ title: "Pick someone", description: "Give at least one job to a member.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name || "";

      // Record the split on the order first: it is what every screen reads to show who holds what,
      // and it must be true even if creating an assignment below fails partway.
      const trackMap: Partial<Record<OrderTrack, { uid: string; name: string }>> = {};
      for (const t of chosen) trackMap[t] = { uid: picked[t], name: nameOf(picked[t]) };
      await setOrderTracks({ order, tracks: trackMap });

      // Group by member so someone holding two jobs gets one assignment listing both.
      const byMember = new Map<string, OrderTrack[]>();
      for (const t of chosen) {
        const list = byMember.get(picked[t]);
        if (list) list.push(t); else byMember.set(picked[t], [t]);
      }

      // Ids are handed out from a growing local copy: `nextWorkUniqueId` reads the highest existing
      // number, and without feeding each new one back, three members in one split would all get
      // the same id.
      const issued: WorkAssignment[] = [...assignments];
      for (const [uid, memberTracks] of byMember) {
        const uniqueId = nextWorkUniqueId(order.category, issued);
        issued.push({ uniqueId } as WorkAssignment);
        await createWorkAssignment({
          assignedTo: uid,
          assignedToName: nameOf(uid),
          assignerUid,
          category: order.category,
          duration: order.packageKey || "",
          clipCount: order.progress?.targets.ads || 1,
          pricePerUnit: 0,
          uniqueId,
          businessName: order.businessName,
          businessWhatsapp: order.clientPhone,
          requirementNotes: order.requirement?.notes,
          order,
          tracks: memberTracks,
          assignerName: assigner?.name,
          actor: assigner,
        });
      }

      toast({
        title: "Assigned",
        description: byMember.size === 1
          ? `${nameOf([...byMember.keys()][0])} has the whole month.`
          : `Split across ${byMember.size} members.`,
      });
      onDone?.();
      onClose();
    } catch {
      toast({ title: "Error", description: "Couldn't assign this order. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-purple-500/15">
          <Split className="h-5 w-5 text-purple-500" />
        </div>
        <h3 className="text-center text-lg font-semibold text-foreground">Assign the work</h3>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          <strong className="text-foreground">{order.businessName || "This order"}</strong> — give each job to a member, or all of them to one.
        </p>

        {tracks.length > 1 && (
          <div className="mt-4 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Give everything to one person</label>
            <select
              value=""
              data-test="assign-all"
              onChange={(e) => e.target.value && assignAll(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Choose a member…</option>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {tracks.map((t) => (
            <div key={t} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {ORDER_TRACKS.find((x) => x.key === t)?.label || t}
              </label>
              <select
                value={picked[t] || ""}
                data-test={`assign-track-${t}`}
                onChange={(e) => setPicked((p) => ({ ...p, [t]: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Not assigned yet</option>
                {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving || chosen.length === 0} data-test="assign-tracks-save"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />}
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
