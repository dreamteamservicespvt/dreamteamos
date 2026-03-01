import { create } from "zustand";

interface SidebarStore {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  collapsed: false,
  setCollapsed: (v) => set({ collapsed: v }),
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));
