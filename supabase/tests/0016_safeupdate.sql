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
select plan(4);

-- Bare `delete from <table>;`
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* '\mdelete\s+from\s+[a-z_."]+\s*;'),
  0,
  'no function in public deletes without a WHERE clause'
);

-- `update <table> set ... ;` with no WHERE anywhere in the statement.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(
      pg_get_functiondef(p.oid),
      '\mupdate\s+[a-z_."]+\s+set\s+[^;]*;',
      'gi') m
    where n.nspname = 'public'
      and p.prokind = 'f'
      and m[0] !~* '\mwhere\M'),
  0,
  'no function in public updates without a WHERE clause'
);

-- And the two that were fixed still do their job.
select lives_ok($$select recompute_ratings()$$, 'recompute_ratings still runs');
select lives_ok($$select evaluate_achievements()$$, 'evaluate_achievements still runs');

select * from finish();
rollback;
