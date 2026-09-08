

-- ===========================================================================
-- Migration history
--
-- 0001/0002 were applied by hand when the project was set up; 0003 is recorded
-- without being run (see the header). Everything from 0004 was just applied
-- above.
-- ===========================================================================
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0001', 'tables'),
  ('0002', 'views'),
  ('0003', 'lock_12_tile'),
  ('0004', 'rulesets_seasons'),
  ('0005', 'game_lifecycle'),
  ('0006', 'audit_identity_audio'),
  ('0007', 'views'),
  ('0008', 'ratings'),
  ('0009', 'achievements'),
  ('0010', 'rpc_game_flow'),
  ('0011', 'realtime'),
  ('0012', 'finish_game_settles'),
  ('0013', 'game_management'),
  ('0014', 'plan_season')
on conflict (version) do nothing;

commit;
