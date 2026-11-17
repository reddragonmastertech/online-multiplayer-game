import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { USDT_CONTRACTS, type ChainClient, type ChainLookup } from "../deposits/chain";
import { adjustBalance, houseTotal, lockStake, openWallets, readWallet } from "../economy/wallet";
import { HttpError } from "../http/errors";
import { createWithdrawalService } from "./service";

const ANN_TRC20 = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
const STRANGER_TRC20 = "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV";
const PAYOUT_TX = "ab".repeat(32);
const BOSS = { userId: "boss", role: "owner" };
const FIN = { userId: "fin", role: "finance" };

let db: AppDatabase;
let chainAnswers: Record<string, ChainLookup>;
let service: ReturnType<typeof createWithdrawalService>;

/** Puts a payout "on the chain": `whole` USDT sent to `to`. */
function onChain(txId: string, whole: number, to = ANN_TRC20) {
  chainAnswers[txId] = {
    status: "mined",
    confirmations: 30,
    transfers: [{ contract: USDT_CONTRACTS.trc20.contract, from: STRANGER_TRC20, to, amount: BigInt(Math.round(whole * 1_000_000)) }],
  };
}

async function refusal(work: () => unknown) {
  try {
    await work();
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
    ["fin", "finance"],
  ] as const) {
    db.prepare("INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, 'x', 'now', ?)").run(
      id,
      id,
      `${id}@example.test`,
      role,
    );
    openWallets(db, id, "2026-01-01T00:00:00.000Z");
  }
  db.prepare("INSERT INTO deposit_wallets (user_id, network, address, created_at) VALUES ('ann', 'trc20', ?, 'now')").run(ANN_TRC20);
  adjustBalance(db, { userId: "ann", currency: "usdt", amount: 25_000_000 });
  chainAnswers = {};
  const chain: ChainClient = {
    lookup: async (_network, txId) => chainAnswers[txId] ?? { status: "not_found" },
    usdtBalance: async () => 0n,
    ping: async () => {},
  };
  service = createWithdrawalService({ db, chain });
});

describe("withdrawal requests", () => {
  it("locks the amount at once and pays out amount − 1% to the saved wallet", () => {
    const request = service.request("ann", "trc20", 10_000_000);

    expect(request).toMatchObject({ network: "trc20", address: ANN_TRC20, amount: 10_000_000, fee: 100_000, payout: 9_900_000, status: "pending" });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 10_000_000 });
    expect(ledgerTotal("ann")).toBe(15_000_000);
  });

  it("refuses below the 10 USDT minimum", async () => {
    expect(await refusal(() => service.request("ann", "trc20", 9_999_999))).toMatchObject({
      code: "invalid_input",
      message: "The minimum withdrawal is 10 USDT.",
    });
  });

  it("refuses more than is available, counting stakes already locked in a match", async () => {
    lockStake(db, { userId: "ann", currency: "usdt", stake: 10_000_000 });
    expect(await refusal(() => service.request("ann", "trc20", 20_000_000))).toMatchObject({ code: "insufficient_balance" });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 10_000_000 });
  });

  it("needs a saved wallet on that network", async () => {
    expect(await refusal(() => service.request("ann", "bep20", 10_000_000))).toMatchObject({
      message: expect.stringContaining("Save your BEP20 wallet"),
    });
  });

  it("allows one open request at a time, waiting or being sent", async () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    expect(await refusal(() => service.request("ann", "trc20", 10_000_000))).toMatchObject({ code: "withdrawal_pending" });
    await service.decide(BOSS, id, { action: "claim" });
    expect(await refusal(() => service.request("ann", "trc20", 10_000_000))).toMatchObject({ code: "withdrawal_pending" });
  });

  it("refuses a request while the player's USDT is frozen", async () => {
    db.prepare("UPDATE users SET usdt_frozen = 1 WHERE id = 'ann'").run();
    expect(await refusal(() => service.request("ann", "trc20", 10_000_000))).toMatchObject({ code: "forbidden" });
    expect(usdt("ann")).toEqual({ available: 25_000_000, locked: 0 });
  });
});

describe("claiming and paying", () => {
  it("pays only after a claim and a payout the chain confirms, then books the fee", async () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    onChain(PAYOUT_TX, 9.9);

    expect(await refusal(() => service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: expect.stringContaining("Claim the withdrawal first"),
    });

    expect((await service.decide(BOSS, id, { action: "claim" })).status).toBe("processing");
    const paid = await service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX.toUpperCase() });

    expect(paid).toMatchObject({ status: "paid", payoutTxId: PAYOUT_TX });
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 0 });
    expect(houseTotal(db, "usdt")).toBe(100_000);
    expect(service.adminList()[0]).toMatchObject({ userName: "ann", decidedBy: "boss", claimedBy: "boss" });
  });

  it("lets only one admin hold a claim, and only the claimer pay", async () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    onChain(PAYOUT_TX, 9.9);
    await service.decide(FIN, id, { action: "claim" });

    expect(await refusal(() => service.decide(BOSS, id, { action: "claim" }))).toMatchObject({
      message: "Another admin is already sending this one.",
    });
    expect(await refusal(() => service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: expect.stringContaining("only the admin who claimed it"),
    });

    // An owner can release someone else's claim, for example if they went home.
    await service.decide(BOSS, id, { action: "release" });
    expect(service.adminList()[0]).toMatchObject({ status: "pending", claimedBy: null });
  });

  it("refuses a payout the chain does not show reaching the player", async () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    await service.decide(BOSS, id, { action: "claim" });

    expect(await refusal(() => service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: expect.stringContaining("not on the Tron network yet"),
    });

    onChain(PAYOUT_TX, 9.9, STRANGER_TRC20);
    expect(await refusal(() => service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: expect.stringContaining("sent no USDT to the player's address"),
    });

    onChain(PAYOUT_TX, 5);
    expect(await refusal(() => service.decide(BOSS, id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: "That transaction sent 5 USDT, but the payout is 9.9 USDT.",
    });

    // Nothing moved while it was refused.
    expect(usdt("ann")).toEqual({ available: 15_000_000, locked: 10_000_000 });
    expect(service.adminList()[0]).toMatchObject({ status: "processing" });
  });

  it("rejects a request: the full amount comes back, with the reason", async () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    const rejected = await service.decide(BOSS, id, { action: "reject", reason: "Wallet looks wrong" });

    expect(rejected).toMatchObject({ status: "rejected", note: "Wallet looks wrong" });
    expect(usdt("ann")).toEqual({ available: 25_000_000, locked: 0 });
    expect(ledgerTotal("ann")).toBe(25_000_000);
    expect(houseTotal(db, "usdt")).toBe(0);
  });

  it("will not let one admin reject another admin's claim", async () => {
    const { id } = service.request("ann", "trc20", 10_000_000);
    await service.decide(FIN, id, { action: "claim" });
    expect(await refusal(() => service.decide(BOSS, id, { action: "reject", reason: "no" }))).toMatchObject({
      message: "Another admin has claimed this one.",
    });
  });

  it("will not reuse one payout transaction for two requests", async () => {
    onChain(PAYOUT_TX, 9.9);
    const first = service.request("ann", "trc20", 10_000_000);
    await service.decide(BOSS, first.id, { action: "claim" });
    await service.decide(BOSS, first.id, { action: "paid", txId: PAYOUT_TX });
    const second = service.request("ann", "trc20", 10_000_000);
    await service.decide(BOSS, second.id, { action: "claim" });

    expect(await refusal(() => service.decide(BOSS, second.id, { action: "paid", txId: PAYOUT_TX }))).toMatchObject({
      message: "That transaction ID already settles another withdrawal.",
    });
    expect(usdt("ann")).toEqual({ available: 5_000_000, locked: 10_000_000 });
  });

  it("writes every step to the audit log", async () => {
    onChain(PAYOUT_TX, 9.9);
    const { id } = service.request("ann", "trc20", 10_000_000);
    await service.decide({ ...BOSS, ip: "203.0.113.9" }, id, { action: "claim" });
    await service.decide({ ...BOSS, ip: "203.0.113.9" }, id, { action: "paid", txId: PAYOUT_TX });

    const audit = db.prepare("SELECT action, ip FROM admin_audit ORDER BY rowid").all();
    expect(audit).toEqual([
      { action: "withdrawal.claimed", ip: "203.0.113.9" },
      { action: "withdrawal.paid", ip: "203.0.113.9" },
    ]);
  });
});

describe("limits and second approval", () => {
  function withLimits(daily: number, approvalFrom: number) {
    const chain: ChainClient = {
      lookup: async (_network, txId) => chainAnswers[txId] ?? { status: "not_found" },
      usdtBalance: async () => 0n,
      ping: async () => {},
    };
    return createWithdrawalService({
      db,
      chain,
      limits: { withdrawalDailyLimit: daily * 1_000_000, secondApprovalFrom: approvalFrom * 1_000_000 },
    });
  }

  it("caps what one player can ask for in 24 hours, counting open and paid requests", async () => {
    adjustBalance(db, { userId: "ann", currency: "usdt", amount: 100_000_000 });
    const limited = withLimits(30, 0);
    const first = limited.request("ann", "trc20", 20_000_000);
    await limited.decide(BOSS, first.id, { action: "reject", reason: "test" });
    // A rejected request does not count.
    const second = limited.request("ann", "trc20", 25_000_000);
    onChain(PAYOUT_TX, 24.75);
    await limited.decide(BOSS, second.id, { action: "claim" });
    await limited.decide(BOSS, second.id, { action: "paid", txId: PAYOUT_TX });

    expect(await refusal(() => limited.request("ann", "trc20", 10_000_000))).toMatchObject({
      message: "You can withdraw up to 30 USDT in 24 hours. You can ask for 5 USDT more right now.",
    });
  });

  it("needs a second admin above the threshold: one approves, another sends", async () => {
    // Both admins have two-factor on, so a second approval is possible.
    db.prepare("UPDATE users SET totp_enabled = 1 WHERE id IN ('boss', 'fin')").run();
    const guarded = withLimits(0, 20);
    const { id } = guarded.request("ann", "trc20", 20_000_000);
    expect(guarded.adminList()[0]).toMatchObject({ needsApproval: true, approvedBy: null });

    expect(await refusal(() => guarded.decide(BOSS, id, { action: "claim" }))).toMatchObject({
      message: expect.stringContaining("another admin has to approve it"),
    });
    await guarded.decide(FIN, id, { action: "approve" });
    expect(await refusal(() => guarded.decide(FIN, id, { action: "claim" }))).toMatchObject({
      message: "You approved this one, so a different admin has to send it.",
    });
    expect((await guarded.decide(BOSS, id, { action: "claim" })).status).toBe("processing");
    expect(guarded.adminList()[0]).toMatchObject({ approvedBy: "fin", claimedBy: "boss" });
  });

  it("skips the second approval while only one admin can pay", async () => {
    db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = 'boss'").run();
    const guarded = withLimits(0, 20);
    const { id } = guarded.request("ann", "trc20", 20_000_000);
    expect(guarded.adminList()[0]).toMatchObject({ needsApproval: false });
    expect((await guarded.decide(BOSS, id, { action: "claim" })).status).toBe("processing");
  });

  it("leaves small requests alone", () => {
    db.prepare("UPDATE users SET totp_enabled = 1 WHERE id IN ('boss', 'fin')").run();
    withLimits(0, 20).request("ann", "trc20", 19_000_000);
    expect(service.adminList()[0]).toMatchObject({ needsApproval: false });
  });
});
