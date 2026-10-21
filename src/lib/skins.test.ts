import { describe, expect, it } from "vitest";
import { shiftDays } from "@/lib/dates";
import { SKINS, parseSkin, resolveSkin, skinFor } from "@/lib/skins";

describe("skinFor", () => {
  it("keeps one skin from Monday to Sunday", () => {
    const monday = "2026-10-19";
    for (let i = 0; i < 7; i++) {
      expect(skinFor(shiftDays(monday, i))).toBe(skinFor(monday));
    }
  });

  it("swaps every Monday", () => {
    let monday = "2026-01-05";
    for (let week = 0; week < 60; week++) {
      const next = shiftDays(monday, 7);
      expect(skinFor(next), next).not.toBe(skinFor(monday));
      monday = next;
    }
  });

  it("swaps across the turn of the year too", () => {
    // ISO week 53 of 2026 runs into 2027; a week-number parity would repeat here.
    expect(skinFor("2026-12-28")).not.toBe(skinFor("2027-01-04"));
    expect(skinFor("2026-12-21")).not.toBe(skinFor("2026-12-28"));
  });

  it("only ever returns a known skin", () => {
    for (let d = "2026-01-01"; d < "2026-03-01"; d = shiftDays(d, 1)) {
      expect(SKINS).toContain(skinFor(d));
    }
  });
});

describe("parseSkin / resolveSkin", () => {
  it("defaults to the weekly rotation", () => {
    expect(parseSkin(undefined)).toBe("auto");
    expect(parseSkin("wood")).toBe("auto");
    expect(parseSkin("retro")).toBe("retro");
  });

  it("follows the week on auto and honours a pinned skin", () => {
    expect(resolveSkin("auto", "2026-10-21")).toBe(skinFor("2026-10-21"));
    expect(resolveSkin("cartoon", "2026-10-21")).toBe("cartoon");
    expect(resolveSkin("retro", "2026-10-21")).toBe("retro");
  });
});
