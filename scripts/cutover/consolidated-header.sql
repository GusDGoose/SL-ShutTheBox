-- ===========================================================================
-- Shut the Box — Cutover A, as one transaction.
--
-- For the Supabase dashboard SQL editor (https://supabase.com/dashboard →
-- SQL Editor), which is the only route in from a network where the Postgres
-- ports are firewalled. GENERATED from supabase/migrations/ — do not
-- hand-edit; regenerate with scripts/cutover/build-consolidated.sh.
--
-- Contains migrations 0004 through 0014 plus the migration-history rows the
-- CLI would have written, so a later `supabase db push` from an unblocked
-- network sees these as already applied instead of trying to re-run them.
--
-- 0003 is RECORDED but NOT RUN, on purpose: it adds `check (max_tile = 12)`,
-- and v1's column default was 9, so any game saved without an explicit tile
-- count violates it. 0004 drops the column outright, so the end state is
-- identical either way.
--
-- It is one transaction: if anything fails, NOTHING is applied and the
-- database is exactly as it was. Re-running after a success will fail (the
-- objects already exist), which is also safe and means nothing happened.
-- ===========================================================================

begin;

-- The table the CLI keeps its migration history in. Created here because this
-- project's 0001/0002 were applied by pasting SQL, so it may not exist yet.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text not null primary key,
  statements text[],
  name       text
);
