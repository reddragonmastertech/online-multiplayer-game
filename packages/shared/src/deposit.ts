import { z } from "zod";
import { isoDateSchema } from "./common";
import { USDT_UNIT, amountSchema } from "./economy";

/**
 * USDT deposits (Roadmap 4.2 part B). The player sends USDT on-chain to one of
 * our fixed addresses, then pastes the transaction ID. The server reads the
 * transaction from the chain and credits it only if it went to our address,
 * is the real USDT token, came from the wallet the player saved beforehand,
 * has enough confirmations, and was never claimed before.
 */

export const depositNetworks = ["trc20", "bep20", "erc20"] as const;
export const depositNetworkSchema = z.enum(depositNetworks);
export type DepositNetwork = z.infer<typeof depositNetworkSchema>;

export const DEPOSIT_RULES = {
  /** Smallest deposit credited, in 0.000001 USDT. */
  minimum: 3 * USDT_UNIT,
  /** Deposit fee in basis points: 100 = 1%. */
  feeBps: 100,
  confirmationTime: "5–10 minutes",
} as const;

export const NETWORK_INFO: Record<
  DepositNetwork,
  { label: string; chain: string; confirmations: number; note?: string }
> = {
  trc20: { label: "TRC20", chain: "Tron", confirmations: 19, note: "Recommended: the lowest fees." },
  bep20: { label: "BEP20", chain: "BNB Smart Chain", confirmations: 15, note: "Low fees." },
  erc20: {
    label: "ERC20",
    chain: "Ethereum",
    confirmations: 12,
    note: "Ethereum gas often costs more than a small deposit.",
  },
};

const evmAddress = /^0x[0-9a-fA-F]{40}$/;
const tronAddress = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const evmTxId = /^0x[0-9a-fA-F]{64}$/;
const tronTxId = /^[0-9a-fA-F]{64}$/;

/** True when `address` has the right shape for that network. */
export function isNetworkAddress(network: DepositNetwork, address: string) {
  return network === "trc20" ? tronAddress.test(address) : evmAddress.test(address);
}

/**
 * The canonical form of a transaction ID, or `undefined` if it cannot be one.
 * EVM hashes are lower-case with `0x`; Tron IDs are lower-case without it.
 */
export function normalizeTxId(network: DepositNetwork, txId: string) {
  const text = txId.trim();
  if (network === "trc20") {
    const bare = text.replace(/^0x/i, "");
    return tronTxId.test(bare) ? bare.toLowerCase() : undefined;
  }
  const prefixed = /^0x/i.test(text) ? text : `0x${text}`;
  return evmTxId.test(prefixed) ? prefixed.toLowerCase() : undefined;
}

/** The fee on a deposit of `amount`, rounded down in the player's favour. */
export function depositFee(amount: number) {
  return Math.floor((amount * DEPOSIT_RULES.feeBps) / 10_000);
}

export const saveDepositWalletSchema = z.object({
  network: depositNetworkSchema,
  address: z.string().trim().min(1).max(64),
});
export type SaveDepositWallet = z.infer<typeof saveDepositWalletSchema>;

export const depositClaimSchema = z.object({
  network: depositNetworkSchema,
  txId: z.string().trim().min(1).max(80),
});
export type DepositClaim = z.infer<typeof depositClaimSchema>;

export const depositRecordSchema = z.object({
  id: z.string().min(1),
  network: depositNetworkSchema,
  txId: z.string().min(1),
  fromAddress: z.string().min(1),
  /** What arrived on-chain, in 0.000001 USDT. */
  amount: amountSchema,
  fee: amountSchema,
  /** What was added to the USDT balance: amount − fee. */
  credited: amountSchema,
  createdAt: isoDateSchema,
});
export type DepositRecord = z.infer<typeof depositRecordSchema>;

export const depositOverviewSchema = z.object({
  networks: z.array(
    z.object({
      network: depositNetworkSchema,
      /** Our receiving address, or null while that network is closed. */
      address: z.string().nullable(),
      confirmations: z.number().int().positive(),
    }),
  ),
  wallets: z.array(z.object({ network: depositNetworkSchema, address: z.string().min(1) })),
  deposits: z.array(depositRecordSchema),
  minimum: amountSchema,
  feeBps: z.number().int().nonnegative(),
});
export type DepositOverview = z.infer<typeof depositOverviewSchema>;

export const depositClaimResponseSchema = z.object({
  deposit: depositRecordSchema,
});
export type DepositClaimResponse = z.infer<typeof depositClaimResponseSchema>;
