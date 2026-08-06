/**
 * The team's view of a client chat — the same conversation the customer is looking at.
 *
 * ── Why it takes the whole screen ─────────────────────────────────────────────────────────────
 * It used to be a sheet floating over the page, on the theory that a member mid-job should not
 * lose their place. In practice it made a chat about a real customer feel like a dialog to get rid
 * of: half a phone screen of conversation above a keyboard, with the work list showing round the
 * edges. Full screen with a back arrow is what every messaging app does, and the back arrow is a
 * better answer to "don't lose my place" than a shrunken window — it goes back to exactly where
 * they were.
 *
 * Calling reuses the app's own call manager by simply naming the customer as the peer, so there is
 * one call system here, not two.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Share2, Phone, Video as VideoIcon, Lock, Info } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import OrderChatPanel from "@/components/order-chat/OrderChatPanel";
import ShareChatModal from "@/components/order-chat/ShareChatModal";
import { useOrderChat } from "@/hooks/useOrderChat";
import { alertClient, ensureOrderChat } from "@/services/orderChat";
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

  /** Android's back gesture and the browser's Back button should close this, not leave the page. */
  useEffect(() => {
    window.history.pushState({ orderChat: chatId }, "");
    const pop = () => onClose();
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      // Closing by the arrow leaves the entry we pushed behind; take it back out so the member's
      // next Back press does what it did before this chat was ever opened.
      if (window.history.state?.orderChat === chatId) window.history.back();
    };
  }, [chatId, onClose]);

  const identity = user
    ? { senderId: user.uid, senderName: user.name, isClient: false }
    : null;

  /**
   * Reach the customer on their phone.
   *
   * Without this the whole thing is one-way: a client's message pushed a member, and a member's
   * reply bumped an unread counter for somebody who had closed the tab hours ago.
   */
  const onSent = useCallback((preview: string) => {
    alertClient({ chatId, kind: "message", preview });
  }, [chatId]);

  const { room, messages, loading, missing, locked, canSend, sending, send } =
    useOrderChat({ chatId, identity, onSent });

  const callClient = useCallback((type: "voice" | "video") => {
    const name = businessName || room?.clientName || "Client";
    // The push to the customer's phone is raised by VideoCallManager once the call document
    // exists — it is the only place that knows the id the notification has to carry.
    startCall(guestUid(chatId), name, undefined, type);
    setHint(`Ringing ${name}. They'll get a notification even if their chat is closed.`);
    setTimeout(() => setHint(null), 6000);
  }, [startCall, chatId, businessName, room?.clientName]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#eae6df] dark:bg-[#0b141a]" data-test="staff-order-chat">
      {/* Header */}
      <div className="flex items-center gap-1 bg-[#008069] px-1.5 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white dark:bg-[#202c33]">
        <button onClick={onClose} aria-label="Back" data-test="staff-order-chat-back"
          className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
          {(businessName || "C").charAt(0).toUpperCase()}
        </div>
        <div className="ml-2 min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">
            {businessName || "Client"}
          </p>
          <p className="truncate text-[11.5px] text-white/75">
            {locked ? "Delivered · view only" : "Client chat"}{uniqueId ? ` · ${uniqueId}` : ""}
          </p>
        </div>

        {!locked && !missing && (
          <>
            <button onClick={() => callClient("voice")} title="Voice call the client"
              data-test="staff-call-client-voice"
              className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15">
              <Phone className="h-5 w-5" />
            </button>
            <button onClick={() => callClient("video")} title="Video call the client"
              className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15">
              <VideoIcon className="h-5 w-5" />
            </button>
          </>
        )}
        {canShare && (
          <button onClick={() => setSharing(true)} title="Send the link to the client"
            className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15">
            <Share2 className="h-5 w-5" />
          </button>
        )}
      </div>

      {hint && (
        <div className="flex items-start gap-2 bg-[#ffeecd] px-3 py-2 dark:bg-[#182229]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <p className="text-[11.5px] text-slate-700 dark:text-slate-300">{hint}</p>
        </div>
      )}

      {missing && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <Lock className="mb-3 h-7 w-7 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Setting this chat up…</p>
          <p className="mt-1 max-w-xs text-xs text-slate-500">
            This job was assigned before client chats existed. It will be ready in a moment.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
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
        </div>
      )}

      {sharing && (
        <ShareChatModal
          chatId={chatId}
          businessName={businessName}
          uniqueId={uniqueId}
          category={assignment.category}
          clientPhone={clientPhone || room?.clientPhone}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
