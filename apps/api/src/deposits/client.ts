import { readFileSync } from "node:fs";
import type { ChainClient, ChainLookup } from "./chain";
import { lookupEvm } from "./evm";
import { lookupTron } from "./tron";

export type ChainSettings = {
  ethRpcUrl: string;
  bscRpcUrl: string;
  trongridUrl: string;
  trongridApiKey?: string;
};

export function createChainClient(settings: ChainSettings): ChainClient {
  return {
    lookup(network, txId) {
      if (network === "erc20") return lookupEvm(settings.ethRpcUrl, txId);
      if (network === "bep20") return lookupEvm(settings.bscRpcUrl, txId);
      return lookupTron(settings.trongridUrl, settings.trongridApiKey, txId);
    },
  };
}

type FakeEntry =
  | { status: "not_found" }
  | { status: "failed" }
  | {
      status: "mined";
      confirmations: number;
      transfers: { contract: string; from: string; to: string; amount: string }[];
    };

/**
 * For the browser tests only: answers from a JSON file the test writes,
 * keyed by transaction ID, so no test ever touches a real chain. The config
 * refuses to turn this on in production.
 */
export function createFileChainClient(path: string): ChainClient {
  return {
    async lookup(_network, txId): Promise<ChainLookup> {
      let entries: Record<string, FakeEntry> = {};
      try {
        entries = JSON.parse(readFileSync(path, "utf8")) as Record<string, FakeEntry>;
      } catch {
        // No file yet means no transactions.
      }
      const entry = entries[txId];
      if (!entry) return { status: "not_found" };
      if (entry.status !== "mined") return entry;
      return {
        status: "mined",
        confirmations: entry.confirmations,
        transfers: entry.transfers.map((transfer) => ({ ...transfer, amount: BigInt(transfer.amount) })),
      };
    },
  };
}
