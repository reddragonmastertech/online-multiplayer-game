import {
  clientEvent,
  MATCH_RULES,
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
import { createQueuedMatch, matchRoom, toMatchSummary } from "./store";

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
};

export function registerMatchGateway(
  io: ArenaServer,
  deps: { db: AppDatabase; log: GatewayLogger },
) {
  const { db, log } = deps;
  const queue = createMatchQueue();

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

  io.on("connection", (socket) => {
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
    });
  });

  return queue;
}
