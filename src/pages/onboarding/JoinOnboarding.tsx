/**
 * What being hired looks like from the outside: one link, three steps, no account until the end.
 *
 * This is the second screen in the app built for someone who has never seen the app — and unlike
 * the client chat, the person reading it is about to become a colleague. Everything that frames an
 * internal page is absent: no sidebar, no bell, no role switcher. A candidate opens a link from
 * WhatsApp on a phone, types four digits, reads what they are being offered, signs it twice, and
 * walks away with a login.
 *
 * The code is re-sent with every action rather than exchanged for a session, so a reopened link
 * asks for it again and lands the person exactly where they left off — the server decides which
 * step that is from what they have already signed, not the browser.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, Building2, CheckCircle2, Clock, FileSignature, Loader2, Lock, ShieldCheck } from "lucide-react";
import AccessCodeGate from "@/components/common/AccessCodeGate";
import LetterStep from "@/components/onboarding/LetterStep";
import CredentialsStep from "@/components/onboarding/CredentialsStep";
import {
  acceptJoining, acceptOffer, declineInvite, openInvite, type InviteError, type InviteResult,
} from "@/services/onboardingGuest";
import { stepForStatus } from "@/types/onboarding";
import type { InvitePublicView, IssuedCredentials } from "@/types/onboarding";
import { COMPANY } from "@/utils/company";
import { cn } from "@/lib/utils";

type Step = "offer" | "joining" | "credentials";

const STEPS: { key: Step; label: string }[] = [
  { key: "offer", label: "Offer" },
  { key: "joining", label: "Joining" },
  { key: "credentials", label: "Login" },
];

/** What a failure means to someone who has never seen this system and should not have to care. */
function messageFor(error: InviteError | undefined, attemptsLeft?: number, retryInSeconds?: number): string {
  switch (error) {
    case "locked": {
      const mins = Math.ceil((retryInSeconds || 900) / 60);
      return `Too many incorrect codes. Please try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask us to resend it.`;
    }
    case "not_found":
      return "This link is not valid. Please ask us for a new one.";
    case "revoked":
      return "This link has been cancelled. Please contact us.";
    case "expired":
      return "This offer has passed its acceptance date. Please contact us and we will re-issue it.";
    case "email_taken":
      return "An account already exists for this email address. Please contact us so we can correct it.";
    case "offer_first":
      return "Please accept the offer letter before the joining letter.";
    case "closed":
      return "This link is closed. Please contact us.";
    case "network":
      return "Couldn't connect. Please check your internet and try again.";
    case "provision_failed":
      return "Something went wrong while setting up your account. Please try once more, or contact us.";
    default:
      return attemptsLeft != null
        ? `That code isn't right. ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left.`
        : "That code isn't right. Please check the message again.";
  }
}

export default function JoinOnboarding() {
  const { inviteId = "" } = useParams();

  const [code, setCode] = useState<string | null>(null);
  const [invite, setInvite] = useState<InvitePublicView | null>(null);
  const [credentials, setCredentials] = useState<IssuedCredentials | null>(null);
  const [step, setStep] = useState<Step>("offer");

  const [busy, setBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submitCode = useCallback(async (entered: string) => {
    setBusy(true);
    setGateError(null);
    const result = await openInvite(inviteId, entered);
    setBusy(false);

    if (!result.ok) {
      if (result.error === "locked" || result.error === "not_found" || result.error === "revoked") setBlocked(true);
      setGateError(messageFor(result.error, result.attemptsLeft, result.retryInSeconds));
      return;
    }
    setCode(entered);
    setInvite(result.invite!);
    setStep(stepForStatus(result.invite!.status) === "closed" ? "offer" : stepForStatus(result.invite!.status) as Step);
  }, [inviteId]);

  /** Fold a server answer back into the page, or surface why it refused. */
  const apply = (result: InviteResult): boolean => {
    if (!result.ok) {
      setNotice(messageFor(result.error, result.attemptsLeft, result.retryInSeconds));
      return false;
    }
    setNotice(null);
    if (result.invite) setInvite(result.invite);
    if (result.credentials) setCredentials(result.credentials);
    return true;
  };

  const onSignOffer = async (signatureUrl: string) => apply(await acceptOffer(inviteId, code!, signatureUrl));

  const onSignJoining = async (signatureUrl: string) => {
    const result = await acceptJoining(inviteId, code!, signatureUrl);
    const ok = apply(result);
    if (ok) setStep("credentials");
    return ok;
  };

  const onDecline = async (step: "offer" | "joining", reason: string) => {
    apply(await declineInvite(inviteId, code!, step, reason));
  };

  // Someone who reopens the link after finishing has nothing left to sign, but their password was
  // handed over once and is not in the projection. Say so plainly instead of showing a blank card.
  const finishedElsewhere = invite?.status === "completed" && !credentials;

  if (!invite || !code) {
    return (
      <AccessCodeGate
        icon={<Building2 className="h-8 w-8 text-primary" />}
        title={`Welcome to ${COMPANY.name}`}
        subtitle="Enter the 4-digit code we sent you along with this link."
        busy={busy}
        busyLabel="Opening your letter…"
        error={gateError}
        blocked={blocked}
        onSubmit={submitCode}
        note={<><ShieldCheck className="h-3.5 w-3.5" /> Your offer is private to you</>}
      />
    );
  }

  if (invite.status === "declined") {
    return (
      <Shell invite={invite} step={step} onStep={setStep}>
        <Closed
          icon={<Lock className="h-8 w-8 text-muted-foreground" />}
          title="We have your reply"
          body={`Thank you for letting us know. ${invite.issuedByName} has been informed and will get back to you.`}
        />
      </Shell>
    );
  }

  if (invite.expired && invite.status === "sent") {
    return (
      <Shell invite={invite} step={step} onStep={setStep}>
        <Closed
          icon={<Clock className="h-8 w-8 text-warning" />}
          title="This offer has passed its date"
          body={`This offer was open until ${invite.offerValidUntil}. Please contact ${invite.issuedByName} and we will re-issue it.`}
        />
      </Shell>
    );
  }

  return (
    <Shell invite={invite} step={step} onStep={setStep}>
      {notice && (
        <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" data-test="join-notice">
          {notice}
        </p>
      )}

      {step === "offer" && (
        <LetterStep
          letter={invite.offerLetter}
          candidateName={invite.name}
          candidatePhone={invite.phone}
          companySignatureUrl={invite.companySignatureUrl}
          companySignedName={invite.issuedByName}
          companyDesignation={invite.issuedByDesignation}
          signatureUrl={invite.offerSignatureUrl}
          signedOn={invite.offerAcceptedOn}
          signed={invite.status !== "sent"}
          signLabel="Accept & sign this offer"
          continueLabel="Continue to joining letter"
          onSigned={onSignOffer}
          onContinue={() => setStep("joining")}
          onDecline={(reason) => onDecline("offer", reason)}
        />
      )}

      {step === "joining" && (
        <LetterStep
          letter={invite.joiningLetter}
          candidateName={invite.name}
          candidatePhone={invite.phone}
          companySignatureUrl={invite.companySignatureUrl}
          companySignedName={invite.issuedByName}
          companyDesignation={invite.issuedByDesignation}
          signatureUrl={invite.joiningSignatureUrl}
          signedOn={invite.joiningAcceptedOn}
          signed={invite.status === "completed"}
          signLabel="Accept & sign — this creates my account"
          continueLabel="Get my login"
          onSigned={onSignJoining}
          onContinue={() => setStep("credentials")}
          onDecline={(reason) => onDecline("joining", reason)}
        />
      )}

      {step === "credentials" && (
        credentials
          ? <CredentialsStep credentials={credentials} name={invite.name} />
          : finishedElsewhere
            ? (
              <Closed
                icon={<CheckCircle2 className="h-8 w-8 text-success" />}
                title="You have already completed this"
                body={`Your account is active. Sign in with ${invite.email} — if you do not have your password, ask ${invite.issuedByName} to send it to you.`}
              />
            )
            : <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}
    </Shell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

/** The frame: who this is from, who it is for, and how far through they are. */
function Shell({ invite, step, onStep, children }: {
  invite: InvitePublicView;
  step: Step;
  onStep: (s: Step) => void;
  children: React.ReactNode;
}) {
  const reached: Record<Step, boolean> = {
    offer: true,
    joining: invite.status !== "sent",
    credentials: invite.status === "completed",
  };
  const done: Record<Step, boolean> = {
    offer: invite.status !== "sent",
    joining: invite.status === "completed",
    credentials: invite.status === "completed",
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <FileSignature className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{COMPANY.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {invite.name} · {invite.designation}
              </p>
            </div>
          </div>

          <nav className="mt-3 flex items-center gap-1">
            {STEPS.map((s, i) => {
              const active = s.key === step;
              const canGo = reached[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => canGo && onStep(s.key)}
                  disabled={!canGo}
                  data-test={`step-${s.key}`}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
                    active ? "bg-primary/10 text-primary"
                      : canGo ? "text-muted-foreground hover:bg-accent" : "text-muted-foreground/40",
                  )}
                >
                  <span className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    done[s.key] ? "bg-success text-white"
                      : active ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}>
                    {done[s.key] ? <BadgeCheck className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4 md:px-4 md:py-6">{children}</main>

      <footer className="pb-8 text-center text-[11px] text-muted-foreground">
        Signed by {invite.issuedByName} · {invite.issuedByDesignation}
      </footer>
    </div>
  );
}

function Closed({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center" data-test="join-closed">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">{icon}</div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
