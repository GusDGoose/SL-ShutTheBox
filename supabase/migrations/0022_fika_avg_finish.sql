-- Shut the Box — the fika card shows the real average finishing place.
--
-- draw_fika ranks by `badness`, the normalised finish
-- (finish_position - 1) / (participants - 1): 0 for a win, 1 for last, so a
-- last place out of six is not beaten by a last place out of three. That is
-- the right thing to RANK by and the wrong thing to SHOW. The card called it
-- "snittplacering 1,00" the week Per-Erik came last twice, and the office
-- read it as "he came first". A placing is a number people already know how
-- to read — 4,5 on two games — so that is what the detail carries from now on.
--
-- `badness` stays in the detail: it is what decided the draw, and the audit
-- row should keep saying so. `avg_finish` is added beside it, rounded to one
-- decimal, and every earlier worst_last_week duty is backfilled from the same
-- games so the rota page does not go blank for the weeks already drawn.

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

  -- Worst average normalised finish over last week's games. The plain
  -- average finishing place rides along for the card.
  with played as (
    select r.player_id,
           avg((r.finish_position - 1)::numeric / (r.participants - 1)) as badness,
           avg(r.finish_position::numeric) as avg_finish,
           count(*) as games
      from game_results r
      join games_valid g on g.id = r.game_id
     where g.played_on between v_monday - 7 and v_monday - 1
       and r.participants >= 2
       and r.player_id = any(v_eligible)
     group by r.player_id
  )
  select player_id,
         jsonb_build_object('badness', round(badness, 3),
                            'avg_finish', round(avg_finish, 1),
                            'games', games,
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

-- The grants from 0018 survive a create-or-replace, but say so rather than
-- rely on it: this function must never be callable as anon.
revoke execute on function draw_fika(date, uuid) from public, anon, authenticated;
grant execute on function draw_fika(date, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Backfill: the weeks already drawn get the same number, from the same games
-- ---------------------------------------------------------------------------
-- Only worst_last_week duties have a number to show, and only those without
-- one already (a re-run of this file must not touch anything). The window is
-- the one recorded in the detail, so a duty is judged on exactly the games it
-- was drawn on — not on whatever `iso_monday` would say today.
update fika_duties d
   set detail = d.detail || jsonb_build_object('avg_finish', x.avg_finish)
  from (
    select d2.id,
           round(avg(r.finish_position::numeric), 1) as avg_finish
      from fika_duties d2
      join game_results r on r.player_id = d2.player_id
      join games_valid g on g.id = r.game_id
     where d2.reason = 'worst_last_week'
       and not (d2.detail ? 'avg_finish')
       and g.played_on between (d2.detail->>'from')::date and (d2.detail->>'to')::date
       and r.participants >= 2
     group by d2.id
  ) x
 where x.id = d.id;
