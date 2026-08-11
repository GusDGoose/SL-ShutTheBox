-- Shut the Box — tables
-- Run this file first in the Supabase SQL Editor (or via CLI later).

-- Roster. One row per colleague.
create table players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  emoji      text not null default '🎲',
  song_url   text,                          -- raw YouTube URL as pasted; parsed at render time
  is_active  boolean not null default true, -- soft-delete: keeps history intact
  created_at timestamptz not null default now()
);

-- One physical game session.
create table games (
  id         uuid primary key default gen_random_uuid(),
  -- [concept: timezone-safe date] Vercel/Postgres run in UTC; this default pins
  -- "today" to the office wall clock so a 00:30 Stockholm game isn't logged yesterday.
  played_on  date not null default ((now() at time zone 'Europe/Stockholm')::date),
  max_tile   smallint not null default 9 check (max_tile in (9, 12)),
  created_at timestamptz not null default now()
);

-- One row per player per game. [concept: junction/bridge table]
create table game_players (
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references players(id),
  score      smallint not null check (score between 0 and 78), -- 78 = 1+2+...+12; app enforces 45 for 9-tile games
  tiles_open smallint[],          -- which tiles stayed up (board mode); null for manual entry
  turn_order smallint not null,
  primary key (game_id, player_id),
  unique (game_id, turn_order)
);

create index games_played_on_idx        on games (played_on);
create index game_players_player_id_idx on game_players (player_id);

-- [concept: RLS deny-all] Row Level Security enabled with NO policies = every
-- request through the anon/authenticated API keys is rejected. The service-role
-- key bypasses RLS, and it only ever lives on the server.
alter table players      enable row level security;
alter table games        enable row level security;
alter table game_players enable row level security;

-- [concept: GRANTs vs RLS] RLS filters rows; GRANTs gate table access entirely.
-- Newer Supabase images grant the API roles almost no table privileges by
-- default, so the server's service_role needs explicit DML grants (verified:
-- without these, even the service key gets "permission denied").
-- anon/authenticated deliberately get nothing — the app never uses them.
grant select, insert, update, delete
  on players, games, game_players
  to service_role;
