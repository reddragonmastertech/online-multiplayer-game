import { create } from "zustand";

export type AuthTab = "login" | "signup";

type UiState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  authOpen: boolean;
  authTab: AuthTab;
  openAuth: (tab?: AuthTab) => void;
  closeAuth: () => void;
  setAuthTab: (tab: AuthTab) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  authOpen: false,
  authTab: "login",
  openAuth: (authTab = "login") => set({ authOpen: true, authTab }),
  closeAuth: () => set({ authOpen: false }),
  setAuthTab: (authTab) => set({ authTab }),
}));
