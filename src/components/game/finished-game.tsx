import Link from "next/link";
import { dayLabel } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { extractVideoId } from "@/lib/youtube";
import { buttonClass } from "@/components/ui/button";
import { MiniBoard } from "@/components/board/mini-board";
import {
  Celebration,
  type CelebrationWinner,
  type EarnedBadge,
} from "@/components/celebration";
import type { Clip } from "@/lib/audio/youtube-api";
import type {
  AchievementRow,
  GameResultRow,
  Player,
  PlayerStreakRow,
} from "@/lib/types";
import { tilesOf, type Ruleset } from "@/lib/rules";

/**
 * The slice of a player's song to play, or null if they have not set one that
 * can be parsed. The settings come from the clip columns added in 0006.
 */
export function clipFor(player: Player | undefined): Clip | null {
  if (!player?.song_url) return null;
  const videoId = extractVideoId(player.song_url);
  if (!videoId) return null;
  return {
    videoId,
    startSeconds: player.song_start_seconds ?? 0,
    endSeconds: player.song_end_seconds,
    fadeMs: player.song_fade_ms ?? 1500,
    loop: player.song_loop ?? false,
  };
}

/**
 * A game that has been played out.
 *
 * Read from game_results rather than from the live snapshot, so the winner is
 * decided by the same view the stats pages use. `celebrate` is only true
 * immediately after crowning — reopening a game from three weeks ago should not
 * set off confetti, which it did in v1.
 */
export async function FinishedGame({
  gameId,
  rules,
  celebrate,
}: {
  gameId: string;
  rules: Ruleset;
  celebrate: boolean;
}) {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("game_results")
    .select("*")
    .eq("game_id", gameId)
    .order("finish_position", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as GameResultRow[];
  if (rows.length === 0) {
    return (
      <p className="p-10 text-center text-ink-muted">
        This game has no results recorded.
      </p>
    );
  }

  const winnerIds = rows.filter((r) => r.is_winner).map((r) => r.player_id);
  const [playersRes, streaksRes] = await Promise.all([
    sb
      .from("players")
      .select("*")
      .in(
        "id",
        rows.map((r) => r.player_id),
      ),
    sb.from("player_streaks").select("*").in("player_id", winnerIds),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (streaksRes.error) throw new Error(streaksRes.error.message);

  const byId = new Map((playersRes.data as Player[]).map((p) => [p.id, p]));
  const streakById = new Map(
    (streaksRes.data as PlayerStreakRow[]).map((s) => [s.player_id, s]),
  );

  // Badges earned in THIS game, so the celebration can announce them. Read
  // back from the table rather than passed through the action, so reopening a
  // game shows the same list.
  const [earnedRes, catalogRes] = await Promise.all([
    sb
      .from("player_achievements")
      .select("player_id, achievement_key")
      .eq("game_id", gameId),
    sb.from("achievements").select("*"),
  ]);

  const catalog = new Map(
    ((catalogRes.data ?? []) as AchievementRow[]).map((a) => [a.key, a]),
  );
  const badges: EarnedBadge[] = (
    (earnedRes.data ?? []) as { player_id: string; achievement_key: string }[]
  ).flatMap((row) => {
    const meta = catalog.get(row.achievement_key);
    return meta
      ? [
          {
            player_id: row.player_id,
            key: row.achievement_key,
            name: meta.name,
            emoji: meta.emoji,
            description: meta.description,
          },
        ]
      : [];
  });

  const playerNames = Object.fromEntries(
    [...byId.values()].map((p) => [p.id, p.name]),
  );

  const winners: CelebrationWinner[] = winnerIds.map((id) => {
    const p = byId.get(id);
    return {
      playerId: id,
      name: p?.name ?? "?",
      emoji: p?.emoji ?? "🎲",
      streak: streakById.get(id)?.current_streak ?? 0,
      clip: clipFor(p),
      songUrl: p?.song_url ?? null,
    };
  });
  const shutBox = rows.some((r) => r.is_shut_box);
  const tiles = tilesOf(rules);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        {dayLabel(rows[0]!.played_on)}
      </h1>

      {celebrate ? (
        <Celebration
          winners={winners}
          shutBox={shutBox}
          badges={badges}
          playerNames={playerNames}
        />
      ) : (
        <p className="rounded-[var(--radius-card)] border border-brass bg-brass/10 px-4 py-3">
          🏆{" "}
          <span className="font-semibold">
            {winners.map((w) => `${w.emoji} ${w.name}`).join(" & ")}
          </span>{" "}
          {winners.length > 1 ? "shared" : "won"} the day with{" "}
          <span className="font-bold tabular-nums">{rows[0]!.score}</span>
          {shutBox && " — the box was shut 📦"}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const p = byId.get(r.player_id);
          return (
            <li
              key={r.player_id}
              className={`flex items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 ${
                r.is_winner ? "border-brass bg-brass/10" : "border-line"
              }`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>{p?.emoji}</span>
                <span className="font-medium">{p?.name}</span>
                <MiniBoard tiles={tiles} open={r.tiles_open} />
              </span>
              <span className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">
                {r.score === 0 ? "📦 0" : r.score}
                {r.is_winner && " 👑"}
              </span>
            </li>
          );
        })}
      </ul>

      {/* v1's result page had no way out of it at all. */}
      <div className="flex flex-wrap gap-2">
        <Link href="/play" className={buttonClass("primary")}>
          Play again 🎲
        </Link>
        <Link href="/" className={buttonClass("secondary")}>
          Today
        </Link>
        <Link href="/stats" className={buttonClass("ghost")}>
          Stats
        </Link>
      </div>
    </div>
  );
}
