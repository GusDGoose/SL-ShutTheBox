import { describe, expect, it } from "vitest";
// Imported through the "@/" alias on purpose: it proves tsconfig path
// resolution works in vitest, which it did not before the config was added.
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  parseMode,
  parseTheme,
  resolveMode,
  serializeThemeCookie,
  THEMES,
  THEME_INIT_SCRIPT,
  THEME_META,
  resolveTheme,
  themeColorFor,
  type BoardTheme,
} from "@/lib/theme";
import { SEASONS } from "@/lib/seasons";

const BOARDS = Object.keys(THEME_META) as BoardTheme[];

describe("parseTheme", () => {
  it("accepts every known theme", () => {
    for (const theme of THEMES) expect(parseTheme(theme)).toBe(theme);
  });

  it("falls back to the default for junk, empty and missing values", () => {
    expect(parseTheme("mahogany")).toBe(DEFAULT_THEME);
    expect(parseTheme("")).toBe(DEFAULT_THEME);
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
  });
});

describe("parseMode", () => {
  it("accepts light, dark and system", () => {
    expect(parseMode("light")).toBe("light");
    expect(parseMode("dark")).toBe("dark");
    expect(parseMode("system")).toBe("system");
  });

  it("falls back to the default for anything else", () => {
    expect(parseMode("DARK")).toBe(DEFAULT_MODE);
    expect(parseMode(undefined)).toBe(DEFAULT_MODE);
  });
});

describe("resolveMode", () => {
  it("honours an explicit choice regardless of the OS preference", () => {
    expect(resolveMode("oak", "light", true)).toBe("light");
    expect(resolveMode("oak", "dark", false)).toBe("dark");
  });

  it("follows the OS preference when set to system", () => {
    expect(resolveMode("oak", "system", true)).toBe("dark");
    expect(resolveMode("oak", "system", false)).toBe("light");
  });

  it("keeps neon at night even when light is explicitly chosen", () => {
    expect(resolveMode("neon", "light", false)).toBe("dark");
    expect(resolveMode("neon", "system", false)).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("follows the calendar when seasonal", () => {
    expect(resolveTheme("seasonal", "2026-12-24")).toBe("christmas");
    expect(resolveTheme("seasonal", "2026-10-31")).toBe("halloween");
    expect(resolveTheme("seasonal", "2027-01-01")).toBe("newyear");
  });

  it("leaves a pinned board alone, seasonal or not", () => {
    expect(resolveTheme("walnut", "2026-12-24")).toBe("walnut");
    expect(resolveTheme("midsommar", "2026-12-24")).toBe("midsommar");
  });

  it("is the default for a device that never chose", () => {
    expect(DEFAULT_THEME).toBe("seasonal");
  });
});

describe("THEME_META", () => {
  it("has a board for every theme except the seasonal pick itself", () => {
    expect([...BOARDS, "seasonal"].sort()).toEqual([...THEMES].sort());
  });

  it("gives every season its greeting, ambient layer and confetti", () => {
    for (const season of SEASONS) {
      const extras = THEME_META[season].season;
      expect(extras, season).toBeDefined();
      expect(extras!.greeting).toBeTruthy();
      expect(extras!.confetti.colors.length).toBeGreaterThan(0);
    }
  });

  it("describes every theme", () => {
    for (const theme of BOARDS) {
      const meta = THEME_META[theme];
      expect(meta.name).toBeTruthy();
      expect(meta.swatch.felt).toMatch(/^#[0-9a-f]{6}$/);
      expect(meta.swatch.wood).toMatch(/^#[0-9a-f]{6}$/);
      expect(meta.swatch.brass).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("gives every theme a browser chrome colour for both modes", () => {
    for (const theme of BOARDS) {
      expect(themeColorFor(theme, "light")).toMatch(/^#[0-9a-f]{6}$/);
      expect(themeColorFor(theme, "dark")).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("marks the night-only boards, and pins them in the pre-paint script", () => {
    const forced = BOARDS.filter((t) => THEME_META[t].forcesDark);
    expect(forced.sort()).toEqual(["halloween", "neon", "newyear"]);
    for (const t of forced) expect(THEME_INIT_SCRIPT).toContain(`"${t}"`);
  });
});

describe("serializeThemeCookie", () => {
  it("is readable by the browser and lasts a year", () => {
    const cookie = serializeThemeCookie("stb_theme", "walnut");
    expect(cookie).toContain("stb_theme=walnut");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).not.toContain("HttpOnly");
  });
});
