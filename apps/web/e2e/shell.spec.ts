import { expect, test } from "@playwright/test";

test("blank shell navigates between sections", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.getByRole("link", { name: "Play" }).first().click();

  await expect(page.getByRole("heading", { name: "Play" })).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
});
