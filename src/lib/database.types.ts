export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string
          emoji: string
          key: string
          name: string
          repeatable: boolean
          sort: number
        }
        Insert: {
          description: string
          emoji: string
          key: string
          name: string
          repeatable?: boolean
          sort: number
        }
        Update: {
          description?: string
          emoji?: string
          key?: string
          name?: string
          repeatable?: boolean
          sort?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_player_id: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          note: string | null
        }
        Insert: {
          action: string
          actor_player_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          note?: string | null
        }
        Update: {
          action?: string
          actor_player_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "audit_log_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "audit_log_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "audit_log_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "audit_log_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          job: string
          ran_at: string
          result: Json
          run_date: string
        }
        Insert: {
          job: string
          ran_at?: string
          result?: Json
          run_date: string
        }
        Update: {
          job?: string
          ran_at?: string
          result?: Json
          run_date?: string
        }
        Relationships: []
      }
      fika_cycles: {
        Row: {
          id: string
          seq: number
          started_on: string
        }
        Insert: {
          id?: string
          seq?: never
          started_on?: string
        }
        Update: {
          id?: string
          seq?: never
          started_on?: string
        }
        Relationships: []
      }
      fika_duties: {
        Row: {
          cycle_id: string
          detail: Json
          drawn_at: string
          drawn_by: string | null
          id: string
          player_id: string
          reason: string
          skipped_at: string | null
          skipped_by: string | null
          week_start: string
        }
        Insert: {
          cycle_id: string
          detail?: Json
          drawn_at?: string
          drawn_by?: string | null
          id?: string
          player_id: string
          reason: string
          skipped_at?: string | null
          skipped_by?: string | null
          week_start: string
        }
        Update: {
          cycle_id?: string
          detail?: Json
          drawn_at?: string
          drawn_by?: string | null
          id?: string
          player_id?: string
          reason?: string
          skipped_at?: string | null
          skipped_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "fika_duties_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "fika_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fika_duties_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fika_duties_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          game_id: string
          player_id: string
          predicted_score: number | null
          score: number | null
          status: Database["public"]["Enums"]["game_player_status"]
          tiles_open: number[] | null
          turn_order: number
        }
        Insert: {
          game_id: string
          player_id: string
          predicted_score?: number | null
          score?: number | null
          status?: Database["public"]["Enums"]["game_player_status"]
          tiles_open?: number[] | null
          turn_order: number
        }
        Update: {
          game_id?: string
          player_id?: string
          predicted_score?: number | null
          score?: number | null
          status?: Database["public"]["Enums"]["game_player_status"]
          tiles_open?: number[] | null
          turn_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          finished_at: string | null
          id: string
          photo_at: string | null
          photo_by: string | null
          photo_path: string | null
          played_on: string
          ruleset_id: string
          scorekeeper_player_id: string | null
          season_id: string
          started_at: string
          status: Database["public"]["Enums"]["game_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_at?: string | null
          id?: string
          photo_at?: string | null
          photo_by?: string | null
          photo_path?: string | null
          played_on?: string
          ruleset_id?: string
          scorekeeper_player_id?: string | null
          season_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_at?: string | null
          id?: string
          photo_at?: string | null
          photo_by?: string | null
          photo_path?: string | null
          played_on?: string
          ruleset_id?: string
          scorekeeper_player_id?: string | null
          season_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_photo_by_fkey"
            columns: ["photo_by"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_photo_by_fkey"
            columns: ["photo_by"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_photo_by_fkey"
            columns: ["photo_by"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_photo_by_fkey"
            columns: ["photo_by"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_photo_by_fkey"
            columns: ["photo_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_champions"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_standings"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      live_turns: {
        Row: {
          game_id: string
          player_id: string
          tiles_down: number[]
          updated_at: string
          version: number
        }
        Insert: {
          game_id: string
          player_id: string
          tiles_down?: number[]
          updated_at?: string
          version?: number
        }
        Update: {
          game_id?: string
          player_id?: string
          tiles_down?: number[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_turns_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_turns_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_turns_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_attempts: {
        Row: {
          fails: number
          ip_hash: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          fails?: number
          ip_hash: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          fails?: number
          ip_hash?: string
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      player_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          game_id: string | null
          player_id: string
          season_id: string | null
          times: number
        }
        Insert: {
          achievement_key: string
          earned_at: string
          game_id?: string | null
          player_id: string
          season_id?: string | null
          times?: number
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          game_id?: string | null
          player_id?: string
          season_id?: string | null
          times?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_achievements_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "player_achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_champions"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "player_achievements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_standings"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "player_achievements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          emoji: string
          id: string
          is_active: boolean
          name: string
          song_clip_path: string | null
          song_end_seconds: number | null
          song_fade_ms: number
          song_loop: boolean
          song_start_seconds: number
          song_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          name: string
          song_clip_path?: string | null
          song_end_seconds?: number | null
          song_fade_ms?: number
          song_loop?: boolean
          song_start_seconds?: number
          song_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          name?: string
          song_clip_path?: string | null
          song_end_seconds?: number | null
          song_fade_ms?: number
          song_loop?: boolean
          song_start_seconds?: number
          song_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rating_events: {
        Row: {
          delta: number
          game_id: string
          k: number
          opponents: number
          played_on: string
          player_id: string
          rating_after: number
          rating_before: number
          seq: number
        }
        Insert: {
          delta: number
          game_id: string
          k: number
          opponents: number
          played_on: string
          player_id: string
          rating_after: number
          rating_before: number
          seq: number
        }
        Update: {
          delta?: number
          game_id?: string
          k?: number
          opponents?: number
          played_on?: string
          player_id?: string
          rating_after?: number
          rating_before?: number
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      rulesets: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          rules: Json
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          rules: Json
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          rules?: Json
          slug?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          name: string
          number: number
          ruleset_id: string
          slug: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          name: string
          number: number
          ruleset_id: string
          slug: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          number?: number
          ruleset_id?: string
          slug?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      biggest_chokes: {
        Row: {
          delta: number | null
          game_id: string | null
          played_on: string | null
          player_id: string | null
          rating_before: number | null
          was_favourite: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_winners: {
        Row: {
          played_on: string | null
          player_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fika_current: {
        Row: {
          detail: Json | null
          drawn_at: string | null
          duties_total: number | null
          emoji: string | null
          id: string | null
          name: string | null
          player_id: string | null
          reason: string | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "fika_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fika_tally: {
        Row: {
          duties: number | null
          player_id: string | null
        }
        Relationships: []
      }
      game_results: {
        Row: {
          finish_position: number | null
          game_id: string | null
          is_shut_box: boolean | null
          is_winner: boolean | null
          participants: number | null
          played_on: string | null
          player_id: string | null
          predicted_score: number | null
          ruleset_id: string | null
          score: number | null
          season_id: string | null
          tiles_open: number[] | null
          turn_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_champions"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_standings"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      games_valid: {
        Row: {
          finished_at: string | null
          id: string | null
          photo_path: string | null
          played_on: string | null
          rules: Json | null
          ruleset_id: string | null
          season_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_champions"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_standings"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      hall_of_fame: {
        Row: {
          game_id: string | null
          key: string | null
          played_on: string | null
          player_id: string | null
          value: number | null
        }
        Relationships: []
      }
      head_to_head: {
        Row: {
          a_id: string | null
          a_wins: number | null
          b_id: string | null
          b_wins: number | null
          last_met: string | null
          meetings: number | null
          ties: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      live_games: {
        Row: {
          created_by: string | null
          current_player_id: string | null
          id: string | null
          played_on: string | null
          ruleset_id: string | null
          scorekeeper_player_id: string | null
          season_id: string | null
          started_at: string | null
          tiles_down: number[] | null
          updated_at: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "games_scorekeeper_player_id_fkey"
            columns: ["scorekeeper_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_champions"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "season_standings"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["current_player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["current_player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["current_player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["current_player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "live_turns_player_id_fkey"
            columns: ["current_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_champions: {
        Row: {
          day_wins: number | null
          emoji: string | null
          month: string | null
          name: string | null
          player_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_nemesis: {
        Row: {
          a_wins: number | null
          b_wins: number | null
          meetings: number | null
          nemesis_emoji: string | null
          nemesis_id: string | null
          nemesis_name: string | null
          nemesis_win_pct: number | null
          player_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["nemesis_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["nemesis_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["nemesis_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["nemesis_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["nemesis_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          below_peak: number | null
          emoji: string | null
          is_active: boolean | null
          is_established: boolean | null
          name: string | null
          peak_rating: number | null
          player_id: string | null
          rated_games: number | null
          rating: number | null
        }
        Relationships: []
      }
      player_stats: {
        Row: {
          avg_finish: number | null
          avg_score: number | null
          best_score: number | null
          dnp_count: number | null
          emoji: string | null
          games_played: number | null
          is_active: boolean | null
          last_played_on: string | null
          name: string | null
          player_id: string | null
          shut_boxes: number | null
          win_pct: number | null
          wins: number | null
          worst_score: number | null
        }
        Relationships: []
      }
      player_streaks: {
        Row: {
          best_streak: number | null
          current_streak: number | null
          emoji: string | null
          name: string | null
          player_id: string | null
        }
        Relationships: []
      }
      player_trends: {
        Row: {
          avg_score: number | null
          best_score: number | null
          games: number | null
          month: string | null
          player_id: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history: {
        Row: {
          delta: number | null
          finished_at: string | null
          game_id: string | null
          k: number | null
          opponents: number | null
          played_on: string | null
          player_id: string | null
          rating_after: number | null
          rating_before: number | null
          seq: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_valid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      score_distribution: {
        Row: {
          n: number | null
          player_id: string | null
          ruleset_id: string | null
          score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      season_champions: {
        Row: {
          avg_finish: number | null
          avg_score: number | null
          best_score: number | null
          day_wins: number | null
          emoji: string | null
          ends_on: string | null
          games_played: number | null
          name: string | null
          player_id: string | null
          rnk: number | null
          season_id: string | null
          season_name: string | null
          season_number: number | null
          season_slug: string | null
          shut_boxes: number | null
          starts_on: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      season_standings: {
        Row: {
          avg_finish: number | null
          avg_score: number | null
          best_score: number | null
          day_wins: number | null
          emoji: string | null
          games_played: number | null
          name: string | null
          player_id: string | null
          rnk: number | null
          season_id: string | null
          season_number: number | null
          season_slug: string | null
          shut_boxes: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "fika_tally"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_ratings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_streaks"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abandon_game: {
        Args: { p_actor: string; p_game_id: string; p_note?: string }
        Returns: undefined
      }
      abandon_stale_games: {
        Args: { p_older_than?: string }
        Returns: string[]
      }
      add_manual_game: {
        Args: {
          p_actor: string
          p_note?: string
          p_played_on: string
          p_results: Json
        }
        Returns: string
      }
      apply_game_results: {
        Args: { p_game_id: string; p_results: Json }
        Returns: undefined
      }
      assert_scorekeeper: {
        Args: { p_actor: string; p_game_id: string }
        Returns: Json
      }
      broadcast_live_game: { Args: { p_game_id: string }; Returns: undefined }
      claim_scorekeeper: {
        Args: { p_actor: string; p_game_id: string }
        Returns: Json
      }
      default_ruleset_id: { Args: never; Returns: string }
      delete_game: {
        Args: { p_actor: string; p_game_id: string; p_reason?: string }
        Returns: undefined
      }
      draw_fika: {
        Args: { p_actor?: string; p_week_start: string }
        Returns: {
          cycle_id: string
          detail: Json
          drawn_at: string
          drawn_by: string | null
          id: string
          player_id: string
          reason: string
          skipped_at: string | null
          skipped_by: string | null
          week_start: string
        }
        SetofOptions: {
          from: "*"
          to: "fika_duties"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_game: {
        Args: {
          p_actor: string
          p_game_id: string
          p_note?: string
          p_played_on: string
          p_results: Json
        }
        Returns: undefined
      }
      end_turn: {
        Args: {
          p_actor: string
          p_game_id: string
          p_predicted?: number
          p_typed_score?: number
        }
        Returns: Json
      }
      ensure_season: { Args: { p_date: string }; Returns: string }
      evaluate_achievements: { Args: never; Returns: undefined }
      finish_game: {
        Args: { p_actor: string; p_game_id: string }
        Returns: Json
      }
      game_snapshot: { Args: { p_game_id: string }; Returns: Json }
      iso_monday: { Args: { p_date: string }; Returns: string }
      join_game: {
        Args: { p_actor: string; p_game_id: string; p_player_id: string }
        Returns: Json
      }
      leave_game: {
        Args: { p_actor: string; p_game_id: string; p_player_id: string }
        Returns: Json
      }
      live_game_snapshot: { Args: { p_game_id: string }; Returns: Json }
      live_set_board: {
        Args: { p_actor: string; p_game_id: string; p_tiles_down: number[] }
        Returns: Json
      }
      next_quarter_start: { Args: never; Returns: string }
      pin_gate: {
        Args: { p_ip_hash: string; p_success?: boolean }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      plan_season: {
        Args: {
          p_actor: string
          p_name?: string
          p_quarter_start: string
          p_ruleset_id: string
        }
        Returns: string
      }
      recompute_ratings: { Args: never; Returns: undefined }
      resettle_history: { Args: never; Returns: undefined }
      restore_game: {
        Args: { p_actor: string; p_game_id: string }
        Returns: undefined
      }
      ruleset_instant_win: { Args: { p_rules: Json }; Returns: boolean }
      ruleset_is_valid: { Args: { p_rules: Json }; Returns: boolean }
      ruleset_max_score: { Args: { p_rules: Json }; Returns: number }
      ruleset_prediction_enabled: { Args: { p_rules: Json }; Returns: boolean }
      ruleset_prediction_multiplier: {
        Args: { p_rules: Json }
        Returns: number
      }
      ruleset_score: {
        Args: { p_predicted?: number; p_rules: Json; p_tiles_open: number[] }
        Returns: number
      }
      ruleset_tiles: { Args: { p_rules: Json }; Returns: number }
      ruleset_validation_error: { Args: { p_rules: Json }; Returns: string }
      ruleset_win_sign: { Args: { p_rules: Json }; Returns: number }
      set_game_photo: {
        Args: { p_actor: string; p_game_id: string; p_path: string }
        Returns: undefined
      }
      set_turn_result: {
        Args: {
          p_actor: string
          p_game_id: string
          p_player_id: string
          p_predicted?: number
          p_score: number
          p_tiles_open: number[]
        }
        Returns: Json
      }
      skip_fika: {
        Args: { p_actor: string; p_duty_id: string }
        Returns: {
          cycle_id: string
          detail: Json
          drawn_at: string
          drawn_by: string | null
          id: string
          player_id: string
          reason: string
          skipped_at: string | null
          skipped_by: string | null
          week_start: string
        }
        SetofOptions: {
          from: "*"
          to: "fika_duties"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_game: {
        Args: { p_actor: string; p_player_ids: string[] }
        Returns: Json
      }
      stockholm_today: { Args: never; Returns: string }
      undo_game_change: {
        Args: { p_actor: string; p_audit_id: number }
        Returns: undefined
      }
    }
    Enums: {
      game_player_status: "pending" | "playing" | "done" | "dnp"
      game_status: "in_progress" | "finished" | "abandoned"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      game_player_status: ["pending", "playing", "done", "dnp"],
      game_status: ["in_progress", "finished", "abandoned"],
    },
  },
} as const

