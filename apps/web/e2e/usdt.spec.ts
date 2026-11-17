import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

/**
 * The paid version (Roadmap 4.2, part A): USDT rooms next to the free RAC
 * rooms, with separate balances and a 10% house cut of the pot.
 *
 * Deposits do not exist yet, so the paid match test credits USDT straight into
 * the e2e database, the same way the `pnpm balance` admin script does.
 */

const password = "password123";
const e2eDatabase = resolve(process.cwd(), "../api/data/e2e.db");
const fakeChainFile = resolve(process.cwd(), "../api/data/e2e-chain.json");

// Must match apps/api/.env.e2e.
const OUR_TRC20 = "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV";
const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** A valid Tron address (base58check, 0x41 prefix) for 20 bytes of hex. */
function tronAddress(hex20: string) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const payload = Buffer.from(`41${hex20}`, "hex");
  const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest();
  const bytes = Buffer.concat([payload, sha(sha(payload)).subarray(0, 4)]);
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let text = "";
  while (value > 0n) {
    text = alphabet[Number(value % 58n)] + text;
    value /= 58n;
  }
  return text;
}

/** Puts a transaction "on the chain" for the e2e server to find. */
function putOnChain(txId: string, entry: unknown) {
  let entries: Record<string, unknown> = {};
  try {
    entries = JSON.parse(readFileSync(fakeChainFile, "utf8")) as Record<string, unknown>;
  } catch {
    // First entry.
  }
  entries[txId] = entry;
  writeFileSync(fakeChainFile, JSON.stringify(entries));
}

async function signUp(page: Page, name: string) {
  await page.goto("/games/rps");
  await page.getByRole("button", { name: "Get Started" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("DISPLAY NAME").fill(name);
  await dialog.getByLabel("EMAIL").fill(`${name.toLowerCase()}@example.test`);
  await dialog.getByLabel("PASSWORD").fill(password);
  await dialog.getByRole("button", { name: "Create account" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*100 RAC.*0 USDT`) })).toBeVisible();
}

/** Credits USDT by hand, with a matching ledger row, like the admin script. */
function creditUsdt(name: string, units: number) {
  const db = new DatabaseSync(e2eDatabase);
  try {
    const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name) as { id: string };
    db.exec("BEGIN");
    db.prepare("UPDATE wallets SET available = available + ? WHERE user_id = ? AND currency = 'usdt'").run(
      units,
      user.id,
    );
    db.prepare(
      "INSERT INTO ledger_entries (id, user_id, currency, kind, amount, match_id, created_at) VALUES (?, ?, 'usdt', 'adjustment', ?, NULL, ?)",
    ).run(crypto.randomUUID(), user.id, units, new Date().toISOString());
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}

function houseCutFor(matchId: string) {
  const db = new DatabaseSync(e2eDatabase);
  try {
    const row = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM house_ledger WHERE match_id = ?")
      .get(matchId) as { total: number };
    return row.total;
  } finally {
    db.close();
  }
}

test("the USDT tab offers the paid stakes and blocks an empty balance", async ({ page }) => {
  const name = `Una${Date.now()}`;
  await signUp(page, name);

  await page.getByRole("radio", { name: /^USDT/ }).click();

  const stakes = page.getByRole("radiogroup", { name: "USDT stake" }).getByRole("radio");
  await expect(stakes).toHaveCount(6);
  for (const [stake, prize] of [
    ["0.2", "0.36"],
    ["0.5", "0.9"],
    ["1", "1.8"],
    ["2", "3.6"],
    ["5", "9"],
    ["10", "18"],
  ]) {
    await expect(page.getByRole("radio", { name: new RegExp(`^${stake} USDT Winner takes ${prize} USDT`) })).toBeVisible();
  }

  await expect(page.getByText("The house keeps 10% of the pot")).toBeVisible();
  // With no USDT, the join button becomes a way to top up.
  await expect(page.getByRole("button", { name: "JOIN NOW" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Top up USDT" })).toHaveAttribute("href", "/account?topup=usdt");
  // CPU practice is free play only.
  await expect(page.getByRole("link", { name: "Practice vs CPU" })).toHaveCount(0);

  // Back on RAC, everything is as before.
  await page.getByRole("radio", { name: /^RAC/ }).click();
  await expect(page.getByRole("radiogroup", { name: "RAC stake" }).getByRole("radio")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "JOIN NOW" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Practice vs CPU" })).toBeVisible();
});

test("a paid match pays the winner the pot minus 10% and leaves RAC alone", async ({ browser }) => {
  const stamp = Date.now();
  const annName = `Ann${stamp}`;
  const benName = `Ben${stamp}`;
  const annCtx = await browser.newContext();
  const benCtx = await browser.newContext();
  const ann = await annCtx.newPage();
  const ben = await benCtx.newPage();

  await signUp(ann, annName);
  await signUp(ben, benName);
  creditUsdt(annName, 5_000_000);
  creditUsdt(benName, 5_000_000);

  for (const page of [ann, ben]) {
    await page.reload();
    await page.getByRole("radio", { name: /^USDT/ }).click();
    await page.getByRole("radio", { name: /^1 USDT/ }).click();
  }
  await expect(ann.getByRole("link", { name: new RegExp(`${annName}.*5 USDT`) })).toBeVisible();

  await ann.getByRole("button", { name: "JOIN NOW" }).click();
  await expect(ann.getByText("1 USDT locked")).toBeVisible();
  await ben.getByRole("button", { name: "JOIN NOW" }).click();

  await expect(ann).toHaveURL(/\/room\//);
  await expect(ben).toHaveURL(/\/room\//);
  await expect(ann.getByText("1 USDT MATCH")).toBeVisible();
  await expect(ann.getByText("Pot 2 USDT · winner gets 1.8 USDT")).toBeVisible();

  for (const round of [1, 2]) {
    await ann.getByRole("button", { name: "Rock", exact: true }).click();
    await ben.getByRole("button", { name: "Scissors", exact: true }).click();
    if (round === 1) {
      await expect(ann.getByText("R1", { exact: true })).toBeVisible();
    }
  }

  await expect(ann.getByText("+0.8 USDT")).toBeVisible();
  await expect(ben.getByText("-1 USDT")).toBeVisible();

  // Winner 5 + 0.8, loser 5 - 1, house 0.2. RAC never moved.
  await expect(ann.getByRole("link", { name: new RegExp(`${annName}.*100 RAC.*5\\.8 USDT`) })).toBeVisible();
  await expect(ben.getByRole("link", { name: new RegExp(`${benName}.*100 RAC.*4 USDT`) })).toBeVisible();

  const matchId = new URL(ann.url()).pathname.split("/").pop() ?? "";
  expect(houseCutFor(matchId)).toBe(200_000);

  await annCtx.close();
  await benCtx.close();
});

test("a USDT deposit is checked on the chain and credited minus 1%", async ({ page }) => {
  const stamp = Date.now();
  const name = `Dee${stamp}`;
  // A fresh, unique transaction ID per run: the database keeps every credited one.
  const txId = stamp.toString(16).padStart(64, "0");
  // A wallet can belong to one account only, and the e2e database outlives a
  // run, so each run pays from a new address.
  const PLAYER_TRC20 = tronAddress(stamp.toString(16).padStart(40, "0"));

  await signUp(page, name);
  await page.getByRole("radio", { name: /^USDT/ }).click();
  await page.getByRole("link", { name: "Top up USDT" }).click();

  const dialog = page.getByRole("dialog", { name: "Top Up By USDT" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "TRC20" }).click();
  await expect(dialog.getByTestId("deposit-address")).toHaveText(OUR_TRC20);
  await expect(dialog.getByText("Note that the minimum amount is: 3 USDT")).toBeVisible();

  // A closed network says so.
  await dialog.getByRole("tab", { name: "ERC20" }).click();
  await expect(dialog.getByText("ERC20 deposits are not open yet.")).toBeVisible();
  await dialog.getByRole("tab", { name: "TRC20" }).click();

  // The TxID box waits for a saved wallet, and a bad address is explained.
  await expect(dialog.getByLabel("After sending, paste the transaction ID")).toBeDisabled();
  await dialog.getByLabel(/The TRC20 wallet you will send USDT from/).fill("0x2222222222222222222222222222222222222222");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText("not a valid TRC20 address");
  await dialog.getByLabel(/The TRC20 wallet you will send USDT from/).fill(PLAYER_TRC20);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText(PLAYER_TRC20)).toBeVisible();

  // Not on the chain yet.
  const txBox = dialog.getByLabel("After sending, paste the transaction ID");
  await txBox.fill(txId);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByRole("status")).toContainText("not on the Tron network yet");

  // Mined, but too shallow.
  const transfer = { contract: USDT_TRC20, from: PLAYER_TRC20, to: OUR_TRC20, amount: "10000000" };
  putOnChain(txId, { status: "mined", confirmations: 4, transfers: [transfer] });
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByRole("status")).toContainText("Found it: 10 USDT. It has 4 of 19 confirmations.");

  // Confirmed: 10 USDT in, 0.1 fee, 9.9 credited.
  putOnChain(txId, { status: "mined", confirmations: 25, transfers: [transfer] });
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByRole("status")).toContainText("Credited 9.9 USDT (10 USDT received, 0.1 USDT fee).");
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*100 RAC.*9\.9 USDT`) })).toBeVisible();

  // The same transaction never pays twice.
  await txBox.fill(txId);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByRole("status")).toContainText("already been credited");

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("list", { name: "Deposits" })).toContainText("+9.9 USDT");

  // Back in the lobby the paid rooms are open.
  await page.goto("/games/rps");
  await page.getByRole("radio", { name: /^USDT/ }).click();
  await expect(page.getByRole("button", { name: "JOIN NOW" })).toBeEnabled();
});

/** Gives an account admin rights, the way `pnpm admin` does. */
function makeAdmin(name: string) {
  const db = new DatabaseSync(e2eDatabase);
  try {
    db.prepare("UPDATE users SET is_admin = 1 WHERE name = ?").run(name);
  } finally {
    db.close();
  }
}

test("a withdrawal is locked, then paid or rejected by an admin", async ({ browser }) => {
  const stamp = Date.now();
  const playerName = `Wes${stamp}`;
  const adminName = `Adm${stamp}`;
  const wallet = tronAddress((stamp + 7).toString(16).padStart(40, "0"));
  const playerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const player = await playerCtx.newPage();
  const admin = await adminCtx.newPage();

  await signUp(player, playerName);
  await signUp(admin, adminName);
  creditUsdt(playerName, 25_000_000);
  makeAdmin(adminName);

  // Withdrawals go to the wallet saved for deposits, so save one first.
  await player.goto("/account");
  await expect(player.getByRole("link", { name: new RegExp(`${playerName}.*25 USDT`) })).toBeVisible();
  await player.getByRole("button", { name: "Save a wallet under Top up" }).click();
  const dialog = player.getByRole("dialog", { name: "Top Up By USDT" });
  await dialog.getByRole("tab", { name: "TRC20" }).click();
  await dialog.getByLabel(/The TRC20 wallet you will send USDT from/).fill(wallet);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText(wallet)).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // Below the minimum is explained; 15 USDT is locked straight away.
  const amount = player.getByLabel(/Amount in USDT/);
  await amount.fill("5");
  await player.getByRole("button", { name: "Request" }).click();
  await expect(player.getByRole("alert")).toContainText("The minimum withdrawal is 10 USDT.");
  await amount.fill("15");
  await expect(player.getByText("Fee 0.15 USDT (1%) · You receive 14.85 USDT")).toBeVisible();
  await player.getByRole("button", { name: "Request" }).click();
  await expect(player.getByRole("list", { name: "Withdrawals" })).toContainText("Waiting for approval");
  await expect(player.getByRole("link", { name: new RegExp(`${playerName}.*10 USDT`) })).toBeVisible();
  await expect(player.getByText("Available 10 USDT · Locked 15 USDT")).toBeVisible();

  // The admin sees exactly what to send, sends it, and marks it paid.
  await admin.reload();
  await admin.getByRole("link", { name: "Admin" }).click();
  const row = admin.getByRole("listitem", { name: `Withdrawal for ${playerName}` });
  await expect(row).toContainText("Send exactly 14.85 USDT on Tron (TRC20) to:");
  await expect(row).toContainText(wallet);
  await row.getByLabel("After sending, paste your transaction ID").fill((stamp + 1).toString(16).padStart(64, "0"));
  await row.getByRole("button", { name: "Mark paid" }).click();
  await expect(row).toHaveCount(0);
  await expect(admin.getByRole("list", { name: "Decided withdrawals" })).toContainText(playerName);

  await player.reload();
  await expect(player.getByRole("list", { name: "Withdrawals" })).toContainText("Paid");
  await expect(player.getByText("Available 10 USDT · Locked 0 USDT")).toBeVisible();

  // A second request, rejected: the full amount comes back.
  await player.getByLabel(/Amount in USDT/).fill("10");
  await player.getByRole("button", { name: "Request" }).click();
  await expect(player.getByText("Available 0 USDT · Locked 10 USDT")).toBeVisible();

  await admin.getByRole("button", { name: "Refresh" }).click();
  const second = admin.getByRole("listitem", { name: `Withdrawal for ${playerName}` });
  await second.getByLabel("Or reject it").fill("Please contact support first");
  await second.getByRole("button", { name: "Reject" }).click();
  await expect(second).toHaveCount(0);

  await player.reload();
  await expect(player.getByRole("list", { name: "Withdrawals" })).toContainText("Rejected");
  await expect(player.getByRole("list", { name: "Withdrawals" })).toContainText("Please contact support first");
  await expect(player.getByText("Available 10 USDT · Locked 0 USDT")).toBeVisible();

  // A player cannot open the admin page.
  await player.goto("/admin");
  await expect(player.getByText("This page is for admins only.")).toBeVisible();

  await playerCtx.close();
  await adminCtx.close();
});
