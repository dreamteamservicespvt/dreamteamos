import { create } from "zustand";

export type CallType = "video" | "voice";

interface CallStore {
  /** Set by Chat page to trigger an outgoing call from VideoCallManager */
  pendingCall: { peerId: string; peerName: string; peerAvatar?: string; callType: CallType } | null;
  startCall: (peerId: string, peerName: string, peerAvatar?: string, callType?: CallType) => void;
  clearPendingCall: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  pendingCall: null,
  startCall: (peerId, peerName, peerAvatar, callType = "video") =>
    set({ pendingCall: { peerId, peerName, peerAvatar, callType } }),
  clearPendingCall: () => set({ pendingCall: null }),
}));
