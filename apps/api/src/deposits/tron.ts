import { createHash } from "node:crypto";
import { ChainUnavailableError, postJson, type ChainLookup, type TokenTransfer } from "./chain";
import { TRANSFER_TOPIC } from "./evm";

/**
 * Tron, over TronGrid's HTTP API. Tron logs carry 20-byte hex addresses; the
 * human form (`T...`) is the same bytes with a 0x41 prefix in base58check.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest();
}

function base58Encode(bytes: Buffer) {
  let value = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let text = "";
  while (value > 0n) {
    text = ALPHABET[Number(value % 58n)] + text;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    text = `1${text}`;
  }
  return text;
}

function base58Decode(text: string) {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`"${char}" is not base58`);
    value = value * 58n + BigInt(digit);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const leading = text.match(/^1*/)?.[0].length ?? 0;
  return Buffer.concat([Buffer.alloc(leading), Buffer.from(hex, "hex")]);
}

/** `41` + 20-byte hex → `T...`. */
export function tronHexToBase58(hex: string) {
  const payload = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

/** `T...` → `41` + 20-byte hex, or `undefined` if the checksum is wrong. */
export function tronBase58ToHex(address: string) {
  try {
    const bytes = base58Decode(address);
    if (bytes.length !== 25) return undefined;
    const payload = bytes.subarray(0, 21);
    const checksum = sha256(sha256(payload)).subarray(0, 4);
    if (!checksum.equals(bytes.subarray(21)) || payload[0] !== 0x41) return undefined;
    return payload.toString("hex");
  } catch {
    return undefined;
  }
}

type TronLog = { address: string; topics?: string[]; data?: string };
type TronInfo = {
  id?: string;
  blockNumber?: number;
  receipt?: { result?: string };
  log?: TronLog[];
};

/** The TRC-20 transfers in a transaction's info. */
export function transfersFromTronInfo(info: TronInfo): TokenTransfer[] {
  const topic = TRANSFER_TOPIC.slice(2);
  return (info.log ?? [])
    .filter((log) => log.topics?.length === 3 && log.topics[0]?.toLowerCase() === topic)
    .map((log) => ({
      contract: tronHexToBase58(`41${log.address.slice(-40)}`),
      from: tronHexToBase58(`41${(log.topics?.[1] ?? "").slice(-40)}`),
      to: tronHexToBase58(`41${(log.topics?.[2] ?? "").slice(-40)}`),
      amount: BigInt(`0x${log.data || "0"}`),
    }));
}

export async function lookupTron(baseUrl: string, apiKey: string | undefined, txId: string): Promise<ChainLookup> {
  const headers: Record<string, string> = apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
  const info = (await postJson(`${baseUrl}/wallet/gettransactioninfobyid`, { value: txId }, headers)) as TronInfo;

  // An unknown or not-yet-mined transaction comes back as an empty object.
  if (!info.id || info.blockNumber === undefined) return { status: "not_found" };
  if (info.receipt?.result && info.receipt.result !== "SUCCESS") return { status: "failed" };

  const now = (await postJson(`${baseUrl}/wallet/getnowblock`, {}, headers)) as {
    block_header?: { raw_data?: { number?: number } };
  };
  const head = now.block_header?.raw_data?.number ?? info.blockNumber;
  return { status: "mined", confirmations: head - info.blockNumber + 1, transfers: transfersFromTronInfo(info) };
}

/** TRC-20 `balanceOf(address)`, read with a constant (free, read-only) contract call. */
export async function usdtBalanceTron(baseUrl: string, apiKey: string | undefined, contract: string, address: string) {
  const hex = tronBase58ToHex(address);
  if (!hex) throw new Error(`${address} is not a Tron address`);
  const headers: Record<string, string> = apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
  const reply = (await postJson(
    `${baseUrl}/wallet/triggerconstantcontract`,
    {
      owner_address: address,
      contract_address: contract,
      function_selector: "balanceOf(address)",
      parameter: hex.slice(2).padStart(64, "0"),
      visible: true,
    },
    headers,
  )) as { constant_result?: string[]; result?: { result?: boolean; message?: string } };
  const value = reply.constant_result?.[0];
  if (value === undefined) {
    throw new ChainUnavailableError(`TronGrid did not return a balance: ${reply.result?.message ?? "no result"}`);
  }
  return BigInt(`0x${value || "0"}`);
}

export async function pingTron(baseUrl: string, apiKey: string | undefined) {
  const headers: Record<string, string> = apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
  await postJson(`${baseUrl}/wallet/getnowblock`, {}, headers);
}
