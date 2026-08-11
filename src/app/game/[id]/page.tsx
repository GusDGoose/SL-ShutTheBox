import type { GameResultRow, Player } from "@/lib/types";
import { stockholmDayLabel } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Result page. Server-rendered from the DB, so it survives refresh and can be
// opened later. (Phase 5 adds the celebration + victory song here.)
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
    return (
      <main className="p-10 text-center opacity-60">Game not found.</main>
    );
  }
  const rows = results as GameResultRow[];

  const { data: playerRows, error: pErr } = await sb
    .from("players")
    .select("*")
    .in("id", rows.map((r) => r.player_id));
  if (pErr) throw new Error(pErr.message);
  const byId = new Map((playerRows as Player[]).map((p) => [p.id, p]));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold capitalize">
        {stockholmDayLabel(rows[0].played_on)}
      </h1>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const p = byId.get(r.player_id);
          return (
            <li
              key={r.player_id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                r.is_winner
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
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
