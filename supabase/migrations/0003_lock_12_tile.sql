-- Shut the Box — drop the 9-tile ruleset.
-- The team never plays 9-tile games; lock the column to 12 going forward.
-- Safe to tighten (not NOT VALID): there are no 9-tile rows in production.

alter table games
  alter column max_tile set default 12;

alter table games
  drop constraint games_max_tile_check;

alter table games
  add constraint games_max_tile_check check (max_tile = 12);
