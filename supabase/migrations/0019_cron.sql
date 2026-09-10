-- Shut the Box — the cron ledger.
--
-- [concept: idempotency guard] Vercel Hobby fires a cron job anywhere inside
-- its scheduled hour and gives no delivery guarantee, so a job can arrive
-- twice. Everything the morning job does is loud — it posts to the team's
-- Teams channel — and a digest posted twice is worse than one posted late.
--
-- One row per (job, day) is the lock: the handler inserts first, and an
-- insert that hits the primary key means somebody already ran today, so it
-- returns {ran:false} and does nothing else. The row is also the log of what
-- that run decided.
--
-- Writing to this table on every invocation has a second job: Supabase pauses
-- a free project after seven idle days, and a daily write is what keeps the
-- office scoreboard from being asleep on Monday morning.

create table cron_runs (
  job      text not null check (job in ('morning', 'afternoon')),
  run_date date not null,
  ran_at   timestamptz not null default now(),
  result   jsonb not null default '{}'::jsonb,
  primary key (job, run_date)
);

alter table cron_runs enable row level security;

grant select, insert, update on cron_runs to service_role;

-- Games that were started and never finished — a phone died, or everyone went
-- back to their desks. They hold the "one live game per scorekeeper" index
-- and show as "Live now" on Today forever, so the morning job sweeps them.
--
-- Returns the ids it abandoned so the handler can report a number.
create or replace function abandon_stale_games(p_older_than interval default '3 hours')
returns setof uuid language plpgsql volatile
set search_path = public, pg_temp as $fn$
declare
  v_id uuid;
begin
  for v_id in
    select id from games
     where status = 'in_progress'
       and updated_at < now() - p_older_than
  loop
    -- Null actor: nobody chose this, the clock did.
    perform abandon_game(null, v_id, 'abandoned automatically — no activity');
    return next v_id;
  end loop;
end
$fn$;

revoke execute on function abandon_stale_games(interval) from public, anon, authenticated;
grant execute on function abandon_stale_games(interval) to service_role;
