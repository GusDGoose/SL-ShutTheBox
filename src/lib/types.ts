// Row shapes for our tables and views (hand-written; a generated-types setup
// via `supabase gen types` is a v2 nicety).

export type Player = {
  id: string;
  name: string;
  emoji: string;
  song_url: string | null;
  is_active: boolean;
  created_at: string;
};

export type Game = {
  id: string;
  played_on: string; // YYYY-MM-DD
  max_tile: 12;
  created_at: string;
};

export type GamePlayer = {
  game_id: string;
  player_id: string;
  score: number;
  tiles_open: number[] | null;
  turn_order: number;
};

// View: game_results
export type GameResultRow = {
  game_id: string;
  played_on: string;
  max_tile: 12;
  player_id: string;
  score: number;
  tiles_open: number[] | null;
  is_winner: boolean;
  is_shut_box: boolean;
};

// View: player_stats
export type PlayerStatsRow = {
  player_id: string;
  name: string;
  emoji: string;
  games_played: number;
  wins: number;
  win_pct: number | null;
  avg_score: number | null;
  best_score: number | null;
  shut_boxes: number;
};

// View: player_streaks
export type PlayerStreakRow = {
  player_id: string;
  name: string;
  best_streak: number;
  current_streak: number;
};

// View: monthly_champions
export type MonthlyChampionRow = {
  month: string; // first of month, YYYY-MM-DD
  player_id: string;
  name: string;
  emoji: string;
  day_wins: number;
};
