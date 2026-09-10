import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Automated accessibility checks on the pages people actually use.
 *
 * Axe catches maybe a third of real problems — it cannot tell whether a
 * label makes sense, only whether one exists — so this is a floor, not a
 * ceiling. It is set at "serious and critical" because that is the band that
 * stops somebody using the app rather than merely annoying them: contrast a
 * person cannot read, a control with no name, a form field with no label.
 *
 * The PIN field is why this exists: its only label was a placeholder, which
 * vanishes the moment you type, on the one control that gates the whole app.
 */
const BLOCKING = ["serious", "critical"];

async function violations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => BLOCKING.includes(v.impact ?? ""))
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      where: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }));
}

test("the PIN gate is usable without sight", async ({ page }) => {
  await page.goto("/pin");
  expect(await violations(page)).toEqual([]);
});

for (const path of ["/", "/play", "/stats", "/players", "/more", "/fika"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await signIn(page);
    await page.goto(path);
    expect(await violations(page)).toEqual([]);
  });
}
