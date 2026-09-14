-- pgTAP: team play (migration 0021).
--
-- The rules this file exists to pin down:
--   * the join code is the credential, and it is normalised the same way in SQL
--     as in TypeScript, so a lower-case link still works;
--   * a team's status is DERIVED — adding a player to a finished team re-opens
--     it, and nothing has to remember that;
--   * a team is ranked as soon as one member has played, so the organiser can
--     crown the event while somebody is still mid-way;
--   * every writing RPC bumps tournaments.version by exactly one, because that
--     bump is what sends the single Realtime broadcast;
--   * the event never touches the daily game.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

insert into players (id, name, emoji, is_active) values
  ('cc210000-0000-4000-8000-000000000001', 'Tourney Org',  '🎪', true),
  ('cc210000-0000-4000-8000-000000000002', 'Tourney Gone', '👻', false);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select has_table('tournaments',        'there is a tournaments table');
select has_table('tournament_teams',   'and one for its teams');
select has_table('tournament_members', 'and one for the temporary members');
select has_table('tournament_live',    'and a heartbeat row per playing team');

-- The broadcast policy was WIDENED rather than added to: 0011 asserts that
-- realtime.messages carries exactly one policy, and that assertion is worth
-- keeping.
select ok(
  (select pg_get_expr(polqual, polrelid) from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages')
  like '%tournament:%',
  'anon may listen to tournament topics as well as game ones'
);
select ok(
  exists (select 1 from pg_trigger
           where tgname = 'tournaments_broadcast' and not tgisinternal),
  'and one trigger sends them'
);

select is(
  (select count(*)::int from information_schema.routine_privileges
    where grantee in ('anon', 'authenticated', 'PUBLIC')
      and specific_schema = 'public'
      and routine_name like 'tournament%'),
  0,
  'anon can execute none of the team-play functions'
);

-- ---------------------------------------------------------------------------
-- Creating
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select create_tournament('cc210000-0000-4000-8000-000000000002', 'Ghost day')$$,
  'STB02', null,
  'a benched player cannot start a team play'
);
select throws_ok(
  $$select create_tournament('cc210000-0000-4000-8000-000000000001', '   ')$$,
  'STB02', null,
  'and it needs a name'
);

create temporary table tourney on commit drop as
select (create_tournament('cc210000-0000-4000-8000-000000000001', 'pgTAP day'))
       ->'tournament'->>'code' as code;

select matches(
  (select code from tourney),
  '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$',
  'the join code avoids the characters people misread'
);
select is(
  (select status from tournaments where code = (select code from tourney)),
  'open',
  'a new event is open'
);
select is(
  (select t.ruleset_id from tournaments t where t.code = (select code from tourney)),
  (select s.ruleset_id from seasons s where s.id = ensure_season(stockholm_today())),
  'and runs the season the office is in'
);
select ok(
  exists (select 1 from audit_log
           where action = 'tournament.create'
             and after->>'code' = (select code from tourney)),
  'and the trail names the code it handed out'
);
select is(
  (select tournament_normalize_code(lower((select code from tourney)) || ' - ')),
  (select code from tourney),
  'a code typed in lower case, or with the spaces it is printed with, still resolves'
);
select ok(
  tournament_snapshot_by_code('ZZZZZZ') is null,
  'a code nobody handed out is simply nothing'
);
select throws_ok(
  $$select tournament_create_team('ZZZZZZ', 'Nobody')$$,
  'STB10', null,
  'and cannot be written to'
);

-- ---------------------------------------------------------------------------
-- Teams and members
-- ---------------------------------------------------------------------------
create temporary table foxes on commit drop as
select ((tournament_create_team((select code from tourney), 'Foxes', '🦊',
        'https://youtu.be/dQw4w9WgXcQ'))->>'created_team_id')::uuid as id;

select ok(
  (select id from foxes) is not null,
  'creating a team returns its id, so the phone can go straight to its board'
);
select throws_ok(
  format($$select tournament_start_team(%L, %L::uuid)$$,
         (select code from tourney), (select id from foxes)),
  'STB02', null,
  'a team with nobody in it cannot start'
);

select lives_ok(
  format($$select tournament_add_member(%L, %L::uuid, 'Anna')$$,
         (select code from tourney), (select id from foxes)),
  'members are added by name — no roster row, no account'
);
select lives_ok(
  format($$select tournament_add_member(%L, %L::uuid, 'Bo')$$,
         (select code from tourney), (select id from foxes)),
  'and queue up behind each other'
);
select is(
  (select status from (
     select jsonb_array_elements(tournament_snapshot_by_code((select code from tourney))
            ->'teams')->>'status' as status) s),
  'forming',
  'a team nobody has started is forming'
);

-- ---------------------------------------------------------------------------
-- Playing
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$select tournament_start_team(%L, %L::uuid)$$,
         (select code from tourney), (select id from foxes)),
  'starting puts the first member at the board'
);
select is(
  (select m.name from tournament_live l
     join tournament_members m on m.id = l.member_id
    where l.team_id = (select id from foxes)),
  'Anna',
  'and it is the one who queued first'
);

create temporary table seen on commit drop as
select version from tournaments where code = (select code from tourney);

select lives_ok(
  format($$select tournament_start_team(%L, %L::uuid)$$,
         (select code from tourney), (select id from foxes)),
  'starting twice is harmless — a double tap must not restart anybody'
);
select is(
  (select version from tournaments where code = (select code from tourney)),
  (select version from seen),
  'and sends no broadcast, because nothing changed'
);

update seen set version =
  (select version from tournaments where code = (select code from tourney));

select lives_ok(
  format($$select tournament_set_board(%L, %L::uuid, '{3,3,1,2}')$$,
         (select code from tourney), (select id from foxes)),
  'the board takes the whole set of tiles that are down'
);
select is(
  (select array_to_string(tiles_down, ',') from tournament_live
    where team_id = (select id from foxes)),
  '1,2,3',
  'deduplicated and sorted, so a retried tap changes nothing'
);
select is(
  (select version from tournaments where code = (select code from tourney)),
  (select version + 1 from seen),
  'and that tap bumped the version exactly once — one broadcast'
);
select throws_ok(
  format($$select tournament_set_board(%L, %L::uuid, '{13}')$$,
         (select code from tourney), (select id from foxes)),
  'STB02', null,
  'a tile that is not on the board is refused'
);

select lives_ok(
  format($$select tournament_end_turn(%L, %L::uuid)$$,
         (select code from tourney), (select id from foxes)),
  'ending the turn scores it from the board the server holds'
);
select is(
  (select score from tournament_members
    where team_id = (select id from foxes) and name = 'Anna'),
  72,
  'tiles 4 to 12 left standing is 72, computed in SQL and not sent by the phone'
);
select is(
  (select m.name from tournament_live l
     join tournament_members m on m.id = l.member_id
    where l.team_id = (select id from foxes)),
  'Bo',
  'and the next member is up with a fresh board'
);

select throws_ok(
  format($$select tournament_end_turn(%L, %L::uuid, 999)$$,
         (select code from tourney), (select id from foxes)),
  'STB02', null,
  'a typed score higher than the board allows is refused'
);
select throws_ok(
  format($$select tournament_remove_member(%L, %L::uuid, %L::uuid)$$,
         (select code from tourney), (select id from foxes),
         (select id from tournament_members
           where team_id = (select id from foxes) and name = 'Anna')),
  'STB12', null,
  'a member who has rolled stays in the record'
);
select throws_ok(
  format($$select tournament_remove_member(%L, %L::uuid, %L::uuid)$$,
         (select code from tourney), (select id from foxes),
         (select id from tournament_members
           where team_id = (select id from foxes) and name = 'Bo')),
  'STB12', null,
  'and one standing at the board has to finish the turn first'
);

select lives_ok(
  format($$select tournament_end_turn(%L, %L::uuid, 40)$$,
         (select code from tourney), (select id from foxes)),
  'a score can also just be typed in, off the real box'
);
select ok(
  (select tiles_open is null from tournament_members
    where team_id = (select id from foxes) and name = 'Bo'),
  'and then there is no board to record'
);
select ok(
  not exists (select 1 from tournament_live where team_id = (select id from foxes)),
  'the last member finishing takes the board away'
);

-- ---------------------------------------------------------------------------
-- The team's score
-- ---------------------------------------------------------------------------
create temporary view fox_card as
select team
  from jsonb_array_elements(
         tournament_snapshot_by_code((select code from tourney))->'teams') team
 where team->>'id' = (select id::text from foxes);

select is(
  (select team->>'status' from fox_card),
  'done',
  'everybody has rolled, so the team is done'
);
select is(
  (select (team->>'average')::numeric from fox_card),
  56.0,
  '72 and 40 is an average of 56.0 — the team score, so a big team is not punished'
);
select is(
  (select (team->>'sum')::int from fox_card),
  112,
  'with the sum alongside it, for anyone who wants to argue'
);

-- ---------------------------------------------------------------------------
-- Derived status: a late arrival re-opens a finished team
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$select tournament_add_member(%L, %L::uuid, 'Cy')$$,
         (select code from tourney), (select id from foxes)),
  'somebody turning up late can still be added to a team that had finished'
);
select is(
  (select team->>'status' from fox_card),
  'forming',
  'which re-opens it, because the status is derived and not stored'
);

-- ---------------------------------------------------------------------------
-- Ranking across teams, and ties
-- ---------------------------------------------------------------------------
create temporary table owls on commit drop as
select ((tournament_create_team((select code from tourney), 'Owls', '🦉'))
        ->>'created_team_id')::uuid as id;

do $owls$
declare
  v_code text := (select code from tourney);
  v_team uuid := (select id from owls);
begin
  perform tournament_add_member(v_code, v_team, 'Dana');
  perform tournament_start_team(v_code, v_team);
  perform tournament_end_turn(v_code, v_team, 20);
end
$owls$;

create temporary view ranks as
select team->>'name' as name,
       (team->>'rank')::int as rnk,
       (team->>'average')::numeric as average
  from jsonb_array_elements(
         tournament_snapshot_by_code((select code from tourney))->'teams') team;

select is(
  (select rnk from ranks where name = 'Owls'),
  1,
  'the lower average leads, even though the Foxes have a member still to roll'
);
select is(
  (select rnk from ranks where name = 'Foxes'),
  2,
  'and the team that is mid-way still places on what it has scored'
);

-- Level the averages: a tie must be shared, the way the daily game shares a day.
do $tie$
declare
  v_code text := (select code from tourney);
begin
  perform tournament_correct_member(
    v_code, (select id from owls),
    (select id from tournament_members
      where team_id = (select id from owls) and name = 'Dana'),
    56);
end
$tie$;

select results_eq(
  $$select name from ranks where rnk = 1 order by name$$,
  $$values ('Foxes'), ('Owls')$$,
  'equal averages share the lead'
);
select is(
  (select jsonb_array_length(
     tournament_snapshot_by_code((select code from tourney))->'leader_team_ids')),
  2,
  'and both teams are named as leaders, so both anthems will play'
);

create temporary table ghosts on commit drop as
select ((tournament_create_team((select code from tourney), 'Ghosts', '👻'))
        ->>'created_team_id')::uuid as id;

select ok(
  (select rnk from ranks where name = 'Ghosts') is null,
  'a team that never rolled is unranked rather than last'
);

-- ---------------------------------------------------------------------------
-- Finishing
-- ---------------------------------------------------------------------------
do $empty$
declare v_code text;
begin
  v_code := (create_tournament('cc210000-0000-4000-8000-000000000001', 'Nobody played'))
            ->'tournament'->>'code';
  create temporary table empty_event on commit drop as select v_code as code;
end
$empty$;

select throws_ok(
  format($$select finish_tournament('cc210000-0000-4000-8000-000000000001', %L)$$,
         (select code from empty_event)),
  'STB05', null,
  'an event nobody played cannot be crowned'
);

select lives_ok(
  format($$select finish_tournament('cc210000-0000-4000-8000-000000000001', %L)$$,
         (select code from tourney)),
  'the organiser crowns it even though the Foxes never finished'
);
select ok(
  not exists (
    select 1 from tournament_live l
      join tournament_teams t on t.id = l.team_id
     where t.tournament_id = (select id from tournaments
                               where code = (select code from tourney))),
  'which clears every board that was still open'
);
select throws_ok(
  format($$select tournament_add_member(%L, %L::uuid, 'Too late')$$,
         (select code from tourney), (select id from foxes)),
  'STB11', null,
  'and nothing can be written to it afterwards'
);

-- ---------------------------------------------------------------------------
-- Cleaning up a rehearsal
-- ---------------------------------------------------------------------------
do $mid$
declare
  v_code text;
  v_team uuid;
begin
  v_code := (create_tournament('cc210000-0000-4000-8000-000000000001', 'Rehearsal'))
            ->'tournament'->>'code';
  v_team := ((tournament_create_team(v_code, 'Mid-turn', '🎲'))->>'created_team_id')::uuid;
  perform tournament_add_member(v_code, v_team, 'Eve');
  perform tournament_start_team(v_code, v_team);
  create temporary table rehearsal on commit drop as select v_code as code;
end
$mid$;

-- A live row points at a member row, and both hang off the team. Deleting the
-- event has to clear the board first or the foreign key fires — which is
-- exactly what would happen while cleaning up a rehearsal mid-game.
select lives_ok(
  format($$select delete_tournament('cc210000-0000-4000-8000-000000000001', %L)$$,
         (select code from rehearsal)),
  'an event can be deleted even with a team mid-turn'
);
select ok(
  tournament_snapshot_by_code((select code from rehearsal)) is null,
  'and it takes its teams, members and boards with it'
);

-- ---------------------------------------------------------------------------
-- It never touches the daily game
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from games),
  0,
  'none of this wrote a game, so ratings, badges and fika never hear about it'
);

select * from finish();
rollback;
