import { queueKey, type QueueEntry } from "@game-platform/shared";

/**
 * Matchmaking lives in this process's memory. One API process only: a second
 * instance would keep its own queue and the two players would never meet.
 */

export type QueueTicket = {
  socketId: string;
  userId: string;
  name: string;
  entry: QueueEntry;
  queuedAt: string;
};

export type JoinResult =
  | { kind: "waiting"; ticket: QueueTicket }
  | { kind: "paired"; waiting: QueueTicket; joined: QueueTicket }
  | { kind: "duplicate"; ticket: QueueTicket };

export function createMatchQueue() {
  const byKey = new Map<string, QueueTicket[]>();
  const bySocket = new Map<string, QueueTicket>();
  const byUser = new Map<string, QueueTicket>();

  function forget(ticket: QueueTicket) {
    const key = queueKey(ticket.entry);
    const list = byKey.get(key);

    if (list) {
      const next = list.filter((item) => item.socketId !== ticket.socketId);
      if (next.length > 0) {
        byKey.set(key, next);
      } else {
        byKey.delete(key);
      }
    }

    bySocket.delete(ticket.socketId);
    byUser.delete(ticket.userId);
  }

  return {
    /**
     * A user holds at most one ticket, which is what stops a player from being
     * paired against themselves across two tabs and from locking twice.
     */
    join(ticket: QueueTicket): JoinResult {
      const existing = byUser.get(ticket.userId);
      if (existing) {
        return { kind: "duplicate", ticket: existing };
      }

      const key = queueKey(ticket.entry);
      const list = byKey.get(key) ?? [];
      const waiting = list[0];

      if (waiting) {
        forget(waiting);
        return { kind: "paired", waiting, joined: ticket };
      }

      byKey.set(key, [...list, ticket]);
      bySocket.set(ticket.socketId, ticket);
      byUser.set(ticket.userId, ticket);
      return { kind: "waiting", ticket };
    },

    leaveBySocket(socketId: string): QueueTicket | undefined {
      const ticket = bySocket.get(socketId);
      if (!ticket) return undefined;
      forget(ticket);
      return ticket;
    },

    leaveByUser(userId: string): QueueTicket | undefined {
      const ticket = byUser.get(userId);
      if (!ticket) return undefined;
      forget(ticket);
      return ticket;
    },

    ticketBySocket(socketId: string) {
      return bySocket.get(socketId);
    },

    ticketByUser(userId: string) {
      return byUser.get(userId);
    },

    waitingFor(entry: QueueEntry) {
      return byKey.get(queueKey(entry))?.length ?? 0;
    },

    size() {
      return bySocket.size;
    },
  };
}

export type MatchQueue = ReturnType<typeof createMatchQueue>;
