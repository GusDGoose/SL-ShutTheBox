"use client";

import { useTransition, useState } from "react";
import type { Player } from "@/lib/types";
import { chooseIdentity } from "./actions";

/**
 * Big tap targets, because this is used once per device standing at a desk with
 * a phone in one hand.
 */
export function WhoAmI({
  players,
  next,
}: {
  players: Player[];
  next: string;
}) {
  const [pending, startTransition] = useTransition();
  const [claiming, setClaiming] = useState<string | null>(null);

  return (
    <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
      {players.map((player) => (
        <li key={player.id}>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setClaiming(player.id);
              startTransition(() => chooseIdentity(player.id, next));
            }}
            className={`flex min-h-[7rem] w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border bg-surface p-4 transition-colors disabled:opacity-60 ${
              claiming === player.id
                ? "border-brass bg-surface-2"
                : "border-line hover:border-brass/60"
            }`}
          >
            <span aria-hidden className="text-4xl">
              {player.emoji}
            </span>
            <span className="font-semibold">{player.name}</span>
            {claiming === player.id && pending && (
              <span className="text-xs text-ink-muted">One moment…</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
