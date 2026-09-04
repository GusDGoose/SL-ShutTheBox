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

  it("lights Play while a game is open", () => {
    expect(isTabActive("/game/8f2c", tab("play"))).toBe(true);
    expect(isTabActive("/game/8f2c/edit", tab("play"))).toBe(true);
  });

  it("lights Stats while browsing history", () => {
    expect(isTabActive("/history", tab("stats"))).toBe(true);
    expect(isTabActive("/history/2026-09", tab("stats"))).toBe(true);
  });

  it("does not match a route that merely starts with the same letters", () => {
    // "/players" must not light up for a hypothetical "/playersomething".
    expect(isTabActive("/playersomething", tab("players"))).toBe(false);
    expect(isTabActive("/playground", tab("play"))).toBe(false);
  });
});

describe("activeTab", () => {
  it("resolves exactly one tab per in-app route", () => {
    expect(activeTab("/")?.id).toBe("today");
    expect(activeTab("/play")?.id).toBe("play");
    expect(activeTab("/game/1")?.id).toBe("play");
    expect(activeTab("/stats")?.id).toBe("stats");
    expect(activeTab("/history/2026-09")?.id).toBe("stats");
    expect(activeTab("/players")?.id).toBe("players");
  });

  it("returns nothing for routes outside the tab bar", () => {
    expect(activeTab("/pin")).toBeUndefined();
    expect(activeTab("/settings")).toBeUndefined();
    expect(activeTab("/rules")).toBeUndefined();
  });
});
