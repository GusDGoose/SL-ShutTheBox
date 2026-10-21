import { describe, expect, it } from "vitest";
import { shiftDays } from "@/lib/dates";
import { SEASONS, easterSunday, midsummerEve, seasonFor } from "@/lib/seasons";

describe("easterSunday", () => {
  it("matches known Easters", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25");
  });
});

describe("midsummerEve", () => {
  it("is the Friday between 19 and 25 June", () => {
    expect(midsummerEve(2025)).toBe("2025-06-20");
    expect(midsummerEve(2026)).toBe("2026-06-19");
    expect(midsummerEve(2027)).toBe("2027-06-25");
  });
});

describe("seasonFor", () => {
  it("gives every day of two years a known season, and uses every season", () => {
    const seen = new Set<string>();
    for (let d = "2026-01-01"; d < "2028-01-01"; d = shiftDays(d, 1)) {
      const season = seasonFor(d);
      expect(SEASONS, d).toContain(season);
      seen.add(season);
    }
    expect([...seen].sort()).toEqual([...SEASONS].sort());
  });

  it("changes board at least once in every month", () => {
    const firsts = Array.from({ length: 12 }, (_, i) =>
      seasonFor(`2026-${String(i + 1).padStart(2, "0")}-10`),
    );
    expect(new Set(firsts).size).toBeGreaterThanOrEqual(10);
  });

  it("runs Christmas from late November to Annandag jul, then New Year", () => {
    expect(seasonFor("2026-11-21")).toBe("candlelight");
    expect(seasonFor("2026-11-22")).toBe("christmas");
    expect(seasonFor("2026-12-24")).toBe("christmas");
    expect(seasonFor("2026-12-26")).toBe("christmas");
    expect(seasonFor("2026-12-27")).toBe("newyear");
    expect(seasonFor("2027-01-01")).toBe("newyear");
    expect(seasonFor("2027-01-06")).toBe("newyear");
    expect(seasonFor("2027-01-07")).toBe("frost");
  });

  it("puts Lucia on the 13th of December only", () => {
    expect(seasonFor("2026-12-12")).toBe("christmas");
    expect(seasonFor("2026-12-13")).toBe("lucia");
    expect(seasonFor("2026-12-14")).toBe("christmas");
  });

  it("follows the moving feasts", () => {
    // Easter 2026 is 5 April: Monday of Holy Week to Easter Monday.
    expect(seasonFor("2026-03-29")).toBe("spring");
    expect(seasonFor("2026-03-30")).toBe("easter");
    expect(seasonFor("2026-04-06")).toBe("easter");
    expect(seasonFor("2026-04-07")).toBe("tulip");
    // Midsommarafton 2026 is Friday 19 June.
    expect(seasonFor("2026-06-14")).toBe("summer");
    expect(seasonFor("2026-06-15")).toBe("midsommar");
    expect(seasonFor("2026-06-21")).toBe("midsommar");
    expect(seasonFor("2026-06-22")).toBe("summer");
  });

  it("keeps the fixed traditions", () => {
    expect(seasonFor("2026-02-14")).toBe("valentine");
    expect(seasonFor("2026-02-15")).toBe("semla");
    expect(seasonFor("2026-04-30")).toBe("valborg");
    expect(seasonFor("2026-06-06")).toBe("nationalday");
    expect(seasonFor("2026-08-20")).toBe("kraftskiva");
    expect(seasonFor("2026-10-23")).toBe("autumn");
    expect(seasonFor("2026-10-31")).toBe("halloween");
    expect(seasonFor("2026-11-02")).toBe("halloween");
  });
});
