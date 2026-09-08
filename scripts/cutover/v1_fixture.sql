-- Cutover rehearsal — a v1-shaped dataset, inserted against the 0002 schema.
--
-- Why this exists: all 206 pgTAP tests run against a database built from
-- scratch, so every backfill in 0004-0014 has only ever executed against zero
-- rows. The cutover runs them against months of real v1 data. This fixture is
-- that data, shaped to include the things production can actually contain —
-- including the two v1 failure modes we know about.
--
-- Deliberately exercised:
--   * a tie for the win (shared day)
--   * a shut box recorded as tiles_open = '{}' AND one recorded as score 0
--     with tiles_open null (manual entry)
--   * manually typed scores (tiles_open null, score > 0)
--   * a one-player game
--   * two games on the same day (winning either wins the day)
--   * a benched player who still has history
--   * an ORPHAN games row with no game_players — v1's non-atomic save could
--     leave these, and because v1 built its streak day index from `games`
--     rather than from games that were actually played, one orphan silently
--     reset everybody's streak. Dated into the middle of a winning run so the
--     fix is visible as a number.
--   * a legacy max_tile = 9 game — v1's column DEFAULT was 9, so any game
--     saved without an explicit tile count got one. This is what decides
--     whether migration 0003 can be run or must be repaired as applied.

-- --------------------------------------------------------------------------
-- Roster
-- --------------------------------------------------------------------------
insert into players (id, name, emoji, song_url, is_active) values
  ('aa000000-0000-4000-8000-000000000001', 'Fix Alice',   '🦊', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', true),
  ('aa000000-0000-4000-8000-000000000002', 'Fix Bob',     '🐙', 'https://youtu.be/ZbZSe6N_BXs',               true),
  ('aa000000-0000-4000-8000-000000000003', 'Fix Charlie', '🦄', null,                                         true),
  ('aa000000-0000-4000-8000-000000000004', 'Fix Dora',    '🐝', null,                                         true),
  ('aa000000-0000-4000-8000-000000000005', 'Fix Egon',    '🦉', null,                                         false);

-- --------------------------------------------------------------------------
-- June — a clean winning run for Alice, with an orphan dropped into it
-- --------------------------------------------------------------------------

-- 2026-06-01  Alice wins outright
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-00000000000a', '2026-06-01', 12, '2026-06-01 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000001',  5, '{5}',      1),
  ('bb000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000002', 12, '{4,8}',    2),
  ('bb000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000003', 20, '{9,11}',   3);

-- 2026-06-02  Alice again
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-00000000000b', '2026-06-02', 12, '2026-06-02 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-00000000000b', 'aa000000-0000-4000-8000-000000000001',  3, '{3}',      1),
  ('bb000000-0000-4000-8000-00000000000b', 'aa000000-0000-4000-8000-000000000002',  8, '{1,7}',    2);

-- 2026-06-03  THE ORPHAN: a games row whose player rows never landed.
-- v1's save was two separate inserts with no transaction; when the second
-- failed this is what was left behind. It is not a game anybody played, but v1
-- counted the day, breaking Alice's run between 06-02 and 06-04.
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-00000000000c', '2026-06-03', 12, '2026-06-03 12:45+02');

-- 2026-06-04  Alice shuts the box (recorded from the board: empty array)
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-00000000000d', '2026-06-04', 12, '2026-06-04 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-00000000000d', 'aa000000-0000-4000-8000-000000000001',  0, '{}',       1),
  ('bb000000-0000-4000-8000-00000000000d', 'aa000000-0000-4000-8000-000000000002', 15, '{4,5,6}',  2);

-- 2026-06-05  Bob takes one
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-00000000000e', '2026-06-05', 12, '2026-06-05 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-00000000000e', 'aa000000-0000-4000-8000-000000000001',  7, '{7}',      1),
  ('bb000000-0000-4000-8000-00000000000e', 'aa000000-0000-4000-8000-000000000002',  4, '{4}',      2);

-- --------------------------------------------------------------------------
-- July — a tie, a solo game, typed scores, and the legacy 9-tile game
-- --------------------------------------------------------------------------

-- 2026-07-01  Bob and Charlie tie for the win and share the day
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-00000000000f', '2026-07-01', 12, '2026-07-01 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-00000000000f', 'aa000000-0000-4000-8000-000000000001',  9, '{9}',      1),
  ('bb000000-0000-4000-8000-00000000000f', 'aa000000-0000-4000-8000-000000000002',  6, '{6}',      2),
  ('bb000000-0000-4000-8000-00000000000f', 'aa000000-0000-4000-8000-000000000003',  6, '{2,4}',    3);

-- 2026-07-02  Dora plays alone (she still wins the day)
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-000000000010', '2026-07-02', 12, '2026-07-02 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-000000000010', 'aa000000-0000-4000-8000-000000000004', 11, '{11}',     1);

-- 2026-07-03  Typed scores — no board, so tiles_open is null
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-000000000011', '2026-07-03', 12, '2026-07-03 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-000000000011', 'aa000000-0000-4000-8000-000000000001', 14, null,       1),
  ('bb000000-0000-4000-8000-000000000011', 'aa000000-0000-4000-8000-000000000002', 22, null,       2);

-- 2026-07-06  The legacy 9-tile game, and a shut box typed as a bare 0.
-- Migration 0003 adds `check (max_tile = 12)`; this row is what makes that
-- migration fail, which is why the runbook repairs 0003 rather than running it.
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-000000000012', '2026-07-06',  9, '2026-07-06 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-000000000012', 'aa000000-0000-4000-8000-000000000003',  0, null,       1),
  ('bb000000-0000-4000-8000-000000000012', 'aa000000-0000-4000-8000-000000000004',  9, '{9}',      2);

-- --------------------------------------------------------------------------
-- August — two games in one day, and the benched player's history
-- --------------------------------------------------------------------------

-- 2026-08-03  first game: Bob wins
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-000000000013', '2026-08-03', 12, '2026-08-03 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-000000000013', 'aa000000-0000-4000-8000-000000000001', 10, '{10}',     1),
  ('bb000000-0000-4000-8000-000000000013', 'aa000000-0000-4000-8000-000000000002',  3, '{3}',      2);

-- 2026-08-03  second game the same day: Alice wins, so the day is shared
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-000000000014', '2026-08-03', 12, '2026-08-03 13:10+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-000000000014', 'aa000000-0000-4000-8000-000000000001',  2, '{2}',      1),
  ('bb000000-0000-4000-8000-000000000014', 'aa000000-0000-4000-8000-000000000002', 19, '{8,11}',   2);

-- 2026-08-04  Egon is benched today but played back then
insert into games (id, played_on, max_tile, created_at) values
  ('bb000000-0000-4000-8000-000000000015', '2026-08-04', 12, '2026-08-04 12:45+02');
insert into game_players (game_id, player_id, score, tiles_open, turn_order) values
  ('bb000000-0000-4000-8000-000000000015', 'aa000000-0000-4000-8000-000000000003',  1, '{1}',      1),
  ('bb000000-0000-4000-8000-000000000015', 'aa000000-0000-4000-8000-000000000004', 30, '{9,10,11}', 2),
  ('bb000000-0000-4000-8000-000000000015', 'aa000000-0000-4000-8000-000000000005', 40, '{7,10,11,12}', 3);
