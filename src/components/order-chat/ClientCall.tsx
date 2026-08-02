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
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
  type Firestore,
} from "firebase/firestore";
import { Mic, MicOff, Phone, PhoneOff, Video as VideoIcon, VideoOff, Loader2 } from "lucide-react";
import { ICE_SERVERS } from "@/services/webrtcConfig";
import { alertTeam } from "@/services/orderChatGuest";
import { startRingback, stopRingback, startRingtone, stopRingtone } from "@/utils/audio";
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

export default function ClientCall({
  dbi, chatId, selfId, selfName, memberUid, memberName, request, onRequestHandled,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [type, setType] = useState<ClientCallType>("voice");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

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
    callIdRef.current = null;
    incomingRef.current = null;
    pendingCandidatesRef.current = [];
    remoteSetRef.current = false;
    setPhase("idle");
    setMuted(false);
    setCameraOff(false);
    setDuration(0);
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

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") endCall();
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
          setNotice(`${memberName || "The team"} can't take the call right now.`);
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
        if (change.type !== "added" || phaseRef.current !== "idle") return;
        const data = change.doc.data();
        incomingRef.current = {
          id: change.doc.id,
          offer: data.offer as RTCSessionDescriptionInit,
          callType: data.callType === "video" ? "video" : "voice",
        };
        setType(data.callType === "video" ? "video" : "voice");
        setPhase("incoming");
        startRingtone();
      });
    }, () => { /* rules or connection — the client simply gets no incoming call */ });
    return unsub;
  }, [dbi, selfId]);

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

  const decline = useCallback(async () => {
    const incoming = incomingRef.current;
    if (incoming) {
      try { await updateDoc(doc(dbi, "calls", incoming.id), { status: "declined" }); } catch { /* best effort */ }
    }
    cleanup();
  }, [dbi, cleanup]);

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
      <div className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-foreground/90 px-4 py-2 text-center text-xs text-background shadow-lg">
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
              {phase === "outgoing" ? "Calling…" : phase === "incoming" ? `Incoming ${type} call` : secs(duration)}
            </p>
            {phase === "outgoing" && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
          </div>
        )}

        {showVideo && (
          <video ref={localVideoRef} autoPlay playsInline muted
            className="absolute bottom-4 right-4 h-36 w-24 rounded-xl border border-white/20 object-cover shadow-lg" />
        )}

        {phase === "active" && showVideo && (
          <div className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs">{secs(duration)}</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-8">
        {phase === "incoming" ? (
          <>
            <button onClick={decline}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 transition-transform active:scale-95"
              aria-label="Decline">
              <PhoneOff className="h-7 w-7" />
            </button>
            <button onClick={accept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 transition-transform active:scale-95"
              aria-label="Accept">
              <Phone className="h-7 w-7" />
            </button>
          </>
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
    </div>
  );
}
