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
  await expect(page.getByText("USDT top-up is not open yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "JOIN NOW" })).toBeDisabled();
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
