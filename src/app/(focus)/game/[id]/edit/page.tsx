import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireIdentityPage } from "@/lib/auth";
import { stockholmToday } from "@/lib/dates";
import { parseSnapshot } from "@/lib/live";
import { supabaseAdmin } from "@/lib/supabase";
import { AuditTrail } from "@/components/game/audit-trail";
import {
  EditGameForm,
  type EditableRow,
} from "@/components/game/edit-game-form";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditGamePage({ params }: PageProps<"/game/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // Editing has to be attributable, so this page needs a named player rather
  // than just the PIN.
  await requireIdentityPage(`/game/${id}/edit`);

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("live_game_snapshot", { p_game_id: id });
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const snapshot = parseSnapshot(data);
  // A game still being played is corrected on the board itself, not here.
  if (snapshot.game.status === "in_progress") redirect(`/game/${id}`);

  const { data: roster } = await sb
    .from("players")
    .select("*")
    .eq("is_active", true)
    .order("created_at");

  const rows: EditableRow[] = snapshot.players
    .filter((p) => p.status === "done" || p.status === "dnp")
    .map((p) => ({
      playerId: p.player_id,
      name: p.name,
      emoji: p.emoji,
      status: p.status === "dnp" ? "dnp" : "done",
      score: p.score,
      tilesOpen: p.tiles_open,
    }));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Fix the record
        </h1>
        <Link
          href={`/game/${id}`}
          className="self-start text-sm font-semibold text-ink-muted underline"
        >
          Back to the game
        </Link>
      </div>

      {snapshot.game.deleted && (
        <p className="rounded-[var(--radius-card)] border border-danger/50 bg-danger/10 px-4 py-3 text-sm">
          This game is deleted, so nothing here counts yet. Restore it from the
          game page to bring it back.
        </p>
      )}

      <EditGameForm
        gameId={id}
        rules={snapshot.game.rules}
        playedOn={snapshot.game.played_on}
        rows={rows}
        roster={(roster ?? []) as Player[]}
        today={stockholmToday()}
      />

      <AuditTrail gameId={id} />
    </main>
  );
}
