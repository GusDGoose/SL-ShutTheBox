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
 * This week's duty, or null if nobody has drawn one yet.
 *
 * Deliberately a read, never a draw: the Monday cron draws, and a page render
 * must not have the side effect of picking who pays for cake.
 */
export const getFikaCurrent = cache(async (): Promise<FikaDuty | null> => {
  const { data, error } = await supabaseAdmin()
    .from("fika_current")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FikaDuty | null) ?? null;
});

/** How many times each player has bought, keyed by player id. */
export const getFikaTally = cache(async (): Promise<Map<string, number>> => {
  const { data, error } = await supabaseAdmin()
    .from("fika_tally")
    .select("player_id, duties");
  if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);

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
