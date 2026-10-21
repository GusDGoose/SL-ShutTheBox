"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { THEME_META, isSeason, type BoardTheme } from "@/lib/theme";
import { useBoardTheme } from "@/components/shell/season-ambient";

/** The brand mark follows the board: 🎲 normally, 🎄 at Christmas, 🎃 at Halloween. */
export function BrandEmoji({ initial }: { initial: BoardTheme }) {
  const theme = useBoardTheme(initial);
  const emoji = theme && theme in THEME_META ? THEME_META[theme as BoardTheme].emoji : "🎲";
  return (
    <span aria-hidden className="text-xl">
      {emoji}
    </span>
  );
}

const DISMISSED_KEY = "stb.greeting-dismissed";

/** Which season's greeting this device closed. One per season, not forever. */
const dismissedStore = (() => {
  const listeners = new Set<() => void>();
  let cached: string | null | undefined;
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): string | null {
      if (cached === undefined) {
        try {
          cached = window.localStorage.getItem(DISMISSED_KEY);
        } catch {
          cached = null;
        }
      }
      return cached;
    },
    getServerSnapshot(): string | null {
      return null;
    },
    set(season: string) {
      cached = season;
      try {
        window.localStorage.setItem(DISMISSED_KEY, season);
      } catch {
        // Closed for this visit only.
      }
      listeners.forEach((listener) => listener());
    },
  };
})();

/**
 * A one-line greeting under the header while a season is on — "God jul!",
 * "Glad midsommar!". Closing it hides it until the next season comes round.
 */
export function SeasonGreeting({ initial }: { initial: BoardTheme }) {
  const theme = useBoardTheme(initial);
  const dismissed = useSyncExternalStore(
    dismissedStore.subscribe,
    dismissedStore.getSnapshot,
    dismissedStore.getServerSnapshot,
  );
  if (!isSeason(theme) || dismissed === theme) return null;
  const meta = THEME_META[theme];
  if (!meta.season) return null;

  return (
    <div className="season-greeting flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 text-sm md:px-6">
      <span aria-hidden className="season-greeting-emoji text-lg">
        {meta.emoji}
      </span>
      <p className="min-w-0 flex-1 font-semibold">{meta.season.greeting}</p>
      <button
        type="button"
        onClick={() => dismissedStore.set(theme)}
        className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
        aria-label="Hide the seasonal greeting"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}
