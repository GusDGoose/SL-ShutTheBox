-- ===========================================================================
-- Shut the Box — merge the days that hold two counted games, so each has one.
--
-- RUN THIS BEFORE MIGRATION 0023, in the Supabase dashboard SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run). 0023 makes "one counted
-- game per day" a unique index, and refuses to apply while any day still holds
-- two — see docs/adr/0001-one-counted-game-per-day.md.
--
-- The rule for every day below, agreed with Gustav on 2026-10-05:
--
--   * the FIRST game of the day is the day's game;
--   * its players who never got a turn (dnp: somebody shut the box under the
--     old instant-win rule) take their score and board from the later game;
--   * players who were only in the later game are added at the end of the turn
--     order, the way a late joiner is;
--   * the later game is soft-deleted — kept, auditable, but no longer counted.
--
-- Everything goes through edit_game and delete_game, so the audit trail says
-- who did it and why, and ratings and badges are rebuilt from the merged
-- history. Nothing is posted to Teams.
--
-- One transaction: if anything is not as expected, NOTHING is applied and the
-- database is exactly as it was. Safe to run twice: a day whose later game is
-- already deleted is skipped, and the final SELECT shows the same rows.
--
-- The dashboard shows only the last result, so the script ends with ONE
-- SELECT: the three merged games, one row per player, and `dup_days_left`,
-- which must be 0 on every row.
-- ===========================================================================

begin;

do $merge$
declare
  v_actor uuid := (select id from players where name = 'Gustav');
  d       record;
  v_a     games;
  v_b     games;
  v_rows  jsonb;
  v_left  text;
begin
  if v_actor is null then
    raise exception 'no player called Gustav to record this as — nothing applied';
  end if;

  for d in
    select * from (values
      (date '2026-09-09',
       'c8ceddc1-db40-4fe8-96ee-f107437935dd'::uuid,   -- 12:58, four players
       '6397a3b0-bfa5-4461-8edc-f0c679d59f33'::uuid),  -- 14:39, six players
      (date '2026-10-01',
       '1db7a886-6b15-4de9-96d4-da9874540638'::uuid,   -- Marina shut the box
       'a1114249-e9fd-42f8-b25b-c1b362e92cd7'::uuid),
      (date '2026-10-05',
       '2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f'::uuid,   -- Marina shut the box
       '7083f33c-0ad8-4ff9-9169-ebb2ac8caeaa'::uuid)
    ) t(day, a_id, b_id)
  loop
    select * into v_a from games where id = d.a_id for update;
    select * into v_b from games where id = d.b_id for update;
    if v_a.id is null or v_b.id is null then
      raise exception '%: a game is missing — nothing applied', d.day;
    end if;
    if v_b.deleted_at is not null then
      raise notice '%: already merged, skipping', d.day;
      continue;
    end if;
    if v_a.played_on <> d.day or v_b.played_on <> d.day
       or v_a.status <> 'finished' or v_b.status <> 'finished'
       or v_a.deleted_at is not null
       or v_a.ruleset_id <> v_b.ruleset_id then
      raise exception '%: the games are not in the expected state — nothing applied', d.day;
    end if;

    -- The merged roster, shaped the way game_snapshot() writes it: A's players
    -- in A's turn order, a skipped one taking their turn from B; then anyone
    -- who only played B, in B's order.
    select jsonb_agg(jsonb_build_object(
             'player_id',       m.player_id,
             'status',          m.status,
             'score',           m.score,
             'tiles_open',      to_jsonb(m.tiles_open),
             'predicted_score', m.predicted_score)
           order by m.src, m.ord)
      into v_rows
      from (
        select 1 as src, a.turn_order as ord, a.player_id,
               case when a.status = 'dnp' and b.player_id is not null
                    then 'done' else a.status::text end as status,
               case when a.status = 'dnp' and b.player_id is not null
                    then b.score else a.score end as score,
               case when a.status = 'dnp' and b.player_id is not null
                    then b.tiles_open else a.tiles_open end as tiles_open,
               case when a.status = 'dnp' and b.player_id is not null
                    then b.predicted_score else a.predicted_score end as predicted_score
          from game_players a
          left join game_players b
            on b.game_id = v_b.id and b.player_id = a.player_id and b.status = 'done'
         where a.game_id = v_a.id
        union all
        select 2, b.turn_order, b.player_id, 'done', b.score, b.tiles_open,
               b.predicted_score
          from game_players b
         where b.game_id = v_b.id
           and b.status = 'done'
           and not exists (select 1 from game_players a
                            where a.game_id = v_a.id and a.player_id = b.player_id)
      ) m;

    -- B first, so this also works once 0023 is in: by then a counted B would
    -- stop A from being edited on the same day.
    perform delete_game(v_actor, v_b.id,
      format('one counted game per day: merged into %s', v_a.id));
    perform edit_game(v_actor, v_a.id, d.day, v_rows,
      format('one counted game per day: the turns of players who never got one, '
             'and anyone who only played the later game, taken from %s', v_b.id));

    -- Before 0023, apply_game_results turned a shut box's empty board '{}'
    -- into NULL. Put the board back where the roster said it was empty.
    update game_players gp
       set tiles_open = '{}'
      from jsonb_array_elements(v_rows) r
     where gp.game_id = v_a.id
       and gp.player_id = (r->>'player_id')::uuid
       and r->'tiles_open' = '[]'::jsonb
       and gp.tiles_open is null;

    raise notice '%: merged % into %', d.day, v_b.id, v_a.id;
  end loop;

  -- A v1 orphan — a finished game nobody played, left by v1's non-atomic save —
  -- would take a day as far as the index is concerned. Production had none on
  -- 2026-09-07; if one shares a day with a real game now, it goes too.
  perform delete_game(v_actor, o.id, 'orphan: nobody played; one counted game per day')
     from games o
    where o.status = 'finished' and o.deleted_at is null
      and not exists (select 1 from game_players x
                       where x.game_id = o.id and x.status = 'done')
      and exists (select 1 from games g
                   where g.played_on = o.played_on and g.id <> o.id
                     and g.status = 'finished' and g.deleted_at is null);

  -- The point of all of the above: 0023 can only apply when this is empty.
  select string_agg(played_on::text, ', ' order by played_on) into v_left
    from (select played_on from games
           where status = 'finished' and deleted_at is null
           group by played_on having count(*) > 1) x;
  if v_left is not null then
    raise exception 'still more than one counted game on: % — nothing applied', v_left;
  end if;
end
$merge$;

commit;

-- What it did. Expected (winner marked):
--   2026-09-09  Gustav 34 (won) · Marina 46 · Maja 52 · Jennifer 48 · Per-Erik 55 · Abbe 39
--   2026-10-01  Maja 45 · Marina 0 (won, board []) · Linda 45 · Jennifer 52 · Gustav 35 · Mathias 47
--   2026-10-05  Jennifer 30 · Marina 0 (won, board []) · Abbe 40 · Linda 27 · Maja 34 · Gustav 43
select g.played_on                            as day,
       g.id                                   as game,
       gp.turn_order                          as turn,
       p.name                                 as player,
       gp.status,
       gp.score,
       gp.tiles_open,
       coalesce(gr.is_winner, false)          as winner,
       (select count(*) from (
          select played_on from games
           where status = 'finished' and deleted_at is null
           group by played_on having count(*) > 1) x) as dup_days_left
  from games g
  join game_players gp on gp.game_id = g.id
  join players p on p.id = gp.player_id
  left join game_results gr on gr.game_id = gp.game_id and gr.player_id = gp.player_id
 where g.id in ('c8ceddc1-db40-4fe8-96ee-f107437935dd',
                '1db7a886-6b15-4de9-96d4-da9874540638',
                '2badc66f-1f7f-4dc4-9f4b-071bce4d2b9f')
 order by g.played_on, gp.turn_order;
