"use client";

import type { Player } from "@/lib/types";

// Tap to pick players; pick order = turn order (numbered badges show it).
export function PlayerPicker({
  players,
  selected,
  onToggle,
}: {
  players: Player[];
  selected: string[]; // player ids in pick order
  onToggle: (playerId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => {
        const idx = selected.indexOf(p.id);
        const picked = idx >= 0;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            aria-pressed={picked}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
              picked
                ? "border-brass bg-brass text-ink"
                : "border-line hover:border-brass/50"
            }`}
          >
            {picked && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-bold text-foreground">
                {idx + 1}
              </span>
            )}
            <span>{p.emoji}</span>
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
