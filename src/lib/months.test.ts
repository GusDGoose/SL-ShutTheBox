import { describe, expect, it } from "vitest";
import {
  isMonth,
  monthBounds,
  monthLabel,
  monthOf,
  shiftMonth,
} from "./months";

describe("monthOf", () => {
  it("takes the month off a played_on date", () => {
    expect(monthOf("2026-09-08")).toBe("2026-09");
  });
});

describe("isMonth", () => {
  it("accepts YYYY-MM and nothing that merely looks like it", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-9")).toBe(false);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-00")).toBe(false);
    expect(isMonth("2026-09-08")).toBe(false);
    expect(isMonth("september")).toBe(false);
  });
});

describe("monthBounds", () => {
  it("runs from the first to the last day, and knows February", () => {
    expect(monthBounds("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});

describe("shiftMonth", () => {
  it("steps across year boundaries in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", -3)).toBe("2026-06");
  });
});

describe("monthLabel", () => {
  it("reads as a heading, in English", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthLabel("2026-01")).toBe("January 2026");
  });
});
