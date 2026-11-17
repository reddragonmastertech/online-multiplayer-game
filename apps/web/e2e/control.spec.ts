import { expect, test, type Browser, type Page } from "@playwright/test";
import { enterAdmin, makeAdmin, resetSiteSettings } from "./admin-helpers";

/** Roadmap 4.2 part D3: the banner, maintenance mode, the live view and voiding a match. */

test.beforeEach(() => resetSiteSettings());
test.afterEach(() => resetSiteSettings());

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

async function newPlayer(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, name);
  return { context, page };
}

test("an admin shows a banner and turns on maintenance; players see both at once", async ({ browser }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const owner = await newPlayer(browser, `Ctl${stamp}`);
  const player = await newPlayer(browser, `Vis${stamp}`);
  makeAdmin(`Ctl${stamp}`, "owner");
  await enterAdmin(owner.page);
  await owner.page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Control" }).click();

  // A banner on every page.
  const banner = owner.page.getByRole("region", { name: "Announcement banner" });
  await banner.getByLabel("Text (every page shows it)").fill("Server update tonight at 22:00 UTC");
  await banner.getByRole("button", { name: "Show banner" }).click();
  await expect(owner.page.getByRole("status")).toHaveText("Announcement saved.");

  await player.page.goto("/games/rps");
  const notices = player.page.getByRole("region", { name: "Site notices" });
  await expect(notices).toContainText("Server update tonight at 22:00 UTC");
  await expect(player.page.getByRole("button", { name: "JOIN NOW" })).toBeEnabled();

  // Maintenance: no new matches, and the page says why.
  await owner.page.getByRole("switch", { name: "Maintenance mode" }).click();
  await expect(owner.page.getByRole("switch", { name: "Maintenance mode" })).toHaveText("MAINTENANCE");
  await player.page.reload();
  await expect(notices).toContainText("Maintenance: new matches are paused.");
  await expect(player.page.getByRole("button", { name: "JOIN NOW" })).toBeDisabled();
  await expect(player.page.getByText("The arena is in maintenance. New matches are paused.")).toBeVisible();

  // Pausing USDT rooms closes only the USDT tab.
  await owner.page.getByRole("switch", { name: "Maintenance mode" }).click();
  await owner.page.getByRole("switch", { name: "USDT rooms" }).click();
  await expect(owner.page.getByRole("switch", { name: "USDT rooms" })).toHaveText("PAUSED");
  await player.page.reload();
  await expect(player.page.getByRole("button", { name: "JOIN NOW" })).toBeEnabled();
  await player.page.getByRole("radio", { name: /^USDT/ }).click();
  await expect(player.page.getByText("USDT rooms are paused right now. RAC rooms are open.")).toBeVisible();

  // Every change is in the audit log.
  await owner.page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit log" }).click();
  await expect(owner.page.getByRole("list", { name: "Audit entries" })).toContainText("site.settings_changed");

  await owner.context.close();
  await player.context.close();
});

test("an admin voids a live match and both players get their stakes back", async ({ browser }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const owner = await newPlayer(browser, `Vdr${stamp}`);
  const ann = await newPlayer(browser, `Van${stamp}`);
  const ben = await newPlayer(browser, `Vbe${stamp}`);
  makeAdmin(`Vdr${stamp}`, "owner");

  for (const side of [ann, ben]) {
    await side.page.goto("/games/rps");
    await side.page.getByRole("radio", { name: /^10 RAC/ }).click();
    await side.page.getByRole("button", { name: "JOIN NOW" }).click();
  }
  await expect(ann.page).toHaveURL(/\/room\//);
  await expect(ben.page).toHaveURL(/\/room\//);
  await expect(ann.page.getByRole("link", { name: new RegExp(`Van${stamp}.*90 RAC`) })).toBeVisible();

  await enterAdmin(owner.page);
  await owner.page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Live" }).click();
  await owner.page.getByRole("list", { name: "Live matches" }).getByRole("link", { name: new RegExp(`Van${stamp}`) }).click();
  await expect(owner.page.getByText(/10 RAC stake · live/)).toBeVisible();

  const voidForm = owner.page.getByRole("form", { name: /Void this match/ });
  await voidForm.getByLabel("Reason (saved in the audit log)").fill("Testing the void button");
  await voidForm.getByRole("button", { name: "Void match" }).click();
  await expect(owner.page.getByText(/10 RAC stake · cancelled/)).toBeVisible();

  for (const [side, name] of [
    [ann, `Van${stamp}`],
    [ben, `Vbe${stamp}`],
  ] as const) {
    await expect(side.page.getByRole("heading", { name: "Match cancelled" })).toBeVisible();
    await expect(side.page.getByText("An admin cancelled this match. Your stake has been returned in full.")).toBeVisible();
    await expect(side.page.getByRole("link", { name: new RegExp(`${name}.*100 RAC`) })).toBeVisible();
  }

  await owner.context.close();
  await ann.context.close();
  await ben.context.close();
});
