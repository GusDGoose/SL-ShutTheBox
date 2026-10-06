-- pgTAP: a shut box no longer ends the game, and one game a day counts
-- (migration 0023).
--
-- On 2026-10-01 and 2026-10-05 a shut box on the second turn ended the game on
-- the spot, the rest of the table played another one, and that second game
-- counted as a win of its own. The house rules since: everybody plays their
-- turn, a zero simply wins, and a day has one game — finished and not deleted.
--
-- Dates are in 2019 so nothing here collides with games a dev database holds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Part B plays today's game; a dev database may already hold a real one.
update games set deleted_at = now()
 where played_on = stockholm_today() and status = 'finished' and deleted_at is null;
update games set status = 'abandoned'
 where played_on = stockholm_today() and status = 'in_progress' and deleted_at is null;

insert into players (id, name, emoji) values
  ('fd230000-0000-4000-8000-000000000001', 'Day Ivy',  '🦊'),
  ('fd230000-0000-4000-8000-000000000002', 'Day Jon',  '🐙');

-- ---------------------------------------------------------------------------
-- A. Play continues after a shut box
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from rulesets
    where slug in ('vanilla-12', 'call-your-shot-12', 'digital-9')
      and ruleset_instant_win(rules)),
  0,
  'no seeded ruleset ends the game on a shut box any more'
);
select is(
  (select ruleset_validation_error(
            jsonb_set(rules, '{shut_box,instant_win}', 'true'::jsonb))
     from rulesets where slug = 'vanilla-12'),
  null,
  'the setting itself stays: a seasonal ruleset may still turn it back on'
);

-- An empty board is how a shut box is told apart from a typed 0. Every edit
-- used to rebuild the roster through array_agg over zero elements, which is
-- NULL, so correcting any game quietly forgot that its shut box was a board.
select lives_ok(
  $$select add_manual_game('fd230000-0000-4000-8000-000000000001', '2019-03-04',
      jsonb_build_array(
        jsonb_build_object('player_id','fd230000-0000-4000-8000-000000000001',
                           'status','done','score',0,
                           'tiles_open',jsonb_build_array()),
        jsonb_build_object('player_id','fd230000-0000-4000-8000-000000000002',
                           'status','done','score',12,
                           'tiles_open',jsonb_build_array(5,7))))$$,
  'a shut box can be recorded after the fact'
);
select is(
  (select gp.tiles_open from game_players gp join games g on g.id = gp.game_id
    where g.played_on = '2019-03-04'
      and gp.player_id = 'fd230000-0000-4000-8000-000000000001'),
  '{}'::smallint[],
  'keeping its empty board'
);

do $edit$
declare v_game uuid;
begin
  select id into v_game from games where played_on = '2019-03-04'
     and created_by = 'fd230000-0000-4000-8000-000000000001';
  perform edit_game('fd230000-0000-4000-8000-000000000001', v_game, '2019-03-04',
    (game_snapshot(v_game))->'players', 'no-op edit');
end
$edit$;

select is(
  (select gp.tiles_open from game_players gp join games g on g.id = gp.game_id
    where g.played_on = '2019-03-04'
      and gp.player_id = 'fd230000-0000-4000-8000-000000000001'),
  '{}'::smallint[],
  'and an edit keeps it too, instead of turning it into NULL'
);

-- ---------------------------------------------------------------------------
-- B. One counted game per day
-- ---------------------------------------------------------------------------
select index_is_unique('public', 'games', 'games_one_counted_per_day',
  'a day holds one counted game, by a unique index');
select hasnt_index('public', 'games', 'games_valid_idx',
  'which replaces the plain index over the same rows');

-- One rows-builder, so every manual game below is the same two players.
create function pg_temp.two(p_a int, p_b int) returns jsonb language sql as $f$
  select jsonb_build_array(
    jsonb_build_object('player_id','fd230000-0000-4000-8000-000000000001',
                       'status','done','score',p_a),
    jsonb_build_object('player_id','fd230000-0000-4000-8000-000000000002',
                       'status','done','score',p_b))
$f$;

select throws_ok(
  $$select add_manual_game('fd230000-0000-4000-8000-000000000001', '2019-03-04',
      pg_temp.two(3, 9))$$,
  'STB13', null,
  'a second game on a day that has its game is refused'
);
select throws_ok(
  $$insert into games (played_on, ruleset_id, season_id, status, finished_at)
    values ('2019-03-04', default_ruleset_id(), ensure_season('2019-03-04'),
            'finished', now())$$,
  '23505', null,
  'and so it is past the functions, by the index'
);
select lives_ok(
  $$insert into games (played_on, ruleset_id, season_id, status, finished_at, deleted_at)
    values ('2019-03-04', default_ruleset_id(), ensure_season('2019-03-04'),
            'abandoned', null, null),
           ('2019-03-04', default_ruleset_id(), ensure_season('2019-03-04'),
            'finished', now(), now())$$,
  'an abandoned game and a deleted one do not take the day'
);

create temporary view day_game as
select id, played_on, deleted_at from games
 where created_by = 'fd230000-0000-4000-8000-000000000001';

select lives_ok(
  $$select add_manual_game('fd230000-0000-4000-8000-000000000001', '2019-03-05',
      pg_temp.two(3, 9))$$,
  'the next day is free'
);
select throws_ok(
  $$select edit_game('fd230000-0000-4000-8000-000000000001',
      (select id from day_game where played_on = '2019-03-05'), '2019-03-04',
      pg_temp.two(3, 9))$$,
  'STB13', null,
  'moving a game onto a day that has its game is refused'
);
select lives_ok(
  $$select edit_game('fd230000-0000-4000-8000-000000000001',
      (select id from day_game where played_on = '2019-03-05'), '2019-03-05',
      pg_temp.two(4, 9))$$,
  'correcting a game on its own day is not'
);

-- Deleting frees the day; the deleted game cannot then come back over the top
-- of the one that replaced it.
select lives_ok(
  $$select delete_game('fd230000-0000-4000-8000-000000000001',
      (select id from day_game where played_on = '2019-03-04'), 'test')$$,
  'a mistaken game is deleted'
);
select lives_ok(
  $$select add_manual_game('fd230000-0000-4000-8000-000000000001', '2019-03-04',
      pg_temp.two(2, 9))$$,
  'which frees its day for the real one'
);
select throws_ok(
  $$select restore_game('fd230000-0000-4000-8000-000000000001',
      (select id from day_game where played_on = '2019-03-04' and deleted_at is not null))$$,
  'STB13', null,
  'restoring the deleted one onto a day that has its game is refused'
);
select throws_ok(
  $$select undo_game_change('fd230000-0000-4000-8000-000000000001',
      (select max(id) from audit_log
        where entity_id = (select id from day_game
                            where played_on = '2019-03-04' and deleted_at is not null)))$$,
  'STB13', null,
  'and so is undoing the delete'
);

-- Undoing a move puts the game back on its old day, which may have been taken
-- in the meantime.
select lives_ok(
  $$select edit_game('fd230000-0000-4000-8000-000000000001',
      (select id from day_game where played_on = '2019-03-05'), '2019-03-06',
      pg_temp.two(4, 9))$$,
  'a game moves to a free day'
);
select lives_ok(
  $$select add_manual_game('fd230000-0000-4000-8000-000000000001', '2019-03-05',
      pg_temp.two(5, 9))$$,
  'and its old day gets a game of its own'
);
select throws_ok(
  $$select undo_game_change('fd230000-0000-4000-8000-000000000001',
      (select max(id) from audit_log
        where entity_id = (select id from day_game where played_on = '2019-03-06')))$$,
  'STB13', null,
  'so undoing the move is refused'
);

-- Today, while a game is being played, nothing is recorded over its head.
insert into games (played_on, ruleset_id, season_id, status,
                   scorekeeper_player_id, created_by)
values (stockholm_today(), default_ruleset_id(), ensure_season(stockholm_today()),
        'in_progress', 'fd230000-0000-4000-8000-000000000002',
        'fd230000-0000-4000-8000-000000000002');
select throws_ok(
  $$select add_manual_game('fd230000-0000-4000-8000-000000000001', stockholm_today(),
      pg_temp.two(3, 9))$$,
  'STB14', null,
  'a game is not recorded for today while one is being played'
);

select * from finish();
rollback;
