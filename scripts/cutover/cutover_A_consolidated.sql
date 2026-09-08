-- ===========================================================================
-- Shut the Box — Cutover A, as one transaction.
--
-- For the Supabase dashboard SQL editor (https://supabase.com/dashboard →
-- SQL Editor), which is the only route in from a network where the Postgres
-- ports are firewalled. GENERATED from supabase/migrations/ — do not
-- hand-edit; regenerate with scripts/cutover/build-consolidated.sh.
--
-- Contains migrations 0004 through 0014 plus the migration-history rows the
-- CLI would have written, so a later `supabase db push` from an unblocked
-- network sees these as already applied instead of trying to re-run them.
--
-- 0003 is RECORDED but NOT RUN, on purpose: it adds `check (max_tile = 12)`,
-- and v1's column default was 9, so any game saved without an explicit tile
-- count violates it. 0004 drops the column outright, so the end state is
-- identical either way.
--
-- It is one transaction: if anything fails, NOTHING is applied and the
-- database is exactly as it was. Re-running after a success will fail (the
-- objects already exist), which is also safe and means nothing happened.
-- ===========================================================================

begin;

-- The table the CLI keeps its migration history in. Created here because this
-- project's 0001/0002 were applied by pasting SQL, so it may not exist yet.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text not null primary key,
  statements text[],
  name       text
);


-- ======================= 0004_rulesets_seasons.sql =======================

-- Shut the Box — rulesets and quarterly seasons.
--
-- v1 had exactly one ruleset field (games.max_tile) and 0003 pinned it to a
-- constant, so there was nowhere to write the rules down or to vary them.
-- Rulesets are now first-class, assigned per season, and snapshotted on each
-- game so a historical score is always read under the rules it was played under.

-- ---------------------------------------------------------------------------
-- Ruleset helpers
--
-- [concept: function EXECUTE defaults to PUBLIC] Postgres grants EXECUTE on new
-- functions to PUBLIC. Once the publishable key reaches browsers (Realtime), an
-- unrevoked function would be callable by anyone through PostgREST, so every
-- function here is explicitly revoked and re-granted to service_role at the
-- bottom of this file.
-- ---------------------------------------------------------------------------

create or replace function ruleset_tiles(p_rules jsonb)
returns smallint language sql immutable as $fn$
  select (p_rules->>'tiles')::smallint
$fn$;

-- +1 when the lowest score wins, -1 when the highest does, so every ordering in
-- the stats views is just `order by score * ruleset_win_sign(rules)`.
create or replace function ruleset_win_sign(p_rules jsonb)
returns smallint language sql immutable as $fn$
  select case when p_rules->>'win' = 'highest' then -1 else 1 end::smallint
$fn$;

create or replace function ruleset_instant_win(p_rules jsonb)
returns boolean language sql immutable as $fn$
  select coalesce((p_rules->'shut_box'->>'instant_win')::boolean, true)
$fn$;

create or replace function ruleset_prediction_enabled(p_rules jsonb)
returns boolean language sql immutable as $fn$
  select coalesce((p_rules->'prediction'->>'enabled')::boolean, false)
$fn$;

create or replace function ruleset_prediction_multiplier(p_rules jsonb)
returns integer language sql immutable as $fn$
  select coalesce((p_rules->'prediction'->>'multiplier')::integer, 1)
$fn$;

-- The score for a finished turn.
--
-- p_predicted is only consulted by rulesets with prediction enabled ("call your
-- shot"), where the miss is added on as an ABSOLUTE offset. A signed offset
-- would let a player call 78, score 5 and finish on -68.
create or replace function ruleset_score(
  p_rules      jsonb,
  p_tiles_open smallint[],
  p_predicted  integer default null
) returns integer language plpgsql immutable as $fn$
declare
  v_base integer;
begin
  if p_tiles_open is null then
    return null;
  end if;

  if p_rules->'scoring'->>'kind' = 'concat_open' then
    -- "Digital" scoring: the tiles left standing read as one number, so 3 and
    -- 5 up is 35 rather than 8.
    select coalesce(string_agg(t::text, '' order by t), '0')::integer
      into v_base
      from unnest(p_tiles_open) as t;
  else
    -- Sum of the open tiles, after any per-tile modifier.
    select coalesce(sum(
             t * coalesce((m.md->>'multiplier')::integer, 1)
               + coalesce((m.md->>'add')::integer, 0)
           ), 0)::integer
      into v_base
      from unnest(p_tiles_open) as t
      left join lateral (
        select md
        from jsonb_array_elements(coalesce(p_rules->'modifiers', '[]'::jsonb)) md
        where (md->>'tile')::integer = t
        limit 1
      ) m on true;
  end if;

  if ruleset_prediction_enabled(p_rules) and p_predicted is not null then
    return v_base
         + ruleset_prediction_multiplier(p_rules) * abs(v_base - p_predicted);
  end if;

  return v_base;
end
$fn$;

-- The worst possible score, which is what the score check constraint allows.
-- With prediction on, the ceiling is (1 + multiplier)x the plain ceiling: call
-- zero, then leave every tile standing.
create or replace function ruleset_max_score(p_rules jsonb)
returns integer language plpgsql immutable as $fn$
declare
  v_all  smallint[];
  v_base integer;
begin
  select array_agg(g::smallint order by g) into v_all
    from generate_series(1, ruleset_tiles(p_rules)) g;
  v_base := ruleset_score(p_rules, v_all);
  if ruleset_prediction_enabled(p_rules) then
    return v_base * (1 + ruleset_prediction_multiplier(p_rules));
  end if;
  return v_base;
end
$fn$;

-- Returns null when the ruleset is well formed, otherwise the reason it isn't.
-- A boolean check constraint alone could only ever report "violated", so the
-- reason lives here where it can be called directly while authoring a ruleset.
create or replace function ruleset_validation_error(p_rules jsonb)
returns text language plpgsql immutable as $fn$
declare
  v_tiles   integer;
  v_kind    text;
  v_mods    jsonb;
  v_mod     jsonb;
  v_pred_on boolean;
  v_stop_on boolean;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    return 'rules must be a JSON object';
  end if;
  if coalesce((p_rules->>'v')::integer, 0) <> 1 then
    return 'unsupported rules version (expected v = 1)';
  end if;

  v_tiles := (p_rules->>'tiles')::integer;
  if v_tiles is null or v_tiles not in (9, 10, 12) then
    return 'tiles must be 9, 10 or 12';
  end if;

  v_kind := p_rules->'scoring'->>'kind';
  if v_kind is null or v_kind not in ('sum_open', 'concat_open') then
    return 'scoring.kind must be sum_open or concat_open';
  end if;

  if coalesce(p_rules->>'win', '') not in ('lowest', 'highest') then
    return 'win must be lowest or highest';
  end if;

  if jsonb_typeof(p_rules->'shut_box'->'instant_win') <> 'boolean' then
    return 'shut_box.instant_win must be a boolean';
  end if;

  if coalesce((p_rules->'dice'->>'count')::integer, 0) < 1 then
    return 'dice.count must be at least 1';
  end if;
  if coalesce(p_rules->'dice'->'one_die_rule'->>'kind', '')
     not in ('never', 'always_allowed', 'when_all_above_shut') then
    return 'dice.one_die_rule.kind is not recognised';
  end if;
  if p_rules->'dice'->'one_die_rule'->>'kind' = 'when_all_above_shut'
     and coalesce((p_rules->'dice'->'one_die_rule'->>'threshold')::integer, 0) < 1 then
    return 'dice.one_die_rule.threshold must be set for when_all_above_shut';
  end if;

  if coalesce(p_rules->>'ties', '') not in ('share', 'earliest_turn', 'replay') then
    return 'ties must be share, earliest_turn or replay';
  end if;

  v_mods := coalesce(p_rules->'modifiers', '[]'::jsonb);
  if jsonb_typeof(v_mods) <> 'array' then
    return 'modifiers must be an array';
  end if;
  for v_mod in select value from jsonb_array_elements(v_mods) loop
    if coalesce(v_mod->>'kind', '') not in ('golden_tile', 'penalty_tile') then
      return 'modifier.kind must be golden_tile or penalty_tile';
    end if;
    if coalesce((v_mod->>'tile')::integer, 0) not between 1 and v_tiles then
      return format('modifier tile must be between 1 and %s', v_tiles);
    end if;
    if v_mod->>'kind' = 'golden_tile'
       and coalesce((v_mod->>'multiplier')::integer, 0) < 2 then
      return 'golden_tile needs a multiplier of at least 2';
    end if;
    if v_mod->>'kind' = 'penalty_tile'
       and coalesce((v_mod->>'add')::integer, 0) = 0 then
      return 'penalty_tile needs a non-zero add';
    end if;
  end loop;

  -- Concatenated scoring only makes sense on a single-digit board, and a
  -- per-tile multiplier means nothing once tiles are digits in a number.
  if v_kind = 'concat_open' then
    if v_tiles > 9 then
      return 'concat_open scoring needs 9 tiles or fewer';
    end if;
    if jsonb_array_length(v_mods) > 0 then
      return 'concat_open scoring cannot be combined with modifiers';
    end if;
  end if;

  v_pred_on := coalesce((p_rules->'prediction'->>'enabled')::boolean, false);
  v_stop_on := coalesce((p_rules->'voluntary_stop'->>'enabled')::boolean, false);
  if v_pred_on then
    if coalesce(p_rules->'prediction'->>'penalty', '') <> 'abs_offset' then
      return 'prediction.penalty must be abs_offset (a signed offset is exploitable)';
    end if;
    if coalesce((p_rules->'prediction'->>'multiplier')::integer, 0) < 1 then
      return 'prediction.multiplier must be at least 1';
    end if;
    if jsonb_typeof(p_rules->'prediction'->'sealed') <> 'boolean' then
      return 'prediction.sealed must be a boolean';
    end if;
    -- With both enabled a player simply flips until the open tiles equal their
    -- call and stops: the offset is always zero and the mechanic does nothing.
    -- Doubling the offset is the only combination that keeps a cost on bailing.
    if v_stop_on and ruleset_prediction_multiplier(p_rules) < 2 then
      return 'prediction with voluntary_stop needs prediction.multiplier >= 2';
    end if;
  end if;

  return null;
end
$fn$;

create or replace function ruleset_is_valid(p_rules jsonb)
returns boolean language sql immutable as $fn$
  select ruleset_validation_error(p_rules) is null
$fn$;

-- ---------------------------------------------------------------------------
-- Rulesets
-- ---------------------------------------------------------------------------

-- [concept: typed JSONB] One column holds a whole rule set, validated by
-- ruleset_validation_error above and mirrored by a TypeScript twin in
-- src/lib/rules.ts. New variants are rows, not migrations.
create table rulesets (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',   -- markdown, rendered on /rules
  rules       jsonb not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint rulesets_rules_valid check (ruleset_is_valid(rules))
);

insert into rulesets (slug, name, is_active, description, rules) values
(
  'vanilla-12',
  'Vanilla',
  true,
  'The house game. Twelve tiles, two dice, lowest score wins the day. You may switch to one die once every tile above 6 is shut — before that a single die could never reach them.',
  '{
    "v": 1,
    "tiles": 12,
    "scoring": { "kind": "sum_open" },
    "win": "lowest",
    "shut_box": { "instant_win": true },
    "dice": { "count": 2, "one_die_rule": { "kind": "when_all_above_shut", "threshold": 6 } },
    "modifiers": [],
    "ties": "share",
    "prediction": { "enabled": false, "sealed": true, "penalty": "abs_offset", "multiplier": 1 },
    "voluntary_stop": { "enabled": false }
  }'
),
(
  'call-your-shot-12',
  'Call Your Shot',
  false,
  'Vanilla, but everyone calls their score before rolling and the miss is added on. Sealed calls, and no stopping when you feel like it — that would let you flip until the board matched your call and never miss.',
  '{
    "v": 1,
    "tiles": 12,
    "scoring": { "kind": "sum_open" },
    "win": "lowest",
    "shut_box": { "instant_win": true },
    "dice": { "count": 2, "one_die_rule": { "kind": "when_all_above_shut", "threshold": 6 } },
    "modifiers": [],
    "ties": "share",
    "prediction": { "enabled": true, "sealed": true, "penalty": "abs_offset", "multiplier": 1 },
    "voluntary_stop": { "enabled": false }
  }'
),
(
  'digital-9',
  'Digital Nine',
  false,
  'Nine tiles, and the tiles left standing read as a number rather than a sum: 3 and 5 up is 35, not 8. Suddenly the low tiles are the dangerous ones.',
  '{
    "v": 1,
    "tiles": 9,
    "scoring": { "kind": "concat_open" },
    "win": "lowest",
    "shut_box": { "instant_win": true },
    "dice": { "count": 2, "one_die_rule": { "kind": "when_all_above_shut", "threshold": 6 } },
    "modifiers": [],
    "ties": "share",
    "prediction": { "enabled": false, "sealed": true, "penalty": "abs_offset", "multiplier": 1 },
    "voluntary_stop": { "enabled": false }
  }'
);

create or replace function default_ruleset_id()
returns uuid language sql stable as $fn$
  select id from rulesets where slug = 'vanilla-12'
$fn$;

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------

-- [concept: timezone-safe date] The SQL twin of stockholmToday() in
-- src/lib/dates.ts, and the same rule as the games.played_on default.
create or replace function stockholm_today()
returns date language sql stable as $fn$
  select (now() at time zone 'Europe/Stockholm')::date
$fn$;

create table seasons (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,          -- '2026-Q3'
  number     integer not null unique,       -- display only: "Season 3"
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,
  ruleset_id uuid not null references rulesets(id),
  created_at timestamptz not null default now(),
  constraint seasons_dates_ordered check (ends_on >= starts_on),
  -- No two seasons can cover the same day, so every game maps to exactly one.
  constraint seasons_no_overlap
    exclude using gist ((daterange(starts_on, ends_on, '[]')) with &&)
);

-- Creates the quarter containing p_date if it doesn't exist yet, and returns
-- it, so seasons appear as they are played rather than needing to be seeded.
--
-- Note: `number` is assigned in creation order. A game backdated into a quarter
-- nobody has played yet takes the next number, which can read out of sequence;
-- slug is the canonical identifier and display order comes from starts_on.
create or replace function ensure_season(p_date date)
returns uuid language plpgsql volatile as $fn$
declare
  v_start date := date_trunc('quarter', p_date::timestamp)::date;
  v_end   date := (date_trunc('quarter', p_date::timestamp)
                   + interval '3 months' - interval '1 day')::date;
  v_slug  text := to_char(v_start, 'YYYY') || '-Q'
                  || extract(quarter from v_start)::integer::text;
  v_id    uuid;
begin
  select id into v_id from seasons where slug = v_slug;
  if v_id is not null then
    return v_id;
  end if;

  insert into seasons (slug, number, name, starts_on, ends_on, ruleset_id)
  select v_slug,
         coalesce(max(number), 0) + 1,
         'Season ' || (coalesce(max(number), 0) + 1)::text,
         v_start,
         v_end,
         default_ruleset_id()
    from seasons
  on conflict (slug) do nothing
  returning id into v_id;

  if v_id is null then      -- lost a race; the other transaction created it
    select id into v_id from seasons where slug = v_slug;
  end if;
  return v_id;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Point games at a ruleset and a season, and retire max_tile
-- ---------------------------------------------------------------------------

alter table games
  add column ruleset_id uuid references rulesets(id),
  add column season_id  uuid references seasons(id);

-- Every stats view selects games.max_tile, so they have to go before the column
-- can. 0007 recreates all of them, ruleset-aware.
drop view if exists monthly_champions;
drop view if exists player_streaks;
drop view if exists player_stats;
drop view if exists daily_winners;
drop view if exists game_results;

-- `if exists` so this converges whether or not 0003 was applied by hand.
alter table games drop constraint if exists games_max_tile_check;

-- Backfill: every existing game was vanilla, played in whatever quarter it fell.
update games set ruleset_id = default_ruleset_id() where ruleset_id is null;

do $backfill$
declare
  v_quarter date;
begin
  -- Oldest quarter first, so season numbers run in chronological order.
  for v_quarter in
    select distinct date_trunc('quarter', played_on::timestamp)::date
      from games
     order by 1
  loop
    perform ensure_season(v_quarter);
  end loop;
end
$backfill$;

update games g
   set season_id = s.id
  from seasons s
 where g.season_id is null
   and g.played_on between s.starts_on and s.ends_on;

alter table games
  alter column ruleset_id set not null,
  alter column ruleset_id set default default_ruleset_id(),
  alter column season_id  set not null,
  drop column max_tile;

create index games_season_id_idx on games (season_id);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on rulesets, seasons to service_role;

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'ruleset_tiles(jsonb)',
    'ruleset_win_sign(jsonb)',
    'ruleset_instant_win(jsonb)',
    'ruleset_prediction_enabled(jsonb)',
    'ruleset_prediction_multiplier(jsonb)',
    'ruleset_score(jsonb, smallint[], integer)',
    'ruleset_max_score(jsonb)',
    'ruleset_validation_error(jsonb)',
    'ruleset_is_valid(jsonb)',
    'default_ruleset_id()',
    'stockholm_today()',
    'ensure_season(date)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;


-- ======================= 0005_game_lifecycle.sql =======================

-- Shut the Box — game lifecycle, live board state, and score invariants.
--
-- In v1 a game only existed once it was finished: the in-progress game lived in
-- one phone's React state, so refreshing lost it and nobody else could see it.
-- Games now have a status and the current board lives in the database, which is
-- what makes live spectating and resuming possible.

create type game_status        as enum ('in_progress', 'finished', 'abandoned');
create type game_player_status as enum ('pending', 'playing', 'done', 'dnp');

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------

alter table games
  add column status                game_status not null default 'in_progress',
  add column deleted_at            timestamptz,
  add column scorekeeper_player_id uuid references players(id),
  add column created_by            uuid references players(id),
  add column started_at            timestamptz not null default now(),
  add column finished_at           timestamptz,
  add column updated_at            timestamptz not null default now(),
  add column photo_path            text,
  add column photo_by              uuid references players(id),
  add column photo_at              timestamptz;

-- Backfill: every game that already exists was played to the end.
update games set status = 'finished', finished_at = created_at;

alter table games
  add constraint games_finished_has_time
    check (status <> 'finished' or finished_at is not null);

-- ---------------------------------------------------------------------------
-- game_players
-- ---------------------------------------------------------------------------

-- 'pending' -> 'playing' -> 'done', or 'dnp' for a player who was at the table
-- but never got a turn because someone shut the box. v1 simply never wrote a
-- row for them, which made a colleague who was present statistically invisible.
alter table game_players
  -- Concatenated scoring and prediction offsets both exceed smallint.
  alter column score type integer,
  alter column score drop not null,
  add column status          game_player_status not null default 'done',
  add column predicted_score integer;

alter table game_players
  drop constraint if exists game_players_score_check;

alter table game_players
  alter column status set default 'pending',
  add constraint game_players_score_nonneg
    check (score is null or score >= 0),
  add constraint game_players_done_has_score
    check ((status = 'done') = (score is not null)),
  add constraint game_players_tiles_only_when_done
    check (tiles_open is null or status = 'done'),
  add constraint game_players_prediction_nonneg
    check (predicted_score is null or predicted_score >= 0);

-- ---------------------------------------------------------------------------
-- The live board
-- ---------------------------------------------------------------------------

-- [concept: heartbeat row] Exactly one row per in-progress game, holding whose
-- turn it is and which tiles are currently down. Every live RPC touches this
-- row exactly once, so the broadcast trigger in 0011 fires exactly once per
-- action, and `version` lets a client drop a broadcast it has already seen.
create table live_turns (
  game_id    uuid primary key references games(id) on delete cascade,
  player_id  uuid not null references players(id),
  tiles_down smallint[] not null default '{}',
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- One live game per scorekeeper, which is what stops two phones both starting
-- "today's game" — the duplicate-game race in v1.
create unique index games_one_live_per_scorekeeper
  on games (scorekeeper_player_id)
  where status = 'in_progress';

create index games_in_progress_idx on games (played_on)
  where status = 'in_progress';
create index games_valid_idx on games (played_on)
  where status = 'finished' and deleted_at is null;
create index game_players_game_status_idx on game_players (game_id, status);

-- ---------------------------------------------------------------------------
-- Invariants
-- ---------------------------------------------------------------------------

-- [concept: invariant trigger] v1 enforced the score/board relationship only in
-- TypeScript, so a direct SQL insert (or a future client) could store a score
-- that did not match its tiles. Every write path is now checked against the
-- game's own ruleset, in the database.
create or replace function game_players_validate()
returns trigger language plpgsql as $fn$
declare
  v_rules    jsonb;
  v_tiles    smallint;
  v_expected integer;
begin
  select r.rules into v_rules
    from games g
    join rulesets r on r.id = g.ruleset_id
   where g.id = new.game_id;

  if v_rules is null then
    raise exception 'game % has no ruleset', new.game_id using errcode = 'STB02';
  end if;

  if new.status <> 'done' then
    return new;
  end if;

  v_tiles := ruleset_tiles(v_rules);

  if ruleset_prediction_enabled(v_rules) and new.predicted_score is null then
    raise exception 'this ruleset requires a called score before the turn'
      using errcode = 'STB02';
  end if;

  if new.tiles_open is not null then
    if exists (
      select 1 from unnest(new.tiles_open) t
       where t < 1 or t > v_tiles
    ) then
      raise exception 'tile out of range for a %-tile board', v_tiles
        using errcode = 'STB02';
    end if;
    if (select count(*) from unnest(new.tiles_open) t)
       <> (select count(distinct t) from unnest(new.tiles_open) t) then
      raise exception 'the same tile is listed twice' using errcode = 'STB02';
    end if;

    v_expected := ruleset_score(v_rules, new.tiles_open, new.predicted_score);
    if new.score <> v_expected then
      raise exception 'score % does not match the board (expected %)',
        new.score, v_expected using errcode = 'STB02';
    end if;
  end if;

  if new.score < 0 or new.score > ruleset_max_score(v_rules) then
    raise exception 'score % is outside 0..% for this ruleset',
      new.score, ruleset_max_score(v_rules) using errcode = 'STB02';
  end if;

  return new;
end
$fn$;

create trigger game_players_validate
  before insert or update on game_players
  for each row execute function game_players_validate();

create or replace function touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$;

create trigger games_touch before update on games
  for each row execute function touch_updated_at();
create trigger live_turns_touch before update on live_turns
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

alter table live_turns enable row level security;
grant select, insert, update, delete on live_turns to service_role;

revoke execute on function game_players_validate() from public, anon, authenticated;
revoke execute on function touch_updated_at() from public, anon, authenticated;
grant execute on function game_players_validate() to service_role;
grant execute on function touch_updated_at() to service_role;


-- ======================= 0006_audit_identity_audio.sql =======================

-- Shut the Box — audit trail, PIN rate limiting, and song clip settings.
--
-- Correcting a v1 game meant hand-running SQL in the Supabase dashboard, with
-- no record of who changed what. Editing moves into the app in 0010, so the
-- record of it has to exist first.

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create table audit_log (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  -- Null means the system did it: a cron job, or a migration.
  actor_player_id uuid references players(id),
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  note            text
);

comment on column audit_log.action is
  'game.start|finish|edit|delete|restore|abandon|claim_scorekeeper|photo|undo|manual, player.create|update|toggle, fika.draw|skip, season.plan';

create index audit_log_entity_idx on audit_log (entity, entity_id, id desc);
create index audit_log_at_idx on audit_log (at desc);

-- The whole state of a game in one value, so an edit can record exactly what it
-- changed and undo_game_change() in 0010 can put it back.
create or replace function game_snapshot(p_game_id uuid)
returns jsonb language sql stable as $fn$
  select jsonb_build_object(
    'game', to_jsonb(g) - 'created_at' - 'updated_at',
    'players', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'player_id',       gp.player_id,
                'turn_order',      gp.turn_order,
                'status',          gp.status,
                'score',           gp.score,
                'tiles_open',      gp.tiles_open,
                'predicted_score', gp.predicted_score
              ) order by gp.turn_order)
         from game_players gp
        where gp.game_id = g.id),
      '[]'::jsonb)
  )
  from games g
  where g.id = p_game_id
$fn$;

-- ---------------------------------------------------------------------------
-- PIN attempt throttling
-- ---------------------------------------------------------------------------

-- v1 compared the PIN with a plain !== and had no lockout at all, so the shared
-- office passcode could be brute forced at request speed.
create table pin_attempts (
  ip_hash      text primary key,
  fails        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- Called with no p_success to ask "may this address try?", with false after a
-- wrong PIN, and with true after a correct one (which clears the record).
-- Backoff starts after 5 failures and doubles to a one hour cap.
create or replace function pin_gate(
  p_ip_hash text,
  p_success  boolean default null
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql volatile as $fn$
declare
  v_fails  integer;
  v_locked timestamptz;
begin
  if p_success is true then
    delete from pin_attempts where ip_hash = p_ip_hash;
    return query select true, 0;
    return;
  end if;

  if p_success is false then
    insert into pin_attempts as pa (ip_hash, fails, updated_at)
    values (p_ip_hash, 1, now())
    on conflict (ip_hash) do update
      set fails      = pa.fails + 1,
          updated_at = now()
    returning pa.fails into v_fails;

    if v_fails >= 5 then
      update pin_attempts
         set locked_until = now()
             + least(make_interval(secs => 60 * power(2, v_fails - 5)::double precision),
                     interval '1 hour')
       where ip_hash = p_ip_hash;
    end if;
  end if;

  select pa.fails, pa.locked_until into v_fails, v_locked
    from pin_attempts pa where pa.ip_hash = p_ip_hash;

  if v_locked is null or v_locked <= now() then
    return query select true, 0;
  else
    return query select false,
      ceil(extract(epoch from v_locked - now()))::integer;
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Victory song clips
-- ---------------------------------------------------------------------------

-- v1 played each winner's whole video from the start. A clip has a start and an
-- end so a walk-up can be ten seconds of the good bit, with a fade instead of a
-- hard cut, and an optional loop.
--
-- song_clip_path wins over song_url when set: an uploaded file can be trimmed
-- and faded exactly, which the YouTube player cannot promise on iOS.
alter table players
  add column song_start_seconds integer not null default 0,
  add column song_end_seconds   integer,
  add column song_fade_ms       integer not null default 1500,
  add column song_loop          boolean not null default false,
  add column song_clip_path     text,
  add column updated_at         timestamptz not null default now();

alter table players
  add constraint players_song_start_sane
    check (song_start_seconds between 0 and 36000),
  add constraint players_song_end_after_start
    check (song_end_seconds is null or song_end_seconds > song_start_seconds),
  add constraint players_song_fade_sane
    check (song_fade_ms between 0 and 10000);

create trigger players_touch before update on players
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

alter table audit_log enable row level security;
alter table pin_attempts enable row level security;

grant select, insert on audit_log to service_role;
grant select, insert, update, delete on pin_attempts to service_role;

revoke execute on function game_snapshot(uuid) from public, anon, authenticated;
revoke execute on function pin_gate(text, boolean) from public, anon, authenticated;
grant execute on function game_snapshot(uuid) to service_role;
grant execute on function pin_gate(text, boolean) to service_role;


-- ======================= 0007_views.sql =======================

-- Shut the Box — the stats views, rebuilt.
--
-- These are the app's brain: every number on the stats pages is a `select *`
-- from here, so nothing is aggregated twice in TypeScript and drifts. 0004 had
-- to drop the v1 versions to retire games.max_tile; this recreates them, now
-- ruleset-aware (win direction, tie policy, scoring) and aware that a game can
-- be in progress, abandoned or soft-deleted.
--
-- IMPORTANT: every view carries `with (security_invoker = true)`. A Postgres
-- view otherwise runs with its OWNER's privileges, silently bypassing the base
-- tables' RLS and leaking data through Supabase's REST API.

-- ---------------------------------------------------------------------------
-- The one definition of "a real game"
-- ---------------------------------------------------------------------------

-- [concept: base view] Every stats view reads through this, so "finished, not
-- deleted, somebody actually played" is defined once. It is also what keeps a
-- soft-deleted game out of the streak day index: in v1 an orphan games row
-- silently reset every player's current streak.
create view games_valid with (security_invoker = true) as
select g.id,
       g.played_on,
       g.season_id,
       g.ruleset_id,
       g.finished_at,
       g.photo_path,
       r.rules
  from games g
  join rulesets r on r.id = g.ruleset_id
 where g.status = 'finished'
   and g.deleted_at is null
   and exists (
     select 1 from game_players gp
      where gp.game_id = g.id and gp.status = 'done'
   );

-- ---------------------------------------------------------------------------
-- Per-player, per-game results
-- ---------------------------------------------------------------------------

-- [concept: window function] The winner is DERIVED, never stored, so ties are
-- shared wins by construction and correcting a score re-crowns automatically.
-- Ranking multiplies by ruleset_win_sign so a highest-wins season needs no
-- special case, and `ties: earliest_turn` breaks a tie by who played first.
create view game_results with (security_invoker = true) as
with ranked as (
  select gp.game_id,
         g.played_on,
         g.season_id,
         g.ruleset_id,
         gp.player_id,
         gp.turn_order,
         gp.score,
         gp.tiles_open,
         gp.predicted_score,
         count(*) over (partition by gp.game_id) as participants,
         case
           when g.rules->>'ties' = 'earliest_turn' then
             row_number() over (
               partition by gp.game_id
               order by gp.score * ruleset_win_sign(g.rules), gp.turn_order
             )
           else
             rank() over (
               partition by gp.game_id
               order by gp.score * ruleset_win_sign(g.rules)
             )
         end as finish_position
    from game_players gp
    join games_valid g on g.id = gp.game_id
   where gp.status = 'done'
)
select game_id,
       played_on,
       season_id,
       ruleset_id,
       player_id,
       turn_order,
       score,
       tiles_open,
       predicted_score,
       participants,
       finish_position,
       finish_position = 1 as is_winner,
       -- The physical fact: nothing left standing. A typed score can only be
       -- inferred from a zero.
       coalesce(cardinality(tiles_open) = 0, score = 0) as is_shut_box
  from ranked;

-- Winning any game on a day wins the day; several people can share it.
create view daily_winners with (security_invoker = true) as
select distinct played_on, player_id
  from game_results
 where is_winner;

-- ---------------------------------------------------------------------------
-- Player aggregates
-- ---------------------------------------------------------------------------

create view player_stats with (security_invoker = true) as
select p.id                                                  as player_id,
       p.name,
       p.emoji,
       p.is_active,
       count(gr.game_id)::int                                 as games_played,
       count(*) filter (where gr.is_winner)::int              as wins,
       round(100.0 * count(*) filter (where gr.is_winner)
             / nullif(count(gr.game_id), 0), 1)              as win_pct,
       round(avg(gr.score), 2)                                as avg_score,
       min(gr.score)                                          as best_score,
       max(gr.score)                                          as worst_score,
       round(avg(gr.finish_position), 2)                      as avg_finish,
       count(*) filter (where gr.is_shut_box)::int            as shut_boxes,
       max(gr.played_on)                                      as last_played_on,
       -- Present but never got a turn because someone shut the box. Counted
       -- separately: it is not a game played, and it is not nothing either.
       (select count(*)
          from game_players x
          join games_valid v on v.id = x.game_id
         where x.player_id = p.id and x.status = 'dnp')::int   as dnp_count
  from players p
  left join game_results gr on gr.player_id = p.id
 group by p.id, p.name, p.emoji, p.is_active;

-- [concept: gaps-and-islands] Number the days that were actually played 1..N.
-- Within an unbroken run of wins, (day_no - row_number()) is constant, so
-- grouping by that difference isolates each streak. Counting played days rather
-- than calendar days is what stops a weekend breaking a streak.
create view player_streaks with (security_invoker = true) as
with day_index as (
  select played_on,
         row_number() over (order by played_on) as day_no
    from (select distinct played_on from games_valid) d
),
wins as (
  select dw.player_id, di.day_no
    from daily_winners dw
    join day_index di using (played_on)
),
islands as (
  select player_id,
         day_no,
         day_no - row_number() over (partition by player_id order by day_no)
           as island_id
    from wins
),
streaks as (
  select player_id, count(*)::int as length, max(day_no) as last_day_no
    from islands
   group by player_id, island_id
)
select p.id                       as player_id,
       p.name,
       p.emoji,
       coalesce(max(s.length), 0) as best_streak,
       -- A current streak only counts if they won the most recent played day.
       coalesce(max(s.length) filter (
         where s.last_day_no = (select max(day_no) from day_index)
       ), 0)                      as current_streak
  from players p
  left join streaks s on s.player_id = p.id
 group by p.id, p.name, p.emoji;

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------

-- rank(), not row_number(), so a tied month has joint champions.
create view monthly_champions with (security_invoker = true) as
with day_wins as (
  select date_trunc('month', played_on)::date as month,
         player_id,
         count(*)::int as day_wins
    from daily_winners
   group by 1, 2
),
ranked as (
  select *, rank() over (partition by month order by day_wins desc) as rnk
    from day_wins
)
select r.month, r.player_id, p.name, p.emoji, r.day_wins
  from ranked r
  join players p on p.id = r.player_id
 where r.rnk = 1;

create view season_standings with (security_invoker = true) as
select s.id                                                   as season_id,
       s.slug                                                 as season_slug,
       s.number                                               as season_number,
       gr.player_id,
       p.name,
       p.emoji,
       count(distinct gr.played_on)
         filter (where gr.is_winner)::int                      as day_wins,
       count(*) filter (where gr.is_winner)::int               as wins,
       count(*)::int                                           as games_played,
       round(avg(gr.score), 2)                                 as avg_score,
       min(gr.score)                                           as best_score,
       round(avg(gr.finish_position), 2)                       as avg_finish,
       count(*) filter (where gr.is_shut_box)::int             as shut_boxes,
       rank() over (
         partition by s.id
         order by count(distinct gr.played_on) filter (where gr.is_winner) desc,
                  count(*) filter (where gr.is_winner) desc,
                  avg(gr.finish_position) asc
       )                                                       as rnk
  from seasons s
  join game_results gr on gr.season_id = s.id
  join players p on p.id = gr.player_id
 group by s.id, s.slug, s.number, gr.player_id, p.name, p.emoji;

-- Only closed seasons have champions; the current one is still being played.
create view season_champions with (security_invoker = true) as
select ss.*, s.name as season_name, s.starts_on, s.ends_on
  from season_standings ss
  join seasons s on s.id = ss.season_id
 where ss.rnk = 1
   and s.ends_on < stockholm_today();

-- ---------------------------------------------------------------------------
-- Head to head
-- ---------------------------------------------------------------------------

-- One row per ordered pair, so a player's record against everyone is a simple
-- `where a_id = me`.
create view head_to_head with (security_invoker = true) as
select a.player_id                                                as a_id,
       b.player_id                                                as b_id,
       count(*)::int                                              as meetings,
       count(*) filter (where a.finish_position < b.finish_position)::int as a_wins,
       count(*) filter (where a.finish_position > b.finish_position)::int as b_wins,
       count(*) filter (where a.finish_position = b.finish_position)::int as ties,
       max(a.played_on)                                           as last_met
  from game_results a
  join game_results b
    on b.game_id = a.game_id
   and b.player_id <> a.player_id
 group by a.player_id, b.player_id;

-- The opponent who beats you most often, over enough games to mean something.
create view player_nemesis with (security_invoker = true) as
select distinct on (h.a_id)
       h.a_id     as player_id,
       h.b_id     as nemesis_id,
       p.name     as nemesis_name,
       p.emoji    as nemesis_emoji,
       h.meetings,
       h.a_wins,
       h.b_wins,
       round(100.0 * h.b_wins / h.meetings, 1) as nemesis_win_pct
  from head_to_head h
  join players p on p.id = h.b_id
 where h.meetings >= 5
 order by h.a_id, h.b_wins::numeric / h.meetings desc, h.meetings desc;

-- ---------------------------------------------------------------------------
-- Distributions and trends
-- ---------------------------------------------------------------------------

create view score_distribution with (security_invoker = true) as
select player_id, ruleset_id, score, count(*)::int as n
  from game_results
 group by 1, 2, 3;

create view player_trends with (security_invoker = true) as
select player_id,
       date_trunc('month', played_on)::date       as month,
       count(*)::int                              as games,
       round(avg(score), 2)                       as avg_score,
       min(score)                                 as best_score,
       count(*) filter (where is_winner)::int     as wins
  from game_results
 group by 1, 2;

-- ---------------------------------------------------------------------------
-- Live games
-- ---------------------------------------------------------------------------

create view live_games with (security_invoker = true) as
select g.id,
       g.played_on,
       g.season_id,
       g.ruleset_id,
       g.scorekeeper_player_id,
       g.created_by,
       g.started_at,
       g.updated_at,
       lt.player_id  as current_player_id,
       lt.tiles_down,
       lt.version
  from games g
  left join live_turns lt on lt.game_id = g.id
 where g.status = 'in_progress'
   and g.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Privileges — views need their own grant, separate from the base tables
-- ---------------------------------------------------------------------------

grant select on
  games_valid,
  game_results,
  daily_winners,
  player_stats,
  player_streaks,
  monthly_champions,
  season_standings,
  season_champions,
  head_to_head,
  player_nemesis,
  score_distribution,
  player_trends,
  live_games
to service_role;


-- ======================= 0008_ratings.sql =======================

-- Shut the Box — a skill rating.
--
-- Wins alone flatter whoever plays most. A rating answers "who is actually
-- good", and it has to survive the game history being corrected: editing
-- yesterday's score, backdating a forgotten Friday or deleting a game all
-- change who beat whom, so ratings are never accumulated in place — they are
-- replayed from the games every time.

create table rating_events (
  game_id       uuid not null references games(id) on delete cascade,
  player_id     uuid not null references players(id),
  played_on     date not null,
  seq           integer not null,          -- global game order used by the replay
  rating_before numeric(8,2) not null,
  rating_after  numeric(8,2) not null,
  delta         numeric(8,2) not null,
  k             smallint not null,
  opponents     smallint not null,
  primary key (game_id, player_id)
);

create index rating_events_player_idx on rating_events (player_id, seq);
create index rating_events_played_on_idx on rating_events (played_on);

alter table rating_events enable row level security;
grant select, insert, delete on rating_events to service_role;

comment on table rating_events is
  'One row per player per rated game. Derived: rebuilt entirely by recompute_ratings().';

-- ---------------------------------------------------------------------------
-- The replay
-- ---------------------------------------------------------------------------

-- [concept: full replay] Every finish, edit, backdate or delete rebuilds the
-- whole history rather than adjusting the tail. For an office game — a few
-- hundred games and a dozen players — that is milliseconds, and it removes a
-- whole category of bug: there is no such thing as a rating that drifted out of
-- step with the games it came from.
--
-- Pairwise Elo: each game is treated as a mini tournament where you play
-- everyone at the table. K is divided by the number of opponents so a six-player
-- game does not move ratings six times as much as a two-player one.
create or replace function recompute_ratings()
returns void language plpgsql volatile as $fn$
declare
  v_start   constant numeric := 1000;
  v_k_new   constant integer := 64;   -- while a player is still being placed
  v_k_settled constant integer := 32;
  v_provisional constant integer := 10;

  v_state   jsonb := '{}'::jsonb;     -- player_id -> { r: rating, n: games }
  v_game    record;
  v_seq     integer := 0;
  v_players uuid[];
  v_places  integer[];
  v_m       integer;
  i         integer;
  j         integer;
  v_id      uuid;
  v_r_i     numeric;
  v_r_j     numeric;
  v_n_i     integer;
  v_k       integer;
  v_score   numeric;
  v_expected numeric;
  v_sum     numeric;
  v_delta   numeric;
begin
  delete from rating_events;

  for v_game in
    select g.id, g.played_on
      from games_valid g
     order by g.played_on, g.finished_at, g.id
  loop
    -- finish_position already accounts for the ruleset's win direction and tie
    -- policy, so the rating never needs to know which way round the game runs.
    select array_agg(gr.player_id order by gr.player_id),
           array_agg(gr.finish_position order by gr.player_id)
      into v_players, v_places
      from game_results gr
     where gr.game_id = v_game.id;

    v_m := coalesce(array_length(v_players, 1), 0);
    -- A solo game has nobody to be better than.
    if v_m < 2 then
      continue;
    end if;

    v_seq := v_seq + 1;

    -- Seed anyone new at the starting rating.
    for i in 1 .. v_m loop
      v_id := v_players[i];
      if not v_state ? v_id::text then
        v_state := jsonb_set(
          v_state, array[v_id::text],
          jsonb_build_object('r', v_start, 'n', 0));
      end if;
    end loop;

    -- Deltas are computed against the ratings as they were BEFORE this game,
    -- so the order players are processed in cannot change the result.
    for i in 1 .. v_m loop
      v_id  := v_players[i];
      v_r_i := (v_state -> v_id::text -> 'r')::numeric;
      v_n_i := (v_state -> v_id::text -> 'n')::integer;
      v_k   := case when v_n_i < v_provisional then v_k_new else v_k_settled end;

      v_sum := 0;
      for j in 1 .. v_m loop
        if i = j then
          continue;
        end if;
        v_r_j := (v_state -> v_players[j]::text -> 'r')::numeric;

        -- Finishing ahead is a win, level is a half. A shared win between two
        -- players is worth the same to each as half a victory.
        v_score := case
                     when v_places[i] < v_places[j] then 1.0
                     when v_places[i] = v_places[j] then 0.5
                     else 0.0
                   end;
        v_expected := 1.0 / (1.0 + power(10.0, (v_r_j - v_r_i) / 400.0));
        v_sum := v_sum + (v_score - v_expected);
      end loop;

      v_delta := (v_k::numeric / (v_m - 1)) * v_sum;

      insert into rating_events (game_id, player_id, played_on, seq,
                                 rating_before, rating_after, delta, k, opponents)
      values (v_game.id, v_id, v_game.played_on, v_seq,
              round(v_r_i, 2), round(v_r_i + v_delta, 2), round(v_delta, 2),
              v_k, v_m - 1);
    end loop;

    -- Applied only once every delta for the game is known.
    for i in 1 .. v_m loop
      v_id := v_players[i];
      v_state := jsonb_set(
        v_state, array[v_id::text],
        jsonb_build_object(
          'r', (select rating_after from rating_events
                 where game_id = v_game.id and player_id = v_id),
          'n', (v_state -> v_id::text -> 'n')::integer + 1));
    end loop;
  end loop;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Reading it back
-- ---------------------------------------------------------------------------

create view player_ratings with (security_invoker = true) as
select p.id                                          as player_id,
       p.name,
       p.emoji,
       p.is_active,
       coalesce(last.rating_after, 1000)::numeric(8,2) as rating,
       coalesce(agg.games, 0)::int                     as rated_games,
       coalesce(agg.peak, 1000)::numeric(8,2)          as peak_rating,
       (coalesce(agg.peak, 1000) - coalesce(last.rating_after, 1000))::numeric(8,2)
                                                       as below_peak,
       -- Enough games to mean something. Below this the number is still moving
       -- around too much to put on a leaderboard.
       coalesce(agg.games, 0) >= 10                    as is_established
  from players p
  left join lateral (
    select re.rating_after
      from rating_events re
     where re.player_id = p.id
     order by re.seq desc
     limit 1
  ) last on true
  left join lateral (
    select count(*) as games, max(re.rating_after) as peak
      from rating_events re
     where re.player_id = p.id
  ) agg on true;

create view rating_history with (security_invoker = true) as
select re.*, g.finished_at
  from rating_events re
  join games g on g.id = re.game_id;

-- The single worst afternoon anyone has had: the largest rating loss in one
-- game, and whether they went in as the strongest player at the table.
create view biggest_chokes with (security_invoker = true) as
select re.game_id,
       re.player_id,
       re.played_on,
       re.delta,
       re.rating_before,
       re.rating_before = max(re.rating_before) over (partition by re.game_id)
         as was_favourite
  from rating_events re;

-- ---------------------------------------------------------------------------
-- Hall of fame
--
-- Deliberately SQL rather than computed in the page: v1 worked out "lowest
-- score ever" over the most recent 200 result rows, so the record quietly
-- became wrong once history outgrew that window.
-- ---------------------------------------------------------------------------

create view hall_of_fame with (security_invoker = true) as
  (select 'lowest_score'::text as key, gr.player_id, gr.score::numeric as value,
          gr.game_id, gr.played_on
     from game_results gr
     join rulesets r on r.id = gr.ruleset_id
    where r.rules->>'win' = 'lowest'
    order by gr.score, gr.played_on
    limit 1)
union all
  (select 'most_shut_boxes', ps.player_id, ps.shut_boxes::numeric, null, null
     from player_stats ps
    where ps.shut_boxes > 0
    order by ps.shut_boxes desc
    limit 1)
union all
  (select 'longest_streak', pk.player_id, pk.best_streak::numeric, null, null
     from player_streaks pk
    where pk.best_streak > 0
    order by pk.best_streak desc
    limit 1)
union all
  (select 'peak_rating', pr.player_id, pr.peak_rating, null, null
     from player_ratings pr
    where pr.rated_games > 0
    order by pr.peak_rating desc
    limit 1)
union all
  (select 'biggest_choke', bc.player_id, bc.delta, bc.game_id, bc.played_on
     from biggest_chokes bc
    order by bc.delta asc
    limit 1);

grant select on player_ratings, rating_history, biggest_chokes, hall_of_fame
  to service_role;

revoke execute on function recompute_ratings() from public, anon, authenticated;
grant execute on function recompute_ratings() to service_role;

-- Backfill: build the ratings for whatever history already exists.
select recompute_ratings();


-- ======================= 0009_achievements.sql =======================

-- Shut the Box — badges.
--
-- Small, findable rewards for things that already happen at the table, so a
-- quiet run of games still produces something to talk about.

create table achievements (
  key         text primary key,
  name        text not null,
  description text not null,
  emoji       text not null,
  sort        integer not null,
  repeatable  boolean not null default false
);

create table player_achievements (
  player_id       uuid not null references players(id),
  achievement_key text not null references achievements(key),
  -- The finished_at of the game that earned it, so re-evaluating never moves
  -- the date around.
  earned_at       timestamptz not null,
  game_id         uuid references games(id) on delete set null,
  season_id       uuid references seasons(id),
  times           integer not null default 1,
  primary key (player_id, achievement_key)
);

create index player_achievements_earned_idx on player_achievements (earned_at desc);

alter table achievements enable row level security;
alter table player_achievements enable row level security;
grant select, insert, update, delete on achievements, player_achievements
  to service_role;

comment on table player_achievements is
  'Derived: rebuilt entirely by evaluate_achievements().';

insert into achievements (key, name, description, emoji, sort, repeatable) values
  ('first_blood',    'First Blood',     'Won a day for the first time.',                       '🩸',  10, false),
  ('shut_the_box',   'Shut the Box',    'Put every tile down.',                                '📦',  20, false),
  ('box_collector',  'Box Collector',   'Shut the box five times.',                            '🗃️',  30, false),
  ('low_roller',     'Low Roller',      'Finished on three or less without shutting the box.',  '🎯',  40, false),
  ('streak_3',       'On a Roll',       'Won three days in a row.',                            '🔥',  50, false),
  ('streak_5',       'Unstoppable',     'Won five days in a row.',                             '🔥',  60, false),
  ('streak_10',      'Dynasty',         'Won ten days in a row.',                              '👑',  70, false),
  ('regular_25',     'Regular',         'Played twenty-five games.',                           '🪑',  80, false),
  ('century_100',    'Centurion',       'Played one hundred games.',                           '💯',  90, false),
  ('elo_1200',       'Rated',           'Reached a rating of 1200.',                           '📈', 100, false),
  ('giant_slayer',   'Giant Slayer',    'Beat the strongest player at the table from 150 points behind.', '🗡️', 110, false),
  ('perfect_week',   'Perfect Week',    'Won every day you played in a single week, at least three of them.', '🌟', 120, false),
  ('season_champion','Season Champion', 'Topped a completed season.',                           '🏆', 130, true);
-- 'fika_hero' arrives with the fika rota in WP-B9; there is nothing to count yet.

-- ---------------------------------------------------------------------------
-- Evaluation
-- ---------------------------------------------------------------------------

-- [concept: rebuild, do not append] Badges are derived from the game history
-- exactly like ratings are, so correcting a score cannot leave someone holding
-- a badge they no longer earned. Every insert picks the EARLIEST qualifying
-- game, which makes the result identical however many times this runs.
create or replace function evaluate_achievements()
returns void language plpgsql volatile as $fn$
begin
  delete from player_achievements;

  -- First day won.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (gr.player_id)
         gr.player_id, 'first_blood', g.finished_at, gr.game_id
    from game_results gr
    join games g on g.id = gr.game_id
   where gr.is_winner
   order by gr.player_id, g.finished_at, gr.game_id;

  -- First shut box, and the fifth.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (gr.player_id)
         gr.player_id, 'shut_the_box', g.finished_at, gr.game_id
    from game_results gr
    join games g on g.id = gr.game_id
   where gr.is_shut_box
   order by gr.player_id, g.finished_at, gr.game_id;

  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select player_id, 'box_collector', finished_at, game_id
    from (
      select gr.player_id, g.finished_at, gr.game_id,
             row_number() over (partition by gr.player_id
                                order by g.finished_at, gr.game_id) as nth
        from game_results gr
        join games g on g.id = gr.game_id
       where gr.is_shut_box
    ) ranked
   where nth = 5;

  -- A very good turn that was not quite perfect.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (gr.player_id)
         gr.player_id, 'low_roller', g.finished_at, gr.game_id
    from game_results gr
    join games g on g.id = gr.game_id
    join rulesets r on r.id = gr.ruleset_id
   where gr.score between 1 and 3
     and r.rules->'scoring'->>'kind' = 'sum_open'
   order by gr.player_id, g.finished_at, gr.game_id;

  -- Games played.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select player_id, key, finished_at, game_id
    from (
      select gr.player_id, g.finished_at, gr.game_id,
             row_number() over (partition by gr.player_id
                                order by g.finished_at, gr.game_id) as nth
        from game_results gr
        join games g on g.id = gr.game_id
    ) ranked
    join (values ('regular_25', 25), ('century_100', 100)) as m(key, at_nth)
      on ranked.nth = m.at_nth;

  -- [concept: gaps-and-islands] Streaks run over days that were PLAYED, so a
  -- weekend never breaks one. Numbering the wins inside each unbroken run gives
  -- the day the streak reached three, five or ten.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select s.player_id, m.key, s.finished_at, s.game_id
    from (
      select islands.player_id,
             row_number() over (partition by islands.player_id, islands.island
                                order by islands.day_no) as run_length,
             g.finished_at,
             (select gr.game_id from game_results gr
               where gr.player_id = islands.player_id
                 and gr.played_on = islands.played_on
                 and gr.is_winner
               order by gr.game_id limit 1) as game_id
        from (
          select w.player_id, d.day_no, d.played_on,
                 d.day_no - row_number() over (partition by w.player_id
                                               order by d.day_no) as island
            from daily_winners w
            join (
              select played_on,
                     row_number() over (order by played_on) as day_no
                from (select distinct played_on from games_valid) x
            ) d using (played_on)
        ) islands
        join lateral (
          select max(gv.finished_at) as finished_at
            from games_valid gv where gv.played_on = islands.played_on
        ) g on true
    ) s
    join (values ('streak_3', 3), ('streak_5', 5), ('streak_10', 10))
      as m(key, at_length) on s.run_length = m.at_length;

  -- The first game that took them to 1200.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (re.player_id)
         re.player_id, 'elo_1200', g.finished_at, re.game_id
    from rating_events re
    join games g on g.id = re.game_id
   where re.rating_after >= 1200
   order by re.player_id, re.seq;

  -- Beating the strongest player at the table from well behind them.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (underdog.player_id)
         underdog.player_id, 'giant_slayer', g.finished_at, underdog.game_id
    from rating_events underdog
    join games g on g.id = underdog.game_id
    join rating_events favourite
      on favourite.game_id = underdog.game_id
     and favourite.player_id <> underdog.player_id
    join game_results me
      on me.game_id = underdog.game_id and me.player_id = underdog.player_id
    join game_results them
      on them.game_id = favourite.game_id and them.player_id = favourite.player_id
   where favourite.rating_before = (
           select max(x.rating_before) from rating_events x
            where x.game_id = underdog.game_id)
     and underdog.rating_before <= favourite.rating_before - 150
     and me.finish_position < them.finish_position
   order by underdog.player_id, underdog.seq;

  -- Won every day they turned up in one week, over at least three days.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (weeks.player_id)
         weeks.player_id, 'perfect_week', weeks.finished_at, null
    from (
      select per_day.player_id,
             date_trunc('week', per_day.played_on) as week,
             max(per_day.finished_at) as finished_at,
             count(*) as days,
             bool_and(per_day.won) as every_day
        from (
          select gr.player_id, gr.played_on,
                 bool_or(gr.is_winner) as won,
                 max(g.finished_at) as finished_at
            from game_results gr
            join games g on g.id = gr.game_id
           group by gr.player_id, gr.played_on
        ) per_day
       group by per_day.player_id, date_trunc('week', per_day.played_on)
    ) weeks
   where weeks.days >= 3 and weeks.every_day
   order by weeks.player_id, weeks.finished_at;

  -- Repeatable: one per closed season won.
  insert into player_achievements (player_id, achievement_key, earned_at,
                                   season_id, times)
  select sc.player_id,
         'season_champion',
         (select max(gv.finished_at) from games_valid gv
           where gv.season_id = sc.season_id),
         sc.season_id,
         count(*) over (partition by sc.player_id)
    from season_champions sc
  on conflict (player_id, achievement_key) do nothing;
end
$fn$;

revoke execute on function evaluate_achievements() from public, anon, authenticated;
grant execute on function evaluate_achievements() to service_role;

-- Backfill for whatever history already exists.
select evaluate_achievements();


-- ======================= 0010_rpc_game_flow.sql =======================

-- Shut the Box — the write API.
--
-- v1 wrote a game with two independent inserts and a best-effort delete if the
-- second failed. The rollback's own result was never checked, so a crash in
-- between left an orphan games row, which then added a day nobody won to the
-- streak index and quietly reset everyone's current streak.
--
-- Every write now goes through one of these functions: one call, one
-- transaction, invariants enforced in SQL rather than in whichever client
-- happened to be talking.
--
-- Error codes (mapped to copy in src/lib/db-errors.ts):
--   STB01 not the scorekeeper      STB02 invalid result (from the 0005 trigger)
--   STB03 wrong game status        STB04 not this player's turn
--   STB05 nothing to finish        STB06 date in the future
--   STB09 already keeping score elsewhere

-- ---------------------------------------------------------------------------
-- Reading the live game
-- ---------------------------------------------------------------------------

-- One value describing everything a board needs to render, for the server
-- render, for the reconnect fetch, and (from 0011) as the broadcast payload —
-- so a spectator and the scorekeeper can never disagree about the shape.
create or replace function live_game_snapshot(p_game_id uuid)
returns jsonb language plpgsql stable as $fn$
declare
  v_game    games;
  v_rules   jsonb;
  v_turn    live_turns;
  v_open    smallint[];
  v_players jsonb;
  v_leaders jsonb;
  v_turn_js jsonb;
  v_pending integer;
begin
  select * into v_game from games where id = p_game_id;
  if not found then
    return null;
  end if;
  select rules into v_rules from rulesets where id = v_game.ruleset_id;
  select * into v_turn from live_turns where game_id = p_game_id;

  select jsonb_agg(
           jsonb_build_object(
             'player_id',       gp.player_id,
             'name',            p.name,
             'emoji',           p.emoji,
             'turn_order',      gp.turn_order,
             'status',          gp.status,
             'score',           gp.score,
             'tiles_open',      gp.tiles_open,
             'predicted_score', gp.predicted_score
           ) order by gp.turn_order)
    into v_players
    from game_players gp
    join players p on p.id = gp.player_id
   where gp.game_id = p_game_id;

  select count(*) into v_pending
    from game_players
   where game_id = p_game_id and status in ('pending', 'playing');

  -- Who is winning so far. The same rule as game_results, so the review screen
  -- never has to work it out again — that divergence is how v1 ended up
  -- crowning nobody in a solo game while the result page crowned the player.
  select coalesce(jsonb_agg(player_id), '[]'::jsonb)
    into v_leaders
    from (
      select gp.player_id,
             rank() over (order by gp.score * ruleset_win_sign(v_rules)) as rnk
        from game_players gp
       where gp.game_id = p_game_id and gp.status = 'done'
    ) ranked
   where rnk = 1;

  if v_turn.game_id is not null then
    v_open := (
      select coalesce(array_agg(t::smallint order by t), '{}'::smallint[])
        from generate_series(1, ruleset_tiles(v_rules)) t
       where not (t = any(v_turn.tiles_down))
    );
    v_turn_js := jsonb_build_object(
      'player_id',     v_turn.player_id,
      'tiles_down',    to_jsonb(v_turn.tiles_down),
      'tiles_open',    to_jsonb(v_open),
      'score_if_stop', ruleset_score(v_rules, v_open),
      'is_shut',       cardinality(v_open) = 0
    );
  end if;

  return jsonb_build_object(
    'game', jsonb_build_object(
      'id',                    v_game.id,
      'status',                v_game.status,
      'played_on',             v_game.played_on,
      'ruleset_id',            v_game.ruleset_id,
      'rules',                 v_rules,
      'scorekeeper_player_id', v_game.scorekeeper_player_id,
      'started_at',            v_game.started_at,
      'updated_at',            v_game.updated_at,
      'deleted',               v_game.deleted_at is not null
    ),
    'players',    coalesce(v_players, '[]'::jsonb),
    'turn',       v_turn_js,
    'leader_ids', v_leaders,
    'all_done',   v_pending = 0,
    'version',    coalesce(v_turn.version, 0)
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- Shared guards
-- ---------------------------------------------------------------------------

-- Locks the game and checks the caller may drive it. Returns its rules.
create or replace function assert_scorekeeper(p_actor uuid, p_game_id uuid)
returns jsonb language plpgsql volatile as $fn$
declare
  v_game  games;
  v_rules jsonb;
begin
  -- for update: two taps arriving together must not both read the same board.
  select * into v_game from games where id = p_game_id for update;
  if not found then
    raise exception 'no such game' using errcode = 'STB03';
  end if;
  if v_game.status <> 'in_progress' or v_game.deleted_at is not null then
    raise exception 'this game is not in progress' using errcode = 'STB03';
  end if;
  if v_game.scorekeeper_player_id is distinct from p_actor then
    raise exception 'someone else is keeping score' using errcode = 'STB01';
  end if;
  select rules into v_rules from rulesets where id = v_game.ruleset_id;
  return v_rules;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Starting
-- ---------------------------------------------------------------------------

create or replace function start_game(p_actor uuid, p_player_ids uuid[])
returns jsonb language plpgsql volatile as $fn$
declare
  v_game_id uuid;
  v_season  uuid;
  v_first   uuid;
begin
  if p_player_ids is null or cardinality(p_player_ids) = 0 then
    raise exception 'nobody is playing' using errcode = 'STB02';
  end if;
  if cardinality(p_player_ids) <> (
       select count(distinct x) from unnest(p_player_ids) x) then
    raise exception 'a player appears twice' using errcode = 'STB02';
  end if;
  if exists (
    select 1 from unnest(p_player_ids) x
     where not exists (select 1 from players p where p.id = x and p.is_active)
  ) then
    raise exception 'that player is not on the active roster'
      using errcode = 'STB02';
  end if;

  -- One live game per scorekeeper. This is the duplicate-game race from v1:
  -- two colleagues both saw "no game yet today" and both saved one.
  if exists (
    select 1 from games
     where scorekeeper_player_id = p_actor
       and status = 'in_progress'
       and deleted_at is null
  ) then
    raise exception 'you are already keeping score for a game'
      using errcode = 'STB09';
  end if;

  v_season := ensure_season(stockholm_today());
  v_first  := p_player_ids[1];

  insert into games (played_on, ruleset_id, season_id, status,
                     scorekeeper_player_id, created_by)
  select stockholm_today(),
         s.ruleset_id,      -- the season's ruleset, snapshotted onto the game
         s.id,
         'in_progress',
         p_actor,
         p_actor
    from seasons s where s.id = v_season
  returning id into v_game_id;

  insert into game_players (game_id, player_id, turn_order, status)
  select v_game_id, x.id, x.ord,
         case when x.ord = 1 then 'playing' else 'pending' end::game_player_status
    from unnest(p_player_ids) with ordinality as x(id, ord);

  insert into live_turns (game_id, player_id) values (v_game_id, v_first);

  insert into audit_log (actor_player_id, action, entity, entity_id, after)
  values (p_actor, 'game.start', 'game', v_game_id,
          game_snapshot(v_game_id));

  return live_game_snapshot(v_game_id);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Playing a turn
-- ---------------------------------------------------------------------------

-- The whole set of tiles currently down, not a single toggle: idempotent, so a
-- retried or out-of-order tap cannot leave the board in a state nobody chose.
create or replace function live_set_board(
  p_actor      uuid,
  p_game_id    uuid,
  p_tiles_down smallint[]
) returns jsonb language plpgsql volatile as $fn$
declare
  v_rules jsonb := assert_scorekeeper(p_actor, p_game_id);
  v_tiles smallint;
  v_clean smallint[];
begin
  v_tiles := ruleset_tiles(v_rules);

  select coalesce(array_agg(distinct t order by t), '{}'::smallint[])
    into v_clean
    from unnest(coalesce(p_tiles_down, '{}'::smallint[])) t;

  if exists (select 1 from unnest(v_clean) t where t < 1 or t > v_tiles) then
    raise exception 'tile out of range for a %-tile board', v_tiles
      using errcode = 'STB02';
  end if;

  update live_turns
     set tiles_down = v_clean,
         version    = version + 1
   where game_id = p_game_id;
  if not found then
    raise exception 'this game has no live board' using errcode = 'STB03';
  end if;

  return live_game_snapshot(p_game_id);
end
$fn$;

-- Ends the current player's turn and hands over. The score is computed here
-- from the board the server holds, never taken from the client.
create or replace function end_turn(
  p_actor       uuid,
  p_game_id     uuid,
  p_typed_score integer default null,
  p_predicted   integer default null
) returns jsonb language plpgsql volatile as $fn$
declare
  v_rules jsonb := assert_scorekeeper(p_actor, p_game_id);
  v_turn  live_turns;
  v_open  smallint[];
  v_score integer;
  v_next  uuid;
begin
  select * into v_turn from live_turns where game_id = p_game_id;
  if not found then
    raise exception 'this game has no live board' using errcode = 'STB03';
  end if;
  if not exists (
    select 1 from game_players
     where game_id = p_game_id
       and player_id = v_turn.player_id
       and status = 'playing'
  ) then
    raise exception 'it is not that player''s turn' using errcode = 'STB04';
  end if;

  if p_typed_score is null then
    v_open := (
      select coalesce(array_agg(t::smallint order by t), '{}'::smallint[])
        from generate_series(1, ruleset_tiles(v_rules)) t
       where not (t = any(v_turn.tiles_down))
    );
    v_score := ruleset_score(v_rules, v_open, p_predicted);
  else
    -- A score typed in because the turn was already played on the real box:
    -- there is no board to record, so tiles_open stays null.
    v_open  := null;
    v_score := p_typed_score;
  end if;

  update game_players
     set status          = 'done',
         score           = v_score,
         tiles_open      = v_open,
         predicted_score = p_predicted
   where game_id = p_game_id and player_id = v_turn.player_id;

  -- Shutting the box ends the game where the ruleset says so. Those players
  -- were at the table, so they get a row saying they never rolled rather than
  -- no row at all — v1 left them statistically invisible.
  if ruleset_instant_win(v_rules) and v_open is not null
     and cardinality(v_open) = 0 then
    update game_players
       set status = 'dnp'
     where game_id = p_game_id and status in ('pending', 'playing');
  end if;

  select player_id into v_next
    from game_players
   where game_id = p_game_id and status = 'pending'
   order by turn_order
   limit 1;

  if v_next is not null then
    update game_players set status = 'playing'
     where game_id = p_game_id and player_id = v_next;
    update live_turns
       set player_id  = v_next,
           tiles_down = '{}',
           version    = version + 1
     where game_id = p_game_id;
  else
    -- Everyone has played; the board stays for the review screen to read.
    update live_turns set version = version + 1 where game_id = p_game_id;
  end if;

  return live_game_snapshot(p_game_id);
end
$fn$;

-- Correcting a turn from the review screen, before the game is crowned.
create or replace function set_turn_result(
  p_actor      uuid,
  p_game_id    uuid,
  p_player_id  uuid,
  p_tiles_open smallint[],
  p_score      integer,
  p_predicted  integer default null
) returns jsonb language plpgsql volatile as $fn$
declare
  v_rules jsonb := assert_scorekeeper(p_actor, p_game_id);
  v_first uuid;
begin
  update game_players
     set status          = 'done',
         score           = p_score,
         tiles_open      = p_tiles_open,
         predicted_score = p_predicted
   where game_id = p_game_id and player_id = p_player_id;
  if not found then
    raise exception 'that player is not in this game' using errcode = 'STB04';
  end if;

  -- If the correction means nobody shut the box after all, the players who were
  -- skipped are owed their turn back.
  if not exists (
    select 1 from game_players
     where game_id = p_game_id
       and status = 'done'
       and coalesce(cardinality(tiles_open) = 0, false)
  ) then
    update game_players set status = 'pending'
     where game_id = p_game_id and status = 'dnp';

    select player_id into v_first
      from game_players
     where game_id = p_game_id and status = 'pending'
     order by turn_order
     limit 1;

    if v_first is not null then
      update game_players set status = 'playing'
       where game_id = p_game_id and player_id = v_first;
      update live_turns
         set player_id  = v_first,
             tiles_down = '{}',
             version    = version + 1
       where game_id = p_game_id;
    end if;
  end if;

  update live_turns set version = version + 1 where game_id = p_game_id;
  return live_game_snapshot(p_game_id);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Handing over and giving up
-- ---------------------------------------------------------------------------

create or replace function claim_scorekeeper(p_actor uuid, p_game_id uuid)
returns jsonb language plpgsql volatile as $fn$
declare
  v_game games;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status <> 'in_progress' or v_game.deleted_at is not null then
    raise exception 'this game is not in progress' using errcode = 'STB03';
  end if;
  if v_game.scorekeeper_player_id = p_actor then
    return live_game_snapshot(p_game_id);   -- already yours; nothing to do
  end if;
  if exists (
    select 1 from games
     where scorekeeper_player_id = p_actor
       and status = 'in_progress'
       and deleted_at is null
       and id <> p_game_id
  ) then
    raise exception 'you are already keeping score for another game'
      using errcode = 'STB09';
  end if;

  update games set scorekeeper_player_id = p_actor where id = p_game_id;

  insert into audit_log (actor_player_id, action, entity, entity_id, before, note)
  values (p_actor, 'game.claim_scorekeeper', 'game', p_game_id,
          jsonb_build_object('scorekeeper_player_id', v_game.scorekeeper_player_id),
          'took over as scorekeeper');

  -- Bumped so the previous scorekeeper's device notices it has been demoted.
  update live_turns set version = version + 1 where game_id = p_game_id;
  return live_game_snapshot(p_game_id);
end
$fn$;

-- Anyone with the PIN can abandon a game: the usual reason is that the phone
-- keeping score went home with somebody.
create or replace function abandon_game(
  p_actor   uuid,
  p_game_id uuid,
  p_note    text default null
) returns void language plpgsql volatile as $fn$
declare
  v_before jsonb;
  v_status game_status;
begin
  select status into v_status from games where id = p_game_id for update;
  if v_status is null or v_status <> 'in_progress' then
    raise exception 'this game is not in progress' using errcode = 'STB03';
  end if;

  v_before := game_snapshot(p_game_id);
  update games set status = 'abandoned' where id = p_game_id;
  -- Deleting the row is the last broadcast the spectators get (0011).
  delete from live_turns where game_id = p_game_id;

  insert into audit_log (actor_player_id, action, entity, entity_id, before, note)
  values (p_actor, 'game.abandon', 'game', p_game_id, v_before, p_note);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Finishing
-- ---------------------------------------------------------------------------

-- The whole crowning in one transaction: status, the live board, and the audit
-- row either all land or none do.
--
-- WP-B5 replaces this with a version that also recomputes ratings and
-- re-evaluates achievements, returning the newly earned ones.
create or replace function finish_game(p_actor uuid, p_game_id uuid)
returns jsonb language plpgsql volatile as $fn$
declare
  v_game games;
  v_done integer;
  v_left integer;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.deleted_at is not null then
    raise exception 'no such game' using errcode = 'STB03';
  end if;
  if v_game.status <> 'in_progress' then
    raise exception 'this game is not in progress' using errcode = 'STB03';
  end if;
  -- Finishing is allowed for anyone with a session: if the scorekeeper's phone
  -- is gone, the game must still be closable.
  select count(*) filter (where status = 'done'),
         count(*) filter (where status in ('pending', 'playing'))
    into v_done, v_left
    from game_players where game_id = p_game_id;

  if v_left > 0 then
    raise exception 'somebody still has a turn to play' using errcode = 'STB03';
  end if;
  if v_done = 0 then
    raise exception 'nobody has played yet' using errcode = 'STB05';
  end if;

  update games
     set status      = 'finished',
         finished_at = now()
   where id = p_game_id;

  delete from live_turns where game_id = p_game_id;

  insert into audit_log (actor_player_id, action, entity, entity_id, after)
  values (p_actor, 'game.finish', 'game', p_game_id, game_snapshot(p_game_id));

  return jsonb_build_object('game_id', p_game_id, 'new_achievements', '[]'::jsonb);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'live_game_snapshot(uuid)',
    'assert_scorekeeper(uuid, uuid)',
    'start_game(uuid, uuid[])',
    'live_set_board(uuid, uuid, smallint[])',
    'end_turn(uuid, uuid, integer, integer)',
    'set_turn_result(uuid, uuid, uuid, smallint[], integer, integer)',
    'claim_scorekeeper(uuid, uuid)',
    'abandon_game(uuid, uuid, text)',
    'finish_game(uuid, uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;


-- ======================= 0011_realtime.sql =======================

-- Shut the Box — live spectating.
--
-- Everyone at the table watches the tiles flip on their own phone. That needs a
-- key in the browser, which until now there has never been: the service-role
-- key is server-only and nothing else could reach the database at all.
--
-- The key browsers get is the PUBLISHABLE one, which acts as the `anon` role.
-- It is designed to be public, and the security model is that anon can reach
-- nothing except the broadcasts it is explicitly allowed to hear.

-- ---------------------------------------------------------------------------
-- Close the door before handing out the key
--
-- [concept: RLS is the only lock] Supabase's platform bootstrap runs
-- ALTER DEFAULT PRIVILEGES granting anon SELECT/INSERT/UPDATE/DELETE on every
-- new table in public, so table GRANTs protect nothing here — enabling RLS with
-- no policies is what denies access. 0004 created rulesets and seasons without
-- it, which did not matter while no key existed in any browser. It matters as
-- of this migration: anon could otherwise rewrite the active ruleset mid-season
-- or delete a season out from under its games.
-- ---------------------------------------------------------------------------

alter table rulesets enable row level security;
alter table seasons  enable row level security;

-- ---------------------------------------------------------------------------
-- Broadcasting the board
-- ---------------------------------------------------------------------------

-- Sends the whole snapshot rather than a diff, so a spectator that joins late
-- or misses a message is never left assembling a board from fragments.
--
-- security definer because realtime.send() writes to realtime.messages, which
-- the app's roles have no business touching directly.
create or replace function broadcast_live_game(p_game_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  perform realtime.send(
    public.live_game_snapshot(p_game_id),
    'state',
    'game:' || p_game_id::text,
    true   -- private channel: subscribing needs the policy below
  );
end
$fn$;

-- [concept: heartbeat row] Every live RPC touches live_turns exactly once — a
-- tap bumps its version, ending a turn moves it on, finishing deletes it — so
-- one broadcast goes out per action, no more and no less. Deleting the row is
-- the last thing a spectator hears, and by then the game row already says
-- finished or abandoned, so the payload carries the final state.
create or replace function live_turns_broadcast()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  perform public.broadcast_live_game(coalesce(new.game_id, old.game_id));
  return null;   -- after trigger; the return value is ignored
end
$fn$;

create trigger live_turns_broadcast
  after insert or update or delete on live_turns
  for each row execute function live_turns_broadcast();

-- ---------------------------------------------------------------------------
-- What anon is allowed to hear
-- ---------------------------------------------------------------------------

-- [concept: Realtime authorization] A private channel checks this policy before
-- letting a subscriber in. SELECT only, and only on game topics: anon may
-- RECEIVE board updates and can neither send its own broadcast (no INSERT
-- policy) nor read a single row of any table (deny-all RLS above).
--
-- Anyone who can guess a game's uuid can watch that game. The PIN gate still
-- guards the app itself; a leaked board is a list of tile numbers.
create policy "anon may listen to live game topics"
  on realtime.messages
  for select
  to anon
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'game:%'
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function broadcast_live_game(uuid)
  from public, anon, authenticated;
revoke execute on function live_turns_broadcast()
  from public, anon, authenticated;
grant execute on function broadcast_live_game(uuid) to service_role;


-- ======================= 0012_finish_game_settles.sql =======================

-- Shut the Box — crowning a game settles its consequences.
--
-- This lives after 0010 and 0011 on purpose: finish_game is CREATED in 0010, so
-- redefining it in 0009 (where the achievements it depends on are introduced)
-- would simply be overwritten by the later migration. Migrations are
-- append-only, and the last definition wins.

-- Replaces the version from 0010: same guards, but the whole
-- consequence of crowning a game — status, ratings, badges, audit — lands in
-- one transaction, and the newly earned badges come back so the celebration
-- can show them.
create or replace function finish_game(p_actor uuid, p_game_id uuid)
returns jsonb language plpgsql volatile as $fn$
declare
  v_game   games;
  v_done   integer;
  v_left   integer;
  v_before jsonb;
  v_new    jsonb;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.deleted_at is not null then
    raise exception 'no such game' using errcode = 'STB03';
  end if;
  if v_game.status <> 'in_progress' then
    raise exception 'this game is not in progress' using errcode = 'STB03';
  end if;

  select count(*) filter (where status = 'done'),
         count(*) filter (where status in ('pending', 'playing'))
    into v_done, v_left
    from game_players where game_id = p_game_id;

  if v_left > 0 then
    raise exception 'somebody still has a turn to play' using errcode = 'STB03';
  end if;
  if v_done = 0 then
    raise exception 'nobody has played yet' using errcode = 'STB05';
  end if;

  -- What the players in this game already had, so the difference afterwards is
  -- what they just earned.
  select coalesce(jsonb_agg(distinct pa.player_id::text || '|' || pa.achievement_key), '[]'::jsonb)
    into v_before
    from player_achievements pa
   where pa.player_id in (
     select player_id from game_players where game_id = p_game_id
   );

  update games
     set status      = 'finished',
         finished_at = now()
   where id = p_game_id;

  delete from live_turns where game_id = p_game_id;

  -- Both rebuild from the game history, so they have to run after the game
  -- counts as finished.
  perform recompute_ratings();
  perform evaluate_achievements();

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', pa.player_id,
           'key', pa.achievement_key,
           'name', a.name,
           'emoji', a.emoji,
           'description', a.description)), '[]'::jsonb)
    into v_new
    from player_achievements pa
    join achievements a on a.key = pa.achievement_key
   where pa.player_id in (
     select player_id from game_players where game_id = p_game_id
   )
     and not (v_before ? (pa.player_id::text || '|' || pa.achievement_key));

  insert into audit_log (actor_player_id, action, entity, entity_id, after)
  values (p_actor, 'game.finish', 'game', p_game_id, game_snapshot(p_game_id));

  return jsonb_build_object('game_id', p_game_id, 'new_achievements', v_new);
end
$fn$;

revoke execute on function finish_game(uuid, uuid) from public, anon, authenticated;
grant execute on function finish_game(uuid, uuid) to service_role;



-- ======================= 0013_game_management.sql =======================

-- Shut the Box — correcting the record from the app.
--
-- This is the migration that retires hand-run SQL. In v1 a mistyped score was
-- permanent: the only way to fix one was the Supabase dashboard, which is how
-- the very first game came to be deleted by hand. Every correction now goes
-- through a function that validates it, records who did it, and rebuilds the
-- ratings and badges that depended on it.
--
-- Additional error codes: STB07 nothing to undo / not the latest change.

-- ---------------------------------------------------------------------------
-- Applying a set of results to a game
-- ---------------------------------------------------------------------------

-- Shared by editing, adding a past game and undoing: replaces the whole roster
-- of a game from a snapshot-shaped array.
--
-- A full replacement rather than a merge, because a correction can remove a
-- player who was never really there — and the invariant trigger from 0005
-- checks every row on the way in, so a bad score cannot get through this door
-- either.
create or replace function apply_game_results(
  p_game_id uuid,
  p_results jsonb
) returns void language plpgsql volatile as $fn$
declare
  v_row   jsonb;
  v_order integer := 0;
  v_done  integer := 0;
begin
  if p_results is null or jsonb_typeof(p_results) <> 'array'
     or jsonb_array_length(p_results) = 0 then
    raise exception 'a game needs at least one player' using errcode = 'STB02';
  end if;

  delete from game_players where game_id = p_game_id;

  for v_row in select value from jsonb_array_elements(p_results) loop
    v_order := v_order + 1;
    insert into game_players (game_id, player_id, turn_order, status,
                              score, tiles_open, predicted_score)
    values (
      p_game_id,
      (v_row->>'player_id')::uuid,
      v_order,
      coalesce((v_row->>'status')::game_player_status, 'done'),
      case when v_row->>'score' is null then null
           else (v_row->>'score')::integer end,
      case when v_row->>'tiles_open' is null then null
           else (select array_agg(t::smallint)
                   from jsonb_array_elements_text(v_row->'tiles_open') t) end,
      case when v_row->>'predicted_score' is null then null
           else (v_row->>'predicted_score')::integer end
    );
  end loop;

  select count(*) into v_done
    from game_players where game_id = p_game_id and status = 'done';
  if v_done = 0 then
    raise exception 'somebody has to have played' using errcode = 'STB02';
  end if;
end
$fn$;

-- Rebuilds everything derived from the game history. Called by every function
-- below, so a correction can never leave a stale rating or badge behind.
create or replace function resettle_history()
returns void language plpgsql volatile as $fn$
begin
  perform recompute_ratings();
  perform evaluate_achievements();
end
$fn$;

-- ---------------------------------------------------------------------------
-- Editing
-- ---------------------------------------------------------------------------

create or replace function edit_game(
  p_actor    uuid,
  p_game_id  uuid,
  p_played_on date,
  p_results  jsonb,
  p_note     text default null
) returns void language plpgsql volatile as $fn$
declare
  v_game   games;
  v_before jsonb;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then
    raise exception 'no such game' using errcode = 'STB03';
  end if;
  if v_game.status <> 'finished' then
    raise exception 'only a finished game can be edited' using errcode = 'STB03';
  end if;
  if p_played_on > stockholm_today() then
    raise exception 'that date has not happened yet' using errcode = 'STB06';
  end if;

  v_before := game_snapshot(p_game_id);

  -- The season follows the date, so moving a game into another quarter moves
  -- it in the standings too. The RULESET does not move: the game was played
  -- under the rules it was played under.
  update games
     set played_on = p_played_on,
         season_id = ensure_season(p_played_on)
   where id = p_game_id;

  perform apply_game_results(p_game_id, p_results);
  perform resettle_history();

  insert into audit_log (actor_player_id, action, entity, entity_id,
                         before, after, note)
  values (p_actor, 'game.edit', 'game', p_game_id,
          v_before, game_snapshot(p_game_id), p_note);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Deleting, reversibly
-- ---------------------------------------------------------------------------

-- [concept: soft delete] The row stays. A game that never happened — wrong
-- ruleset, a joke, a double entry — has to stop counting, but throwing the
-- history away means the mistake cannot be examined or undone. games_valid
-- already excludes anything with deleted_at set, so one column removes it from
-- every statistic at once.
create or replace function delete_game(
  p_actor   uuid,
  p_game_id uuid,
  p_reason  text default null
) returns void language plpgsql volatile as $fn$
declare
  v_before jsonb;
  v_status game_status;
  v_deleted timestamptz;
begin
  select status, deleted_at into v_status, v_deleted
    from games where id = p_game_id for update;
  if v_status is null then
    raise exception 'no such game' using errcode = 'STB03';
  end if;
  if v_deleted is not null then
    return;   -- already gone; nothing to do and nothing to record
  end if;

  v_before := game_snapshot(p_game_id);
  update games set deleted_at = now() where id = p_game_id;
  delete from live_turns where game_id = p_game_id;
  perform resettle_history();

  insert into audit_log (actor_player_id, action, entity, entity_id,
                         before, note)
  values (p_actor, 'game.delete', 'game', p_game_id, v_before, p_reason);
end
$fn$;

create or replace function restore_game(p_actor uuid, p_game_id uuid)
returns void language plpgsql volatile as $fn$
declare
  v_deleted timestamptz;
begin
  select deleted_at into v_deleted from games where id = p_game_id for update;
  if v_deleted is null then
    return;   -- not deleted; nothing to restore
  end if;

  update games set deleted_at = null where id = p_game_id;
  perform resettle_history();

  insert into audit_log (actor_player_id, action, entity, entity_id, after)
  values (p_actor, 'game.restore', 'game', p_game_id,
          game_snapshot(p_game_id));
end
$fn$;

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------

-- Reverses one recorded change, and only if nothing has happened to the game
-- since. Undoing out of order would silently discard whatever came after it.
create or replace function undo_game_change(p_actor uuid, p_audit_id bigint)
returns void language plpgsql volatile as $fn$
declare
  v_entry  audit_log;
  v_latest bigint;
begin
  select * into v_entry from audit_log where id = p_audit_id;
  if not found or v_entry.entity <> 'game' or v_entry.entity_id is null then
    raise exception 'that change cannot be undone' using errcode = 'STB07';
  end if;

  select max(id) into v_latest
    from audit_log
   where entity = 'game' and entity_id = v_entry.entity_id
     and action in ('game.edit', 'game.delete', 'game.restore', 'game.undo');
  if v_latest is distinct from p_audit_id then
    raise exception 'something else has changed this game since'
      using errcode = 'STB07';
  end if;

  if v_entry.action = 'game.edit' then
    if v_entry.before is null then
      raise exception 'that change has nothing to go back to'
        using errcode = 'STB07';
    end if;
    update games
       set played_on = (v_entry.before->'game'->>'played_on')::date,
           season_id = ensure_season((v_entry.before->'game'->>'played_on')::date)
     where id = v_entry.entity_id;
    perform apply_game_results(v_entry.entity_id, v_entry.before->'players');

  elsif v_entry.action = 'game.delete' then
    update games set deleted_at = null where id = v_entry.entity_id;

  elsif v_entry.action = 'game.restore' then
    update games set deleted_at = now() where id = v_entry.entity_id;

  else
    raise exception 'that kind of change cannot be undone'
      using errcode = 'STB07';
  end if;

  perform resettle_history();

  insert into audit_log (actor_player_id, action, entity, entity_id, after, note)
  values (p_actor, 'game.undo', 'game', v_entry.entity_id,
          game_snapshot(v_entry.entity_id),
          format('undid %s from %s', v_entry.action,
                 to_char(v_entry.at, 'YYYY-MM-DD HH24:MI')));
end
$fn$;

-- ---------------------------------------------------------------------------
-- Adding a game that was played without the app
-- ---------------------------------------------------------------------------

-- The forgotten Friday. v1 could only ever record today, because played_on came
-- from a database default and nothing could override it.
create or replace function add_manual_game(
  p_actor     uuid,
  p_played_on date,
  p_results   jsonb,
  p_note      text default null
) returns uuid language plpgsql volatile as $fn$
declare
  v_game_id uuid;
  v_season  uuid;
begin
  if p_played_on > stockholm_today() then
    raise exception 'that date has not happened yet' using errcode = 'STB06';
  end if;

  v_season := ensure_season(p_played_on);

  insert into games (played_on, ruleset_id, season_id, status,
                     created_by, started_at, finished_at)
  select p_played_on, s.ruleset_id, s.id, 'finished', p_actor, now(), now()
    from seasons s where s.id = v_season
  returning id into v_game_id;

  perform apply_game_results(v_game_id, p_results);
  perform resettle_history();

  insert into audit_log (actor_player_id, action, entity, entity_id, after, note)
  values (p_actor, 'game.manual', 'game', v_game_id,
          game_snapshot(v_game_id), p_note);

  return v_game_id;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'apply_game_results(uuid, jsonb)',
    'resettle_history()',
    'edit_game(uuid, uuid, date, jsonb, text)',
    'delete_game(uuid, uuid, text)',
    'restore_game(uuid, uuid)',
    'undo_game_change(uuid, bigint)',
    'add_manual_game(uuid, date, jsonb, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;


-- ======================= 0014_plan_season.sql =======================

-- Shut the Box — choosing what the next season plays.
--
-- ensure_season() creates a quarter on demand with the vanilla ruleset, which
-- is right for a season nobody planned. But the point of making rulesets
-- first-class was that a season can run a variant, and that has to be decided
-- BEFORE the quarter starts — changing the rules of a season already in
-- progress would rewrite scores that have already been played.

create or replace function plan_season(
  p_actor        uuid,
  p_quarter_start date,
  p_ruleset_id   uuid,
  p_name         text default null
) returns uuid language plpgsql volatile as $fn$
declare
  v_start date := date_trunc('quarter', p_quarter_start::timestamp)::date;
  v_end   date := (date_trunc('quarter', p_quarter_start::timestamp)
                   + interval '3 months' - interval '1 day')::date;
  v_slug  text := to_char(v_start, 'YYYY') || '-Q'
                  || extract(quarter from v_start)::integer::text;
  v_id    uuid;
  v_before jsonb;
begin
  if not exists (select 1 from rulesets where id = p_ruleset_id) then
    raise exception 'no such ruleset' using errcode = 'STB02';
  end if;

  -- A season that has already started is played under the rules it started
  -- with. Anything else would silently rescore games that are already done.
  if v_start <= date_trunc('quarter', stockholm_today()::timestamp)::date then
    raise exception 'that season has already started' using errcode = 'STB06';
  end if;

  select id, jsonb_build_object('ruleset_id', ruleset_id, 'name', name)
    into v_id, v_before
    from seasons where slug = v_slug;

  if v_id is null then
    insert into seasons (slug, number, name, starts_on, ends_on, ruleset_id)
    select v_slug,
           coalesce(max(number), 0) + 1,
           coalesce(p_name, 'Season ' || (coalesce(max(number), 0) + 1)::text),
           v_start, v_end, p_ruleset_id
      from seasons
    returning id into v_id;
  else
    update seasons
       set ruleset_id = p_ruleset_id,
           name = coalesce(p_name, name)
     where id = v_id;
  end if;

  insert into audit_log (actor_player_id, action, entity, entity_id,
                         before, after, note)
  values (p_actor, 'season.plan', 'season', v_id, v_before,
          jsonb_build_object('ruleset_id', p_ruleset_id, 'slug', v_slug),
          format('planned %s', v_slug));

  return v_id;
end
$fn$;

-- The quarter after the one being played, which is the earliest that can be
-- planned. Used by the rules page to offer the right season.
create or replace function next_quarter_start()
returns date language sql stable as $fn$
  select (date_trunc('quarter', stockholm_today()::timestamp)
          + interval '3 months')::date
$fn$;

revoke execute on function plan_season(uuid, date, uuid, text)
  from public, anon, authenticated;
revoke execute on function next_quarter_start() from public, anon, authenticated;
grant execute on function plan_season(uuid, date, uuid, text) to service_role;
grant execute on function next_quarter_start() to service_role;


-- ===========================================================================
-- Migration history
--
-- 0001/0002 were applied by hand when the project was set up; 0003 is recorded
-- without being run (see the header). Everything from 0004 was just applied
-- above.
-- ===========================================================================
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0001', 'tables'),
  ('0002', 'views'),
  ('0003', 'lock_12_tile'),
  ('0004', 'rulesets_seasons'),
  ('0005', 'game_lifecycle'),
  ('0006', 'audit_identity_audio'),
  ('0007', 'views'),
  ('0008', 'ratings'),
  ('0009', 'achievements'),
  ('0010', 'rpc_game_flow'),
  ('0011', 'realtime'),
  ('0012', 'finish_game_settles'),
  ('0013', 'game_management'),
  ('0014', 'plan_season')
on conflict (version) do nothing;

commit;
