import { describe, expect, it } from "vitest";
import { toUsdtUnits, USDT_CONTRACTS } from "./chain";
import { TRANSFER_TOPIC, transfersFromReceipt } from "./evm";
import { transfersFromTronInfo, tronBase58ToHex, tronHexToBase58 } from "./tron";

const pad = (hex: string) => `0x${hex.replace(/^0x/, "").padStart(64, "0")}`;

describe("tron addresses", () => {
  it("converts the real USDT contract both ways", () => {
    expect(tronBase58ToHex(USDT_CONTRACTS.trc20.contract)).toBe("41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
    expect(tronHexToBase58("41a614f803b6fd780986a42c78ec9c7f77e6ded13c")).toBe(USDT_CONTRACTS.trc20.contract);
  });

  it("rejects a typo through the checksum", () => {
    const typo = `${USDT_CONTRACTS.trc20.contract.slice(0, -1)}u`;
    expect(tronBase58ToHex(typo)).toBeUndefined();
  });
});

describe("reading transfers", () => {
  it("finds ERC-20 transfers in an EVM receipt and ignores other events", () => {
    const transfers = transfersFromReceipt({
      status: "0x1",
      blockNumber: "0x10",
      logs: [
        {
          address: "0xDAC17F958D2EE523A2206206994597C13D831EC7",
          topics: [TRANSFER_TOPIC, pad("2222222222222222222222222222222222222222"), pad("1111111111111111111111111111111111111111")],
          data: pad((5_000_000).toString(16)),
        },
        { address: "0xabc", topics: ["0xdeadbeef"], data: "0x" },
      ],
    });

    expect(transfers).toEqual([
      {
        contract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        amount: 5_000_000n,
      },
    ]);
  });

  it("finds TRC-20 transfers in Tron transaction info", () => {
    const transfers = transfersFromTronInfo({
      id: "ab",
      blockNumber: 5,
      log: [
        {
          address: "a614f803b6fd780986a42c78ec9c7f77e6ded13c",
          topics: [
            TRANSFER_TOPIC.slice(2),
            "000000000000000000000000" + "22".repeat(20),
            "000000000000000000000000" + "11".repeat(20),
          ],
          data: (3_000_000).toString(16).padStart(64, "0"),
        },
      ],
    });

    expect(transfers).toEqual([
      {
        contract: USDT_CONTRACTS.trc20.contract,
        from: tronHexToBase58(`41${"22".repeat(20)}`),
        to: tronHexToBase58(`41${"11".repeat(20)}`),
        amount: 3_000_000n,
      },
    ]);
  });

  it("converts BEP20's 18 decimals and rounds dust down", () => {
    expect(toUsdtUnits("bep20", 5n * 10n ** 18n)).toBe(5_000_000);
    expect(toUsdtUnits("bep20", 5n * 10n ** 18n + 999n)).toBe(5_000_000);
    expect(toUsdtUnits("trc20", 5_000_000n)).toBe(5_000_000);
  });
});
