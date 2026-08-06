/**
 * The customer's half of a call.
 *
 * Speaks exactly the protocol VideoCallManager already speaks — a document in `calls` holding the
 * offer and answer, with each side's ICE candidates in its own subcollection — so the member's
 * phone rings through the receiver they already have mounted app-wide, with no change to it. What
 * differs is only what a customer is: no account, no contact list, and exactly one person they are
 * ever connected to, which is the member currently holding their job.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
  type Firestore,
} from "firebase/firestore";
import { Mic, MicOff, Phone, PhoneOff, Video as VideoIcon, VideoOff, Loader2 } from "lucide-react";
import { ICE_SERVERS } from "@/services/webrtcConfig";
import { alertTeam } from "@/services/orderChatGuest";
import { sendOrderChatMessage } from "@/services/orderChat";
import { CLIENT_SENDER_ID } from "@/types/orderChat";
import { startRingback, stopRingback, startRingtone, stopRingtone } from "@/utils/audio";
import DeclineWithReason, { type DeclineReason } from "@/components/order-chat/DeclineWithReason";
import { cn } from "@/lib/utils";

export type ClientCallType = "voice" | "video";
type Phase = "idle" | "outgoing" | "incoming" | "active";

interface Props {
  dbi: Firestore;
  chatId: string;
  /** The customer's stable id for this room. */
  selfId: string;
  selfName: string;
  memberUid: string;
  memberName: string;
  /** Set by the header buttons; cleared once the call has been started. */
  request: ClientCallType | null;
  onRequestHandled: () => void;
  /**
   * A call id from `?call=` — the customer tapped "… is calling you" on their phone.
   *
   * The listener below would find the same document on its own, but only if it is still ringing by
   * the time the page has booted. Naming it means the page can also say "that call has ended"
   * instead of opening to a chat that looks like nothing happened.
   */
  answerCallId?: string | null;
  onAnswerCallHandled?: () => void;
}

function secs(n: number) {
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/**
 * How long the customer's phone rings before it gives up.
 *
 * A client who rings and then closes the tab would otherwise leave a call document sitting in
 * "ringing" forever — and the member's app rings for any ringing call addressed to them, so the
 * next time they open it they get a call from a customer who left twenty minutes ago.
 */
const RING_TIMEOUT_MS = 45_000;

/** How long a call is allowed to be "disconnected" before it is actually over. */
const RECONNECT_GRACE_MS = 15_000;

export default function ClientCall({
  dbi, chatId, selfId, selfName, memberUid, memberName, request, onRequestHandled,
  answerCallId, onAnswerCallHandled,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [type, setType] = useState<ClientCallType>("voice");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [decliningReason, setDecliningReason] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const incomingRef = useRef<{ id: string; offer: RTCSessionDescriptionInit; callType: ClientCallType } | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteSetRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const cleanup = useCallback(() => {
    stopRingback();
    stopRingtone();
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    setReconnecting(false);
    callIdRef.current = null;
    incomingRef.current = null;
    pendingCandidatesRef.current = [];
    remoteSetRef.current = false;
    setPhase("idle");
    setMuted(false);
    setCameraOff(false);
    setDuration(0);
    setDecliningReason(false);
  }, []);

  const startTimer = useCallback(() => {
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const getMedia = useCallback(async (kind: ClientCallType) => {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "voice" ? { audio: true, video: false } : { audio: true, video: { facingMode: "user" } },
    );
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  const endCall = useCallback(async () => {
    const id = callIdRef.current;
    if (id) {
      try { await updateDoc(doc(dbi, "calls", id), { status: "ended", endedAt: serverTimestamp() }); }
      catch { /* the other side may have removed it already */ }
    }
    cleanup();
  }, [dbi, cleanup]);

  const createPC = useCallback((callId: string, isCaller: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

    pc.ontrack = (e) => {
      if (!e.streams[0]) return;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
    };

    const mine = isCaller ? "callerCandidates" : "receiverCandidates";
    pc.onicecandidate = (e) => {
      if (e.candidate) addDoc(collection(dbi, "calls", callId, mine), e.candidate.toJSON()).catch(() => {});
    };

    /**
     * "disconnected" is a wobble, not a hang-up.
     *
     * Ending the call on it meant a customer walking from their shop counter to the doorway lost
     * the call — ICE reports `disconnected` on any brief loss and recovers by itself within a few
     * seconds nearly every time. `failed` is the state that means it will not.
     */
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        setReconnecting(false);
        return;
      }
      if (state === "disconnected") {
        if (reconnectTimerRef.current) return;
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (pcRef.current && pcRef.current.connectionState !== "connected") endCall();
        }, RECONNECT_GRACE_MS);
        return;
      }
      if (state === "failed") endCall();
    };

    const theirs = isCaller ? "receiverCandidates" : "callerCandidates";
    const unsub = onSnapshot(collection(dbi, "calls", callId, theirs), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data() as RTCIceCandidateInit;
        if (remoteSetRef.current) pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
        else pendingCandidatesRef.current.push(data);
      });
    });
    unsubsRef.current.push(unsub);

    return pc;
  }, [dbi, endCall]);

  const flushCandidates = useCallback(() => {
    const pc = pcRef.current;
    if (!pc) return;
    const list = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    list.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
  }, []);

  // ── Calling the member ──
  const startOutgoing = useCallback(async (kind: ClientCallType) => {
    if (phaseRef.current !== "idle") return;
    if (!memberUid) { setNotice("No one is assigned to this work yet."); return; }
    try {
      setType(kind);
      setPhase("outgoing");
      startRingback();

      await getMedia(kind);

      const callRef = doc(collection(dbi, "calls"));
      callIdRef.current = callRef.id;
      const pc = createPC(callRef.id, true);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await setDoc(callRef, {
        callerId: selfId,
        callerName: selfName,
        callerAvatar: "",
        receiverId: memberUid,
        receiverName: memberName,
        receiverAvatar: "",
        callType: kind,
        status: "ringing",
        offer: { type: offer.type, sdp: offer.sdp },
        orderChatId: chatId,
        createdAt: serverTimestamp(),
      });

      // The member's phone has to ring even with the app shut; the leader and admin are told
      // without being rung, which the server decides from the room.
      alertTeam({ chatId, kind: "call", callDocId: callRef.id, callType: kind });

      const unsub = onSnapshot(callRef, (snap) => {
        if (!snap.exists()) { cleanup(); return; }
        const data = snap.data();
        if (data.status === "active" && data.answer) {
          stopRingback();
          pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer))
            .then(() => { remoteSetRef.current = true; flushCandidates(); })
            .catch(() => {});
          setPhase("active");
          startTimer();
        } else if (data.status === "declined") {
          // Their own words when they gave them — "they hung up on me" is what a bare decline says.
          setNotice(data.declineReason
            ? `${memberName || "The team"}: ${data.declineReason}`
            : `${memberName || "The team"} can't take the call right now.`);
          cleanup();
        } else if (data.status === "ended") {
          cleanup();
        }
      });
      unsubsRef.current.push(unsub);
    } catch (err) {
      console.error("[clientCall] could not start", err);
      setNotice("Your microphone or camera was blocked. Allow access and try again.");
      cleanup();
    }
  }, [dbi, chatId, selfId, selfName, memberUid, memberName, getMedia, createPC, cleanup, startTimer, flushCandidates]);

  useEffect(() => {
    if (!request) return;
    startOutgoing(request);
    onRequestHandled();
  }, [request, startOutgoing, onRequestHandled]);

  // Nobody picked up. Hang up rather than leaving the member's app to ring for it later.
  useEffect(() => {
    if (phase !== "outgoing") return;
    const timer = setTimeout(() => {
      setNotice(`${memberName || "The team"} didn't answer. Send a message instead — they'll see it.`);
      endCall();
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, memberName, endCall]);

  /**
   * Closing the tab mid-call ends the call.
   *
   * `endCall` cannot be awaited here, so the status is written with `sendBeacon`-style best effort:
   * the unload handler fires the update and the browser is allowed to leave. Without it, a customer
   * who simply closes the page leaves a live call behind them.
   */
  useEffect(() => {
    const hangUp = () => {
      const id = callIdRef.current;
      if (id) updateDoc(doc(dbi, "calls", id), { status: "ended", endedAt: serverTimestamp() }).catch(() => {});
    };
    window.addEventListener("pagehide", hangUp);
    return () => {
      window.removeEventListener("pagehide", hangUp);
      hangUp();
    };
  }, [dbi]);

  /** Present a ringing call to the customer. Shared by the live listener and the tapped push. */
  const presentIncoming = useCallback((id: string, data: Record<string, unknown>) => {
    if (phaseRef.current !== "idle") return;
    const callType = data.callType === "video" ? "video" : "voice";
    incomingRef.current = { id, offer: data.offer as RTCSessionDescriptionInit, callType };
    setType(callType);
    setPhase("incoming");
    startRingtone();
  }, []);

  // ── The member calling back ──
  useEffect(() => {
    if (!selfId) return;
    const q = query(
      collection(dbi, "calls"),
      where("receiverId", "==", selfId),
      where("status", "==", "ringing"),
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        presentIncoming(change.doc.id, change.doc.data());
      });
    }, () => { /* rules or connection — the client simply gets no incoming call */ });
    return unsub;
  }, [dbi, selfId, presentIncoming]);

  /**
   * The customer tapped "… is calling you" on their phone.
   *
   * The listener above usually finds the same document a moment later, but only if the call is
   * still ringing once the page has finished booting — and booting a cold page is exactly the slow
   * case. Fetching it directly closes that gap, and gives the customer a straight answer when they
   * were too late instead of a chat that looks like nothing happened.
   */
  useEffect(() => {
    if (!answerCallId) return;
    let alive = true;
    getDoc(doc(dbi, "calls", answerCallId))
      .then((snap) => {
        if (!alive) return;
        const data = snap.exists() ? snap.data() : null;
        if (!data) return;
        if (data.status === "ringing" && data.receiverId === selfId) {
          presentIncoming(answerCallId, data);
        } else if (data.status !== "active") {
          setNotice(`You missed a call from ${data.callerName || memberName || "the team"}. Send a message and they'll call you back.`);
        }
      })
      .catch(() => { /* the call document may already be gone */ })
      .finally(() => { if (alive) onAnswerCallHandled?.(); });
    return () => { alive = false; };
  }, [answerCallId, dbi, selfId, memberName, presentIncoming, onAnswerCallHandled]);

  const accept = useCallback(async () => {
    const incoming = incomingRef.current;
    if (!incoming) return;
    try {
      stopRingtone();
      setPhase("active");
      await getMedia(incoming.callType);
      callIdRef.current = incoming.id;
      const pc = createPC(incoming.id, false);

      await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      remoteSetRef.current = true;
      flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(doc(dbi, "calls", incoming.id), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: "active",
      });
      startTimer();

      const unsub = onSnapshot(doc(dbi, "calls", incoming.id), (snap) => {
        if (!snap.exists() || snap.data()?.status === "ended") cleanup();
      });
      unsubsRef.current.push(unsub);
    } catch (err) {
      console.error("[clientCall] could not accept", err);
      setNotice("Your microphone or camera was blocked. Allow access and try again.");
      cleanup();
    }
  }, [dbi, getMedia, createPC, flushCandidates, startTimer, cleanup]);

  /**
   * Turn the call down, and tell the member why.
   *
   * The reason goes on the call document AND into the conversation. On the document it is what the
   * member's screen shows the instant the ringing stops; in the conversation it is what is still
   * there tomorrow, which is the half that matters — a member who was in a client meeting when the
   * customer rang comes back to a line saying so, rather than to a missed call.
   */
  const decline = useCallback(async (reason?: string) => {
    const incoming = incomingRef.current;
    stopRingtone();
    if (incoming) {
      try {
        await updateDoc(doc(dbi, "calls", incoming.id), {
          status: "declined",
          ...(reason ? { declineReason: reason } : {}),
        });
      } catch { /* best effort */ }
      if (reason) {
        try {
          await sendOrderChatMessage(dbi, {
            chatId,
            senderId: CLIENT_SENDER_ID,
            senderName: selfName,
            text: reason,
          });
          alertTeam({ chatId, kind: "message", preview: reason });
        } catch { /* the decline itself already went through */ }
      }
    }
    cleanup();
  }, [dbi, chatId, selfName, cleanup]);

  // Someone cancelling before it is answered should not leave a phone ringing at the other end.
  useEffect(() => {
    if (phase !== "incoming" || !incomingRef.current) return;
    const unsub = onSnapshot(doc(dbi, "calls", incomingRef.current.id), (snap) => {
      const status = snap.exists() ? snap.data()?.status : "ended";
      if (status === "ended" || status === "declined") cleanup();
    });
    return unsub;
  }, [phase, dbi, cleanup]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  };

  /** Whether the member is reachable at all — nothing rings a customer with the page closed. */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (phase === "idle") {
    return notice ? (
      <div
        data-test="client-call-notice"
        className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-slate-900/90 px-4 py-2.5 text-center text-xs leading-snug text-white shadow-lg"
      >
        {notice}
      </div>
    ) : null;
  }

  const showVideo = type === "video";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Remote */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showVideo && phase === "active" ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-3 px-8 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold">
              {(memberName || "T").charAt(0).toUpperCase()}
            </div>
            <p className="text-lg font-semibold">{memberName || "Dream Team"}</p>
            <p className="text-sm text-white/60">
              {phase === "outgoing"
                ? "Calling…"
                : phase === "incoming"
                  ? `Incoming ${type} call`
                  : reconnecting ? "Reconnecting…" : secs(duration)}
            </p>
            {phase === "outgoing" && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
          </div>
        )}

        {showVideo && (
          <video ref={localVideoRef} autoPlay playsInline muted
            className="absolute bottom-4 right-4 h-36 w-24 rounded-xl border border-white/20 object-cover shadow-lg" />
        )}

        {phase === "active" && showVideo && (
          <div className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs">
            {reconnecting ? "Reconnecting…" : secs(duration)}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-8">
        {phase === "incoming" ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-10">
              <button onClick={() => decline()} data-test="client-call-decline"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 transition-transform active:scale-95"
                aria-label="Decline">
                <PhoneOff className="h-7 w-7" />
              </button>
              <button onClick={accept} data-test="client-call-accept"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 transition-transform active:scale-95"
                aria-label="Accept">
                <Phone className="h-7 w-7" />
              </button>
            </div>
            {/* One tap turns the call down AND says why — see DeclineWithReason for why that
                matters more than the red button next to it. */}
            <button onClick={() => setDecliningReason(true)} data-test="client-call-decline-reason"
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/20">
              Can't talk — reply with a reason
            </button>
          </div>
        ) : (
          <>
            <button onClick={toggleMute}
              className={cn("flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                muted ? "bg-white text-slate-900" : "bg-white/15")}
              aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            {showVideo && (
              <button onClick={toggleCamera}
                className={cn("flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                  cameraOff ? "bg-white text-slate-900" : "bg-white/15")}
                aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}>
                {cameraOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
              </button>
            )}
            <button onClick={endCall}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 transition-transform active:scale-95"
              aria-label="End call">
              <PhoneOff className="h-7 w-7" />
            </button>
          </>
        )}
      </div>

      {decliningReason && (
        <DeclineWithReason
          side="client"
          onCancel={() => setDecliningReason(false)}
          onDecline={(r: DeclineReason) => { setDecliningReason(false); decline(r.message); }}
        />
      )}
    </div>
  );
}
