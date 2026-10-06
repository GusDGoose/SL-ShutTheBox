import "server-only";
import { cache } from "react";
import { stockholmToday } from "@/lib/dates";
import { unwrapRows } from "@/lib/db-rows";
import { buildPlayerCards, type PlayerCardInput } from "@/lib/player-cards";
import { getFikaTally } from "@/lib/queries/fika";
import {
  getAllTimeStats,
  getMonthlyChampions,
  getRatings,
  getRecentRatingHistory,
  getRoster,
  getSeasonChampions,
  getStreaks,
  ratingMovement,
} from "@/lib/queries/stats";
import { supabaseAdmin } from "@/lib/supabase";
import type { AchievementRow } from "@/lib/types";

/**
 * The readers behind the Players overview: every player's card at once.
 *
 * Same rules as queries/stats.ts — every number comes from a view, and the
 * joining is done in player-cards.ts where it is unit-tested. Two reads are
 * new: the badge catalog with who holds what, and each player's last five
 * games (player_recent_form, 0023), which a plain select could not bound per
 * player under PostgREST's row cap.
 */

export const getBadgeHolders = cache(async () => {
  const sb = supabaseAdmin();
  const [catalog, earned] = await Promise.all([
    sb.from("achievements").select("*").order("sort"),
    sb.from("player_achievements").select("player_id, achievement_key, times"),
  ]);
  return {
    catalog: unwrapRows<AchievementRow[]>(catalog),
    earned: unwrapRows<PlayerCardInput["earned"]>(earned),
  };
});

export const getRecentForm = cache(async (): Promise<PlayerCardInput["form"]> => {
  const sb = supabaseAdmin();
  return unwrapRows<PlayerCardInput["form"]>(
    await sb
      .from("player_recent_form")
      .select("player_id, played_on, finish_position, participants, is_winner, is_shut_box"),
  );
});

export const getPlayerCards = cache(async () => {
  const [roster, stats, streaks, ratings, history, fika, badges, form, monthly, seasons] =
    await Promise.all([
      getRoster(),
      getAllTimeStats(),
      getStreaks(),
      getRatings(),
      getRecentRatingHistory(),
      getFikaTally(),
      getBadgeHolders(),
      getRecentForm(),
      getMonthlyChampions(),
      getSeasonChampions(),
    ]);

  return buildPlayerCards(
    {
      roster,
      stats,
      streaks,
      ratings,
      weekDelta: ratingMovement(history).weekDelta,
      fika,
      catalog: badges.catalog,
      earned: badges.earned,
      form,
      monthlyChampions: monthly,
      seasonChampions: seasons,
    },
    stockholmToday(),
  );
});
