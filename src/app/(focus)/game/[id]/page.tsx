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
import { GamePhoto } from "@/components/photo/game-photo";

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
    // The photo is not part of the live snapshot — it has no business in a
    // broadcast — so it is read here, with who pinned it for the caption.
    const { data: photoRow } = await supabaseAdmin()
      .from("games")
      .select("photo_path, photo_at, photo_by")
      .eq("id", snapshot.game.id)
      .maybeSingle();
    const photo = photoRow as
      | { photo_path: string | null; photo_at: string | null; photo_by: string | null }
      | null;
    let pinnedBy: string | null = null;
    if (photo?.photo_by) {
      const { data: who } = await supabaseAdmin()
        .from("players")
        .select("name")
        .eq("id", photo.photo_by)
        .maybeSingle();
      pinnedBy = (who as { name: string } | null)?.name ?? null;
    }

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
        {!snapshot.game.deleted && (
          <GamePhoto
            gameId={snapshot.game.id}
            version={photo?.photo_path ? (photo.photo_at ?? photo.photo_path) : null}
            pinnedBy={pinnedBy}
            knowsWho={me !== null}
          />
        )}
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
    // The active roster: walk-up clips for whoever is at the table, and the
    // list a late arrival is added from.
    const { data: rosterRows } = await supabaseAdmin()
      .from("players")
      .select("*")
      .eq("is_active", true)
      .order("created_at");
    const roster = (rosterRows ?? []) as Player[];
    const walkUps = Object.fromEntries(roster.map((p) => [p.id, clipFor(p)]));

    return (
      <main className={shell}>
        <GameController
          initial={snapshot}
          meId={me.id}
          walkUps={walkUps}
          roster={roster}
        />
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
