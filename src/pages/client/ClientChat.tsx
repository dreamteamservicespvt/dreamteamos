/**
 * What the customer sees: one page, one conversation, no account, nothing to type first.
 *
 * This is the only screen in the app built for someone who has never seen the app. Everything that
 * would normally frame a page — the sidebar, the role switcher, the notification bell — is absent
 * on purpose. A client opens a link from WhatsApp on a phone and is talking to the person building
 * their ad. Anything more than that is something else to explain.
 *
 * ── The one thing it does ask for ─────────────────────────────────────────────────────────────
 * Notification permission, before the conversation opens. It is the only gate left, and it is here
 * because of what this page is: a customer sends a photo and goes back to running their shop. The
 * reply arrives an hour later in a tab they closed. Without a notification there is no reply —
 * there is a message in a room nobody reopens, and the customer concludes nobody answered. The
 * whole feature turns on the team being able to reach them, so being reachable is the price of
 * entry rather than a banner to dismiss.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BellRing, Loader2, Lock, MessageSquare, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import OrderChatPanel, { OrderChatCallButtons } from "@/components/order-chat/OrderChatPanel";
import ClientCall, { type ClientCallType } from "@/components/order-chat/ClientCall";
import InstallChatButton from "@/components/order-chat/InstallChatButton";
import { useOrderChat } from "@/hooks/useOrderChat";
import { useNotificationTap } from "@/hooks/useNotificationTap";
import {
  guestDb, guestUid, hasGuestSession, openOrderChat, alertTeam, enableGuestPush, pushState,
  type PushState,
} from "@/services/orderChatGuest";
import { CLIENT_SENDER_ID } from "@/types/orderChat";
import { COMPANY } from "@/utils/company";

/** The chat this browser was last in, so the installed app knows where to reopen. */
const LAST_CHAT_KEY = "dtsLastOrderChat";

/**
 * Dress the document as the customer's chat rather than as the staff console.
 *
 * Three things, all of them document-level and none of them expressible in a component:
 *
 * 1. **Light.** The app ships dark because it is a tool people stare at all day. This page is
 *    something a customer opens twice, and every messaging app they have ever used is light. A
 *    dark screen from a company they have paid money to reads as broken, not as styled.
 * 2. **The chat's own manifest.** Installing from here must produce "My Project" opening at the
 *    conversation, not "DTS Manager" opening at a staff login they can never get past.
 * 3. **The address bar colour**, which on Android is the top inch of the screen.
 *
 * All three are restored on unmount, because the staff app and this page share one document in
 * dev and one bundle in production.
 */
function useCustomerChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.style.colorScheme = "light";

    /**
     * Hold it light against the app's own theme provider.
     *
     * React runs a child's effects before its parents', so this fires first and `ThemeProvider`
     * puts `dark` straight back a moment later — the page came up in the staff palette every time.
     * Watching the attribute is what makes the decision stick, and it also covers the provider
     * reacting to a system-theme change while a customer is mid-conversation.
     */
    const observer = new MutationObserver(() => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifest = manifest?.getAttribute("href") ?? null;
    manifest?.setAttribute("href", "/chat.webmanifest");

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeColor?.getAttribute("content") ?? null;
    themeColor?.setAttribute("content", "#008069");

    return () => {
      observer.disconnect();
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = "";
      if (previousManifest) manifest?.setAttribute("href", previousManifest);
      if (previousThemeColor) themeColor?.setAttribute("content", previousThemeColor);
    };
  }, []);
}

export default function ClientChat() {
  const { chatId = "" } = useParams();
  const [phase, setPhase] = useState<"opening" | "gate" | "ready" | "gone">("opening");
  const [permission, setPermission] = useState<PushState>(() => pushState());
  useCustomerChrome();

  /**
   * Signing in happens on arrival, with nothing asked of the customer.
   *
   * `hasGuestSession` first so a refresh does not spend a round trip re-minting a token this
   * browser already holds.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      const already = await hasGuestSession(chatId);
      if (!alive) return;
      if (!already) {
        const result = await openOrderChat(chatId);
        if (!alive) return;
        if (!result.ok && result.error === "not_found") { setPhase("gone"); return; }
      }
      try { localStorage.setItem(LAST_CHAT_KEY, chatId); } catch { /* private browsing */ }
      const state = pushState();
      setPermission(state);
      /**
       * Already allowed is not already registered.
       *
       * Permission belongs to the browser; the registration belongs to the room. A customer with
       * two orders granted permission on the first one, and without this the second conversation
       * would never be able to reach them — nothing would ask, because nothing needed asking.
       * Done in the background: they have already said yes once and should not wait for it again.
       */
      if (state === "granted") void enableGuestPush(chatId);
      // Nothing to ask on a browser that cannot do it at all — an iPhone on Safari outside the
      // home screen has no push, and refusing to show that customer their chat helps nobody.
      setPhase(state === "granted" || state === "unsupported" ? "ready" : "gate");
    })();
    return () => { alive = false; };
  }, [chatId]);

  if (phase === "opening") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f0f2f5]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (phase === "gone") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f0f2f5] px-8 text-center">
        <Lock className="mb-3 h-8 w-8 text-slate-400" />
        <p className="text-base font-semibold text-slate-800">This chat is no longer available</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Please contact the team for an updated link.
        </p>
      </div>
    );
  }

  if (phase === "gate") {
    return (
      <NotificationGate
        permission={permission}
        onGranted={() => setPhase("ready")}
        onResult={setPermission}
        chatId={chatId}
      />
    );
  }

  return <Conversation chatId={chatId} />;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The one screen between the link and the conversation.
 *
 * Written for someone who has just been asked for a permission by a website and is deciding
 * whether this is a scam: it says what will be sent, who from, and that it is only about their own
 * order. "Allow notifications" as a bare instruction gets refused.
 */
function NotificationGate({ permission, onGranted, onResult, chatId }: {
  permission: PushState;
  onGranted: () => void;
  onResult: (p: PushState) => void;
  chatId: string;
}) {
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setBusy(true);
    const result = await enableGuestPush(chatId);
    setBusy(false);
    onResult(result);
    if (result === "granted" || result === "unsupported") onGranted();
  }, [chatId, onGranted, onResult]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f0f2f5] px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <BellRing className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Turn on notifications to open your chat</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          This chat only works if we can reach you. Please allow notifications — it takes one tap.
        </p>

        {/* Said as the two things that actually happen, not as "stay updated". A customer deciding
            whether to trust a permission prompt needs to know what it is FOR. */}
        <ul className="mt-4 space-y-2 text-left text-[13px] text-slate-600">
          <li className="flex gap-2"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span><b className="text-slate-800">Messages</b> — you will know the moment our team
            replies or sends your video, even with this page closed.</span></li>
          <li className="flex gap-2"><PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span><b className="text-slate-800">Calls</b> — your phone rings when we call you about
            your order. Without this, you will simply miss it.</span></li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Only about your own order. No marketing, and no phone number needed.</li>
        </ul>

        {permission === "denied" ? (
          /**
           * No way past this, on purpose.
           *
           * There used to be a "Continue without notifications" link, and taking it produced the
           * exact failure this screen exists to prevent: a customer sitting in a chat that cannot
           * reach them, a team replying into silence, and a missed call neither side can explain.
           * Letting them in is not the kind thing to do — it is the thing that wastes their week.
           * The instructions are specific enough to follow, and the button re-checks rather than
           * making them find the link again.
           */
          <div className="mt-5 rounded-xl bg-amber-50 px-3 py-3 text-left">
            <p className="text-[13px] font-semibold text-amber-800">Notifications are blocked</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-amber-700">
              Your browser has blocked them for this site, so we cannot ask again from here. Tap the
              lock icon (or ⋮ → Site settings) next to the address bar, allow Notifications, then
              come back and press the button below.
            </p>
            <button
              onClick={() => { const now = pushState(); onResult(now); if (now === "granted") onGranted(); }}
              data-test="recheck-notifications"
              className="mt-3 w-full rounded-xl bg-amber-600 py-2.5 text-[13px] font-semibold text-white"
            >
              I have allowed it — open my chat
            </button>
          </div>
        ) : (
          <button
            onClick={ask}
            disabled={busy}
            data-test="enable-notifications"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            {busy ? "Just a moment…" : "Allow and open my chat"}
          </button>
        )}

        <p className="mt-4 text-[11px] text-slate-400">{COMPANY.name}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function Conversation({ chatId }: { chatId: string }) {
  const dbi = guestDb();
  const [params, setParams] = useSearchParams();
  // Tapping "… is calling you" focuses this tab; this is what turns that into an answer button.
  useNotificationTap(dbi);
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

  const identity = useMemo(
    () => ({ senderId: CLIENT_SENDER_ID, senderName: sendAs, isClient: true }),
    [sendAs],
  );

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

  /** A tapped "… is calling you" notification lands here. Answering it is ClientCall's job. */
  const answerCallId = params.get("call");
  const clearCallParam = useCallback(() => {
    if (!params.get("call")) return;
    const next = new URLSearchParams(params);
    next.delete("call");
    setParams(next, { replace: true });
  }, [params, setParams]);

  if (missing) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f0f2f5] px-8 text-center">
        <Lock className="mb-3 h-8 w-8 text-slate-400" />
        <p className="text-base font-semibold text-slate-800">This chat is no longer available</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Please contact the team for an updated link.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col">
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
          <div className="flex items-center gap-3 bg-[#008069] px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] text-white">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              {(room?.businessName || "D").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {room?.businessName || "Your project"}
              </p>
              {/*
                The company, never the person.

                Naming the member here turned a company into one individual: the customer starts
                asking for "Aasritha" by name, and the day that job moves to somebody else they
                believe they have been dropped. It is also unfair to the member, whose name ends up
                on a stranger's phone. They are talking to the team.
              */}
              <p className="truncate text-[11.5px] text-white/75">
                {locked ? "Delivered · view only" : COMPANY.name}
                {room?.uniqueId ? ` · ${room.uniqueId}` : ""}
              </p>
            </div>
            <InstallChatButton />
            {!locked && room?.memberUid && (
              <OrderChatCallButtons onVoice={() => setCallRequest("voice")} />
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
          // The company, not the person — see the header above for why the customer never learns
          // which member is on the other end of the call.
          memberName={COMPANY.name}
          request={callRequest}
          onRequestHandled={() => setCallRequest(null)}
          answerCallId={answerCallId}
          onAnswerCallHandled={clearCallParam}
        />
      )}
    </div>
  );
}

/**
 * Where an installed chat app opens.
 *
 * The manifest's `start_url` cannot carry a chat id — it is one static file for every customer — so
 * it points here, and here remembers which conversation this browser was last in. A customer with
 * the app on their home screen taps it and lands in their chat; anyone else gets told plainly to
 * use the link they were sent rather than a dead end.
 */
export function ClientChatResume() {
  const [last, setLast] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(LAST_CHAT_KEY); } catch { /* private browsing */ }
    if (id) { window.location.replace(`/c/${id}`); return; }
    setLast(null);
  }, []);

  if (last === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f0f2f5]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f0f2f5] px-8 text-center">
      <Sparkles className="mb-3 h-8 w-8 text-emerald-600" />
      <p className="text-base font-semibold text-slate-800">Open your chat from your link</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Tap the link {COMPANY.name} sent you and this app will open straight into your project chat
        from then on.
      </p>
    </div>
  );
}
