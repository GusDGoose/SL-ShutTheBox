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
  THEME_META,
  themeColorFor,
} from "@/lib/theme";

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

describe("THEME_META", () => {
  it("describes every theme", () => {
    for (const theme of THEMES) {
      const meta = THEME_META[theme];
      expect(meta.name).toBeTruthy();
      expect(meta.swatch.felt).toMatch(/^#[0-9a-f]{6}$/);
      expect(meta.swatch.wood).toMatch(/^#[0-9a-f]{6}$/);
      expect(meta.swatch.brass).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("gives every theme a browser chrome colour for both modes", () => {
    for (const theme of THEMES) {
      expect(themeColorFor(theme, "light")).toMatch(/^#[0-9a-f]{6}$/);
      expect(themeColorFor(theme, "dark")).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("marks exactly one theme as night-only", () => {
    const forced = THEMES.filter((t) => THEME_META[t].forcesDark);
    expect(forced).toEqual(["neon"]);
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
