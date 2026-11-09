import {
  clientEvent,
  MATCH_RULES,
  matchForfeitSchema,
  matchMoveSchema,
  matchWatchSchema,
  queueJoinSchema,
  serverEvent,
  type ClientToServerEvents,
  type ErrorCode,
  type QueueEntry,
  type ServerToClientEvents,
  type SocketData,
} from "@game-platform/shared";
import type { Server, Socket } from "socket.io";
import type { AppDatabase } from "../db/client";
import { lockRacStake, refundRacStake } from "../economy/wallet";
import { createMatchQueue, type QueueTicket } from "./queue";
import { createMatchRuntime, stateFor } from "./runtime";
import { createQueuedMatch, matchRoom, spectatorRoom, toMatchSummary } from "./store";

type ArenaServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type ArenaSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type GatewayLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};

export function registerMatchGateway(
  io: ArenaServer,
  deps: { db: AppDatabase; log: GatewayLogger },
) {
  const { db, log } = deps;
  const queue = createMatchQueue();

  /** Every socket the user has open, so a second tab stays in sync. */
  function socketsForUser(userId: string) {
    return [...io.sockets.sockets.values()].filter((socket) => socket.data.userId === userId);
  }

  const runtime = createMatchRuntime({
    db,
    log,
    emit: {
      state: (userId, payload) => {
        for (const socket of socketsForUser(userId)) {
          socket.emit(serverEvent.matchState, payload);
        }
      },
      spectatorState: (matchId, payload) => {
        io.to(spectatorRoom(matchId)).emit(serverEvent.matchState, payload);
      },
      reveal: (matchId, payload) => {
        io.to(matchRoom(matchId)).emit(serverEvent.matchReveal, payload);
      },
      over: (matchId, payload) => {
        io.to(matchRoom(matchId)).emit(serverEvent.matchOver, payload);
      },
    },
  });

  function fail(socket: ArenaSocket, code: ErrorCode, message: string) {
    socket.emit(serverEvent.error, { code, message });
  }

  function releaseTicket(ticket: QueueTicket, reason: string) {
    const result = refundRacStake(db, {
      userId: ticket.userId,
      stake: ticket.entry.stake,
      matchId: null,
    });

    if (!result.ok) {
      log.warn(
        { userId: ticket.userId, stake: ticket.entry.stake, reason: result.reason },
        "could not refund a queued stake",
      );
      return;
    }

    log.info({ userId: ticket.userId, stake: ticket.entry.stake, reason }, "queue stake refunded");
  }

  function pair(waiting: QueueTicket, joined: QueueTicket) {
    const waitingSocket = io.sockets.sockets.get(waiting.socketId);
    const joinedSocket = io.sockets.sockets.get(joined.socketId);

    // The waiting player can vanish between their join and ours, before their
    // disconnect handler runs. Give them their stake back and keep the newcomer
    // searching rather than seating a ghost.
    if (!waitingSocket) {
      releaseTicket(waiting, "stale_ticket");
      return { seated: false as const };
    }

    if (!joinedSocket) {
      releaseTicket(joined, "stale_ticket");
      return { seated: false as const, requeue: waiting };
    }

    const params = {
      gameId: joined.entry.gameId,
      mode: joined.entry.mode,
      currency: joined.entry.currency,
      stake: joined.entry.stake,
      players: [
        { seat: "a" as const, userId: waiting.userId, name: waiting.name },
        { seat: "b" as const, userId: joined.userId, name: joined.name },
      ] as [
        { seat: "a"; userId: string; name: string },
        { seat: "b"; userId: string; name: string },
      ],
    };

    const { matchId } = createQueuedMatch(db, params);
    const match = toMatchSummary({ ...params, matchId });

    waitingSocket.join(matchRoom(matchId));
    joinedSocket.join(matchRoom(matchId));

    waitingSocket.emit(serverEvent.matchFound, { matchId, seat: "a", match });
    joinedSocket.emit(serverEvent.matchFound, { matchId, seat: "b", match });

    log.info(
      { matchId, stake: params.stake, a: waiting.userId, b: joined.userId },
      "match found",
    );

    // The clock starts only after both clients have been told where to go.
    runtime.start({
      matchId,
      gameId: params.gameId,
      mode: params.mode,
      currency: params.currency,
      stake: params.stake,
      players: {
        a: { userId: waiting.userId, name: waiting.name },
        b: { userId: joined.userId, name: joined.name },
      },
    });

    return { seated: true as const, matchId };
  }

  function enqueue(socket: ArenaSocket, entry: QueueEntry) {
    const ticket: QueueTicket = {
      socketId: socket.id,
      userId: socket.data.userId,
      name: socket.data.name,
      entry,
      queuedAt: new Date().toISOString(),
    };

    const result = queue.join(ticket);

    if (result.kind === "waiting") {
      socket.emit(serverEvent.queueWaiting, { ...entry, queuedAt: ticket.queuedAt });
      return;
    }

    if (result.kind === "duplicate") {
      // The caller clears any stale ticket first, so this only fires if two
      // joins from one account race each other. Give the stake straight back.
      releaseTicket(ticket, "duplicate");
      fail(socket, "invalid_input", "You are already searching for a match.");
      return;
    }

    const outcome = pair(result.waiting, result.joined);

    if (outcome.seated) {
      return;
    }

    // Pairing fell through. Whoever is still connected goes back to waiting.
    const survivor = outcome.requeue ?? ticket;
    const survivorSocket = io.sockets.sockets.get(survivor.socketId);

    if (!survivorSocket) {
      releaseTicket(survivor, "stale_ticket");
      return;
    }

    queue.join(survivor);
    survivorSocket.emit(serverEvent.queueWaiting, {
      ...survivor.entry,
      queuedAt: survivor.queuedAt,
    });
  }

  const rejectionMessage: Record<string, string> = {
    match_not_found: "That match is over or does not exist.",
    not_your_match: "You are not seated in that match.",
    match_not_live: "That round is not accepting moves.",
    already_moved: "You already locked a hand this round.",
  };

  io.on("connection", (socket) => {
    // A refresh or a brief drop lands here with a new socket id. Put the player
    // back in their room and resend the authoritative state.
    if (socket.data.userId) {
      const match = runtime.attach(socket.data.userId);
      if (match) {
        void socket.join(matchRoom(match.matchId));
        socket.emit(
          serverEvent.matchState,
          stateFor(match, socket.data.userId, Date.now()),
        );
      }
    }

    socket.on(clientEvent.matchMove, (payload) => {
      if (!socket.data.userId) {
        fail(socket, "unauthorized", "Log in to play.");
        return;
      }

      const parsed = matchMoveSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, "invalid_input", "That move is not valid.");
        return;
      }

      const rejection = runtime.move(
        socket.data.userId,
        parsed.data.matchId,
        parsed.data.hand,
      );

      if (rejection) {
        fail(socket, rejection, rejectionMessage[rejection] ?? "That move was refused.");
      }
    });

    socket.on(clientEvent.matchForfeit, (payload) => {
      if (!socket.data.userId) {
        fail(socket, "unauthorized", "Log in to play.");
        return;
      }

      const parsed = matchForfeitSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, "invalid_input", "That forfeit is not valid.");
        return;
      }

      const rejection = runtime.forfeit(socket.data.userId, parsed.data.matchId);
      if (rejection) {
        fail(socket, rejection, rejectionMessage[rejection] ?? "That forfeit was refused.");
      }
    });

    socket.on(clientEvent.matchWatch, (payload) => {
      const parsed = matchWatchSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, "invalid_input", "That match id is not valid.");
        return;
      }

      const match = runtime.get(parsed.data.matchId);
      if (!match) {
        fail(socket, "match_not_found", "That match is over or does not exist.");
        return;
      }

      const isPlayer =
        Boolean(socket.data.userId) &&
        (match.players.a.userId === socket.data.userId ||
          match.players.b.userId === socket.data.userId);

      if (isPlayer) {
        // A player asking to watch their own match is just rejoining it.
        void socket.join(matchRoom(match.matchId));
        socket.emit(serverEvent.matchState, stateFor(match, socket.data.userId, Date.now()));
        return;
      }

      // Spectators get the match room for reveals and results, plus the
      // spectator room for the view that hides unrevealed hands.
      void socket.join(matchRoom(match.matchId));
      void socket.join(spectatorRoom(match.matchId));
      socket.emit(serverEvent.matchState, stateFor(match, null, Date.now()));
    });

    socket.on(clientEvent.matchUnwatch, (payload) => {
      const parsed = matchWatchSchema.safeParse(payload);
      if (!parsed.success) return;

      void socket.leave(matchRoom(parsed.data.matchId));
      void socket.leave(spectatorRoom(parsed.data.matchId));
    });

    socket.on(clientEvent.queueJoin, (payload) => {
      if (!socket.data.userId) {
        fail(socket, "unauthorized", "Log in to join a match.");
        return;
      }

      const parsed = queueJoinSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, "invalid_input", "That queue request is not valid.");
        return;
      }

      const entry = parsed.data;
      if (!MATCH_RULES.racStakes.includes(entry.stake as 1 | 5 | 10)) {
        fail(
          socket,
          "invalid_input",
          `Stake must be one of ${MATCH_RULES.racStakes.join(", ")} RAC.`,
        );
        return;
      }

      const existing = queue.ticketByUser(socket.data.userId);
      if (existing) {
        if (existing.socketId === socket.id) {
          fail(socket, "invalid_input", "You are already searching for a match.");
          return;
        }

        // Same account on a fresh socket, e.g. after a refresh. Drop the stale
        // ticket and refund it so the new request can lock cleanly.
        queue.leaveByUser(socket.data.userId);
        releaseTicket(existing, "reconnect");
      }

      const lock = lockRacStake(db, { userId: socket.data.userId, stake: entry.stake });
      if (!lock.ok) {
        fail(
          socket,
          lock.reason === "no_wallet" ? "unauthorized" : "insufficient_balance",
          lock.reason === "no_wallet"
            ? "That account has no RAC wallet."
            : `You need ${entry.stake} RAC available to join.`,
        );
        return;
      }

      enqueue(socket, entry);
    });

    socket.on(clientEvent.queueLeave, () => {
      const ticket = queue.leaveBySocket(socket.id);
      if (!ticket) {
        fail(socket, "not_in_queue", "You are not searching for a match.");
        return;
      }

      releaseTicket(ticket, "queue_leave");
    });

    socket.on("disconnect", () => {
      const ticket = queue.leaveBySocket(socket.id);
      if (ticket) {
        releaseTicket(ticket, "disconnect");
      }

      if (!socket.data.userId) return;

      // Only start the grace countdown once the user's last socket is gone, so
      // closing a spare tab never forfeits a live match.
      const remaining = socketsForUser(socket.data.userId).filter(
        (open) => open.id !== socket.id,
      );
      if (remaining.length === 0) {
        runtime.detach(socket.data.userId);
      }
    });
  });

  return { queue, runtime };
}
