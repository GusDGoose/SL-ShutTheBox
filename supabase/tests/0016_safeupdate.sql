-- pgTAP: no function may DELETE or UPDATE without a WHERE clause (migration 0016).
--
-- The API connection loads Supabase's `safeupdate`, which refuses exactly that
-- with SQLSTATE 21000. pgTAP cannot load the library itself — postgres is not
-- allowed to — so this is a STATIC check over every function body in `public`
-- instead: the guard that would have caught 0008 and 0009 before they broke
-- crowning from the app. The dynamic check is the browser step of each
-- package: call the RPC through /rest/v1/rpc with the local service key.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Bare `delete from <table>;`
create temporary view bare_deletes as
select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and pg_get_functiondef(p.oid) ~* '\mdelete\s+from\s+[a-z_."]+\s*;';

-- `update <table> set ... ;` with no WHERE anywhere in the statement.
--
-- regexp_matches() hands back the captures, and with no capture group the
-- whole match is element ONE. This used to read m[0], which is always NULL, so
-- `NULL !~* 'where'` was never true and the check passed whatever the code
-- said — from 0016 until the probe below was added to prove it can fail.
create temporary view bare_updates as
select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 cross join lateral regexp_matches(
   pg_get_functiondef(p.oid),
   '\mupdate\s+[a-z_."]+\s+set\s+[^;]*;',
   'gi') m
 where n.nspname = 'public'
   and p.prokind = 'f'
   and m[1] !~* '\mwhere\M';

select is(
  (select count(*)::int from bare_deletes), 0,
  'no function in public deletes without a WHERE clause'
);
select is(
  (select count(*)::int from bare_updates), 0,
  'no function in public updates without a WHERE clause'
);

-- A guard that has never failed has not been shown to work. One deliberately
-- bad function each, rolled back with the rest of the test.
create function public.stb_guard_probe_update() returns void
language plpgsql as $fn$ begin update players set name = name; end $fn$;
create function public.stb_guard_probe_delete() returns void
language plpgsql as $fn$ begin delete from players; end $fn$;

select is(
  (select count(*)::int from bare_updates where proname = 'stb_guard_probe_update'), 1,
  'the scan does catch a bare update'
);
select is(
  (select count(*)::int from bare_deletes where proname = 'stb_guard_probe_delete'), 1,
  'the scan does catch a bare delete'
);

-- And the two that were fixed still do their job.
select lives_ok($$select recompute_ratings()$$, 'recompute_ratings still runs');
select lives_ok($$select evaluate_achievements()$$, 'evaluate_achievements still runs');

select * from finish();
rollback;
