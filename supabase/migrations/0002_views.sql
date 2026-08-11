-- Shut the Box — stats views (the app's brain: all winner/streak/stats logic)
-- Run after 0001_tables.sql.
--
-- IMPORTANT: every view carries `with (security_invoker = true)`. Postgres views
-- otherwise execute with the view OWNER's privileges, which would silently
-- bypass table RLS and leak data through Supabase's REST API.

-- Per-player, per-game result with derived winner flag.
-- [concept: window function] min(...) over (partition by game) compares each row
-- to the best score in its own game without a self-join. Winner is DERIVED,
-- never stored — ties naturally become shared wins.
create view game_results with (security_invoker = true) as
select
  gp.game_id,
  g.played_on,
  g.max_tile,
  gp.player_id,
  gp.score,
  gp.tiles_open,
  gp.score = min(gp.score) over (partition by gp.game_id) as is_winner,
  gp.score = 0                                            as is_shut_box
from game_players gp
join games g on g.id = gp.game_id;

-- Who won each played day (winning any game that day counts).
create view daily_winners with (security_invoker = true) as
select distinct played_on, player_id
from game_results
where is_winner;

-- Headline numbers per player.
create view player_stats with (security_invoker = true) as
select
  p.id                                                as player_id,
  p.name,
  p.emoji,
  count(gr.game_id)::int                              as games_played,
  count(*) filter (where gr.is_winner)::int           as wins,
  round(100.0 * count(*) filter (where gr.is_winner)
        / nullif(count(gr.game_id), 0), 1)            as win_pct,
  round(avg(gr.score), 2)                             as avg_score,
  min(gr.score)                                       as best_score,
  count(*) filter (where gr.is_shut_box)::int         as shut_boxes
from players p
left join game_results gr on gr.player_id = p.id
group by p.id, p.name, p.emoji;

-- Streaks over consecutive PLAYED days (weekends/holidays don't break streaks).
-- [concept: gaps-and-islands] Number the played days 1..N. For each player's won
-- days, (day_no - row_number()) is constant within an unbroken run ("island");
-- grouping by that difference isolates each streak.
create view player_streaks with (security_invoker = true) as
with day_index as (
  select played_on, row_number() over (order by played_on) as day_no
  from (select distinct played_on from games) d
),
wins as (
  select dw.player_id, di.day_no
  from daily_winners dw
  join day_index di using (played_on)
),
islands as (
  select player_id, day_no,
         day_no - row_number() over (partition by player_id order by day_no) as island_id
  from wins
),
streaks as (
  select player_id, count(*)::int as length, max(day_no) as last_day_no
  from islands
  group by player_id, island_id
)
select
  p.id                       as player_id,
  p.name,
  coalesce(max(s.length), 0) as best_streak,
  -- current streak counts only if the player won the most recent played day
  coalesce(max(s.length) filter (
    where s.last_day_no = (select max(day_no) from day_index)
  ), 0)                      as current_streak
from players p
left join streaks s on s.player_id = p.id
group by p.id, p.name;

-- Player(s) with the most day-wins per calendar month (ties share the title).
create view monthly_champions with (security_invoker = true) as
with day_wins as (
  select date_trunc('month', played_on)::date as month, player_id, count(*)::int as day_wins
  from daily_winners
  group by 1, 2
),
ranked as (
  select *, rank() over (partition by month order by day_wins desc) as rnk
  from day_wins
)
select r.month, r.player_id, p.name, p.emoji, r.day_wins
from ranked r
join players p on p.id = r.player_id
where r.rnk = 1;
