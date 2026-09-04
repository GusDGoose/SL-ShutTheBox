"use client";

import { useLayoutEffect } from "react";
import { parseMode, parseTheme, resolveMode, type Mode, type Theme } from "@/lib/theme";

/**
 * Keeps <html data-mode> honest after hydration.
 *
 * The inline head script has already resolved "system" before the first paint;
 * this covers the two cases it cannot: React remounting the tree in dev Strict
 * Mode, and the OS flipping light/dark while the tab is open.
 */
export function ThemeSync({ theme, mode }: { theme: Theme; mode: Mode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = (prefersDark: boolean) => {
      root.dataset.theme = parseTheme(theme);
      root.dataset.mode = resolveMode(
        parseTheme(theme),
        parseMode(mode),
        prefersDark,
      );
    };

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    apply(query.matches);

    if (mode !== "system") return;
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme, mode]);

  return null;
}
