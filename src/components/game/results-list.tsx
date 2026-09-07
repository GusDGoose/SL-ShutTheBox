"use client";

import { MiniBoard } from "@/components/board/mini-board";
import { standings, skippedPlayers, type LiveSnapshot } from "@/lib/live";
import { tilesOf } from "@/lib/rules";

/**
 * The scores so far, best first. The crown comes from the snapshot's
 * leader_ids, which is the same rule game_results uses — v1 worked it out again
 * here and got a solo game wrong.
 */
export function ResultsList({
  snapshot,
  onCorrect,
  heading,
}: {
  snapshot: LiveSnapshot;
  onCorrect?: (playerId: string) => void;
  heading?: string;
}) {
  const rows = standings(snapshot);
  const skipped = skippedPlayers(snapshot);
  const leaders = new Set(snapshot.leader_ids);
  const tiles = tilesOf(snapshot.game.rules);
  if (rows.length === 0 && skipped.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      {heading && <h2 className="eyebrow">{heading}</h2>}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const crowned = leaders.has(row.player_id) && rows.length > 1;
          const inner = (
            <>
              <span className="flex items-center gap-2">
                <span aria-hidden>{row.emoji}</span>
                <span className="font-medium">{row.name}</span>
                <MiniBoard tiles={tiles} open={row.tiles_open} />
              </span>
              <span className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">
                {row.score === 0 ? "📦 0" : row.score}
                {crowned && " 👑"}
              </span>
            </>
          );

          return (
            <li key={row.player_id}>
              {onCorrect ? (
                <button
                  type="button"
                  onClick={() => onCorrect(row.player_id)}
                  className={`flex w-full items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 text-left transition-colors ${
                    crowned
                      ? "border-brass bg-brass/10"
                      : "border-line hover:border-brass/60"
                  }`}
                >
                  {inner}
                </button>
              ) : (
                <div
                  className={`flex items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 ${
                    crowned ? "border-brass bg-brass/10" : "border-line"
                  }`}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}

        {/* Present, but the box was shut before their turn. v1 wrote no row at
            all, so a colleague who turned up simply vanished. */}
        {skipped.map((row) => (
          <li
            key={row.player_id}
            className="flex items-center justify-between rounded-[var(--radius-control)] border border-dashed border-line px-4 py-3 text-ink-muted"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>{row.emoji}</span>
              <span>{row.name}</span>
            </span>
            <span className="text-xs">never got a turn</span>
          </li>
        ))}
      </ul>
      {onCorrect && rows.length > 0 && (
        <p className="text-xs text-ink-muted">Tap a row to correct it.</p>
      )}
    </section>
  );
}
