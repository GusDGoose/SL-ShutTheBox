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
