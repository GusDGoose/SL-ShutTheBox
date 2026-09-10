-- Shut the Box — the fika rota.
--
-- One person buys fika each week, and the office rule is that it is whoever
-- played worst last week. Two things stop that being simply "the loser buys":
--
--   * nobody repeats until everybody has had a turn. That is what a *cycle*
--     is: it opens when the last one is exhausted and closes when every
--     active player has bought once. Being worst decides the ORDER within a
--     cycle, not how often your turn comes round;
--   * "worst" has to survive different-sized games. A last place out of three
--     is not the same as a last place out of six, so the score is the average
--     normalised finish, (finish_position - 1) / (participants - 1) — 0 for a
--     win, 1 for last, whatever the field size. Solo games are ignored: you
--     cannot lose to nobody.
--
-- Ties are broken at random, and a week where nobody eligible actually played
-- falls back to a random eligible player, recorded as such so the card can be
-- honest about it ("nobody eligible played last week").
--
-- Skipping (a holiday, an unlucky week) marks the duty skipped and redraws.
-- The skipped player stays eligible in the cycle — they have not bought yet —
-- but is excluded from this particular week, or the redraw would just pick
-- them again.

create table fika_cycles (
  id         uuid primary key default gen_random_uuid(),
  -- "The latest cycle" cannot be decided by started_on: a cycle that is
  -- exhausted and restarted on the same day ties with its predecessor, and
  -- the tiebreak would be random uuid order — which silently reopens the old
  -- cycle and lets somebody buy twice. A sequence is the only honest order.
  seq        bigint generated always as identity,
  started_on date not null default stockholm_today()
);

create table fika_duties (
  id         uuid primary key default gen_random_uuid(),
  -- The ISO Monday the duty belongs to. Constrained rather than trusted: a
  -- duty drawn for a Wednesday would quietly split a week in two.
  week_start date not null check (extract(isodow from week_start) = 1),
  cycle_id   uuid not null references fika_cycles(id) on delete cascade,
  player_id  uuid not null references players(id),
  reason     text not null check (reason in ('worst_last_week', 'random_fallback')),
  -- How the draw was decided, for the card: field size, score, who else was
  -- in the running. Read by humans, never by a query.
  detail     jsonb not null default '{}'::jsonb,
  drawn_at   timestamptz not null default now(),
  -- Null actor means the Monday cron drew it rather than a person.
  drawn_by   uuid references players(id),
  skipped_at timestamptz,
  skipped_by uuid references players(id),
  check ((skipped_at is null) = (skipped_by is null))
);

-- At most one duty standing per week. This is also what makes draw_fika
-- idempotent: two crons firing at once, or a cron racing a person pressing
-- "Redraw", and the second insert simply loses.
create unique index fika_one_duty_per_week
  on fika_duties (week_start)
  where skipped_at is null;

create index fika_duties_cycle_idx on fika_duties (cycle_id);
create index fika_duties_player_idx on fika_duties (player_id);

alter table fika_cycles enable row level security;
alter table fika_duties enable row level security;

grant select, insert on fika_cycles to service_role;
grant select, insert, update on fika_duties to service_role;

-- The Monday of the week a date falls in. date_trunc('week') is already ISO
-- (Monday-based) in Postgres; this exists so the intent is readable at the
-- call sites and the cast lives in one place.
create or replace function iso_monday(p_date date)
returns date language sql immutable as $fn$
  select date_trunc('week', p_date)::date;
$fn$;

/**
 * Draw the buyer for a week, or return the duty already standing for it.
 *
 * Returns the fika_duties row. Raises STB08 only when there is nobody at all
 * to pick from — an empty or fully benched roster.
 */
create or replace function draw_fika(
  p_week_start date,
  p_actor      uuid default null
) returns fika_duties language plpgsql volatile
set search_path = public, pg_temp as $fn$
declare
  v_monday    date := iso_monday(p_week_start);
  v_cycle     uuid;
  v_eligible  uuid[];
  v_pick      uuid;
  v_reason    text;
  v_detail    jsonb := '{}'::jsonb;
  v_duty      fika_duties;
begin
  -- Already settled for this week: hand back what is there. Callers rely on
  -- this — the Monday cron and the Redraw button both just ask.
  select * into v_duty
    from fika_duties
   where week_start = v_monday and skipped_at is null;
  if found then
    return v_duty;
  end if;

  select id into v_cycle from fika_cycles order by seq desc limit 1;
  if v_cycle is null then
    insert into fika_cycles default values returning id into v_cycle;
  end if;

  -- Everyone active who has not already bought in this cycle.
  select coalesce(array_agg(p.id), '{}') into v_eligible
    from players p
   where p.is_active
     and not exists (
       select 1 from fika_duties d
        where d.cycle_id = v_cycle
          and d.player_id = p.id
          and d.skipped_at is null
     );

  -- Cycle exhausted: everybody has had a turn, so open the next one and put
  -- the whole active roster back in the hat.
  if cardinality(v_eligible) = 0 then
    insert into fika_cycles default values returning id into v_cycle;
    select coalesce(array_agg(p.id), '{}') into v_eligible
      from players p where p.is_active;
  end if;

  if cardinality(v_eligible) = 0 then
    raise exception 'nobody is eligible for fika' using errcode = 'STB08';
  end if;

  -- Somebody already turned this week down: they keep their place in the
  -- cycle but must not be handed straight back the same week.
  select coalesce(array_agg(x), '{}') into v_eligible
    from unnest(v_eligible) x
   where not exists (
     select 1 from fika_duties d
      where d.week_start = v_monday
        and d.player_id = x
        and d.skipped_at is not null
   );

  if cardinality(v_eligible) = 0 then
    raise exception 'everybody eligible has skipped this week' using errcode = 'STB08';
  end if;

  -- Worst average normalised finish over last week's games.
  with played as (
    select r.player_id,
           avg((r.finish_position - 1)::numeric / (r.participants - 1)) as badness,
           count(*) as games
      from game_results r
      join games_valid g on g.id = r.game_id
     where g.played_on between v_monday - 7 and v_monday - 1
       and r.participants >= 2
       and r.player_id = any(v_eligible)
     group by r.player_id
  )
  select player_id,
         jsonb_build_object('badness', round(badness, 3), 'games', games,
                            'from', v_monday - 7, 'to', v_monday - 1)
    into v_pick, v_detail
    from played
   order by badness desc, random()
   limit 1;

  if v_pick is not null then
    v_reason := 'worst_last_week';
  else
    -- Nobody eligible played last week (a quiet week, holidays, or everyone
    -- left in the cycle happened to be away). Straight random.
    select x into v_pick from unnest(v_eligible) x order by random() limit 1;
    v_reason := 'random_fallback';
    v_detail := jsonb_build_object('from', v_monday - 7, 'to', v_monday - 1);
  end if;

  insert into fika_duties (week_start, cycle_id, player_id, reason, detail, drawn_by)
  values (v_monday, v_cycle, v_pick, v_reason, v_detail, p_actor)
  on conflict do nothing
  returning * into v_duty;

  -- Lost the race with a concurrent draw: return the one that won.
  if v_duty.id is null then
    select * into v_duty
      from fika_duties
     where week_start = v_monday and skipped_at is null;
  end if;

  insert into audit_log (actor_player_id, action, entity, entity_id, after, note)
  values (p_actor, 'fika.draw', 'fika', v_duty.id, to_jsonb(v_duty),
          format('%s buys fika for the week of %s', v_duty.player_id, v_monday));

  return v_duty;
end
$fn$;

/**
 * Turn a duty down and immediately draw a replacement for the same week.
 * The skipper stays in the cycle: they have still not bought.
 */
create or replace function skip_fika(
  p_actor   uuid,
  p_duty_id uuid
) returns fika_duties language plpgsql volatile
set search_path = public, pg_temp as $fn$
declare
  v_old fika_duties;
begin
  select * into v_old from fika_duties where id = p_duty_id;
  if not found then
    raise exception 'no such fika duty' using errcode = 'STB08';
  end if;
  if v_old.skipped_at is not null then
    raise exception 'that duty was already skipped' using errcode = 'STB03';
  end if;

  -- safeupdate (0016) refuses any UPDATE without a WHERE on the API
  -- connection, and pgTAP would never notice because it runs as postgres.
  update fika_duties
     set skipped_at = now(), skipped_by = p_actor
   where id = p_duty_id;

  insert into audit_log (actor_player_id, action, entity, entity_id, before, note)
  values (p_actor, 'fika.skip', 'fika', p_duty_id, to_jsonb(v_old),
          format('%s skipped the week of %s', v_old.player_id, v_old.week_start));

  return draw_fika(v_old.week_start, p_actor);
end
$fn$;

-- Who is buying, this week. One row or none.
create or replace view fika_current
with (security_invoker = true) as
  select d.id,
         d.week_start,
         d.player_id,
         p.name,
         p.emoji,
         d.reason,
         d.detail,
         d.drawn_at,
         (select count(*) from fika_duties h
           where h.player_id = d.player_id and h.skipped_at is null) as duties_total
    from fika_duties d
    join players p on p.id = d.player_id
   where d.skipped_at is null
     and d.week_start = iso_monday(stockholm_today());

grant select on fika_current to service_role;

-- How many times each player has bought, for the profile page.
create or replace view fika_tally
with (security_invoker = true) as
  select p.id as player_id,
         count(d.id) filter (where d.skipped_at is null) as duties
    from players p
    left join fika_duties d on d.player_id = p.id
   group by p.id;

grant select on fika_tally to service_role;

do $grants$
declare v_fn text;
begin
  foreach v_fn in array array[
    'iso_monday(date)',
    'draw_fika(date, uuid)',
    'skip_fika(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;
