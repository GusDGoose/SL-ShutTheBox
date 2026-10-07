-- pgTAP: the reminder follows the match to 14:00 on Wednesday–Friday (0024).
--
-- The card text works the time out from the date (teams-cards.ts); this pins
-- the other half of the pair, WHEN it is sent. If the two ever drift apart,
-- the office gets a "14:00, om några minuter" card at 12:40.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  (select schedule from cron.job where jobname = 'stb_prematch' and active),
  '40 10,11 * * 1-2',
  'the 12:40 reminder fires Monday and Tuesday only, at both UTC hours'
);
select is(
  (select command from cron.job where jobname = 'stb_prematch'),
  $$select run_scheduled_job('/api/cron/prematch', 12)$$,
  'and acts when the Stockholm hour is 12'
);

select is(
  (select schedule from cron.job where jobname = 'stb_prematch_late' and active),
  '55 11,12 * * 3-5',
  'the 13:55 reminder fires Wednesday to Friday, at both UTC hours'
);
select is(
  (select command from cron.job where jobname = 'stb_prematch_late'),
  $$select run_scheduled_job('/api/cron/prematch', 13)$$,
  'and acts when the Stockholm hour is 13, through the same endpoint'
);

-- The two UTC hours really are 13:55 in Stockholm, one in summer and one in
-- winter. An hour off here and the guard would decline both, all year.
select is(
  array[
    to_char(timestamptz '2026-07-01 11:55+00' at time zone 'Europe/Stockholm', 'HH24:MI'),
    to_char(timestamptz '2026-12-02 12:55+00' at time zone 'Europe/Stockholm', 'HH24:MI')
  ],
  array['13:55', '13:55'],
  '11:55 UTC in summer and 12:55 UTC in winter are both 13:55 in Stockholm'
);

select * from finish();
rollback;
