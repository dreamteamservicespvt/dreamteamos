/**
 * Edit team — the Social Media Team Lead's corrections to who is on her TODAY board (2026-10-08).
 *
 * The board lists, by itself, everybody working on a Social Media month. The owner chose to let the lead correct
 * it: add somebody who is in her meeting but on no month yet, take off somebody who is on a month but not in her
 * meeting. Saved at once for everybody who opens the board (services/smmTeam → `app_settings/smm_team`).
 * Candidates are the people a month can be given to (`fetchAssignableMembers`: active tech members and team
 * leaders, no outside creators), read when the dialog opens.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fetchAssignableMembers } from "@/services/smm";
import { addToSmmTeam, removeFromSmmTeam } from "@/services/smmTeam";
import type { SmmTeamEdits, SmmTeamPerson } from "@/utils/smmAttendance";

export default function SmmTeamEditor({ open, onOpenChange, fromMonths, edits, team, nameOf, actor }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everybody the months put on the team (before the corrections). */
  fromMonths: SmmTeamPerson[];
  edits: SmmTeamEdits;
  /** The team as the board shows it (after the corrections). */
  team: SmmTeamPerson[];
  nameOf: (uid: string) => string;
  actor: { uid: string; name?: string };
}) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<{ uid: string; name: string }[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCandidates(true);
    fetchAssignableMembers().then((list) => {
      if (cancelled) return;
      setCandidates(list);
      setLoadingCandidates(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  const onMonths = useMemo(() => new Set(fromMonths.map((p) => p.uid)), [fromMonths]);
  const onTeam = useMemo(() => new Set(team.map((p) => p.uid)), [team]);
  const addable = candidates.filter((c) => !onTeam.has(c.uid));
  // People the months would list but the lead took off — offered back.
  const takenOff = fromMonths.filter((p) => edits.removed.includes(p.uid));
  const nameFor = (uid: string) => nameOf(uid) || candidates.find((c) => c.uid === uid)?.name
    || fromMonths.find((p) => p.uid === uid)?.name || "this person";

  const run = async (uid: string, action: "add" | "remove") => {
    setBusy(uid);
    try {
      if (action === "add") await addToSmmTeam(uid, { onMonths: onMonths.has(uid) }, actor);
      else await removeFromSmmTeam(uid, { onMonths: onMonths.has(uid) }, actor);
      // No "saved" toast: the list below changes in front of her, and on a phone the toast covered this dialog's
      // title and close button (browser check, 2026-10-08). Only a failure is worth a toast.
      if (action === "add") setPick("");
    } catch (error) {
      console.error("[SmmTeamEditor]", error);
      toast({ title: `Could not save the change for ${nameFor(uid)}`, description: "Check the connection and try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-test="smm-team-editor" className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Social Media team</DialogTitle>
          <DialogDescription>
            Everyone working on a Social Media month is on the list by itself. Add someone who is missing, or take off
            someone who is not in your meeting. Saved for everyone at once.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} data-test="smm-team-pick" aria-label="Person to add"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
            <option value="">{loadingCandidates ? "Loading people…" : addable.length ? "Choose a person to add…" : "Everyone is already on the team"}</option>
            {addable.map((c) => <option key={c.uid} value={c.uid}>{c.name}</option>)}
          </select>
          <Button type="button" onClick={() => pick && run(pick, "add")} disabled={!pick || !!busy} data-test="smm-team-add" className="h-10 gap-1.5">
            {busy === pick && pick ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On the team · {team.length}</p>
            <ul className="divide-y divide-border rounded-lg border border-border" data-test="smm-team-list">
              {team.map((p) => (
                <li key={p.uid} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    {/* Wraps: cut with "…" on a 390px phone, the rest was only in a tooltip a phone cannot show. */}
                    <p className="break-words text-xs leading-snug text-muted-foreground">
                      {p.source === "added" ? "Added by hand" : p.clients.join(", ") || "On Social Media months"}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={() => run(p.uid, "remove")}
                    data-test="smm-team-remove" aria-label={`Take ${p.name} off the team`} className="h-9 shrink-0 gap-1.5 text-rose-600 hover:text-rose-700">
                    {busy === p.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />} Take off
                  </Button>
                </li>
              ))}
              {team.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Nobody yet.</li>}
            </ul>
          </div>

          {takenOff.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Taken off the list</p>
              <ul className="divide-y divide-border rounded-lg border border-dashed border-border" data-test="smm-team-takenoff">
                {takenOff.map((p) => (
                  <li key={p.uid} className="flex items-center gap-3 px-3 py-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{nameOf(p.uid) || p.name}</p>
                    <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={() => run(p.uid, "add")}
                      data-test="smm-team-putback" className="h-9 shrink-0 gap-1.5">
                      {busy === p.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Put back
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* A big way out: the dialog's own corner X is 16px — too small a target on a phone. `shrink-0`: the dialog is a
            flex column capped at 90vh, and with a long list it squeezed this to 40px. */}
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} data-test="smm-team-done" className="h-11 w-full shrink-0 text-base">
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
