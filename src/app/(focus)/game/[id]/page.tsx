import Link from "next/link";
import { notFound } from "next/navigation";
import { getIdentity } from "@/lib/auth";
import { parseSnapshot } from "@/lib/live";
import { supabaseAdmin } from "@/lib/supabase";
import { buttonClass } from "@/components/ui/button";
import { FinishedGame } from "@/components/game/finished-game";
import { GameController } from "@/components/game/game-controller";
import { WatchGame } from "@/components/game/watch-game";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One route for a game whether it is being played or already crowned, so a
 * spectator's URL does not change under them at the moment it finishes.
 */
export default async function GamePage({
  params,
  searchParams,
}: PageProps<"/game/[id]">) {
  const { id } = await params;
  const { crown } = await searchParams;

  // v1 passed the raw id straight to Postgres, so a link with a typo in it
  // raised 22P02 and the user got a 500 instead of "not found".
  if (!UUID.test(id)) notFound();

  const { data, error } = await supabaseAdmin().rpc("live_game_snapshot", {
    p_game_id: id,
  });
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const snapshot = parseSnapshot(data);
  // WP-B8 replaces this with a "deleted" banner and a Restore button.
  if (snapshot.game.deleted) notFound();

  const me = await getIdentity();
  const shell = "mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6";

  if (snapshot.game.status === "finished") {
    return (
      <main className={shell}>
        <FinishedGame
          gameId={snapshot.game.id}
          rules={snapshot.game.rules}
          celebrate={crown === "1"}
        />
      </main>
    );
  }

  if (snapshot.game.status === "abandoned") {
    return (
      <main className={`${shell} items-center text-center`}>
        <span aria-hidden className="text-5xl">
          🫥
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          This game was abandoned.
        </h1>
        <p className="text-sm text-ink-muted">
          It does not count towards anyone&apos;s stats.
        </p>
        <div className="flex gap-2">
          <Link href="/play" className={buttonClass("primary")}>
            Start a new one 🎲
          </Link>
          <Link href="/" className={buttonClass("secondary")}>
            Today
          </Link>
        </div>
      </main>
    );
  }

  // Split rather than a ternary so the compiler can see that `me` is real
  // inside the scorekeeper branch, instead of needing a non-null assertion.
  if (me && snapshot.game.scorekeeper_player_id === me.id) {
    return (
      <main className={shell}>
        <GameController initial={snapshot} meId={me.id} />
      </main>
    );
  }

  return (
    <main className={shell}>
      <WatchGame
        initial={snapshot}
        scorekeeperName={
          snapshot.players.find(
            (p) => p.player_id === snapshot.game.scorekeeper_player_id,
          )?.name ?? null
        }
      />
    </main>
  );
}
