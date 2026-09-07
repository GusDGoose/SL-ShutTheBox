-- pgTAP: Realtime authorization and the anon lockdown (migration 0011).
--
-- From 0011 onwards a publishable key lives in every browser, acting as the
-- `anon` role. These tests are the standing proof that it can reach nothing
-- except the board broadcasts it is meant to hear.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------------------------------------------------------------------------
-- The lockdown
--
-- Supabase's platform bootstrap grants anon SELECT/INSERT/UPDATE/DELETE on
-- every new table in public via ALTER DEFAULT PRIVILEGES, so table GRANTs
-- protect nothing here — enabling RLS with no policies is the whole lock.
--
-- 0004 created rulesets and seasons without it. Verified on a local database:
-- with RLS off, an anon DELETE through the REST API emptied the seasons table;
-- with it on, the same request removed nothing. This test is here so a future
-- table cannot repeat that, since the failure is completely silent until
-- somebody goes looking.
-- ---------------------------------------------------------------------------

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity),
  '',
  'every table in public has row level security enabled'
);

-- Deny-all means RLS on and no policies. A policy here would be a door.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '',
  'and no policies, so the deny is total'
);

-- Views have no RLS of their own: security_invoker makes them run as the
-- caller, so anon hits the base tables' deny-all instead of the view owner's
-- privileges. Without it a view would hand out everything underneath it.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not coalesce(
            (select option_value = 'true'
               from pg_options_to_table(c.reloptions)
              where option_name = 'security_invoker'),
            false)),
  '',
  'every view runs as its invoker, not its owner'
);

select is(
  (select count(*)::int
     from information_schema.routine_privileges
    where grantee in ('anon', 'authenticated', 'PUBLIC')
      and specific_schema = 'public'),
  0,
  'anon can execute nothing in public, including the game-flow RPCs'
);

-- ---------------------------------------------------------------------------
-- What anon IS allowed: hearing a board
-- ---------------------------------------------------------------------------

select ok(
  exists (
    select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'realtime' and c.relname = 'messages'
       and 'anon' = any (select rolname from pg_roles where oid = any (p.polroles))
  ),
  'anon has a policy on realtime.messages'
);

-- SELECT only: receiving is the point, and an INSERT policy would let a
-- spectator broadcast a board of their own invention to everybody else.
select is(
  (select polcmd::text from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
      and 'anon' = any (select rolname from pg_roles where oid = any (p.polroles))),
  'r',
  'and it only lets them listen, never send'
);

select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'),
  1,
  'and it is the only policy on the table'
);

-- ---------------------------------------------------------------------------
-- The broadcaster
-- ---------------------------------------------------------------------------

select has_function('public', 'broadcast_live_game', array['uuid'],
  'the broadcaster exists');

-- It writes to realtime.messages, which the app roles have no business
-- touching, so it runs as its owner rather than its caller.
select ok(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'broadcast_live_game'),
  'and runs security definer'
);

select ok(
  exists (
    select 1 from pg_trigger
     where tgrelid = 'live_turns'::regclass
       and tgname = 'live_turns_broadcast'
       and not tgisinternal
  ),
  'the live board broadcasts every change'
);

-- ---------------------------------------------------------------------------
-- One action, one broadcast
-- ---------------------------------------------------------------------------

insert into players (id, name, emoji) values
  ('bb110000-0000-4000-8000-000000000001', 'Cast Ada', '🦊'),
  ('bb110000-0000-4000-8000-000000000002', 'Cast Ben', '🐙');

-- realtime.send swallows its own errors by design, so the useful assertion is
-- that driving a whole game fires the trigger on insert, update AND delete of
-- the live board without disturbing the write path.
select lives_ok(
  $$select start_game('bb110000-0000-4000-8000-000000000001',
      array['bb110000-0000-4000-8000-000000000001',
            'bb110000-0000-4000-8000-000000000002']::uuid[])$$,
  'starting a game broadcasts (trigger on insert) without breaking the RPC'
);

create temporary view cast_game as
select id from games
 where scorekeeper_player_id = 'bb110000-0000-4000-8000-000000000001'
   and status = 'in_progress';

-- Side effects belong in a plain DO block, not nested inside a lives_ok string:
-- a function called in a WHERE against an empty table never runs at all, and
-- nesting dollar quotes two deep is unreadable. Playing the game out here
-- drives the trigger on update AND on the final delete; if either broadcast
-- raised, this statement would fail the whole file.
do $play$
declare
  v_game uuid;
begin
  select id into v_game from cast_game;
  perform live_set_board('bb110000-0000-4000-8000-000000000001', v_game, '{1,2}');
  perform end_turn('bb110000-0000-4000-8000-000000000001', v_game);
  perform end_turn('bb110000-0000-4000-8000-000000000001', v_game, 30);
  perform finish_game('bb110000-0000-4000-8000-000000000001', v_game);
end
$play$;

select is(
  (select status::text from games
    where scorekeeper_player_id = 'bb110000-0000-4000-8000-000000000001'),
  'finished',
  'a whole game plays out with the broadcast trigger attached'
);

select is(
  (select count(*)::int from live_turns lt
     join games g on g.id = lt.game_id
    where g.scorekeeper_player_id = 'bb110000-0000-4000-8000-000000000001'),
  0,
  'and the board is gone once it is crowned, so nothing keeps broadcasting'
);

select is(
  (select count(*)::int from game_results gr
     join games g on g.id = gr.game_id
    where g.scorekeeper_player_id = 'bb110000-0000-4000-8000-000000000001'),
  2,
  'with both turns recorded'
);

select * from finish();
rollback;
