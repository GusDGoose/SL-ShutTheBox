import type { GameResultRow, Player, PlayerStreakRow } from "@/lib/types";
import { stockholmDayLabel } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { extractVideoId } from "@/lib/youtube";
import { Celebration, type CelebrationWinner } from "@/components/celebration";

export const dynamic = "force-dynamic";

// Result + celebration page. Server-rendered from the DB, so it survives
// refresh and can be reopened any time (the confetti happily fires again).
export default async function GamePage({ params }: PageProps<"/game/[id]">) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: results, error } = await sb
    .from("game_results")
    .select("*")
    .eq("game_id", id)
    .order("score", { ascending: true });
  if (error) throw new Error(error.message);
  if (!results || results.length === 0) {
    return <main className="p-10 text-center opacity-60">Game not found.</main>;
  }
  const rows = results as GameResultRow[];
  const winnerIds = rows.filter((r) => r.is_winner).map((r) => r.player_id);

  const [playersRes, streaksRes] = await Promise.all([
    sb.from("players").select("*").in("id", rows.map((r) => r.player_id)),
    sb.from("player_streaks").select("*").in("player_id", winnerIds),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (streaksRes.error) throw new Error(streaksRes.error.message);

  const byId = new Map((playersRes.data as Player[]).map((p) => [p.id, p]));
  const streakById = new Map(
    (streaksRes.data as PlayerStreakRow[]).map((s) => [s.player_id, s]),
  );

  const winners: CelebrationWinner[] = winnerIds.map((pid) => {
    const p = byId.get(pid);
    return {
      name: p?.name ?? "?",
      emoji: p?.emoji ?? "🎲",
      streak: streakById.get(pid)?.current_streak ?? 0,
      videoId: p?.song_url ? extractVideoId(p.song_url) : null,
      songUrl: p?.song_url ?? null,
    };
  });
  const shutBox = rows.some((r) => r.is_shut_box);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold capitalize">
        {stockholmDayLabel(rows[0].played_on)}
      </h1>

      <Celebration winners={winners} shutBox={shutBox} />

      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const p = byId.get(r.player_id);
          return (
            <li
              key={r.player_id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                r.is_winner
                  ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                  : "border-black/10 dark:border-white/10"
              }`}
            >
              <span>
                <span className="mr-2">{p?.emoji}</span>
                <span className="font-medium">{p?.name}</span>
                {r.is_shut_box && <span className="ml-2">📦</span>}
              </span>
              <span className="text-xl font-bold">
                {r.score}
                {r.is_winner && " 👑"}
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
