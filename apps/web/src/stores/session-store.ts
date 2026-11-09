import type { AuthSuccess, LoginRequest, SignupRequest, User, Wallet } from "@game-platform/shared";
import { create } from "zustand";
import { getStoredToken, loginRequest, meRequest, setStoredToken, signupRequest } from "@/lib/api";
import { closeSocket } from "@/lib/socket";

type SessionStatus = "boot" | "ready";

type SessionState = {
  status: SessionStatus;
  token: string | null;
  user: User | null;
  wallets: Wallet[];
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  signup: (body: SignupRequest) => Promise<void>;
  login: (body: LoginRequest) => Promise<void>;
  logout: () => void;
};

function applyAuth(auth: AuthSuccess): Pick<SessionState, "token" | "user" | "wallets" | "status"> {
  setStoredToken(auth.token);
  return {
    status: "ready",
    token: auth.token,
    user: auth.user,
    wallets: auth.wallets,
  };
}

export function racAvailable(wallets: Wallet[]) {
  return wallets.find((wallet) => wallet.currency === "rac")?.available ?? 0;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "boot",
  token: null,
  user: null,
  wallets: [],
  hydrate: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ status: "ready", token: null, user: null, wallets: [] });
      return;
    }

    try {
      const me = await meRequest();
      set({ status: "ready", token, user: me.user, wallets: me.wallets });
    } catch {
      setStoredToken(null);
      set({ status: "ready", token: null, user: null, wallets: [] });
    }
  },
  /** Re-reads the authoritative wallet after the server moves RAC. */
  refresh: async () => {
    if (!get().token) return;

    try {
      const me = await meRequest();
      set({ user: me.user, wallets: me.wallets });
    } catch {
      // Leave the last known balance in place; a failed refresh is not a logout.
    }
  },
  signup: async (body) => {
    set(applyAuth(await signupRequest(body)));
  },
  login: async (body) => {
    set(applyAuth(await loginRequest(body)));
  },
  logout: () => {
    setStoredToken(null);
    closeSocket();
    set({ status: "ready", token: null, user: null, wallets: [] });
  },
}));
