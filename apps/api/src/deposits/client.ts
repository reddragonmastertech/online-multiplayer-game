import { readFileSync } from "node:fs";
import type { DepositNetwork } from "@game-platform/shared";
import { USDT_CONTRACTS, type ChainClient, type ChainLookup } from "./chain";
import { lookupEvm, pingEvm, usdtBalanceEvm } from "./evm";
import { lookupTron, pingTron, usdtBalanceTron } from "./tron";

export type ChainSettings = {
  ethRpcUrl: string;
  bscRpcUrl: string;
  trongridUrl: string;
  trongridApiKey?: string;
};

export function createChainClient(settings: ChainSettings): ChainClient {
  const rpcFor = (network: Exclude<DepositNetwork, "trc20">) => (network === "erc20" ? settings.ethRpcUrl : settings.bscRpcUrl);
  return {
    lookup(network, txId) {
      if (network === "trc20") return lookupTron(settings.trongridUrl, settings.trongridApiKey, txId);
      return lookupEvm(rpcFor(network), txId);
    },
    usdtBalance(network, address) {
      const contract = USDT_CONTRACTS[network].contract;
      if (network === "trc20") return usdtBalanceTron(settings.trongridUrl, settings.trongridApiKey, contract, address);
      return usdtBalanceEvm(rpcFor(network), contract, address);
    },
    ping(network) {
      if (network === "trc20") return pingTron(settings.trongridUrl, settings.trongridApiKey);
      return pingEvm(rpcFor(network));
    },
  };
}

type FakeTransfer = { contract: string; from: string; to: string; amount: string };
type FakeEntry =
  | { status: "not_found" }
  | { status: "failed" }
  | { status: "mined"; confirmations: number; transfers: FakeTransfer[] };
type FakeFile = Record<string, FakeEntry> & {
  /** Optional: on-chain USDT per address, in the token's smallest unit. */
  __balances?: Record<string, string>;
};

/**
 * For the browser tests only: answers from a JSON file the test writes,
 * keyed by transaction ID, so no test ever touches a real chain. The config
 * refuses to turn this on in production.
 */
export function createFileChainClient(path: string): ChainClient {
  function read(): FakeFile {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as FakeFile;
    } catch {
      return {};
    }
  }

  return {
    async lookup(_network, txId): Promise<ChainLookup> {
      const entry = read()[txId] as FakeEntry | undefined;
      if (!entry) return { status: "not_found" };
      if (entry.status !== "mined") return entry;
      return {
        status: "mined",
        confirmations: entry.confirmations,
        transfers: entry.transfers.map((transfer) => ({ ...transfer, amount: BigInt(transfer.amount) })),
      };
    },
    async usdtBalance(_network, address) {
      return BigInt(read().__balances?.[address] ?? "0");
    },
    async ping() {},
  };
}
