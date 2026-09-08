-- Shut the Box — the two storage buckets.
--
-- game-photos: one photo of the day per game, taken on a phone and resized in
-- the browser to about a megabyte before it is uploaded (the bucket limit is a
-- backstop, not the budget). song-clips: a player's own MP3 for the crowning,
-- for anyone who would rather not depend on a YouTube embed.
--
-- Both are PRIVATE. Nothing in Storage is ever read through a public URL: the
-- server hands a phone a short-lived signed URL (/api/photo, /api/clip), and
-- the browser key can neither list nor fetch objects — storage.objects has row
-- level security and this migration deliberately adds NO policies for these
-- buckets. The service role bypasses RLS, which is all the server needs.
--
-- [concept: idempotent seed] `on conflict do update` so re-running converges on
-- these settings instead of failing, the same way ruleset seeds behave.
-- Mirrored in supabase/config.toml so `db reset` creates them locally too.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('game-photos', 'game-photos', false, 1572864,
   array['image/jpeg', 'image/webp', 'image/png']),          -- 1.5 MiB
  ('song-clips',  'song-clips',  false, 4194304,
   array['audio/mpeg', 'audio/mp4', 'audio/ogg'])            -- 4 MiB
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Which object is the photo of the day
--
-- The upload itself goes straight to Storage from the server. This records
-- the result on the game — path, who, when — and puts the change in the audit
-- trail like every other change to a game. A null path takes the photo down.
-- ---------------------------------------------------------------------------
create or replace function set_game_photo(
  p_actor   uuid,
  p_game_id uuid,
  p_path    text
) returns void language plpgsql volatile as $fn$
declare
  v_found   boolean;
  v_deleted timestamptz;
  v_before  jsonb;
  v_after   jsonb;
begin
  select true, deleted_at into v_found, v_deleted
    from games where id = p_game_id for update;
  if v_found is null then
    raise exception 'no such game' using errcode = 'STB03';
  end if;
  -- A deleted game is being examined, not decorated.
  if v_deleted is not null then
    raise exception 'that game is deleted' using errcode = 'STB03';
  end if;

  select jsonb_build_object('photo_path', photo_path, 'photo_by', photo_by,
                            'photo_at', photo_at)
    into v_before from games where id = p_game_id;

  update games
     set photo_path = p_path,
         photo_by   = case when p_path is null then null else p_actor end,
         photo_at   = case when p_path is null then null else now() end
   where id = p_game_id;

  select jsonb_build_object('photo_path', photo_path, 'photo_by', photo_by,
                            'photo_at', photo_at)
    into v_after from games where id = p_game_id;

  insert into audit_log (actor_player_id, action, entity, entity_id,
                         before, after, note)
  values (p_actor, 'game.photo', 'game', p_game_id, v_before, v_after,
          case when p_path is null then 'photo removed' else 'photo added' end);
end
$fn$;

revoke execute on function set_game_photo(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function set_game_photo(uuid, uuid, text) to service_role;
