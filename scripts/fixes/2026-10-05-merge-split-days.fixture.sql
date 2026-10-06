-- ===========================================================================
-- Rehearsal fixture for 2026-10-05-merge-split-days.sql — LOCAL ONLY.
--
-- The three production days that hold two counted games, as production had
-- them on 2026-10-05 (read from the dashboard by Gustav): the same game ids,
-- turn orders, scores and boards. Player ids are local; the merge script only
-- ever looks players up through the games, except Gustav, by name.
--
-- Load it into a database at 0022 (before the unique index exists):
--   npx supabase db reset --version 0022
--   docker exec -i supabase_db_shut-the-box psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < scripts/fixes/2026-10-05-merge-split-days.fixture.sql
-- ===========================================================================

begin;

insert into players (name, emoji) values
  ('Gustav', '🎲'), ('Marina', '🦩'), ('Maja', '🐝'), ('Jennifer', '🦊'),
  ('Per-Erik', '🦉'), ('Abbe', '🐙'), ('Linda', '🐢'), ('Mathias', '🦄')
on conflict (name) do nothing;

-- The first game of each day started earlier than the second, as it did.
insert into games (id, played_on, ruleset_id, season_id, status,
                   started_at, finished_at)
values
  ('c8ceddc1-db40-4fe8-96ee-f107437935dd', '2026-09-09', default_ruleset_id(),
   ensure_season('2026-09-09'), 'finished',
   '2026-09-09T10:58:06Z', '2026-09-09T11:03:23Z'),
  ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', '2026-09-09', default_ruleset_id(),
   ensure_season('2026-09-09'), 'finished',
   '2026-09-09T12:39:36Z', '2026-09-09T12:46:44Z'),
  ('1db7a886-6b15-4de9-96d4-da9874540638', '2026-10-01', default_ruleset_id(),
   ensure_season('2026-10-01'), 'finished',
   '2026-10-01T11:20:00Z', '2026-10-01T11:29:46Z'),
  ('a1114249-e9fd-42f8-b25b-c1b362e92cd7', '2026-10-01', default_ruleset_id(),
   ensure_season('2026-10-01'), 'finished',
   '2026-10-01T11:31:00Z', '2026-10-01T11:37:14Z'),
  ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', '2026-10-05', default_ruleset_id(),
   ensure_season('2026-10-05'), 'finished',
   '2026-10-05T10:50:00Z', '2026-10-05T10:55:42Z'),
  ('7083f33c-0ad8-4ff9-9169-ebb2ac8caeaa', '2026-10-05', default_ruleset_id(),
   ensure_season('2026-10-05'), 'finished',
   '2026-10-05T10:56:00Z', '2026-10-05T11:00:51Z');

insert into game_players (game_id, player_id, turn_order, status, score, tiles_open)
select v.game_id::uuid, p.id, v.turn, v.status::game_player_status, v.score,
       v.tiles::smallint[]
  from (values
    -- 2026-09-09, game 1
    ('c8ceddc1-db40-4fe8-96ee-f107437935dd', 1, 'Gustav',   'done', 34, '{3,4,6,9,12}'),
    ('c8ceddc1-db40-4fe8-96ee-f107437935dd', 2, 'Marina',   'done', 46, '{4,9,10,11,12}'),
    ('c8ceddc1-db40-4fe8-96ee-f107437935dd', 3, 'Maja',     'done', 52, '{2,8,9,10,11,12}'),
    ('c8ceddc1-db40-4fe8-96ee-f107437935dd', 4, 'Jennifer', 'done', 48, '{1,3,4,8,9,11,12}'),
    -- 2026-09-09, game 2
    ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', 1, 'Marina',   'done', 45, '{2,3,4,6,9,10,11}'),
    ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', 2, 'Per-Erik', 'done', 55, '{3,5,7,8,9,11,12}'),
    ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', 3, 'Maja',     'done', 41, '{4,6,8,11,12}'),
    ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', 4, 'Gustav',   'done', 17, '{5,12}'),
    ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', 5, 'Abbe',     'done', 39, '{2,4,10,11,12}'),
    ('6397a3b0-bfa5-4461-8edc-f0c679d59f33', 6, 'Jennifer', 'done', 43, '{1,2,4,5,9,10,12}'),
    -- 2026-10-01, game 1: Marina shuts the box on turn 2
    ('1db7a886-6b15-4de9-96d4-da9874540638', 1, 'Maja',     'done', 45, '{4,5,7,8,9,12}'),
    ('1db7a886-6b15-4de9-96d4-da9874540638', 2, 'Marina',   'done',  0, '{}'),
    ('1db7a886-6b15-4de9-96d4-da9874540638', 3, 'Linda',    'dnp',  null, null),
    ('1db7a886-6b15-4de9-96d4-da9874540638', 4, 'Jennifer', 'dnp',  null, null),
    ('1db7a886-6b15-4de9-96d4-da9874540638', 5, 'Gustav',   'dnp',  null, null),
    -- 2026-10-01, game 2
    ('a1114249-e9fd-42f8-b25b-c1b362e92cd7', 1, 'Linda',    'done', 45, '{3,9,10,11,12}'),
    ('a1114249-e9fd-42f8-b25b-c1b362e92cd7', 2, 'Mathias',  'done', 47, '{1,2,5,6,10,11,12}'),
    ('a1114249-e9fd-42f8-b25b-c1b362e92cd7', 3, 'Jennifer', 'done', 52, '{3,4,5,7,10,11,12}'),
    ('a1114249-e9fd-42f8-b25b-c1b362e92cd7', 4, 'Gustav',   'done', 35, '{2,3,7,11,12}'),
    -- 2026-10-05, game 1: Marina shuts the box on turn 2
    ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', 1, 'Jennifer', 'done', 30, '{3,8,9,10}'),
    ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', 2, 'Marina',   'done',  0, '{}'),
    ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', 3, 'Abbe',     'dnp',  null, null),
    ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', 4, 'Linda',    'dnp',  null, null),
    ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', 5, 'Maja',     'dnp',  null, null),
    ('2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f', 6, 'Gustav',   'dnp',  null, null),
    -- 2026-10-05, game 2
    ('7083f33c-0ad8-4ff9-9169-ebb2ac8caeaa', 1, 'Abbe',     'done', 40, '{4,6,7,11,12}'),
    ('7083f33c-0ad8-4ff9-9169-ebb2ac8caeaa', 2, 'Linda',    'done', 27, '{2,3,10,12}'),
    ('7083f33c-0ad8-4ff9-9169-ebb2ac8caeaa', 3, 'Maja',     'done', 34, '{6,7,9,12}'),
    ('7083f33c-0ad8-4ff9-9169-ebb2ac8caeaa', 4, 'Gustav',   'done', 43, '{3,7,10,11,12}')
  ) v(game_id, turn, name, status, score, tiles)
  join players p on p.name = v.name;

select resettle_history();

commit;
