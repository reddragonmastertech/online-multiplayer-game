import {
  clientEvent,
  serverEvent,
  type ChatMessage,
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
  /** Players only; the server never sends chat to a spectator. */
  chat: ChatMessage[];
  /** Hides the opponent's messages on this device. Not sent anywhere. */
  chatMuted: boolean;
  watch: (matchId: string) => void;
  move: (hand: RpsHand) => void;
  forfeit: () => void;
  sendChat: (text: string) => void;
  toggleChatMute: () => void;
  clear: () => void;
};

const emptyMatch = {
  matchId: null,
  state: null,
  over: null,
  log: [],
  pending: null,
  error: null,
  chat: [],
  chatMuted: false,
} satisfies Partial<MatchStoreState>;

function appendChat(chat: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (chat.some((existing) => existing.id === message.id)) return chat;
  return [...chat, message];
}

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

  socket.on(serverEvent.chatMessage, (payload) => {
    useMatchStore.setState((current) => {
      if (payload.matchId !== current.matchId) return current;
      return { chat: appendChat(current.chat, payload) };
    });
  });

  socket.on(serverEvent.chatHistory, (payload) => {
    useMatchStore.setState((current) => {
      if (payload.matchId !== current.matchId) return current;
      // The server's history, plus anything that arrived live while it was in
      // flight. appendChat skips duplicates by id.
      return { chat: current.chat.reduce(appendChat, payload.messages) };
    });
  });

  socket.on(serverEvent.error, (payload) => {
    useMatchStore.setState({ error: payload.message, pending: null });
  });

  return socket;
}

/**
 * Spectating does not require an account, so this connects with whatever token
 * is available, including none. The server decides what the socket may see.
 */
function socketOrNull() {
  return bindSocket(getSocket(useSessionStore.getState().token ?? ""));
}

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  ...emptyMatch,

  watch: (matchId) => {
    const socket = socketOrNull();
    if (get().matchId !== matchId) {
      set({ ...emptyMatch, matchId });
    }

    // Players are re-seated automatically on connection; this also subscribes
    // a spectator to the restricted view of a match they are not in.
    const send = () => socket.emit(clientEvent.matchWatch, { matchId });
    if (socket.connected) send();
    else socket.once("connect", send);
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

  sendChat: (text) => {
    const { matchId, state, over } = get();
    const trimmed = text.trim();
    if (!matchId || over || state?.viewerRole !== "player" || !trimmed) return;

    socketOrNull().emit(clientEvent.chatSend, { matchId, text: trimmed });
  },

  toggleChatMute: () => set((current) => ({ chatMuted: !current.chatMuted })),

  clear: () => {
    const { matchId } = get();
    if (matchId) {
      bound?.emit(clientEvent.matchUnwatch, { matchId });
    }
    set(emptyMatch);
  },
}));
