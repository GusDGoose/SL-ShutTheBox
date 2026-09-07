"use client";

import type { Connection } from "@/lib/use-live-game";

const LABELS: Record<Connection, { text: string; colour: string }> = {
  live: { text: "Live", colour: "bg-shut" },
  polling: { text: "Catching up", colour: "bg-streak" },
  offline: { text: "Offline", colour: "bg-danger" },
};

/**
 * Whether what you are looking at is actually keeping up.
 *
 * Paired with text rather than colour alone — "the green one means it works"
 * is no use to anyone who cannot tell it from the amber one.
 */
export function ConnectionDot({ state }: { state: Connection }) {
  const { text, colour } = LABELS[state];
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-ink-muted"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${colour} ${
          state === "live" ? "" : "animate-pulse"
        }`}
      />
      {text}
    </span>
  );
}
