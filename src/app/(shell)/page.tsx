import Link from "next/link";
import type { GameResultRow, Player } from "@/lib/types";
import { dayLabel, stockholmToday } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = supabaseAdmin();
  const today = stockholmToday();

  const { data: games, error: gErr } = await sb
    .from("games")
    .select("id")
    .eq("played_on", today)
    .order("created_at");
  if (gErr) throw new Error(gErr.message);
  const gameIds = (games ?? []).map((g) => g.id as string);

  let rows: GameResultRow[] = [];
  let byId = new Map<string, Player>();
  if (gameIds.length > 0) {
    const { data, error } = await sb
      .from("game_results")
      .select("*")
      .in("game_id", gameIds)
      .order("score", { ascending: true });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as GameResultRow[];
    const { data: playerRows } = await sb
      .from("players")
      .select("*")
      .in("id", rows.map((r) => r.player_id));
    byId = new Map(((playerRows ?? []) as Player[]).map((p) => [p.id, p]));
  }

  if (gameIds.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center gap-6 p-10 text-center">
        <div className="text-7xl">🎲</div>
        <h1 className="text-3xl font-bold">Shut the Box</h1>
        <p className="max-w-md opacity-70">{dayLabel(today)}</p>
        <p className="max-w-md opacity-70">
          No game yet today. Gather the colleagues — lowest score wins the day.
        </p>
        <Link
          href="/play"
          className="rounded-2xl bg-foreground px-8 py-4 text-lg font-semibold text-background transition-transform active:scale-95"
        >
          Start today&apos;s game
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{dayLabel(today)}</h1>
      {gameIds.map((gameId, gi) => {
        const gameRows = rows.filter((r) => r.game_id === gameId);
        return (
          <Link
            key={gameId}
            href={`/game/${gameId}`}
            className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
              {gameIds.length > 1 ? `Game ${gi + 1}` : "Today's game"}
            </h2>
            {gameRows.map((r) => {
              const p = byId.get(r.player_id);
              return (
                <div key={r.player_id} className="flex justify-between">
                  <span>
                    {p?.emoji} <span className="font-medium">{p?.name}</span>
                    {r.is_shut_box && " 📦"}
                  </span>
                  <span className="font-bold">
                    {r.score}
                    {r.is_winner && " 👑"}
                  </span>
                </div>
              );
            })}
          </Link>
        );
      })}
      <Link href="/play" className="text-sm opacity-70 hover:opacity-100">
        + Start another game
      </Link>
    </main>
  );
}
