-- pgTAP: correcting the record (migration 0013).
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ---------------------------------------------------------------------------
-- Fixture: two players, two games played on separate days.
--   Vee  ee11…01   Wren ee11…02
-- ---------------------------------------------------------------------------
insert into players (id, name, emoji) values
  ('ee110000-0000-4000-8000-000000000001', 'Edit Vee',  '🦊'),
  ('ee110000-0000-4000-8000-000000000002', 'Edit Wren', '🐙');

create temporary view vee_games as
select id, played_on, deleted_at from games
 where created_by = 'ee110000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Adding a game that was played without the app
--
-- v1 could only ever record today: played_on came from a database default and
-- nothing could override it, so a forgotten Friday was lost for good.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select add_manual_game('ee110000-0000-4000-8000-000000000001', '2026-05-04',
      jsonb_build_array(
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000001',
                           'status','done','score',5,
                           'tiles_open',jsonb_build_array(5)),
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000002',
                           'status','done','score',12,
                           'tiles_open',jsonb_build_array(5,7))),
      'played on the real box, logged after')$$,
  'a game can be added for a day in the past'
);

select is(
  (select count(*)::int from vee_games where played_on = '2026-05-04'),
  1,
  'and it is dated to the day it was played'
);
select is(
  (select seasons.slug from vee_games
     join seasons on seasons.id = (select season_id from games
                                    where games.id = vee_games.id)
    where vee_games.played_on = '2026-05-04'),
  '2026-Q2',
  'landing in the season that contains that day, not the current one'
);
select throws_ok(
  $$select add_manual_game('ee110000-0000-4000-8000-000000000001',
      (stockholm_today() + 1)::date,
      jsonb_build_array(jsonb_build_object(
        'player_id','ee110000-0000-4000-8000-000000000001',
        'status','done','score',5,'tiles_open',jsonb_build_array(5))))$$,
  'STB06', null,
  'but not for a day that has not happened yet'
);
select throws_ok(
  $$select add_manual_game('ee110000-0000-4000-8000-000000000001', '2026-05-05',
      '[]'::jsonb)$$,
  'STB02', null,
  'and not with nobody in it'
);

-- A second game so there is a rating to move.
select lives_ok(
  $$select add_manual_game('ee110000-0000-4000-8000-000000000001', '2026-05-05',
      jsonb_build_array(
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000002',
                           'status','done','score',3,
                           'tiles_open',jsonb_build_array(3)),
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000001',
                           'status','done','score',9,
                           'tiles_open',jsonb_build_array(9))))$$,
  'a second game is added'
);

select ok(
  exists (select 1 from player_achievements
           where player_id = 'ee110000-0000-4000-8000-000000000001'
             and achievement_key = 'first_blood'),
  'adding a game settles the badges it earned'
);
select ok(
  (select rating from player_ratings
    where player_id = 'ee110000-0000-4000-8000-000000000002') > 1000,
  'and the ratings, so beating a higher-rated player pays'
);

-- ---------------------------------------------------------------------------
-- Editing
-- ---------------------------------------------------------------------------

create temporary table before_edit on commit drop as
select player_id, rating from player_ratings
 where player_id in ('ee110000-0000-4000-8000-000000000001',
                     'ee110000-0000-4000-8000-000000000002');

select lives_ok(
  $$select edit_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-04'),
      '2026-05-04',
      jsonb_build_array(
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000002',
                           'status','done','score',2,
                           'tiles_open',jsonb_build_array(2)),
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000001',
                           'status','done','score',5,
                           'tiles_open',jsonb_build_array(5))),
      'Vee misread her board')$$,
  'a finished game can be corrected'
);

select is(
  (select gr.player_id from game_results gr
    where gr.game_id = (select id from vee_games where played_on = '2026-05-04')
      and gr.is_winner),
  'ee110000-0000-4000-8000-000000000002'::uuid,
  'the winner follows the corrected scores'
);
select ok(
  (select rating from player_ratings
    where player_id = 'ee110000-0000-4000-8000-000000000002')
  > (select rating from before_edit
      where player_id = 'ee110000-0000-4000-8000-000000000002'),
  'and the rating moves with it'
);
select ok(
  exists (select 1 from audit_log
           where entity_id = (select id from vee_games where played_on = '2026-05-04')
             and action = 'game.edit'
             and note = 'Vee misread her board'),
  'the correction is recorded, with the reason given'
);
select ok(
  (select before is not null and after is not null from audit_log
    where entity_id = (select id from vee_games where played_on = '2026-05-04')
      and action = 'game.edit'),
  'keeping both what it was and what it became'
);

-- Moving the date moves the game between seasons.
select lives_ok(
  $$select edit_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-04'),
      '2026-02-10',
      jsonb_build_array(
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000002',
                           'status','done','score',2,
                           'tiles_open',jsonb_build_array(2)),
        jsonb_build_object('player_id','ee110000-0000-4000-8000-000000000001',
                           'status','done','score',5,
                           'tiles_open',jsonb_build_array(5))))$$,
  'a game can be moved to the day it was really played'
);
select is(
  (select s.slug from games g join seasons s on s.id = g.season_id
    where g.played_on = '2026-02-10'
      and g.created_by = 'ee110000-0000-4000-8000-000000000001'),
  '2026-Q1',
  'and moves into that quarter'
);
select throws_ok(
  $$select edit_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-05'),
      (stockholm_today() + 30)::date,
      jsonb_build_array(jsonb_build_object(
        'player_id','ee110000-0000-4000-8000-000000000001',
        'status','done','score',5,'tiles_open',jsonb_build_array(5))))$$,
  'STB06', null,
  'but not into the future'
);

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------

create temporary table before_undo on commit drop as
select player_id, rating from player_ratings
 where player_id in ('ee110000-0000-4000-8000-000000000001',
                     'ee110000-0000-4000-8000-000000000002');

select lives_ok(
  $$select undo_game_change('ee110000-0000-4000-8000-000000000001',
      (select max(id) from audit_log
        where action = 'game.edit'
          and entity_id = (select id from games
                            where played_on = '2026-02-10'
                              and created_by = 'ee110000-0000-4000-8000-000000000001')))$$,
  'the last change can be undone'
);
select is(
  (select count(*)::int from games
    where played_on = '2026-05-04'
      and created_by = 'ee110000-0000-4000-8000-000000000001'),
  1,
  'putting the date back'
);
select ok(
  exists (select 1 from audit_log
           where action = 'game.undo'
             and entity_id = (select id from vee_games where played_on = '2026-05-04')),
  'and recording the undo itself, so the trail stays complete'
);

-- Undoing something that is no longer the latest change would silently throw
-- away everything that came after it.
select throws_ok(
  $$select undo_game_change('ee110000-0000-4000-8000-000000000001',
      (select min(id) from audit_log
        where entity = 'game'
          and entity_id = (select id from vee_games where played_on = '2026-05-04')))$$,
  'STB07', null,
  'an older change cannot be undone out of order'
);

-- ---------------------------------------------------------------------------
-- Deleting, reversibly
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select delete_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-04'),
      'wrong ruleset')$$,
  'a game can be deleted'
);
select ok(
  not exists (select 1 from games_valid
               where id = (select id from vee_games where played_on = '2026-05-04')),
  'and stops counting immediately'
);
select ok(
  not exists (select 1 from game_results
               where game_id = (select id from vee_games where played_on = '2026-05-04')),
  'including in the results'
);
-- [concept: soft delete] The row stays, so the mistake can be examined and the
-- deletion undone. v1 had no way to do either without hand-written SQL.
select ok(
  exists (select 1 from games
           where id = (select id from vee_games where played_on = '2026-05-04')
             and deleted_at is not null),
  'but the row is still there, marked rather than destroyed'
);
select ok(
  exists (select 1 from audit_log
           where action = 'game.delete' and note = 'wrong ruleset'),
  'with the reason recorded'
);

select lives_ok(
  $$select restore_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-04'))$$,
  'and it can be brought back'
);
select ok(
  exists (select 1 from games_valid
           where id = (select id from vee_games where played_on = '2026-05-04')),
  'counting again once restored'
);

-- Deleting twice is not an error, it is just already done.
select lives_ok(
  $$select delete_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-04'))$$,
  'deleting is safe to repeat'
);
select lives_ok(
  $$select delete_game('ee110000-0000-4000-8000-000000000001',
      (select id from vee_games where played_on = '2026-05-04'))$$,
  'even twice over'
);

select * from finish();
rollback;
