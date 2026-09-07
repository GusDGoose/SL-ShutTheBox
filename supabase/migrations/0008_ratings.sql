-- Shut the Box — a skill rating.
--
-- Wins alone flatter whoever plays most. A rating answers "who is actually
-- good", and it has to survive the game history being corrected: editing
-- yesterday's score, backdating a forgotten Friday or deleting a game all
-- change who beat whom, so ratings are never accumulated in place — they are
-- replayed from the games every time.

create table rating_events (
  game_id       uuid not null references games(id) on delete cascade,
  player_id     uuid not null references players(id),
  played_on     date not null,
  seq           integer not null,          -- global game order used by the replay
  rating_before numeric(8,2) not null,
  rating_after  numeric(8,2) not null,
  delta         numeric(8,2) not null,
  k             smallint not null,
  opponents     smallint not null,
  primary key (game_id, player_id)
);

create index rating_events_player_idx on rating_events (player_id, seq);
create index rating_events_played_on_idx on rating_events (played_on);

alter table rating_events enable row level security;
grant select, insert, delete on rating_events to service_role;

comment on table rating_events is
  'One row per player per rated game. Derived: rebuilt entirely by recompute_ratings().';

-- ---------------------------------------------------------------------------
-- The replay
-- ---------------------------------------------------------------------------

-- [concept: full replay] Every finish, edit, backdate or delete rebuilds the
-- whole history rather than adjusting the tail. For an office game — a few
-- hundred games and a dozen players — that is milliseconds, and it removes a
-- whole category of bug: there is no such thing as a rating that drifted out of
-- step with the games it came from.
--
-- Pairwise Elo: each game is treated as a mini tournament where you play
-- everyone at the table. K is divided by the number of opponents so a six-player
-- game does not move ratings six times as much as a two-player one.
create or replace function recompute_ratings()
returns void language plpgsql volatile as $fn$
declare
  v_start   constant numeric := 1000;
  v_k_new   constant integer := 64;   -- while a player is still being placed
  v_k_settled constant integer := 32;
  v_provisional constant integer := 10;

  v_state   jsonb := '{}'::jsonb;     -- player_id -> { r: rating, n: games }
  v_game    record;
  v_seq     integer := 0;
  v_players uuid[];
  v_places  integer[];
  v_m       integer;
  i         integer;
  j         integer;
  v_id      uuid;
  v_r_i     numeric;
  v_r_j     numeric;
  v_n_i     integer;
  v_k       integer;
  v_score   numeric;
  v_expected numeric;
  v_sum     numeric;
  v_delta   numeric;
begin
  delete from rating_events;

  for v_game in
    select g.id, g.played_on
      from games_valid g
     order by g.played_on, g.finished_at, g.id
  loop
    -- finish_position already accounts for the ruleset's win direction and tie
    -- policy, so the rating never needs to know which way round the game runs.
    select array_agg(gr.player_id order by gr.player_id),
           array_agg(gr.finish_position order by gr.player_id)
      into v_players, v_places
      from game_results gr
     where gr.game_id = v_game.id;

    v_m := coalesce(array_length(v_players, 1), 0);
    -- A solo game has nobody to be better than.
    if v_m < 2 then
      continue;
    end if;

    v_seq := v_seq + 1;

    -- Seed anyone new at the starting rating.
    for i in 1 .. v_m loop
      v_id := v_players[i];
      if not v_state ? v_id::text then
        v_state := jsonb_set(
          v_state, array[v_id::text],
          jsonb_build_object('r', v_start, 'n', 0));
      end if;
    end loop;

    -- Deltas are computed against the ratings as they were BEFORE this game,
    -- so the order players are processed in cannot change the result.
    for i in 1 .. v_m loop
      v_id  := v_players[i];
      v_r_i := (v_state -> v_id::text -> 'r')::numeric;
      v_n_i := (v_state -> v_id::text -> 'n')::integer;
      v_k   := case when v_n_i < v_provisional then v_k_new else v_k_settled end;

      v_sum := 0;
      for j in 1 .. v_m loop
        if i = j then
          continue;
        end if;
        v_r_j := (v_state -> v_players[j]::text -> 'r')::numeric;

        -- Finishing ahead is a win, level is a half. A shared win between two
        -- players is worth the same to each as half a victory.
        v_score := case
                     when v_places[i] < v_places[j] then 1.0
                     when v_places[i] = v_places[j] then 0.5
                     else 0.0
                   end;
        v_expected := 1.0 / (1.0 + power(10.0, (v_r_j - v_r_i) / 400.0));
        v_sum := v_sum + (v_score - v_expected);
      end loop;

      v_delta := (v_k::numeric / (v_m - 1)) * v_sum;

      insert into rating_events (game_id, player_id, played_on, seq,
                                 rating_before, rating_after, delta, k, opponents)
      values (v_game.id, v_id, v_game.played_on, v_seq,
              round(v_r_i, 2), round(v_r_i + v_delta, 2), round(v_delta, 2),
              v_k, v_m - 1);
    end loop;

    -- Applied only once every delta for the game is known.
    for i in 1 .. v_m loop
      v_id := v_players[i];
      v_state := jsonb_set(
        v_state, array[v_id::text],
        jsonb_build_object(
          'r', (select rating_after from rating_events
                 where game_id = v_game.id and player_id = v_id),
          'n', (v_state -> v_id::text -> 'n')::integer + 1));
    end loop;
  end loop;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Reading it back
-- ---------------------------------------------------------------------------

create view player_ratings with (security_invoker = true) as
select p.id                                          as player_id,
       p.name,
       p.emoji,
       p.is_active,
       coalesce(last.rating_after, 1000)::numeric(8,2) as rating,
       coalesce(agg.games, 0)::int                     as rated_games,
       coalesce(agg.peak, 1000)::numeric(8,2)          as peak_rating,
       (coalesce(agg.peak, 1000) - coalesce(last.rating_after, 1000))::numeric(8,2)
                                                       as below_peak,
       -- Enough games to mean something. Below this the number is still moving
       -- around too much to put on a leaderboard.
       coalesce(agg.games, 0) >= 10                    as is_established
  from players p
  left join lateral (
    select re.rating_after
      from rating_events re
     where re.player_id = p.id
     order by re.seq desc
     limit 1
  ) last on true
  left join lateral (
    select count(*) as games, max(re.rating_after) as peak
      from rating_events re
     where re.player_id = p.id
  ) agg on true;

create view rating_history with (security_invoker = true) as
select re.*, g.finished_at
  from rating_events re
  join games g on g.id = re.game_id;

-- The single worst afternoon anyone has had: the largest rating loss in one
-- game, and whether they went in as the strongest player at the table.
create view biggest_chokes with (security_invoker = true) as
select re.game_id,
       re.player_id,
       re.played_on,
       re.delta,
       re.rating_before,
       re.rating_before = max(re.rating_before) over (partition by re.game_id)
         as was_favourite
  from rating_events re;

-- ---------------------------------------------------------------------------
-- Hall of fame
--
-- Deliberately SQL rather than computed in the page: v1 worked out "lowest
-- score ever" over the most recent 200 result rows, so the record quietly
-- became wrong once history outgrew that window.
-- ---------------------------------------------------------------------------

create view hall_of_fame with (security_invoker = true) as
  (select 'lowest_score'::text as key, gr.player_id, gr.score::numeric as value,
          gr.game_id, gr.played_on
     from game_results gr
     join rulesets r on r.id = gr.ruleset_id
    where r.rules->>'win' = 'lowest'
    order by gr.score, gr.played_on
    limit 1)
union all
  (select 'most_shut_boxes', ps.player_id, ps.shut_boxes::numeric, null, null
     from player_stats ps
    where ps.shut_boxes > 0
    order by ps.shut_boxes desc
    limit 1)
union all
  (select 'longest_streak', pk.player_id, pk.best_streak::numeric, null, null
     from player_streaks pk
    where pk.best_streak > 0
    order by pk.best_streak desc
    limit 1)
union all
  (select 'peak_rating', pr.player_id, pr.peak_rating, null, null
     from player_ratings pr
    where pr.rated_games > 0
    order by pr.peak_rating desc
    limit 1)
union all
  (select 'biggest_choke', bc.player_id, bc.delta, bc.game_id, bc.played_on
     from biggest_chokes bc
    order by bc.delta asc
    limit 1);

grant select on player_ratings, rating_history, biggest_chokes, hall_of_fame
  to service_role;

revoke execute on function recompute_ratings() from public, anon, authenticated;
grant execute on function recompute_ratings() to service_role;

-- Backfill: build the ratings for whatever history already exists.
select recompute_ratings();
