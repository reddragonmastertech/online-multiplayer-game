import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { adjustBalance, houseTotal, lockStake, openWallets, readWallet } from "../economy/wallet";
import { HttpError } from "../http/errors";
import { createWithdrawalService } from "./service";

const ANN_TRC20 = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
const PAYOUT_TX = "ab".repeat(32);
const BOSS = { userId: "boss" };

let db: AppDatabase;
let service: ReturnType<typeof createWithdrawalService>;

function refusal(work: () => unknown) {
  try {
    work();
  } catch (error) {
    if (error instanceof HttpError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected a refusal");
}

function usdt(userId: string) {
  return readWallet(db, userId, "usdt");
}

function ledgerTotal(userId: string) {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries WHERE user_id = ? AND currency = 'usdt'")
    .get(userId) as { total: number };
  return row.total;
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  for (const [id, role] of [
    ["ann", null],
    ["boss", "owner"],
  ] as const) {
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, 'x', 'now', ?)",
    ).run(id, id, `${id}@example.test`, role);
    openWallets(db, id, "2026-01-01T00:00:00.000Z");
  }
  db.prepare("INSERT INTO deposit_wallets (user_id, network, address, created_at) VALUES ('ann', 'trc20', ?, 'now')").run(
    ANN_TRC20,
  );
  adjustBalance(db, { userId: "ann", currency: "usdt", amount: 25_000_000 });
  service = createWithdrawalService({ db });
});

describe("withdrawal requests", () => {
  it("locks the amount at once and pays out amount − 1% to the saved wallet", () => {
    const request = service.request("ann", "trc20", 10_000_000);

    expect(request).toMatchObject({
      network: "trc20",
      address: ANN_TRC20,
      amount: 10_000_000,
      fee: 100_000,
      payout: 9_900_000,
      status: "pending",
    });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 10_000_000 });
    expect(ledgerTotal("ann")).toBe(15_000_000);
  });

  it("refuses below the 10 USDT minimum", () => {
    expect(refusal(() => service.request("ann", "trc20", 9_999_999))).toMatchObject({
      code: "invalid_input",
      message: "The minimum withdrawal is 10 USDT.",
    });
  });

  it("refuses more than is available, counting stakes already locked in a match", () => {
    lockStake(db, { userId: "ann", currency: "usdt", stake: 10_000_000 });

    expect(refusal(() => service.request("ann", "trc20", 20_000_000))).toMatchObject({ code: "insufficient_balance" });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 10_000_000 });
  });

  it("needs a saved wallet on that network", () => {
    expect(refusal(() => service.request("ann", "bep20", 10_000_000))).toMatchObject({
      code: "invalid_input",
      message: expect.stringContaining("Save your BEP20 wallet"),
    });
  });

  it("allows one waiting request at a time", () => {
    service.request("ann", "trc20", 10_000_000);
    expect(refusal(() => service.request("ann", "trc20", 10_000_000))).toMatchObject({ code: "withdrawal_pending" });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 10_000_000 });
  });
});

describe("admin decisions", () => {
  it("marks a request paid: the money leaves, the fee goes to the house", () => {
    const { id } = service.request("ann", "trc20", 10_000_000);

    const paid = service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX.toUpperCase() });

    expect(paid).toMatchObject({ status: "paid", payoutTxId: PAYOUT_TX });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 0 });
    expect(houseTotal(db, "usdt")).toBe(100_000);
    expect(service.list("ann")[0]).toMatchObject({ status: "paid" });
    expect(service.adminList()[0]).toMatchObject({ userName: "ann", decidedBy: "boss" });
  });

  it("rejects a request: the full amount comes back, with the reason", () => {
    const { id } = service.request("ann", "trc20", 10_000_000);

    const rejected = service.decide(BOSS, id, { action: "reject", reason: "Wallet looks wrong" });

    expect(rejected).toMatchObject({ status: "rejected", note: "Wallet looks wrong" });
    expect(usdt("ann")).toEqual({ available: 25_000_000, locked: 0 });
    expect(ledgerTotal("ann")).toBe(25_000_000);
    expect(houseTotal(db, "usdt")).toBe(0);

    // The player may ask again once nothing is waiting.
    expect(service.request("ann", "trc20", 10_000_000).status).toBe("pending");
  });

  it("decides a request only once", () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX });

    expect(refusal(() => service.decide(BOSS, id, { action: "reject", reason: "oops" }))).toMatchObject({
      message: "That withdrawal is already paid.",
    });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 0 });
  });

  it("will not reuse one payout transaction for two requests", () => {
    const first = service.request("ann", "trc20", 10_000_000);
    service.decide(BOSS, first.id, { action: "paid", txId: PAYOUT_TX });
    const second = service.request("ann", "trc20", 10_000_000);

    expect(refusal(() => service.decide(BOSS, second.id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: "That transaction ID already settles another withdrawal.",
    });
    // The failed decision rolled back: still pending, still locked.
    expect(service.list("ann")[0]).toMatchObject({ id: second.id, status: "pending" });
    expect(usdt("ann")).toEqual({ available: 5_000_000, locked: 10_000_000 });
  });

  it("checks the payout transaction ID's shape for the network", () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    expect(refusal(() => service.decide(BOSS, id, { action: "paid", txId: "nope" }))).toMatchObject({
      code: "invalid_input",
    });
  });

  it("refuses a request while the player's USDT is frozen", () => {
    db.prepare("UPDATE users SET usdt_frozen = 1 WHERE id = 'ann'").run();

    expect(refusal(() => service.request("ann", "trc20", 10_000_000))).toMatchObject({ code: "forbidden" });
    expect(usdt("ann")).toEqual({ available: 25_000_000, locked: 0 });
  });

  it("writes every decision to the audit log", () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    service.decide({ userId: "boss", ip: "203.0.113.9" }, id, { action: "paid", txId: PAYOUT_TX });

    const audit = db.prepare("SELECT admin_id, action, target_user_id, ip FROM admin_audit").all();
    expect(audit).toEqual([{ admin_id: "boss", action: "withdrawal.paid", target_user_id: "ann", ip: "203.0.113.9" }]);
  });
});
