-- pgTAP: the scheduled jobs (migration 0020).
--
-- The thing worth testing here is the daylight-saving guard. Each job is
-- scheduled at BOTH UTC hours that can map to the intended Stockholm time,
-- and run_scheduled_job is what makes exactly one of them act. If that guard
-- ever stops working, the office gets its "snart match" reminder an hour
-- early for half the year — which is precisely the failure that is hard to
-- notice in a test suite and obvious to eight people in a Teams channel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('cron_settings', 'the jobs know where to call');
select has_function('run_scheduled_job', array['text', 'integer'],
  'and how to call it');

select is(
  (select count(*)::int from cron.job where jobname = 'stb_prematch' and active),
  1, 'the 12:40 reminder is scheduled and active'
);
select is(
  (select count(*)::int from cron.job where jobname = 'stb_monday_digest' and active),
  1, 'the Monday digest is scheduled and active'
);

-- Both candidate UTC hours, or the job is wrong for half the year.
select is(
  (select schedule from cron.job where jobname = 'stb_prematch'),
  '40 10,11 * * 1-5',
  'the reminder is scheduled at both the summer and the winter UTC hour'
);
select is(
  (select schedule from cron.job where jobname = 'stb_monday_digest'),
  '0 8,9 * * 1',
  'so is the digest'
);

-- The 14:00 nudge was dropped; it must not linger.
select is(
  (select count(*)::int from cron.job where jobname = 'stb_afternoon'),
  0, 'the retired afternoon nudge is not scheduled'
);

-- The guard: an hour that is deliberately not the current Stockholm hour must
-- queue no HTTP request at all.
create temporary table queue_before on commit drop as
  select count(*) as n from net.http_request_queue;

select lives_ok(
  format('select run_scheduled_job(''/api/cron/prematch'', %s)',
         (extract(hour from (now() at time zone 'Europe/Stockholm'))::int + 5) % 24),
  'calling at the wrong local hour is not an error'
);

select is(
  (select count(*)::int from net.http_request_queue),
  (select n::int from queue_before),
  'and it sends nothing — the other firing is the one that counts'
);

select * from finish();
rollback;
