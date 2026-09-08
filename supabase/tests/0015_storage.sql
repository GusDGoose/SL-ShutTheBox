-- pgTAP: the two storage buckets (migration 0015).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- game-photos: one photo per game, resized in the browser to about a megabyte
-- before upload, so the bucket limit is a backstop rather than the budget.
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from storage.buckets where id = 'game-photos'),
  'the game-photos bucket exists'
);
select is(
  (select public from storage.buckets where id = 'game-photos'),
  false,
  'and is private — photos are read through signed URLs, never a public link'
);
select is(
  (select file_size_limit from storage.buckets where id = 'game-photos'),
  1572864::bigint,
  'capped at 1.5 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'game-photos'),
  array['image/jpeg', 'image/webp', 'image/png'],
  'and only takes images'
);

-- ---------------------------------------------------------------------------
-- song-clips: a player's own MP3, when they would rather not rely on YouTube.
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from storage.buckets where id = 'song-clips'),
  'the song-clips bucket exists'
);
select is(
  (select public from storage.buckets where id = 'song-clips'),
  false,
  'and is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'song-clips'),
  4194304::bigint,
  'capped at 4 MiB — thirty seconds of audio, not an album'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'song-clips'),
  array['audio/mpeg', 'audio/mp4', 'audio/ogg'],
  'and only takes audio'
);

-- ---------------------------------------------------------------------------
-- Access. The service role bypasses RLS, so the server can do everything; the
-- browser key gets nothing, because storage.objects has RLS and we add no
-- policies for these buckets. Everything reaches a phone as a signed URL.
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class
    where oid = 'storage.objects'::regclass),
  'storage.objects has row level security on'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual ilike '%game-photos%' or qual ilike '%song-clips%'
           or with_check ilike '%game-photos%' or with_check ilike '%song-clips%')),
  0,
  'and no policy opens either bucket to the anon or authenticated roles'
);

-- ---------------------------------------------------------------------------
-- set_game_photo — recording that a photo was pinned to a game
--
-- The upload itself is Storage; this is the row that says which object is the
-- photo of the day, who pinned it and when, with the change in the audit trail.
-- ---------------------------------------------------------------------------
insert into players (id, name, emoji)
values ('dd110000-0000-4000-8000-000000000001', 'Photo Pat', '📷');

insert into games (id, played_on, ruleset_id, season_id, status, finished_at)
values
  ('dd220000-0000-4000-8000-000000000001', '2018-03-03',
   default_ruleset_id(), ensure_season('2018-03-03'), 'finished', now()),
  ('dd220000-0000-4000-8000-000000000002', '2018-03-04',
   default_ruleset_id(), ensure_season('2018-03-04'), 'finished', now());
update games set deleted_at = now()
 where id = 'dd220000-0000-4000-8000-000000000002';
insert into game_players (game_id, player_id, score, tiles_open, turn_order, status)
values ('dd220000-0000-4000-8000-000000000001',
        'dd110000-0000-4000-8000-000000000001', 5, '{5}', 1, 'done');

select lives_ok(
  $$select set_game_photo('dd110000-0000-4000-8000-000000000001',
      'dd220000-0000-4000-8000-000000000001',
      '2018/03/dd220000-0000-4000-8000-000000000001.jpg')$$,
  'a photo can be pinned to a game'
);
select is(
  (select photo_path from games where id = 'dd220000-0000-4000-8000-000000000001'),
  '2018/03/dd220000-0000-4000-8000-000000000001.jpg',
  'the object path is stored on the game'
);
select is(
  (select photo_by from games where id = 'dd220000-0000-4000-8000-000000000001'),
  'dd110000-0000-4000-8000-000000000001'::uuid,
  'along with who pinned it'
);
select ok(
  (select photo_at is not null from games
    where id = 'dd220000-0000-4000-8000-000000000001'),
  'and when'
);
select ok(
  exists (select 1 from audit_log
           where action = 'game.photo'
             and entity_id = 'dd220000-0000-4000-8000-000000000001'
             and after->>'photo_path' = '2018/03/dd220000-0000-4000-8000-000000000001.jpg'),
  'and it is in the audit trail'
);

select lives_ok(
  $$select set_game_photo('dd110000-0000-4000-8000-000000000001',
      'dd220000-0000-4000-8000-000000000001', null)$$,
  'a photo can be taken down again'
);
select ok(
  (select photo_path is null and photo_by is null and photo_at is null
     from games where id = 'dd220000-0000-4000-8000-000000000001'),
  'which clears all three columns together'
);

select throws_ok(
  $$select set_game_photo('dd110000-0000-4000-8000-000000000001',
      'dd220000-0000-4000-8000-000000000002', '2018/03/x.jpg')$$,
  'STB03', null,
  'but a deleted game does not take a photo'
);
select throws_ok(
  $$select set_game_photo('dd110000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000000', '2018/03/x.jpg')$$,
  'STB03', null,
  'and neither does a game that does not exist'
);

select * from finish();
rollback;
