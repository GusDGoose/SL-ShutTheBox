import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase";

/** The person buying fika this week, if a draw has happened. */
export type FikaDuty = {
  id: string;
  week_start: string;
  player_id: string;
  name: string;
  emoji: string;
  reason: "worst_last_week" | "random_fallback";
  detail: { badness?: number; games?: number; from?: string; to?: string };
  drawn_at: string;
  duties_total: number;
};

/**
 * [concept: the app and the schema move together — except when they cannot]
 * Deploying this app before migration 0018 reaches production would take the
 * HOME page down for the whole office, because Today reads the rota. The
 * office network blocks Postgres, so the migration is a manual dashboard
 * paste and the two cannot be made atomic.
 *
 * So getFikaCurrent answers with three states, not two: a duty, `null` for
 * "drawn nothing yet" (offer the Draw button), and `undefined` for "this
 * deployment has no rota" (show nothing at all — a Draw button that cannot
 * work is worse than no card). Narrow on purpose: only the two codes that
 * mean "that relation is not there" are swallowed, and only for this
 * feature. Every other database error still throws, because a rota that
 * silently shows nobody buying is exactly the bug worth seeing.
 *
 * Delete this once 0018 is applied everywhere.
 */
function relationMissing(error: { code?: string | null } | null): boolean {
  // 42P01 = undefined_table from Postgres; PGRST205 = PostgREST's schema
  // cache saying the same thing.
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * This week's duty, or null if nobody has drawn one yet.
 *
 * Deliberately a read, never a draw: the Monday cron draws, and a page render
 * must not have the side effect of picking who pays for cake.
 */
export const getFikaCurrent = cache(
  async (): Promise<FikaDuty | null | undefined> => {
    const { data, error } = await supabaseAdmin()
      .from("fika_current")
      .select("*")
      .maybeSingle();
    if (error) {
      if (relationMissing(error)) return undefined;
      throw new Error(error.message);
    }
    return (data as FikaDuty | null) ?? null;
  },
);

/** How many times each player has bought, keyed by player id. */
export const getFikaTally = cache(async (): Promise<Map<string, number>> => {
  const { data, error } = await supabaseAdmin()
    .from("fika_tally")
    .select("player_id, duties");
  if (error) {
    if (relationMissing(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map(
    ((data ?? []) as { player_id: string; duties: number }[]).map((r) => [
      r.player_id,
      Number(r.duties),
    ]),
  );
});

/** Recent duties, newest first — the "who has bought lately" list. */
export const getFikaHistory = cache(
  async (limit = 12): Promise<
    {
      id: string;
      week_start: string;
      name: string;
      emoji: string;
      reason: string;
      skipped: boolean;
    }[]
  > => {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("fika_duties")
      .select("id, week_start, player_id, reason, skipped_at")
      .order("week_start", { ascending: false })
      .limit(limit);
    if (error) {
      if (relationMissing(error)) return [];
      throw new Error(error.message);
    }

    const rows = (data ?? []) as {
      id: string;
      week_start: string;
      player_id: string;
      reason: string;
      skipped_at: string | null;
    }[];
    if (rows.length === 0) return [];

    const { data: people } = await sb
      .from("players")
      .select("id, name, emoji")
      .in("id", [...new Set(rows.map((r) => r.player_id))]);
    const byId = new Map(
      ((people ?? []) as { id: string; name: string; emoji: string }[]).map(
        (p) => [p.id, p],
      ),
    );

    return rows.map((r) => ({
      id: r.id,
      week_start: r.week_start,
      name: byId.get(r.player_id)?.name ?? "Someone",
      emoji: byId.get(r.player_id)?.emoji ?? "🎲",
      reason: r.reason,
      skipped: r.skipped_at !== null,
    }));
  },
);
