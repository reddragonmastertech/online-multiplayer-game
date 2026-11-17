import { expect, test, type Page } from "@playwright/test";
import { enterAdmin, makeAdmin } from "./admin-helpers";

/** Roadmap 4.2 part D1: the admin area, from two-factor to a suspension. */

async function signUp(page: Page, name: string) {
  await page.goto("/lobby");
  await page.getByRole("button", { name: "Get Started" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("DISPLAY NAME").fill(name);
  await dialog.getByLabel("EMAIL").fill(`${name.toLowerCase()}@example.test`);
  await dialog.getByLabel("PASSWORD").fill("password123");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toBeHidden();
}

test("an owner passes two-factor, adjusts a balance, suspends a player and sees it all audited", async ({ browser }) => {
  // Two browsers and a dozen steps: more than the default 30 seconds.
  test.setTimeout(90_000);
  const stamp = Date.now();
  const ownerName = `Own${stamp}`;
  const playerName = `Pat${stamp}`;
  const ownerCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const player = await playerCtx.newPage();

  await signUp(owner, ownerName);
  await signUp(player, playerName);
  makeAdmin(ownerName, "owner");

  // Without a role, /admin is closed; with one, it asks for two-factor first.
  await player.goto("/admin");
  await expect(player.getByText("This page is for admins only.")).toBeVisible();

  await owner.reload();
  await expect(owner.getByRole("link", { name: "Admin" })).toBeVisible();
  await enterAdmin(owner);
  await expect(owner.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  // The books balance, and an owner can take a backup on demand.
  const books = owner.getByRole("region", { name: "Books and backups" });
  await expect(books.getByRole("link", { name: "balanced" })).toBeVisible();
  await books.getByRole("button", { name: "Back up now" }).click();
  await expect(books).not.toContainText("none yet");
  await expect(books.getByText(/Last backup: .+ KB\)/)).toBeVisible();

  // The money page agrees, and reads the (test) receiving wallets.
  await owner.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Money" }).click();
  await expect(owner.getByText("The books balance.")).toBeVisible();
  await expect(owner.getByRole("region", { name: "Receiving wallets on-chain" })).toContainText("TRC20");
  await owner.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" }).click();

  // Find the player and give them 5 USDT, with a reason.
  await owner.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Players" }).click();
  await owner.getByLabel("Search players").fill(playerName);
  await owner.getByRole("button", { name: "Search" }).click();
  await owner.getByRole("list", { name: "Players" }).getByRole("link", { name: new RegExp(playerName) }).click();
  await expect(owner.getByRole("heading", { name: playerName })).toBeVisible();

  const adjust = owner.getByRole("form", { name: "Adjust balance" });
  await adjust.getByLabel("Amount (negative takes away)").fill("5");
  await expect(adjust.getByRole("button", { name: "Apply" })).toBeDisabled();
  await adjust.getByLabel("Reason (saved in the audit log)").fill("Tournament prize");
  await adjust.getByRole("button", { name: "Apply" }).click();
  await expect(owner.getByText("5 USDT", { exact: true })).toBeVisible();

  await player.goto("/account");
  await expect(player.getByRole("link", { name: new RegExp(`${playerName}.*5 USDT`) })).toBeVisible();

  // Suspend: the player's next request finds the session gone.
  const suspend = owner.getByRole("form", { name: "Suspend account (cannot log in)" });
  await suspend.getByLabel("Reason (saved in the audit log)").fill("Chargeback under review");
  await suspend.getByRole("button", { name: "Suspend" }).click();
  await expect(owner.getByText("Suspended", { exact: true })).toBeVisible();

  await player.reload();
  await expect(player.getByRole("button", { name: "Log in" }).first()).toBeVisible();

  // Both actions are in the audit log, with their reasons.
  await owner.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit log" }).click();
  const audit = owner.getByRole("list", { name: "Audit entries" });
  await expect(audit).toContainText("player.suspended");
  await expect(audit).toContainText("Chargeback under review");
  await expect(audit).toContainText("player.balance_adjusted");
  await expect(audit).toContainText("Tournament prize");

  await ownerCtx.close();
  await playerCtx.close();
});

test("a support admin can look but not change anything", async ({ page }) => {
  const name = `Sup${Date.now()}`;
  await signUp(page, name);
  makeAdmin(name, "support");
  await enterAdmin(page);

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Players" }).click();
  await page.getByRole("list", { name: "Players" }).getByRole("link").first().click();
  await expect(page.getByRole("region", { name: "Ledger (latest 200)" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Adjust balance" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Actions", exact: true })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Admins" }).click();
  await expect(page.getByText("Only an owner can change roles.")).toBeVisible();
});
