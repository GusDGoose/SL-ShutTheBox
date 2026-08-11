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
npx supabase start   # local Postgres + API in Docker; applies migrations + seed
npm run dev
```

`npx supabase start` prints the local `API URL` and `service_role` key — put
them in `.env.local` (copy `.env.example`) together with a `TEAM_PIN`.
Useful: Supabase Studio runs at http://127.0.0.1:54323, and
`npx supabase db reset` rebuilds the DB from migrations + seed.

Checks: `npm run lint`, `npx tsc --noEmit`, `npm test` (vitest unit tests for
the YouTube URL parser and timezone helper).

## Production setup (one-time)

1. **Supabase**: create a project (EU region), then run
   `supabase/migrations/0001_tables.sql` and `0002_views.sql` — in that order —
   in the SQL Editor. Optionally `seed.sql` for sample players.
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
