-- Shut the Box — scheduling moves from Vercel cron into the database.
--
-- Vercel's Hobby plan can run two cron jobs, once per day each, and fires
-- them somewhere inside the scheduled hour. That was fine for a digest. It
-- cannot express either of the two things asked for on 2026-09-14:
--
--   * "12:40 på vardagar" — a reminder five minutes before the match is only
--     worth sending if it is on time to the minute;
--   * "10:00" and "12:40" in STOCKHOLM time, year round. A single UTC hour is
--     the right local time for only half the year, and the plan's one-run-a-
--     day limit means you cannot simply schedule both hours and let the job
--     work out which one counts.
--
-- pg_cron has minute precision and no job limit. It still runs on UTC, so the
-- daylight-saving problem is solved the only way it can be: each job is
-- scheduled at BOTH candidate UTC hours, and the function refuses to do
-- anything unless the Stockholm wall clock actually reads the intended time.
-- In summer the earlier firing does the work and the later one declines; in
-- winter it is the other way round. Nothing to remember twice a year.
--
-- The app endpoints remain the only place that knows what a card says. This
-- migration is plumbing: it decides WHEN, never WHAT.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Where to call, and with what
-- ---------------------------------------------------------------------------
-- The base URL is not a secret and lives here. The cron secret IS one, so it
-- goes in Supabase Vault, which encrypts it at rest — never in a migration,
-- because migrations are in git.
create table cron_settings (
  id         boolean primary key default true check (id),
  app_url    text not null,
  -- Name of the Vault secret holding CRON_SECRET.
  secret_name text not null default 'cron_secret',
  updated_at timestamptz not null default now()
);

alter table cron_settings enable row level security;
grant select, insert, update on cron_settings to service_role;

comment on table cron_settings is
  'One row. The base URL the scheduled jobs call; the bearer token lives in Vault.';

/**
 * Call one of the app's cron endpoints, but only if the Stockholm clock says
 * it is the right hour.
 *
 * p_hour is the intended LOCAL hour. Each job is scheduled at both UTC hours
 * that can map to it, and this is what makes exactly one of them act.
 */
create or replace function run_scheduled_job(p_path text, p_hour integer)
returns void language plpgsql volatile
set search_path = public, extensions, vault, pg_temp as $fn$
declare
  v_local   timestamptz := now();
  v_hour    integer;
  v_cfg     cron_settings;
  v_secret  text;
begin
  v_hour := extract(hour from (v_local at time zone 'Europe/Stockholm'))::int;
  if v_hour is distinct from p_hour then
    -- The other scheduled firing is the one that counts today.
    return;
  end if;

  select * into v_cfg from cron_settings where id;
  if not found then
    raise warning 'cron_settings is empty — nothing scheduled will run';
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = v_cfg.secret_name
   limit 1;

  if v_secret is null then
    raise warning 'no Vault secret named % — cannot authenticate to %',
      v_cfg.secret_name, p_path;
    return;
  end if;

  -- Fire and forget: pg_net queues the request and returns immediately, so a
  -- slow endpoint can never hold a cron worker open. The endpoint is
  -- idempotent per day, so a retry or a double fire is harmless.
  perform net.http_get(
    url     := v_cfg.app_url || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 20000
  );
end
$fn$;

revoke execute on function run_scheduled_job(text, integer) from public, anon, authenticated;
grant execute on function run_scheduled_job(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
-- Weekday 12:40 Stockholm = 10:40 UTC in summer, 11:40 UTC in winter.
-- Monday  10:00 Stockholm = 08:00 UTC in summer, 09:00 UTC in winter.
--
-- Both hours are scheduled; run_scheduled_job throws away the wrong one. The
-- weekday field is safe to express in UTC here because none of these times is
-- near midnight, so the UTC day and the Stockholm day always agree.
select cron.unschedule(jobid)
  from cron.job
 where jobname in ('stb_prematch', 'stb_monday_digest');

select cron.schedule(
  'stb_prematch',
  '40 10,11 * * 1-5',
  $$select run_scheduled_job('/api/cron/prematch', 12)$$
);

select cron.schedule(
  'stb_monday_digest',
  '0 8,9 * * 1',
  $$select run_scheduled_job('/api/cron/morning', 10)$$
);

-- The 14:00 "nobody played today" nudge was dropped on 2026-09-14: it fired
-- after the moment it was nudging about. Unschedule it if an older deployment
-- ever created it.
select cron.unschedule(jobid) from cron.job where jobname = 'stb_afternoon';

-- cron_runs predates this and still names the jobs; 'afternoon' stays allowed
-- so existing rows keep validating.
alter table cron_runs drop constraint if exists cron_runs_job_check;
alter table cron_runs add constraint cron_runs_job_check
  check (job in ('morning', 'afternoon', 'prematch'));
