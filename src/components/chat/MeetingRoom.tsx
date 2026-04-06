import { useEffect, useRef, useState, useCallback } from "react";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, addDoc,
  serverTimestamp, arrayUnion, arrayRemove, getDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Copy, Check, Users, Maximize2, Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import type { MeetingParticipant } from "@/types";
import { isNative } from "@/utils/platform";
import { KeepAwake } from "@capacitor-community/keep-awake";

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

interface Props {
  meetingId: string;
  meetingCode: string;
  onLeave: () => void;
}

interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  name: string;
  avatar?: string;
}

export default function MeetingRoom({ meetingId, meetingCode, onLeave }: Props) {
  const user = useAuthStore((s) => s.user);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState(0);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [showParticipants, setShowParticipants] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, PeerState>>({});
  const unsubsRef = useRef<(() => void)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedRef = useRef(false);
  const participantsRef = useRef<MeetingParticipant[]>([]);
  const pendingCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  participantsRef.current = participants;

  // ── Format duration ──
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Copy meeting code ──
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    toast.success("Meeting code copied!");
    setTimeout(() => setCopied(false), 2000);
  }, [meetingCode]);

  // ── Get local media ──
  const getLocalMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  // ── Create peer connection for a specific remote user ──
  const createPeerConnection = useCallback((remoteUid: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    localStreamRef.current?.getTracks().forEach((t) => {
      pc.addTrack(t, localStreamRef.current!);
    });

    // Remote stream
    const remoteStream = new MediaStream();
    pc.ontrack = (e) => {
      remoteStream.addTrack(e.track);
      setPeers((prev) => {
        const existing = prev[remoteUid];
        if (existing) return { ...prev, [remoteUid]: { ...existing, stream: remoteStream } };
        return prev;
      });
    };

    // ICE candidates → Firestore signal
    pc.onicecandidate = (e) => {
      if (e.candidate && user) {
        addDoc(collection(db, "meetings", meetingId, "signals"), {
          from: user.uid,
          to: remoteUid,
          type: "candidate",
          candidate: e.candidate.toJSON(),
          createdAt: serverTimestamp(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        // Clean up this peer
        pc.close();
        setPeers((prev) => {
          const next = { ...prev };
          delete next[remoteUid];
          return next;
        });
        delete peersRef.current[remoteUid];
      }
    };

    return { pc, remoteStream };
  }, [user, meetingId]);

  // ── Send offer to a remote participant ──
  const sendOffer = useCallback(async (remoteUid: string, remoteName: string, remoteAvatar?: string) => {
    if (!user || peersRef.current[remoteUid]) return;

    const { pc, remoteStream } = createPeerConnection(remoteUid);
    const peerState: PeerState = { pc, stream: remoteStream, name: remoteName, avatar: remoteAvatar };
    peersRef.current[remoteUid] = peerState;
    setPeers((prev) => ({ ...prev, [remoteUid]: peerState }));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await addDoc(collection(db, "meetings", meetingId, "signals"), {
      from: user.uid,
      to: remoteUid,
      type: "offer",
      sdp: offer.sdp,
      createdAt: serverTimestamp(),
    });
  }, [user, meetingId, createPeerConnection]);

  // ── Handle incoming offer ──
  const handleOffer = useCallback(async (fromUid: string, sdp: string, fromName: string, fromAvatar?: string) => {
    if (!user) return;

    // Close existing connection if any
    if (peersRef.current[fromUid]) {
      peersRef.current[fromUid].pc.close();
    }

    const { pc, remoteStream } = createPeerConnection(fromUid);
    const peerState: PeerState = { pc, stream: remoteStream, name: fromName, avatar: fromAvatar };
    peersRef.current[fromUid] = peerState;
    setPeers((prev) => ({ ...prev, [fromUid]: peerState }));

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
    // Flush buffered ICE candidates
    const buffered = pendingCandidatesRef.current[fromUid] ?? [];
    delete pendingCandidatesRef.current[fromUid];
    for (const c of buffered) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await addDoc(collection(db, "meetings", meetingId, "signals"), {
      from: user.uid,
      to: fromUid,
      type: "answer",
      sdp: answer.sdp,
      createdAt: serverTimestamp(),
    });
  }, [user, meetingId, createPeerConnection]);

  // ── Handle incoming answer ──
  const handleAnswer = useCallback(async (fromUid: string, sdp: string) => {
    const peer = peersRef.current[fromUid];
    if (!peer) return;
    if (peer.pc.signalingState === "stable") return;
    await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    // Flush buffered ICE candidates
    const buffered = pendingCandidatesRef.current[fromUid] ?? [];
    delete pendingCandidatesRef.current[fromUid];
    for (const c of buffered) { try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
  }, []);

  // ── Handle ICE candidate ──
  const handleCandidate = useCallback(async (fromUid: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current[fromUid];
    if (!peer) {
      if (!pendingCandidatesRef.current[fromUid]) pendingCandidatesRef.current[fromUid] = [];
      pendingCandidatesRef.current[fromUid].push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch { /* ignore */ }
  }, []);

  // ── Join meeting ──
  useEffect(() => {
    if (!user || joinedRef.current) return;
    joinedRef.current = true;
    // Keep screen awake during meeting on native
    if (isNative()) KeepAwake.keepAwake().catch(() => {});

    const init = async () => {
      try {
        await getLocalMedia();
      } catch (err) {
        console.error("Failed to get media:", err);
        toast.error("Could not access camera/microphone");
        onLeave();
        return;
      }

      // Add self as participant
      const partRef = doc(db, "meetings", meetingId, "participants", user.uid);
      await setDoc(partRef, {
        uid: user.uid,
        name: user.name,
        avatar: user.avatar ?? "",
        joinedAt: serverTimestamp(),
      });

      // Add uid to meeting participantUids array
      await updateDoc(doc(db, "meetings", meetingId), {
        participantUids: arrayUnion(user.uid),
      });

      // Start timer
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      // Listen for participants
      const unsubParticipants = onSnapshot(
        collection(db, "meetings", meetingId, "participants"),
        (snap) => {
          const parts = snap.docs.map((d) => d.data() as MeetingParticipant);
          setParticipants(parts);

          // For each new participant that isn't us, send an offer if we don't have a connection
          parts.forEach((p) => {
            if (p.uid !== user.uid && !peersRef.current[p.uid]) {
              // Use deterministic rule: lower uid sends offer
              if (user.uid < p.uid) {
                sendOffer(p.uid, p.name, p.avatar).catch(() => {});
              }
            }
          });
        },
      );
      unsubsRef.current.push(unsubParticipants);

      // Listen for signals addressed to us
      const unsubSignals = onSnapshot(
        collection(db, "meetings", meetingId, "signals"),
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type !== "added") return;
            const sig = change.doc.data();
            if (sig.to !== user.uid) return;

            // Find sender info from participants
            const senderPart = participantsRef.current.find((p) => p.uid === sig.from);
            const senderName = senderPart?.name ?? "Participant";
            const senderAvatar = senderPart?.avatar;

            if (sig.type === "offer") {
              handleOffer(sig.from, sig.sdp, senderName, senderAvatar).catch(() => {});
            } else if (sig.type === "answer") {
              handleAnswer(sig.from, sig.sdp).catch(() => {});
            } else if (sig.type === "candidate") {
              handleCandidate(sig.from, sig.candidate).catch(() => {});
            }

            // Clean up processed signal
            deleteDoc(change.doc.ref).catch(() => {});
          });
        },
      );
      unsubsRef.current.push(unsubSignals);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // ── Cleanup on leave / unmount ──
  const leave = useCallback(async () => {
    // Stop timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    // Unsubscribe listeners
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    // Close all peer connections
    Object.values(peersRef.current).forEach((p) => p.pc.close());
    peersRef.current = {};
    setPeers({});

    // Stop local streams
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    // Remove self from meeting
    if (user) {
      try {
        await deleteDoc(doc(db, "meetings", meetingId, "participants", user.uid));
        await updateDoc(doc(db, "meetings", meetingId), {
          participantUids: arrayRemove(user.uid),
        });
        // If last participant, end meeting
        const meetSnap = await getDoc(doc(db, "meetings", meetingId));
        if (meetSnap.exists()) {
          const data = meetSnap.data();
          const remaining = (data.participantUids ?? []).filter((u: string) => u !== user.uid);
          if (remaining.length === 0) {
            await updateDoc(doc(db, "meetings", meetingId), {
              status: "ended",
              endedAt: serverTimestamp(),
            });
          }
        }
      } catch { /* best effort */ }
    }

    joinedRef.current = false;
    // Release wake lock on native
    if (isNative()) {
      KeepAwake.allowSleep().catch(() => {});
    }
    onLeave();
  }, [user, meetingId, onLeave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (joinedRef.current) {
        // fire-and-forget cleanup
        if (timerRef.current) clearInterval(timerRef.current);
        unsubsRef.current.forEach((u) => u());
        Object.values(peersRef.current).forEach((p) => p.pc.close());
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (user) {
          deleteDoc(doc(db, "meetings", meetingId, "participants", user.uid)).catch(() => {});
          updateDoc(doc(db, "meetings", meetingId), {
            participantUids: arrayRemove(user.uid),
          }).catch(() => {});
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fullscreen toggle ──
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // ── Toggle Mute ──
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  // ── Toggle Camera ──
  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOff(!track.enabled);
    }
  }, []);

  // ── Toggle Screen Share ──
  const toggleScreenShare = useCallback(async () => {
    // Screen sharing is not available in Android WebView
    if (isNative()) return;

    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        Object.values(peersRef.current).forEach((p) => {
          const sender = p.pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(cameraTrack);
        });
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        Object.values(peersRef.current).forEach((p) => {
          const sender = p.pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(screenTrack);
        });
        setIsScreenSharing(true);
        screenTrack.onended = () => {
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
          if (cameraTrack) {
            Object.values(peersRef.current).forEach((p) => {
              const sender = p.pc.getSenders().find((s) => s.track?.kind === "video");
              sender?.replaceTrack(cameraTrack);
            });
          }
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };
      } catch { /* user cancelled */ }
    }
  }, [isScreenSharing]);

  // ── Video grid layout ──
  const peerEntries = Object.entries(peers);
  const totalVideos = 1 + peerEntries.length; // self + peers
  const gridCols =
    totalVideos <= 1 ? "grid-cols-1" :
    totalVideos <= 4 ? "grid-cols-1 md:grid-cols-2" :
    totalVideos <= 9 ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" :
    "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs">{formatTime(duration)}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 text-xs font-mono">{meetingCode}</span>
            <button onClick={copyCode} className="text-white/40 hover:text-white transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="flex items-center gap-1 text-white/60 hover:text-white text-xs transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>{participants.length}</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="hidden md:flex items-center text-white/60 hover:text-white transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Video grid */}
        <div className={`flex-1 p-2 grid ${gridCols} gap-2 auto-rows-fr overflow-hidden min-h-0`}>
          {/* Self */}
          <div className="relative bg-gray-800 rounded-xl overflow-hidden min-h-0">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isCameraOff ? "hidden" : ""}`}
            />
            {isCameraOff && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="text-lg font-bold bg-primary/20 text-primary">
                    {getInitials(user?.name ?? "")}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded px-2 py-0.5">
              <span className="text-white text-xs">You{isMuted ? " (muted)" : ""}</span>
            </div>
          </div>

          {/* Peers */}
          {peerEntries.map(([uid, peer]) => (
            <PeerVideo key={uid} peer={peer} />
          ))}
        </div>

        {/* Participants panel */}
        {showParticipants && (
          <div className="w-64 bg-gray-900 border-l border-white/10 flex flex-col shrink-0">
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-white text-sm font-semibold">Participants ({participants.length})</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {participants.map((p) => (
                <div key={p.uid} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5">
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={p.avatar} />
                    <AvatarFallback className="text-[10px] font-bold bg-primary/20 text-primary">
                      {getInitials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-white text-xs truncate flex-1">{p.name}</span>
                  {p.uid === user?.uid && (
                    <span className="text-white/40 text-[10px]">(you)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="bg-gray-900/80 border-t border-white/10 px-4 py-3 flex items-center justify-center gap-3 shrink-0">
        <button
          onClick={toggleMute}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? "bg-red-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <button
          onClick={toggleCamera}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            isCameraOff ? "bg-red-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={isCameraOff ? "Turn camera on" : "Turn camera off"}
        >
          {isCameraOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
        </button>
        {!isNative() && (
          <button
            onClick={toggleScreenShare}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              isScreenSharing ? "bg-blue-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>
        )}
        <button
          onClick={leave}
          className="w-12 h-11 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg"
          title="Leave meeting"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Peer video tile ──
function PeerVideo({ peer }: { peer: PeerState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
      const videoTracks = peer.stream.getVideoTracks();
      setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);

      // Listen for track changes
      const checkVideo = () => {
        const tracks = peer.stream?.getVideoTracks() ?? [];
        setHasVideo(tracks.length > 0 && tracks[0].enabled);
      };
      peer.stream.addEventListener("addtrack", checkVideo);
      peer.stream.addEventListener("removetrack", checkVideo);
      return () => {
        peer.stream?.removeEventListener("addtrack", checkVideo);
        peer.stream?.removeEventListener("removetrack", checkVideo);
      };
    }
  }, [peer.stream]);

  const initials = peer.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative bg-gray-800 rounded-xl overflow-hidden min-h-0">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${!hasVideo ? "hidden" : ""}`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar className="w-16 h-16">
            <AvatarImage src={peer.avatar} />
            <AvatarFallback className="text-lg font-bold bg-primary/20 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded px-2 py-0.5">
        <span className="text-white text-xs">{peer.name}</span>
      </div>
    </div>
  );
}
