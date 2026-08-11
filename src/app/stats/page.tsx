import type {
  GameResultRow,
  MonthlyChampionRow,
  Player,
  PlayerStatsRow,
  PlayerStreakRow,
} from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";
import { StatsTable } from "@/components/stats-table";

export const dynamic = "force-dynamic";

// Every number on this page comes from the SQL views in
// supabase/migrations/0002_views.sql — audit it with plain SQL any time.
export default async function StatsPage() {
  const sb = supabaseAdmin();
  const [statsRes, streaksRes, champsRes, historyRes, playersRes] =
    await Promise.all([
      sb.from("player_stats").select("*").gt("games_played", 0),
      sb.from("player_streaks").select("*"),
      sb.from("monthly_champions").select("*").order("month", { ascending: false }),
      sb
        .from("game_results")
        .select("*")
        .order("played_on", { ascending: false })
        .limit(200),
      sb.from("players").select("*"),
    ]);
  for (const res of [statsRes, streaksRes, champsRes, historyRes, playersRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const stats = (statsRes.data ?? []) as PlayerStatsRow[];
  const streaks = new Map(
    ((streaksRes.data ?? []) as PlayerStreakRow[]).map((s) => [s.player_id, s]),
  );
  const champs = (champsRes.data ?? []) as MonthlyChampionRow[];
  const history = (historyRes.data ?? []) as GameResultRow[];
  const players = new Map(
    ((playersRes.data ?? []) as Player[]).map((p) => [p.id, p]),
  );

  // Leaderboard order: most wins, then lowest average.
  const leaderboard = [...stats].sort(
    (a, b) => b.wins - a.wins || (a.avg_score ?? 99) - (b.avg_score ?? 99),
  );

  // Hall of fame — three superlatives, all derivable from what we fetched.
  const bestGameEver = [...history].sort((a, b) => a.score - b.score)[0];
  const mostShutBoxes = [...stats].sort((a, b) => b.shut_boxes - a.shut_boxes)[0];
  const longestStreak = [...streaks.values()].sort(
    (a, b) => b.best_streak - a.best_streak,
  )[0];

  // History grouped per game, newest first (history is already date-desc).
  const gameOrder: string[] = [];
  const byGame = new Map<string, GameResultRow[]>();
  for (const r of history) {
    if (!byGame.has(r.game_id)) {
      byGame.set(r.game_id, []);
      gameOrder.push(r.game_id);
    }
    byGame.get(r.game_id)!.push(r);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">Stats</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm opacity-60">No games played yet.</p>
        ) : (
          <StatsTable
            headers={["Player", "Games", "Wins", "Win %", "Avg", "Best", "📦", "🔥 Now", "🔥 Best"]}
          >
            {leaderboard.map((s) => {
              const st = streaks.get(s.player_id);
              return (
                <tr
                  key={s.player_id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="px-3 py-2 font-medium">
                    {s.emoji} {s.name}
                  </td>
                  <td className="px-3 py-2">{s.games_played}</td>
                  <td className="px-3 py-2 font-semibold">{s.wins}</td>
                  <td className="px-3 py-2">{s.win_pct ?? 0}%</td>
                  <td className="px-3 py-2">{s.avg_score}</td>
                  <td className="px-3 py-2">{s.best_score}</td>
                  <td className="px-3 py-2">{s.shut_boxes}</td>
                  <td className="px-3 py-2">{st?.current_streak ?? 0}</td>
                  <td className="px-3 py-2">{st?.best_streak ?? 0}</td>
                </tr>
              );
            })}
          </StatsTable>
        )}
      </section>

      {bestGameEver && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Hall of fame
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs uppercase tracking-wide opacity-60">Lowest score ever</p>
              <p className="mt-1 text-2xl font-bold">{bestGameEver.score}</p>
              <p className="text-sm opacity-80">
                {players.get(bestGameEver.player_id)?.emoji}{" "}
                {players.get(bestGameEver.player_id)?.name} · {bestGameEver.played_on}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs uppercase tracking-wide opacity-60">Most shut boxes</p>
              <p className="mt-1 text-2xl font-bold">
                {mostShutBoxes?.shut_boxes ?? 0} 📦
              </p>
              <p className="text-sm opacity-80">
                {mostShutBoxes && mostShutBoxes.shut_boxes > 0
                  ? `${mostShutBoxes.emoji} ${mostShutBoxes.name}`
                  : "Nobody yet — the box awaits"}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs uppercase tracking-wide opacity-60">Longest streak</p>
              <p className="mt-1 text-2xl font-bold">
                {longestStreak?.best_streak ?? 0} 🔥
              </p>
              <p className="text-sm opacity-80">
                {longestStreak && longestStreak.best_streak > 0
                  ? longestStreak.name
                  : "No streaks yet"}
              </p>
            </div>
          </div>
        </section>
      )}

      {champs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Monthly champions
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {champs.map((c) => (
              <li
                key={`${c.month}-${c.player_id}`}
                className="flex justify-between rounded-lg border border-black/5 px-3 py-2 dark:border-white/5"
              >
                <span>
                  🏅 {c.emoji} <span className="font-medium">{c.name}</span>
                </span>
                <span className="opacity-70">
                  {c.month.slice(0, 7)} · {c.day_wins} day {c.day_wins === 1 ? "win" : "wins"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          History
        </h2>
        {gameOrder.length === 0 ? (
          <p className="text-sm opacity-60">Nothing yet — go play!</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gameOrder.map((gameId) => {
              const rows = [...byGame.get(gameId)!].sort((a, b) => a.score - b.score);
              return (
                <li
                  key={gameId}
                  className="rounded-xl border border-black/10 px-4 py-3 dark:border-white/10"
                >
                  <p className="mb-1 text-xs font-medium opacity-60">
                    {rows[0].played_on}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {rows.map((r) => (
                      <span key={r.player_id}>
                        {r.is_winner && "👑"}
                        {players.get(r.player_id)?.emoji}{" "}
                        {players.get(r.player_id)?.name}{" "}
                        <strong>{r.score}</strong>
                        {r.is_shut_box && " 📦"}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
