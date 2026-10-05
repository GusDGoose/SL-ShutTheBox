-- pgTAP: a shut box no longer ends the game (migration 0023).
--
-- On 2026-10-01 and 2026-10-05 a shut box on the second turn ended the game on
-- the spot, the rest of the table played another one, and that second game
-- counted as a win of its own. The house rule since: everybody plays their
-- turn, a zero simply wins.
--
-- Dates are in 2019 so nothing here collides with games a dev database holds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

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

select * from finish();
rollback;
