import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn } from "./helpers";

/**
 * The two things that were wrong when Gustav said the app felt scattered:
 * pages that lit no tab, and a page that scrolled sideways.
 *
 * Both are regressions that a unit test cannot see — the tab rail depends on
 * which layout group a route lives in, and horizontal overflow only exists
 * once real content is laid out at a real width.
 */
const SHELL_ROUTES = [
  { path: "/", tab: "Today" },
  { path: "/play", tab: "Play" },
  { path: "/record", tab: "Play" },
  { path: "/stats", tab: "Stats" },
  { path: "/stats/all-time", tab: "Stats" },
  { path: "/history", tab: "Stats" },
  { path: "/players", tab: "Players" },
  { path: "/rules", tab: "More" },
  { path: "/fika", tab: "More" },
  { path: "/more", tab: "More" },
];

test.describe("the tab rail", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const { path, tab } of SHELL_ROUTES) {
    test(`${path} lights exactly one tab, and it is ${tab}`, async ({ page }) => {
      await page.goto(path);
      const current = page.locator(
        'nav[aria-label="Main"] a[aria-current="page"]',
      );
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(tab);
    });
  }

  test("the settings page people bookmarked still lands somewhere lit", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/more$/);
    await expect(
      page.locator('nav[aria-label="Main"] a[aria-current="page"]'),
    ).toContainText("More");
  });

  test("the board has no rail at all, on purpose", async ({ page }) => {
    await page.goto("/pin");
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  });
});

test.describe("nothing scrolls sideways", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const { path } of SHELL_ROUTES) {
    test(`${path} fits the screen`, async ({ page }) => {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    });
  }

  test("not even with a very long player name in the header", async ({
    page,
  }) => {
    // The actual bug: the header is a flex row, flex children default to
    // min-width:auto, and a long enough name pushed the whole document past
    // the viewport on every route at once.
    await page.goto("/");
    await page.evaluate(() => {
      const chip = document.querySelector(
        'header a[href="/whoami"] span.font-semibold',
      );
      if (chip) chip.textContent = "Marie-Louise Bergström-Håkansson";
    });
    await expectNoHorizontalScroll(page);
  });
});
