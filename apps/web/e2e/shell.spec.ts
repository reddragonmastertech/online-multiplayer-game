import { expect, test } from "@playwright/test";

test("intro page explains the arena", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "ARENA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Your arena/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore Games" })).toBeVisible();
});

test("lobby is game-first", async ({ page }) => {
  await page.goto("/lobby");

  await expect(page.getByRole("heading", { name: "Choose your next game" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rock Paper Scissors" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play Now" })).toBeVisible();

  // Game selection leads; live matches are a secondary section below it.
  // Whether any are running depends on the rest of the suite, so this only
  // checks the section is present and links on to the full directory.
  await expect(page.getByRole("heading", { name: "Live matches" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Watch directory" })).toBeVisible();
});

test("join now asks guests to log in", async ({ page }) => {
  await page.goto("/games/rps");

  await page.getByRole("button", { name: "JOIN NOW" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("cpu practice offers the RAC stakes only", async ({ page }) => {
  for (const amount of [1, 5, 10]) {
    await page.goto(`/vs/${amount}-rac`);
    await expect(page.getByText(`${amount} RAC MATCH`)).toBeVisible();
  }

  // USDT stays hidden, so its old practice tables are gone.
  await page.goto("/vs/0-1-usdt");
  await expect(page.getByRole("heading", { name: "Stake closed" })).toBeVisible();
});

test("retired and unknown paths go to the intro page", async ({ page }) => {
  for (const path of ["/play", "/missions", "/ranking", "/wallet", "/no-such-page"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Your arena/i })).toBeVisible();
  }
});
