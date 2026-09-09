-- Shut the Box — joining and leaving a game in progress.
--
-- Somebody arrives late; somebody was picked and then gets pulled into a
-- meeting. Until now the only answers were "abandon and start again" or
-- "finish, then fix the record". These two RPCs handle it while the game is
-- live, under the rules agreed on 2026-09-08:
--
--   * a late joiner slots in LAST. If everyone has already rolled — the
--     scorekeeper is looking at the review screen — the joiner is up at once
--     and the game re-opens for exactly one turn;
--   * no joining after a shut box under an instant-win ruleset: the box being
--     shut ended the game by rule, and everyone still waiting is already dnp;
--   * leaving means "was picked, is not going to play". Only a `pending` row
--     can go, and it is removed entirely — never marked dnp, which stays
--     reserved for "the box was shut before their turn". A player mid-turn
--     ends or abandons the turn first; a player who has rolled stays, because
--     their score is part of the record;
--   * the scorekeeper hands over (claim_scorekeeper) before leaving: the
--     spectator view looks the scorekeeper up in the roster;
--   * scorekeeper only, one touch of live_turns each (so exactly one
--     broadcast, via the 0011 trigger), audited as game.join / game.leave.
--
-- Both return the live snapshot, like every other live RPC, so the client
-- reconciles from the same shape.

create or replace function join_game(
  p_actor     uuid,
  p_game_id   uuid,
  p_player_id uuid
) returns jsonb language plpgsql volatile as $fn$
declare
  v_rules     jsonb;
  v_order     integer;
  v_anyone_up boolean;
  v_name      text;
begin
  perform assert_scorekeeper(p_actor, p_game_id);   -- STB01 / STB03

  select name into v_name from players where id = p_player_id and is_active;
  if v_name is null then
    raise exception 'that player is not on the active roster' using errcode = 'STB02';
  end if;
  if exists (select 1 from game_players
              where game_id = p_game_id and player_id = p_player_id) then
    raise exception 'that player is already in this game' using errcode = 'STB02';
  end if;

  select r.rules into v_rules
    from games g join rulesets r on r.id = g.ruleset_id
   where g.id = p_game_id;
  -- The same test game_results uses for is_shut_box: an empty board, or a
  -- typed zero.
  if ruleset_instant_win(v_rules) and exists (
       select 1 from game_players gp
        where gp.game_id = p_game_id and gp.status = 'done'
          and coalesce(cardinality(gp.tiles_open) = 0, gp.score = 0)) then
    raise exception 'the box was shut — this game is over' using errcode = 'STB02';
  end if;

  select coalesce(max(turn_order), 0) + 1 into v_order
    from game_players where game_id = p_game_id;
  v_anyone_up := exists (select 1 from game_players
                          where game_id = p_game_id
                            and status in ('playing', 'pending'));

  insert into game_players (game_id, player_id, turn_order, status)
  values (p_game_id, p_player_id, v_order,
          (case when v_anyone_up then 'pending' else 'playing' end)::game_player_status);

  -- One update, one broadcast. If the joiner is up at once the board is
  -- theirs and empty; otherwise the current turn is left exactly as it was.
  update live_turns
     set player_id  = case when v_anyone_up then player_id else p_player_id end,
         tiles_down = case when v_anyone_up then tiles_down else '{}' end,
         version    = version + 1
   where game_id = p_game_id;

  insert into audit_log (actor_player_id, action, entity, entity_id, after, note)
  values (p_actor, 'game.join', 'game', p_game_id,
          jsonb_build_object('player_id', p_player_id, 'turn_order', v_order,
                             'up_at_once', not v_anyone_up),
          format('added %s', v_name));

  return live_game_snapshot(p_game_id);
end
$fn$;

create or replace function leave_game(
  p_actor     uuid,
  p_game_id   uuid,
  p_player_id uuid
) returns jsonb language plpgsql volatile as $fn$
declare
  v_row  game_players;
  v_name text;
begin
  perform assert_scorekeeper(p_actor, p_game_id);   -- STB01 / STB03

  select * into v_row from game_players
   where game_id = p_game_id and player_id = p_player_id;
  if not found then
    raise exception 'that player is not in this game' using errcode = 'STB02';
  end if;
  if p_player_id = (select scorekeeper_player_id from games where id = p_game_id) then
    raise exception 'hand over scorekeeping first' using errcode = 'STB01';
  end if;
  if v_row.status = 'playing' then
    raise exception 'end or abandon the turn first' using errcode = 'STB03';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'a player who has rolled stays in the record' using errcode = 'STB03';
  end if;
  -- Belt and braces: the first player is always `playing`, so a sole pending
  -- row cannot exist. Kept so a future change to that cannot empty a game.
  if (select count(*) from game_players where game_id = p_game_id) <= 1 then
    raise exception 'abandon the game instead' using errcode = 'STB02';
  end if;

  select name into v_name from players where id = p_player_id;

  delete from game_players
   where game_id = p_game_id and player_id = p_player_id;

  update live_turns set version = version + 1 where game_id = p_game_id;

  insert into audit_log (actor_player_id, action, entity, entity_id, before, note)
  values (p_actor, 'game.leave', 'game', p_game_id,
          jsonb_build_object('player_id', p_player_id, 'turn_order', v_row.turn_order),
          format('removed %s (never rolled)', v_name));

  return live_game_snapshot(p_game_id);
end
$fn$;

do $grants$
declare v_fn text;
begin
  foreach v_fn in array array[
    'join_game(uuid, uuid, uuid)',
    'leave_game(uuid, uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;
