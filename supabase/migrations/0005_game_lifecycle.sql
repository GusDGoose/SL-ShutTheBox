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
