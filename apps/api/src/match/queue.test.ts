import type { QueueEntry } from "@game-platform/shared";
import { describe, expect, it } from "vitest";
import { createMatchQueue, type QueueTicket } from "./queue";

const oneRac: QueueEntry = { gameId: "rps", mode: "first-to-2", currency: "rac", stake: 1 };
const fiveRac: QueueEntry = { gameId: "rps", mode: "first-to-2", currency: "rac", stake: 5 };

function ticket(id: string, entry: QueueEntry = oneRac): QueueTicket {
  return {
    socketId: `socket-${id}`,
    userId: `user-${id}`,
    name: `Player ${id}`,
    entry,
    queuedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("match queue", () => {
  it("holds the first player and pairs the second", () => {
    const queue = createMatchQueue();

    expect(queue.join(ticket("a")).kind).toBe("waiting");
    expect(queue.waitingFor(oneRac)).toBe(1);

    const result = queue.join(ticket("b"));
    expect(result.kind).toBe("paired");
    if (result.kind !== "paired") throw new Error("expected a pair");
    expect(result.waiting.userId).toBe("user-a");
    expect(result.joined.userId).toBe("user-b");

    // Both leave the queue when they are seated.
    expect(queue.waitingFor(oneRac)).toBe(0);
    expect(queue.size()).toBe(0);
  });

  it("keeps a third player waiting", () => {
    const queue = createMatchQueue();

    queue.join(ticket("a"));
    queue.join(ticket("b"));
    expect(queue.join(ticket("c")).kind).toBe("waiting");
    expect(queue.waitingFor(oneRac)).toBe(1);
  });

  it("does not pair across different stakes", () => {
    const queue = createMatchQueue();

    expect(queue.join(ticket("a", oneRac)).kind).toBe("waiting");
    expect(queue.join(ticket("b", fiveRac)).kind).toBe("waiting");
    expect(queue.waitingFor(oneRac)).toBe(1);
    expect(queue.waitingFor(fiveRac)).toBe(1);
  });

  it("refuses a second ticket for the same user so nobody plays themselves", () => {
    const queue = createMatchQueue();

    queue.join(ticket("a"));
    const second = queue.join({ ...ticket("a"), socketId: "socket-a-second-tab" });

    expect(second.kind).toBe("duplicate");
    expect(queue.waitingFor(oneRac)).toBe(1);
  });

  it("removes a ticket on leave and on disconnect", () => {
    const queue = createMatchQueue();
    queue.join(ticket("a"));

    expect(queue.leaveBySocket("socket-a")?.userId).toBe("user-a");
    expect(queue.leaveBySocket("socket-a")).toBeUndefined();
    expect(queue.waitingFor(oneRac)).toBe(0);
    expect(queue.ticketByUser("user-a")).toBeUndefined();
  });

  it("frees the user slot after leaving so they can search again", () => {
    const queue = createMatchQueue();

    queue.join(ticket("a"));
    queue.leaveByUser("user-a");

    expect(queue.join(ticket("a")).kind).toBe("waiting");
  });
});
