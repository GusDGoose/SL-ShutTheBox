-- pgTAP smoke test: proves the test harness itself works.
-- Run with: npm run db:test  (requires Docker + `npm run db:start`)
--
-- [concept: pgTAP in a rolled-back transaction] Everything between begin and
-- rollback is discarded, including the extension, so tests never leave a trace
-- in the database and pgtap never has to exist in production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_table('players', 'players table exists');
select has_table('games', 'games table exists');
select has_table('game_players', 'game_players table exists');

select * from finish();
rollback;
