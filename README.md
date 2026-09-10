# 🎲 Shut the Box

Daily office Shut the Box tracker. One person keeps score on a tappable replica
of the board while everyone else watches it live on their own phone; the day's
winner is crowned with confetti and their victory song. Lowest score wins the
day, ties share it, and 0 — 📦 shut the box — ends the game on the spot.

**Stack:** Next.js 16 (App Router) on Vercel · Supabase Postgres · Tailwind v4.

Every derived number — winners, averages, streaks, ratings, badges, standings —
is computed by SQL views and functions in `supabase/migrations/`, so any figure
on any page can be audited with plain SQL. Nothing is aggregated twice in
TypeScript. `0007_views.sql` is where the stats live.

## How it works

- **PIN, then a name.** `src/proxy.ts` sends every route to `/pin` until the
  shared team PIN has been entered once per device, then to `/whoami` to pick
  which player this device is. Both are HMAC-signed cookies
  (`SESSION_SECRET`), and the identity is what signs edits and picks fika
  duties — there are no passwords and no accounts.
- **The game lives in the database, not in a phone.** Every tap is a server
  action calling one plpgsql RPC (`supabase/migrations/0010_rpc_game_flow.sql`),
  so a refresh resumes the game and a second phone can watch it. One
  scorekeeper drives; everyone else spectates over Supabase Realtime, with
  5-second polling as the fallback.
- **SQL owns the rules.** Scoring, whose turn it is, who won, what a valid game
  is — all decided in the database, which raises `STB0x` error codes the app
  turns into copy. A second client cannot get past a rule by not knowing it.
- **Winner is derived, never stored** — `game_results.is_winner` is a window
  function over each game, so a tie is a shared win by construction and
  correcting a score re-crowns automatically.
- **Rulesets and seasons are first-class.** A season (quarterly) runs a
  ruleset; a game snapshots the one it was played under. Tile count, scoring,
  win direction and tie policy are all ruleset parameters, so a variant season
  needs no code.
- **Nothing is permanent.** Scores can be corrected, games backdated,
  soft-deleted, restored and undone from the app, and every change goes into
  `audit_log` with who made it. Ratings and badges re-settle on every edit.
- **"Today"** is always Europe/Stockholm: `stockholm_today()` in the database,
  `src/lib/dates.ts` in the app. Never compute it any other way.

## The pages

| | |
|---|---|
| `/` | today's game — live card, results, the way into the history |
| `/play` → `/game/[id]` | setup, then the board: taps, turns, review, crowning |
| `/record` | a game played without the app, entered after the fact |
| `/stats`, `/stats/all-time`, `/stats/season/[id]` | standings, ratings, distribution, form, head-to-head, hall of fame |
| `/history/[month]` | every game of a month, day by day, with the photo scrapbook |
| `/players`, `/players/[id]` | the roster and each player's profile, badges and song clip |
| `/rules` | the house rules, rendered from the season's ruleset |
| `/fika` | who buys this week, why it is them, and everyone before |
| `/more` | the rest of the app, plus board theme, sound and who this device is |

Four tabs cover the everyday routes — Today, Play, Stats, Players — and
**More** collects the rest. Every page inside the shell lights exactly one
tab; `e2e/navigation.spec.ts` fails if one ever lights none, which is the
state the app drifted into once already. `/settings` permanently redirects to
`/more`. The board and the gates render in the `(focus)` group, which has no
tab rail at all, so nothing competes with the game.

## Local development

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
npm run db:start     # local Postgres + API in Docker; applies migrations + seed
npm run dev
```

`npm run db:start` prints the local `API URL` and `service_role` key — put
them in `.env.local` (copy `.env.example`) together with a `TEAM_PIN`.
Useful: Supabase Studio runs at http://127.0.0.1:54323, and `npm run db:reset`
rebuilds the DB from migrations + seed.

**Regenerate `src/lib/database.types.ts` after every migration** with
`npm run db:types`, and commit it — `supabaseAdmin()` is parameterised by it,
so a renamed column becomes a compile error instead of an undefined at
runtime. It is generated from the LOCAL database, so reset first if your
local schema has drifted.

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
   - `SESSION_SECRET` — a long random string; signs the PIN and identity
     cookies. Without it the app fails closed and nobody gets past `/pin`.
   - `CRON_SECRET` — a long random string; the bearer token the two cron
     routes require.
   - `TEAMS_WEBHOOK_URL` — optional, see below
   Env var changes require a redeploy to take effect.
3. **Teams announcement** (optional): in the Teams channel → ⋯ → Workflows →
   "Post to a channel when a webhook request is received" → copy the
   `…logic.azure.com…` URL. Then run `bash scripts/cutover/set-teams-webhook.sh`,
   which posts a test card first and refuses to save a URL that did not work.
   **Production only** — preview deployments share the same Supabase project, so
   giving them the webhook would let a test deploy post real cards into the
   channel. The app posts an Adaptive Card with winner, score and streak after
   every crowned game; if the webhook fails or is unset, games still save fine.

   Two things about the flow itself in a closed tenant: it runs as **whoever
   created it**, so add a co-owner in Power Automate or it dies with that
   person's account, and the URL is a bearer credential — anyone holding it can
   post to the channel, so treat it like a password and rotate it by recreating
   the flow.

## Deploying a schema change

The v1 → v2 cutover happened on 2026-09-08 (migrations `0003`–`0014`) and D8 on
2026-09-09 (`0015`–`0017`). This section is the runbook that came out of it, and
applies to any migration from here on.

**The app and the schema move together.** A deployment one migration behind can
write rows the new views cannot see, or call a function that no longer exists —
the 2026-09-08 game was lost that way, to a `season_id` that the deployed v1
code did not know to set. Push the migration and deploy in the same sitting,
after a game day is over.

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
3. `npm run db:test` — pgTAP tests for whatever the migration adds or changes.
4. **Call every new or changed RPC through PostgREST**, not only from pgTAP —
   see the `safeupdate` warning above. This is the step that catches what tests
   cannot.
5. `npm run db:push`, then `npm run db:diff` (see the note above on what a
   clean diff looks like), and deploy the app in the same sitting.
6. Update `src/lib/types.ts` by hand if the change touches a row shape the app
   reads — until the generated client is adopted, nothing checks that for you.

## Gotchas worth knowing

- Postgres views must keep `with (security_invoker = true)` or they bypass RLS.
- New tables/views need explicit `grant … to service_role` — newer Supabase
  gives API roles no privileges by default (see 0001_tables.sql).
- Supabase free tier pauses after ~1 week idle; restore from the dashboard
  (data is kept). Daily play prevents it.
- The victory song only autoplays because the player is created inside the
  "Crown the winner" tap (browser autoplay policy). Some videos disallow
  embedding — the "Open on YouTube" fallback link always shows. An uploaded
  clip plays through Web Audio on the context the first tap unlocked; a second
  AudioContext created from an effect is what Safari refuses to start.
- A tie plays **every** winner's anthem at the same time. That began as a bug
  in v1 and the office decided it was the best part of the game, so it is
  deliberate now. Do not turn it into a queue.
- `game_players.status = 'dnp'` means "was at the table and never got a turn
  because the box was shut". It is not "did not show up" — a player who was
  picked and then leaves is removed from the game entirely.
- Generated types mark **every view column nullable** — Postgres cannot prove
  a computed column is NOT NULL. The hand-written row types in
  `src/lib/queries/*` are the ones telling the truth; `unwrapRows` in
  `src/lib/db-rows.ts` is the single documented place that asserts it. Same
  for `default null` RPC parameters, which the generator types as required:
  use the `rpc()` wrapper rather than casting at the call site.
- Nothing may scroll horizontally at the document level. Wide things (stats
  tables, the scrapbook) carry their own `overflow-x-auto`; `<html>` has
  `overflow-x: clip` as a backstop, and `clip` matters — `hidden` would make
  the viewport a scroll container and break every sticky column. The original
  cause was a flex child in the header refusing to shrink below a long player
  name, which panned the whole page on every route.
- The manifest and icons are fetched by the browser **without cookies**, so
  they must stay exempt in `src/proxy.ts`. Gated, they redirect to `/pin`, the
  manifest fails to parse, and the app silently stops being installable.

## The fika rota and the cron jobs

One person buys fika each week. The rule is *worst last week*, but a cycle
sits on top of it: nobody buys twice until everybody has bought once, so being
worst decides the order within a cycle, not how often your turn comes round.
"Worst" is the average normalised finish — `(finish_position - 1) /
(participants - 1)` — so a last place out of six is not beaten by a last place
out of three. A week nobody eligible played falls back to random and the card
says so. Skipping keeps your place in the cycle but takes you out of that
week.

Two Vercel cron jobs drive it, both requiring `Authorization: Bearer
$CRON_SECRET`:

| | when | what |
|---|---|---|
| `/api/cron/morning` | 05:00 UTC, Mon–Fri | abandons games left running; **Mondays** also draws the rota and posts last week's digest |
| `/api/cron/afternoon` | 12:00 UTC, Mon–Fri | if nobody has played yet, nudges the channel |

Both take `?on=YYYY-MM-DD` to run as if it were that date — the recovery path
for a Monday the cron missed, and the only way to exercise the Monday branch
on a Thursday. One `cron_runs` row per (job, day) is the lock, so a re-run of
a day that already ran is a no-op. Hobby fires anywhere inside the scheduled
hour and gives no exactly-once guarantee, which is why the guard exists at
all. Writing to the database daily also keeps the free Supabase project from
pausing after seven idle days.

## Still to come

- **A typed 0 should end the game** the way an empty board does; today only the
  board triggers the instant win, though `game_results` counts both as a shut
  box.
- **`cacheComponents`** — the readers in `src/lib/queries/*` are shaped for
  `'use cache'` and tags, but every route is still fully dynamic.
- Deliberately not building: an in-app dice roller, or predict-the-winner.
