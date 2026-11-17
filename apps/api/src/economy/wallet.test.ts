import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { createQueuedMatch, releaseUnsettledMatches } from "../match/store";
import { adjustBalance, lockStake, openWallets, readWallet, readWallets, refundStake } from "./wallet";

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

    const result = lockStake(db, { userId: "alice", currency: "rac", stake: 5 });

    expect(result.ok).toBe(true);
    expect(readWallet(db, "alice", "rac")).toEqual({ available: 95, locked: 5 });
  });

  it("keeps the ledger equal to the available balance", () => {
    seedUser(db, "alice", 100);

    lockStake(db, { userId: "alice", currency: "rac", stake: 10 });
    expect(ledgerTotal(db, "alice")).toBe(90);

    refundStake(db, { userId: "alice", currency: "rac", stake: 10 });
    expect(ledgerTotal(db, "alice")).toBe(100);
  });

  it("refuses to lock more than is available and changes nothing", () => {
    seedUser(db, "broke", 3);

    const result = lockStake(db, { userId: "broke", currency: "rac", stake: 5 });

    expect(result).toEqual({ ok: false, reason: "insufficient_balance" });
    expect(readWallet(db, "broke", "rac")).toEqual({ available: 3, locked: 0 });
    expect(ledgerTotal(db, "broke")).toBe(3);
  });

  it("locks repeatedly only while RAC lasts", () => {
    seedUser(db, "alice", 2);

    expect(lockStake(db, { userId: "alice", currency: "rac", stake: 1 }).ok).toBe(true);
    expect(lockStake(db, { userId: "alice", currency: "rac", stake: 1 }).ok).toBe(true);
    expect(lockStake(db, { userId: "alice", currency: "rac", stake: 1 }).ok).toBe(false);
    expect(readWallet(db, "alice", "rac")).toEqual({ available: 0, locked: 2 });
  });

  it("never invents RAC when there is nothing locked to refund", () => {
    seedUser(db, "alice", 100);

    const result = refundStake(db, { userId: "alice", currency: "rac", stake: 5 });

    expect(result.ok).toBe(false);
    expect(readWallet(db, "alice", "rac")).toEqual({ available: 100, locked: 0 });
  });

  it("reports a missing wallet instead of failing silently", () => {
    expect(lockStake(db, { userId: "ghost", currency: "rac", stake: 1 })).toEqual({
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
    lockStake(db, { userId: "alice", currency: "rac", stake: 5 });
    lockStake(db, { userId: "bob", currency: "rac", stake: 5 });
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
    expect(readWallet(db, "alice", "rac")).toEqual({ available: 100, locked: 0 });
    expect(readWallet(db, "bob", "rac")).toEqual({ available: 100, locked: 0 });

    const row = db.prepare("SELECT status FROM matches WHERE id = ?").get(matchId) as {
      status: string;
    };
    expect(row.status).toBe("cancelled");
  });

  it("is a no-op when nothing is unsettled", () => {
    expect(releaseUnsettledMatches(db)).toEqual({ matches: 0, refunded: 0 });
    expect(readWallet(db, "alice", "rac")).toEqual({ available: 100, locked: 0 });
  });

  it("does not refund a second time if it runs twice", () => {
    lockStake(db, { userId: "alice", currency: "rac", stake: 1 });
    lockStake(db, { userId: "bob", currency: "rac", stake: 1 });
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
    expect(readWallet(db, "alice", "rac")).toEqual({ available: 100, locked: 0 });
  });
});

describe("two currencies", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateSqlite(db);
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ('ann', 'Ann', 'ann@example.test', 'x', 'now')",
    ).run();
    openWallets(db, "ann", "2026-01-01T00:00:00.000Z");
  });

  it("opens a new account with 100 RAC and 0 USDT", () => {
    expect(readWallets(db, "ann")).toEqual([
      { currency: "rac", available: 100, locked: 0 },
      { currency: "usdt", available: 0, locked: 0 },
    ]);
  });

  it("cannot stake USDT with a RAC balance", () => {
    expect(lockStake(db, { userId: "ann", currency: "usdt", stake: 200_000 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
    expect(readWallet(db, "ann", "rac")).toEqual({ available: 100, locked: 0 });
  });

  it("locks and refunds in one currency without touching the other", () => {
    db.prepare("UPDATE wallets SET available = 5000000 WHERE user_id = 'ann' AND currency = 'usdt'").run();

    expect(lockStake(db, { userId: "ann", currency: "usdt", stake: 500_000 }).ok).toBe(true);
    expect(readWallet(db, "ann", "usdt")).toEqual({ available: 4_500_000, locked: 500_000 });
    expect(readWallet(db, "ann", "rac")).toEqual({ available: 100, locked: 0 });

    // A RAC refund cannot release USDT that is locked.
    expect(refundStake(db, { userId: "ann", currency: "rac", stake: 500_000 }).ok).toBe(false);

    expect(refundStake(db, { userId: "ann", currency: "usdt", stake: 500_000 }).ok).toBe(true);
    expect(readWallet(db, "ann", "usdt")).toEqual({ available: 5_000_000, locked: 0 });
  });
});

describe("adjustBalance (the admin script)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateSqlite(db);
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ('ann', 'Ann', 'ann@example.test', 'x', 'now')",
    ).run();
    openWallets(db, "ann", "2026-01-01T00:00:00.000Z");
  });

  it("credits one currency and records an adjustment row", () => {
    expect(adjustBalance(db, { userId: "ann", currency: "usdt", amount: 5_000_000 }).ok).toBe(true);
    expect(readWallet(db, "ann", "usdt")).toEqual({ available: 5_000_000, locked: 0 });
    expect(readWallet(db, "ann", "rac")).toEqual({ available: 100, locked: 0 });

    const rows = db
      .prepare("SELECT kind, amount FROM ledger_entries WHERE user_id = 'ann' AND currency = 'usdt'")
      .all();
    expect(rows).toEqual([{ kind: "adjustment", amount: 5_000_000 }]);
  });

  it("refuses to take a balance below zero", () => {
    expect(adjustBalance(db, { userId: "ann", currency: "usdt", amount: -1 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
  });
});
