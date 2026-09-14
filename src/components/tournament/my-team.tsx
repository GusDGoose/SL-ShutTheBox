"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which team this phone is keeping score for.
 *
 * [concept: a reminder, not a lock] Nothing stops a second phone opening a
 * team's board — that is deliberate, and it is the recovery path when the phone
 * driving a team goes flat in the middle of a round. This only lets the lobby
 * say "back to YOUR board" on the device that set the team up, instead of four
 * identical buttons.
 *
 * Per-browser and per-event, and every access is wrapped: a private window, or
 * a phone with site data blocked, THROWS on localStorage rather than returning
 * null.
 */
function key(code: string): string {
  return `stb.tournament.${code}.team`;
}

export function rememberMyTeam(code: string, teamId: string): void {
  try {
    window.localStorage.setItem(key(code), teamId);
  } catch {
    // No storage: the lobby simply shows the neutral label.
  }
}

export function forgetMyTeam(code: string): void {
  try {
    window.localStorage.removeItem(key(code));
  } catch {
    // Nothing to clean up.
  }
}

/** Other tabs only; a write in THIS tab fires no storage event. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Read through useSyncExternalStore rather than in an effect.
 *
 * The server has no localStorage, so the server snapshot is null and the first
 * client paint agrees with the HTML that arrived — no hydration mismatch, and
 * no render-then-correct flicker on the label.
 */
export function useMyTeam(code: string): string | null {
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(key(code));
    } catch {
      return null;
    }
  }, [code]);

  // Returns a string or null, so React's identity check is a value comparison
  // and this cannot loop.
  return useSyncExternalStore(subscribe, read, () => null);
}
