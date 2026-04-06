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
  Phone, PhoneOff, Mic, MicOff, VideoIcon, VideoOff, Monitor, MonitorOff, Loader2, Volume2, Volume1,
  SwitchCamera, UserPlus, SmilePlus, X, Search,
} from "lucide-react";
import { startRingtone, stopRingtone, startRingback, stopRingback } from "@/utils/audio";
import { sendNotification } from "@/services/notifications";
import { getChatRoute, getChatContactRoles, getMeetingRoute } from "@/utils/chatHelpers";
import type { VideoCallDoc, AppUser } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { isNative } from "@/utils/platform";
import AudioRoute from "@/services/audio-route";
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

type CallPhase = "idle" | "outgoing" | "incoming" | "active";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🔥", "🎉", "👏", "😢"];

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number; // random horizontal position (%)
}

export default function VideoCallManager() {
  const user = useAuthStore((s) => s.user);
  const { pendingCall, clearPendingCall } = useCallStore();
  const setPendingMeeting = useCallStore((s) => s.setPendingMeeting);
  const navigate = useNavigate();

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callType, setCallType] = useState<CallType>("video");
  const [peerName, setPeerName] = useState("");
  const [peerAvatar, setPeerAvatar] = useState<string | undefined>();
  const [peerIdRef_state, setPeerIdState] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const reactionIdRef = useRef(0);

  // Add members state
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [addPeopleContacts, setAddPeopleContacts] = useState<AppUser[]>([]);
  const [addPeopleSearch, setAddPeopleSearch] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const peerIdRef = useRef<string>("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const callDocIdRef = useRef<string | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingDocRef = useRef<VideoCallDoc | null>(null);
  const callGenRef = useRef(0); // generation counter — incremented on every cleanup to cancel stale async work
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const isAnsweringRef = useRef(false);
  const facingModeRef = useRef<"user" | "environment">("user");

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
    remoteStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    callDocIdRef.current = null;
    incomingDocRef.current = null;
    pendingCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    isAnsweringRef.current = false;
    facingModeRef.current = "user";
    setPhase("idle");
    setCallType("video");
    setPeerName("");
    setPeerAvatar(undefined);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
    setCallDuration(0);
    setIsSpeaker(false);
    setIsFrontCamera(true);
    setShowEmojiPicker(false);
    setReactions([]);
    setShowAddPeople(false);
    setAddPeopleSearch("");
    setAddingMember(false);
    setPeerIdState("");
    peerIdRef.current = "";
    // Release wake lock and reset audio route on native
    if (isNative()) {
      KeepAwake.allowSleep().catch(() => {});
      AudioRoute.reset().catch(() => {});
    }
  }, []);

  // ── Start call timer ──
  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }, []);

  // ── Get user media ──
  const getMedia = useCallback(async (type: CallType = "video") => {
    const constraints = type === "voice"
      ? { video: false, audio: true }
      : { video: { facingMode: facingModeRef.current }, audio: true };
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

      // Remote tracks — store stream and assign to both video & audio elements
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          remoteStreamRef.current = e.streams[0];
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
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

      // Listen for remote ICE candidates (buffer until remote description is set)
      const remoteCol = isCaller ? "receiverCandidates" : "callerCandidates";
      const unsub = onSnapshot(collection(db, "calls", callId, remoteCol), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            if (remoteDescriptionSetRef.current) {
              pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
            } else {
              pendingCandidatesRef.current.push(data);
            }
          }
        });
      });
      unsubsRef.current.push(unsub);

      return pc;
    },
    [],
  );

  // ── Flush buffered ICE candidates after remote description is set ──
  const flushPendingCandidates = useCallback(() => {
    const pc = pcRef.current;
    if (!pc) return;
    const candidates = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    candidates.forEach((c) => {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    });
  }, []);

  // ── START OUTGOING CALL ──
  const startOutgoingCall = useCallback(
    async (peerId: string, name: string, avatar?: string, type: CallType = "video") => {
      if (!user || phase !== "idle") return;
      try {
        setPeerName(name);
        setPeerAvatar(avatar);
        setCallType(type);
        setPhase("outgoing");
        setPeerIdState(peerId);
        peerIdRef.current = peerId;
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
            pc.setRemoteDescription(new RTCSessionDescription(data.answer))
              .then(() => {
                remoteDescriptionSetRef.current = true;
                flushPendingCandidates();
              })
              .catch(() => {});
            setIsSpeaker(type === "video"); // video→speaker, voice→earpiece
            setPhase("active");
            startTimer();
          } else if (data.status === "upgraded" && data.meetingRedirect) {
            // Peer escalated to a group meeting — follow them
            const { meetingId, meetingCode } = data.meetingRedirect;
            setPendingMeeting(meetingId, meetingCode);
            cleanup();
            navigate(getMeetingRoute(user!.role));
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
    [user, phase, getMedia, createPC, cleanup, startTimer, flushPendingCandidates, setPendingMeeting, navigate],
  );

  // ── ACCEPT INCOMING CALL ──
  const acceptCall = useCallback(async () => {
    const callDoc = incomingDocRef.current;
    if (!callDoc || !user) return;
    try {
      stopRingtone();
      isAnsweringRef.current = true;
      setPhase("active");
      setPeerIdState(callDoc.callerId);
      peerIdRef.current = callDoc.callerId;

      const type = callDoc.callType ?? "video";
      setCallType(type);
      setIsSpeaker(type === "video"); // video→speaker, voice→earpiece
      const stream = await getMedia(type);
      const callId = callDoc.id;
      callDocIdRef.current = callId;

      const pc = createPC(callId, false);

      await pc.setRemoteDescription(new RTCSessionDescription(callDoc.offer as RTCSessionDescriptionInit));
      remoteDescriptionSetRef.current = true;
      flushPendingCandidates();
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
        if (data.status === "upgraded" && data.meetingRedirect) {
          const { meetingId, meetingCode } = data.meetingRedirect;
          setPendingMeeting(meetingId, meetingCode);
          cleanup();
          navigate(getMeetingRoute(user!.role));
        } else if (data.status === "ended") cleanup();
      });
      unsubsRef.current.push(unsub);
    } catch (err) {
      console.error("Failed to accept call:", err);
      cleanup();
    }
  }, [user, getMedia, createPC, cleanup, startTimer, flushPendingCandidates, setPendingMeeting, navigate]);

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
    // Screen sharing is not available in Android WebView
    if (isNative()) return;

    const pc = pcRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share, switch back to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(cameraTrack);
      }
      // Restore local PiP to camera
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    } else {
      // Check if getDisplayMedia is supported
      if (!navigator.mediaDevices?.getDisplayMedia) {
        console.warn("Screen sharing not supported on this device/browser");
        return;
      }
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
        // Show screen share in local PiP
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
        }
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
          if (cameraTrack && sender) sender.replaceTrack(cameraTrack);
          // Restore local PiP to camera
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };
      } catch (err) {
        // User cancelled or not supported
        console.warn("Screen share failed:", err);
      }
    }
  }, [isScreenSharing]);

  // ── FLIP CAMERA (front / back) ──
  const flipCamera = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const newMode = facingModeRef.current === "user" ? "environment" : "user";
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode },
        audio: true,
      });
      // Replace video track on peer connection
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && newVideoTrack) {
        await sender.replaceTrack(newVideoTrack);
      }
      // Stop old video track, keep new audio track synced
      const oldStream = localStreamRef.current;
      oldStream?.getVideoTracks().forEach((t) => t.stop());
      // Replace old video track in local stream
      if (oldStream) {
        oldStream.getVideoTracks().forEach((t) => oldStream.removeTrack(t));
        oldStream.addTrack(newVideoTrack);
      }
      // Also stop the new audio track (we keep the old one)
      newStream.getAudioTracks().forEach((t) => t.stop());

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      facingModeRef.current = newMode;
      setIsFrontCamera(newMode === "user");
    } catch (err) {
      console.error("Failed to flip camera:", err);
    }
  }, []);

  // ── SEND EMOJI REACTION ──
  const sendReaction = useCallback((emoji: string) => {
    reactionIdRef.current += 1;
    const id = reactionIdRef.current;
    const x = 10 + Math.random() * 80; // random horizontal position
    setReactions((prev) => [...prev, { id, emoji, x }]);
    setShowEmojiPicker(false);
    // Remove after animation
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  }, []);

  // ── LOAD CONTACTS FOR ADD-PEOPLE PICKER ──
  useEffect(() => {
    if (!showAddPeople || !user) return;
    const roles = getChatContactRoles(user.role);
    if (roles.length === 0) return;
    const q = query(
      collection(db, "users"),
      where("role", "in", roles),
      where("isActive", "==", true),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
        .filter((u) => u.uid !== user.uid && u.uid !== peerIdRef.current);
      setAddPeopleContacts(list);
    });
    return () => unsub();
  }, [showAddPeople, user?.uid, user?.role]);

  // ── ESCALATE TO GROUP MEETING ──
  const escalateToMeeting = useCallback(async (extraUserId: string, extraUserName: string) => {
    if (!user || addingMember) return;
    setAddingMember(true);
    try {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

      const meetingRef = doc(collection(db, "meetings"));
      await setDoc(meetingRef, {
        code,
        title: `${user.name}'s Meeting`,
        createdBy: user.uid,
        createdByName: user.name,
        status: "active",
        participantUids: [],
        createdAt: serverTimestamp(),
      });

      // Write meetingRedirect to call doc so peer auto-joins too
      const callId = callDocIdRef.current;
      if (callId) {
        await updateDoc(doc(db, "calls", callId), {
          status: "upgraded",
          meetingRedirect: { meetingId: meetingRef.id, meetingCode: code },
        });
      }

      // Notify the extra user
      sendNotification({
        userId: extraUserId,
        type: "meeting_invite",
        title: "Meeting Invitation",
        message: `${user.name} invited you to a meeting. Code: ${code}`,
      });

      // Set pending meeting & navigate (current user)
      setPendingMeeting(meetingRef.id, code);
      cleanup();
      navigate(getMeetingRoute(user.role));
    } catch (err) {
      console.error("Failed to escalate to meeting:", err);
      setAddingMember(false);
    }
  }, [user, addingMember, cleanup, navigate, setPendingMeeting]);

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

  // ── Watch for caller cancellation / answered elsewhere when we have an incoming call ──
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
      // If another device answered (status→active) but we didn't answer, dismiss here
      if (data.status === "active" && !isAnsweringRef.current) {
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

  // ── Sync streams to media elements when phase becomes active ──
  // Fixes: local video not showing (ref was null when getMedia set srcObject)
  useEffect(() => {
    if (phase !== "active") return;
    // Re-attach local stream (getMedia may have run before the video element existed)
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    // Re-attach remote stream
    if (remoteStreamRef.current) {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [phase]);

  // ── Speaker / earpiece routing ──
  // On native: use AudioRoute plugin for real hardware earpiece/speaker routing
  // On web: <video> routes to loudspeaker, <audio> routes to earpiece
  useEffect(() => {
    if (phase !== "active") return;

    if (isNative()) {
      // Native: use the Android AudioManager via custom plugin
      AudioRoute.setSpeakerOn({ enabled: isSpeaker }).catch(() => {});
      // Still need both elements unmuted for audio to flow through WebView
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.volume = 1;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1;
      }
      return;
    }

    // Web fallback
    if (isSpeaker) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.volume = 1;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = true;
        remoteAudioRef.current.volume = 0;
      }
    } else {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = true;
        remoteVideoRef.current.volume = 0;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1;
        const audioEl = remoteAudioRef.current as any;
        if (typeof audioEl.setSinkId === "function") {
          audioEl.setSinkId("default").catch(() => {});
        }
      }
    }
  }, [isSpeaker, phase]);

  // ── Toggle speaker ──
  const toggleSpeaker = useCallback(() => {
    setIsSpeaker((prev) => !prev);
  }, []);

  // ── Keep screen awake during calls ──
  useEffect(() => {
    if (phase === "active" && isNative()) {
      KeepAwake.keepAwake().catch(() => {});
    }
    return () => {
      if (isNative()) KeepAwake.allowSleep().catch(() => {});
    };
  }, [phase]);

  // ── Render nothing when idle ──
  if (phase === "idle") return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const initials = peerName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // ── INCOMING CALL SCREEN — WhatsApp-style floating popup ──
  if (phase === "incoming") {
    return (
      <div className="fixed top-4 left-4 right-4 z-[100] animate-in slide-in-from-top duration-300">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl mx-auto max-w-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="w-12 h-12">
                <AvatarImage src={peerAvatar} />
                <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{peerName}</p>
              <p className="text-xs text-muted-foreground">Incoming {callType} call…</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={declineCall}
                className="w-11 h-11 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
              <button
                onClick={acceptCall}
                className="w-11 h-11 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-colors shadow-lg"
              >
                <Phone className="w-5 h-5" />
              </button>
            </div>
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
      {/* Hidden audio element for earpiece routing on mobile */}
      <audio ref={remoteAudioRef} autoPlay playsInline muted={isSpeaker} className="hidden" />

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
              muted={!isSpeaker}
              className="w-full h-full object-contain bg-black"
            />
            {/* Remote name + timer overlay */}
            <div className="absolute top-4 left-4 text-white bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
              <p className="font-semibold text-sm">{peerName}</p>
              <p className="text-xs text-white/70">{formatTime(callDuration)}</p>
            </div>
            {/* Local video PiP — mirrored for front camera (natural mirror view) */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 w-36 h-28 md:w-48 md:h-36 rounded-xl border-2 border-white/20 object-cover shadow-xl bg-black z-10"
              style={isFrontCamera ? { transform: "scaleX(-1)" } : undefined}
            />
            {/* Floating emoji reactions */}
            <AnimatePresence>
              {reactions.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -300, scale: 1.5 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.5, ease: "easeOut" }}
                  className="absolute bottom-28 pointer-events-none text-4xl z-20"
                  style={{ left: `${r.x}%` }}
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
            {/* Emoji picker overlay */}
            {showEmojiPicker && (
              <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 bg-gray-900/90 backdrop-blur-sm rounded-2xl p-3 flex gap-2 flex-wrap max-w-[280px] justify-center shadow-2xl border border-white/10">
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => sendReaction(e)}
                    className="text-2xl hover:scale-125 transition-transform p-1"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden video elements for voice calls (keep refs working) */}
      {isVoice && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline muted={!isSpeaker} className="hidden" />
          <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
        </>
      )}

      {/* Controls */}
      <div className="bg-gray-900/80 backdrop-blur-sm px-4 py-4 flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? "bg-red-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <button
          onClick={toggleSpeaker}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isSpeaker ? "bg-blue-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={isSpeaker ? "Switch to earpiece" : "Switch to speaker"}
        >
          {isSpeaker ? <Volume2 className="w-5 h-5" /> : <Volume1 className="w-5 h-5" />}
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
              onClick={flipCamera}
              className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
              title={isFrontCamera ? "Switch to back camera" : "Switch to front camera"}
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
            {!isNative() && (
              <button
                onClick={toggleScreenShare}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  isScreenSharing ? "bg-blue-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
                }`}
                title={isScreenSharing ? "Stop sharing" : "Share screen"}
              >
                {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={() => setShowEmojiPicker((p) => !p)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                showEmojiPicker ? "bg-yellow-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
              }`}
              title="Send reaction"
            >
              <SmilePlus className="w-5 h-5" />
            </button>
          </>
        )}
        <button
          onClick={() => setShowAddPeople(true)}
          className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
          title="Add people"
        >
          <UserPlus className="w-5 h-5" />
        </button>
        <button
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg"
          title="End call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>

      {/* Add People overlay */}
      {showAddPeople && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <button onClick={() => { setShowAddPeople(false); setAddPeopleSearch(""); }} className="text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-white font-semibold flex-1">Add People to Meeting</h3>
          </div>
          <div className="px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                value={addPeopleSearch}
                onChange={(e) => setAddPeopleSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full bg-white/10 text-white placeholder:text-white/40 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
            {addPeopleContacts
              .filter((c) => c.name.toLowerCase().includes(addPeopleSearch.toLowerCase()))
              .map((c) => {
                const ci = c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <button
                    key={c.uid}
                    disabled={addingMember}
                    onClick={() => escalateToMeeting(c.uid, c.name)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 text-white transition-colors disabled:opacity-50"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={c.avatar} />
                      <AvatarFallback className="text-xs font-semibold bg-white/10">{ci}</AvatarFallback>
                    </Avatar>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-white/50 capitalize">{c.role.replace("_", " ")}</p>
                    </div>
                    {addingMember && <Loader2 className="w-4 h-4 animate-spin text-white/60" />}
                  </button>
                );
              })}
            {addPeopleContacts.filter((c) => c.name.toLowerCase().includes(addPeopleSearch.toLowerCase())).length === 0 && (
              <p className="text-white/40 text-sm text-center py-8">No contacts found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
