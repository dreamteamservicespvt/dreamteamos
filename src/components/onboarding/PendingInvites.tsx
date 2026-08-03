import { useEffect, useState } from "react";
import {
  Check, ChevronDown, Copy, Eye, FileSignature, MessageCircle, Trash2, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getWhatsAppUrl } from "@/utils/phone";
import { COMPANY } from "@/utils/company";
import { buildInviteMessage, inviteUrl, isOpen, revokeInvite, watchMyInvites } from "@/services/onboarding";
import AgreementView from "@/components/agreement/AgreementView";
import { INVITE_STATUS_LABELS } from "@/types/onboarding";
import type { OnboardingInvite } from "@/types/onboarding";
import { cn } from "@/lib/utils";

/**
 * Who has been offered a job and has not answered yet.
 *
 * Sits above the team grid because that is the honest place for it: these are people who are not
 * yet on the team, and putting them in the grid would mean every count, every payroll figure and
 * every "how many people do I have" answer quietly included someone who has not accepted.
 *
 * A completed invite drops off the list — the person it produced is in the grid below.
 */
export default function PendingInvites({ adminUid }: { adminUid: string }) {
  const { toast } = useToast();
  const [invites, setInvites] = useState<OnboardingInvite[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [reading, setReading] = useState<OnboardingInvite | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<OnboardingInvite | null>(null);

  useEffect(() => watchMyInvites(adminUid, setInvites), [adminUid]);

  const pending = invites.filter(isOpen);
  const declined = invites.filter((i) => i.status === "declined");
  const shown = [...pending, ...declined];

  if (shown.length === 0) return null;

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const share = (invite: OnboardingInvite) => {
    const message = buildInviteMessage({
      name: invite.name,
      designation: invite.designation,
      url: inviteUrl(invite.id),
      code: invite.accessCode,
      companyName: COMPANY.name,
    });
    window.open(getWhatsAppUrl(invite.phone, message), "_blank", "noopener,noreferrer");
  };

  const handleRevoke = async (invite: OnboardingInvite) => {
    try {
      await revokeInvite(invite.id);
      toast({ title: "Link cancelled", description: `${invite.name}'s link no longer opens.` });
    } catch {
      toast({ title: "Could not cancel it", variant: "destructive" });
    } finally {
      setConfirmRevoke(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card" data-test="pending-invites">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileSignature size={15} className="text-primary" />
          Onboarding in progress
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            {shown.length}
          </span>
        </span>
        <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border p-3">
          {shown.map((invite) => (
            <div key={invite.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{invite.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.designation} · joins {invite.joiningDate}
                  </p>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  invite.status === "offer_accepted" ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                    : invite.status === "declined" ? "bg-destructive/15 text-destructive"
                      : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                )}>
                  {INVITE_STATUS_LABELS[invite.status]}
                </span>
              </div>

              {invite.status === "declined" && invite.declinedReason && (
                <p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                  “{invite.declinedReason}”
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {invite.status !== "declined" && (
                  <>
                    <button onClick={() => copy(`${invite.id}-link`, inviteUrl(invite.id))}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                      {copied === `${invite.id}-link` ? <Check size={12} className="text-success" /> : <Copy size={12} />} Link
                    </button>
                    <button onClick={() => copy(`${invite.id}-code`, invite.accessCode)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 font-mono text-[11px] font-bold tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground">
                      {copied === `${invite.id}-code` ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                      {invite.accessCode}
                    </button>
                    {invite.phone && (
                      <button onClick={() => share(invite)} title="Send on WhatsApp"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-success hover:bg-success/10">
                        <MessageCircle size={12} /> Send
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => setReading(invite)} title="Read the letters"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Eye size={12} /> Letters
                </button>
                <button onClick={() => setConfirmRevoke(invite)} title="Cancel this link"
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reading && <LetterReader invite={reading} onClose={() => setReading(null)} />}

      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmRevoke(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display mb-2 font-bold text-foreground">Cancel this hiring link?</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              <strong className="text-foreground">{confirmRevoke.name}</strong>'s link will stop opening and
              they will be told to contact you. Nothing they have already signed is lost.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRevoke(null)}
                className="flex-1 rounded-lg border border-border bg-accent py-2 text-sm font-medium text-foreground">
                Keep it
              </button>
              <button onClick={() => handleRevoke(confirmRevoke)}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90">
                Cancel link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Both letters exactly as the candidate sees them, with whatever signatures exist so far. */
function LetterReader({ invite, onClose }: { invite: OnboardingInvite; onClose: () => void }) {
  const [which, setWhich] = useState<"offer" | "joining">("offer");
  const letter = which === "offer" ? invite.offerLetter : invite.joiningLetter;
  const signature = which === "offer" ? invite.offerSignatureUrl : invite.joiningSignatureUrl;
  const signedOn = which === "offer" ? invite.offerAcceptedOn : invite.joiningAcceptedOn;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="mx-auto my-4 max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-black/30 p-1">
            {(["offer", "joining"] as const).map((k) => (
              <button key={k} onClick={() => setWhich(k)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  which === k ? "bg-white text-slate-900" : "text-white/80 hover:text-white",
                )}>
                {k === "offer" ? "Offer letter" : "Joining letter"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/90 p-1.5 text-slate-800 hover:bg-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-hidden rounded-lg">
          <AgreementView
            bodyText={letter.bodyText}
            memberName={invite.name}
            memberPhone={invite.phone}
            signatureUrl={signature || undefined}
            signedName={signature ? invite.name : undefined}
            signedDate={signedOn || undefined}
            companySignatureUrl={invite.companySignatureUrl}
            companySignedName={invite.issuedByName}
            companyDesignation={invite.issuedByDesignation}
            companySignedDate={letter.issuedOn}
          />
        </div>
      </div>
    </div>
  );
}
