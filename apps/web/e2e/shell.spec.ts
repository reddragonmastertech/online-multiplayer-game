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
  await expect(page.getByText("No public matches are live right now.")).toBeVisible();
});

test("other sections stay blank", async ({ page }) => {
  await page.goto("/play");

  await expect(page.getByRole("heading", { name: "Play" })).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
});
