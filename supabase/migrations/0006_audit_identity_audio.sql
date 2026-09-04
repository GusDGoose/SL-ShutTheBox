-- Shut the Box — audit trail, PIN rate limiting, and song clip settings.
--
-- Correcting a v1 game meant hand-running SQL in the Supabase dashboard, with
-- no record of who changed what. Editing moves into the app in 0010, so the
-- record of it has to exist first.

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create table audit_log (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  -- Null means the system did it: a cron job, or a migration.
  actor_player_id uuid references players(id),
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  note            text
);

comment on column audit_log.action is
  'game.start|finish|edit|delete|restore|abandon|claim_scorekeeper|photo|undo|manual, player.create|update|toggle, fika.draw|skip, season.plan';

create index audit_log_entity_idx on audit_log (entity, entity_id, id desc);
create index audit_log_at_idx on audit_log (at desc);

-- The whole state of a game in one value, so an edit can record exactly what it
-- changed and undo_game_change() in 0010 can put it back.
create or replace function game_snapshot(p_game_id uuid)
returns jsonb language sql stable as $fn$
  select jsonb_build_object(
    'game', to_jsonb(g) - 'created_at' - 'updated_at',
    'players', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'player_id',       gp.player_id,
                'turn_order',      gp.turn_order,
                'status',          gp.status,
                'score',           gp.score,
                'tiles_open',      gp.tiles_open,
                'predicted_score', gp.predicted_score
              ) order by gp.turn_order)
         from game_players gp
        where gp.game_id = g.id),
      '[]'::jsonb)
  )
  from games g
  where g.id = p_game_id
$fn$;

-- ---------------------------------------------------------------------------
-- PIN attempt throttling
-- ---------------------------------------------------------------------------

-- v1 compared the PIN with a plain !== and had no lockout at all, so the shared
-- office passcode could be brute forced at request speed.
create table pin_attempts (
  ip_hash      text primary key,
  fails        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- Called with no p_success to ask "may this address try?", with false after a
-- wrong PIN, and with true after a correct one (which clears the record).
-- Backoff starts after 5 failures and doubles to a one hour cap.
create or replace function pin_gate(
  p_ip_hash text,
  p_success  boolean default null
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql volatile as $fn$
declare
  v_fails  integer;
  v_locked timestamptz;
begin
  if p_success is true then
    delete from pin_attempts where ip_hash = p_ip_hash;
    return query select true, 0;
    return;
  end if;

  if p_success is false then
    insert into pin_attempts as pa (ip_hash, fails, updated_at)
    values (p_ip_hash, 1, now())
    on conflict (ip_hash) do update
      set fails      = pa.fails + 1,
          updated_at = now()
    returning pa.fails into v_fails;

    if v_fails >= 5 then
      update pin_attempts
         set locked_until = now()
             + least(make_interval(secs => 60 * power(2, v_fails - 5)::double precision),
                     interval '1 hour')
       where ip_hash = p_ip_hash;
    end if;
  end if;

  select pa.fails, pa.locked_until into v_fails, v_locked
    from pin_attempts pa where pa.ip_hash = p_ip_hash;

  if v_locked is null or v_locked <= now() then
    return query select true, 0;
  else
    return query select false,
      ceil(extract(epoch from v_locked - now()))::integer;
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Victory song clips
-- ---------------------------------------------------------------------------

-- v1 played each winner's whole video from the start. A clip has a start and an
-- end so a walk-up can be ten seconds of the good bit, with a fade instead of a
-- hard cut, and an optional loop.
--
-- song_clip_path wins over song_url when set: an uploaded file can be trimmed
-- and faded exactly, which the YouTube player cannot promise on iOS.
alter table players
  add column song_start_seconds integer not null default 0,
  add column song_end_seconds   integer,
  add column song_fade_ms       integer not null default 1500,
  add column song_loop          boolean not null default false,
  add column song_clip_path     text,
  add column updated_at         timestamptz not null default now();

alter table players
  add constraint players_song_start_sane
    check (song_start_seconds between 0 and 36000),
  add constraint players_song_end_after_start
    check (song_end_seconds is null or song_end_seconds > song_start_seconds),
  add constraint players_song_fade_sane
    check (song_fade_ms between 0 and 10000);

create trigger players_touch before update on players
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

alter table audit_log enable row level security;
alter table pin_attempts enable row level security;

grant select, insert on audit_log to service_role;
grant select, insert, update, delete on pin_attempts to service_role;

revoke execute on function game_snapshot(uuid) from public, anon, authenticated;
revoke execute on function pin_gate(text, boolean) from public, anon, authenticated;
grant execute on function game_snapshot(uuid) to service_role;
grant execute on function pin_gate(text, boolean) to service_role;
