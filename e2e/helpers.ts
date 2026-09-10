import { expect, type Page } from "@playwright/test";

/** The local dev PIN from .env.local; deterministic, not a secret. */
export const PIN = process.env.TEAM_PIN ?? "1234";

/**
 * Through the PIN gate and the "who are you?" gate, which every route sits
 * behind. Uses roles rather than selectors throughout: a test that passes
 * because a CSS class still exists is not testing the app.
 */
export async function signIn(page: Page, player?: string) {
  await page.goto("/");
  await page.getByLabel("Team PIN").fill(PIN);
  await page.getByRole("button", { name: "Open the box" }).click();

  // The PIN post lands on one of two pages: the identity gate, or straight
  // into the app if this device has already chosen. Wait for whichever
  // arrives before deciding — asking isVisible() immediately just races the
  // redirect and always answers "no".
  const picker = page.getByRole("heading", { name: /who are you/i });
  const rail = page.getByRole("navigation", { name: "Main" });
  await expect(picker.or(rail).first()).toBeVisible();

  if (await picker.isVisible()) {
    // Scoped to <main>: the focus bar also has a button (mute), and picking
    // that instead would hang the test on a page that never navigates.
    const who = player
      ? page.getByRole("main").getByRole("button", { name: new RegExp(player, "i") })
      : page.getByRole("main").getByRole("button").first();
    await who.click();
  }
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

/** The name of the player this device is signed in as. */
export async function identity(page: Page): Promise<string> {
  return (
    (await page.getByRole("link", { name: /you are/i }).textContent()) ?? ""
  ).trim();
}

/**
 * Nothing in this app should ever scroll sideways: every wide thing carries
 * its own overflow-x container. Asserted per page rather than once, because
 * the bug that prompted it came from the shared header and so appeared
 * everywhere at once.
 */
export async function expectNoHorizontalScroll(page: Page) {
  // /history redirects to the current month, and measuring mid-redirect
  // destroys the execution context rather than failing honestly.
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth;
  });
  expect(overflow, "document scrolls horizontally").toBeLessThanOrEqual(0);
}
