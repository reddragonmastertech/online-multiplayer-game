import { expect, test, type Page } from "@playwright/test";

/**
 * Step 6's acceptance test: two signed-in browsers tap the same RAC stake and
 * both get paired. Needs the single API process from `playwright.config.ts`,
 * because matchmaking lives in that process's memory.
 */

const password = "password123";

async function signUp(page: Page, name: string) {
  await page.goto("/games/rps");
  await page.getByRole("button", { name: "Get Started" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("DISPLAY NAME").fill(name);
  await dialog.getByLabel("EMAIL").fill(`${name.toLowerCase()}@example.test`);
  await dialog.getByLabel("PASSWORD").fill(password);
  await dialog.getByRole("button", { name: "Create account" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*100 RAC`) })).toBeVisible();
}

function stakeTile(page: Page, amount: number) {
  return page.getByRole("radio", { name: new RegExp(`^${amount} RAC`) });
}

test("two browsers pair on the same stake and both lock 1 RAC", async ({ browser }) => {
  const stamp = Date.now();
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const alicePage = await alice.newPage();
  const bobPage = await bob.newPage();

  try {
    await signUp(alicePage, `Alice${stamp}`);
    await signUp(bobPage, `Bob${stamp}`);

    await stakeTile(alicePage, 1).click();
    await alicePage.getByRole("button", { name: "JOIN NOW" }).click();

    // First player waits, and the server has taken the stake out of available.
    await expect(alicePage.getByText("Looking for an opponent…")).toBeVisible();
    await expect(
      alicePage.getByRole("link", { name: new RegExp(`Alice${stamp}.*99 RAC`) }),
    ).toBeVisible();

    await stakeTile(bobPage, 1).click();
    await bobPage.getByRole("button", { name: "JOIN NOW" }).click();

    // Both sides are seated against each other.
    await expect(alicePage.getByText("Opponent found")).toBeVisible();
    await expect(bobPage.getByText("Opponent found")).toBeVisible();
    await expect(alicePage.getByText(`Bob${stamp}`)).toBeVisible();
    await expect(bobPage.getByText(`Alice${stamp}`)).toBeVisible();
    await expect(alicePage.getByText("pot 2 RAC")).toBeVisible();

    // Both stakes left available on both clients.
    await expect(
      bobPage.getByRole("link", { name: new RegExp(`Bob${stamp}.*99 RAC`) }),
    ).toBeVisible();
  } finally {
    await alice.close();
    await bob.close();
  }
});

test("cancelling the search returns the stake", async ({ page }) => {
  const name = `Solo${Date.now()}`;
  await signUp(page, name);

  await stakeTile(page, 5).click();
  await page.getByRole("button", { name: "JOIN NOW" }).click();

  await expect(page.getByText("Looking for an opponent…")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*95 RAC`) })).toBeVisible();

  await page.getByRole("button", { name: "Cancel Search" }).click();

  await expect(page.getByText("Looking for an opponent…")).toBeHidden();
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*100 RAC`) })).toBeVisible();
});

test("every stake is offered with its payout and the RAC disclosure", async ({ page }) => {
  // The 100 RAC bonus covers every stake on the menu, so the UI's
  // not-enough-RAC path only becomes reachable once Step 7 settles a match and
  // a wallet can actually fall below 10. `lockRacStake` covers the server-side
  // rejection in apps/api/src/economy/wallet.test.ts.
  const name = `Tiles${Date.now()}`;
  await signUp(page, name);

  for (const [amount, payout] of [
    [1, 2],
    [5, 10],
    [10, 20],
  ] as const) {
    const tile = stakeTile(page, amount);
    await expect(tile).toContainText(`Winner takes ${payout} RAC`);
    await tile.click();
    await expect(tile).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "JOIN NOW" })).toBeEnabled();
  }

  await expect(
    page.getByText("RAC is play-only arena credit.", { exact: false }),
  ).toBeVisible();
});
