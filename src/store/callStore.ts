import { create } from "zustand";

interface CallStore {
  /** Set by Chat page to trigger an outgoing call from VideoCallManager */
  pendingCall: { peerId: string; peerName: string; peerAvatar?: string } | null;
  startCall: (peerId: string, peerName: string, peerAvatar?: string) => void;
  clearPendingCall: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  pendingCall: null,
  startCall: (peerId, peerName, peerAvatar) =>
    set({ pendingCall: { peerId, peerName, peerAvatar } }),
  clearPendingCall: () => set({ pendingCall: null }),
}));
