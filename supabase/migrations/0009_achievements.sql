-- Shut the Box — badges.
--
-- Small, findable rewards for things that already happen at the table, so a
-- quiet run of games still produces something to talk about.

create table achievements (
  key         text primary key,
  name        text not null,
  description text not null,
  emoji       text not null,
  sort        integer not null,
  repeatable  boolean not null default false
);

create table player_achievements (
  player_id       uuid not null references players(id),
  achievement_key text not null references achievements(key),
  -- The finished_at of the game that earned it, so re-evaluating never moves
  -- the date around.
  earned_at       timestamptz not null,
  game_id         uuid references games(id) on delete set null,
  season_id       uuid references seasons(id),
  times           integer not null default 1,
  primary key (player_id, achievement_key)
);

create index player_achievements_earned_idx on player_achievements (earned_at desc);

alter table achievements enable row level security;
alter table player_achievements enable row level security;
grant select, insert, update, delete on achievements, player_achievements
  to service_role;

comment on table player_achievements is
  'Derived: rebuilt entirely by evaluate_achievements().';

insert into achievements (key, name, description, emoji, sort, repeatable) values
  ('first_blood',    'First Blood',     'Won a day for the first time.',                       '🩸',  10, false),
  ('shut_the_box',   'Shut the Box',    'Put every tile down.',                                '📦',  20, false),
  ('box_collector',  'Box Collector',   'Shut the box five times.',                            '🗃️',  30, false),
  ('low_roller',     'Low Roller',      'Finished on three or less without shutting the box.',  '🎯',  40, false),
  ('streak_3',       'On a Roll',       'Won three days in a row.',                            '🔥',  50, false),
  ('streak_5',       'Unstoppable',     'Won five days in a row.',                             '🔥',  60, false),
  ('streak_10',      'Dynasty',         'Won ten days in a row.',                              '👑',  70, false),
  ('regular_25',     'Regular',         'Played twenty-five games.',                           '🪑',  80, false),
  ('century_100',    'Centurion',       'Played one hundred games.',                           '💯',  90, false),
  ('elo_1200',       'Rated',           'Reached a rating of 1200.',                           '📈', 100, false),
  ('giant_slayer',   'Giant Slayer',    'Beat the strongest player at the table from 150 points behind.', '🗡️', 110, false),
  ('perfect_week',   'Perfect Week',    'Won every day you played in a single week, at least three of them.', '🌟', 120, false),
  ('season_champion','Season Champion', 'Topped a completed season.',                           '🏆', 130, true);
-- 'fika_hero' arrives with the fika rota in WP-B9; there is nothing to count yet.

-- ---------------------------------------------------------------------------
-- Evaluation
-- ---------------------------------------------------------------------------

-- [concept: rebuild, do not append] Badges are derived from the game history
-- exactly like ratings are, so correcting a score cannot leave someone holding
-- a badge they no longer earned. Every insert picks the EARLIEST qualifying
-- game, which makes the result identical however many times this runs.
create or replace function evaluate_achievements()
returns void language plpgsql volatile as $fn$
begin
  delete from player_achievements;

  -- First day won.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (gr.player_id)
         gr.player_id, 'first_blood', g.finished_at, gr.game_id
    from game_results gr
    join games g on g.id = gr.game_id
   where gr.is_winner
   order by gr.player_id, g.finished_at, gr.game_id;

  -- First shut box, and the fifth.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (gr.player_id)
         gr.player_id, 'shut_the_box', g.finished_at, gr.game_id
    from game_results gr
    join games g on g.id = gr.game_id
   where gr.is_shut_box
   order by gr.player_id, g.finished_at, gr.game_id;

  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select player_id, 'box_collector', finished_at, game_id
    from (
      select gr.player_id, g.finished_at, gr.game_id,
             row_number() over (partition by gr.player_id
                                order by g.finished_at, gr.game_id) as nth
        from game_results gr
        join games g on g.id = gr.game_id
       where gr.is_shut_box
    ) ranked
   where nth = 5;

  -- A very good turn that was not quite perfect.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (gr.player_id)
         gr.player_id, 'low_roller', g.finished_at, gr.game_id
    from game_results gr
    join games g on g.id = gr.game_id
    join rulesets r on r.id = gr.ruleset_id
   where gr.score between 1 and 3
     and r.rules->'scoring'->>'kind' = 'sum_open'
   order by gr.player_id, g.finished_at, gr.game_id;

  -- Games played.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select player_id, key, finished_at, game_id
    from (
      select gr.player_id, g.finished_at, gr.game_id,
             row_number() over (partition by gr.player_id
                                order by g.finished_at, gr.game_id) as nth
        from game_results gr
        join games g on g.id = gr.game_id
    ) ranked
    join (values ('regular_25', 25), ('century_100', 100)) as m(key, at_nth)
      on ranked.nth = m.at_nth;

  -- [concept: gaps-and-islands] Streaks run over days that were PLAYED, so a
  -- weekend never breaks one. Numbering the wins inside each unbroken run gives
  -- the day the streak reached three, five or ten.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select s.player_id, m.key, s.finished_at, s.game_id
    from (
      select islands.player_id,
             row_number() over (partition by islands.player_id, islands.island
                                order by islands.day_no) as run_length,
             g.finished_at,
             (select gr.game_id from game_results gr
               where gr.player_id = islands.player_id
                 and gr.played_on = islands.played_on
                 and gr.is_winner
               order by gr.game_id limit 1) as game_id
        from (
          select w.player_id, d.day_no, d.played_on,
                 d.day_no - row_number() over (partition by w.player_id
                                               order by d.day_no) as island
            from daily_winners w
            join (
              select played_on,
                     row_number() over (order by played_on) as day_no
                from (select distinct played_on from games_valid) x
            ) d using (played_on)
        ) islands
        join lateral (
          select max(gv.finished_at) as finished_at
            from games_valid gv where gv.played_on = islands.played_on
        ) g on true
    ) s
    join (values ('streak_3', 3), ('streak_5', 5), ('streak_10', 10))
      as m(key, at_length) on s.run_length = m.at_length;

  -- The first game that took them to 1200.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (re.player_id)
         re.player_id, 'elo_1200', g.finished_at, re.game_id
    from rating_events re
    join games g on g.id = re.game_id
   where re.rating_after >= 1200
   order by re.player_id, re.seq;

  -- Beating the strongest player at the table from well behind them.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (underdog.player_id)
         underdog.player_id, 'giant_slayer', g.finished_at, underdog.game_id
    from rating_events underdog
    join games g on g.id = underdog.game_id
    join rating_events favourite
      on favourite.game_id = underdog.game_id
     and favourite.player_id <> underdog.player_id
    join game_results me
      on me.game_id = underdog.game_id and me.player_id = underdog.player_id
    join game_results them
      on them.game_id = favourite.game_id and them.player_id = favourite.player_id
   where favourite.rating_before = (
           select max(x.rating_before) from rating_events x
            where x.game_id = underdog.game_id)
     and underdog.rating_before <= favourite.rating_before - 150
     and me.finish_position < them.finish_position
   order by underdog.player_id, underdog.seq;

  -- Won every day they turned up in one week, over at least three days.
  insert into player_achievements (player_id, achievement_key, earned_at, game_id)
  select distinct on (weeks.player_id)
         weeks.player_id, 'perfect_week', weeks.finished_at, null
    from (
      select per_day.player_id,
             date_trunc('week', per_day.played_on) as week,
             max(per_day.finished_at) as finished_at,
             count(*) as days,
             bool_and(per_day.won) as every_day
        from (
          select gr.player_id, gr.played_on,
                 bool_or(gr.is_winner) as won,
                 max(g.finished_at) as finished_at
            from game_results gr
            join games g on g.id = gr.game_id
           group by gr.player_id, gr.played_on
        ) per_day
       group by per_day.player_id, date_trunc('week', per_day.played_on)
    ) weeks
   where weeks.days >= 3 and weeks.every_day
   order by weeks.player_id, weeks.finished_at;

  -- Repeatable: one per closed season won.
  insert into player_achievements (player_id, achievement_key, earned_at,
                                   season_id, times)
  select sc.player_id,
         'season_champion',
         (select max(gv.finished_at) from games_valid gv
           where gv.season_id = sc.season_id),
         sc.season_id,
         count(*) over (partition by sc.player_id)
    from season_champions sc
  on conflict (player_id, achievement_key) do nothing;
end
$fn$;

revoke execute on function evaluate_achievements() from public, anon, authenticated;
grant execute on function evaluate_achievements() to service_role;

-- Backfill for whatever history already exists.
select evaluate_achievements();
