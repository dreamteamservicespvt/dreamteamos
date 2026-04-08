import { create } from "zustand";

export type CallType = "video" | "voice";

interface CallStore {
  /** Set by Chat page to trigger an outgoing call from VideoCallManager */
  pendingCall: { peerId: string; peerName: string; peerAvatar?: string; callType: CallType } | null;
  startCall: (peerId: string, peerName: string, peerAvatar?: string, callType?: CallType) => void;
  clearPendingCall: () => void;
  /** Set when a 1-on-1 call is upgraded to a group meeting */
  pendingMeeting: { meetingId: string; meetingCode: string } | null;
  setPendingMeeting: (meetingId: string, meetingCode: string) => void;
  clearPendingMeeting: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  pendingCall: null,
  startCall: (peerId, peerName, peerAvatar, callType = "video") =>
    set({ pendingCall: { peerId, peerName, peerAvatar, callType } }),
  clearPendingCall: () => set({ pendingCall: null }),
  pendingMeeting: null,
  setPendingMeeting: (meetingId, meetingCode) =>
    set({ pendingMeeting: { meetingId, meetingCode } }),
  clearPendingMeeting: () => set({ pendingMeeting: null }),
}));
