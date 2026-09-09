import type { Player } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase";
import { EmptyState } from "@/components/ui/empty-state";
import { AddPlayerForm, PlayerRow } from "./player-form";

// [concept: dynamic rendering] Force per-request rendering so this page always
// shows live DB data and is never prerendered at build time (when the DB may
// not even be reachable).
export const dynamic = "force-dynamic";

export const metadata = { title: "Players · Shut the Box" };

/**
 * The roster: who plays, what they look like, and what plays when they win.
 *
 * Reachable before picking an identity on purpose — a new colleague adds
 * themselves here first, then picks their name.
 */
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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        Players
      </h1>
      <AddPlayerForm />

      {active.length === 0 ? (
        <EmptyState
          art="🪑"
          title="Nobody at the table yet."
          body="Add your colleagues above — name, an emoji, and the song that plays when they win."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </ul>
      )}

      {benched.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">Benched</h2>
          <p className="text-xs text-ink-muted">
            Off the picker and the fika rota, but their history stays.
          </p>
          <ul className="flex flex-col gap-3">
            {benched.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
