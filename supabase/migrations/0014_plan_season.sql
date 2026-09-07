-- Shut the Box — choosing what the next season plays.
--
-- ensure_season() creates a quarter on demand with the vanilla ruleset, which
-- is right for a season nobody planned. But the point of making rulesets
-- first-class was that a season can run a variant, and that has to be decided
-- BEFORE the quarter starts — changing the rules of a season already in
-- progress would rewrite scores that have already been played.

create or replace function plan_season(
  p_actor        uuid,
  p_quarter_start date,
  p_ruleset_id   uuid,
  p_name         text default null
) returns uuid language plpgsql volatile as $fn$
declare
  v_start date := date_trunc('quarter', p_quarter_start::timestamp)::date;
  v_end   date := (date_trunc('quarter', p_quarter_start::timestamp)
                   + interval '3 months' - interval '1 day')::date;
  v_slug  text := to_char(v_start, 'YYYY') || '-Q'
                  || extract(quarter from v_start)::integer::text;
  v_id    uuid;
  v_before jsonb;
begin
  if not exists (select 1 from rulesets where id = p_ruleset_id) then
    raise exception 'no such ruleset' using errcode = 'STB02';
  end if;

  -- A season that has already started is played under the rules it started
  -- with. Anything else would silently rescore games that are already done.
  if v_start <= date_trunc('quarter', stockholm_today()::timestamp)::date then
    raise exception 'that season has already started' using errcode = 'STB06';
  end if;

  select id, jsonb_build_object('ruleset_id', ruleset_id, 'name', name)
    into v_id, v_before
    from seasons where slug = v_slug;

  if v_id is null then
    insert into seasons (slug, number, name, starts_on, ends_on, ruleset_id)
    select v_slug,
           coalesce(max(number), 0) + 1,
           coalesce(p_name, 'Season ' || (coalesce(max(number), 0) + 1)::text),
           v_start, v_end, p_ruleset_id
      from seasons
    returning id into v_id;
  else
    update seasons
       set ruleset_id = p_ruleset_id,
           name = coalesce(p_name, name)
     where id = v_id;
  end if;

  insert into audit_log (actor_player_id, action, entity, entity_id,
                         before, after, note)
  values (p_actor, 'season.plan', 'season', v_id, v_before,
          jsonb_build_object('ruleset_id', p_ruleset_id, 'slug', v_slug),
          format('planned %s', v_slug));

  return v_id;
end
$fn$;

-- The quarter after the one being played, which is the earliest that can be
-- planned. Used by the rules page to offer the right season.
create or replace function next_quarter_start()
returns date language sql stable as $fn$
  select (date_trunc('quarter', stockholm_today()::timestamp)
          + interval '3 months')::date
$fn$;

revoke execute on function plan_season(uuid, date, uuid, text)
  from public, anon, authenticated;
revoke execute on function next_quarter_start() from public, anon, authenticated;
grant execute on function plan_season(uuid, date, uuid, text) to service_role;
grant execute on function next_quarter_start() to service_role;
