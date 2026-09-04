import type { Player } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";
import { AddPlayerForm, PlayerRow } from "./player-form";

// [concept: dynamic rendering] Force per-request rendering so this page always
// shows live DB data and is never prerendered at build time (when the DB may
// not even be reachable).
export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Loading players failed: ${error.message}`);

  const players = (data ?? []) as Player[];
  const active = players.filter((p) => p.is_active);
  const benched = players.filter((p) => !p.is_active);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Players</h1>
      <AddPlayerForm />

      <section className="flex flex-col gap-2">
        {active.length === 0 && (
          <p className="text-sm opacity-60">
            No players yet — add your colleagues above.
          </p>
        )}
        {active.map((p) => (
          <PlayerRow key={p.id} player={p} />
        ))}
      </section>

      {benched.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Benched
          </h2>
          {benched.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </section>
      )}
    </main>
  );
}
