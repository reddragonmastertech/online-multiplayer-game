import {
  clientEvent,
  serverEvent,
  type MatchFound,
  type QueueEntry,
  type Seat,
} from "@game-platform/shared";
import { create } from "zustand";
import { closeSocket, getSocket, type ArenaSocket } from "@/lib/socket";
import { useSessionStore } from "@/stores/session-store";

export type QueueStatus = "idle" | "searching" | "found" | "error";

type QueueState = {
  status: QueueStatus;
  entry: QueueEntry | null;
  queuedAt: string | null;
  matchId: string | null;
  seat: Seat | null;
  match: MatchFound["match"] | null;
  error: string | null;
  join: (entry: QueueEntry) => void;
  leave: () => void;
  reset: () => void;
  teardown: () => void;
};

let bound: ArenaSocket | null = null;

/** The server moves RAC between available and locked, so re-read the wallet. */
function refreshWallet() {
  void useSessionStore.getState().refresh();
}

function bindSocket(socket: ArenaSocket, set: (partial: Partial<QueueState>) => void) {
  if (bound === socket) return socket;
  bound = socket;

  socket.on(serverEvent.queueWaiting, (payload) => {
    const { queuedAt, ...entry } = payload;
    set({ status: "searching", entry, queuedAt, error: null });
    refreshWallet();
  });

  socket.on(serverEvent.matchFound, (payload) => {
    set({
      status: "found",
      matchId: payload.matchId,
      seat: payload.seat,
      match: payload.match,
      error: null,
    });
    refreshWallet();
  });

  socket.on(serverEvent.error, (payload) => {
    set({ status: "error", error: payload.message });
    refreshWallet();
  });

  socket.on("connect_error", (error) => {
    set({ status: "error", error: error.message || "Could not reach the arena server." });
  });

  socket.on("disconnect", (reason) => {
    // A deliberate client disconnect is not a failure worth reporting.
    if (reason === "io client disconnect") return;
    set({ status: "error", error: "Connection lost. Trying to reconnect…" });
  });

  return socket;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  status: "idle",
  entry: null,
  queuedAt: null,
  matchId: null,
  seat: null,
  match: null,
  error: null,

  join: (entry) => {
    const token = useSessionStore.getState().token;
    if (!token) {
      set({ status: "error", error: "Log in to join a match." });
      return;
    }

    const socket = bindSocket(getSocket(token), set);
    set({ status: "searching", entry, queuedAt: null, matchId: null, seat: null, error: null });
    socket.emit(clientEvent.queueJoin, entry);
  },

  leave: () => {
    const token = useSessionStore.getState().token;
    if (token && get().status === "searching") {
      bindSocket(getSocket(token), set).emit(clientEvent.queueLeave);
    }

    set({ status: "idle", entry: null, queuedAt: null, error: null });
    refreshWallet();
  },

  reset: () => {
    set({ status: "idle", entry: null, queuedAt: null, matchId: null, seat: null, match: null, error: null });
  },

  teardown: () => {
    bound = null;
    closeSocket();
    set({
      status: "idle",
      entry: null,
      queuedAt: null,
      matchId: null,
      seat: null,
      match: null,
      error: null,
    });
  },
}));
