/**
 * The Social Media Team Lead, on the Social Media page itself (2026-10-01).
 *
 * ── Why here and not only on My Team ─────────────────────────────────────────────────────────
 * The flag behind it (`users.smmLeader`) existed as a small megaphone icon in My Team's table view —
 * the owner went looking for "a way to make someone the social media team lead" and did not find it.
 * The person who runs every monthly client belongs at the top of the page that lists them: the tech
 * admin sees who it is and changes it here, the lead sees that they are it, and everyone else who
 * oversees the months sees who to ask.
 *
 * The lead keeps their own role (a tech member keeps their work, attendance and salary screens) and
 * gains every month in the company: see, assign, start and delete (smmPlan.isSmmOverseer,
 * canDeleteSmmCampaign). They are notified when appointed and whenever a new month is sold.
 */
import { useEffect, useState } from "react";
import { Crown, Loader2, UserPlus, X } from "lucide-react";
import { fetchAssignableMembers, setSmmTeamLead, watchSmmTeamLeads } from "@/services/smm";
import { canAppointSmmLead } from "@/utils/smmPlan";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import type { AppUser } from "@/types";

type Person = { uid: string; name: string; role?: string };

export default function SmmTeamLeadPanel({ user }: { user: Pick<AppUser, "uid" | "name" | "role"> & { smmLeader?: boolean } }) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const canAppoint = canAppointSmmLead(user);
  const [leads, setLeads] = useState<Person[] | null>(null);
  const [members, setMembers] = useState<Person[]>([]);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => watchSmmTeamLeads(setLeads), []);
  useEffect(() => { if (canAppoint) fetchAssignableMembers().then(setMembers); }, [canAppoint]);

  const appoint = async () => {
    const person = members.find((m) => m.uid === picked);
    if (!person) return;
    setBusy(true);
    try {
      await setSmmTeamLead(person, true, user);
      toast({ title: `${person.name} is now the Social Media Team Lead`, description: "They have been notified, and now see and manage every month." });
      setPicked("");
    } catch {
      toast({ title: "Could not appoint the team lead", description: "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const standDown = async (person: Person) => {
    const { confirmed } = await confirm({
      title: `Remove ${person.name} as Social Media Team Lead?`,
      description: "They keep the months they are on, but no longer see or manage every month.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await setSmmTeamLead(person, false, user);
      toast({ title: `${person.name} is no longer the team lead` });
    } catch {
      toast({ title: "Could not remove the team lead", variant: "destructive" });
    }
  };

  if (leads === null) return null;
  const options = members.filter((m) => !leads.some((l) => l.uid === m.uid));

  return (
    <div data-test="smm-team-lead" className="rounded-xl border border-border bg-card p-3">
      {ConfirmDialog}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Crown size={15} className="shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">Social Media Team Lead</span>
        {leads.length === 0 ? (
          <span className="text-xs text-muted-foreground">Nobody appointed yet{canAppoint ? " — choose someone from the tech team below." : "."}</span>
        ) : (
          leads.map((l) => (
            <span key={l.uid} data-test="smm-team-lead-chip"
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {l.uid === user.uid ? `${l.name} (you)` : l.name}
              {canAppoint && (
                <button onClick={() => standDown(l)} aria-label={`Remove ${l.name} as team lead`} data-test="smm-team-lead-remove"
                  className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-primary/20">
                  <X size={12} />
                </button>
              )}
            </span>
          ))
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {user.smmLeader
          ? "You run every social media month: set months up, assign the team, delete months, and you are told the moment a new one is sold."
          : "Runs every social media month — sets months up, assigns the team, deletes months, and is told the moment a new one is sold."}
      </p>
      {canAppoint && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={picked} onChange={(e) => setPicked(e.target.value)} data-test="smm-team-lead-pick"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary sm:max-w-xs">
            <option value="">Choose a tech team member…</option>
            {options.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </select>
          <button onClick={appoint} disabled={!picked || busy} data-test="smm-team-lead-appoint"
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Make team lead
          </button>
        </div>
      )}
    </div>
  );
}
