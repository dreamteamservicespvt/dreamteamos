/**
 * The team's view of a client chat — the same conversation the customer is looking at.
 *
 * A sheet rather than a page: the member is mid-job on My Work and the leader is scanning a list of
 * assignments, and neither should lose their place to answer a question. Calling reuses the app's
 * own call manager by simply naming the customer as the peer, so there is one call system here, not
 * two.
 */
import { useCallback, useEffect, useState } from "react";
import { X, Share2, Phone, Video as VideoIcon, Lock, Info } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import OrderChatPanel from "@/components/order-chat/OrderChatPanel";
import ShareChatModal from "@/components/order-chat/ShareChatModal";
import { useOrderChat } from "@/hooks/useOrderChat";
import { ensureOrderChat } from "@/services/orderChat";
import { guestUid } from "@/services/orderChatGuest";
import type { WorkAssignment } from "@/types";

export interface StaffOrderChatProps {
  /** The job this chat belongs to. Its id is the chat's id. */
  assignment: WorkAssignment;
  /** The assignee's name, when the page knows it (the member's own pages do not need it). */
  memberName?: string;
  /** Leader and admin can hand the link to the client; the member cannot. */
  canShare?: boolean;
  onClose: () => void;
}

export default function StaffOrderChat({ assignment, memberName, canShare, onClose }: StaffOrderChatProps) {
  const user = useAuthStore((s) => s.user);
  const startCall = useCallStore((s) => s.startCall);
  const [sharing, setSharing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const chatId = assignment.id;
  const accessCode = assignment.accessCode;
  const businessName = assignment.businessName || assignment.clientName;
  const uniqueId = assignment.uniqueId;
  const clientPhone = assignment.businessWhatsapp;

  // Jobs assigned before client chats existed have no room. Opening one is what creates it.
  useEffect(() => {
    if (!user) return;
    ensureOrderChat({
      assignment,
      memberName,
      actorUid: user.uid,
      actorName: user.name,
      techAdminUid: user.role === "tech_admin" ? user.uid : user.createdBy,
    });
  }, [assignment.id, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const identity = user
    ? { senderId: user.uid, senderName: user.name, isClient: false }
    : null;

  const { room, messages, loading, missing, locked, canSend, sending, send } =
    useOrderChat({ chatId, identity });

  const callClient = useCallback((type: "voice" | "video") => {
    const name = businessName || room?.clientName || "Client";
    startCall(guestUid(chatId), name, undefined, type);
    // A customer has no app to ring, so an unanswered call usually means a closed tab rather than
    // someone ignoring you. Saying so up front saves the member calling three times.
    setHint("Ringing the client — they'll only hear it if their chat page is open.");
    setTimeout(() => setHint(null), 6000);
  }, [startCall, chatId, businessName, room?.clientName]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}>
      <div
        className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-background shadow-2xl sm:h-[85vh] sm:rounded-2xl sm:border sm:border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {(businessName || "C").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {businessName || "Client"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {locked ? "Delivered · view only" : "Client chat"}{uniqueId ? ` · ${uniqueId}` : ""}
            </p>
          </div>

          {!locked && !missing && (
            <>
              <button onClick={() => callClient("voice")} title="Voice call the client"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Phone className="h-4 w-4" />
              </button>
              <button onClick={() => callClient("video")} title="Video call the client"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <VideoIcon className="h-4 w-4" />
              </button>
            </>
          )}
          {canShare && (
            <button onClick={() => setSharing(true)} title="Send the link to the client"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Share2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} aria-label="Close"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {hint && (
          <div className="flex items-start gap-2 border-b border-border bg-muted/50 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        )}

        {missing && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <Lock className="mb-3 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Setting this chat up…</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              This job was assigned before client chats existed. It will be ready in a moment.
            </p>
          </div>
        ) : (
          <OrderChatPanel
            identity={identity || { senderId: "", senderName: "", isClient: false }}
            messages={messages}
            loading={loading}
            locked={locked}
            canSend={canSend}
            sending={sending}
            lockedNote="Work delivered — chat closed"
            onSend={send}
            emptyHint={
              canShare
                ? "Share the link with the client to start the conversation."
                : "Say hello — the client can send photos, videos and details here."
            }
          />
        )}
      </div>

      {sharing && (
        <ShareChatModal
          chatId={chatId}
          accessCode={accessCode}
          businessName={businessName}
          uniqueId={uniqueId}
          memberName={room?.memberName}
          clientPhone={clientPhone || room?.clientPhone}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
