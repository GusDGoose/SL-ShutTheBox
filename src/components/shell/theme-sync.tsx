"use client";

import { useLayoutEffect } from "react";
import {
  parseMode,
  parseTheme,
  resolveMode,
  resolveTheme,
  type Mode,
  type Theme,
} from "@/lib/theme";

/** How often an open tab checks whether the season has turned. */
const SEASON_CHECK_MS = 10 * 60 * 1000;

/**
 * Keeps <html data-theme> and <html data-mode> honest after hydration.
 *
 * The inline head script has already resolved "system" before the first paint;
 * this covers the cases it cannot: React remounting the tree in dev Strict
 * Mode, the OS flipping light/dark while the tab is open, and a "seasonal"
 * board left open on the office screen across the night the season turns.
 *
 * Both picks are read back from <html data-theme-pick/data-mode-pick> rather than the props,
 * because the picker changes it without a server round trip and the root
 * layout does not re-render on navigation.
 */
export function ThemeSync({ theme, mode }: { theme: Theme; mode: Mode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const pick = parseTheme(root.dataset.themePick ?? theme);
      const board = resolveTheme(pick);
      if (root.dataset.theme !== board) root.dataset.theme = board;
      root.dataset.mode = resolveMode(
        board,
        parseMode(root.dataset.modePick ?? mode),
        query.matches,
      );
    };

    apply();
    const timer = window.setInterval(apply, SEASON_CHECK_MS);
    query.addEventListener("change", apply);
    return () => {
      window.clearInterval(timer);
      query.removeEventListener("change", apply);
    };
  }, [theme, mode]);

  return null;
}
