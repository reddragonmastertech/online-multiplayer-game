import {
  clientEvent,
  serverEvent,
  type MatchOver,
  type MatchReveal,
  type MatchState,
  type RpsHand,
} from "@game-platform/shared";
import { create } from "zustand";
import { getSocket, type ArenaSocket } from "@/lib/socket";
import { useSessionStore } from "@/stores/session-store";

export type MatchLogLine = {
  round: number;
  detail: string;
};

type MatchStoreState = {
  matchId: string | null;
  state: MatchState | null;
  over: MatchOver | null;
  log: MatchLogLine[];
  /** The hand this client sent, shown as selected until the server confirms. */
  pending: RpsHand | null;
  error: string | null;
  watch: (matchId: string) => void;
  move: (hand: RpsHand) => void;
  forfeit: () => void;
  clear: () => void;
};

let bound: ArenaSocket | null = null;

function appendRound(log: MatchLogLine[], reveal: MatchReveal): MatchLogLine[] {
  if (log.some((line) => line.round === reveal.round)) return log;
  return [...log, { round: reveal.round, detail: reveal.detail }];
}

function bindSocket(socket: ArenaSocket): ArenaSocket {
  if (bound === socket) return socket;
  bound = socket;

  socket.on(serverEvent.matchState, (payload) => {
    useMatchStore.setState((current) => {
      // A state for a different match means this client moved on.
      if (current.matchId && payload.matchId !== current.matchId) return current;

      return {
        matchId: payload.matchId,
        state: payload,
        // The server's log is authoritative and survives a reload.
        log: payload.log.length >= current.log.length ? payload.log : current.log,
        error: null,
        // Clear the optimistic hand once the server reflects a new round.
        pending:
          payload.players.find((player) => player.userId === payload.yourUserId)?.move
            .status === "choosing"
            ? null
            : current.pending,
      };
    });
  });

  socket.on(serverEvent.matchReveal, (payload) => {
    useMatchStore.setState((current) => {
      if (current.matchId && payload.matchId !== current.matchId) return current;
      return { log: appendRound(current.log, payload) };
    });
  });

  socket.on(serverEvent.matchOver, (payload) => {
    useMatchStore.setState((current) => {
      if (current.matchId && payload.matchId !== current.matchId) return current;
      return { over: payload, pending: null };
    });
    // The server has moved RAC; read the authoritative balance back.
    void useSessionStore.getState().refresh();
  });

  socket.on(serverEvent.error, (payload) => {
    useMatchStore.setState({ error: payload.message, pending: null });
  });

  return socket;
}

function socketOrNull() {
  const token = useSessionStore.getState().token;
  return token ? bindSocket(getSocket(token)) : null;
}

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  matchId: null,
  state: null,
  over: null,
  log: [],
  pending: null,
  error: null,

  watch: (matchId) => {
    if (get().matchId === matchId) {
      socketOrNull();
      return;
    }

    set({ matchId, state: null, over: null, log: [], pending: null, error: null });
    // Connecting is enough: the server re-seats a player in their live match
    // and sends the authoritative state on connection.
    socketOrNull();
  },

  move: (hand) => {
    const { matchId, state, over } = get();
    const socket = socketOrNull();
    if (!socket || !matchId || over || state?.viewerRole !== "player") return;

    set({ pending: hand, error: null });
    socket.emit(clientEvent.matchMove, { matchId, hand });
  },

  forfeit: () => {
    const { matchId, over } = get();
    const socket = socketOrNull();
    if (!socket || !matchId || over) return;

    socket.emit(clientEvent.matchForfeit, { matchId });
  },

  clear: () => {
    set({ matchId: null, state: null, over: null, log: [], pending: null, error: null });
  },
}));
