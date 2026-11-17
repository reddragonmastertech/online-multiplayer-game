import { createHmac, randomBytes } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238), the 6-digit codes that
 * Google Authenticator, Authy and similar apps show. SHA-1, 30-second steps,
 * which is what every authenticator app expects by default.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let text = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      text += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) text += ALPHABET[(value << (5 - bits)) & 31];
  return text;
}

export function base32Decode(text: string) {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random secret, base32 as the apps want it. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/** The code for one time step. `digits` is 6 for apps; tests use 8 for RFC vectors. */
export function totpCode(secret: string, step: number, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 15;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Checks a code against the current step and one step either side (clock
 * drift), and returns the step it matched, or `undefined`. The caller stores
 * the step and refuses any step at or before it, so a code works once.
 */
export function verifyTotp(secret: string, code: string, nowMs = Date.now(), lastStep?: number | null) {
  const current = totpStep(nowMs);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== undefined && lastStep !== null && step <= lastStep) continue;
    if (totpCode(secret, step) === code) return step;
  }
  return undefined;
}

export function totpUri(secret: string, accountName: string) {
  const issuer = "PvP Arena";
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
