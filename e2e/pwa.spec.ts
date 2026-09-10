import { expect, test } from "@playwright/test";

/**
 * The install path.
 *
 * Every asset here is fetched by the browser WITHOUT cookies, so each one is
 * requested from a context that has never seen the PIN. If the proxy ever
 * starts gating them they redirect to /pin, the manifest fails to parse, and
 * the app silently stops being installable — with nothing in any log.
 */
test.describe("installable", () => {
  test("the manifest is readable by a browser that has no session", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBe("Shut the Box");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    // A maskable icon is what stops Android putting the whole square inside
    // its own circle and cropping the tiles off.
    expect(
      manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
    ).toBe(true);
  });

  test("every icon the manifest promises actually exists", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const res = await request.get(icon.src);
      expect(res.status(), `${icon.src} is missing`).toBe(200);
      expect(res.headers()["content-type"]).toContain("image");
    }
  });

  test("the page links to the manifest", async ({ page }) => {
    await page.goto("/pin");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
  });
});

test.describe("locked down", () => {
  test("an unauthenticated visitor gets the PIN gate, not the app", async ({
    page,
  }) => {
    await page.goto("/stats");
    await expect(page).toHaveURL(/\/pin/);
    await expect(page.getByLabel("Team PIN")).toBeVisible();
  });

  test("the cron routes refuse a caller with no secret", async ({ request }) => {
    for (const path of ["/api/cron/morning", "/api/cron/afternoon"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} is unprotected`).toBe(401);
    }
  });

  test("health reports its shape without leaking values", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("SUPABASE_URL_set");
    // Booleans only — no key, no PIN, no URL.
    expect(body).not.toMatch(/eyJ|sb_secret|service_role/);
  });
});
