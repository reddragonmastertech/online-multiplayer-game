import { DatabaseSync } from "node:sqlite";
import type { DepositNetwork } from "@game-platform/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/client";
import { migrateSqlite } from "../db/migrate";
import { houseTotal, openWallets, readWallet } from "../economy/wallet";
import { HttpError } from "../http/errors";
import { ChainUnavailableError, USDT_CONTRACTS, type ChainClient, type ChainLookup } from "./chain";
import { createDepositService, type ReceivingAddresses } from "./service";
import { tronHexToBase58 } from "./tron";

/** The chain is faked: each test says what the network would answer. */

const OURS = {
  erc20: "0x1111111111111111111111111111111111111111",
  bep20: "0x1111111111111111111111111111111111111111",
  trc20: tronHexToBase58(`41${"11".repeat(20)}`),
};
const ANN_WALLET = {
  erc20: "0x2222222222222222222222222222222222222222",
  bep20: "0x2222222222222222222222222222222222222222",
  trc20: tronHexToBase58(`41${"22".repeat(20)}`),
};
const STRANGER = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}`;
const TRON_TX = "cd".repeat(32);

function usdt(network: DepositNetwork, whole: number) {
  const decimals = BigInt(USDT_CONTRACTS[network].decimals);
  return (BigInt(Math.round(whole * 1_000_000)) * 10n ** decimals) / 1_000_000n;
}

function mined(
  network: DepositNetwork,
  whole: number,
  overrides: Partial<{ from: string; to: string; contract: string; confirmations: number }> = {},
): ChainLookup {
  return {
    status: "mined",
    confirmations: overrides.confirmations ?? 50,
    transfers: [
      {
        contract: overrides.contract ?? USDT_CONTRACTS[network].contract,
        from: overrides.from ?? ANN_WALLET[network],
        to: overrides.to ?? OURS[network],
        amount: usdt(network, whole),
      },
    ],
  };
}

function setup(answers: Record<string, ChainLookup | Error> = {}, addresses: ReceivingAddresses = OURS) {
  const db: AppDatabase = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  for (const id of ["ann", "bob"]) {
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, 'x', 'now')",
    ).run(id, id, `${id}@example.test`);
    openWallets(db, id, "2026-01-01T00:00:00.000Z");
  }
  const lookups: string[] = [];
  const chain: ChainClient = {
    usdtBalance: async () => 0n,
    ping: async () => {},
    async lookup(_network, txId) {
      lookups.push(txId);
      const answer = answers[txId];
      if (answer instanceof Error) throw answer;
      return answer ?? { status: "not_found" };
    },
  };
  const service = createDepositService({ db, chain, addresses });
  return { db, service, lookups };
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected the claim to be refused");
}

describe("deposit claims", () => {
  it("credits a good TRC20 deposit minus 1% and records it", async () => {
    const { db, service } = setup({ [TRON_TX]: mined("trc20", 10) });
    service.saveWallet("ann", "trc20", ANN_WALLET.trc20);

    const deposit = await service.claim("ann", "trc20", TRON_TX.toUpperCase());

    expect(deposit).toMatchObject({ network: "trc20", txId: TRON_TX, amount: 10_000_000, fee: 100_000, credited: 9_900_000 });
    expect(readWallet(db, "ann", "usdt")).toEqual({ available: 9_900_000, locked: 0 });
    expect(readWallet(db, "ann", "rac")).toEqual({ available: 100, locked: 0 });
    expect(houseTotal(db, "usdt")).toBe(100_000);
    expect(service.overview("ann").deposits).toHaveLength(1);

    const ledger = db
      .prepare("SELECT SUM(amount) AS total FROM ledger_entries WHERE user_id = 'ann' AND currency = 'usdt'")
      .get() as { total: number };
    expect(ledger.total).toBe(9_900_000);
  });

  it("reads BEP20's 18-decimal USDT correctly", async () => {
    const { db, service } = setup({ [TX]: mined("bep20", 5) });
    service.saveWallet("ann", "bep20", ANN_WALLET.bep20);

    await service.claim("ann", "bep20", TX);
    expect(readWallet(db, "ann", "usdt")?.available).toBe(4_950_000);
  });

  it("never credits the same transaction twice", async () => {
    const { db, service } = setup({ [TX]: mined("erc20", 10) });
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);
    await service.claim("ann", "erc20", TX);

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({ code: "already_claimed" });
    expect(readWallet(db, "ann", "usdt")?.available).toBe(9_900_000);
  });

  it("refuses a transfer to someone else's address", async () => {
    const { db, service } = setup({ [TX]: mined("erc20", 10, { to: STRANGER }) });
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({
      code: "deposit_rejected",
      message: "That transaction did not send USDT to our ERC20 address.",
    });
    expect(readWallet(db, "ann", "usdt")?.available).toBe(0);
  });

  it("refuses a look-alike token", async () => {
    const { service } = setup({ [TX]: mined("erc20", 10, { contract: "0x9999999999999999999999999999999999999999" }) });
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({
      code: "deposit_rejected",
      message: expect.stringContaining("Look-alike tokens"),
    });
  });

  it("refuses a payment from another wallet, so a public TxID cannot be stolen", async () => {
    // Ann paid. Bob saw the TxID on a block explorer and tries to claim it.
    const { db, service } = setup({ [TX]: mined("erc20", 10) });
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);
    service.saveWallet("bob", "erc20", STRANGER);

    expect(await refusal(service.claim("bob", "erc20", TX))).toMatchObject({ code: "deposit_rejected" });
    expect(readWallet(db, "bob", "usdt")?.available).toBe(0);

    // Ann can still claim her own payment.
    await service.claim("ann", "erc20", TX);
    expect(readWallet(db, "ann", "usdt")?.available).toBe(9_900_000);
  });

  it("will not let a second account save a wallet that is already taken", () => {
    const { service } = setup();
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);

    expect(() => service.saveWallet("bob", "erc20", ANN_WALLET.erc20.toUpperCase().replace("0X", "0x"))).toThrow(
      /already saved on another account/,
    );
  });

  it("refuses a deposit under the 3 USDT minimum", async () => {
    const { db, service } = setup({ [TX]: mined("erc20", 2.99) });
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({
      code: "deposit_rejected",
      message: expect.stringContaining("under 3 USDT"),
    });
    expect(readWallet(db, "ann", "usdt")?.available).toBe(0);
  });

  it("asks to wait while confirmations are too few, then credits", async () => {
    const answers: Record<string, ChainLookup> = { [TX]: mined("erc20", 10, { confirmations: 3 }) };
    const { db, service } = setup(answers);
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({
      code: "deposit_pending",
      message: "Found it: 10 USDT. It has 3 of 12 confirmations. Try again in a few minutes.",
    });
    expect(readWallet(db, "ann", "usdt")?.available).toBe(0);

    answers[TX] = mined("erc20", 10, { confirmations: 12 });
    await service.claim("ann", "erc20", TX);
    expect(readWallet(db, "ann", "usdt")?.available).toBe(9_900_000);
  });

  it("explains a transaction that is not on the chain, failed, or could not be checked", async () => {
    const tx2 = `0x${"ef".repeat(32)}`;
    const tx3 = `0x${"12".repeat(32)}`;
    const { service } = setup({ [tx2]: { status: "failed" }, [tx3]: new ChainUnavailableError("down") });
    service.saveWallet("ann", "erc20", ANN_WALLET.erc20);

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({ code: "deposit_pending" });
    expect(await refusal(service.claim("ann", "erc20", tx2))).toMatchObject({ code: "deposit_rejected" });
    expect(await refusal(service.claim("ann", "erc20", tx3))).toMatchObject({
      code: "deposit_pending",
      message: expect.stringContaining("could not reach"),
    });
  });

  it("checks the basics before asking the chain", async () => {
    const { service, lookups } = setup({}, { trc20: OURS.trc20 });

    expect(await refusal(service.claim("ann", "erc20", TX))).toMatchObject({ code: "deposit_closed" });
    expect(await refusal(service.claim("ann", "trc20", "not-a-tx"))).toMatchObject({ code: "invalid_input" });
    expect(await refusal(service.claim("ann", "trc20", TRON_TX))).toMatchObject({
      code: "invalid_input",
      message: "Save the TRC20 wallet you pay from first.",
    });
    expect(lookups).toEqual([]);
  });

  it("validates saved wallets, including the Tron checksum", () => {
    const { service } = setup();

    expect(() => service.saveWallet("ann", "trc20", "0x2222222222222222222222222222222222222222")).toThrow(/valid TRC20/);
    expect(() => service.saveWallet("ann", "trc20", `${ANN_WALLET.trc20.slice(0, -1)}x`)).toThrow(/valid TRC20/);
    expect(() => service.saveWallet("ann", "erc20", OURS.erc20)).toThrow(/our receiving address/);
    expect(service.saveWallet("ann", "erc20", ANN_WALLET.erc20.toUpperCase().replace("0X", "0x"))).toEqual({
      network: "erc20",
      address: ANN_WALLET.erc20,
    });
  });
});
