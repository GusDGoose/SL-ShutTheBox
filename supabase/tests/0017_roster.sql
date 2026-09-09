-- pgTAP: joining and leaving a game in progress (migration 0017).
--
-- The rulebook Gustav approved on 2026-09-08:
--   * a late joiner slots in LAST; if everyone has already rolled they are up
--     at once and the game re-opens for exactly one turn;
--   * no joining after a shut box under an instant-win ruleset;
--   * leaving means "was picked, is not going to play": only a `pending` row
--     can go, and it is removed entirely — never marked dnp, which stays
--     reserved for "the box was shut before their turn";
--   * `playing` must end or abandon the turn first; `done` is never removable;
--   * the scorekeeper hands over before leaving;
--   * scorekeeper only, one broadcast each, audited as game.join / game.leave.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into players (id, name, emoji, is_active) values
  ('ff110000-0000-4000-8000-000000000001', 'Roster Ada',  '🦊', true),
  ('ff110000-0000-4000-8000-000000000002', 'Roster Ben',  '🐙', true),
  ('ff110000-0000-4000-8000-000000000003', 'Roster Cleo', '🦄', true),
  ('ff110000-0000-4000-8000-000000000004', 'Roster Dev',  '🐝', true),
  ('ff110000-0000-4000-8000-000000000005', 'Roster Eve',  '🦉', false);

-- Ada keeps score but rolls second, so a pending scorekeeper exists to test.
select lives_ok(
  $$select start_game('ff110000-0000-4000-8000-000000000001',
      array['ff110000-0000-4000-8000-000000000002',
            'ff110000-0000-4000-8000-000000000001',
            'ff110000-0000-4000-8000-000000000003']::uuid[])$$,
  'a game is under way: Ben rolling, Ada and Cleo waiting'
);

create temporary view roster_game as
select id from games
 where scorekeeper_player_id = 'ff110000-0000-4000-8000-000000000001'
   and status = 'in_progress';

create temporary table version_seen on commit drop as
select version from live_turns where game_id = (select id from roster_game);

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select join_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000004')$$,
  'a late arrival can be added by the scorekeeper'
);
select is(
  (select turn_order::int from game_players
    where game_id = (select id from roster_game)
      and player_id = 'ff110000-0000-4000-8000-000000000004'),
  4,
  'and slots in last'
);
select is(
  (select status::text from game_players
    where game_id = (select id from roster_game)
      and player_id = 'ff110000-0000-4000-8000-000000000004'),
  'pending',
  'waiting for a turn like everyone else still to play'
);
select is(
  (select version from live_turns where game_id = (select id from roster_game)),
  (select version + 1 from version_seen),
  'the join touched the live board exactly once — one broadcast'
);
select ok(
  exists (select 1 from audit_log
           where action = 'game.join'
             and entity_id = (select id from roster_game)
             and after->>'player_id' = 'ff110000-0000-4000-8000-000000000004'),
  'and it is in the trail, naming who joined'
);

select throws_ok(
  $$select join_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000004')$$,
  'STB02', null,
  'a player cannot be added twice'
);
select throws_ok(
  $$select join_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000005')$$,
  'STB02', null,
  'nor someone who is off the active roster'
);
select throws_ok(
  $$select join_game('ff110000-0000-4000-8000-000000000002',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000003')$$,
  'STB01', null,
  'and only the scorekeeper may add anyone'
);

-- ---------------------------------------------------------------------------
-- Leaving
-- ---------------------------------------------------------------------------
update version_seen
   set version = (select version from live_turns where game_id = (select id from roster_game));

select lives_ok(
  $$select leave_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000003')$$,
  'a player who has not rolled can be removed'
);
select ok(
  not exists (select 1 from game_players
               where game_id = (select id from roster_game)
                 and player_id = 'ff110000-0000-4000-8000-000000000003'),
  'and is gone entirely — not marked dnp, which means something else'
);
select is(
  (select version from live_turns where game_id = (select id from roster_game)),
  (select version + 1 from version_seen),
  'the leave touched the live board exactly once — one broadcast'
);
select ok(
  exists (select 1 from audit_log
           where action = 'game.leave'
             and entity_id = (select id from roster_game)
             and before->>'player_id' = 'ff110000-0000-4000-8000-000000000003'),
  'and it is in the trail, naming who left'
);

select throws_ok(
  $$select leave_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000002')$$,
  'STB03', null,
  'a player mid-turn has to end or abandon the turn first'
);
select throws_ok(
  $$select leave_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000001')$$,
  'STB01', null,
  'the scorekeeper hands over before leaving'
);
select throws_ok(
  $$select leave_game('ff110000-0000-4000-8000-000000000002',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000004')$$,
  'STB01', null,
  'and only the scorekeeper may remove anyone'
);

-- Ben rolls, so there is a done player to refuse.
do $turn$
declare v_game uuid;
begin
  select id into v_game from roster_game;
  perform end_turn('ff110000-0000-4000-8000-000000000001', v_game, 30);
end
$turn$;

select throws_ok(
  $$select leave_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000002')$$,
  'STB03', null,
  'a player who has played is never removable — the score stands'
);

-- ---------------------------------------------------------------------------
-- Joining after everyone has rolled re-opens the game for one turn
-- ---------------------------------------------------------------------------
do $out$
declare v_game uuid;
begin
  select id into v_game from roster_game;
  perform end_turn('ff110000-0000-4000-8000-000000000001', v_game, 20);  -- Ada
  perform end_turn('ff110000-0000-4000-8000-000000000001', v_game, 25);  -- Dev
end
$out$;

select ok(
  (select (live_game_snapshot((select id from roster_game)))->>'all_done')::boolean,
  'everyone has rolled; the scorekeeper is on the review screen'
);
select lives_ok(
  $$select join_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game), 'ff110000-0000-4000-8000-000000000003')$$,
  'Cleo comes back and is added again'
);
select is(
  (select status::text from game_players
    where game_id = (select id from roster_game)
      and player_id = 'ff110000-0000-4000-8000-000000000003'),
  'playing',
  'and is up at once, since nobody else is waiting'
);
select is(
  (select player_id from live_turns where game_id = (select id from roster_game)),
  'ff110000-0000-4000-8000-000000000003'::uuid,
  'with the live board pointed at her'
);
select throws_ok(
  $$select finish_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game))$$,
  'STB03', null,
  'so the game cannot be crowned until she has rolled'
);

do $last$
declare v_game uuid;
begin
  select id into v_game from roster_game;
  perform end_turn('ff110000-0000-4000-8000-000000000001', v_game, 40);
end
$last$;
select lives_ok(
  $$select finish_game('ff110000-0000-4000-8000-000000000001',
      (select id from roster_game))$$,
  'and can be once she has'
);

-- ---------------------------------------------------------------------------
-- No joining after a shut box
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select start_game('ff110000-0000-4000-8000-000000000002',
      array['ff110000-0000-4000-8000-000000000002',
            'ff110000-0000-4000-8000-000000000004']::uuid[])$$,
  'a second game: Ben and Dev'
);
create temporary view shut_game as
select id from games
 where scorekeeper_player_id = 'ff110000-0000-4000-8000-000000000002'
   and status = 'in_progress';

do $shut$
declare v_game uuid;
begin
  select id into v_game from shut_game;
  perform live_set_board('ff110000-0000-4000-8000-000000000002', v_game,
                         '{1,2,3,4,5,6,7,8,9,10,11,12}');
  perform end_turn('ff110000-0000-4000-8000-000000000002', v_game);  -- shut
end
$shut$;

select throws_ok(
  $$select join_game('ff110000-0000-4000-8000-000000000002',
      (select id from shut_game), 'ff110000-0000-4000-8000-000000000003')$$,
  'STB02', null,
  'the box was shut, the game is over by rule, nobody joins now'
);

select * from finish();
rollback;
