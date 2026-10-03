/**
 * "Your work on this month" — a tech member's job on a social-media month, on the month's own page
 * (2026-10-04).
 *
 * ── Why it is here ────────────────────────────────────────────────────────────────────────────
 * The owner wants a member's social-media work in the Social Media section only, so a month's job
 * card no longer appears in My Work or Recent Ads (utils/smmPackage.isSmmMonthJob). The card still
 * matters — it carries the access code, the client chat, the time spent, and it is the month's way
 * into the AI studio, locked to the month's video length — so it is offered here, beside the plan it
 * is for. The buttons open the very same studio and chat My Work opens (its `?open=` / `?chat=`
 * links), which return the member to this page when they close: one studio, one completion flow
 * (Flow credits → submit → Drive step), not a second copy of it.
 *
 * Read once when the page opens — the member's own card only (`fetchMyMonthJobs`), not the team's.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CheckCircle2, Copy, Edit3, MessagesSquare, Play, Sparkles } from "lucide-react";
import { fetchMyMonthJobs } from "@/services/smmAssign";
import { useDriveUploadStep } from "@/components/work/useDriveUploadStep";
import { DriveUploadChip } from "@/components/work/DriveUploadSheet";
import { SEAT_TRACKS, SMM_SEATS, clipsPerVideoOf, monthJobLink, videoLengthLabel } from "@/utils/smmPackage";
import type { SmmCampaign } from "@/types/smm";
import type { AppUser, WorkAssignment } from "@/types";

const STATUS: Record<WorkAssignment["status"], { label: string; cls: string; action?: string; Icon?: typeof Play }> = {
  assigned: { label: "Not started", cls: "bg-info/15 text-info", action: "Start in AI studio", Icon: Play },
  in_progress: { label: "In progress", cls: "bg-warning/15 text-warning", action: "Continue in AI studio", Icon: Sparkles },
  editing: { label: "Changes asked", cls: "bg-destructive/15 text-destructive", action: "Make the changes", Icon: Edit3 },
  completed: { label: "Handed in · awaiting check", cls: "bg-success/15 text-success" },
  verified: { label: "Verified", cls: "bg-success/15 text-success" },
};

/** "Makes the content", "Posts it", "Runs the ads" — the seats this card holds, from its tracks. */
function seatsOf(job: WorkAssignment): string[] {
  const tracks = job.tracks || [];
  return SMM_SEATS.filter(({ seat }) => tracks.includes(SEAT_TRACKS[seat])).map(({ label }) => label);
}

export default function SmmMyJobPanel({ campaign, user }: {
  campaign: Pick<SmmCampaign, "id" | "orderId" | "clipsPerVideo">;
  user: Pick<AppUser, "uid" | "role">;
}) {
  const navigate = useNavigate();
  const isMember = user.role === "tech_member";
  const [jobs, setJobs] = useState<WorkAssignment[] | null>(null);
  const [copied, setCopied] = useState(false);
  const drive = useDriveUploadStep();

  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    fetchMyMonthJobs(campaign, user.uid)
      .then((list) => { if (!cancelled) setJobs(list); })
      .catch(() => { if (!cancelled) setJobs([]); });
    return () => { cancelled = true; };
  }, [isMember, campaign.id, campaign.orderId, user.uid]);

  const job = jobs?.[0];
  if (!isMember || !job) return null;

  const st = STATUS[job.status] || STATUS.assigned;
  const active = !!st.action;
  const seats = seatsOf(job);
  const Icon = st.Icon || Play;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(job.accessCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* the code is on screen to read */ }
  };

  return (
    <section data-test="smm-my-job" data-status={job.status}
      className={`rounded-xl border p-4 ${active ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Your work on this month</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {seats.length > 0 ? seats.join(" · ") : "On this month"}
            {" · "}each video {videoLengthLabel(clipsPerVideoOf(campaign))}
            {" · "}<span className="font-mono">{job.uniqueId}</span>
          </p>
        </div>
        <span data-test="smm-my-job-status" className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
          {st.label}
        </span>
      </div>

      {active ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">Access code</span>
            <span className="flex items-center gap-1.5">
              <code data-test="smm-my-job-code" className="font-mono text-sm font-bold text-foreground">{job.accessCode}</code>
              <button onClick={copyCode} title="Copy code" aria-label="Copy access code"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted">
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} className="text-muted-foreground" />}
              </button>
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => navigate(monthJobLink(job.id, campaign.id, "open"))} data-test="smm-my-job-open"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90">
              <Icon size={16} /> {st.action}
            </button>
            <button onClick={() => navigate(monthJobLink(job.id, campaign.id, "chat"))} data-test="smm-my-job-chat"
              title="Chat with the client" aria-label="Chat with the client"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent">
              <MessagesSquare size={16} /> <span className="hidden sm:inline">Chat with client</span>
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 size={14} className="text-success" />
          <span className="min-w-0 flex-1">Your job on this month is handed in.</span>
          <DriveUploadChip assignment={job} onOpen={(j) => drive.offer(j, false)} />
        </div>
      )}
      {drive.sheet}
    </section>
  );
}
