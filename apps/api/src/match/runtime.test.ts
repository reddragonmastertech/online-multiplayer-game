import { DatabaseSync } from "node:sqlite";
import type { MatchOver, MatchReveal, MatchState, RpsHand } from "@game-platform/shared";
import { MATCH_RULES } from "@game-platform/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { lockRacStake, readRacWallet } from "../economy/wallet";
import { loadMatchHistory } from "./history";
import { createMatchRuntime } from "./runtime";
import { createQueuedMatch } from "./store";

const STAKE = 5;

function seedUser(db: AppDatabase, id: string, available = 100) {
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, 'x', '2026-01-01T00:00:00.000Z')",
  ).run(id, `Player ${id}`, `${id}@example.test`);
  db.prepare(
    "INSERT INTO wallets (user_id, currency, available, locked) VALUES (?, 'rac', ?, 0)",
  ).run(id, available);
  db.prepare(
    "INSERT INTO ledger_entries (id, user_id, currency, kind, amount, match_id, created_at) VALUES (?, ?, 'rac', 'signup_bonus', ?, NULL, '2026-01-01T00:00:00.000Z')",
  ).run(`ledger-${id}`, id, available);
}

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  seedUser(db, "alice");
  seedUser(db, "bob");

  lockRacStake(db, { userId: "alice", stake: STAKE });
  lockRacStake(db, { userId: "bob", stake: STAKE });

  const { matchId } = createQueuedMatch(db, {
    gameId: "rps",
    mode: "first-to-2",
    currency: "rac",
    stake: STAKE,
    players: [
      { seat: "a", userId: "alice", name: "Player alice" },
      { seat: "b", userId: "bob", name: "Player bob" },
    ],
  });

  const states: { userId: string; payload: MatchState }[] = [];
  const spectatorStates: MatchState[] = [];
  const reveals: MatchReveal[] = [];
  const overs: MatchOver[] = [];

  let clock = 1_000_000;
  const runtime = createMatchRuntime({
    db,
    now: () => clock,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    emit: {
      state: (userId, payload) => states.push({ userId, payload }),
      spectatorState: (_matchId, payload) => spectatorStates.push(payload),
      reveal: (_matchId, payload) => reveals.push(payload),
      over: (_matchId, payload) => overs.push(payload),
    },
  });

  runtime.start({
    matchId,
    gameId: "rps",
    mode: "first-to-2",
    currency: "rac",
    stake: STAKE,
    players: {
      a: { userId: "alice", name: "Player alice" },
      b: { userId: "bob", name: "Player bob" },
    },
  });

  function advance(ms: number) {
    clock += ms;
    runtime.tick();
  }

  /** Plays one round and steps past the reveal pause. */
  function playRound(aliceHand: RpsHand, bobHand: RpsHand) {
    runtime.move("alice", matchId, aliceHand);
    runtime.move("bob", matchId, bobHand);
    advance(MATCH_RULES.revealMs);
  }

  function latestFor(userId: string) {
    return [...states].reverse().find((entry) => entry.userId === userId)?.payload;
  }

  return {
    db,
    runtime,
    matchId,
    states,
    spectatorStates,
    reveals,
    overs,
    advance,
    playRound,
    latestFor,
  };
}

describe("match runtime", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it("marks the match live and starts both players choosing", () => {
    const row = h.db.prepare("SELECT status FROM matches WHERE id = ?").get(h.matchId) as {
      status: string;
    };

    expect(row.status).toBe("live");
    expect(h.latestFor("alice")?.status).toBe("live");
    expect(h.latestFor("alice")?.players.map((p) => p.move.status)).toEqual([
      "choosing",
      "choosing",
    ]);
  });

  it("never shows the opponent's hand before the round resolves", () => {
    h.runtime.move("alice", h.matchId, "Rock");

    const aliceView = h.latestFor("alice");
    const bobView = h.latestFor("bob");

    // Alice sees her own hand.
    expect(aliceView?.players[0]?.move).toEqual({ status: "revealed", hand: "Rock" });
    // Bob only learns that she is locked in.
    expect(bobView?.players[0]?.move).toEqual({ status: "locked" });
    expect(JSON.stringify(bobView)).not.toContain("Rock");
  });

  it("resolves as soon as both hands are in", () => {
    h.runtime.move("alice", h.matchId, "Rock");
    h.runtime.move("bob", h.matchId, "Scissors");

    expect(h.reveals).toHaveLength(1);
    expect(h.reveals[0]).toMatchObject({
      round: 1,
      hands: { a: "Rock", b: "Scissors" },
      outcome: "a",
      scores: { a: 1, b: 0 },
    });
  });

  it("refuses a second hand in the same round", () => {
    expect(h.runtime.move("alice", h.matchId, "Rock")).toBeNull();
    expect(h.runtime.move("alice", h.matchId, "Paper")).toBe("already_moved");
  });

  it("refuses moves from somebody who is not seated", () => {
    expect(h.runtime.move("mallory", h.matchId, "Rock")).toBe("not_your_match");
    expect(h.runtime.move("alice", "no-such-match", "Rock")).toBe("match_not_found");
  });

  it("scores nothing for a draw and keeps playing", () => {
    h.playRound("Rock", "Rock");

    expect(h.reveals[0]?.outcome).toBe("draw");
    expect(h.reveals[0]?.scores).toEqual({ a: 0, b: 0 });
    expect(h.latestFor("alice")?.round).toBe(2);
    expect(h.overs).toHaveLength(0);
  });

  it("fills a missing hand at random when the timer runs out", () => {
    h.runtime.move("alice", h.matchId, "Rock");
    h.advance(MATCH_RULES.roundSeconds * 1000);

    expect(h.reveals).toHaveLength(1);
    expect(h.reveals[0]?.hands.a).toBe("Rock");
    expect(["Rock", "Paper", "Scissors"]).toContain(h.reveals[0]?.hands.b);
  });

  it("ends at first to 2 and pays the winner the loser's stake", () => {
    h.playRound("Rock", "Scissors");
    h.playRound("Rock", "Scissors");

    expect(h.overs).toHaveLength(1);
    expect(h.overs[0]).toMatchObject({ winnerSeat: "a", reason: "completed" });
    expect(h.overs[0]?.payouts).toEqual([
      { userId: "alice", delta: STAKE },
      { userId: "bob", delta: -STAKE },
    ]);

    expect(readRacWallet(h.db, "alice")).toEqual({ available: 100 + STAKE, locked: 0 });
    expect(readRacWallet(h.db, "bob")).toEqual({ available: 100 - STAKE, locked: 0 });
  });

  it("keeps the ledger equal to the available balance after settling", () => {
    h.playRound("Paper", "Rock");
    h.playRound("Paper", "Rock");

    for (const userId of ["alice", "bob"]) {
      const total = h.db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM ledger_entries WHERE user_id = ?")
        .get(userId) as { t: number };
      expect(total.t).toBe(readRacWallet(h.db, userId)?.available);
    }
  });

  it("writes every round and the final status to the database", () => {
    h.playRound("Rock", "Rock");
    h.playRound("Rock", "Scissors");
    h.playRound("Rock", "Scissors");

    const rounds = h.db
      .prepare("SELECT round, hand_a, hand_b, outcome FROM match_rounds WHERE match_id = ? ORDER BY round")
      .all(h.matchId);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toMatchObject({ round: 1, outcome: "draw" });

    const match = h.db
      .prepare("SELECT status, winner_seat FROM matches WHERE id = ?")
      .get(h.matchId) as { status: string; winner_seat: string };
    expect(match).toMatchObject({ status: "finished", winner_seat: "a" });
  });

  it("forfeits to the opponent and settles", () => {
    expect(h.runtime.forfeit("bob", h.matchId)).toBeNull();

    expect(h.overs[0]).toMatchObject({ winnerSeat: "a", reason: "forfeit" });
    expect(readRacWallet(h.db, "alice")?.available).toBe(100 + STAKE);
    expect(readRacWallet(h.db, "bob")?.available).toBe(100 - STAKE);
  });

  it("waits the full grace period before a disconnect forfeits", () => {
    h.runtime.detach("bob");

    h.advance((MATCH_RULES.disconnectGraceSeconds - 1) * 1000);
    expect(h.overs).toHaveLength(0);

    h.advance(2000);
    expect(h.overs[0]).toMatchObject({ winnerSeat: "a", reason: "disconnect" });
  });

  it("cancels the forfeit if the player reconnects in time", () => {
    h.runtime.detach("bob");
    h.advance((MATCH_RULES.disconnectGraceSeconds - 1) * 1000);

    expect(h.runtime.attach("bob")?.matchId).toBe(h.matchId);

    h.advance(MATCH_RULES.disconnectGraceSeconds * 1000 * 2);
    expect(h.overs).toHaveLength(0);
  });

  it("stops accepting moves once the match is over", () => {
    h.playRound("Rock", "Scissors");
    h.playRound("Rock", "Scissors");

    expect(h.runtime.move("alice", h.matchId, "Rock")).toBe("match_not_found");
    expect(h.runtime.size()).toBe(0);
  });

  it("records the result in match history for both players", () => {
    h.playRound("Rock", "Scissors");
    h.playRound("Rock", "Scissors");

    const forAlice = loadMatchHistory(h.db, "alice");
    const forBob = loadMatchHistory(h.db, "bob");

    expect(forAlice).toHaveLength(1);
    expect(forAlice[0]).toMatchObject({
      result: "win",
      reason: "completed",
      opponentName: "Player bob",
      yourScore: 2,
      opponentScore: 0,
      delta: STAKE,
      stake: STAKE,
    });
    expect(forBob[0]).toMatchObject({
      result: "loss",
      opponentName: "Player alice",
      yourScore: 0,
      opponentScore: 2,
      delta: -STAKE,
    });
  });

  it("hides both hands from spectators until the round resolves", () => {
    h.runtime.move("alice", h.matchId, "Rock");
    h.runtime.move("bob", h.matchId, "Scissors");

    const duringChoosing = h.spectatorStates.filter((state) => state.status === "live");
    for (const state of duringChoosing) {
      expect(state.players.every((player) => player.move.status !== "revealed")).toBe(true);
      expect(JSON.stringify(state)).not.toContain("Rock");
      expect(JSON.stringify(state)).not.toContain("Scissors");
    }

    // Spectators are never told they are a player, and get no user id back.
    expect(h.spectatorStates.every((state) => state.viewerRole === "spectator")).toBe(true);
    expect(h.spectatorStates.every((state) => state.yourUserId === undefined)).toBe(true);
  });

  it("lists a live match publicly without exposing a hand", () => {
    h.runtime.move("alice", h.matchId, "Paper");

    const listed = h.runtime.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      matchId: h.matchId,
      stake: STAKE,
      pot: STAKE * 2,
      round: 1,
    });
    expect(listed[0]?.players.map((player) => player.name)).toEqual([
      "Player alice",
      "Player bob",
    ]);
    expect(JSON.stringify(listed)).not.toContain("Paper");
  });

  it("drops a finished match out of the public list", () => {
    h.playRound("Rock", "Scissors");
    expect(h.runtime.list()).toHaveLength(1);

    h.playRound("Rock", "Scissors");
    expect(h.runtime.list()).toHaveLength(0);
  });

  it("counts down the round clock", () => {
    expect(h.latestFor("alice")?.secondsLeft).toBe(MATCH_RULES.roundSeconds);
    h.advance(3000);
    expect(h.latestFor("alice")?.secondsLeft).toBe(MATCH_RULES.roundSeconds - 3);
  });
});
