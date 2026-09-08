import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase";
import { parseRuleset, type Ruleset } from "@/lib/rules";
import type { Player, PlayerRatingRow, PlayerStatsRow, PlayerStreakRow } from "@/lib/types";

/**
 * The readers behind /stats.
 *
 * Three pages ask overlapping questions of the same views, so the queries live
 * here once instead of being re-typed per page. Each is wrapped in
 * `React.cache`, which dedupes it within a single request — the season page
 * asks for the roster three times through different components and gets one
 * round trip.
 *
 * Everything is a `select *` from a view in 0007-0009. Nothing is aggregated
 * in TypeScript that SQL could aggregate, because that is exactly how v1 ended
 * up with three different definitions of a winner.
 */

export type SeasonRow = {
  id: string;
  slug: string;
  number: number;
  name: string;
  starts_on: string;
  ends_on: string;
  ruleset_id: string;
};

export type SeasonWithRules = SeasonRow & { rules: Ruleset };

export type StandingRow = {
  season_id: string;
  player_id: string;
  name: string;
  emoji: string;
  day_wins: number;
  wins: number;
  games_played: number;
  avg_score: number | null;
  best_score: number | null;
  avg_finish: number | null;
  shut_boxes: number;
  rnk: number;
};

export type TrendRow = {
  player_id: string;
  month: string;
  games: number;
  avg_score: number | null;
  best_score: number | null;
  wins: number;
};

export type RatingHistoryRow = {
  player_id: string;
  played_on: string;
  seq: number;
  rating_after: number;
  delta: number;
};

export type ChokeRow = {
  game_id: string;
  player_id: string;
  played_on: string;
  delta: number;
  rating_before: number;
  was_favourite: boolean;
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

/** Every season, newest first, with its ruleset parsed. */
export const getSeasons = cache(async (): Promise<SeasonWithRules[]> => {
  const sb = supabaseAdmin();
  const [seasons, rulesets] = await Promise.all([
    sb.from("seasons").select("*").order("starts_on", { ascending: false }),
    sb.from("rulesets").select("id, rules"),
  ]);
  const rules = new Map(
    unwrap<{ id: string; rules: unknown }[]>(rulesets).map((r) => [
      r.id,
      parseRuleset(r.rules),
    ]),
  );
  return unwrap<SeasonRow[]>(seasons).map((s) => ({
    ...s,
    rules: rules.get(s.ruleset_id)!,
  }));
});

/** The season containing a date, created on demand if the quarter is new. */
export const getSeasonForDate = cache(
  async (date: string): Promise<SeasonWithRules> => {
    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc("ensure_season", { p_date: date });
    if (error) throw new Error(error.message);
    const seasons = await getSeasons();
    const season = seasons.find((s) => s.id === data);
    if (!season) throw new Error("that date has no season");
    return season;
  },
);

export const getRoster = cache(async (): Promise<Player[]> => {
  const sb = supabaseAdmin();
  return unwrap<Player[]>(
    await sb.from("players").select("*").order("created_at"),
  );
});

export const getStandings = cache(
  async (seasonId: string): Promise<StandingRow[]> => {
    const sb = supabaseAdmin();
    return unwrap<StandingRow[]>(
      await sb
        .from("season_standings")
        .select("*")
        .eq("season_id", seasonId)
        .order("rnk"),
    );
  },
);

export const getRatings = cache(async (): Promise<PlayerRatingRow[]> => {
  const sb = supabaseAdmin();
  return unwrap<PlayerRatingRow[]>(
    await sb
      .from("player_ratings")
      .select("*")
      .order("rating", { ascending: false }),
  );
});

/**
 * Recent rating movement, for the sparklines and the 7-day delta.
 *
 * Bounded to 90 days rather than "everything": `api.max_rows` is 1000, and a
 * few years of daily play would quietly hit it and truncate the oldest
 * players' lines without erroring.
 */
export const getRecentRatingHistory = cache(
  async (): Promise<RatingHistoryRow[]> => {
    const sb = supabaseAdmin();
    const since = new Date(Date.now() - 90 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return unwrap<RatingHistoryRow[]>(
      await sb
        .from("rating_history")
        .select("player_id, played_on, seq, rating_after, delta")
        .gte("played_on", since)
        .order("played_on")
        .order("seq"),
    );
  },
);

/** Rating series and 7-day change per player, derived from the history above. */
export function ratingMovement(history: RatingHistoryRow[]) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const series = new Map<string, number[]>();
  const weekDelta = new Map<string, number>();

  for (const row of history) {
    if (!series.has(row.player_id)) series.set(row.player_id, []);
    series.get(row.player_id)!.push(Number(row.rating_after));
    if (row.played_on >= weekAgo) {
      weekDelta.set(
        row.player_id,
        (weekDelta.get(row.player_id) ?? 0) + Number(row.delta),
      );
    }
  }
  return { series, weekDelta };
}

export const getAllTimeStats = cache(async (): Promise<PlayerStatsRow[]> => {
  const sb = supabaseAdmin();
  return unwrap<PlayerStatsRow[]>(
    await sb
      .from("player_stats")
      .select("*")
      .gt("games_played", 0)
      .order("wins", { ascending: false }),
  );
});

export const getStreaks = cache(async (): Promise<PlayerStreakRow[]> => {
  const sb = supabaseAdmin();
  return unwrap<PlayerStreakRow[]>(
    await sb.from("player_streaks").select("*"),
  );
});

export const getTrends = cache(async (): Promise<TrendRow[]> => {
  const sb = supabaseAdmin();
  return unwrap<TrendRow[]>(
    await sb.from("player_trends").select("*").order("month"),
  );
});

/** All-time score counts, already aggregated by the view. */
export const getScoreDistribution = cache(
  async (): Promise<{ score: number; n: number }[]> => {
    const sb = supabaseAdmin();
    const rows = unwrap<{ score: number; n: number }[]>(
      await sb.from("score_distribution").select("score, n"),
    );
    // The view is per player per ruleset; the page wants one histogram.
    const totals = new Map<number, number>();
    for (const r of rows) {
      totals.set(r.score, (totals.get(r.score) ?? 0) + Number(r.n));
    }
    return [...totals].map(([score, n]) => ({ score, n }));
  },
);

/**
 * Score counts for one season.
 *
 * score_distribution has no season column, so this counts from game_results.
 * A quarter of daily office play is a few hundred rows — well inside
 * `api.max_rows` — and only the score column is fetched.
 */
export const getSeasonDistribution = cache(
  async (seasonId: string): Promise<{ score: number; n: number }[]> => {
    const sb = supabaseAdmin();
    const rows = unwrap<{ score: number }[]>(
      await sb.from("game_results").select("score").eq("season_id", seasonId),
    );
    const totals = new Map<number, number>();
    for (const r of rows) {
      totals.set(r.score, (totals.get(r.score) ?? 0) + 1);
    }
    return [...totals].map(([score, n]) => ({ score, n }));
  },
);

export const getHallOfFame = cache(async () => {
  const sb = supabaseAdmin();
  return unwrap<
    {
      key: string;
      player_id: string;
      value: number;
      game_id: string | null;
      played_on: string | null;
    }[]
  >(await sb.from("hall_of_fame").select("*"));
});

export const getHeadToHead = cache(async () => {
  const sb = supabaseAdmin();
  return unwrap<
    {
      a_id: string;
      b_id: string;
      meetings: number;
      a_wins: number;
      b_wins: number;
      ties: number;
    }[]
  >(await sb.from("head_to_head").select("a_id, b_id, meetings, a_wins, b_wins, ties"));
});

export const getNemeses = cache(async () => {
  const sb = supabaseAdmin();
  return unwrap<
    {
      player_id: string;
      nemesis_name: string;
      nemesis_emoji: string;
      meetings: number;
      a_wins: number;
      b_wins: number;
      nemesis_win_pct: number;
    }[]
  >(await sb.from("player_nemesis").select("*"));
});

export const getBiggestChokes = cache(async (): Promise<ChokeRow[]> => {
  const sb = supabaseAdmin();
  return unwrap<ChokeRow[]>(
    await sb.from("biggest_chokes").select("*").order("delta").limit(5),
  );
});

export const getMonthlyChampions = cache(async () => {
  const sb = supabaseAdmin();
  return unwrap<
    {
      month: string;
      player_id: string;
      name: string;
      emoji: string;
      day_wins: number;
    }[]
  >(
    await sb
      .from("monthly_champions")
      .select("*")
      .order("month", { ascending: false }),
  );
});

export const getSeasonChampions = cache(async () => {
  const sb = supabaseAdmin();
  return unwrap<
    {
      season_id: string;
      season_number: number;
      season_name: string;
      player_id: string;
      name: string;
      emoji: string;
      day_wins: number;
      ends_on: string;
    }[]
  >(
    await sb
      .from("season_champions")
      .select(
        "season_id, season_number, season_name, player_id, name, emoji, day_wins, ends_on",
      )
      .order("season_number", { ascending: false }),
  );
});
