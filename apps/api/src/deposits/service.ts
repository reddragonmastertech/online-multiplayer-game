import { randomUUID } from "node:crypto";
import {
  DEPOSIT_RULES,
  NETWORK_INFO,
  depositFee,
  depositNetworks,
  formatAmount,
  isNetworkAddress,
  normalizeTxId,
  type DepositNetwork,
  type DepositOverview,
  type DepositRecord,
} from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { creditDeposit } from "../economy/wallet";
import { HttpError, invalidInput } from "../http/errors";
import {
  ChainUnavailableError,
  USDT_CONTRACTS,
  canonicalAddress,
  toUsdtUnits,
  type ChainClient,
} from "./chain";
import { tronBase58ToHex } from "./tron";

/** Our receiving address per network. A missing one means that network is closed. */
export type ReceivingAddresses = Partial<Record<DepositNetwork, string>>;

type DepositRow = {
  id: string;
  network: DepositNetwork;
  tx_id: string;
  from_address: string;
  amount: number;
  fee: number;
  credited: number;
  created_at: string;
};

function toRecord(row: DepositRow): DepositRecord {
  return {
    id: row.id,
    network: row.network,
    txId: row.tx_id,
    fromAddress: row.from_address,
    amount: row.amount,
    fee: row.fee,
    credited: row.credited,
    createdAt: row.created_at,
  };
}

function short(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

const rejected = (message: string) => new HttpError(422, "deposit_rejected", message);
const pending = (message: string) => new HttpError(409, "deposit_pending", message);

/** True for a well-formed address on that network (Tron includes the checksum). */
export function isValidAddress(network: DepositNetwork, address: string) {
  if (!isNetworkAddress(network, address)) return false;
  return network === "trc20" ? tronBase58ToHex(address) !== undefined : true;
}

export function createDepositService(deps: {
  db: AppDatabase;
  chain: ChainClient;
  addresses: ReceivingAddresses;
  now?: () => string;
}) {
  const { db, chain, addresses } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  function savedWallet(userId: string, network: DepositNetwork) {
    const row = db
      .prepare("SELECT address FROM deposit_wallets WHERE user_id = ? AND network = ?")
      .get(userId, network) as { address: string } | undefined;
    return row?.address;
  }

  function overview(userId: string): DepositOverview {
    const wallets = db
      .prepare("SELECT network, address FROM deposit_wallets WHERE user_id = ? ORDER BY network")
      .all(userId) as { network: DepositNetwork; address: string }[];
    const deposits = db
      .prepare(
        `SELECT id, network, tx_id, from_address, amount, fee, credited, created_at
         FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .all(userId) as DepositRow[];

    return {
      networks: depositNetworks.map((network) => ({
        network,
        address: addresses[network] ?? null,
        confirmations: NETWORK_INFO[network].confirmations,
      })),
      wallets: wallets.map((wallet) => ({ network: wallet.network, address: wallet.address })),
      deposits: deposits.map(toRecord),
      minimum: DEPOSIT_RULES.minimum,
      feeBps: DEPOSIT_RULES.feeBps,
    };
  }

  /**
   * Saves the wallet a player will pay from. A transaction ID is public, so
   * this is what stops someone claiming another person's payment: only a
   * transfer **from** this address is credited, and an address can belong to
   * one account only.
   */
  function saveWallet(userId: string, network: DepositNetwork, rawAddress: string) {
    const address = rawAddress.trim();
    const label = NETWORK_INFO[network].label;
    if (!isValidAddress(network, address)) {
      throw invalidInput(
        network === "trc20"
          ? "That is not a valid TRC20 address. It starts with T and has 34 characters."
          : `That is not a valid ${label} address. It starts with 0x and has 42 characters.`,
      );
    }
    const canonical = canonicalAddress(network, address);
    if (addresses[network] && canonicalAddress(network, addresses[network]) === canonical) {
      throw invalidInput("That is our receiving address. Enter the wallet you send from.");
    }

    const owner = db
      .prepare("SELECT user_id FROM deposit_wallets WHERE network = ? AND address = ?")
      .get(network, canonical) as { user_id: string } | undefined;
    if (owner && owner.user_id !== userId) {
      throw new HttpError(
        409,
        "wallet_taken",
        "That wallet is already saved on another account. Contact support if it is yours.",
      );
    }

    db.prepare(
      `INSERT INTO deposit_wallets (user_id, network, address, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, network) DO UPDATE SET address = excluded.address, created_at = excluded.created_at`,
    ).run(userId, network, canonical, now());
    return { network, address: canonical };
  }

  function claimedBy(network: DepositNetwork, txId: string) {
    return db
      .prepare(
        `SELECT id, user_id, network, tx_id, from_address, amount, fee, credited, created_at
         FROM deposits WHERE network = ? AND tx_id = ?`,
      )
      .get(network, txId) as (DepositRow & { user_id: string }) | undefined;
  }

  /**
   * Checks a transaction on the chain and, if it is a valid deposit, credits
   * amount − 1% to the player's USDT balance. Nothing is stored for a claim
   * that fails; the player can simply try again, for example once it has
   * enough confirmations.
   */
  async function claim(userId: string, network: DepositNetwork, rawTxId: string): Promise<DepositRecord> {
    const info = NETWORK_INFO[network];
    const ours = addresses[network];
    if (!ours) {
      throw new HttpError(403, "deposit_closed", `${info.label} deposits are not open.`);
    }

    const txId = normalizeTxId(network, rawTxId);
    if (!txId) {
      throw invalidInput(
        network === "trc20"
          ? "That is not a Tron transaction ID. It has 64 letters and digits."
          : "That is not a transaction hash. It starts with 0x and has 66 characters.",
      );
    }

    const from = savedWallet(userId, network);
    if (!from) {
      throw invalidInput(`Save the ${info.label} wallet you pay from first.`);
    }

    const existing = claimedBy(network, txId);
    if (existing) {
      throw new HttpError(
        409,
        "already_claimed",
        existing.user_id === userId
          ? "You have already been credited for that transaction."
          : "That transaction has already been credited.",
      );
    }

    let lookup;
    try {
      lookup = await chain.lookup(network, txId);
    } catch (error) {
      if (error instanceof ChainUnavailableError) {
        throw pending(`We could not reach the ${info.chain} network. Try again in a minute.`);
      }
      throw error;
    }

    if (lookup.status === "not_found") {
      throw pending(
        `That transaction is not on the ${info.chain} network yet. Check the network tab, or try again in a minute.`,
      );
    }
    if (lookup.status === "failed") {
      throw rejected("That transaction failed on the chain, so no USDT was sent.");
    }

    const usdt = USDT_CONTRACTS[network];
    const tokenTransfers = lookup.transfers.filter((transfer) => transfer.contract === canonicalAddress(network, usdt.contract));
    if (tokenTransfers.length === 0) {
      throw rejected("That transaction did not send real USDT. Look-alike tokens are not accepted.");
    }
    const toUs = tokenTransfers.filter((transfer) => transfer.to === canonicalAddress(network, ours));
    if (toUs.length === 0) {
      throw rejected(`That transaction did not send USDT to our ${info.label} address.`);
    }
    const fromYou = toUs.filter((transfer) => transfer.from === canonicalAddress(network, from));
    if (fromYou.length === 0) {
      throw rejected(
        `That payment came from ${short(toUs[0]?.from ?? "")}, not from your saved wallet ${short(from)}. ` +
          "Only payments from your saved wallet are credited. Contact support if it is yours.",
      );
    }

    const amount = toUsdtUnits(
      network,
      fromYou.reduce((sum, transfer) => sum + transfer.amount, 0n),
    );
    if (amount < DEPOSIT_RULES.minimum) {
      throw rejected(
        `Deposits under ${formatAmount("usdt", DEPOSIT_RULES.minimum)} are not credited. ` +
          "Contact support with the transaction ID.",
      );
    }

    if (lookup.confirmations < info.confirmations) {
      throw pending(
        `Found it: ${formatAmount("usdt", amount)}. It has ${Math.max(lookup.confirmations, 0)} of ` +
          `${info.confirmations} confirmations. Try again in a few minutes.`,
      );
    }

    const fee = depositFee(amount);
    const row: DepositRow = {
      id: randomUUID(),
      network,
      tx_id: txId,
      from_address: canonicalAddress(network, from),
      amount,
      fee,
      credited: amount - fee,
      created_at: now(),
    };

    try {
      withTransaction(db, () => {
        // UNIQUE (network, tx_id): if two claims race, the second insert fails
        // and its transaction rolls back before any money moves.
        db.prepare(
          `INSERT INTO deposits (id, user_id, network, tx_id, from_address, amount, fee, credited, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(row.id, userId, row.network, row.tx_id, row.from_address, row.amount, row.fee, row.credited, row.created_at);
        creditDeposit(db, { userId, depositId: row.id, credited: row.credited, fee: row.fee, now: row.created_at });
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new HttpError(409, "already_claimed", "That transaction has already been credited.");
      }
      throw error;
    }

    return toRecord(row);
  }

  return { overview, saveWallet, claim };
}

export type DepositService = ReturnType<typeof createDepositService>;
