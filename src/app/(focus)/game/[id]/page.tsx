import Link from "next/link";
import { notFound } from "next/navigation";
import { getIdentity } from "@/lib/auth";
import type { Player } from "@/lib/types";
import { parseSnapshot } from "@/lib/live";
import { supabaseAdmin } from "@/lib/supabase";
import { buttonClass } from "@/components/ui/button";
import { FinishedGame, clipFor } from "@/components/game/finished-game";
import { AuditTrail } from "@/components/game/audit-trail";
import { DeletedBanner } from "@/components/game/deleted-banner";
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

  const me = await getIdentity();
  const shell = "mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6";

  if (snapshot.game.status === "finished") {
    return (
      <main className={shell}>
        {snapshot.game.deleted && (
          <DeletedBanner
            gameId={snapshot.game.id}
            knowsWho={me !== null}
          />
        )}
        <FinishedGame
          gameId={snapshot.game.id}
          rules={snapshot.game.rules}
          // A deleted game is being examined, not celebrated.
          celebrate={crown === "1" && !snapshot.game.deleted}
        />
        <Link
          href={`/game/${snapshot.game.id}/edit`}
          className={`${buttonClass("secondary")} self-start`}
        >
          Fix the record
        </Link>
        <AuditTrail gameId={snapshot.game.id} />
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
    // Walk-up clips for everyone at the table, so a turn can open with a few
    // seconds of that player's own song.
    const { data: roster } = await supabaseAdmin()
      .from("players")
      .select("*")
      .in(
        "id",
        snapshot.players.map((p) => p.player_id),
      );
    const walkUps = Object.fromEntries(
      ((roster ?? []) as Player[]).map((p) => [p.id, clipFor(p)]),
    );

    return (
      <main className={shell}>
        <GameController initial={snapshot} meId={me.id} walkUps={walkUps} />
      </main>
    );
  }

  return (
    <main className={shell}>
      <WatchGame
        initial={snapshot}
        knowsWho={me !== null}
        scorekeeperName={
          snapshot.players.find(
            (p) => p.player_id === snapshot.game.scorekeeper_player_id,
          )?.name ?? null
        }
      />
    </main>
  );
}
