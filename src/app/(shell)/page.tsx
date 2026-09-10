import Link from "next/link";
import type { GameResultRow, Player } from "@/lib/types";
import { getIdentity } from "@/lib/auth";
import { dayLabel, isoMonday, stockholmToday } from "@/lib/dates";
import { parseSnapshot } from "@/lib/live";
import { supabaseAdmin } from "@/lib/supabase";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MiniBoard } from "@/components/board/mini-board";
import { LiveGameCard } from "@/components/game/live-game-card";
import { FikaCard } from "@/components/fika/fika-card";
import { getFikaCurrent } from "@/lib/queries/fika";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = supabaseAdmin();
  const today = stockholmToday();
  const [me, fika] = await Promise.all([getIdentity(), getFikaCurrent()]);

  // Live and finished are now different things. The v1 page selected every
  // game for today regardless of status, so once games gained a lifecycle an
  // in-progress one rendered as an empty card — game_results only contains
  // games that were played to the end.
  const [liveRes, finishedRes] = await Promise.all([
    sb
      .from("games")
      .select("id")
      .eq("status", "in_progress")
      .is("deleted_at", null)
      .order("started_at")
      .limit(1)
      .maybeSingle(),
    sb
      .from("games")
      .select("id")
      .eq("played_on", today)
      .eq("status", "finished")
      .is("deleted_at", null)
      .order("created_at"),
  ]);
  if (finishedRes.error) throw new Error(finishedRes.error.message);

  const liveId = (liveRes.data as { id: string } | null)?.id ?? null;
  let liveSnapshot = null;
  if (liveId) {
    const { data } = await sb.rpc("live_game_snapshot", { p_game_id: liveId });
    if (data) liveSnapshot = parseSnapshot(data);
  }

  const finishedIds = (finishedRes.data ?? []).map((g) => (g as { id: string }).id);
  let rows: GameResultRow[] = [];
  let byId = new Map<string, Player>();
  if (finishedIds.length > 0) {
    const { data, error } = await sb
      .from("game_results")
      .select("*")
      .in("game_id", finishedIds)
      .order("finish_position", { ascending: true });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as GameResultRow[];

    const { data: playerRows } = await sb
      .from("players")
      .select("*")
      .in(
        "id",
        rows.map((r) => r.player_id),
      );
    byId = new Map(((playerRows ?? []) as Player[]).map((p) => [p.id, p]));
  }

  const nothingToday = !liveSnapshot && finishedIds.length === 0;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      {/* The date is the way into the history: tap it for this month. */}
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        <Link
          href={`/history/${today.slice(0, 7)}`}
          className="rounded-[var(--radius-control)] hover:text-brass-ink"
        >
          {dayLabel(today)}
        </Link>
      </h1>

      {liveSnapshot && (
        <LiveGameCard
          initial={liveSnapshot}
          amScorekeeper={
            me !== null && liveSnapshot.game.scorekeeper_player_id === me.id
          }
        />
      )}

      {nothingToday ? (
        <EmptyState
          art="🎲"
          title="No game yet today."
          body="Gather the colleagues — lowest score wins the day."
          cta={
            <Link href="/play" className={buttonClass("primary", "lg")}>
              Start today&apos;s game
            </Link>
          }
        />
      ) : (
        <>
          {finishedIds.map((gameId, index) => {
            const gameRows = rows.filter((r) => r.game_id === gameId);
            if (gameRows.length === 0) return null;
            const tiles = 12; // WP-B12's typed client carries the ruleset here
            return (
              <Link
                key={gameId}
                href={`/game/${gameId}`}
                className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-4 transition-colors hover:border-brass/60"
              >
                <h2 className="eyebrow">
                  {finishedIds.length > 1 ? `Game ${index + 1}` : "Today's game"}
                </h2>
                {gameRows.map((r) => {
                  const p = byId.get(r.player_id);
                  return (
                    <div
                      key={r.player_id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{p?.emoji}</span>
                        <span className="font-medium">{p?.name}</span>
                        <MiniBoard tiles={tiles} open={r.tiles_open} />
                      </span>
                      <span className="font-[family-name:var(--font-display)] font-bold tabular-nums">
                        {r.score === 0 ? "📦 0" : r.score}
                        {r.is_winner && " 👑"}
                      </span>
                    </div>
                  );
                })}
              </Link>
            );
          })}

          {!liveSnapshot && (
            <Link
              href="/play"
              className="self-start text-sm font-semibold text-ink-muted hover:text-ink"
            >
              + Start another game
            </Link>
          )}
        </>
      )}

      {/* Who owes cake. It sits below the games because on most days the
          game is the news and the rota is the reminder. */}
      <FikaCard duty={fika} weekStart={isoMonday(today)} canAct={me !== null} />

      {/* The forgotten Friday, or the day the app was down: a game that was
          played on the real box and never entered. Recording it after the
          fact keeps the history honest and lands in the audit trail. */}
      <Link
        href="/record"
        className="self-start text-sm text-ink-muted underline hover:text-ink"
      >
        Played without the app? Record a game →
      </Link>
    </main>
  );
}
