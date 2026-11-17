import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, totpStep, verifyTotp } from "./totp";

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("two-factor codes", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpCode(RFC_SECRET, totpStep(59_000), 8)).toBe("94287082");
    expect(totpCode(RFC_SECRET, totpStep(1_111_111_109_000), 8)).toBe("07081804");
    expect(totpCode(RFC_SECRET, totpStep(20_000_000_000_000), 8)).toBe("65353130");
    // The 6-digit form apps show is the last six digits.
    expect(totpCode(RFC_SECRET, totpStep(59_000))).toBe("287082");
  });

  it("round-trips base32 and makes 32-character secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("accepts one step of clock drift either way, and nothing further", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeUndefined();
  });

  it("refuses a code that was already used", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeUndefined();
  });
});
