-- Shut the Box — the stats views, rebuilt.
--
-- These are the app's brain: every number on the stats pages is a `select *`
-- from here, so nothing is aggregated twice in TypeScript and drifts. 0004 had
-- to drop the v1 versions to retire games.max_tile; this recreates them, now
-- ruleset-aware (win direction, tie policy, scoring) and aware that a game can
-- be in progress, abandoned or soft-deleted.
--
-- IMPORTANT: every view carries `with (security_invoker = true)`. A Postgres
-- view otherwise runs with its OWNER's privileges, silently bypassing the base
-- tables' RLS and leaking data through Supabase's REST API.

-- ---------------------------------------------------------------------------
-- The one definition of "a real game"
-- ---------------------------------------------------------------------------

-- [concept: base view] Every stats view reads through this, so "finished, not
-- deleted, somebody actually played" is defined once. It is also what keeps a
-- soft-deleted game out of the streak day index: in v1 an orphan games row
-- silently reset every player's current streak.
create view games_valid with (security_invoker = true) as
select g.id,
       g.played_on,
       g.season_id,
       g.ruleset_id,
       g.finished_at,
       g.photo_path,
       r.rules
  from games g
  join rulesets r on r.id = g.ruleset_id
 where g.status = 'finished'
   and g.deleted_at is null
   and exists (
     select 1 from game_players gp
      where gp.game_id = g.id and gp.status = 'done'
   );

-- ---------------------------------------------------------------------------
-- Per-player, per-game results
-- ---------------------------------------------------------------------------

-- [concept: window function] The winner is DERIVED, never stored, so ties are
-- shared wins by construction and correcting a score re-crowns automatically.
-- Ranking multiplies by ruleset_win_sign so a highest-wins season needs no
-- special case, and `ties: earliest_turn` breaks a tie by who played first.
create view game_results with (security_invoker = true) as
with ranked as (
  select gp.game_id,
         g.played_on,
         g.season_id,
         g.ruleset_id,
         gp.player_id,
         gp.turn_order,
         gp.score,
         gp.tiles_open,
         gp.predicted_score,
         count(*) over (partition by gp.game_id) as participants,
         case
           when g.rules->>'ties' = 'earliest_turn' then
             row_number() over (
               partition by gp.game_id
               order by gp.score * ruleset_win_sign(g.rules), gp.turn_order
             )
           else
             rank() over (
               partition by gp.game_id
               order by gp.score * ruleset_win_sign(g.rules)
             )
         end as finish_position
    from game_players gp
    join games_valid g on g.id = gp.game_id
   where gp.status = 'done'
)
select game_id,
       played_on,
       season_id,
       ruleset_id,
       player_id,
       turn_order,
       score,
       tiles_open,
       predicted_score,
       participants,
       finish_position,
       finish_position = 1 as is_winner,
       -- The physical fact: nothing left standing. A typed score can only be
       -- inferred from a zero.
       coalesce(cardinality(tiles_open) = 0, score = 0) as is_shut_box
  from ranked;

-- Winning any game on a day wins the day; several people can share it.
create view daily_winners with (security_invoker = true) as
select distinct played_on, player_id
  from game_results
 where is_winner;

-- ---------------------------------------------------------------------------
-- Player aggregates
-- ---------------------------------------------------------------------------

create view player_stats with (security_invoker = true) as
select p.id                                                  as player_id,
       p.name,
       p.emoji,
       p.is_active,
       count(gr.game_id)::int                                 as games_played,
       count(*) filter (where gr.is_winner)::int              as wins,
       round(100.0 * count(*) filter (where gr.is_winner)
             / nullif(count(gr.game_id), 0), 1)              as win_pct,
       round(avg(gr.score), 2)                                as avg_score,
       min(gr.score)                                          as best_score,
       max(gr.score)                                          as worst_score,
       round(avg(gr.finish_position), 2)                      as avg_finish,
       count(*) filter (where gr.is_shut_box)::int            as shut_boxes,
       max(gr.played_on)                                      as last_played_on,
       -- Present but never got a turn because someone shut the box. Counted
       -- separately: it is not a game played, and it is not nothing either.
       (select count(*)
          from game_players x
          join games_valid v on v.id = x.game_id
         where x.player_id = p.id and x.status = 'dnp')::int   as dnp_count
  from players p
  left join game_results gr on gr.player_id = p.id
 group by p.id, p.name, p.emoji, p.is_active;

-- [concept: gaps-and-islands] Number the days that were actually played 1..N.
-- Within an unbroken run of wins, (day_no - row_number()) is constant, so
-- grouping by that difference isolates each streak. Counting played days rather
-- than calendar days is what stops a weekend breaking a streak.
create view player_streaks with (security_invoker = true) as
with day_index as (
  select played_on,
         row_number() over (order by played_on) as day_no
    from (select distinct played_on from games_valid) d
),
wins as (
  select dw.player_id, di.day_no
    from daily_winners dw
    join day_index di using (played_on)
),
islands as (
  select player_id,
         day_no,
         day_no - row_number() over (partition by player_id order by day_no)
           as island_id
    from wins
),
streaks as (
  select player_id, count(*)::int as length, max(day_no) as last_day_no
    from islands
   group by player_id, island_id
)
select p.id                       as player_id,
       p.name,
       p.emoji,
       coalesce(max(s.length), 0) as best_streak,
       -- A current streak only counts if they won the most recent played day.
       coalesce(max(s.length) filter (
         where s.last_day_no = (select max(day_no) from day_index)
       ), 0)                      as current_streak
  from players p
  left join streaks s on s.player_id = p.id
 group by p.id, p.name, p.emoji;

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------

-- rank(), not row_number(), so a tied month has joint champions.
create view monthly_champions with (security_invoker = true) as
with day_wins as (
  select date_trunc('month', played_on)::date as month,
         player_id,
         count(*)::int as day_wins
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

create view season_standings with (security_invoker = true) as
select s.id                                                   as season_id,
       s.slug                                                 as season_slug,
       s.number                                               as season_number,
       gr.player_id,
       p.name,
       p.emoji,
       count(distinct gr.played_on)
         filter (where gr.is_winner)::int                      as day_wins,
       count(*) filter (where gr.is_winner)::int               as wins,
       count(*)::int                                           as games_played,
       round(avg(gr.score), 2)                                 as avg_score,
       min(gr.score)                                           as best_score,
       round(avg(gr.finish_position), 2)                       as avg_finish,
       count(*) filter (where gr.is_shut_box)::int             as shut_boxes,
       rank() over (
         partition by s.id
         order by count(distinct gr.played_on) filter (where gr.is_winner) desc,
                  count(*) filter (where gr.is_winner) desc,
                  avg(gr.finish_position) asc
       )                                                       as rnk
  from seasons s
  join game_results gr on gr.season_id = s.id
  join players p on p.id = gr.player_id
 group by s.id, s.slug, s.number, gr.player_id, p.name, p.emoji;

-- Only closed seasons have champions; the current one is still being played.
create view season_champions with (security_invoker = true) as
select ss.*, s.name as season_name, s.starts_on, s.ends_on
  from season_standings ss
  join seasons s on s.id = ss.season_id
 where ss.rnk = 1
   and s.ends_on < stockholm_today();

-- ---------------------------------------------------------------------------
-- Head to head
-- ---------------------------------------------------------------------------

-- One row per ordered pair, so a player's record against everyone is a simple
-- `where a_id = me`.
create view head_to_head with (security_invoker = true) as
select a.player_id                                                as a_id,
       b.player_id                                                as b_id,
       count(*)::int                                              as meetings,
       count(*) filter (where a.finish_position < b.finish_position)::int as a_wins,
       count(*) filter (where a.finish_position > b.finish_position)::int as b_wins,
       count(*) filter (where a.finish_position = b.finish_position)::int as ties,
       max(a.played_on)                                           as last_met
  from game_results a
  join game_results b
    on b.game_id = a.game_id
   and b.player_id <> a.player_id
 group by a.player_id, b.player_id;

-- The opponent who beats you most often, over enough games to mean something.
create view player_nemesis with (security_invoker = true) as
select distinct on (h.a_id)
       h.a_id     as player_id,
       h.b_id     as nemesis_id,
       p.name     as nemesis_name,
       p.emoji    as nemesis_emoji,
       h.meetings,
       h.a_wins,
       h.b_wins,
       round(100.0 * h.b_wins / h.meetings, 1) as nemesis_win_pct
  from head_to_head h
  join players p on p.id = h.b_id
 where h.meetings >= 5
 order by h.a_id, h.b_wins::numeric / h.meetings desc, h.meetings desc;

-- ---------------------------------------------------------------------------
-- Distributions and trends
-- ---------------------------------------------------------------------------

create view score_distribution with (security_invoker = true) as
select player_id, ruleset_id, score, count(*)::int as n
  from game_results
 group by 1, 2, 3;

create view player_trends with (security_invoker = true) as
select player_id,
       date_trunc('month', played_on)::date       as month,
       count(*)::int                              as games,
       round(avg(score), 2)                       as avg_score,
       min(score)                                 as best_score,
       count(*) filter (where is_winner)::int     as wins
  from game_results
 group by 1, 2;

-- ---------------------------------------------------------------------------
-- Live games
-- ---------------------------------------------------------------------------

create view live_games with (security_invoker = true) as
select g.id,
       g.played_on,
       g.season_id,
       g.ruleset_id,
       g.scorekeeper_player_id,
       g.created_by,
       g.started_at,
       g.updated_at,
       lt.player_id  as current_player_id,
       lt.tiles_down,
       lt.version
  from games g
  left join live_turns lt on lt.game_id = g.id
 where g.status = 'in_progress'
   and g.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Privileges — views need their own grant, separate from the base tables
-- ---------------------------------------------------------------------------

grant select on
  games_valid,
  game_results,
  daily_winners,
  player_stats,
  player_streaks,
  monthly_champions,
  season_standings,
  season_champions,
  head_to_head,
  player_nemesis,
  score_distribution,
  player_trends,
  live_games
to service_role;
