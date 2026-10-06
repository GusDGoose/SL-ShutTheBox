import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** The local dev PIN from .env.local; deterministic, not a secret. */
export const PIN = process.env.TEAM_PIN ?? "1234";

/**
 * The local Supabase the app under test talks to, and its service key —
 * refusing anything that is not on this machine. The helpers below write to
 * the database directly, and that must never reach production by accident.
 */
function localSupabase(): { url: string; key: string } {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI puts the same variables in the environment instead.
  }
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // An unparseable URL is refused below like any other.
  }
  if (!["127.0.0.1", "localhost"].includes(host) || !key) {
    throw new Error(
      "e2e only writes to a local Supabase (127.0.0.1 or localhost) with a service key",
    );
  }
  return { url, key };
}

/**
 * One counted game a day (0023): a test that plays today's game needs today
 * free. A crowned game is soft-deleted and a live one abandoned, through the
 * same RPCs the app uses — so it is all in the audit trail, and recoverable.
 */
export async function freeToday(request: APIRequestContext) {
  const { url, key } = localSupabase();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  async function call(path: string, data?: object): Promise<unknown> {
    const res = data
      ? await request.post(`${url}/rest/v1/${path}`, { headers, data })
      : await request.get(`${url}/rest/v1/${path}`, { headers });
    const body = await res.text();
    expect(res.ok(), `${path}: ${body}`).toBe(true);
    return body ? JSON.parse(body) : null;
  }

  const today = (await call("rpc/stockholm_today", {})) as string;
  const [actor] = (await call("players?select=id&is_active=eq.true&limit=1")) as {
    id: string;
  }[];
  const games = (await call(
    `games?select=id,status&played_on=eq.${today}&deleted_at=is.null&status=neq.abandoned`,
  )) as { id: string; status: string }[];
  for (const game of games) {
    if (game.status === "finished") {
      await call("rpc/delete_game", {
        p_actor: actor!.id,
        p_game_id: game.id,
        p_reason: "e2e: freeing today for a test game",
      });
    } else {
      await call("rpc/abandon_game", {
        p_actor: actor!.id,
        p_game_id: game.id,
        p_note: "e2e: freeing today for a test game",
      });
    }
  }
}

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

/** The "score if you stop now" readout, read the way a screen reader would. */
export async function readScore(page: Page): Promise<number> {
  const label = await page.getByRole("status").first().getAttribute("aria-label");
  const n = Number((label ?? "").replace(/[^0-9]/g, ""));
  return Number.isNaN(n) ? -1 : n;
}
