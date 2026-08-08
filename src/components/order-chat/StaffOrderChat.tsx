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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Share2, Phone, Lock, Info, Star } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import OrderChatPanel from "@/components/order-chat/OrderChatPanel";
import ShareChatModal from "@/components/order-chat/ShareChatModal";
import { useOrderChat } from "@/hooks/useOrderChat";
import { alertClient, ensureOrderChat, senderRoleOf } from "@/services/orderChat";
import { guestUid } from "@/services/orderChatGuest";
import { workStatusChip } from "@/utils/orderChatStatus";
import type { WorkAssignment } from "@/types";

export interface StaffOrderChatProps {
  /** The job this chat belongs to. Its id is the chat's id. */
  assignment: WorkAssignment;
  /** The assignee's name, when the page knows it (the member's own pages do not need it). */
  memberName?: string;
  /** Leader and admin can hand the link to the client; the member cannot. */
  canShare?: boolean;
  /**
   * The seller, when the opener knows it.
   *
   * Passed by the sales side, whose whole route into this room is "the order I sold". It puts the
   * seller onto conversations that started before sales were part of them, which is what the
   * customer's "ask about another ad" button reads to find the right business number.
   */
  soldBy?: { uid: string; name?: string } | null;
  onClose: () => void;
}

export default function StaffOrderChat({ assignment, memberName, canShare, soldBy, onClose }: StaffOrderChatProps) {
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
      soldBy,
    });
  }, [assignment.id, user?.uid, soldBy?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Android's back gesture and the browser's Back button close this, rather than leaving the page.
   *
   * ── The bug this is written the way it is to avoid ────────────────────────────────────────────
   * Every caller passes `onClose={() => setOpenChatFor(null)}` — a new function on every render of
   * the page underneath. With `onClose` in the dependency array, this effect tore itself down and
   * rebuilt on every one of those renders, and the teardown called `history.back()`. That fired a
   * popstate, which the just-reattached listener heard, which called `onClose`. The chat closed
   * roughly the same instant it opened, and from the outside it simply looked like the button did
   * nothing.
   *
   * So the handler is read through a ref and the effect runs once per chat. Nothing about a parent
   * re-render can reach it.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const marker = `orderChat:${chatId}`;
    window.history.pushState({ orderChat: marker }, "");
    /** Set when the entry we pushed has already been popped, so cleanup must not pop it again. */
    let consumed = false;
    const pop = () => { consumed = true; onCloseRef.current(); };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      // Closed by the arrow rather than by Back: the entry we pushed is still on the stack, so
      // take it off. Without the guard this would pop an entry that was never ours.
      if (!consumed && window.history.state?.orderChat === marker) window.history.back();
    };
  }, [chatId]);

  // Memoised: `useOrderChat` keys its presence and message effects on the identity's fields, and a
  // fresh object every render would re-run them on every keystroke in the composer.
  const identity = useMemo(
    () => (user
      ? { senderId: user.uid, senderName: user.name, isClient: false, role: senderRoleOf(user.role) }
      : null),
    [user?.uid, user?.name, user?.role], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  const review = room?.clientReview || null;

  /**
   * Ring the customer. Voice only, deliberately.
   *
   * A client call is somebody asking about their order, usually from a shop floor on mobile data.
   * Video costs them data they did not agree to spend, puts them on camera without warning, and is
   * the reason a call gets declined rather than answered. The button that gets pressed is the one
   * that only asks for the microphone.
   */
  const callClient = useCallback(() => {
    const name = businessName || room?.clientName || "Client";
    // The push to the customer's phone is raised by VideoCallManager once the call document
    // exists — it is the only place that knows the id the notification has to carry.
    startCall(guestUid(chatId), name, undefined, "voice");
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
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <p className="truncate text-[11.5px] text-white/75">
              {locked ? "Delivered · view only" : "Client chat"}{uniqueId ? ` · ${uniqueId}` : ""}
            </p>
            {/*
              Where the ad has got to, on the header rather than a page behind it.

              Written for the sales member, who now reads this room: the client asks "is it done?"
              in the chat, and the answer used to live on a tech screen they cannot open. It is
              read off the room's own mirrored field so it costs nothing, and falls back to the
              assignment we were handed when a room predates the mirror.
            */}
            {(() => {
              const chip = workStatusChip(room?.workStatus || assignment.status);
              return (
                <span data-test="staff-chat-work-status"
                  className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[10px] font-semibold text-white">
                  {chip.label}
                </span>
              );
            })()}
            {/* The customer's verdict, where the people who earned it will actually see it. */}
            {review && (
              <span data-test="staff-chat-review"
                title={review.comment || undefined}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400/25 px-1.5 py-px text-[10px] font-semibold text-white">
                <Star className="h-2.5 w-2.5 fill-current" />
                {review.work}/5 work · {review.service}/5 service
              </span>
            )}
          </div>
        </div>

        {!locked && !missing && (
          <button onClick={callClient} title="Call the client"
            data-test="staff-call-client-voice"
            className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15">
            <Phone className="h-5 w-5" />
          </button>
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
