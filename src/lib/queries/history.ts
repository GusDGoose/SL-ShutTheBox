import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase";
import { unwrapRows } from "@/lib/db-rows";
import { monthBounds, monthOf } from "@/lib/months";
import { parseRuleset, tilesOf } from "@/lib/rules";
import type {
  AchievementRow,
  Player,
  PlayerRatingRow,
  PlayerStatsRow,
  PlayerStreakRow,
} from "@/lib/types";
import type { RatingHistoryRow } from "@/lib/queries/stats";

/**
 * The readers behind /history and /players/[id].
 *
 * Same rules as queries/stats.ts: every number comes from a view, nothing is
 * aggregated in TypeScript that SQL already aggregates, and each reader is
 * `React.cache`d so a page can ask twice and pay once.
 */


/** A row of game_results as 0007 defines it — types.ts still has v1's shape. */
export type ResultRow = {
  game_id: string;
  played_on: string;
  player_id: string;
  turn_order: number;
  score: number;
  tiles_open: number[] | null;
  participants: number;
  finish_position: number;
  is_winner: boolean;
  is_shut_box: boolean;
};

export type HistoryGame = {
  id: string;
  played_on: string;
  photo_path: string | null;
  /** Tile count under the ruleset the game was played with — for the boards. */
  tiles: number;
  rows: ResultRow[];
};

export type HistoryMonth = {
  month: string;
  games: HistoryGame[];
  players: Map<string, Player>;
  /** Day wins per player this month — one per day, not per game. */
  dayWins: Map<string, number>;
  shutBoxes: number;
};

/** Every month that has a finished game in it, newest first. */
export const getHistoryMonths = cache(async (): Promise<string[]> => {
  const sb = supabaseAdmin();
  // monthly_champions has a row per month that was played, which is exactly
  // the list — and stays a handful of rows however long the history gets.
  const rows = unwrapRows<{ month: string }[]>(
    await sb.from("monthly_champions").select("month"),
  );
  return [...new Set(rows.map((r) => monthOf(r.month)))].sort().reverse();
});

/** A month of games, with their results and the roster they involve. */
export const getHistoryMonth = cache(
  async (month: string): Promise<HistoryMonth> => {
    const sb = supabaseAdmin();
    const { start, end } = monthBounds(month);

    // Bounded by the month, so api.max_rows (1000) can never bite: a month of
    // daily office play is a few dozen games and a few hundred result rows.
    const games = unwrapRows<
      { id: string; played_on: string; photo_path: string | null; rules: unknown }[]
    >(
      await sb
        .from("games_valid")
        .select("id, played_on, photo_path, rules")
        .gte("played_on", start)
        .lte("played_on", end)
        .order("played_on", { ascending: false })
        .order("finished_at", { ascending: false }),
    );
    if (games.length === 0) {
      return { month, games: [], players: new Map(), dayWins: new Map(), shutBoxes: 0 };
    }

    const rows = unwrapRows<ResultRow[]>(
      await sb
        .from("game_results")
        .select("*")
        .in("game_id", games.map((g) => g.id))
        .order("finish_position"),
    );
    const roster = unwrapRows<Player[]>(
      await sb
        .from("players")
        .select("*")
        .in("id", [...new Set(rows.map((r) => r.player_id))]),
    );

    const byGame = new Map<string, ResultRow[]>();
    for (const r of rows) {
      if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
      byGame.get(r.game_id)!.push(r);
    }

    // Winning either game on a two-game day counts once — the same rule the
    // daily_winners view applies.
    const wonDays = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.is_winner) continue;
      if (!wonDays.has(r.player_id)) wonDays.set(r.player_id, new Set());
      wonDays.get(r.player_id)!.add(r.played_on);
    }

    return {
      month,
      games: games.map(({ rules, ...g }) => ({
        ...g,
        tiles: tilesOf(parseRuleset(rules)),
        rows: byGame.get(g.id) ?? [],
      })),
      players: new Map(roster.map((p) => [p.id, p])),
      dayWins: new Map([...wonDays].map(([id, days]) => [id, days.size])),
      shutBoxes: rows.filter((r) => r.is_shut_box).length,
    };
  },
);

export type EarnedBadge = AchievementRow & {
  earned_at: string;
  game_id: string | null;
  times: number;
};

export type RecentGame = ResultRow & { photo_path: string | null };

export type Profile = {
  player: Player;
  stats: PlayerStatsRow | null;
  streak: PlayerStreakRow | null;
  rating: PlayerRatingRow | null;
  /** Rank among rated players, 1-based, or null if unrated. */
  ratingRank: number | null;
  ratingHistory: RatingHistoryRow[];
  nemesis: { name: string; emoji: string; a_wins: number; b_wins: number; meetings: number } | null;
  /** The opponent this player beats most often — the mirror of the nemesis. */
  victim: { name: string; emoji: string; a_wins: number; b_wins: number; meetings: number } | null;
  earned: EarnedBadge[];
  catalog: AchievementRow[];
  recent: RecentGame[];
  /** Days played in the last twelve weeks, with whether the day was won. */
  form: { played_on: string; won: boolean }[];
};

export const getPlayerProfile = cache(
  async (playerId: string): Promise<Profile | null> => {
    const sb = supabaseAdmin();
    const { data: playerData, error: playerError } = await sb
      .from("players")
      .select("*")
      .eq("id", playerId)
      .maybeSingle();
    if (playerError) throw new Error(playerError.message);
    const player = playerData as Player | null;
    if (!player) return null;

    const twelveWeeksAgo = new Date(Date.now() - 84 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [stats, streaks, ratings, history, nemesis, h2h, earned, catalog, recent, form] =
      await Promise.all([
        sb.from("player_stats").select("*").eq("player_id", playerId).maybeSingle(),
        sb.from("player_streaks").select("*").eq("player_id", playerId).maybeSingle(),
        sb.from("player_ratings").select("*").order("rating", { ascending: false }),
        sb
          .from("rating_history")
          .select("player_id, played_on, seq, rating_after, delta")
          .eq("player_id", playerId)
          .order("played_on")
          .order("seq"),
        sb.from("player_nemesis").select("*").eq("player_id", playerId).maybeSingle(),
        sb
          .from("head_to_head")
          .select("b_id, meetings, a_wins, b_wins")
          .eq("a_id", playerId)
          .gte("meetings", 5)
          .order("a_wins", { ascending: false })
          .limit(1),
        sb
          .from("player_achievements")
          .select("achievement_key, earned_at, game_id, times")
          .eq("player_id", playerId),
        sb.from("achievements").select("*").order("sort"),
        sb
          .from("game_results")
          .select("*")
          .eq("player_id", playerId)
          .order("played_on", { ascending: false })
          .limit(10),
        sb
          .from("game_results")
          .select("played_on, is_winner")
          .eq("player_id", playerId)
          .gte("played_on", twelveWeeksAgo)
          .order("played_on"),
      ]);

    const allRatings = unwrapRows<PlayerRatingRow[]>(ratings).filter((r) => r.rated_games > 0);
    const rating = allRatings.find((r) => r.player_id === playerId) ?? null;
    const ratingRank = rating ? allRatings.indexOf(rating) + 1 : null;

    const catalogRows = unwrapRows<AchievementRow[]>(catalog);
    const byKey = new Map(catalogRows.map((a) => [a.key, a]));
    const earnedRows = unwrapRows<
      { achievement_key: string; earned_at: string; game_id: string | null; times: number }[]
    >(earned);

    const recentRows = unwrapRows<ResultRow[]>(recent);
    const photos = recentRows.length
      ? unwrapRows<{ id: string; photo_path: string | null }[]>(
          await sb
            .from("games_valid")
            .select("id, photo_path")
            .in("id", recentRows.map((r) => r.game_id)),
        )
      : [];
    const photoByGame = new Map(photos.map((g) => [g.id, g.photo_path]));

    // The favourite victim needs a name; look it up only if there is one.
    const victimRow = unwrapRows<{ b_id: string; meetings: number; a_wins: number; b_wins: number }[]>(h2h)[0];
    let victim: Profile["victim"] = null;
    if (victimRow && victimRow.a_wins > victimRow.b_wins) {
      const { data } = await sb.from("players").select("name, emoji").eq("id", victimRow.b_id).maybeSingle();
      const v = data as { name: string; emoji: string } | null;
      if (v) victim = { ...v, a_wins: victimRow.a_wins, b_wins: victimRow.b_wins, meetings: victimRow.meetings };
    }

    const nemesisRow = nemesis.data as
      | { nemesis_name: string; nemesis_emoji: string; a_wins: number; b_wins: number; meetings: number }
      | null;

    // One entry per day: winning either game of a two-game day is one won day.
    const days = new Map<string, boolean>();
    for (const r of unwrapRows<{ played_on: string; is_winner: boolean }[]>(form)) {
      days.set(r.played_on, (days.get(r.played_on) ?? false) || r.is_winner);
    }

    return {
      player,
      stats: (stats.data as PlayerStatsRow | null) ?? null,
      streak: (streaks.data as PlayerStreakRow | null) ?? null,
      rating,
      ratingRank,
      ratingHistory: unwrapRows<RatingHistoryRow[]>(history),
      nemesis: nemesisRow
        ? {
            name: nemesisRow.nemesis_name,
            emoji: nemesisRow.nemesis_emoji,
            a_wins: nemesisRow.a_wins,
            b_wins: nemesisRow.b_wins,
            meetings: nemesisRow.meetings,
          }
        : null,
      victim,
      earned: earnedRows.flatMap((e) => {
        const meta = byKey.get(e.achievement_key);
        return meta ? [{ ...meta, earned_at: e.earned_at, game_id: e.game_id, times: e.times }] : [];
      }),
      catalog: catalogRows,
      recent: recentRows.map((r) => ({ ...r, photo_path: photoByGame.get(r.game_id) ?? null })),
      form: [...days].map(([played_on, won]) => ({ played_on, won })),
    };
  },
);
