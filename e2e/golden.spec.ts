import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * The path the office walks every lunchtime: PIN, say who you are, pick the
 * players, tap the tiles that stayed up, end each turn, crown the winner.
 *
 * This is the only test in the suite that exercises server actions against a
 * real database through a real build. Everything it asserts is something a
 * person would notice: the score the board shows, whose turn it says it is,
 * and whether a winner appears at the end.
 */
test("a whole game, from the PIN to the crown", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page.getByRole("heading", { name: /new game/i })).toBeVisible();

  // Two players is the smallest game with a real winner. Scoped to <main>:
  // the header's mute button is also aria-pressed, and picking that as
  // "player one" quietly started a solo game — and muted the app.
  const players = page.getByRole("main").locator("button[aria-pressed]");
  await expect(players.first()).toBeVisible();
  const count = await players.count();
  expect(count, "the roster needs at least two players seeded").toBeGreaterThan(1);
  await players.nth(0).click();
  await players.nth(1).click();

  await page.getByRole("button", { name: /roll the dice/i }).click();
  await page.waitForURL(/\/game\/[0-9a-f-]{36}/);

  // ---- turn one -------------------------------------------------------
  // Tap two tiles down; the score readout is what stays UP, so it should
  // fall by exactly what was tapped.
  const before = await readScore(page);
  await page.getByRole("button", { name: /^Tile 1 up/ }).click();
  await page.getByRole("button", { name: /^Tile 2 up/ }).click();
  await expect
    .poll(() => readScore(page), { message: "score follows the tiles" })
    .toBe(before - 3);

  await page.getByRole("button", { name: /end turn/i }).click();

  // ---- turn two -------------------------------------------------------
  // A fresh board for the second player: every tile back up.
  await expect(page.getByRole("button", { name: /^Tile 1 up/ })).toBeVisible();
  await page.getByRole("button", { name: /^Tile 3 up/ }).click();
  await page.getByRole("button", { name: /end turn/i }).click();

  // ---- the crowning ---------------------------------------------------
  const finish = page.getByRole("button", { name: /finish & crown/i });
  await expect(finish).toBeVisible();
  await finish.click();

  // Player two left tile 3 down (score 75) and player one left 1 and 2 down
  // (score 74), so player one wins — but the assertion is only that SOMEBODY
  // is crowned, because the winner rule lives in SQL and is pgTAP's to prove.
  await expect(
    page.getByRole("button", { name: /crown the winner/i }),
  ).toBeVisible();
});

/** The "score if you stop now" readout, read the way a screen reader would. */
async function readScore(page: import("@playwright/test").Page): Promise<number> {
  const label = await page
    .getByRole("status")
    .first()
    .getAttribute("aria-label");
  const n = Number((label ?? "").replace(/[^0-9]/g, ""));
  return Number.isNaN(n) ? -1 : n;
}
