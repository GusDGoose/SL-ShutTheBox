import "server-only";
import { cache } from "react";
import { shiftDays } from "@/lib/dates";
import { unwrapMaybe, unwrapRows } from "@/lib/db-rows";
import { supabaseAdmin } from "@/lib/supabase";
import type { TakenDay } from "@/lib/types";

/**
 * The readers behind "one counted game a day" (0023): what today holds, and
 * which recent days already have their game.
 *
 * The database is what enforces the rule (games_one_counted_per_day, STB13,
 * STB14); these only let a page say so before anyone presses a button.
 */

export type DayWinner = { player_id: string; name: string; emoji: string };

export type TodaysGame =
  | { state: "done"; gameId: string; winners: DayWinner[]; score: number }
  | { state: "live"; gameId: string }
  | { state: "free" };

/** Today's game: crowned, being played, or not started yet. */
export const getTodaysGame = cache(async (today: string): Promise<TodaysGame> => {
  const sb = supabaseAdmin();
  const [done, live] = await Promise.all([
    sb
      .from("games")
      .select("id")
      .eq("played_on", today)
      .eq("status", "finished")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
    sb
      .from("games")
      .select("id")
      .eq("played_on", today)
      .eq("status", "in_progress")
      .is("deleted_at", null)
      .order("started_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const doneId = unwrapMaybe<{ id: string }>(done)?.id;
  if (doneId) {
    const winners = unwrapRows<{ player_id: string; score: number }[]>(
      await sb
        .from("game_results")
        .select("player_id, score")
        .eq("game_id", doneId)
        .eq("is_winner", true),
    );
    const people = unwrapRows<{ id: string; name: string; emoji: string }[]>(
      await sb
        .from("players")
        .select("id, name, emoji")
        .in(
          "id",
          winners.map((w) => w.player_id),
        ),
    );
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      state: "done",
      gameId: doneId,
      score: winners[0]?.score ?? 0,
      winners: winners.map((w) => ({
        player_id: w.player_id,
        name: byId.get(w.player_id)?.name ?? "Someone",
        emoji: byId.get(w.player_id)?.emoji ?? "🎲",
      })),
    };
  }

  const liveId = unwrapMaybe<{ id: string }>(live)?.id;
  return liveId ? { state: "live", gameId: liveId } : { state: "free" };
});

/**
 * Days in the last year that already have their game, keyed by date — what
 * the record form needs to refuse a day before submitting. A year keeps the
 * read well under PostgREST's row cap; an older day is still refused by the
 * database, and the refusal names the game.
 */
export const getTakenDays = cache(
  async (today: string): Promise<Record<string, TakenDay>> => {
    const sb = supabaseAdmin();
    const [done, live] = await Promise.all([
      sb
        .from("games")
        .select("id, played_on")
        .eq("status", "finished")
        .is("deleted_at", null)
        .gte("played_on", shiftDays(today, -366)),
      sb
        .from("games")
        .select("id")
        .eq("played_on", today)
        .eq("status", "in_progress")
        .is("deleted_at", null)
        .order("started_at")
        .limit(1)
        .maybeSingle(),
    ]);

    const taken: Record<string, TakenDay> = {};
    const liveId = unwrapMaybe<{ id: string }>(live)?.id;
    if (liveId) taken[today] = { gameId: liveId, live: true };
    // A crowned game outranks a live one: that day is done.
    for (const g of unwrapRows<{ id: string; played_on: string }[]>(done)) {
      taken[g.played_on] = { gameId: g.id, live: false };
    }
    return taken;
  },
);
