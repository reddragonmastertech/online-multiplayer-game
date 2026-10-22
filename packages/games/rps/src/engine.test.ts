import { IllegalMoveError } from "@game-platform/game-core";
import { describe, expect, it } from "vitest";
import { advanceRound, bothReady, randomHand, roundDetail, rpsEngine } from "./engine";

const alice = "alice";
const bob = "bob";

function start() {
  return rpsEngine.initialState({ a: alice, b: bob });
}

function playRound(
  state: ReturnType<typeof start>,
  handA: "Rock" | "Paper" | "Scissors",
  handB: "Rock" | "Paper" | "Scissors",
) {
  const locked = rpsEngine.applyMove(rpsEngine.applyMove(state, alice, handA), bob, handB);
  return rpsEngine.resolveRound(locked);
}

describe("rpsEngine", () => {
  it("scores a win when Rock beats Scissors", () => {
    const resolved = playRound(start(), "Rock", "Scissors");

    expect(resolved.seats.a.score).toBe(1);
    expect(resolved.seats.b.score).toBe(0);
    expect(resolved.log[0]).toMatchObject({ outcome: "a", hands: { a: "Rock", b: "Scissors" } });
    expect(roundDetail(resolved.log[0]!)).toBe("Rock beats Scissors");
    expect(rpsEngine.status(resolved)).toEqual({ kind: "playing" });
  });

  it("scores a loss when Paper loses to Scissors", () => {
    const resolved = playRound(start(), "Paper", "Scissors");

    expect(resolved.seats.a.score).toBe(0);
    expect(resolved.seats.b.score).toBe(1);
    expect(resolved.log[0]?.outcome).toBe("b");
    expect(rpsEngine.status(resolved).kind).toBe("playing");
  });

  it("scores nothing on a draw", () => {
    const resolved = playRound(start(), "Paper", "Paper");

    expect(resolved.seats.a.score).toBe(0);
    expect(resolved.seats.b.score).toBe(0);
    expect(resolved.phase).toBe("reveal");
    expect(resolved.log[0]?.outcome).toBe("draw");
    expect(roundDetail(resolved.log[0]!)).toBe("Draw · Paper vs Paper");
  });

  it("ends the match at first to 2", () => {
    const round1 = playRound(start(), "Rock", "Scissors");
    const round2 = playRound(advanceRound(round1), "Scissors", "Paper");

    expect(round2.seats.a.score).toBe(2);
    expect(round2.phase).toBe("finished");
    expect(rpsEngine.status(round2)).toEqual({ kind: "winner", playerId: alice });
  });

  it("rejects a second lock from the same player", () => {
    const once = rpsEngine.applyMove(start(), alice, "Rock");

    expect(() => rpsEngine.applyMove(once, alice, "Paper")).toThrow(IllegalMoveError);
    expect(bothReady(once)).toBe(false);
  });

  it("does not reveal until both hands are locked", () => {
    const once = rpsEngine.applyMove(start(), alice, "Rock");

    expect(() => rpsEngine.resolveRound(once)).toThrow(/Both players/);
  });

  it("picks a legal random hand", () => {
    expect(randomHand(() => 0)).toBe("Rock");
    expect(randomHand(() => 0.4)).toBe("Paper");
    expect(randomHand(() => 0.9)).toBe("Scissors");
  });
});
