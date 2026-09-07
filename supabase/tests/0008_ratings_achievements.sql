-- pgTAP: the rating replay and the badge evaluator (0008, 0009, 0012).
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ---------------------------------------------------------------------------
-- Fixture: two fresh players and one decisive game.
--   Rho  cc11…01   Sig  cc11…02   Tau cc11…03
-- ---------------------------------------------------------------------------
insert into players (id, name, emoji) values
  ('cc110000-0000-4000-8000-000000000001', 'Rate Rho', '🦊'),
  ('cc110000-0000-4000-8000-000000000002', 'Rate Sig', '🐙'),
  ('cc110000-0000-4000-8000-000000000003', 'Rate Tau', '🦄');

insert into games (id, played_on, ruleset_id, season_id, status, finished_at)
values ('dd110000-0000-4000-8000-000000000001', '2026-03-02',
        default_ruleset_id(), ensure_season('2026-03-02'), 'finished',
        '2026-03-02T12:45:00Z');

-- Rho leaves tile 5 up (score 5) and beats Sig, who leaves tile 10 up.
insert into game_players (game_id, player_id, score, tiles_open, turn_order, status)
values ('dd110000-0000-4000-8000-000000000001',
        'cc110000-0000-4000-8000-000000000001',  5, '{5}',  1, 'done'),
       ('dd110000-0000-4000-8000-000000000001',
        'cc110000-0000-4000-8000-000000000002', 10, '{10}', 2, 'done');

select lives_ok('select recompute_ratings()', 'the replay runs');

-- ---------------------------------------------------------------------------
-- Elo, computed by hand
--
-- Both players start at 1000, so the expected score is exactly 0.5 each way.
-- Neither has ten rated games, so K is the provisional 64, and with a single
-- opponent K/(m-1) is 64. The winner therefore moves 64 * (1 - 0.5) = +32 and
-- the loser 64 * (0 - 0.5) = -32.
-- ---------------------------------------------------------------------------
select is(
  (select rating_before from rating_events
    where player_id = 'cc110000-0000-4000-8000-000000000001'),
  1000.00::numeric(8,2),
  'a new player starts at 1000'
);
select is(
  (select k from rating_events
    where player_id = 'cc110000-0000-4000-8000-000000000001'),
  64::smallint,
  'and is rated provisionally, at twice the settled K'
);
select is(
  (select opponents from rating_events
    where player_id = 'cc110000-0000-4000-8000-000000000001'),
  1::smallint,
  'against one opponent'
);
select is(
  (select delta from rating_events
    where player_id = 'cc110000-0000-4000-8000-000000000001'),
  32.00::numeric(8,2),
  'the winner gains exactly 32'
);
select is(
  (select delta from rating_events
    where player_id = 'cc110000-0000-4000-8000-000000000002'),
  (-32.00)::numeric(8,2),
  'and the loser loses exactly 32'
);
select is(
  (select sum(delta) from rating_events
    where game_id = 'dd110000-0000-4000-8000-000000000001'),
  0.00::numeric,
  'so an evenly matched game is zero sum'
);
select is(
  (select rating from player_ratings
    where player_id = 'cc110000-0000-4000-8000-000000000001'),
  1032.00::numeric(8,2),
  'the current rating is the last event'
);
select ok(
  not (select is_established from player_ratings
        where player_id = 'cc110000-0000-4000-8000-000000000001'),
  'one game is not enough to call a rating established'
);

-- A game nobody can lose is not evidence of anything.
insert into games (id, played_on, ruleset_id, season_id, status, finished_at)
values ('dd110000-0000-4000-8000-000000000002', '2026-03-03',
        default_ruleset_id(), ensure_season('2026-03-03'), 'finished',
        '2026-03-03T12:45:00Z');
insert into game_players (game_id, player_id, score, tiles_open, turn_order, status)
values ('dd110000-0000-4000-8000-000000000002',
        'cc110000-0000-4000-8000-000000000003', 7, '{7}', 1, 'done');

select lives_ok('select recompute_ratings()', 'the replay handles a solo game');
select is(
  (select count(*)::int from rating_events
    where game_id = 'dd110000-0000-4000-8000-000000000002'),
  0,
  'a solo game is not rated, because there was nobody to beat'
);

-- [concept: full replay] Running it again must produce byte-identical history,
-- otherwise a rating would drift every time a game was edited.
create temporary table ratings_before on commit drop as
select * from rating_events;
select lives_ok('select recompute_ratings()', 'the replay runs a second time');
select is(
  (select count(*)::int from (
     (select * from ratings_before except select * from rating_events)
     union all
     (select * from rating_events except select * from ratings_before)
   ) d),
  0,
  'and produces exactly the same history'
);

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
select lives_ok('select evaluate_achievements()', 'the evaluator runs');

select ok(
  exists (select 1 from player_achievements
           where player_id = 'cc110000-0000-4000-8000-000000000001'
             and achievement_key = 'first_blood'),
  'winning a day for the first time earns First Blood'
);
select ok(
  not exists (select 1 from player_achievements
               where player_id = 'cc110000-0000-4000-8000-000000000002'
                 and achievement_key = 'first_blood'),
  'and losing does not'
);
select is(
  (select earned_at from player_achievements
    where player_id = 'cc110000-0000-4000-8000-000000000001'
      and achievement_key = 'first_blood'),
  '2026-03-02T12:45:00Z'::timestamptz,
  'dated to the game that earned it, not to when it was worked out'
);

-- Neither fixture player shut a box or scored under four, so those badges must
-- not appear FOR THEM. Scoped on purpose: these tests run on top of whatever
-- else the database holds, so a global assertion here would fail the moment
-- anyone else had ever scored three.
select ok(
  not exists (
    select 1 from player_achievements
     where achievement_key in ('shut_the_box', 'low_roller')
       and player_id in ('cc110000-0000-4000-8000-000000000001',
                         'cc110000-0000-4000-8000-000000000002',
                         'cc110000-0000-4000-8000-000000000003')
  ),
  'a badge neither fixture player earned is not awarded to them'
);

-- Idempotency matters more here than for ratings: a badge that appeared and
-- disappeared on every recount would fire a "new badge" toast each time.
create temporary table badges_before on commit drop as
select * from player_achievements;
select lives_ok('select evaluate_achievements()', 'the evaluator runs again');
select is(
  (select count(*)::int from (
     (select * from badges_before except select * from player_achievements)
     union all
     (select * from player_achievements except select * from badges_before)
   ) d),
  0,
  'and awards exactly the same badges, with the same dates'
);

-- ---------------------------------------------------------------------------
-- Correcting history takes badges back
-- ---------------------------------------------------------------------------

-- Rho did not win after all: Sig's score is corrected below hers.
update game_players set score = 1, tiles_open = '{1}'
 where game_id = 'dd110000-0000-4000-8000-000000000001'
   and player_id = 'cc110000-0000-4000-8000-000000000002';
select lives_ok('select evaluate_achievements()', 're-evaluating after a correction');
select ok(
  not exists (select 1 from player_achievements
               where player_id = 'cc110000-0000-4000-8000-000000000001'
                 and achievement_key = 'first_blood'),
  'a badge earned by a score that was wrong is taken back'
);
select ok(
  exists (select 1 from player_achievements
           where player_id = 'cc110000-0000-4000-8000-000000000002'
             and achievement_key = 'first_blood'),
  'and awarded to whoever actually won'
);

select * from finish();
rollback;
