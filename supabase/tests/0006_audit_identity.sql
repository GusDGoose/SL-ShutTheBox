-- pgTAP: audit snapshots and PIN throttling (migration 0006).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------------------------------------------------------------------------
-- pin_gate — backoff after repeated wrong PINs
--
-- v1 compared the PIN with `!==` and had no lockout at all, so a shared
-- four-digit passcode could be walked through at request speed.
--
-- Every assertion below runs inside one transaction, so now() is frozen and the
-- retry windows are exact rather than approximate.
-- ---------------------------------------------------------------------------

select ok(
  (select allowed from pin_gate('fixture-ip-a')),
  'an address nobody has failed from may try'
);

select is(
  (select retry_after_seconds from pin_gate('fixture-ip-a')),
  0,
  'and has nothing to wait for'
);

-- Four wrong tries is a fat thumb, not an attack.
do $fails$
begin
  for i in 1..4 loop
    perform pin_gate('fixture-ip-b', false);
  end loop;
end
$fails$;

select ok(
  (select allowed from pin_gate('fixture-ip-b')),
  'four wrong tries does not lock anyone out'
);
select is(
  (select fails from pin_attempts where ip_hash = 'fixture-ip-b'),
  4,
  'but they are counted'
);

select ok(
  not (select allowed from pin_gate('fixture-ip-b', false)),
  'the fifth wrong try locks the box'
);
select is(
  (select retry_after_seconds from pin_gate('fixture-ip-b')),
  60,
  'for a minute to start with'
);

select is(
  (select retry_after_seconds from pin_gate('fixture-ip-b', false)),
  120,
  'and the wait doubles on the next try'
);
select is(
  (select retry_after_seconds from pin_gate('fixture-ip-b', false)),
  240,
  'and again'
);

-- Doubling without a cap would reach days; an hour is enough to make guessing
-- pointless without locking the office out until tomorrow.
do $more$
begin
  for i in 1..8 loop
    perform pin_gate('fixture-ip-b', false);
  end loop;
end
$more$;

select is(
  (select retry_after_seconds from pin_gate('fixture-ip-b')),
  3600,
  'the wait is capped at an hour'
);

-- Getting it right is the way out, and leaves no record behind.
select ok(
  (select allowed from pin_gate('fixture-ip-b', true)),
  'the correct PIN is always allowed through'
);
select ok(
  not exists (select 1 from pin_attempts where ip_hash = 'fixture-ip-b'),
  'and clears the failure record'
);
select ok(
  (select allowed from pin_gate('fixture-ip-b')),
  'so the next attempt starts clean'
);

-- One address being locked must not affect anyone else in the office.
select ok(
  (select allowed from pin_gate('fixture-ip-c')),
  'a lockout is per address, not global'
);

-- ---------------------------------------------------------------------------
-- game_snapshot — what an edit records
-- ---------------------------------------------------------------------------

insert into players (id, name, emoji)
values ('eeee0000-0000-0000-0000-000000000001', 'Snapshot Sam', '🦉');

insert into games (id, played_on, ruleset_id, season_id, status, finished_at)
values ('ffff0000-0000-0000-0000-000000000001', '2026-09-04',
        default_ruleset_id(), ensure_season('2026-09-04'), 'finished', now());

insert into game_players (game_id, player_id, score, tiles_open, turn_order, status)
values ('ffff0000-0000-0000-0000-000000000001',
        'eeee0000-0000-0000-0000-000000000001', 8, '{3,5}', 1, 'done');

select is(
  game_snapshot('ffff0000-0000-0000-0000-000000000001')->'game'->>'played_on',
  '2026-09-04',
  'a snapshot carries the game'
);
select is(
  jsonb_array_length(
    game_snapshot('ffff0000-0000-0000-0000-000000000001')->'players'),
  1,
  'and everyone in it'
);
select is(
  game_snapshot('ffff0000-0000-0000-0000-000000000001')
    ->'players'->0->>'tiles_open',
  '[3, 5]',
  'including the board each score came from, so an edit can be undone'
);

select * from finish();
rollback;
