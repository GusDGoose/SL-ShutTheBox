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
