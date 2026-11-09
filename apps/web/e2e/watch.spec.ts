import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Step 8: a match in progress is discoverable and watchable, and a spectator
 * can neither play nor see a hand before it is revealed.
 */

async function signUp(page: Page, name: string) {
  await page.goto("/games/rps");
  await page.getByRole("button", { name: "Get Started" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("DISPLAY NAME").fill(name);
  await dialog.getByLabel("EMAIL").fill(`${name.toLowerCase()}@example.test`);
  await dialog.getByLabel("PASSWORD").fill("password123");
  await dialog.getByRole("button", { name: "Create account" }).click();

  await expect(dialog).toBeHidden();
}

async function startMatch(browser: Browser, stamp: number) {
  const oneCtx = await browser.newContext();
  const twoCtx = await browser.newContext();
  const one = await oneCtx.newPage();
  const two = await twoCtx.newPage();

  await signUp(one, `Pat${stamp}`);
  await signUp(two, `Sam${stamp}`);

  await one.getByRole("button", { name: "JOIN NOW" }).click();
  await expect(one.getByText("Looking for an opponent…")).toBeVisible();
  await two.getByRole("button", { name: "JOIN NOW" }).click();
  await one.waitForURL(/\/room\//);

  return { oneCtx, twoCtx, one, two };
}

test("a match in progress is listed and a visitor can watch it", async ({ browser }) => {
  const stamp = Date.now();
  const { oneCtx, twoCtx, one, two } = await startMatch(browser, stamp);

  // A logged-out visitor, to prove watching needs no account.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await guest.goto("/watch");

    const card = guest.locator("article").filter({ hasText: `Pat${stamp}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText("LIVE");
    await expect(card).toContainText("pot 2 RAC");

    await card.getByRole("link", { name: "Watch" }).click();
    await expect(guest).toHaveURL(/\/matches\//);
    await expect(guest.getByRole("status")).toContainText("SPECTATING");
    await expect(guest.getByText("You’re watching this match")).toBeVisible();

    // No usable controls for a spectator.
    await expect(guest.getByRole("button", { name: "Rock", exact: true })).toHaveCount(0);
    await expect(guest.getByRole("button", { name: "Forfeit match" })).toHaveCount(0);

    // One player locks in: the spectator learns that, and nothing more.
    await one.getByRole("button", { name: "Paper", exact: true }).click();
    await expect(guest.getByText("Locked in").first()).toBeVisible();
    await expect(guest.getByText("No rounds yet.")).toBeVisible();
    await expect(guest.locator("body")).not.toContainText("Paper beats");

    // Once the round resolves the spectator sees the public result.
    await two.getByRole("button", { name: "Rock", exact: true }).click();
    await expect(guest.getByText("Paper beats Rock")).toBeVisible();
    await expect(guest.getByText("R1", { exact: true })).toBeVisible();

    // And the finish.
    await one.getByRole("button", { name: "Paper", exact: true }).click();
    await two.getByRole("button", { name: "Rock", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Match finished" })).toBeVisible();
    await expect(guest.getByText("Final score 2–0.")).toBeVisible();
  } finally {
    await guestCtx.close();
    await oneCtx.close();
    await twoCtx.close();
  }
});

test("the lobby previews live matches and links to the directory", async ({ browser }) => {
  const stamp = Date.now() + 1;
  const { oneCtx, twoCtx } = await startMatch(browser, stamp);

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await guest.goto("/lobby");

    const card = guest.locator("article").filter({ hasText: `Pat${stamp}` });
    await expect(card).toBeVisible();
    await expect(guest.getByText("No public matches are live right now.")).toHaveCount(0);

    await guest.getByRole("link", { name: "Watch directory" }).click();
    await expect(guest).toHaveURL(/\/watch/);
    await expect(guest.locator("article").filter({ hasText: `Pat${stamp}` })).toBeVisible();
  } finally {
    await guestCtx.close();
    await oneCtx.close();
    await twoCtx.close();
  }
});

test("a finished match drops off the directory", async ({ browser }) => {
  const stamp = Date.now() + 2;
  const { oneCtx, twoCtx, one, two } = await startMatch(browser, stamp);

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await guest.goto("/watch");
    await expect(guest.locator("article").filter({ hasText: `Pat${stamp}` })).toBeVisible();

    await one.getByRole("button", { name: "Paper", exact: true }).click();
    await two.getByRole("button", { name: "Rock", exact: true }).click();
    await one.getByRole("button", { name: "Paper", exact: true }).click();
    await two.getByRole("button", { name: "Rock", exact: true }).click();
    await expect(one.getByRole("heading", { name: "You won" })).toBeVisible();

    // The list polls, so this match's card goes away on its own. Other tests
    // run in parallel against the same API, so only this card is checked.
    await expect(guest.locator("article").filter({ hasText: `Pat${stamp}` })).toHaveCount(0, {
      timeout: 15000,
    });
  } finally {
    await guestCtx.close();
    await oneCtx.close();
    await twoCtx.close();
  }
});

test("opening a match that is not live explains itself", async ({ browser }) => {
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await guest.goto("/matches/not-a-real-match");
    await expect(guest.getByRole("heading", { name: "Match unavailable" })).toBeVisible();
    await expect(guest.getByRole("link", { name: "Watch another match" })).toBeVisible();
  } finally {
    await guestCtx.close();
  }
});
