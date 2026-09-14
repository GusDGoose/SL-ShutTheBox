import { expect, test } from "@playwright/test";
import { readScore, signIn } from "./helpers";

/**
 * Team play, from an organiser creating an event to a crowned winner.
 *
 * The two halves matter as much as the flow: the organiser is a colleague with
 * the PIN and a name, and the team is a GUEST — a second browser context with
 * no cookies at all, which is the thing the whole feature rests on. If the
 * guest ever lands on /pin, the team day does not happen.
 */
test("a team day, from the code on the screen to the crown", async ({
  page,
  browser,
}) => {
  // ---- the organiser --------------------------------------------------
  await signIn(page);
  await page.goto("/t/new");
  await expect(page.getByRole("heading", { name: /team play/i })).toBeVisible();

  await page.getByLabel(/what is the occasion/i).fill("E2E day");
  await page.getByRole("button", { name: /create it/i }).click();
  await page.waitForURL(/\/t\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

  const code = page.url().split("/t/")[1]!;
  // The code is spelled out for a screen reader, not read as a word.
  await expect(
    page.getByLabel(`Join code ${code.split("").join(" ")}`),
  ).toBeVisible();

  // ---- a team's phone, with no cookies whatsoever ----------------------
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/t/${code}`);

  // Past no gate, and with none of the app's own navigation offered.
  await expect(guest).toHaveURL(new RegExp(`/t/${code}$`));
  await expect(guest.getByText("E2E day").first()).toBeVisible();
  await expect(
    guest.getByRole("navigation", { name: "Main" }),
    "a guest must not be offered the rest of the app",
  ).toHaveCount(0);

  await guest.getByLabel("Team name").fill("Foxes");
  await guest.getByRole("radio", { name: "🦊" }).click();
  await guest
    .getByLabel(/victory song/i)
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await guest.getByRole("button", { name: /add the team/i }).click();

  // Straight to its own board: the phone that makes a team keeps its score.
  await guest.waitForURL(/\/team\/[0-9a-f-]{36}$/);
  await expect(guest.getByRole("heading", { name: /foxes/i })).toBeVisible();

  await guest.getByLabel("Player name").fill("Ann");
  await guest.getByRole("button", { name: "Add", exact: true }).click();
  await expect(guest.getByText("Ann")).toBeVisible();
  await guest.getByLabel("Player name").fill("Bo");
  await guest.getByRole("button", { name: "Add", exact: true }).click();

  await guest.getByRole("button", { name: /start playing/i }).click();
  await expect(guest.getByText(/ann is up/i)).toBeVisible();

  // ---- Ann's turn, tapped out on the board -----------------------------
  const before = await readScore(guest);
  await guest.getByRole("button", { name: /^Tile 1 up/ }).click();
  await guest.getByRole("button", { name: /^Tile 2 up/ }).click();
  await expect
    .poll(() => readScore(guest), { message: "the score follows the tiles" })
    .toBe(before - 3);

  // A refresh mid-turn must not lose the tiles: the board lives in the
  // database, not in this phone.
  //
  // Polled rather than read once. The readout above moves optimistically, the
  // moment a thumb lands, so reading it is no proof the write has reached the
  // server yet — and reloading on that assumption is a race the mobile project
  // actually lost.
  await guest.reload();
  await expect(guest.getByRole("button", { name: /^Tile 1 down/ })).toBeVisible();
  await expect
    .poll(() => readScore(guest), {
      message: "the tiles survived the refresh, so the board really is server-side",
    })
    .toBe(before - 3);

  await guest.getByRole("button", { name: /end turn/i }).click();
  await expect(guest.getByText(/bo is up/i)).toBeVisible();

  // ---- Bo's turn, typed in off the real box ----------------------------
  await guest.getByRole("radio", { name: /type score/i }).click();
  for (const digit of ["4", "0"]) {
    await guest.getByRole("button", { name: `Digit ${digit}` }).click();
  }
  await guest.getByRole("button", { name: /end turn/i }).click();

  await expect(guest.getByRole("heading", { name: /foxes are done/i })).toBeVisible();
  // (78 - 3) and 40 average 57.5 — the team score, so an uneven team is fair.
  await expect(guest.getByText("57.5")).toBeVisible();

  // ---- crowning, from the organiser's laptop ---------------------------
  await page.reload();
  await expect(page.getByText(/1 of 1|every team has finished/i)).toBeVisible();
  await page.getByRole("button", { name: /finish & crown/i }).click();

  await expect(page.getByRole("heading", { name: /foxes win/i })).toBeVisible();
  const crown = page.getByRole("button", { name: /crown the winner/i });
  await expect(crown).toBeVisible();
  await crown.click();
  // The anthem is mounted BY that tap, which is the only way a browser lets a
  // page make noise.
  await expect(page.getByText(/anthem/i)).toBeVisible();

  // The team's phone was taken to the result too, without anybody reloading it.
  await expect(guest).toHaveURL(new RegExp(`/t/${code}$`), { timeout: 15000 });
  await expect(guest.getByRole("heading", { name: /foxes win/i })).toBeVisible();

  // ---- clean up, the way a rehearsal gets cleaned up -------------------
  await page.getByRole("button", { name: /delete this team play/i }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL("/");

  await guestContext.close();
});

test("a code nobody handed out is a dead end, not a door", async ({ browser }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();

  const response = await guest.goto("/t/ZZZZZZ");
  expect(response?.status()).toBe(404);
  await expect(
    guest.getByRole("heading", { name: /no team play has that code/i }),
  ).toBeVisible();

  await guestContext.close();
});

test("a stale PIN link into team play goes straight through", async ({ browser }) => {
  /**
   * What the QR codes on 2026-09-14 actually encoded: APP_URL in Vercel had
   * been pasted from the address bar while on the PIN page, so every code
   * pointed at /pin with the event path glued onto its query. A guest scanning
   * it saw the gate, and the gate then sent them to Today. The destination
   * needs no PIN, so the gate must not ask for one.
   */
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();

  await guest.goto("/pin?next=%2F/t/ZZZZZZ");
  await expect(guest).toHaveURL(/\/t\/ZZZZZZ$/);
  await expect(
    guest.getByRole("heading", { name: /no team play has that code/i }),
  ).toBeVisible();

  await guestContext.close();
});

test("a guest cannot start an event, only join one", async ({ browser }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();

  await guest.goto("/t/new");
  await expect(guest).toHaveURL(/\/pin\?next=%2Ft%2Fnew/);

  await guestContext.close();
});
