/**
 * What the customer sees: one page, one conversation, no account.
 *
 * This is the only screen in the app built for someone who has never seen the app. Everything that
 * would normally frame a page — the sidebar, the role switcher, the notification bell — is absent
 * on purpose. A client opens a link from WhatsApp on a phone, types four digits, and is talking to
 * the person building their ad. Anything more than that is something else to explain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Lock, ShieldCheck, AlertTriangle, MessageSquare } from "lucide-react";
import OrderChatPanel, { OrderChatCallButtons } from "@/components/order-chat/OrderChatPanel";
import ClientCall, { type ClientCallType } from "@/components/order-chat/ClientCall";
import { useOrderChat } from "@/hooks/useOrderChat";
import { guestDb, guestUid, hasGuestSession, joinOrderChat, alertTeam, type JoinResult } from "@/services/orderChatGuest";
import { CLIENT_SENDER_ID } from "@/types/orderChat";
import { cn } from "@/lib/utils";

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
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const submit = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    const result: JoinResult = await joinOrderChat(chatId, code);
    setBusy(false);

    if (result.ok) { onJoined(); return; }

    setDigits(["", "", "", ""]);
    setTimeout(() => inputs.current[0]?.focus(), 50);

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

  const setDigit = (index: number, value: string) => {
    if (blocked || busy) return;
    if (!/^\d*$/.test(value)) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    setError(null);
    if (value && index < 3) inputs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) submit(next.join(""));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length !== 4) return;
    setDigits(pasted.split(""));
    submit(pasted);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Your project chat</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          Enter the 4-digit code from the message we sent you.
        </p>

        <div className="my-7 flex justify-center gap-3" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              disabled={blocked || busy}
              className={cn(
                "h-16 w-14 rounded-xl border-2 bg-card text-center text-2xl font-bold text-foreground outline-none transition-all",
                error ? "border-destructive/60" : "border-border focus:border-primary focus:ring-4 focus:ring-primary/10",
                (blocked || busy) && "opacity-50",
              )}
            />
          ))}
        </div>

        {busy && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening your chat…
          </p>
        )}

        {error && !busy && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-left">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Private chat with your project team
        </p>
      </div>
    </div>
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

  const { room, messages, loading, missing, locked, canSend, sending, send, remove } = useOrderChat({
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
        onDelete={remove}
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
