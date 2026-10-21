// Board themes and light/dark mode. Both live in plain (non-httpOnly) cookies so
// the picker can set them without a server round trip, and the root layout can
// stamp them onto <html> before the first paint.

import { stockholmToday } from "@/lib/dates";
import { SEASONS, seasonFor, type Season } from "@/lib/seasons";

export const CLASSIC_THEMES = ["oak", "walnut", "birch", "neon"] as const;
export type ClassicTheme = (typeof CLASSIC_THEMES)[number];

/** A theme that actually paints the board: a classic one or a season's. */
export type BoardTheme = ClassicTheme | Season;

/**
 * Everything the cookie may hold. "seasonal" is not a board of its own — it
 * follows the office calendar in src/lib/seasons.ts and is the default.
 */
export const THEMES = ["seasonal", ...CLASSIC_THEMES, ...SEASONS] as const;
export type Theme = (typeof THEMES)[number];

export const MODES = ["light", "dark", "system"] as const;
export type Mode = (typeof MODES)[number];
export type ResolvedMode = "light" | "dark";

export const THEME_COOKIE = "stb_theme";
export const MODE_COOKIE = "stb_mode";
export const DEFAULT_THEME: Theme = "seasonal";
export const DEFAULT_MODE: Mode = "system";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The moving layer drawn over a seasonal board (src/components/shell/season-ambient.tsx). */
export type Ambient =
  | "hearts"
  | "sugar"
  | "blossom"
  | "feathers"
  | "rain"
  | "embers"
  | "lilac"
  | "flags"
  | "meadow"
  | "bubbles"
  | "lanterns"
  | "apples"
  | "leaves"
  | "bats"
  | "glow"
  | "christmas"
  | "candles"
  | "fireworks"
  | "frost";

export type ThemeMeta = {
  name: string;
  blurb: string;
  /** Shown on the picker and as the brand mark while the theme is on. */
  emoji: string;
  /** Swatch shown in the picker — felt, wood and hardware. */
  swatch: { felt: string; wood: string; brass: string };
  /** Browser chrome colour, matching --wood-dark for each mode. */
  themeColor: Record<ResolvedMode, string>;
  /** Night-only themes; the mode toggle is disabled while one is on. */
  forcesDark?: boolean;
  /** Seasonal extras. Classic boards have none of these. */
  season?: {
    /** When it comes round, for the picker. */
    when: string;
    /** The banner under the header, e.g. "God jul!". */
    greeting: string;
    ambient: Ambient;
    /** Confetti colours and the emoji mixed into the burst. */
    confetti: { colors: string[]; emoji: string[] };
  };
};

export const THEME_META: Record<BoardTheme, ThemeMeta> = {
  oak: {
    name: "Oak & green felt",
    blurb: "The classic pub box.",
    emoji: "🎲",
    swatch: { felt: "#2e6b4e", wood: "#d6a96a", brass: "#c9973a" },
    themeColor: { light: "#7a5024", dark: "#4e3116" },
  },
  walnut: {
    name: "Walnut & burgundy",
    blurb: "Darker wood, deeper felt.",
    emoji: "🎲",
    swatch: { felt: "#6e2a34", wood: "#8a5a3a", brass: "#c9973a" },
    themeColor: { light: "#3e2412", dark: "#2e1a0c" },
  },
  birch: {
    name: "Birch & navy",
    blurb: "Pale wood, steel hardware.",
    emoji: "🎲",
    swatch: { felt: "#223a5e", wood: "#eeddbf", brass: "#8f98a3" },
    themeColor: { light: "#a98d66", dark: "#7e6a4c" },
  },
  neon: {
    name: "Neon night",
    blurb: "For when the office gets weird.",
    emoji: "🕹️",
    swatch: { felt: "#0f1030", wood: "#2a2755", brass: "#ff3fa4" },
    themeColor: { light: "#121130", dark: "#121130" },
    forcesDark: true,
  },

  // [concept: the seasonal palettes are generated] Felt, wood and hardware for
  // every season below were picked together with their dark-mode twins and
  // checked for contrast (ivory on the header chrome and on the felt, brass-ink
  // on the cards) before they went into globals.css. Change one there and
  // re-check it against e2e/a11y.spec.ts.
  newyear: {
    name: "New Year's Eve",
    blurb: "Midnight blue, champagne and fireworks.",
    emoji: "🎆",
    swatch: { felt: "#0c1638", wood: "#525a96", brass: "#f2c14e" },
    themeColor: { light: "#1a1e3e", dark: "#1a1e3e" },
    forcesDark: true,
    season: {
      when: "27 Dec – 6 Jan",
      greeting: "Gott nytt år! Make this year's first box a shut one.",
      ambient: "fireworks",
      confetti: {
        colors: ["#f2c14e", "#fff3c4", "#7dffcf", "#ff6bd6", "#ffffff"],
        emoji: ["🎆", "🥂", "✨"],
      },
    },
  },
  frost: {
    name: "Midwinter frost",
    blurb: "Icy felt and frosted birch.",
    emoji: "❄️",
    swatch: { felt: "#2a5d7a", wood: "#eef4f8", brass: "#a9b8c6" },
    themeColor: { light: "#8ea3b3", dark: "#5c6a74" },
    season: {
      when: "January",
      greeting: "Cold outside, warm dice inside.",
      ambient: "frost",
      confetti: {
        colors: ["#ffffff", "#cfe8f7", "#8ec5e8", "#a9b8c6"],
        emoji: ["❄️", "⛄"],
      },
    },
  },
  valentine: {
    name: "Alla hjärtans dag",
    blurb: "Rose felt and blush wood.",
    emoji: "💘",
    swatch: { felt: "#8a2244", wood: "#f6d3ca", brass: "#d4a24c" },
    themeColor: { light: "#a96d62", dark: "#6e4740" },
    season: {
      when: "1 – 14 Feb",
      greeting: "Love is a box shut together.",
      ambient: "hearts",
      confetti: {
        colors: ["#ff4d7d", "#ff8fab", "#ffd1dc", "#d4a24c", "#ffffff"],
        emoji: ["❤️", "💕", "💘"],
      },
    },
  },
  semla: {
    name: "Semla season",
    blurb: "Cream, almond and cardamom.",
    emoji: "🧁",
    swatch: { felt: "#6e4a2e", wood: "#fbf1de", brass: "#c49a5c" },
    themeColor: { light: "#ad8c5e", dark: "#705b3d" },
    season: {
      when: "15 Feb – end of Feb",
      greeting: "Semla o'clock. Winner picks the bakery.",
      ambient: "sugar",
      confetti: {
        colors: ["#fffaf0", "#f3e1c2", "#c49a5c", "#8a5a34"],
        emoji: ["🧁", "☕"],
      },
    },
  },
  spring: {
    name: "First spring",
    blurb: "Fresh green, pale ash and copper.",
    emoji: "🌱",
    swatch: { felt: "#3a7035", wood: "#f2e8d0", brass: "#c27a4a" },
    themeColor: { light: "#a08c66", dark: "#685b42" },
    season: {
      when: "March",
      greeting: "The light is back. So is the box.",
      ambient: "blossom",
      confetti: {
        colors: ["#8bd16f", "#f7d6e0", "#fff6a8", "#c27a4a", "#ffffff"],
        emoji: ["🌱", "🌸", "🐦"],
      },
    },
  },
  easter: {
    name: "Glad påsk",
    blurb: "Påskris purple and egg-yolk wood.",
    emoji: "🐣",
    swatch: { felt: "#5a3e8a", wood: "#fbe9a8", brass: "#e0a020" },
    themeColor: { light: "#b8952e", dark: "#78611e" },
    season: {
      when: "Holy week – Easter Monday",
      greeting: "Glad påsk! Every shut box earns an egg.",
      ambient: "feathers",
      confetti: {
        colors: ["#ffd84d", "#ff7eb6", "#7ad3ff", "#9b7bff", "#7ee08a"],
        emoji: ["🐣", "🥚", "🪶"],
      },
    },
  },
  tulip: {
    name: "April tulips",
    blurb: "Tulip pink on leaf green.",
    emoji: "🌷",
    swatch: { felt: "#2f6a3e", wood: "#f9cdd6", brass: "#f07a93" },
    themeColor: { light: "#b56276", dark: "#76404d" },
    season: {
      when: "April",
      greeting: "April showers, lucky rolls.",
      ambient: "rain",
      confetti: {
        colors: ["#ff6f91", "#ffc2d1", "#ffe066", "#4caf50", "#ffffff"],
        emoji: ["🌷", "☔"],
      },
    },
  },
  valborg: {
    name: "Valborg bonfire",
    blurb: "Dusk sky, charred wood, glowing embers.",
    emoji: "🔥",
    swatch: { felt: "#2b2a52", wood: "#c99a6c", brass: "#f07a2a" },
    themeColor: { light: "#5a3a22", dark: "#3b2616" },
    season: {
      when: "24 – 30 Apr",
      greeting: "Light the bonfire, sing in the spring.",
      ambient: "embers",
      confetti: {
        colors: ["#ff7a1a", "#ffb347", "#ffd27a", "#ff4d2e", "#2b2a52"],
        emoji: ["🔥", "✨"],
      },
    },
  },
  bloom: {
    name: "Lilac May",
    blurb: "Syren felt and light oak.",
    emoji: "🌸",
    swatch: { felt: "#5e4b8b", wood: "#eedcb8", brass: "#b98bd6" },
    themeColor: { light: "#a2845a", dark: "#69563b" },
    season: {
      when: "May",
      greeting: "Everything is in bloom, including your luck.",
      ambient: "lilac",
      confetti: {
        colors: ["#b98bd6", "#e3c8f5", "#ffffff", "#ffd6e8", "#8bd16f"],
        emoji: ["🌸", "🌼"],
      },
    },
  },
  nationalday: {
    name: "Nationaldagen",
    blurb: "Blue felt, yellow tiles.",
    emoji: "🇸🇪",
    swatch: { felt: "#005b99", wood: "#ffe066", brass: "#fecc02" },
    themeColor: { light: "#b38f00", dark: "#745d00" },
    season: {
      when: "6 June",
      greeting: "Hurra för Sverige! 🇸🇪",
      ambient: "flags",
      confetti: {
        colors: ["#005b99", "#fecc02", "#005b99", "#fecc02", "#ffffff"],
        emoji: ["🇸🇪", "💙", "💛"],
      },
    },
  },
  midsommar: {
    name: "Midsommar",
    blurb: "Meadow green, birch and a flower crown.",
    emoji: "🌼",
    swatch: { felt: "#3a6e2e", wood: "#f7f0dc", brass: "#e86fa0" },
    themeColor: { light: "#ab9b72", dark: "#6f654a" },
    season: {
      when: "Midsommar week",
      greeting: "Glad midsommar! Små grodorna would shut this box.",
      ambient: "meadow",
      confetti: {
        colors: ["#ffe14d", "#ff8fc7", "#ffffff", "#7ee08a", "#7ad3ff"],
        emoji: ["🌼", "🍓", "🦋", "🌸"],
      },
    },
  },
  summer: {
    name: "Archipelago summer",
    blurb: "Sea-blue felt, sun-bleached teak, brass fittings.",
    emoji: "⛴️",
    swatch: { felt: "#1c5f8c", wood: "#e2c497", brass: "#c9973a" },
    themeColor: { light: "#8f6a40", dark: "#5d452a" },
    season: {
      when: "June – July",
      greeting: "All aboard. Summer rules: shut it, then swim.",
      ambient: "bubbles",
      confetti: {
        colors: ["#1c8fd6", "#7ad3ff", "#ffffff", "#ffd84d", "#ff6f61"],
        emoji: ["⛴️", "☀️", "🌊"],
      },
    },
  },
  kraftskiva: {
    name: "Kräftskiva",
    blurb: "Crayfish red, paper lanterns, dill.",
    emoji: "🦞",
    swatch: { felt: "#1f2d5a", wood: "#ec7f5f", brass: "#e6b93a" },
    themeColor: { light: "#8f2e1c", dark: "#5d1e12" },
    season: {
      when: "August",
      greeting: "Bibs on, hats on. Skål!",
      ambient: "lanterns",
      confetti: {
        colors: ["#e6452c", "#ffb347", "#ffe066", "#6ab04c", "#4aa3df"],
        emoji: ["🦞", "🏮", "🌕"],
      },
    },
  },
  harvest: {
    name: "Lingonberry harvest",
    blurb: "Lingon red and mustard wood.",
    emoji: "🍎",
    swatch: { felt: "#7a1f2e", wood: "#e6bf6e", brass: "#d9893f" },
    themeColor: { light: "#96702c", dark: "#62491d" },
    season: {
      when: "September",
      greeting: "Harvest time. Reap what you roll.",
      ambient: "apples",
      confetti: {
        colors: ["#c0263a", "#e6bf6e", "#7a1f2e", "#ff8c42", "#6ab04c"],
        emoji: ["🍎", "🍄", "🍂"],
      },
    },
  },
  autumn: {
    name: "Autumn leaves",
    blurb: "Rust felt and amber oak.",
    emoji: "🍁",
    swatch: { felt: "#8a3e1c", wood: "#cf9a5c", brass: "#d98a2b" },
    themeColor: { light: "#7a4f22", dark: "#4f3316" },
    season: {
      when: "1 – 23 Oct",
      greeting: "Leaves are falling. So are tiles.",
      ambient: "leaves",
      confetti: {
        colors: ["#d9542b", "#f2a541", "#a8432a", "#ffd166", "#7a4f22"],
        emoji: ["🍁", "🍂"],
      },
    },
  },
  halloween: {
    name: "Halloween",
    blurb: "Pumpkin glow on a haunted night.",
    emoji: "🎃",
    swatch: { felt: "#2a1238", wood: "#6e4024", brass: "#ff7a1a" },
    themeColor: { light: "#24130a", dark: "#24130a" },
    forcesDark: true,
    season: {
      when: "24 Oct – 2 Nov",
      greeting: "Trick or treat? Shut the box or be haunted.",
      ambient: "bats",
      confetti: {
        colors: ["#ff7a1a", "#9cff57", "#a259ff", "#1a1320", "#ffd9a8"],
        emoji: ["🎃", "👻", "🦇", "🍬"],
      },
    },
  },
  candlelight: {
    name: "November mys",
    blurb: "Plum felt by candlelight.",
    emoji: "🕯️",
    swatch: { felt: "#4a2342", wood: "#d4a87a", brass: "#e3a83a" },
    themeColor: { light: "#7c5634", dark: "#513822" },
    season: {
      when: "3 – 21 Nov",
      greeting: "Dark at four. Light a candle and roll.",
      ambient: "glow",
      confetti: {
        colors: ["#ffcf6e", "#e3a83a", "#ffefc2", "#b06a9c", "#ffffff"],
        emoji: ["🕯️", "☕", "🧦"],
      },
    },
  },
  christmas: {
    name: "God jul",
    blurb: "Gingerbread tiles on red felt.",
    emoji: "🎄",
    swatch: { felt: "#8e1b1b", wood: "#c98a4e", brass: "#d4a72c" },
    themeColor: { light: "#6a3a14", dark: "#45260d" },
    season: {
      when: "22 Nov – 26 Dec",
      greeting: "God jul! Tomten is watching your rolls.",
      ambient: "christmas",
      confetti: {
        colors: ["#d62828", "#2a9d48", "#f4d35e", "#ffffff", "#c98a4e"],
        emoji: ["🎄", "🎁", "⭐", "❄️"],
      },
    },
  },
  lucia: {
    name: "Luciadagen",
    blurb: "Saffron, candles and night blue.",
    emoji: "🕯️",
    swatch: { felt: "#1b2a4a", wood: "#f8ecc4", brass: "#e8b23a" },
    themeColor: { light: "#b39a52", dark: "#746435" },
    season: {
      when: "13 Dec",
      greeting: "Sankta Lucia! Lussekatter for the winner.",
      ambient: "candles",
      confetti: {
        colors: ["#ffffff", "#ffe08a", "#e8b23a", "#d62828", "#2a9d48"],
        emoji: ["🕯️", "⭐", "👑"],
      },
    },
  },
};

export const NIGHT_ONLY_THEMES = (Object.keys(THEME_META) as BoardTheme[]).filter(
  (t) => THEME_META[t].forcesDark,
);

export function parseTheme(value: string | undefined | null): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

export function parseMode(value: string | undefined | null): Mode {
  return MODES.includes(value as Mode) ? (value as Mode) : DEFAULT_MODE;
}

/** The board a pick paints today: "seasonal" follows the office calendar. */
export function resolveTheme(
  theme: Theme,
  today: string = stockholmToday(),
): BoardTheme {
  return theme === "seasonal" ? seasonFor(today) : theme;
}

export function isSeason(theme: string | undefined | null): theme is Season {
  return SEASONS.includes(theme as Season);
}

/**
 * What <html data-mode> should be. "system" can only be resolved where the OS
 * preference is known, so on the server it stays "system" and the inline script
 * in the document head rewrites it before the first paint.
 */
export function resolveMode(
  theme: BoardTheme,
  mode: Mode,
  prefersDark: boolean,
): ResolvedMode {
  if (THEME_META[theme].forcesDark) return "dark";
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function themeColorFor(theme: BoardTheme, mode: ResolvedMode): string {
  return THEME_META[theme].themeColor[mode];
}

/**
 * [concept: pre-paint theme resolution] Runs before the first paint, so a
 * "system" preference never flashes the light palette on a dark device. Also
 * pins the night-only boards to night. Deliberately tiny and dependency-free —
 * it is inlined into the document head as a string. The server has already
 * stamped the resolved board (a season, never "seasonal") on data-theme.
 *
 * Note: with JavaScript disabled and mode "system", the light palette wins.
 * That is an accepted trade for keeping the dark palette defined exactly once
 * in globals.css; the app needs JS to be usable at all (the board is a client
 * component), so there is no meaningful no-JS audience to protect.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var r=document.documentElement,t=r.dataset.theme,m=r.dataset.mode;
if(${JSON.stringify(NIGHT_ONLY_THEMES)}.indexOf(t)>=0){r.dataset.mode='dark';return}
if(m==='system'){r.dataset.mode=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
}catch(e){}})()`;

export function serializeThemeCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
