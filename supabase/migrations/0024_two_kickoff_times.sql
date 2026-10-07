-- Shut the Box — the match moves to 14:00 on Wednesday to Friday.
--
-- Gustav, 2026-10-07: Monday and Tuesday stay at 12:45, Wednesday to Friday
-- play at 14:00. The "Snart match!" reminder goes out five minutes before
-- either, so the single weekday job from 0020 splits in two. Same daylight-
-- saving trick as 0020: each job sits at both UTC hours that can map to its
-- Stockholm time, and run_scheduled_job keeps the one whose local hour
-- matches.
--
--   Mon–Tue 12:40 Stockholm = 10:40 UTC in summer, 11:40 UTC in winter
--   Wed–Fri 13:55 Stockholm = 11:55 UTC in summer, 12:55 UTC in winter
--
-- Both jobs call the same endpoint, and the card works out 12:45 or 14:00
-- from the date (kickoffTime in teams-cards.ts). The weekday split therefore
-- lives in two places: change one, change both. cron_runs still allows one
-- 'prematch' per day, and only one of the two jobs fires on any given day.

select cron.unschedule(jobid)
  from cron.job
 where jobname in ('stb_prematch', 'stb_prematch_late');

select cron.schedule(
  'stb_prematch',
  '40 10,11 * * 1-2',
  $$select run_scheduled_job('/api/cron/prematch', 12)$$
);

select cron.schedule(
  'stb_prematch_late',
  '55 11,12 * * 3-5',
  $$select run_scheduled_job('/api/cron/prematch', 13)$$
);
