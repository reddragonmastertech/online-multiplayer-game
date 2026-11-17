import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, type Page } from "@playwright/test";

/** Shared by the admin browser tests. Not a spec file, so Playwright does not run it. */

export const e2eDatabase = resolve(process.cwd(), "../api/data/e2e.db");

/** The 6-digit code an authenticator app would show for this base32 secret right now. */
export function totpNow(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.replace(/\s/g, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 15;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, "0");
}

/** Gives an account a role, the way `pnpm admin` does. */
export function makeAdmin(name: string, role = "owner") {
  const db = new DatabaseSync(e2eDatabase);
  try {
    db.prepare("UPDATE users SET role = ? WHERE name = ?").run(role, name);
  } finally {
    db.close();
  }
}

/** From any page: open /admin and pass first-time two-factor setup. */
export async function enterAdmin(page: Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent()) ?? "";
  await page.getByLabel("6-digit code from your authenticator app").fill(totpNow(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
}

/** Back to every switch open and no banner, so one test cannot close the arena for the next. */
export function resetSiteSettings() {
  const db = new DatabaseSync(e2eDatabase);
  try {
    db.prepare("DELETE FROM settings").run();
  } finally {
    db.close();
  }
}
