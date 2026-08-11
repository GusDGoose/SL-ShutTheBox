import { describe, expect, it } from "vitest";
import { stockholmToday } from "./dates";

describe("stockholmToday", () => {
  it("returns YYYY-MM-DD", () => {
    expect(stockholmToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The whole reason this helper exists: late-evening UTC is already the NEXT
  // day in Stockholm. A naive toISOString().slice(0,10) would get these wrong.
  it("rolls over to the next day when UTC is late evening (winter, UTC+1)", () => {
    expect(stockholmToday(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });

  it("rolls over to the next day when UTC is late evening (summer, UTC+2)", () => {
    expect(stockholmToday(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });

  it("keeps the same day at midday", () => {
    expect(stockholmToday(new Date("2026-08-11T10:00:00Z"))).toBe("2026-08-11");
  });

  it("does NOT roll over just before the Stockholm midnight", () => {
    // 21:59 UTC in summer = 23:59 Stockholm — still the same day.
    expect(stockholmToday(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
  });
});
