-- pgTAP: rulesets, scoring and seasons (migration 0004).
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select has_table('rulesets', 'rulesets table exists');
select has_table('seasons', 'seasons table exists');
select hasnt_column('games', 'max_tile',
  'games.max_tile is retired — tile count belongs to the ruleset');
select has_column('games', 'ruleset_id', 'games records which ruleset it used');
select has_column('games', 'season_id', 'games records which season it fell in');

select is(
  (select count(*)::int from rulesets where is_active),
  1,
  'exactly one ruleset is active out of the box'
);
select is(
  (select slug from rulesets where is_active),
  'vanilla-12',
  'and it is vanilla'
);
select is(
  (select slug from rulesets where id = default_ruleset_id()),
  'vanilla-12',
  'default_ruleset_id points at vanilla'
);

-- ---------------------------------------------------------------------------
-- Scoring: sum_open
-- ---------------------------------------------------------------------------
select is(
  ruleset_score((select rules from rulesets where slug = 'vanilla-12'),
                array[3, 5]::smallint[]),
  8,
  'sum scoring adds the open tiles'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'vanilla-12'),
                array[]::smallint[]),
  0,
  'a shut box scores zero'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'vanilla-12'),
                array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  78,
  'an untouched board scores 78'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'vanilla-12'), null),
  null,
  'a null board scores null, not zero — a typed score is not a shut box'
);

-- ---------------------------------------------------------------------------
-- Scoring: concat_open ("digital")
-- ---------------------------------------------------------------------------
select is(
  ruleset_score((select rules from rulesets where slug = 'digital-9'),
                array[3, 5]::smallint[]),
  35,
  'digital scoring reads the open tiles as one number'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'digital-9'),
                array[5, 3]::smallint[]),
  35,
  'and is independent of the order the tiles arrive in'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'digital-9'),
                array[]::smallint[]),
  0,
  'a shut box still scores zero under digital scoring'
);

-- ---------------------------------------------------------------------------
-- Scoring: prediction ("call your shot")
-- ---------------------------------------------------------------------------
select is(
  ruleset_score((select rules from rulesets where slug = 'call-your-shot-12'),
                array[3, 5]::smallint[], 8),
  8,
  'a perfect call costs nothing'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'call-your-shot-12'),
                array[3, 5]::smallint[], 3),
  13,
  'undershooting by 5 adds 5'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'call-your-shot-12'),
                array[3, 5]::smallint[], 20),
  20,
  'overshooting by 12 adds 12 — the penalty is symmetric'
);
-- The whole reason the offset is absolute: a signed offset would let a player
-- call 78, score 8 and finish 62 under par, winning every single game.
select is(
  ruleset_score((select rules from rulesets where slug = 'call-your-shot-12'),
                array[3, 5]::smallint[], 78),
  78,
  'a wild call cannot produce a score below the base'
);
select ok(
  ruleset_score((select rules from rulesets where slug = 'call-your-shot-12'),
                array[3, 5]::smallint[], 78) >= 0,
  'and can never go negative'
);
select is(
  ruleset_score((select rules from rulesets where slug = 'vanilla-12'),
                array[3, 5]::smallint[], 999),
  8,
  'a ruleset without prediction ignores a call entirely'
);

-- ---------------------------------------------------------------------------
-- Ceilings — what the score check constraint has to allow
-- ---------------------------------------------------------------------------
select is(
  ruleset_max_score((select rules from rulesets where slug = 'vanilla-12')),
  78,
  'vanilla tops out at 78'
);
select is(
  ruleset_max_score((select rules from rulesets where slug = 'call-your-shot-12')),
  156,
  'prediction doubles the ceiling: call zero, leave everything up'
);
select is(
  ruleset_max_score((select rules from rulesets where slug = 'digital-9')),
  123456789,
  'digital nine tops out at every tile standing, read as a number'
);

-- ---------------------------------------------------------------------------
-- Modifiers
-- ---------------------------------------------------------------------------
select is(
  ruleset_score(
    jsonb_set((select rules from rulesets where slug = 'vanilla-12'),
              '{modifiers}',
              '[{"kind":"golden_tile","tile":5,"multiplier":2}]'::jsonb),
    array[3, 5]::smallint[]),
  13,
  'a golden tile doubles only its own tile (3 + 5*2)'
);
select is(
  ruleset_score(
    jsonb_set((select rules from rulesets where slug = 'vanilla-12'),
              '{modifiers}',
              '[{"kind":"penalty_tile","tile":1,"add":5}]'::jsonb),
    array[1, 2]::smallint[]),
  8,
  'a penalty tile adds a flat amount when it is left standing (1+5 + 2)'
);

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------
select is(
  ruleset_validation_error((select rules from rulesets where slug = 'vanilla-12')),
  null,
  'the shipped rulesets validate'
);

-- The loophole: with prediction AND voluntary stopping you flip until the board
-- matches your call, then stop — the offset is always zero and the mechanic
-- does nothing. Only a doubled offset keeps a cost on bailing out.
select is(
  ruleset_validation_error(
    jsonb_set(
      jsonb_set((select rules from rulesets where slug = 'call-your-shot-12'),
                '{voluntary_stop,enabled}', 'true'::jsonb),
      '{prediction,multiplier}', '1'::jsonb)),
  'prediction with voluntary_stop needs prediction.multiplier >= 2',
  'prediction plus voluntary stopping is rejected at multiplier 1'
);
select is(
  ruleset_validation_error(
    jsonb_set(
      jsonb_set((select rules from rulesets where slug = 'call-your-shot-12'),
                '{voluntary_stop,enabled}', 'true'::jsonb),
      '{prediction,multiplier}', '2'::jsonb)),
  null,
  'and accepted once the offset doubles'
);
select is(
  ruleset_validation_error(
    jsonb_set((select rules from rulesets where slug = 'call-your-shot-12'),
              '{prediction,penalty}', '"signed"'::jsonb)),
  'prediction.penalty must be abs_offset (a signed offset is exploitable)',
  'a signed offset is rejected'
);
select isnt(
  ruleset_validation_error(
    jsonb_set((select rules from rulesets where slug = 'vanilla-12'),
              '{tiles}', '11'::jsonb)),
  null,
  'an 11-tile board is rejected'
);
select isnt(
  ruleset_validation_error(
    jsonb_set((select rules from rulesets where slug = 'digital-9'),
              '{tiles}', '12'::jsonb)),
  null,
  'digital scoring on a two-digit board is rejected'
);
select isnt(
  ruleset_validation_error(
    jsonb_set((select rules from rulesets where slug = 'digital-9'),
              '{modifiers}',
              '[{"kind":"golden_tile","tile":5,"multiplier":2}]'::jsonb)),
  null,
  'digital scoring plus modifiers is rejected'
);
select isnt(
  ruleset_validation_error(
    jsonb_set((select rules from rulesets where slug = 'vanilla-12'),
              '{modifiers}',
              '[{"kind":"golden_tile","tile":13,"multiplier":2}]'::jsonb)),
  null,
  'a modifier on a tile the board does not have is rejected'
);
select isnt(
  ruleset_validation_error('{"v": 2, "tiles": 12}'::jsonb),
  null,
  'a future rules version is rejected rather than half-read'
);
select throws_ok(
  $$insert into rulesets (slug, name, rules) values ('bad', 'Bad', '{"v":1,"tiles":11}'::jsonb)$$,
  '23514',
  null,
  'the check constraint blocks an invalid ruleset at the database'
);

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
-- ensure_season is called in a DO block, not inside a WHERE against seasons:
-- with an empty table there are no rows to scan, so the function would never
-- run and the subquery would silently return NULL.
do $seed$ begin perform ensure_season('2026-08-15'::date); end $seed$;

select is(
  (select starts_on from seasons where slug = '2026-Q3'),
  '2026-07-01'::date,
  'ensure_season snaps to the start of the quarter'
);
select is(
  (select ends_on from seasons where slug = '2026-Q3'),
  '2026-09-30'::date,
  'and to the last day of it'
);
select is(
  ensure_season('2026-07-01'::date),
  ensure_season('2026-09-30'::date),
  'every day in a quarter maps to the same season'
);
select isnt(
  ensure_season('2026-09-30'::date),
  ensure_season('2026-10-01'::date),
  'and the next quarter is a different season'
);
select throws_ok(
  $$insert into seasons (slug, number, name, starts_on, ends_on, ruleset_id)
    values ('overlap', 99, 'Overlap', '2026-08-01', '2026-08-31', default_ruleset_id())$$,
  '23P01',
  null,
  'two seasons cannot cover the same day, so a game maps to exactly one'
);

-- ---------------------------------------------------------------------------
-- Privileges — the browser gets a publishable key from 0011 onwards
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from information_schema.routine_privileges
    where grantee in ('anon', 'authenticated', 'PUBLIC')
      and specific_schema = 'public'),
  0,
  'anon holds no EXECUTE on any function in public'
);

select * from finish();
rollback;
