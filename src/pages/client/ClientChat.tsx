/**
 * What the customer sees: one page, one conversation, no account.
 *
 * This is the only screen in the app built for someone who has never seen the app. Everything that
 * would normally frame a page — the sidebar, the role switcher, the notification bell — is absent
 * on purpose. A client opens a link from WhatsApp on a phone, types four digits, and is talking to
 * the person building their ad. Anything more than that is something else to explain.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Lock, ShieldCheck, MessageSquare } from "lucide-react";
import OrderChatPanel, { OrderChatCallButtons } from "@/components/order-chat/OrderChatPanel";
import ClientCall, { type ClientCallType } from "@/components/order-chat/ClientCall";
import AccessCodeGate from "@/components/common/AccessCodeGate";
import { useOrderChat } from "@/hooks/useOrderChat";
import { guestDb, guestUid, hasGuestSession, joinOrderChat, alertTeam, type JoinResult } from "@/services/orderChatGuest";
import { CLIENT_SENDER_ID } from "@/types/orderChat";

export default function ClientChat() {
  const { chatId = "" } = useParams();
  const [checking, setChecking] = useState(true);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let alive = true;
    hasGuestSession(chatId).then((ok) => {
      if (!alive) return;
      setJoined(ok);
      setChecking(false);
    });
    return () => { alive = false; };
  }, [chatId]);

  if (checking) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!joined) return <CodeGate chatId={chatId} onJoined={() => setJoined(true)} />;
  return <Conversation chatId={chatId} />;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function CodeGate({ chatId, onJoined }: { chatId: string; onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const submit = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    const result: JoinResult = await joinOrderChat(chatId, code);
    setBusy(false);

    if (result.ok) { onJoined(); return; }

    if (result.error === "locked") {
      setBlocked(true);
      const mins = Math.ceil((result.retryInSeconds || 900) / 60);
      setError(`Too many wrong codes. Please try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask the team to resend the code.`);
    } else if (result.error === "not_found") {
      setBlocked(true);
      setError("This chat link is no longer valid. Please ask the team for a new one.");
    } else if (result.error === "network") {
      setError("Couldn't connect. Check your internet and try again.");
    } else {
      setError(
        result.attemptsLeft != null
          ? `That code isn't right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`
          : "That code isn't right. Please check the message again.",
      );
    }
  }, [chatId, onJoined]);

  return (
    <AccessCodeGate
      icon={<MessageSquare className="h-8 w-8 text-primary" />}
      title="Your project chat"
      subtitle="Enter the 4-digit code from the message we sent you."
      busy={busy}
      busyLabel="Opening your chat…"
      error={error}
      blocked={blocked}
      onSubmit={submit}
      note={<><ShieldCheck className="h-3.5 w-3.5" /> Private chat with your project team</>}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function Conversation({ chatId }: { chatId: string }) {
  const dbi = guestDb();
  const [callRequest, setCallRequest] = useState<ClientCallType | null>(null);
  /**
   * What the team sees above the customer's messages.
   *
   * Taken from the room once it loads rather than left blank: on the member's screen this chat sits
   * beside a dozen others, and "a message from nobody" is exactly the confusion the whole feature
   * exists to remove.
   */
  const [sendAs, setSendAs] = useState("Client");

  const onSent = useCallback((preview: string) => {
    alertTeam({ chatId, kind: "message", preview });
  }, [chatId]);

  const identity = { senderId: CLIENT_SENDER_ID, senderName: sendAs, isClient: true };

  const { room, messages, loading, missing, locked, canSend, sending, send } = useOrderChat({
    chatId,
    dbi,
    identity,
    onSent,
  });

  useEffect(() => {
    const name = room?.businessName || room?.clientName;
    if (name) setSendAs(name);
  }, [room?.businessName, room?.clientName]);

  if (missing) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-8 text-center">
        <Lock className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-base font-semibold text-foreground">This chat is no longer available</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Please contact the team for an updated link.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <OrderChatPanel
        identity={identity}
        messages={messages}
        loading={loading}
        locked={locked}
        canSend={canSend}
        sending={sending}
        lockedNote="Your work has been delivered"
        onSend={send}
        emptyHint="Share photos, videos, your logo or any details here. You can also call the team directly."
        header={
          <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {(room?.businessName || "D").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {room?.businessName || "Your project"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {locked
                  ? "Delivered · view only"
                  : room?.memberName
                    ? `${room.memberName} · Dream Team Services`
                    : "Dream Team Services"}
                {room?.uniqueId ? ` · ${room.uniqueId}` : ""}
              </p>
            </div>
            {!locked && room?.memberUid && (
              <OrderChatCallButtons
                onVoice={() => setCallRequest("voice")}
                onVideo={() => setCallRequest("video")}
              />
            )}
          </div>
        }
      />

      {room?.memberUid && (
        <ClientCall
          dbi={dbi}
          chatId={chatId}
          selfId={guestUid(chatId)}
          selfName={room.businessName || room.clientName || "Client"}
          memberUid={room.memberUid}
          memberName={room.memberName || "Dream Team"}
          request={callRequest}
          onRequestHandled={() => setCallRequest(null)}
        />
      )}
    </div>
  );
}
