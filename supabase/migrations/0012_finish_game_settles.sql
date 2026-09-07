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

