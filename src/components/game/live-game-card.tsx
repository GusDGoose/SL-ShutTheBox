"use client";

import Link from "next/link";
import { MiniBoard } from "@/components/board/mini-board";
import { ConnectionDot } from "@/components/game/connection-dot";
import { buttonClass } from "@/components/ui/button";
import { currentPlayer, isStale, standings, type LiveSnapshot } from "@/lib/live";
import { tilesOf } from "@/lib/rules";
import { useLiveGame } from "@/lib/use-live-game";

/**
 * Today's card for a game being played right now — whose turn it is and how
 * the board looks, updating as the scorekeeper taps.
 */
export function LiveGameCard({
  initial,
  amScorekeeper,
}: {
  initial: LiveSnapshot;
  amScorekeeper: boolean;
}) {
  const { snapshot, connection } = useLiveGame(initial.game.id, initial);
  const player = currentPlayer(snapshot);
  const done = standings(snapshot);
  const tiles = tilesOf(snapshot.game.rules);
  const stale = isStale(snapshot);

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brass bg-brass/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">
          {stale ? "Game left open" : "Game in progress"}
        </h2>
        <ConnectionDot state={connection} />
      </div>

      <p className="text-lg">
        <span aria-hidden className="mr-2 text-2xl">
          {player?.emoji}
        </span>
        <span className="font-bold">{player?.name}</span>
        <span className="text-ink-muted"> is up</span>
      </p>

      {snapshot.turn && (
        <div className="flex items-center gap-3">
          <MiniBoard
            tiles={tiles}
            open={snapshot.turn.tiles_open}
            className="h-5"
          />
          <span className="text-sm text-ink-muted tabular-nums">
            {snapshot.turn.score_if_stop}
          </span>
        </div>
      )}

      {done.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
          {done.map((row) => (
            <li key={row.player_id}>
              {row.emoji} {row.name}{" "}
              <span className="font-semibold text-ink tabular-nums">
                {row.score}
              </span>
            </li>
          ))}
        </ul>
      )}

      {stale && (
        <p className="text-xs text-ink-muted">
          Started a while ago — the phone keeping score may have gone home.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/game/${snapshot.game.id}`}
          className={buttonClass("primary")}
        >
          {amScorekeeper ? "Resume keeping score" : "Watch live"}
        </Link>
      </div>
    </section>
  );
}
