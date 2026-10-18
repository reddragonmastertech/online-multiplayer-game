import { expect, test } from "@playwright/test";

test("home page shows the arena lobby", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "RPS Arena" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose your match" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live matches" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chat room" })).toBeVisible();
});

test("other sections stay blank", async ({ page }) => {
  await page.goto("/play");

  await expect(page.getByRole("heading", { name: "Play" })).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
});
