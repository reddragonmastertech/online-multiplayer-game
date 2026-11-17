import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { recordLogin } from "../auth/login-events";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { adjustBalance, lockStake, openWallets, settleMatch } from "../economy/wallet";
import { createQueuedMatch } from "../match/store";
import { linkedAccounts, loginsFor, riskReport } from "./risk";

let db: AppDatabase;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  for (const id of ["ann", "ben", "cat", "dan"]) {
    db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, 'x', 'now')").run(
      id,
      id,
      `${id}@example.test`,
    );
    openWallets(db, id, "2026-01-01T00:00:00.000Z");
    adjustBalance(db, { userId: id, currency: "usdt", amount: 100_000_000 });
  }
});

/** A settled 1 USDT match won by `winner`, as the runtime would leave it. */
function playUsdt(winner: string, loser: string) {
  for (const id of [winner, loser]) lockStake(db, { userId: id, currency: "usdt", stake: 1_000_000 });
  const { matchId } = createQueuedMatch(db, {
    gameId: "rps",
    mode: "first-to-2",
    currency: "usdt",
    stake: 1_000_000,
    players: [
      { seat: "a", userId: winner, name: winner },
      { seat: "b", userId: loser, name: loser },
    ],
  });
  settleMatch(db, { matchId, currency: "usdt", stake: 1_000_000, winnerUserId: winner, loserUserId: loser });
  db.prepare("UPDATE matches SET status = 'finished', winner_seat = 'a', finished_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    matchId,
  );
}

describe("login log and linked accounts", () => {
  it("records logins and links accounts that shared an IP", () => {
    recordLogin(db, { userId: "ann", kind: "signup", ip: "198.51.100.7", userAgent: "Firefox" });
    recordLogin(db, { userId: "ann", kind: "login", ip: "203.0.113.5" });
    recordLogin(db, { userId: "ben", kind: "signup", ip: "203.0.113.5" });
    recordLogin(db, { userId: "cat", kind: "signup", ip: "192.0.2.1" });

    expect(loginsFor(db, "ann").map((login) => login.ip).sort()).toEqual(["198.51.100.7", "203.0.113.5"]);
    expect(linkedAccounts(db, "ann")).toEqual([{ userId: "ben", name: "ben", status: "active", sharedIps: ["203.0.113.5"] }]);
    expect(linkedAccounts(db, "cat")).toEqual([]);

    expect(riskReport(db).ipClusters).toEqual([
      expect.objectContaining({ ip: "203.0.113.5", accounts: [{ userId: "ann", name: "ann" }, { userId: "ben", name: "ben" }] }),
    ]);
  });
});

describe("collusion and win-rate flags", () => {
  it("flags two players who keep meeting with one usually losing, more so on a shared IP", () => {
    for (let i = 0; i < 5; i += 1) playUsdt("ann", "ben");
    // Cat and Dan meet as often but split the results: no flag.
    for (let i = 0; i < 3; i += 1) playUsdt("cat", "dan");
    for (let i = 0; i < 3; i += 1) playUsdt("dan", "cat");
    recordLogin(db, { userId: "ann", kind: "login", ip: "203.0.113.5" });
    recordLogin(db, { userId: "ben", kind: "login", ip: "203.0.113.5" });

    expect(riskReport(db).collusion).toEqual([
      {
        winner: { userId: "ann", name: "ann" },
        loser: { userId: "ben", name: "ben" },
        matches: 5,
        winnerWins: 5,
        // Five wins of 1 USDT each, minus the 0.2 cut each time.
        netFlow: 4_000_000,
        sharedIp: true,
      },
    ]);
  });

  it("does not flag a pair below the match threshold", () => {
    for (let i = 0; i < 4; i += 1) playUsdt("ann", "ben");
    expect(riskReport(db).collusion).toEqual([]);
  });

  it("flags a win rate chance would rarely give over 20 or more matches", () => {
    // Ann beats three different players 20 times out of 21.
    const opponents = ["ben", "cat", "dan"];
    for (let i = 0; i < 20; i += 1) playUsdt("ann", opponents[i % 3]!);
    playUsdt("ben", "ann");

    const flags = riskReport(db).winRates;
    expect(flags).toEqual([{ userId: "ann", name: "ann", matches: 21, wins: 20, winRate: 20 / 21 }]);
  });
});
