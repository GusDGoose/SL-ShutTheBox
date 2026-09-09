import Link from "next/link";
import { MiniBoard } from "@/components/board/mini-board";
import type { HistoryGame } from "@/lib/queries/history";
import type { Player } from "@/lib/types";

/**
 * One finished game, as a card that is a link in its entirety.
 *
 * Rows are already in finishing order from the view; winners carry the crown
 * and a shut box says so. If the day has a photo it sits on the right like a
 * print tucked into the corner.
 */
export function GameCard({
  game,
  players,
  label,
}: {
  game: HistoryGame;
  players: Map<string, Player>;
  label?: string;
}) {
  return (
    <Link
      href={`/game/${game.id}`}
      className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brass/60"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {label && <h3 className="eyebrow">{label}</h3>}
        {game.rows.map((r) => {
          const p = players.get(r.player_id);
          return (
            <div
              key={r.player_id}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden>{p?.emoji}</span>
                <span className="truncate font-medium">{p?.name ?? "?"}</span>
                <MiniBoard tiles={game.tiles} open={r.tiles_open} />
              </span>
              <span className="shrink-0 font-[family-name:var(--font-display)] font-bold tabular-nums">
                {r.is_shut_box ? "📦 0" : r.score}
                {r.is_winner && " 👑"}
              </span>
            </div>
          );
        })}
      </div>

      {game.photo_path && (
        // Plain <img>: the route answers with a short-lived signed URL, which
        // the image optimizer could neither cache nor be allowed to follow.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photo/${game.id}`}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rotate-2 rounded-[var(--radius-control)] object-cover shadow-[var(--shadow-card)]"
        />
      )}
    </Link>
  );
}
