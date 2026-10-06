import type {
  AchievementRow,
  Player,
  PlayerRatingRow,
  PlayerStatsRow,
  PlayerStreakRow,
} from "@/lib/types";

/**
 * Everyone at a glance, for the Players overview: one card per player, built
 * from rows the views already computed.
 *
 * Pure on purpose. The readers in queries/players.ts fetch; this only joins
 * and orders, so every rule below is unit-tested without a database.
 */

/** How many earned badges a card shows before "+N". */
export const BADGES_ON_CARD = 3;

export type PlayerCardInput = {
  roster: Player[];
  /** player_stats — only players with at least one game. */
  stats: PlayerStatsRow[];
  streaks: PlayerStreakRow[];
  ratings: PlayerRatingRow[];
  /** Rating change over the last seven days, from ratingMovement(). */
  weekDelta: Map<string, number>;
  /** Fika weeks per player. */
  fika: Map<string, number>;
  catalog: AchievementRow[];
  earned: { player_id: string; achievement_key: string; times: number }[];
  /** player_recent_form: each player's latest games, any order. */
  form: {
    player_id: string;
    played_on: string;
    finish_position: number;
    participants: number;
    is_winner: boolean;
    is_shut_box: boolean;
  }[];
  monthlyChampions: { month: string; player_id: string }[];
  /** Closed seasons only — the view leaves the running one out. */
  seasonChampions: { player_id: string }[];
};

export type CardBadge = { key: string; name: string; emoji: string };

export type PlayerCard = {
  player: Player;
  /** Rounded Elo, or null before a first rated game. */
  rating: number | null;
  /** Place among rated players, 1-based — the same number the profile shows. */
  rank: number | null;
  /** Rounded rating change this week; null when it did not move. */
  weekDelta: number | null;
  games: number;
  wins: number;
  winPct: number | null;
  avg: number | null;
  /** Lowest score ever; 0 means they have shut the box. */
  lowest: number | null;
  shutBoxes: number;
  streak: number;
  fika: number;
  /** Monthly titles (finished months) plus season titles. */
  titles: number;
  badges: CardBadge[];
  moreBadges: number;
  badgeCount: number;
  /** The last five finishes, oldest first. */
  form: { position: number; of: number; won: boolean; shut: boolean }[];
};

export function buildPlayerCards(
  input: PlayerCardInput,
  today: string,
): { active: PlayerCard[]; benched: PlayerCard[] } {
  const statsBy = new Map(input.stats.map((s) => [s.player_id, s]));
  const streakBy = new Map(input.streaks.map((s) => [s.player_id, s]));

  // Ranked among players with at least one rated game, highest first: the
  // profile's "#2 at the table" counts the same way.
  const rated = input.ratings
    .filter((r) => r.rated_games > 0)
    .sort((a, b) => b.rating - a.rating);
  const ratingBy = new Map(rated.map((r, i) => [r.player_id, { row: r, rank: i + 1 }]));

  // The hardest-won first: the catalog is sorted from first steps to titles.
  const catalogBy = new Map(input.catalog.map((a) => [a.key, a]));
  const badgesBy = new Map<string, AchievementRow[]>();
  for (const e of input.earned) {
    const meta = catalogBy.get(e.achievement_key);
    if (!meta) continue;
    badgesBy.set(e.player_id, [...(badgesBy.get(e.player_id) ?? []), meta]);
  }

  // The month still being played has a leader, not a champion.
  const thisMonth = `${today.slice(0, 7)}-01`;
  const titles = new Map<string, number>();
  for (const m of input.monthlyChampions) {
    if (m.month >= thisMonth) continue;
    titles.set(m.player_id, (titles.get(m.player_id) ?? 0) + 1);
  }
  for (const s of input.seasonChampions) {
    titles.set(s.player_id, (titles.get(s.player_id) ?? 0) + 1);
  }

  const formBy = new Map<string, PlayerCardInput["form"]>();
  for (const f of input.form) {
    formBy.set(f.player_id, [...(formBy.get(f.player_id) ?? []), f]);
  }

  const cards = input.roster.map((player): PlayerCard => {
    const s = statsBy.get(player.id);
    const r = ratingBy.get(player.id);
    const delta = Math.round(input.weekDelta.get(player.id) ?? 0);
    const earned = (badgesBy.get(player.id) ?? []).sort((a, b) => b.sort - a.sort);
    const recent = (formBy.get(player.id) ?? [])
      .sort((a, b) => a.played_on.localeCompare(b.played_on))
      .slice(-5);
    return {
      player,
      rating: r ? Math.round(r.row.rating) : null,
      rank: r?.rank ?? null,
      weekDelta: delta === 0 ? null : delta,
      games: s?.games_played ?? 0,
      wins: s?.wins ?? 0,
      winPct: s?.win_pct ?? null,
      avg: s?.avg_score ?? null,
      lowest: s?.best_score ?? null,
      shutBoxes: s?.shut_boxes ?? 0,
      streak: streakBy.get(player.id)?.current_streak ?? 0,
      fika: input.fika.get(player.id) ?? 0,
      titles: titles.get(player.id) ?? 0,
      badges: earned
        .slice(0, BADGES_ON_CARD)
        .map((b) => ({ key: b.key, name: b.name, emoji: b.emoji })),
      moreBadges: Math.max(0, earned.length - BADGES_ON_CARD),
      badgeCount: earned.length,
      form: recent.map((f) => ({
        position: f.finish_position,
        of: f.participants,
        won: f.is_winner,
        shut: f.is_shut_box,
      })),
    };
  });

  // Rated players by rating; then players with games but no rating yet, by
  // games; then the ones who have not played, by name.
  cards.sort((a, b) => {
    if (a.rank !== null || b.rank !== null) {
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    }
    if (a.games !== b.games) return b.games - a.games;
    return a.player.name.localeCompare(b.player.name);
  });

  return {
    active: cards.filter((c) => c.player.is_active),
    benched: cards.filter((c) => !c.player.is_active),
  };
}
