-- Cutover rehearsal — the comparable numbers, in a shape that diffs.
--
-- Only touches views and columns that exist in BOTH the v1 (0002) and v2
-- (0007) schemas, so the same file runs on either side of the migration and
-- any difference in the output is a real difference in the answer.
--
-- Run with:  psql -Atf scripts/cutover/snapshot.sql

select line from (

  select 1 as sect, ps.name as k1, '' as k2,
         'STATS      ' || rpad(ps.name, 12)
         || ' games=' || ps.games_played
         || ' wins='  || ps.wins
         || ' win_pct=' || coalesce(ps.win_pct::text, '-')
         || ' avg='   || coalesce(ps.avg_score::text, '-')
         || ' best='  || coalesce(ps.best_score::text, '-')
         || ' shut='  || ps.shut_boxes                            as line
    from player_stats ps
   where ps.name like 'Fix %'

  union all
  select 2, p.name, '',
         'STREAK     ' || rpad(p.name, 12)
         || ' best='    || st.best_streak
         || ' current=' || st.current_streak
    from player_streaks st
    join players p on p.id = st.player_id
   where p.name like 'Fix %'

  union all
  select 3, dw.played_on::text, p.name,
         'DAY-WIN    ' || dw.played_on || ' ' || p.name
    from daily_winners dw
    join players p on p.id = dw.player_id
   where p.name like 'Fix %'

  union all
  select 4, mc.month::text, mc.name,
         'CHAMPION   ' || to_char(mc.month, 'YYYY-MM') || ' '
         || rpad(mc.name, 12) || ' day_wins=' || mc.day_wins
    from monthly_champions mc
   where mc.name like 'Fix %'

  union all
  select 5, gr.played_on::text || gr.game_id::text, p.name,
         'RESULT     ' || gr.played_on || ' ' || rpad(p.name, 12)
         || ' score=' || gr.score
         || ' winner=' || gr.is_winner
         || ' shut='  || gr.is_shut_box
    from game_results gr
    join players p on p.id = gr.player_id
   where p.name like 'Fix %'

  union all
  select 6, '', '',
         'TOTALS     games_in_results=' || count(distinct gr.game_id)
         || ' result_rows=' || count(*)
    from game_results gr
    join players p on p.id = gr.player_id
   where p.name like 'Fix %'

) q
order by sect, k1, k2;
