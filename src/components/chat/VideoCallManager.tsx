import { useEffect, useRef, useState, useCallback } from "react";
import {
  collection, doc, addDoc, setDoc, updateDoc, onSnapshot, query, where, serverTimestamp, deleteDoc, getDocs,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import type { CallType } from "@/store/callStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Phone, PhoneOff, Mic, MicOff, VideoIcon, VideoOff, Monitor, MonitorOff, Loader2,
} from "lucide-react";
import { startRingtone, stopRingtone, startRingback, stopRingback } from "@/utils/audio";
import { sendNotification } from "@/services/notifications";
import { getChatRoute } from "@/utils/chatHelpers";
import type { VideoCallDoc } from "@/types";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
  ],
};

type CallPhase = "idle" | "outgoing" | "incoming" | "active";

export default function VideoCallManager() {
  const user = useAuthStore((s) => s.user);
  const { pendingCall, clearPendingCall } = useCallStore();

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callType, setCallType] = useState<CallType>("video");
  const [peerName, setPeerName] = useState("");
  const [peerAvatar, setPeerAvatar] = useState<string | undefined>();
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const callDocIdRef = useRef<string | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingDocRef = useRef<VideoCallDoc | null>(null);
  const callGenRef = useRef(0); // generation counter — incremented on every cleanup to cancel stale async work

  // ── Cleanup helper ──
  const cleanup = useCallback(() => {
    callGenRef.current += 1; // invalidate any in-progress async call setup
    stopRingtone();
    stopRingback();
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    callDocIdRef.current = null;
    incomingDocRef.current = null;
    setPhase("idle");
    setCallType("video");
    setPeerName("");
    setPeerAvatar(undefined);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
    setCallDuration(0);
  }, []);

  // ── Start call timer ──
  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }, []);

  // ── Get user media ──
  const getMedia = useCallback(async (type: CallType = "video") => {
    const constraints = type === "voice" ? { video: false, audio: true } : { video: true, audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  // ── Create peer connection ──
  const createPC = useCallback(
    (callId: string, isCaller: boolean) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Add local tracks
      localStreamRef.current?.getTracks().forEach((t) => {
        pc.addTrack(t, localStreamRef.current!);
      });

      // Remote tracks
      pc.ontrack = (e) => {
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      // ICE candidates
      const candidateCol = isCaller ? "callerCandidates" : "receiverCandidates";
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          addDoc(collection(db, "calls", callId, candidateCol), e.candidate.toJSON());
        }
      };

      // Connection state
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          endCall();
        }
      };

      // Listen for remote ICE candidates
      const remoteCol = isCaller ? "receiverCandidates" : "callerCandidates";
      const unsub = onSnapshot(collection(db, "calls", callId, remoteCol), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
          }
        });
      });
      unsubsRef.current.push(unsub);

      return pc;
    },
    [],
  );

  // ── START OUTGOING CALL ──
  const startOutgoingCall = useCallback(
    async (peerId: string, name: string, avatar?: string, type: CallType = "video") => {
      if (!user || phase !== "idle") return;
      try {
        setPeerName(name);
        setPeerAvatar(avatar);
        setCallType(type);
        setPhase("outgoing");
        startRingback();

        const gen = callGenRef.current;
        const stream = await getMedia(type);

        // If user cancelled while we were waiting for camera permission, bail out
        if (gen !== callGenRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const callDocRef = doc(collection(db, "calls"));
        const callId = callDocRef.id;
        callDocIdRef.current = callId;

        const pc = createPC(callId, true);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await setDoc(callDocRef, {
          callerId: user.uid,
          callerName: user.name,
          callerAvatar: user.avatar ?? "",
          receiverId: peerId,
          receiverName: name,
          receiverAvatar: avatar ?? "",
          callType: type,
          status: "ringing",
          offer: { type: offer.type, sdp: offer.sdp },
          createdAt: serverTimestamp(),
        });

        // Push notification so receiver sees it even with app in background
        sendNotification({
          userId: peerId,
          type: type === "voice" ? "voice_call" : "video_call",
          title: `Incoming ${type} call`,
          message: `${user.name} is calling you`,
          link: getChatRoute(user.role),
        });

        // Listen for answer / status changes
        const unsub = onSnapshot(callDocRef, (snap) => {
          if (!snap.exists()) { cleanup(); return; }
          const data = snap.data();
          if (data.status === "active" && data.answer) {
            stopRingback();
            pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
            setPhase("active");
            startTimer();
          } else if (data.status === "declined" || data.status === "ended") {
            cleanup();
          }
        });
        unsubsRef.current.push(unsub);
      } catch (err) {
        console.error("Failed to start call:", err);
        cleanup();
      }
    },
    [user, phase, getMedia, createPC, cleanup, startTimer],
  );

  // ── ACCEPT INCOMING CALL ──
  const acceptCall = useCallback(async () => {
    const callDoc = incomingDocRef.current;
    if (!callDoc || !user) return;
    try {
      stopRingtone();
      setPhase("active");

      const type = callDoc.callType ?? "video";
      setCallType(type);
      const stream = await getMedia(type);
      const callId = callDoc.id;
      callDocIdRef.current = callId;

      const pc = createPC(callId, false);

      await pc.setRemoteDescription(new RTCSessionDescription(callDoc.offer as RTCSessionDescriptionInit));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(doc(db, "calls", callId), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: "active",
      });

      startTimer();

      // Listen for status changes
      const unsub = onSnapshot(doc(db, "calls", callId), (snap) => {
        if (!snap.exists()) { cleanup(); return; }
        const data = snap.data();
        if (data.status === "ended") cleanup();
      });
      unsubsRef.current.push(unsub);
    } catch (err) {
      console.error("Failed to accept call:", err);
      cleanup();
    }
  }, [user, getMedia, createPC, cleanup, startTimer]);

  // ── DECLINE INCOMING CALL ──
  const declineCall = useCallback(async () => {
    const callDoc = incomingDocRef.current;
    if (!callDoc) { cleanup(); return; }
    try {
      await updateDoc(doc(db, "calls", callDoc.id), { status: "declined" });
    } catch { /* best effort */ }
    cleanup();
  }, [cleanup]);

  // ── END ACTIVE CALL / CANCEL OUTGOING ──
  const endCall = useCallback(async () => {
    const callId = callDocIdRef.current;
    if (callId) {
      try {
        await updateDoc(doc(db, "calls", callId), {
          status: "ended",
          endedAt: serverTimestamp(),
        });
      } catch { /* best effort */ }
    }
    cleanup();
  }, [cleanup]);

  // ── TOGGLE MUTE ──
  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  // ── TOGGLE CAMERA ──
  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOff(!videoTrack.enabled);
    }
  }, []);

  // ── TOGGLE SCREEN SHARE ──
  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share, switch back to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(cameraTrack);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack);
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
          if (cameraTrack) sender?.replaceTrack(cameraTrack);
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };
      } catch {
        // User cancelled screen share picker
      }
    }
  }, [isScreenSharing]);

  // ── Listen for incoming calls ──
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "calls"),
      where("receiverId", "==", user.uid),
      where("status", "==", "ringing"),
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added" && phase === "idle") {
          const data = { id: change.doc.id, ...change.doc.data() } as VideoCallDoc;
          incomingDocRef.current = data;
          setPeerName(data.callerName);
          setPeerAvatar(data.callerAvatar);
          setCallType(data.callType ?? "video");
          setPhase("incoming");
          startRingtone();
        }
      });
    });
    return () => unsub();
  }, [user?.uid, phase]);

  // ── React to pendingCall from callStore ──
  useEffect(() => {
    if (pendingCall && phase === "idle") {
      startOutgoingCall(pendingCall.peerId, pendingCall.peerName, pendingCall.peerAvatar, pendingCall.callType);
      clearPendingCall();
    } else if (pendingCall) {
      clearPendingCall();
    }
  }, [pendingCall, phase, startOutgoingCall, clearPendingCall]);

  // ── Cleanup on unmount ──
  useEffect(() => () => { cleanup(); }, [cleanup]);

  // ── Watch for caller cancellation when we have an incoming call ──
  useEffect(() => {
    if (phase !== "incoming") return;
    const callDoc = incomingDocRef.current;
    if (!callDoc) return;

    const unsub = onSnapshot(doc(db, "calls", callDoc.id), (snap) => {
      if (!snap.exists()) { cleanup(); return; }
      const data = snap.data();
      if (data.status === "ended" || data.status === "declined") {
        cleanup();
      }
    });
    return () => unsub();
  }, [phase, cleanup]);

  // ── Auto-decline stale ringing calls after 45s ──
  useEffect(() => {
    if (phase === "incoming") {
      const t = setTimeout(() => { declineCall(); }, 45000);
      return () => clearTimeout(t);
    }
    // Auto-cancel outgoing calls after 45s if not answered
    if (phase === "outgoing") {
      const t = setTimeout(() => { endCall(); }, 45000);
      return () => clearTimeout(t);
    }
  }, [phase, declineCall, endCall]);

  // ── Render nothing when idle ──
  if (phase === "idle") return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const initials = peerName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // ── INCOMING CALL SCREEN ──
  if (phase === "incoming") {
    return (
      <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center animate-in fade-in duration-200">
        <div className="bg-card rounded-2xl p-8 text-center space-y-6 shadow-2xl max-w-sm w-full mx-4">
          <div className="relative w-20 h-20 mx-auto">
            <Avatar className="w-20 h-20">
              <AvatarImage src={peerAvatar} />
              <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{peerName}</h2>
            <p className="text-sm text-muted-foreground mt-1">Incoming {callType} call…</p>
          </div>
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={declineCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              onClick={acceptCall}
              className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-colors shadow-lg"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── OUTGOING / CALLING SCREEN ──
  if (phase === "outgoing") {
    return (
      <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-in fade-in duration-200">
        <div className="text-center space-y-6 text-white">
          <Avatar className="w-24 h-24 mx-auto">
            <AvatarImage src={peerAvatar} />
            <AvatarFallback className="text-2xl font-bold bg-white/10">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold">{peerName}</h2>
            <p className="text-sm text-white/60 mt-1 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Calling…
            </p>
          </div>
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg mx-auto"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE CALL SCREEN ──
  const isVoice = callType === "voice";

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-200">
      {/* Main area */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {isVoice ? (
          /* Voice call: show avatar + timer centered */
          <div className="w-full h-full flex flex-col items-center justify-center text-white gap-6 bg-gradient-to-b from-gray-900 to-black">
            <Avatar className="w-28 h-28">
              <AvatarImage src={peerAvatar} />
              <AvatarFallback className="text-3xl font-bold bg-white/10">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h2 className="text-xl font-semibold">{peerName}</h2>
              <p className="text-sm text-white/60 mt-1">{formatTime(callDuration)}</p>
            </div>
          </div>
        ) : (
          /* Video call: remote + local PiP */
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Remote name + timer overlay */}
            <div className="absolute top-4 left-4 text-white bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
              <p className="font-semibold text-sm">{peerName}</p>
              <p className="text-xs text-white/70">{formatTime(callDuration)}</p>
            </div>
            {/* Local video PiP */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 w-36 h-28 md:w-48 md:h-36 rounded-xl border-2 border-white/20 object-cover shadow-xl bg-black z-10"
            />
          </>
        )}
      </div>

      {/* Hidden video elements for voice calls (keep refs working) */}
      {isVoice && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
          <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
        </>
      )}

      {/* Controls */}
      <div className="bg-gray-900/80 backdrop-blur-sm px-4 py-4 flex items-center justify-center gap-4">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? "bg-red-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        {!isVoice && (
          <>
            <button
              onClick={toggleCamera}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isCameraOff ? "bg-red-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
              }`}
              title={isCameraOff ? "Turn camera on" : "Turn camera off"}
            >
              {isCameraOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleScreenShare}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isScreenSharing ? "bg-blue-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
              }`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>
          </>
        )}
        <button
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg"
          title="End call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
