import { PlayerCard } from "@/components/players/player-card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth";
import { getPlayerCards } from "@/lib/queries/players";
import { songLabelFor } from "@/lib/queries/song-titles";
import { AddPlayerForm } from "./player-form";

// [concept: dynamic rendering] Force per-request rendering so this page always
// shows live DB data and is never prerendered at build time (when the DB may
// not even be reachable).
export const dynamic = "force-dynamic";

export const metadata = { title: "Players · Shut the Box" };

/**
 * Everyone at the table, at a glance: who they are, what plays when they win,
 * what they have earned and how they are doing. A card opens the profile.
 *
 * Read-only on purpose. It used to be a stack of everybody's edit forms, which
 * let anyone change anyone's song; what you set about yourself now lives on
 * your own profile.
 *
 * Reachable before picking an identity — a new colleague adds themselves here
 * first (the "who are you?" page links to ?add), then picks their name.
 */
export default async function PlayersPage({
  searchParams,
}: PageProps<"/players">) {
  const [{ active, benched }, me, params] = await Promise.all([
    getPlayerCards(),
    getIdentity(),
    searchParams,
  ]);
  const everyone = [...active, ...benched];
  const songs = new Map(
    await Promise.all(
      everyone.map(async (c) => [c.player.id, await songLabelFor(c.player)] as const),
    ),
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        Players
      </h1>

      {active.length === 0 ? (
        <EmptyState
          art="🪑"
          title="Nobody at the table yet."
          body="Add your colleagues below — a name and an emoji. Everyone sets their own song on their profile."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {active.map((card) => (
            <PlayerCard
              key={card.player.id}
              card={card}
              song={songs.get(card.player.id) ?? null}
              isMe={me?.id === card.player.id}
            />
          ))}
        </ul>
      )}

      <details
        className="flex flex-col gap-3"
        open={"add" in params || active.length === 0}
      >
        <summary className={`${buttonClass("secondary")} cursor-pointer list-none self-start`}>
          + Add a player
        </summary>
        <div className="mt-3">
          <AddPlayerForm />
        </div>
      </details>

      {benched.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="eyebrow cursor-pointer">
            Benched · {benched.length}
          </summary>
          <p className="mt-2 text-xs text-ink-muted">
            Off the picker and the fika rota, but their history stays.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {benched.map((card) => (
              <PlayerCard
                key={card.player.id}
                card={card}
                song={songs.get(card.player.id) ?? null}
                isMe={false}
              />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
