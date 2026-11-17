import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { USDT_CONTRACTS, type ChainClient, type ChainLookup } from "../deposits/chain";
import { createDepositService } from "../deposits/service";
import { adjustBalance, lockStake, openWallets, settleMatch } from "../economy/wallet";
import { HttpError } from "../http/errors";
import { createQueuedMatch } from "../match/store";
import { createWithdrawalService } from "../withdrawals/service";
import { checkSolvency, createBackup, houseAvailable, lastBackup, reconcileUsdt, recordSweep } from "./books";

const OURS = "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV";
const ANN = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
const USDT = USDT_CONTRACTS.trc20.contract;

let db: AppDatabase;
let answers: Record<string, ChainLookup>;
let balances: Record<string, bigint>;
let chain: ChainClient;
const dirs: string[] = [];

const transfer = (from: string, to: string, whole: number) => ({ contract: USDT, from, to, amount: BigInt(whole * 1_000_000) });

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  for (const [id, role] of [
    ["ann", null],
    ["bob", null],
    ["boss", "owner"],
  ] as const) {
    db.prepare("INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, 'x', 'now', ?)").run(
      id,
      id,
      `${id}@example.test`,
      role,
    );
    openWallets(db, id, "2026-01-01T00:00:00.000Z");
  }
  answers = {};
  balances = {};
  chain = {
    lookup: async (_network, txId) => answers[txId] ?? { status: "not_found" },
    usdtBalance: async (_network, address) => balances[address] ?? 0n,
    ping: async () => {},
  };
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the USDT books", () => {
  it("balance through a deposit, a match, a withdrawal and a sweep, and catch tampering", async () => {
    const deposits = createDepositService({ db, chain, addresses: { trc20: OURS } });
    const withdrawals = createWithdrawalService({ db, chain });

    // Deposit 20 USDT: Ann gets 19.8, the house 0.2.
    deposits.saveWallet("ann", "trc20", ANN);
    answers["aa".repeat(32)] = { status: "mined", confirmations: 30, transfers: [transfer(ANN, OURS, 20)] };
    await deposits.claim("ann", "trc20", "aa".repeat(32));
    expect(reconcileUsdt(db)).toMatchObject({ ok: true, difference: 0 });

    // A 1 USDT match against Bob, who was given 5 by an admin: house +0.2.
    adjustBalance(db, { userId: "bob", currency: "usdt", amount: 5_000_000 });
    for (const id of ["ann", "bob"]) lockStake(db, { userId: id, currency: "usdt", stake: 1_000_000 });
    const { matchId } = createQueuedMatch(db, {
      gameId: "rps",
      mode: "first-to-2",
      currency: "usdt",
      stake: 1_000_000,
      players: [
        { seat: "a", userId: "ann", name: "ann" },
        { seat: "b", userId: "bob", name: "bob" },
      ],
    });
    settleMatch(db, { matchId, currency: "usdt", stake: 1_000_000, winnerUserId: "ann", loserUserId: "bob" });
    expect(reconcileUsdt(db).ok).toBe(true);

    // A 10 USDT withdrawal, paid on-chain: house +0.1.
    const request = withdrawals.request("ann", "trc20", 10_000_000);
    await withdrawals.decide({ userId: "boss", role: "owner" }, request.id, { action: "claim" });
    answers["bb".repeat(32)] = { status: "mined", confirmations: 30, transfers: [transfer(OURS, ANN, 9.9)] };
    await withdrawals.decide({ userId: "boss", role: "owner" }, request.id, { action: "paid", txId: "bb".repeat(32) });
    expect(reconcileUsdt(db).ok).toBe(true);

    // The owner sweeps 0.3 of the 0.5 earned.
    expect(houseAvailable(db)).toBe(500_000);
    recordSweep(db, { userId: "boss" }, 300_000, "To cold wallet");
    expect(houseAvailable(db)).toBe(200_000);
    expect(() => recordSweep(db, { userId: "boss" }, 300_000, "Too much")).toThrow(HttpError);

    const books = reconcileUsdt(db);
    expect(books).toMatchObject({ ok: true, difference: 0 });
    expect(books.expected).toMatchObject({ deposits: 20_000_000, adjustments: 5_000_000, payouts: 9_900_000 });

    // Someone edits a balance straight in the database: the books notice.
    db.prepare("UPDATE wallets SET available = available + 1000000 WHERE user_id = 'bob' AND currency = 'usdt'").run();
    expect(reconcileUsdt(db)).toMatchObject({ ok: false, difference: 1_000_000 });
  });

  it("compares what the receiving wallet holds with what is owed", async () => {
    adjustBalance(db, { userId: "ann", currency: "usdt", amount: 7_000_000 });
    balances[OURS] = 10_000_000n;

    const report = await checkSolvency(db, chain, { trc20: OURS });
    expect(report).toMatchObject({ onChain: 10_000_000, owed: { players: 7_000_000, house: 0, total: 7_000_000 }, margin: 3_000_000 });

    chain.usdtBalance = async () => {
      throw new Error("down");
    };
    const down = await checkSolvency(db, chain, { trc20: OURS });
    expect(down.networks[0]).toMatchObject({ network: "trc20", reachable: false, balance: null });
  });
});

describe("deposit tools", () => {
  it("credits a deposit by hand that the normal claim refuses, once", async () => {
    const deposits = createDepositService({ db, chain, addresses: { trc20: OURS } });
    // 2 USDT, under the minimum, from a wallet Ann never saved.
    answers["cc".repeat(32)] = { status: "mined", confirmations: 30, transfers: [transfer("TStrangerWallet", OURS, 2)] };

    await expect(deposits.claim("ann", "trc20", "cc".repeat(32))).rejects.toThrow();
    expect(deposits.attempts("ann")[0]).toMatchObject({ code: "invalid_input", txId: "cc".repeat(32) });

    const credited = await deposits.manualCredit({ userId: "boss" }, "ann", "trc20", "cc".repeat(32), "Sent from an exchange");
    expect(credited).toMatchObject({ amount: 2_000_000, fee: 20_000, credited: 1_980_000 });
    expect(deposits.adminList()[0]).toMatchObject({ userName: "ann", manual: true });
    await expect(deposits.manualCredit({ userId: "boss" }, "ann", "trc20", "cc".repeat(32), "again")).rejects.toThrow(
      "already been credited",
    );
    expect(reconcileUsdt(db).ok).toBe(true);
  });
});

describe("backups", () => {
  it("writes a consistent copy, records it, and keeps only the newest", () => {
    const dir = mkdtempSync(join(tmpdir(), "arena-backups-"));
    dirs.push(dir);
    expect(lastBackup(db)).toBeNull();

    for (const hour of [1, 2, 3]) {
      createBackup(db, { dir, keep: 2 }, null, new Date(`2026-11-17T0${hour}:00:00.000Z`));
    }

    const files = readdirSync(dir).sort();
    expect(files).toEqual(["game-20261117-020000.db", "game-20261117-030000.db"]);
    expect(lastBackup(db)?.file).toBe(join(dir, "game-20261117-030000.db"));

    // The copy opens and holds the data.
    const copy = new DatabaseSync(join(dir, "game-20261117-030000.db"));
    expect((copy.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(3);
    copy.close();
    expect(existsSync(join(dir, "game-20261117-010000.db"))).toBe(false);
  });
});

