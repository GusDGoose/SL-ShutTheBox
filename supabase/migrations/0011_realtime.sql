-- Shut the Box — live spectating.
--
-- Everyone at the table watches the tiles flip on their own phone. That needs a
-- key in the browser, which until now there has never been: the service-role
-- key is server-only and nothing else could reach the database at all.
--
-- The key browsers get is the PUBLISHABLE one, which acts as the `anon` role.
-- It is designed to be public, and the security model is that anon can reach
-- nothing except the broadcasts it is explicitly allowed to hear.

-- ---------------------------------------------------------------------------
-- Close the door before handing out the key
--
-- [concept: RLS is the only lock] Supabase's platform bootstrap runs
-- ALTER DEFAULT PRIVILEGES granting anon SELECT/INSERT/UPDATE/DELETE on every
-- new table in public, so table GRANTs protect nothing here — enabling RLS with
-- no policies is what denies access. 0004 created rulesets and seasons without
-- it, which did not matter while no key existed in any browser. It matters as
-- of this migration: anon could otherwise rewrite the active ruleset mid-season
-- or delete a season out from under its games.
-- ---------------------------------------------------------------------------

alter table rulesets enable row level security;
alter table seasons  enable row level security;

-- ---------------------------------------------------------------------------
-- Broadcasting the board
-- ---------------------------------------------------------------------------

-- Sends the whole snapshot rather than a diff, so a spectator that joins late
-- or misses a message is never left assembling a board from fragments.
--
-- security definer because realtime.send() writes to realtime.messages, which
-- the app's roles have no business touching directly.
create or replace function broadcast_live_game(p_game_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  perform realtime.send(
    public.live_game_snapshot(p_game_id),
    'state',
    'game:' || p_game_id::text,
    true   -- private channel: subscribing needs the policy below
  );
end
$fn$;

-- [concept: heartbeat row] Every live RPC touches live_turns exactly once — a
-- tap bumps its version, ending a turn moves it on, finishing deletes it — so
-- one broadcast goes out per action, no more and no less. Deleting the row is
-- the last thing a spectator hears, and by then the game row already says
-- finished or abandoned, so the payload carries the final state.
create or replace function live_turns_broadcast()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  perform public.broadcast_live_game(coalesce(new.game_id, old.game_id));
  return null;   -- after trigger; the return value is ignored
end
$fn$;

create trigger live_turns_broadcast
  after insert or update or delete on live_turns
  for each row execute function live_turns_broadcast();

-- ---------------------------------------------------------------------------
-- What anon is allowed to hear
-- ---------------------------------------------------------------------------

-- [concept: Realtime authorization] A private channel checks this policy before
-- letting a subscriber in. SELECT only, and only on game topics: anon may
-- RECEIVE board updates and can neither send its own broadcast (no INSERT
-- policy) nor read a single row of any table (deny-all RLS above).
--
-- Anyone who can guess a game's uuid can watch that game. The PIN gate still
-- guards the app itself; a leaked board is a list of tile numbers.
create policy "anon may listen to live game topics"
  on realtime.messages
  for select
  to anon
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'game:%'
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function broadcast_live_game(uuid)
  from public, anon, authenticated;
revoke execute on function live_turns_broadcast()
  from public, anon, authenticated;
grant execute on function broadcast_live_game(uuid) to service_role;
