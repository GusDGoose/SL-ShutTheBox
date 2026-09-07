// Row shapes for our tables and views. Hand-written and therefore only as
// correct as whoever last edited them — WP-B12 replaces this file with output
// from `supabase gen types typescript`.

export type Player = {
  id: string;
  name: string;
  emoji: string;
  song_url: string | null;
  // The clip settings from 0006: which slice of the song to play, how long to
  // fade at each edge, and whether it repeats.
  song_start_seconds: number;
  song_end_seconds: number | null;
  song_fade_ms: number;
  song_loop: boolean;
  song_clip_path: string | null;
  is_active: boolean;
  created_at: string;
};

// View: player_ratings
export type PlayerRatingRow = {
  player_id: string;
  name: string;
  emoji: string;
  is_active: boolean;
  rating: number;
  rated_games: number;
  peak_rating: number;
  below_peak: number;
  is_established: boolean;
};

export type AchievementRow = {
  key: string;
  name: string;
  description: string;
  emoji: string;
  sort: number;
  repeatable: boolean;
};

export type Game = {
  id: string;
  played_on: string; // YYYY-MM-DD
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
