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
