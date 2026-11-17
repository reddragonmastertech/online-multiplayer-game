import type { DepositNetwork } from "@game-platform/shared";

/**
 * Reading USDT transfers off a chain. Every network answers the same
 * question: did this transaction succeed, how deep is it, and which token
 * transfers did it make. The deposit service decides what that means.
 */

/** One token `Transfer` event. Addresses are in each network's canonical form. */
export type TokenTransfer = {
  /** The token contract that emitted the event. */
  contract: string;
  from: string;
  to: string;
  /** In the token's own smallest unit (see `USDT_CONTRACTS[network].decimals`). */
  amount: bigint;
};

export type ChainLookup =
  | { status: "not_found" }
  | { status: "failed" }
  | { status: "mined"; confirmations: number; transfers: TokenTransfer[] };

export type ChainClient = {
  lookup(network: DepositNetwork, txId: string): Promise<ChainLookup>;
};

/**
 * The real USDT contracts. Anyone can deploy a token called "USDT", so a
 * transfer only counts if it came from exactly this contract.
 */
export const USDT_CONTRACTS: Record<DepositNetwork, { contract: string; decimals: number }> = {
  erc20: { contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  // USDT on BNB Smart Chain has 18 decimals, not 6.
  bep20: { contract: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
  trc20: { contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6 },
};

/**
 * The form addresses are compared in: lower-case hex for EVM chains, base58
 * as written for Tron (base58 is case-sensitive).
 */
export function canonicalAddress(network: DepositNetwork, address: string) {
  const text = address.trim();
  return network === "trc20" ? text : text.toLowerCase();
}

/** A token amount converted to 0.000001 USDT, rounding any dust down. */
export function toUsdtUnits(network: DepositNetwork, amount: bigint) {
  const decimals = USDT_CONTRACTS[network].decimals;
  const units = decimals >= 6 ? amount / 10n ** BigInt(decimals - 6) : amount * 10n ** BigInt(6 - decimals);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Deposit amount is too large to handle safely.");
  }
  return Number(units);
}

export class ChainUnavailableError extends Error {}

export async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ChainUnavailableError(`Could not reach ${new URL(url).host}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new ChainUnavailableError(`${new URL(url).host} answered ${response.status}`);
  }
  return (await response.json()) as unknown;
}
