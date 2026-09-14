import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "./proxy";

// Asserted against Next's own matcher implementation rather than a regex
// replica, so this can't drift from what actually runs in production.
const gated = (pathname: string) =>
  unstable_doesMiddlewareMatch({ config, url: pathname });

describe("proxy matcher", () => {
  it("gates the app", () => {
    for (const path of [
      "/",
      "/play",
      "/stats",
      "/stats/all-time",
      "/players",
      "/players/8f2c",
      "/game/8f2c",
      "/history/2026-09",
      "/settings",
      "/rules",
      "/whoami",
    ]) {
      expect(gated(path), `${path} must require the PIN`).toBe(true);
    }
  });

  it("exempts the PIN page itself, but only as its own segment", () => {
    expect(gated("/pin")).toBe(false);
    expect(gated("/pin/")).toBe(false);
    // The v1 matcher excluded the bare prefix "pin", which would have left a
    // route like this wide open.
    expect(gated("/pinboard")).toBe(true);
  });

  it("exempts the health check, but not lookalike routes", () => {
    expect(gated("/api/health")).toBe(false);
    expect(gated("/api/healthcheck")).toBe(true);
  });

  it("exempts cron routes (they carry CRON_SECRET instead)", () => {
    expect(gated("/api/cron/morning")).toBe(false);
    expect(gated("/api/cron/afternoon")).toBe(false);
  });

  it("exempts PWA files, which the browser fetches without cookies", () => {
    expect(gated("/manifest.webmanifest")).toBe(false);
    expect(gated("/icon.svg")).toBe(false);
    expect(gated("/apple-icon.png")).toBe(false);
    expect(gated("/icons/icon-512.png")).toBe(false);
    expect(gated("/favicon.ico")).toBe(false);
  });

  it("lets guests reach team play without the office PIN", () => {
    // The join code in the link is what stands in for the PIN here; a colleague
    // at a team day cannot be handed the office passcode.
    expect(gated("/t")).toBe(false);
    expect(gated("/t/ABC234")).toBe(false);
    expect(gated("/t/abc234/team/8f2c")).toBe(false);
    // /t/new creates an event, and gates itself on the PIN AND an identity.
    expect(gated("/t/new")).toBe(false);
  });

  it("but only that route, not everything starting with a t", () => {
    for (const path of ["/tea", "/tournament", "/t2x", "/players"]) {
      expect(gated(path), `${path} must still require the PIN`).toBe(true);
    }
  });

  it("exempts the sound sprite so audio isn't redirected to the PIN page", () => {
    expect(gated("/sfx/sprite.mp3")).toBe(false);
    expect(gated("/sfx/sprite.json")).toBe(false);
  });
});
