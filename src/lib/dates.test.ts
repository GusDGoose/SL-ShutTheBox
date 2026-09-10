import { describe, expect, it } from "vitest";
import { dayLabel, isoMonday, shiftDays, stockholmToday } from "./dates";

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

describe("dayLabel", () => {
  it("reads as an English heading", () => {
    expect(dayLabel("2026-09-04")).toBe("Friday 4 September");
  });

  it("is already capitalised, unlike the Swedish label it replaced", () => {
    expect(dayLabel("2026-01-05")).toMatch(/^[A-Z]/);
  });

  // Anchoring at midday UTC is what stops a bare date drifting a day either
  // way across a DST boundary.
  it("does not drift across the spring DST change", () => {
    expect(dayLabel("2026-03-29")).toBe("Sunday 29 March");
  });

  it("does not drift across the autumn DST change", () => {
    expect(dayLabel("2026-10-25")).toBe("Sunday 25 October");
  });
});

describe("isoMonday", () => {
  it("leaves a Monday alone", () => {
    expect(isoMonday("2026-09-07")).toBe("2026-09-07");
  });

  it("walks back to Monday from any weekday", () => {
    expect(isoMonday("2026-09-10")).toBe("2026-09-07");
    expect(isoMonday("2026-09-11")).toBe("2026-09-07");
  });

  it("puts Sunday in the week that started six days earlier", () => {
    // The off-by-one that would put Sunday in the wrong week entirely.
    expect(isoMonday("2026-09-13")).toBe("2026-09-07");
    expect(isoMonday("2026-09-14")).toBe("2026-09-14");
  });

  it("crosses a month and a year boundary", () => {
    expect(isoMonday("2026-10-01")).toBe("2026-09-28");
    expect(isoMonday("2027-01-01")).toBe("2026-12-28");
  });
});

describe("shiftDays", () => {
  it("moves forwards and backwards across months", () => {
    expect(shiftDays("2026-09-07", -7)).toBe("2026-08-31");
    expect(shiftDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("survives the spring clock change, which is why it works in UTC", () => {
    // Europe/Stockholm springs forward on 2026-03-29.
    expect(shiftDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDays("2026-03-29", 1)).toBe("2026-03-30");
  });
});
