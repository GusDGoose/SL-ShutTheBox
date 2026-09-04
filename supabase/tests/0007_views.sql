-- pgTAP: game lifecycle, invariants and the rebuilt stats views (0005-0007).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- ---------------------------------------------------------------------------
-- Fixture
--
-- Self-contained: its own players and rulesets, so it does not depend on
-- seed.sql. Games cover every state the views have to reason about.
-- ---------------------------------------------------------------------------

insert into players (id, name, emoji) values
  ('aaaa0000-0000-0000-0000-000000000001', 'Fixture Ada',  '🦊'),
  ('aaaa0000-0000-0000-0000-000000000002', 'Fixture Ben',  '🐙'),
  ('aaaa0000-0000-0000-0000-000000000003', 'Fixture Cleo', '🦄');

-- A highest-wins ruleset, to prove the views are not hard-coded to "lowest".
insert into rulesets (id, slug, name, is_active, rules)
values (
  'bbbb0000-0000-0000-0000-000000000001',
  'fixture-highest',
  'Fixture Highest Wins',
  false,
  jsonb_set(
    (select rules from rulesets where slug = 'vanilla-12'),
    '{win}', '"highest"'::jsonb)
);

-- A tie-break-by-turn-order ruleset.
insert into rulesets (id, slug, name, is_active, rules)
values (
  'bbbb0000-0000-0000-0000-000000000002',
  'fixture-earliest',
  'Fixture Earliest Turn',
  false,
  jsonb_set(
    (select rules from rulesets where slug = 'vanilla-12'),
    '{ties}', '"earliest_turn"'::jsonb)
);

-- played_on values are deliberately consecutive-but-with-a-gap so the streak
-- tests can prove which days count as "played".
insert into games (id, played_on, ruleset_id, season_id, status, finished_at, deleted_at)
values
  -- day 1: Ada wins
  ('ccc00000-0000-0000-0000-000000000001', '2026-09-01', default_ruleset_id(), ensure_season('2026-09-01'), 'finished', now(), null),
  -- day 2: soft-deleted, so this day was never really played
  ('ccc00000-0000-0000-0000-000000000002', '2026-09-02', default_ruleset_id(), ensure_season('2026-09-02'), 'finished', now(), now()),
  -- day 3: Ada wins again
  ('ccc00000-0000-0000-0000-000000000003', '2026-09-03', default_ruleset_id(), ensure_season('2026-09-03'), 'finished', now(), null),
  -- day 4: a shared win, and Cleo never gets a turn
  ('ccc00000-0000-0000-0000-000000000004', '2026-09-04', default_ruleset_id(), ensure_season('2026-09-04'), 'finished', now(), null),
  -- excluded: still being played
  ('ccc00000-0000-0000-0000-000000000005', '2026-09-05', default_ruleset_id(), ensure_season('2026-09-05'), 'in_progress', null, null),
  -- excluded: abandoned
  ('ccc00000-0000-0000-0000-000000000006', '2026-09-06', default_ruleset_id(), ensure_season('2026-09-06'), 'abandoned', null, null),
  -- excluded: finished but nobody actually played (the v1 orphan-row shape)
  ('ccc00000-0000-0000-0000-000000000007', '2026-09-07', default_ruleset_id(), ensure_season('2026-09-07'), 'finished', now(), null),
  -- highest wins
  ('ccc00000-0000-0000-0000-000000000008', '2026-09-08', 'bbbb0000-0000-0000-0000-000000000001', ensure_season('2026-09-08'), 'finished', now(), null),
  -- tie broken by turn order
  ('ccc00000-0000-0000-0000-000000000009', '2026-09-09', 'bbbb0000-0000-0000-0000-000000000002', ensure_season('2026-09-09'), 'finished', now(), null);

insert into game_players (game_id, player_id, score, tiles_open, turn_order, status) values
  -- day 1: Ada 5 beats Ben 10
  ('ccc00000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001',  5, '{5}',    1, 'done'),
  ('ccc00000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002', 10, '{10}',   2, 'done'),
  -- day 2 (deleted): Ben would have won
  ('ccc00000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002',  1, '{1}',    1, 'done'),
  ('ccc00000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 20, '{9,11}', 2, 'done'),
  -- day 3: Ada 3 beats Ben 8
  ('ccc00000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000001',  3, '{3}',    1, 'done'),
  ('ccc00000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000002',  8, '{8}',    2, 'done'),
  -- day 4: Ada shuts the box, Ben ties nothing, Cleo never rolled
  ('ccc00000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000001',  0, '{}',     1, 'done'),
  ('ccc00000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000002',  7, '{7}',    2, 'done'),
  -- highest wins: Ben's 30 should beat Ada's 4
  ('ccc00000-0000-0000-0000-000000000008', 'aaaa0000-0000-0000-0000-000000000001',  4, '{4}',    1, 'done'),
  ('ccc00000-0000-0000-0000-000000000008', 'aaaa0000-0000-0000-0000-000000000002', 30, '{12,7,11}', 2, 'done'),
  -- earliest_turn tie: both on 6, Ada played first
  ('ccc00000-0000-0000-0000-000000000009', 'aaaa0000-0000-0000-0000-000000000001',  6, '{6}',    1, 'done'),
  ('ccc00000-0000-0000-0000-000000000009', 'aaaa0000-0000-0000-0000-000000000002',  6, '{6}',    2, 'done');

-- Cleo was at the table on day 4 but the box was shut before her turn.
insert into game_players (game_id, player_id, turn_order, status)
values ('ccc00000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000003', 3, 'dnp');

-- The "finished but nobody played" game: rows exist, none of them done.
insert into game_players (game_id, player_id, turn_order, status)
values ('ccc00000-0000-0000-0000-000000000007', 'aaaa0000-0000-0000-0000-000000000001', 1, 'pending');

-- ---------------------------------------------------------------------------
-- games_valid — the one definition of a real game
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from games_valid where id = 'ccc00000-0000-0000-0000-000000000001'),
  'a finished game with results counts'
);
select ok(
  not exists (select 1 from games_valid where id = 'ccc00000-0000-0000-0000-000000000002'),
  'a soft-deleted game does not count'
);
select ok(
  not exists (select 1 from games_valid where id = 'ccc00000-0000-0000-0000-000000000005'),
  'a game still in progress does not count'
);
select ok(
  not exists (select 1 from games_valid where id = 'ccc00000-0000-0000-0000-000000000006'),
  'an abandoned game does not count'
);
select ok(
  not exists (select 1 from games_valid where id = 'ccc00000-0000-0000-0000-000000000007'),
  'a finished game nobody played does not count'
);

-- ---------------------------------------------------------------------------
-- game_results
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000004'),
  2,
  'a player who never got a turn is not a result'
);
select is(
  (select player_id from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000001' and is_winner),
  'aaaa0000-0000-0000-0000-000000000001'::uuid,
  'the lowest score wins under vanilla'
);
select is(
  (select finish_position from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000001'
      and player_id = 'aaaa0000-0000-0000-0000-000000000002'),
  2::bigint,
  'and the other player finishes second'
);
select ok(
  (select is_shut_box from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000004'
      and player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  'an empty board is a shut box'
);
select ok(
  not (select is_shut_box from game_results
        where game_id = 'ccc00000-0000-0000-0000-000000000004'
          and player_id = 'aaaa0000-0000-0000-0000-000000000002'),
  'a non-empty board is not'
);
select is(
  (select participants from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000001'
      and player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  2::bigint,
  'participants counts the players who actually played'
);

-- Win direction comes from the ruleset, so a highest-wins season needs no
-- special case anywhere in the views.
select is(
  (select player_id from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000008' and is_winner),
  'aaaa0000-0000-0000-0000-000000000002'::uuid,
  'the HIGHEST score wins under a highest-wins ruleset'
);

-- Tie policy also comes from the ruleset.
select is(
  (select count(*)::int from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000009' and is_winner),
  1,
  'ties: earliest_turn produces a single winner'
);
select is(
  (select player_id from game_results
    where game_id = 'ccc00000-0000-0000-0000-000000000009' and is_winner),
  'aaaa0000-0000-0000-0000-000000000001'::uuid,
  'and it is whoever played first'
);

-- ---------------------------------------------------------------------------
-- daily_winners
-- ---------------------------------------------------------------------------
select ok(
  not exists (select 1 from daily_winners where played_on = '2026-09-02'),
  'a deleted game leaves nobody winning that day'
);
select is(
  (select count(*)::int from daily_winners where played_on = '2026-09-01'),
  1,
  'one winner on a decisive day'
);

-- ---------------------------------------------------------------------------
-- player_stats
-- ---------------------------------------------------------------------------
select is(
  (select games_played from player_stats
    where player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  5,
  'games_played counts only valid games (days 1, 3, 4, 8, 9)'
);
select is(
  (select games_played from player_stats
    where player_id = 'aaaa0000-0000-0000-0000-000000000003'),
  0,
  'a turn nobody got is not a game played'
);
select is(
  (select dnp_count from player_stats
    where player_id = 'aaaa0000-0000-0000-0000-000000000003'),
  1,
  'but it is counted, so a colleague who turned up is not invisible'
);
select is(
  (select shut_boxes from player_stats
    where player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  1,
  'shut boxes are counted'
);
select is(
  (select best_score from player_stats
    where player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  0,
  'best_score is the all-time best, straight from SQL'
);
select is(
  (select win_pct from player_stats
    where player_id = 'aaaa0000-0000-0000-0000-000000000003'),
  null,
  'win_pct is null rather than a division by zero for a player with no games'
);

-- ---------------------------------------------------------------------------
-- player_streaks — the phantom-day bug
-- ---------------------------------------------------------------------------

-- Days 1 and 3 are consecutive PLAYED days, because day 2's game is deleted.
-- In v1 an orphan games row put a day nobody won into the index and reset
-- everybody's current streak.
select is(
  (select best_streak from player_streaks
    where player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  3,
  'a deleted day does not break a streak (days 1, 3 and 4 run together)'
);
-- Ben only ever won the deleted day and day 8, so the deleted one must not
-- show up as a win at all.
select is(
  (select best_streak from player_streaks
    where player_id = 'aaaa0000-0000-0000-0000-000000000002'),
  1,
  'a win on a deleted day is not a win'
);

-- The most recent played day is day 9, which Ada won.
select is(
  (select current_streak from player_streaks
    where player_id = 'aaaa0000-0000-0000-0000-000000000001'),
  1,
  'a current streak counts when you won the most recent played day'
);
select is(
  (select current_streak from player_streaks
    where player_id = 'aaaa0000-0000-0000-0000-000000000002'),
  0,
  'and is zero when you did not, however recently you last won'
);

-- ---------------------------------------------------------------------------
-- Head to head and nemesis
-- ---------------------------------------------------------------------------
select is(
  (select meetings from head_to_head
    where a_id = 'aaaa0000-0000-0000-0000-000000000001'
      and b_id = 'aaaa0000-0000-0000-0000-000000000002'),
  5,
  'head_to_head counts only valid meetings'
);
select is(
  (select a_wins from head_to_head
    where a_id = 'aaaa0000-0000-0000-0000-000000000001'
      and b_id = 'aaaa0000-0000-0000-0000-000000000002'),
  4,
  'and finishing ahead is what counts as a win, whatever the direction'
);
select is(
  (select ties from head_to_head
    where a_id = 'aaaa0000-0000-0000-0000-000000000001'
      and b_id = 'aaaa0000-0000-0000-0000-000000000002'),
  0,
  'the earliest_turn game is not a tie, because it was broken'
);
select ok(
  not exists (
    select 1 from player_nemesis
     where player_id = 'aaaa0000-0000-0000-0000-000000000003'
  ),
  'a nemesis needs at least five meetings'
);

-- ---------------------------------------------------------------------------
-- Seasons and trends
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from season_standings
    where season_id = ensure_season('2026-09-01')),
  2,
  'season standings cover the players who played that season'
);
select is(
  (select player_id from season_standings
    where season_id = ensure_season('2026-09-01') and rnk = 1),
  'aaaa0000-0000-0000-0000-000000000001'::uuid,
  'and rank by day wins first'
);
select ok(
  not exists (select 1 from season_champions
               where season_id = ensure_season(stockholm_today())),
  'the season currently being played has no champion yet'
);
select is(
  (select games from player_trends
    where player_id = 'aaaa0000-0000-0000-0000-000000000001'
      and month = '2026-09-01'::date),
  5,
  'monthly trends count valid games'
);

-- ---------------------------------------------------------------------------
-- Live games
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from live_games),
  1,
  'only the in-progress game is live'
);
select is(
  (select id from live_games),
  'ccc00000-0000-0000-0000-000000000005'::uuid,
  'and it is the right one'
);

select * from finish();
rollback;
