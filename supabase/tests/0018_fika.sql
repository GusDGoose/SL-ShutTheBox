-- pgTAP: the fika rota (migration 0018).
--
-- The office rule, in full:
--   * the worst player of last week buys, where "worst" is the average
--     normalised finish so a last place out of six beats a last out of three;
--   * nobody buys twice until everybody has bought once — that is a cycle,
--     and the cycle restarts when it is exhausted;
--   * a week nobody eligible played falls back to random, recorded as such;
--   * skipping redraws the same week; the skipper keeps their place in the
--     cycle but cannot be handed straight back the week they turned down;
--   * drawing twice for one week is a no-op, because the Monday cron can
--     fire twice and a person can press Redraw while it does.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- This test has to OWN the roster and the rota, because both are statements
-- about global state: cycle exhaustion depends on every active player, and
-- draw_fika returns any duty already standing for the week rather than
-- drawing a new one. Run against a database somebody has actually used and
-- both assumptions break — which is exactly how it failed the first two
-- times, first on seed.sql's three players and then on rota rows left by
-- hand-testing. Everything here is inside the transaction and rolled back.
--
-- The rule from 0007 still applies: run `db reset && db test` AND `db test`
-- against a database with data. Both must pass.
update players set is_active = false where is_active;
delete from fika_duties where true;
delete from fika_cycles where true;

insert into players (id, name, emoji, is_active) values
  ('fa000000-0000-4000-8000-000000000001', 'Fika Ada',  '🦊', true),
  ('fa000000-0000-4000-8000-000000000002', 'Fika Ben',  '🐙', true),
  ('fa000000-0000-4000-8000-000000000003', 'Fika Cleo', '🦄', true),
  ('fa000000-0000-4000-8000-000000000004', 'Fika Dev',  '🐝', false);

-- ---------------------------------------------------------------------------
-- iso_monday
-- ---------------------------------------------------------------------------
select is(iso_monday(date '2026-09-07'), date '2026-09-07', 'a Monday is its own Monday');
select is(iso_monday(date '2026-09-13'), date '2026-09-07', 'Sunday belongs to the Monday before it');
select is(iso_monday(date '2026-09-10'), date '2026-09-07', 'Thursday belongs to the Monday before it');

-- ---------------------------------------------------------------------------
-- A week of games to be judged on: Monday 2026-09-07 draws on 08-31..09-06.
--
-- Ben finishes last in a field of three, twice. Ada wins both. Cleo is in the
-- middle. Ben is unambiguously the worst.
-- ---------------------------------------------------------------------------
create or replace function fixture_game(p_day date, p_ada int, p_ben int, p_cleo int)
returns uuid language plpgsql as $fx$
declare v_game uuid;
begin
  insert into games (played_on, ruleset_id, season_id, status, finished_at)
  values (p_day, default_ruleset_id(), ensure_season(p_day), 'finished', p_day + time '13:00')
  returning id into v_game;
  insert into game_players (game_id, player_id, score, turn_order, status) values
    (v_game, 'fa000000-0000-4000-8000-000000000001', p_ada,  1, 'done'),
    (v_game, 'fa000000-0000-4000-8000-000000000002', p_ben,  2, 'done'),
    (v_game, 'fa000000-0000-4000-8000-000000000003', p_cleo, 3, 'done');
  return v_game;
end
$fx$;

select fixture_game(date '2026-09-01', 3, 30, 12);
select fixture_game(date '2026-09-03', 5, 28, 11);

-- ---------------------------------------------------------------------------
-- The draw
-- ---------------------------------------------------------------------------
select is(
  (select player_id from draw_fika(date '2026-09-07')),
  'fa000000-0000-4000-8000-000000000002'::uuid,
  'the worst player of last week buys the fika'
);

select is(
  (select reason from fika_duties where week_start = date '2026-09-07'),
  'worst_last_week',
  'and the reason says so'
);

select is(
  (select count(*)::int from fika_duties where week_start = date '2026-09-07'),
  1,
  'drawing again for the same week does not draw again'
);
select is(
  (select player_id from draw_fika(date '2026-09-07')),
  'fa000000-0000-4000-8000-000000000002'::uuid,
  'it returns the duty already standing'
);

select is(
  (select week_start from draw_fika(date '2026-09-10')),
  date '2026-09-07',
  'any day of the week draws for that week Monday'
);

select isnt_empty(
  $$select 1 from audit_log where action = 'fika.draw'$$,
  'the draw is audited'
);

-- ---------------------------------------------------------------------------
-- The cycle: nobody repeats until everybody has bought
-- ---------------------------------------------------------------------------
-- Ben bought in week 1. Week 2 must not be Ben, even though he is still the
-- worst player on record — he has had his turn this cycle.
select isnt(
  (select player_id from draw_fika(date '2026-09-14')),
  'fa000000-0000-4000-8000-000000000002'::uuid,
  'last week''s buyer is not picked again inside the cycle'
);

select is(
  (select count(distinct player_id)::int from fika_duties where skipped_at is null),
  2,
  'two different people have bought so far'
);

-- Week 3 exhausts the three active players.
select lives_ok($$select draw_fika(date '2026-09-21')$$, 'week three draws');
select is(
  (select count(distinct player_id)::int from fika_duties where skipped_at is null),
  3,
  'all three active players have now bought exactly once'
);
select is(
  (select count(distinct cycle_id)::int from fika_duties),
  1,
  'and it all happened inside one cycle'
);

select ok(
  not exists (
    select 1 from fika_duties
     where player_id = 'fa000000-0000-4000-8000-000000000004'
  ),
  'a benched player is never given fika duty'
);

-- Week 4 has nobody left, so a new cycle opens and everyone is back in.
select lives_ok($$select draw_fika(date '2026-09-28')$$, 'week four draws');
select is(
  (select count(distinct cycle_id)::int from fika_duties),
  2,
  'an exhausted cycle restarts rather than running out of people'
);

-- ---------------------------------------------------------------------------
-- Skipping
-- ---------------------------------------------------------------------------
create temporary view week5 as
  select * from fika_duties where week_start = date '2026-10-05' and skipped_at is null;

select lives_ok($$select draw_fika(date '2026-10-05')$$, 'week five draws');

create temporary table skipped_who on commit drop as
  select player_id from week5;

select lives_ok(
  $$select skip_fika('fa000000-0000-4000-8000-000000000001', (select id from week5))$$,
  'the duty can be turned down'
);

select is(
  (select count(*)::int from fika_duties
    where week_start = date '2026-10-05' and skipped_at is not null),
  1,
  'the skipped duty is kept, marked skipped'
);

select is(
  (select count(*)::int from week5),
  1,
  'and a replacement is standing for the same week'
);

select isnt(
  (select player_id from week5),
  (select player_id from skipped_who),
  'the replacement is somebody else — a redraw must not hand it straight back'
);

select isnt_empty(
  $$select 1 from audit_log where action = 'fika.skip'$$,
  'the skip is audited'
);

-- The skipper has still not bought, so they remain in the cycle.
select ok(
  exists (
    select 1 from players p
     where p.id = (select player_id from skipped_who)
       and not exists (
         select 1 from fika_duties d
          where d.player_id = p.id
            and d.skipped_at is null
            and d.cycle_id = (select cycle_id from week5)
       )
  ),
  'skipping does not count as having bought: they stay in the cycle'
);

-- ---------------------------------------------------------------------------
-- Quiet weeks and the security posture
-- ---------------------------------------------------------------------------
-- Nothing was played in the week before 2027-01-04, so there is no "worst".
select is(
  (select reason from draw_fika(date '2027-01-04')),
  'random_fallback',
  'a week nobody played still gets a buyer, recorded as a random pick'
);

select ok(
  not has_function_privilege('anon', 'draw_fika(date, uuid)', 'execute')
  and not has_function_privilege('anon', 'skip_fika(uuid, uuid)', 'execute'),
  'anon cannot draw or skip fika'
);

select * from finish();
rollback;
