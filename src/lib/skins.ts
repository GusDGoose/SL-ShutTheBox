import { isoMonday, stockholmToday } from "@/lib/dates";

/**
 * The app's two styles, which take turns week by week.
 *
 * [concept: skin × season] A skin is the shape of everything — fonts,
 * outlines, shadows, how a tile or a button is drawn. The board theme (and so
 * the season) is the colour, the weather drifting across the screen, the
 * confetti and the sounds. Skin CSS only ever reads the theme's colour tokens,
 * so every skin wears every season without a line of CSS per pair.
 */
export const SKINS = ["cartoon", "retro"] as const;
export type Skin = (typeof SKINS)[number];

/** The cookie also allows "auto": follow the weekly rotation. */
export const SKIN_PICKS = ["auto", ...SKINS] as const;
export type SkinPick = (typeof SKIN_PICKS)[number];

export const SKIN_COOKIE = "stb_skin";
export const DEFAULT_SKIN_PICK: SkinPick = "auto";

export const SKIN_META: Record<Skin, { name: string; blurb: string; emoji: string }> = {
  cartoon: {
    name: "Cartoon",
    blurb: "Fat outlines, bright paint, bouncy buttons.",
    emoji: "🖍️",
  },
  retro: {
    name: "90s",
    blurb: "Bevelled windows, pixel type, CRT glow.",
    emoji: "👾",
  },
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whole weeks since the Monday of 5 January 1970 — a stable week counter. */
function weekIndex(date: string): number {
  const monday = Date.parse(`${isoMonday(date)}T00:00:00Z`);
  return Math.round((monday - Date.parse("1970-01-05T00:00:00Z")) / WEEK_MS);
}

/** The skin for a Stockholm day: the two take turns, Monday to Sunday. */
export function skinFor(date: string): Skin {
  return SKINS[weekIndex(date) % SKINS.length];
}

export function parseSkin(value: string | undefined | null): SkinPick {
  return SKIN_PICKS.includes(value as SkinPick) ? (value as SkinPick) : DEFAULT_SKIN_PICK;
}

export function resolveSkin(pick: SkinPick, today: string = stockholmToday()): Skin {
  return pick === "auto" ? skinFor(today) : pick;
}
