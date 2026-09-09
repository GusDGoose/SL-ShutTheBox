# 🎲 Shut the Box

Daily office Shut the Box tracker: record each day's game on a tappable replica
of the board (or type scores), crown the winner with confetti and their victory
song, and keep the stats forever. Lowest score wins the day; ties share it;
score 0 = 📦 shut the box = instant win.

**Stack:** Next.js (App Router) on Vercel · Supabase Postgres · Tailwind.
All stats (winners, averages, streaks, monthly champions) are computed by SQL
views in [supabase/migrations/0002_views.sql](supabase/migrations/0002_views.sql) —
you can audit every number on the stats page with plain SQL.

## How it works

- **PIN gate** — `src/proxy.ts` redirects every route to `/pin` until the shared
  team PIN has been entered once per device (SHA-256 cookie, 1 year).
- **No Supabase keys in the browser** — all data access happens in Server
  Actions / server components via the service-role key (`src/lib/supabase.ts`
  is `server-only`). RLS is deny-all; only `service_role` has grants.
- **Game flow** — the in-progress game is pure client state
  (`src/components/game-screen.tsx`); one server action (`saveGame`) writes it
  all at once. Refreshing mid-game loses the in-progress turn — by design, v1.
- **Winner is derived, never stored** — `game_results.is_winner` is a window
  function over each game, so ties become shared wins automatically.
- **Streaks** — consecutive *played* days won (weekends don't break them),
  computed with gaps-and-islands SQL in `player_streaks`.
- **"Today"** is always Europe/Stockholm: DB default on `games.played_on` for
  writes, `src/lib/dates.ts` for reads. Never compute it any other way.

## Local development

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
npm run db:start     # local Postgres + API in Docker; applies migrations + seed
npm run dev
```

`npm run db:start` prints the local `API URL` and `service_role` key — put
them in `.env.local` (copy `.env.example`) together with a `TEAM_PIN`.
Useful: Supabase Studio runs at http://127.0.0.1:54323, `npm run db:reset`
rebuilds the DB from migrations + seed, and `npm run db:types` regenerates
`src/lib/database.types.ts` from the local schema.

Checks: `npm run lint`, `npm run typecheck`, `npm test` (vitest — pure modules
in node, components in jsdom), `npm run db:test` (pgTAP tests for the SQL views
and functions; needs the local stack running), `npm run e2e` (Playwright).

## Production setup (one-time)

1. **Supabase**: create a project (EU region), then apply this repo's migrations
   with the CLI — never by pasting SQL into the dashboard, or the remote
   silently drifts from `supabase/migrations/`:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npm run db:push   # applies every migration not yet on the remote
   npm run db:diff   # prints nothing when local and remote agree
   ```
   If the project predates this workflow and already has `0001`–`0003` applied
   by hand, record that before the first push so they aren't re-run:
   `npx supabase migration repair --status applied 0001 0002 0003`.
   Optionally run `seed.sql` for sample players.
2. **Vercel**: import the GitHub repo (defaults are fine) and set Environment
   Variables (Production + Preview):
   - `SUPABASE_URL` — Project Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API keys → service_role
     (**secret** — never expose, never prefix with `NEXT_PUBLIC_`)
   - `TEAM_PIN` — the office passcode
   - `APP_URL` — the deployed URL (for the Teams card button), optional
   - `TEAMS_WEBHOOK_URL` — optional, see below
   Env var changes require a redeploy to take effect.
3. **Teams announcement** (optional): in the Teams channel → ⋯ → Workflows →
   "Post to a channel when a webhook request is received" → copy the
   `…logic.azure.com…` URL into `TEAMS_WEBHOOK_URL`. The app posts an Adaptive
   Card with winner, score, and streak after every saved game. If the webhook
   fails or is unset, games still save fine.

## Cutting over to v2

Migrations `0003`–`0014` turn the v1 schema into the v2 one. They rewrite every
stats view, so the app and the schema have to move together: a v1 deployment
against the v2 schema writes `games` rows that land as `in_progress` and are
invisible to every view. Budget one sitting, after a game day is over.

**Rehearse it first.** Every pgTAP test runs on a database built from scratch,
so the backfills in `0004`–`0014` are only ever exercised against zero rows.
`scripts/cutover/` runs them against a v1-shaped dataset instead — including an
orphan `games` row and a legacy 9-tile game, the two things production can
actually contain:

```bash
npx supabase db reset --version 0002 --no-seed
docker exec -i supabase_db_shut-the-box psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < scripts/cutover/v1_fixture.sql
docker exec -i supabase_db_shut-the-box psql -U postgres -d postgres -At < scripts/cutover/snapshot.sql > before.txt
npx supabase migration repair --status applied 0003 --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
npx supabase migration up --local
docker exec -i supabase_db_shut-the-box psql -U postgres -d postgres -At < scripts/cutover/snapshot.sql > after.txt
diff before.txt after.txt
```

The only line that may differ is a **longer** streak: v1 numbered its streak
days from the `games` table, so an orphan row put a day nobody won into the
index and cut everybody's run short. `games_valid` counts days that were
actually played. Anything else in that diff is a regression — stop and read it.

### The office network blocks Postgres

`supabase db push` connects on 5432/6543, and both are firewalled here — as is
the direct database host. Only 443 gets out, which is why `supabase login`,
`link` and `projects list` all work while anything touching the database times
out. Check before you plan an evening around it:

```bash
pwsh -c "Test-NetConnection aws-1-eu-west-1.pooler.supabase.com -Port 5432 -InformationLevel Quiet"
```

`False` means you have two choices:

- **Tether to a phone** and follow the CLI steps below. Preferred: `db push` is
  the source of truth, and it is the only route that can also take a backup.
- **Use the dashboard SQL editor** (HTTPS, so it works from the office) with
  `scripts/cutover/cutover_consolidated.sql` — the pending migrations plus the
  migration-history rows, in one transaction. Generate it for exactly the
  versions production lacks, e.g. `bash scripts/cutover/build-consolidated.sh 0015 0016`
  (check with `supabase migration list --linked` from a hotspot, or the
  `supabase_migrations.schema_migrations` table in the editor). It applies
  all-or-nothing, and re-running it after a success fails on the first
  statement without changing anything. This route cannot take a backup, so
  export anything you would not want to lose first.

**Every RPC must be tested through PostgREST, not only in pgTAP.** The API
connection loads Supabase's `safeupdate`, which refuses any `DELETE` or `UPDATE`
without a `WHERE` clause (`21000`). pgTAP runs as `postgres` and cannot load
that library, so a function can pass every test and still fail from the app —
0008 and 0009 did, and crowning was broken from the app until 0016. The check
is one curl per write path against the local stack:

```bash
curl -sS -X POST http://127.0.0.1:54321/rest/v1/rpc/finish_game -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" -d '{"p_actor":"…","p_game_id":"…"}'
```

`supabase/tests/0016_safeupdate.sql` scans every function body for bare
deletes and updates so that particular mistake cannot come back.

**Then production:**

1. **Back up.** `npx supabase db dump --linked -f backup.sql` (schema and data).
   This is the rollback, so check it is non-empty before continuing. On the free
   tier there are no automatic backups, so this is the only one you get — and it
   needs a network where Postgres is reachable (see above).
2. **Link and repair.**
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase migration repair --status applied 0001 0002 0003
   ```
   `0001`/`0002` were applied by hand and `0003` must be *recorded* rather than
   run: it adds `check (max_tile = 12)`, and v1's column default was **9**, so
   any game saved without an explicit tile count violates it. `0004` drops the
   column outright, so the end state is identical either way. Recording it is
   the safe path; if you would rather know, this says whether prod has any:
   ```sql
   select count(*) from games where max_tile <> 12;
   ```
   Forgetting the repair is not dangerous — the CLI runs each migration in a
   transaction, so `db push` fails with nothing applied and you can repair and
   re-run.
3. **Push.** `npm run db:push`, then `npm run db:diff`.

   The diff does **not** come back empty, and that is expected: Supabase adds
   its own `public.rls_auto_enable()` function and an `ensure_rls` event
   trigger that turns RLS on for any new table in `public`. It is a platform
   safety net, not drift from these migrations — and a useful one, since it is
   the same hole 0011 closes by hand. Anything else in that diff is real drift.
4. **Set the new env vars in Vercel *before* deploying** (Production and
   Preview): `SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Generate the two secrets with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   The app fails closed without `SESSION_SECRET`: nobody gets past `/pin`.
5. **Deploy.**
6. **Everyone re-enters the PIN once** and picks who they are — the cookie
   format changed, and identity is new.
7. **Smoke it**: `/api/health` all green, `/` shows the history, `/stats`
   matches the numbers you screenshotted beforehand (bar the streak correction
   above), and the first real game posts a Teams card.

Rollback: redeploy the previous Vercel deployment and restore `backup.sql` into
a fresh project.

## Changing the schema

1. Write a new numbered file in `supabase/migrations/` (never edit an applied one).
2. `npm run db:reset` — rebuilds locally from scratch, proving the migration works
   on an empty database and that the seed still loads.
3. `npm run db:types` — regenerate `src/lib/database.types.ts`, commit the diff.
4. `npm run db:test` — pgTAP tests for whatever the migration adds or changes.
5. `npm run db:push`, then `npm run db:diff` (must print nothing), and deploy the
   app in the same sitting — an old deployment against a new schema writes rows
   the new code can't see.

## Gotchas worth knowing

- Postgres views must keep `with (security_invoker = true)` or they bypass RLS.
- New tables/views need explicit `grant … to service_role` — newer Supabase
  gives API roles no privileges by default (see 0001_tables.sql).
- Supabase free tier pauses after ~1 week idle; restore from the dashboard
  (data is kept). Daily play prevents it.
- The victory song only autoplays because the embed mounts inside the
  "Crown the winner" tap (browser autoplay policy). Some videos disallow
  embedding — the "Open on YouTube" fallback link always shows.

## v2 backlog (brainstormed, deliberately cut from v1)

- In-app dice roller (client-only component on the game screen)
- Live spectator mode via Supabase Realtime (needs per-tap writes)
- Walk-up music: 10-second intro clip when a player's turn starts
- "Biggest choke" & nemesis head-to-head stats (pure SQL, no schema change)
- Season resets + Elo-style rating
- PWA manifest so the app installs to home screens
- Edit/undo saved games (decide on an audit trail first)
- Atomic `save_game()` plpgsql RPC instead of insert + compensating delete
- Photo of the day (Supabase Storage) — history page becomes a scrapbook
- Generated DB types via `supabase gen types typescript`
