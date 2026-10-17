import { expect, test, type Browser, type Page } from "@playwright/test";

const run = Date.now().toString(36).slice(-5);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function register(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/register");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Username").fill(name.toLowerCase());
  await page.getByLabel("Email").fill(`${name.toLowerCase()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`Welcome to SythiX Unite, ${name}!`)).toBeVisible();
  return page;
}

test("SythiX Unite end to end: ID, Social, Connect with realtime", async ({ browser }) => {
  const alice = await register(browser, `Alice${run}`);
  const bob = await register(browser, `Bob${run}`);
  const aliceUser = `alice${run}`;
  const bobUser = `bob${run}`;

  // Social: Alice posts with an image and a hashtag.
  await alice.goto("/social");
  await alice.getByLabel("Write a post").first().fill(`First light in the Unite #launch${run} @${bobUser}`);
  await alice.locator('input[type="file"]').first().setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await expect(alice.getByRole("button", { name: "Post", exact: true })).toBeEnabled();
  await alice.getByRole("button", { name: "Post", exact: true }).click();
  await expect(alice.getByText(`First light in the Unite`).first()).toBeVisible();
  await expect(alice.locator('article img[src^="/api/media/"]').first()).toBeVisible();

  // Bob gets a mention notification, follows Alice and reacts.
  await bob.goto("/notifications");
  await expect(bob.getByText(`mentioned you in a post`)).toBeVisible();
  await bob.goto(`/u/${aliceUser}`);
  await bob.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(bob.getByRole("button", { name: "Following" })).toBeVisible();
  await bob.getByRole("button", { name: "React" }).first().click();
  await expect(bob.getByRole("button", { name: /Remove reaction/ }).first()).toBeVisible();

  // Tag page and Everything Command search.
  await bob.goto(`/social/tag/launch${run}`);
  await expect(bob.getByText("First light in the Unite").first()).toBeVisible();
  await bob.keyboard.press("Control+k");
  await bob.getByRole("combobox", { name: "Search or command" }).fill(aliceUser);
  await expect(bob.getByRole("option", { name: new RegExp(aliceUser) }).first()).toBeVisible();
  await bob.keyboard.press("Escape");

  // Connect: Alice creates a community, Bob joins via invite, realtime chat both ways.
  await alice.goto("/connect?create=1");
  await alice.getByLabel("Name").fill(`Builders ${run}`);
  await alice.getByRole("button", { name: "Create", exact: true }).click();
  await expect(alice.getByRole("heading", { name: `Builders ${run}` })).toBeVisible();
  await expect(alice.getByText("Welcome to #general")).toBeVisible();
  await alice.getByRole("button", { name: "Invite people" }).click();
  const invite = await alice.getByLabel("Invite link", { exact: true }).inputValue();
  await alice.keyboard.press("Escape");

  await bob.goto(new URL(invite).pathname);
  await bob.getByRole("button", { name: "Accept invite" }).click();
  await expect(bob.getByText("Welcome to #general")).toBeVisible();

  // Wait until both sockets are live, then exchange messages.
  await expect(alice.getByText("2 here")).toBeVisible({ timeout: 15_000 });
  await bob.getByLabel("Message #general").fill("hello from bob");
  await bob.keyboard.press("Enter");
  await expect(alice.getByText("hello from bob")).toBeVisible({ timeout: 10_000 });
  await alice.getByLabel("Message #general").fill("hi bob, realtime works");
  await alice.keyboard.press("Enter");
  await expect(bob.getByText("hi bob, realtime works")).toBeVisible({ timeout: 10_000 });

  // Voice channels are honestly unavailable without a media server.
  await alice.goto("/areas/hosting");
  await expect(alice.getByText("A management dashboard is not a hosting service.")).toBeVisible();

  // Direct message: Alice follows Bob so Bob may message Alice.
  await alice.goto(`/u/${bobUser}`);
  await alice.getByRole("button", { name: "Follow back" }).click();
  await expect(alice.getByRole("button", { name: "Following" })).toBeVisible();
  await bob.goto(`/u/${aliceUser}`);
  await bob.getByRole("button", { name: "Message" }).click();
  await expect(bob).toHaveURL(/\/connect\/dm\//);
  await bob.getByLabel(/Message /).fill("dm test");
  await bob.keyboard.press("Enter");
  await expect(bob.getByText("dm test")).toBeVisible();

  // Settings: appearance switches theme.
  await alice.goto("/settings/appearance");
  await alice.getByRole("button", { name: "Light" }).click();
  await expect(alice.locator("html")).toHaveAttribute("data-theme", "light");
});
