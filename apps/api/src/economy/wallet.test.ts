import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { createQueuedMatch, releaseUnsettledMatches } from "../match/store";
import { lockRacStake, readRacWallet, refundRacStake } from "./wallet";

function seedUser(db: AppDatabase, id: string, available: number) {
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

function ledgerTotal(db: AppDatabase, userId: string) {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries WHERE user_id = ?")
    .get(userId) as { total: number };
  return row.total;
}

describe("rac stake locking", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateSqlite(db);
  });

  it("moves the stake from available to locked", () => {
    seedUser(db, "alice", 100);

    const result = lockRacStake(db, { userId: "alice", stake: 5 });

    expect(result.ok).toBe(true);
    expect(readRacWallet(db, "alice")).toEqual({ available: 95, locked: 5 });
  });

  it("keeps the ledger equal to the available balance", () => {
    seedUser(db, "alice", 100);

    lockRacStake(db, { userId: "alice", stake: 10 });
    expect(ledgerTotal(db, "alice")).toBe(90);

    refundRacStake(db, { userId: "alice", stake: 10 });
    expect(ledgerTotal(db, "alice")).toBe(100);
  });

  it("refuses to lock more than is available and changes nothing", () => {
    seedUser(db, "broke", 3);

    const result = lockRacStake(db, { userId: "broke", stake: 5 });

    expect(result).toEqual({ ok: false, reason: "insufficient_balance" });
    expect(readRacWallet(db, "broke")).toEqual({ available: 3, locked: 0 });
    expect(ledgerTotal(db, "broke")).toBe(3);
  });

  it("locks repeatedly only while RAC lasts", () => {
    seedUser(db, "alice", 2);

    expect(lockRacStake(db, { userId: "alice", stake: 1 }).ok).toBe(true);
    expect(lockRacStake(db, { userId: "alice", stake: 1 }).ok).toBe(true);
    expect(lockRacStake(db, { userId: "alice", stake: 1 }).ok).toBe(false);
    expect(readRacWallet(db, "alice")).toEqual({ available: 0, locked: 2 });
  });

  it("never invents RAC when there is nothing locked to refund", () => {
    seedUser(db, "alice", 100);

    const result = refundRacStake(db, { userId: "alice", stake: 5 });

    expect(result.ok).toBe(false);
    expect(readRacWallet(db, "alice")).toEqual({ available: 100, locked: 0 });
  });

  it("reports a missing wallet instead of failing silently", () => {
    expect(lockRacStake(db, { userId: "ghost", stake: 1 })).toEqual({
      ok: false,
      reason: "no_wallet",
    });
  });
});

describe("restart recovery", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateSqlite(db);
    seedUser(db, "alice", 100);
    seedUser(db, "bob", 100);
  });

  it("refunds and cancels a match the previous process could not finish", () => {
    lockRacStake(db, { userId: "alice", stake: 5 });
    lockRacStake(db, { userId: "bob", stake: 5 });
    const { matchId } = createQueuedMatch(db, {
      gameId: "rps",
      mode: "first-to-2",
      currency: "rac",
      stake: 5,
      players: [
        { seat: "a", userId: "alice", name: "Player alice" },
        { seat: "b", userId: "bob", name: "Player bob" },
      ],
    });

    const released = releaseUnsettledMatches(db);

    expect(released).toEqual({ matches: 1, refunded: 2 });
    expect(readRacWallet(db, "alice")).toEqual({ available: 100, locked: 0 });
    expect(readRacWallet(db, "bob")).toEqual({ available: 100, locked: 0 });

    const row = db.prepare("SELECT status FROM matches WHERE id = ?").get(matchId) as {
      status: string;
    };
    expect(row.status).toBe("cancelled");
  });

  it("is a no-op when nothing is unsettled", () => {
    expect(releaseUnsettledMatches(db)).toEqual({ matches: 0, refunded: 0 });
    expect(readRacWallet(db, "alice")).toEqual({ available: 100, locked: 0 });
  });

  it("does not refund a second time if it runs twice", () => {
    lockRacStake(db, { userId: "alice", stake: 1 });
    lockRacStake(db, { userId: "bob", stake: 1 });
    createQueuedMatch(db, {
      gameId: "rps",
      mode: "first-to-2",
      currency: "rac",
      stake: 1,
      players: [
        { seat: "a", userId: "alice", name: "Player alice" },
        { seat: "b", userId: "bob", name: "Player bob" },
      ],
    });

    releaseUnsettledMatches(db);
    expect(releaseUnsettledMatches(db)).toEqual({ matches: 0, refunded: 0 });
    expect(readRacWallet(db, "alice")).toEqual({ available: 100, locked: 0 });
  });
});
