import { describe, expect, it } from "vitest";
import { activeTab, isTabActive, TABS } from "@/lib/nav";

const tab = (id: string) => TABS.find((t) => t.id === id)!;

describe("isTabActive", () => {
  it("matches Today only on the exact root", () => {
    expect(isTabActive("/", tab("today"))).toBe(true);
    expect(isTabActive("/stats", tab("today"))).toBe(false);
    expect(isTabActive("/players/abc", tab("today"))).toBe(false);
  });

  it("keeps a tab lit on its own child routes", () => {
    expect(isTabActive("/players", tab("players"))).toBe(true);
    expect(isTabActive("/players/8f2c", tab("players"))).toBe(true);
    expect(isTabActive("/stats/all-time", tab("stats"))).toBe(true);
  });

  it("lights Play while recording a game after the fact", () => {
    expect(isTabActive("/record", tab("play"))).toBe(true);
  });

  it("lights Stats while browsing history", () => {
    expect(isTabActive("/history", tab("stats"))).toBe(true);
    expect(isTabActive("/history/2026-09", tab("stats"))).toBe(true);
  });

  it("lights More on the pages it collects", () => {
    expect(isTabActive("/more", tab("more"))).toBe(true);
    expect(isTabActive("/rules", tab("more"))).toBe(true);
    expect(isTabActive("/rules/8f2c", tab("more"))).toBe(true);
    // /settings redirects to /more, but an old bookmark still lands lit.
    expect(isTabActive("/settings", tab("more"))).toBe(true);
  });

  it("does not match a route that merely starts with the same letters", () => {
    // "/players" must not light up for a hypothetical "/playersomething".
    expect(isTabActive("/playersomething", tab("players"))).toBe(false);
    expect(isTabActive("/playground", tab("play"))).toBe(false);
    expect(isTabActive("/moreish", tab("more"))).toBe(false);
  });
});

describe("activeTab", () => {
  it("resolves exactly one tab per shell route", () => {
    expect(activeTab("/")?.id).toBe("today");
    expect(activeTab("/play")?.id).toBe("play");
    expect(activeTab("/record")?.id).toBe("play");
    expect(activeTab("/stats")?.id).toBe("stats");
    expect(activeTab("/history/2026-09")?.id).toBe("stats");
    expect(activeTab("/players")?.id).toBe("players");
    expect(activeTab("/more")?.id).toBe("more");
    expect(activeTab("/rules")?.id).toBe("more");
  });

  /**
   * The regression this file exists for: every page inside the (shell) group
   * must light exactly one tab. Six of them used to light none, which is how
   * the app came to feel like a pile of unrelated pages.
   */
  it("leaves no shell route without a tab", () => {
    const shellRoutes = [
      "/",
      "/play",
      "/record",
      "/stats",
      "/stats/all-time",
      "/stats/season/8f2c",
      "/history",
      "/history/2026-09",
      "/players",
      "/players/8f2c",
      "/rules",
      "/more",
    ];
    const orphans = shellRoutes.filter((r) => activeTab(r) === undefined);
    expect(orphans).toEqual([]);
  });

  it("returns nothing for the focus routes, which have no rail at all", () => {
    expect(activeTab("/pin")).toBeUndefined();
    expect(activeTab("/whoami")).toBeUndefined();
    expect(activeTab("/game/8f2c")).toBeUndefined();
  });
});
