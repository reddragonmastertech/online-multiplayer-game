import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Step 7's acceptance test: two browsers play a real match to completion and
 * the RAC that moves matches the ledger. The server owns the outcome, so the
 * test only presses buttons and reads what comes back.
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

function balance(page: Page, name: string, rac: number) {
  return expect(page.getByRole("link", { name: new RegExp(`${name}.*${rac} RAC`) })).toBeVisible();
}

async function pairUp(browser: Browser, stamp: number) {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await signUp(alice, `Ann${stamp}`);
  await signUp(bob, `Ben${stamp}`);

  await alice.getByRole("radio", { name: /^1 RAC/ }).click();
  await alice.getByRole("button", { name: "JOIN NOW" }).click();
  await expect(alice.getByText("Looking for an opponent…")).toBeVisible();

  await bob.getByRole("radio", { name: /^1 RAC/ }).click();
  await bob.getByRole("button", { name: "JOIN NOW" }).click();

  // Both land in the same room.
  await expect(alice).toHaveURL(/\/room\//);
  await expect(bob).toHaveURL(/\/room\//);
  expect(new URL(alice.url()).pathname).toBe(new URL(bob.url()).pathname);

  return { aliceCtx, bobCtx, alice, bob };
}

/** Plays round `round` with Ann beating Ben, and waits for it to be logged. */
async function annWinsRound(alice: Page, bob: Page, round: number) {
  await alice.getByRole("button", { name: "Rock", exact: true }).click();
  await bob.getByRole("button", { name: "Scissors", exact: true }).click();

  await expect(alice.getByText(`R${round}`, { exact: true })).toBeVisible();
  await expect(bob.getByText(`R${round}`, { exact: true })).toBeVisible();
}

/**
 * Step 8's acceptance path, walked the way a stranger actually walks it:
 * intro → lobby → game → sign up → JOIN NOW → play → lobby with a new balance.
 */
test("a stranger goes from the intro page to a finished match", async ({ browser }) => {
  const stamp = Date.now() + 4;
  const newcomerCtx = await browser.newContext();
  const rivalCtx = await browser.newContext();
  const newcomer = await newcomerCtx.newPage();
  const rival = await rivalCtx.newPage();

  try {
    await newcomer.goto("/");
    await newcomer.getByRole("link", { name: "Explore Games" }).click();
    await expect(newcomer).toHaveURL(/\/lobby/);

    await newcomer.getByRole("link", { name: "Play Now" }).first().click();
    await expect(newcomer).toHaveURL(/\/games\/rps/);

    // JOIN NOW asks a guest to authenticate, then returns them to the lobby.
    await newcomer.getByRole("button", { name: "JOIN NOW" }).click();
    const dialog = newcomer.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Sign up" }).click();
    await dialog.getByLabel("DISPLAY NAME").fill(`New${stamp}`);
    await dialog.getByLabel("EMAIL").fill(`new${stamp}@example.test`);
    await dialog.getByLabel("PASSWORD").fill(password);
    await dialog.getByRole("button", { name: "Create account" }).click();

    await expect(dialog).toBeHidden();
    await expect(newcomer).toHaveURL(/\/games\/rps/);
    await balance(newcomer, `New${stamp}`, 100);

    await newcomer.getByRole("button", { name: "JOIN NOW" }).click();
    await expect(newcomer.getByText("Looking for an opponent…")).toBeVisible();

    await signUp(rival, `Foe${stamp}`);
    await rival.getByRole("button", { name: "JOIN NOW" }).click();
    await newcomer.waitForURL(/\/room\//);

    await newcomer.getByRole("button", { name: "Rock", exact: true }).click();
    await rival.getByRole("button", { name: "Scissors", exact: true }).click();
    await expect(newcomer.getByText("R1", { exact: true })).toBeVisible();
    await newcomer.getByRole("button", { name: "Rock", exact: true }).click();
    await rival.getByRole("button", { name: "Scissors", exact: true }).click();
    await expect(newcomer.getByRole("heading", { name: "You won" })).toBeVisible();

    // Back to the lobby, carrying the new balance.
    await newcomer.getByRole("link", { name: "Back to RPS Lobby" }).click();
    await expect(newcomer).toHaveURL(/\/games\/rps/);
    await balance(newcomer, `New${stamp}`, 101);
    await expect(newcomer.getByText("Signed in as New" + stamp, { exact: false })).toBeVisible();
  } finally {
    await newcomerCtx.close();
    await rivalCtx.close();
  }
});

test("two browsers play a match out and the winner gains the loser's stake", async ({ browser }) => {
  const stamp = Date.now();
  const { aliceCtx, bobCtx, alice, bob } = await pairUp(browser, stamp);

  try {
    // Both stakes are locked while the match runs.
    await balance(alice, `Ann${stamp}`, 99);
    await balance(bob, `Ben${stamp}`, 99);

    await annWinsRound(alice, bob, 1);
    await annWinsRound(alice, bob, 2);

    await expect(alice.getByRole("heading", { name: "You won" })).toBeVisible();
    await expect(bob.getByRole("heading", { name: "You lost" })).toBeVisible();
    await expect(alice.getByText("+1 RAC")).toBeVisible();
    await expect(bob.getByText("-1 RAC")).toBeVisible();

    // Winner +stake, loser -stake, nothing left locked.
    await balance(alice, `Ann${stamp}`, 101);
    await balance(bob, `Ben${stamp}`, 99);

    // The balance survives a reload, so it came from the database.
    await alice.goto("/account");
    await expect(alice.getByText("Available 101 · Locked 0")).toBeVisible();
    await expect(alice.getByText(`vs Ben${stamp}`)).toBeVisible();
    await expect(alice.getByText("2–0")).toBeVisible();

    await bob.goto("/account");
    await expect(bob.getByText("Available 99 · Locked 0")).toBeVisible();
    await expect(bob.getByText(`vs Ann${stamp}`)).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test("a locked hand is never revealed to the opponent before the round resolves", async ({
  browser,
}) => {
  const stamp = Date.now() + 1;
  const { aliceCtx, bobCtx, alice, bob } = await pairUp(browser, stamp);

  try {
    await alice.getByRole("button", { name: "Paper", exact: true }).click();
    await expect(alice.getByText("Opponent is choosing…")).toBeVisible();

    // Ben's view of Ann's seat says only that she is locked in. Checking the
    // seat rather than the page matters: Ben's own hand buttons say "Paper".
    const annSeat = bob.locator("section").filter({ hasText: `Ann${stamp}` }).first();
    await expect(annSeat.getByText("Locked in")).toBeVisible();
    await expect(annSeat).not.toContainText("Paper");

    // Nothing in the round history either, because the round has not resolved.
    await expect(bob.getByText("No rounds yet.")).toBeVisible();

    await bob.getByRole("button", { name: "Rock", exact: true }).click();
    await expect(bob.getByText("R1", { exact: true })).toBeVisible();
    await expect(annSeat).toContainText("Paper");
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test("forfeiting hands the stake to the opponent", async ({ browser }) => {
  const stamp = Date.now() + 2;
  const { aliceCtx, bobCtx, alice, bob } = await pairUp(browser, stamp);

  try {
    await bob.getByRole("button", { name: "Forfeit match" }).click();
    await expect(bob.getByText(/Your 1 RAC stake goes to your opponent/)).toBeVisible();
    await bob.getByRole("button", { name: /Forfeit and lose 1 RAC/ }).click();

    await expect(bob.getByRole("heading", { name: "You lost" })).toBeVisible();
    await expect(alice.getByRole("heading", { name: "You won" })).toBeVisible();
    await expect(alice.getByText("The match ended by forfeit.")).toBeVisible();

    await balance(alice, `Ann${stamp}`, 101);
    await balance(bob, `Ben${stamp}`, 99);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test("a reload drops back into the live match", async ({ browser }) => {
  const stamp = Date.now() + 3;
  const { aliceCtx, bobCtx, alice, bob } = await pairUp(browser, stamp);

  try {
    await annWinsRound(alice, bob, 1);

    const room = alice.url();
    await alice.reload();

    // The server re-seats the player and resends the authoritative state,
    // including the round already played.
    await expect(alice).toHaveURL(room);
    await expect(alice.getByText("R1", { exact: true })).toBeVisible();
    await expect(alice.getByText("Rock beats Scissors")).toBeVisible();
    await expect(alice.getByRole("button", { name: "Rock", exact: true })).toBeEnabled();

    await annWinsRound(alice, bob, 2);
    await expect(alice.getByRole("heading", { name: "You won" })).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
