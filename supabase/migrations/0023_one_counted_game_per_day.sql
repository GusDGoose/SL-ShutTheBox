-- Shut the Box — a shut box no longer ends the game.
--
-- On 2026-10-01 and 2026-10-05 somebody shut the box on the second turn. The
-- house ruleset said that ended the game on the spot, so everyone after her
-- was marked dnp — and the rest of the table, quite reasonably, played another
-- game, which then counted as a win, a rating change and a "vann dagens" card
-- of its own. The rule agreed on 2026-10-05: everybody plays their turn, and a
-- zero simply wins (two zeros share it, as any tie does).

-- ---------------------------------------------------------------------------
-- The rule itself
-- ---------------------------------------------------------------------------

-- In place, on every seeded ruleset. Games point at their ruleset rather than
-- copying it, so this applies to the game in progress as well as the next one;
-- nothing derived (scores, ratings, badges) ever read the setting, and old dnp
-- rows stay exactly as they were played. The setting itself stays in the rules
-- schema, so a seasonal ruleset could still turn it back on.
update rulesets
   set rules = jsonb_set(rules, '{shut_box,instant_win}', 'false'::jsonb)
 where slug in ('vanilla-12', 'call-your-shot-12', 'digital-9');

-- ---------------------------------------------------------------------------
-- Correcting a turn hands turns back only to players who were skipped
-- ---------------------------------------------------------------------------

-- Replaces 0010. The block that gives skipped players their turns back ran
-- whenever no board was empty, even when nobody had been skipped. Harmless
-- while every shut box ended the game, but with play continuing it would put
-- the next waiting player up while someone was already rolling: two players
-- 'playing', and the live board pointed at the wrong one.
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
  if exists (
    select 1 from game_players
     where game_id = p_game_id and status = 'dnp'
  ) and not exists (
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
-- An edit keeps a shut box's empty board
-- ---------------------------------------------------------------------------

-- Replaces 0013. array_agg over zero elements is NULL, not '{}', so every edit,
-- undo and after-the-fact entry turned a shut box's empty board into "no board
-- recorded". is_shut_box still came out right through its score = 0 fallback,
-- which is why nobody noticed; the board itself was lost. The order of the
-- tiles is kept as given, too.
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
           else coalesce(
             (select array_agg(t::smallint order by o)
                from jsonb_array_elements_text(v_row->'tiles_open')
                     with ordinality e(t, o)),
             '{}'::smallint[]) end,
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

-- ---------------------------------------------------------------------------
-- Privileges (create or replace keeps them, but say so where it is read)
-- ---------------------------------------------------------------------------

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'set_turn_result(uuid, uuid, uuid, smallint[], integer, integer)',
    'apply_game_results(uuid, jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;
