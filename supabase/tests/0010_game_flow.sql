-- pgTAP: the game-flow RPCs (migration 0010).
--
-- UUIDs are written out in full and SQL fragments are dollar-quoted. psql
-- variables and format() were tried first and made the quoting unreadable;
-- these tests are read far more often than they are written.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ---------------------------------------------------------------------------
-- Fixture: our own players, so nothing here depends on seed.sql or on whatever
-- else the database happens to hold.
--   Ada  a110…01   Ben  a110…02   Cleo a110…03   Benched a110…04
-- ---------------------------------------------------------------------------
insert into players (id, name, emoji, is_active) values
  ('a1100000-0000-4000-8000-000000000001', 'Flow Ada',     '🦊', true),
  ('a1100000-0000-4000-8000-000000000002', 'Flow Ben',     '🐙', true),
  ('a1100000-0000-4000-8000-000000000003', 'Flow Cleo',    '🦄', true),
  ('a1100000-0000-4000-8000-000000000004', 'Flow Benched', '🐌', false);

-- ---------------------------------------------------------------------------
-- start_game
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select start_game('a1100000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  'STB02', null,
  'a game needs at least one player'
);
select throws_ok(
  $$select start_game('a1100000-0000-4000-8000-000000000001',
      array['a1100000-0000-4000-8000-000000000001',
            'a1100000-0000-4000-8000-000000000001']::uuid[])$$,
  'STB02', null,
  'the same player cannot be listed twice'
);
select throws_ok(
  $$select start_game('a1100000-0000-4000-8000-000000000001',
      array['a1100000-0000-4000-8000-000000000004']::uuid[])$$,
  'STB02', null,
  'a benched player cannot be entered into a game'
);

select lives_ok(
  $$select start_game('a1100000-0000-4000-8000-000000000001',
      array['a1100000-0000-4000-8000-000000000001',
            'a1100000-0000-4000-8000-000000000002',
            'a1100000-0000-4000-8000-000000000003']::uuid[])$$,
  'a game starts'
);

create temporary view g as
select id from games
 where scorekeeper_player_id = 'a1100000-0000-4000-8000-000000000001'
   and status = 'in_progress';

select is(
  (select count(*)::int from g), 1,
  'exactly one live game exists for the scorekeeper'
);
select is(
  (select count(*)::int from game_players
    where game_id = (select id from g) and status = 'playing'),
  1,
  'the first player is up'
);
select is(
  (select count(*)::int from game_players
    where game_id = (select id from g) and status = 'pending'),
  2,
  'and the rest are waiting'
);
select is(
  (select player_id from game_players
    where game_id = (select id from g) and status = 'playing'),
  'a1100000-0000-4000-8000-000000000001'::uuid,
  'turn order follows the order the players were picked'
);
select is(
  (select gm.ruleset_id from games gm where gm.id = (select id from g)),
  (select s.ruleset_id from seasons s
    where s.id = (select gm.season_id from games gm where gm.id = (select id from g))),
  'the game snapshots the season''s ruleset rather than looking it up later'
);
select ok(
  exists (select 1 from live_turns where game_id = (select id from g)),
  'a live board exists to tap on'
);
select ok(
  exists (select 1 from audit_log
           where entity_id = (select id from g) and action = 'game.start'),
  'starting a game is recorded'
);

-- The duplicate-game race from v1: two colleagues both saw "no game yet today"
-- and both saved one.
select throws_ok(
  $$select start_game('a1100000-0000-4000-8000-000000000001',
      array['a1100000-0000-4000-8000-000000000002']::uuid[])$$,
  'STB09', null,
  'one scorekeeper cannot run two games at once'
);

-- ---------------------------------------------------------------------------
-- live_set_board
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select live_set_board('a1100000-0000-4000-8000-000000000002',
      (select id from g), '{5}')$$,
  'STB01', null,
  'only the scorekeeper may move tiles'
);
select throws_ok(
  $$select live_set_board('a1100000-0000-4000-8000-000000000001',
      (select id from g), '{13}')$$,
  'STB02', null,
  'a tile the board does not have is refused'
);

select is(
  live_set_board('a1100000-0000-4000-8000-000000000001',
                 (select id from g), '{1,2,3}') -> 'turn' ->> 'score_if_stop',
  '72',
  'the running score comes from the ruleset, not the client'
);

-- The action sends the whole set of tiles that are down rather than a toggle,
-- so a retried or out-of-order tap cannot leave a board nobody chose.
select is(
  live_set_board('a1100000-0000-4000-8000-000000000001',
                 (select id from g), '{3,3,1,2}') -> 'turn' ->> 'tiles_down',
  '[1, 2, 3]',
  'the board is idempotent and de-duplicates'
);
select ok(
  (live_set_board('a1100000-0000-4000-8000-000000000001',
                  (select id from g), '{1,2}') ->> 'version')::int
  > (select version from live_turns where game_id = (select id from g)) - 2,
  'every change bumps the version so a client can drop a stale broadcast'
);

-- ---------------------------------------------------------------------------
-- end_turn
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select live_set_board('a1100000-0000-4000-8000-000000000001',
      (select id from g), '{1,2,3}')$$,
  'board set up for the handover'
);
select is(
  end_turn('a1100000-0000-4000-8000-000000000001', (select id from g))
    -> 'turn' ->> 'player_id',
  'a1100000-0000-4000-8000-000000000002',
  'ending a turn hands over to the next player'
);
select is(
  (select score from game_players
    where game_id = (select id from g)
      and player_id = 'a1100000-0000-4000-8000-000000000001'),
  72,
  'and the score is computed from the board the server holds'
);
select is(
  (select tiles_open from game_players
    where game_id = (select id from g)
      and player_id = 'a1100000-0000-4000-8000-000000000001'),
  '{4,5,6,7,8,9,10,11,12}'::smallint[],
  'recording which tiles were left standing'
);
select is(
  live_game_snapshot((select id from g)) -> 'turn' ->> 'tiles_down',
  '[]',
  'the next player starts on a clear board'
);

-- A score typed in because the turn was already played on the real box.
select lives_ok(
  $$select end_turn('a1100000-0000-4000-8000-000000000001',
      (select id from g), 40)$$,
  'a score can be typed instead of tapped'
);
select ok(
  (select tiles_open is null from game_players
    where game_id = (select id from g)
      and player_id = 'a1100000-0000-4000-8000-000000000002'),
  'a typed score records no board, because there was not one'
);
select is(
  live_game_snapshot((select id from g)) -> 'leader_ids',
  jsonb_build_array('a1100000-0000-4000-8000-000000000002'),
  'the leader is worked out once, by the same rule the views use'
);

-- ---------------------------------------------------------------------------
-- Shutting the box on the last turn
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select live_set_board('a1100000-0000-4000-8000-000000000001',
      (select id from g),
      (select array_agg(t::smallint) from generate_series(1,12) t))$$,
  'the last player shuts the box'
);
select ok(
  (live_game_snapshot((select id from g)) -> 'turn' ->> 'is_shut')::boolean,
  'which the board reports'
);
select ok(
  (end_turn('a1100000-0000-4000-8000-000000000001', (select id from g))
    ->> 'all_done')::boolean,
  'and ends the game'
);

-- ---------------------------------------------------------------------------
-- finish_game
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select finish_game('a1100000-0000-4000-8000-000000000001',
      (select id from g))$$,
  'the game can be crowned'
);
select is(
  (select status::text from games where id in (
     select gm.id from games gm
      where gm.scorekeeper_player_id = 'a1100000-0000-4000-8000-000000000001'
        and gm.status = 'finished')),
  'finished',
  'which finishes it'
);

create temporary view g1done as
select id from games
 where scorekeeper_player_id = 'a1100000-0000-4000-8000-000000000001'
   and status = 'finished';

select ok(
  not exists (select 1 from live_turns where game_id = (select id from g1done)),
  'and clears the live board'
);
select ok(
  exists (select 1 from audit_log
           where entity_id = (select id from g1done) and action = 'game.finish'),
  'crowning is recorded'
);
select throws_ok(
  $$select finish_game('a1100000-0000-4000-8000-000000000001',
      (select id from g1done))$$,
  'STB03', null,
  'a finished game cannot be finished again'
);

-- ---------------------------------------------------------------------------
-- A second game, with the box shut on the FIRST of three turns
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select start_game('a1100000-0000-4000-8000-000000000002',
      array['a1100000-0000-4000-8000-000000000002',
            'a1100000-0000-4000-8000-000000000001',
            'a1100000-0000-4000-8000-000000000003']::uuid[])$$,
  'a second game starts under a different scorekeeper'
);

create temporary view g2 as
select id from games
 where scorekeeper_player_id = 'a1100000-0000-4000-8000-000000000002'
   and status = 'in_progress';

select lives_ok(
  $$select live_set_board('a1100000-0000-4000-8000-000000000002',
      (select id from g2),
      (select array_agg(t::smallint) from generate_series(1,12) t))$$,
  'the first player shuts the box'
);
select lives_ok(
  $$select end_turn('a1100000-0000-4000-8000-000000000002', (select id from g2))$$,
  'and ends their turn'
);

-- They were at the table, so they get a row saying they never rolled. v1 wrote
-- no row at all, which left a colleague who turned up statistically invisible.
select is(
  (select count(*)::int from game_players
    where game_id = (select id from g2) and status = 'dnp'),
  2,
  'the players who never got a turn are recorded as such'
);

-- Correcting the score means nobody shut the box after all, so the skipped
-- players are owed their turns back.
select is(
  set_turn_result('a1100000-0000-4000-8000-000000000002', (select id from g2),
                  'a1100000-0000-4000-8000-000000000002', '{7}', 7)
    -> 'turn' ->> 'player_id',
  'a1100000-0000-4000-8000-000000000001',
  'correcting away a shut box hands the skipped players their turns back'
);
select is(
  (select count(*)::int from game_players
    where game_id = (select id from g2) and status = 'dnp'),
  0,
  'and nobody is left marked as skipped'
);

-- [concept: all or nothing] finish_game writes the status, clears the live
-- board and appends an audit row. If it refuses partway, none of that can have
-- happened — which is exactly what v1's insert-then-compensating-delete could
-- not promise.
select throws_ok(
  $$select finish_game('a1100000-0000-4000-8000-000000000002',
      (select id from g2))$$,
  'STB03', null,
  'a game with turns still to play cannot be finished'
);
select is(
  (select status::text from games where id = (select id from g2)),
  'in_progress',
  'and the refused finish left the game exactly as it was'
);
select ok(
  exists (select 1 from live_turns where game_id = (select id from g2)),
  'with its live board intact'
);
select ok(
  not exists (select 1 from audit_log
               where entity_id = (select id from g2) and action = 'game.finish'),
  'and wrote no audit row for a finish that did not happen'
);

select * from finish();
rollback;
