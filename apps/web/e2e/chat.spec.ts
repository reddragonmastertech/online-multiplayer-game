import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Match chat: the two players talk, nobody else hears it, and it ends with the
 * match. Each test stays short because the 10s round clock keeps running, and
 * enough timed-out rounds would end the match (and the chat) on their own.
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

  await signUp(one, `Cal${stamp}`);
  await signUp(two, `Dee${stamp}`);

  await one.getByRole("button", { name: "JOIN NOW" }).click();
  await expect(one.getByText("Looking for an opponent…")).toBeVisible();
  await two.getByRole("button", { name: "JOIN NOW" }).click();
  await one.waitForURL(/\/room\//);
  await two.waitForURL(/\/room\//);

  return { oneCtx, twoCtx, one, two };
}

function chatLog(page: Page) {
  return page.getByRole("log", { name: "Chat messages" });
}

async function say(page: Page, text: string) {
  await page.getByLabel(/^Message /).fill(text);
  await page.getByLabel(/^Message /).press("Enter");
}

test("players chat, a spectator hears none of it, and it closes with the match", async ({ browser }) => {
  const stamp = Date.now();
  const { oneCtx, twoCtx, one, two } = await startMatch(browser, stamp);
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await say(one, "good luck");
    await expect(chatLog(two)).toContainText(`Cal${stamp}good luck`);
    await expect(chatLog(one)).toContainText("Yougood luck");

    // A quick reaction is one tap.
    await two.getByRole("button", { name: "GG", exact: true }).click();
    await expect(chatLog(one)).toContainText(`Dee${stamp}GG`);

    // A spectator gets the board but no chat, before or after it is used.
    const matchId = new URL(one.url()).pathname.split("/").pop();
    await guest.goto(`/matches/${matchId}`);
    await expect(guest.getByRole("status")).toContainText("SPECTATING");
    await expect(guest.getByRole("heading", { name: "MATCH CHAT" })).toHaveCount(0);

    await say(one, "spectators cannot read this");
    await expect(chatLog(two)).toContainText("spectators cannot read this");
    await expect(guest.locator("body")).not.toContainText("spectators cannot read this");
    await expect(guest.locator("body")).not.toContainText("good luck");

    // The match ends; so does the chat.
    await two.getByRole("button", { name: "Forfeit match" }).click();
    await two.getByRole("button", { name: /Forfeit and lose/ }).click();
    await expect(one.getByText("Chat closed. The match is over.")).toBeVisible();
    await expect(two.getByText("Chat closed. The match is over.")).toBeVisible();
    await expect(one.getByLabel(/^Message /)).toHaveCount(0);
  } finally {
    await guestCtx.close();
    await oneCtx.close();
    await twoCtx.close();
  }
});

test("a reload keeps the chat, and mute hides the opponent", async ({ browser }) => {
  const stamp = Date.now() + 1;
  const { oneCtx, twoCtx, one, two } = await startMatch(browser, stamp);

  try {
    await say(one, "hello there");
    await say(two, "hi back");
    await expect(chatLog(one)).toContainText("hi back");

    await one.reload();
    await expect(chatLog(one)).toContainText("hello there");
    await expect(chatLog(one)).toContainText("hi back");

    // Muting is local: Dee stops seeing Cal, and Cal is not told.
    await two.getByRole("button", { name: `Mute Cal${stamp}` }).click();
    await expect(chatLog(two)).not.toContainText("hello there");
    await expect(chatLog(two)).toContainText("hi back");

    await say(one, "can you hear me");
    await expect(chatLog(one)).toContainText("can you hear me");
    await expect(chatLog(two)).not.toContainText("can you hear me");

    await two.getByRole("button", { name: `Unmute Cal${stamp}` }).click();
    await expect(chatLog(two)).toContainText("can you hear me");
  } finally {
    await oneCtx.close();
    await twoCtx.close();
  }
});
