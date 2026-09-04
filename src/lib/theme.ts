// Board themes and light/dark mode. Both live in plain (non-httpOnly) cookies so
// the picker can set them without a server round trip, and the root layout can
// stamp them onto <html> before the first paint.

export const THEMES = ["oak", "walnut", "birch", "neon"] as const;
export type Theme = (typeof THEMES)[number];

export const MODES = ["light", "dark", "system"] as const;
export type Mode = (typeof MODES)[number];
export type ResolvedMode = "light" | "dark";

export const THEME_COOKIE = "stb_theme";
export const MODE_COOKIE = "stb_mode";
export const DEFAULT_THEME: Theme = "oak";
export const DEFAULT_MODE: Mode = "system";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeMeta = {
  name: string;
  blurb: string;
  /** Swatch shown in the picker — felt, wood and hardware. */
  swatch: { felt: string; wood: string; brass: string };
  /** Browser chrome colour, matching --wood-dark for each mode. */
  themeColor: Record<ResolvedMode, string>;
  /** Neon is a night-only theme; the mode toggle is disabled while it's on. */
  forcesDark?: boolean;
};

export const THEME_META: Record<Theme, ThemeMeta> = {
  oak: {
    name: "Oak & green felt",
    blurb: "The classic pub box.",
    swatch: { felt: "#2e6b4e", wood: "#d6a96a", brass: "#c9973a" },
    themeColor: { light: "#7a5024", dark: "#4e3116" },
  },
  walnut: {
    name: "Walnut & burgundy",
    blurb: "Darker wood, deeper felt.",
    swatch: { felt: "#6e2a34", wood: "#8a5a3a", brass: "#c9973a" },
    themeColor: { light: "#3e2412", dark: "#2e1a0c" },
  },
  birch: {
    name: "Birch & navy",
    blurb: "Pale wood, steel hardware.",
    swatch: { felt: "#223a5e", wood: "#eeddbf", brass: "#8f98a3" },
    themeColor: { light: "#a98d66", dark: "#7e6a4c" },
  },
  neon: {
    name: "Neon night",
    blurb: "For when the office gets weird.",
    swatch: { felt: "#0f1030", wood: "#2a2755", brass: "#ff3fa4" },
    themeColor: { light: "#121130", dark: "#121130" },
    forcesDark: true,
  },
};

export function parseTheme(value: string | undefined | null): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

export function parseMode(value: string | undefined | null): Mode {
  return MODES.includes(value as Mode) ? (value as Mode) : DEFAULT_MODE;
}

/**
 * What <html data-mode> should be. "system" can only be resolved where the OS
 * preference is known, so on the server it stays "system" and the inline script
 * in the document head rewrites it before the first paint.
 */
export function resolveMode(
  theme: Theme,
  mode: Mode,
  prefersDark: boolean,
): ResolvedMode {
  if (THEME_META[theme].forcesDark) return "dark";
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function themeColorFor(theme: Theme, mode: ResolvedMode): string {
  return THEME_META[theme].themeColor[mode];
}

/**
 * [concept: pre-paint theme resolution] Runs before the first paint, so a
 * "system" preference never flashes the light palette on a dark device. Also
 * pins neon to night. Deliberately tiny and dependency-free — it is inlined
 * into the document head as a string.
 *
 * Note: with JavaScript disabled and mode "system", the light palette wins.
 * That is an accepted trade for keeping the dark palette defined exactly once
 * in globals.css; the app needs JS to be usable at all (the board is a client
 * component), so there is no meaningful no-JS audience to protect.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var r=document.documentElement,t=r.dataset.theme,m=r.dataset.mode;
if(t==='neon'){r.dataset.mode='dark';return}
if(m==='system'){r.dataset.mode=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
}catch(e){}})()`;

export function serializeThemeCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
