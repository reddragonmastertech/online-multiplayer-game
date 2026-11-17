import { ChainUnavailableError, postJson, type ChainLookup, type TokenTransfer } from "./chain";

/**
 * Ethereum and BNB Smart Chain, over plain JSON-RPC. Any node works: the
 * defaults are free public endpoints, and a provider URL (Alchemy, Infura,
 * QuickNode, ...) can be set in `.env` for more reliability.
 */

/** keccak256("Transfer(address,address,uint256)"), the ERC-20 transfer event. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcLog = { address: string; topics: string[]; data: string };
type RpcReceipt = { status?: string; blockNumber: string; logs: RpcLog[] };

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const reply = (await postJson(url, { jsonrpc: "2.0", id: 1, method, params })) as {
    result?: T;
    error?: { message?: string };
  };
  if (reply.error) {
    throw new ChainUnavailableError(`${method} failed: ${reply.error.message ?? "unknown error"}`);
  }
  return reply.result as T;
}

/** The ERC-20 transfers in a receipt. Topics 1 and 2 hold the padded addresses. */
export function transfersFromReceipt(receipt: RpcReceipt): TokenTransfer[] {
  return receipt.logs
    .filter((log) => log.topics.length === 3 && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC)
    .map((log) => ({
      contract: log.address.toLowerCase(),
      from: `0x${(log.topics[1] ?? "").slice(-40)}`.toLowerCase(),
      to: `0x${(log.topics[2] ?? "").slice(-40)}`.toLowerCase(),
      amount: BigInt(log.data === "0x" ? "0x0" : log.data),
    }));
}

export async function lookupEvm(rpcUrl: string, txId: string): Promise<ChainLookup> {
  const receipt = await rpc<RpcReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [txId]);
  if (!receipt) return { status: "not_found" };
  if (receipt.status !== undefined && receipt.status !== "0x1") return { status: "failed" };

  const head = await rpc<string>(rpcUrl, "eth_blockNumber", []);
  const confirmations = Number(BigInt(head) - BigInt(receipt.blockNumber)) + 1;
  return { status: "mined", confirmations, transfers: transfersFromReceipt(receipt) };
}
