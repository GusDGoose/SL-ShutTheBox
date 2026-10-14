# Deltagartillstånd — the new-player intake flow

How a new colleague joins the daily game. A paper application ("blankett") is
filled in by hand, scanned, approved by the game master, and given a permit
number ("deltagartillstånd"). On approval a Power Automate flow adds them to the
Teams group, gets them onto the daily match invites and sends a welcome with the
PIN and a link that puts them on the roster in one click.

This runbook is the design and the build guide.

- **The process** lives in Power Automate / SharePoint (the cloud). It owns the
  register of applications, the approval, the permit number and the onboarding.
  Every step uses **standard** connectors — no Power Automate Premium licence.
- **Joining the roster** happens in the app, by the new colleague: the welcome
  link opens `/players` with their name and emoji already filled in, and they
  press "Add player". This is the same self-service path any colleague has
  always used (`createPlayer`, PIN only), so the flow needs no secret and no
  HTTP action.
- **Optional, Premium only:** a machine endpoint (`POST /api/intake/player`)
  lets the flow add the player itself instead. See
  [The Premium alternative](#the-premium-alternative--post-apiintakeplayer).

```
① Scanned blankett (PDF/image) lands in a mailbox or SharePoint folder
        │
        ▼
② Power Automate trigger → create row in SharePoint register ("Inkommen")
        │
        ▼
③ Approval (Approvals → the game master) — applicant's details typed in here
        │
   ┌────┴──────────────┐
 Reject             Approve
   │                   │
 Email w. reason      ├─ ④ Assign permit number:  SL-STB-2026-0001
                      ├─ ⑤ Update register (Beviljad, number, date, approver)
                      ├─ ⑥ Add to the Teams group   (Teams · Add a member to a team)
                      ├─ ⑦ Add to the daily match series (Gustav's calendar)
                      └─ ⑧ Welcome email/Teams: number + PIN + prefilled join link
                              │
                              ▼
                        The colleague opens the link, enters the PIN,
                        presses "Add player", then picks their name  ← the app
```

Once the player row exists, the fika rota, the stats views and the season pick
them up automatically — there is no further step for any of that.

## The welcome link

```
https://sl-shut-the-box-opal.vercel.app/players?add&name=<name>&emoji=<emoji>
```

- `add` opens the "Add a player" form; `name` and `emoji` fill it in
  (`readPlayerPrefill` in `src/lib/player-prefill.ts`). Both are optional — a
  bare `/players?add` is an empty form.
- Build it in the flow with `encodeUriComponent()` on both values, e.g.
  `concat('https://sl-shut-the-box-opal.vercel.app/players?add&name=',
  encodeUriComponent(<name>), '&emoji=', encodeUriComponent(<emoji>))`.
- On a device without the PIN cookie, the proxy sends them to `/pin` first and
  back to the same link afterwards, query string and all.
- The values are only a starting point: the colleague can fix their name before
  pressing "Add player", and `createPlayer` validates whatever is submitted.
  A name already on the roster reads as "already on the roster" in the form.

What this path does not record is the permit number in the app's `audit_log`.
It lives in the SharePoint register, which owns it anyway.

## The Premium alternative — `POST /api/intake/player`

Only if the flow owner has a Power Automate Premium licence (the *HTTP* action
is a Premium connector) and you want the flow, not the colleague, to create the
player. It replaces the link-click; everything else stays the same.

The app exposes a single machine endpoint for it, reached
with a bearer secret instead of the PIN cookie — the same machine-to-machine
pattern the scheduled Teams jobs use (`/api/cron/*`, `requireCron`).

- Route: `src/app/api/intake/player/route.ts`
- Auth: `requireIntake` in `src/lib/auth.ts`, which checks
  `Authorization: Bearer <INTAKE_SECRET>` in constant time.
- It mirrors the in-app `createPlayer` (`src/app/(shell)/players/actions.ts`):
  **name and emoji only**. The song is each player's own to set later, on their
  profile, once they have said who they are.

```http
POST https://<app-url>/api/intake/player
Authorization: Bearer <INTAKE_SECRET>
Content-Type: application/json

{ "name": "Ada Lovelace", "emoji": "🎲", "permit_no": "SL-STB-2026-0001" }
```

| Response | When |
|---|---|
| `201 { id, name, emoji, permit_no }` | Player created |
| `400 { error }` | Body is not JSON, or `name` is missing |
| `401 { error }` | Secret missing or wrong (or `INTAKE_SECRET` not set) |
| `409 { error }` | A player with that name is already on the roster. Either a re-run of the same application, or a *different* colleague with the same name — the flow cannot tell which and gets no `id` to store, so route it to the game master for a manual look rather than treating it as success |
| `500 { error }` | Any other database error |

### Why the permit number is not a column

The register of applications lives in SharePoint and owns the number. The app
only needs the roster row, so adding a `permit_no` column would be a schema
migration (and a `database.types.ts` regen) for a value the app never queries.
Instead the endpoint records it in `audit_log` — the table built for exactly
this — as a `player.create` action with a `null` actor (the system did it, the
same convention the cron jobs follow) and the number in the note:

```sql
select at, note from audit_log
 where action = 'player.create' and note like 'added via deltagartillstånd%'
 order by at desc;
```

So "who was added, and under which permit" is answerable in plain SQL without a
schema change.

### Secret and deployment

- Add `INTAKE_SECRET` to Vercel → Project → Settings → Environment Variables.
  Generate it with `openssl rand -hex 32`. Env var changes need a redeploy.
- It is **separate from `CRON_SECRET` on purpose**: a flow that can add players
  should not also be able to drive the Teams jobs, and vice versa. A leak of one
  must not grant the other.
- **Production only.** Preview deployments share the same Supabase project (see
  the README's note on the Teams webhook), so an `INTAKE_SECRET` on Preview
  would let a test call write a real player into the real roster. Set it on
  Production and leave Preview without it.

## The SharePoint register

One list, which doubles as the register/diary ("diarium") and the flow's memory.

| Column | Type | Notes |
|---|---|---|
| Title | Single line | Applicant's name (typed at approval) |
| Emoji | Single line | Optional; defaults to 🎲 |
| Scan | Attachment / file | The scanned blankett |
| Status | Choice | `Inkommen` · `Beviljad` · `Avslagen` |
| PermitNo | Single line | `SL-STB-2026-0001`, set on approval |
| DecisionDate | Date | Set on approval/rejection |
| Approver | Person | The game master |
| AppUserId | Single line | Premium variant only: the `id` the endpoint returns |

## The Power Automate flow, step by step

| # | Action | Configuration |
|---|---|---|
| ① | **Trigger** — *When a new email arrives (V3)* on a shared mailbox, **or** *When a file is created* in a SharePoint folder | Scan the blankett to whichever one you choose. A scanner that emails or one that drops to OneDrive/SharePoint both work. |
| ② | SharePoint *Create item* in the register | Save the scan as an attachment; `Status = Inkommen`. |
| ③ | Approvals *Start and wait for an approval* → **Approve/Reject** | Assign to the game master. The applicant's name and emoji are **typed in here** (manual on purpose — a handwritten paper form is not worth AI Builder's cost or its trouble with handwriting). Put them in the approval's response fields, or have the approver edit the register item, then read them back. |
| ④ | *Get items* (register, this year, approved) then *Compose* the number | See the expression below. |
| ⑤ | SharePoint *Update item* | `Status = Beviljad`, `PermitNo`, `DecisionDate`, `Approver`. |
| ⑥ | Teams *Add a member to a team* | The game's Teams group + the new colleague's account. |
| ⑦ | Add to the daily match series | See "The match invites" below. |
| ⑧ | *Send an email (V2)* or Teams *Post message in a chat* | Permit number + the team PIN + the [welcome link](#the-welcome-link), with a line like *"Open the link, enter the PIN, press Add player, then pick your name."* Optionally include the match join links as a fallback. |

Premium variant: insert an *HTTP* → `POST /api/intake/player` step before ⑧
(body `{ name, emoji, permit_no }`, `Authorization` header under **Settings →
Secure inputs**, returned `id` into `AppUserId`), and link the welcome to
`/whoami` instead of `/players`.

On the Reject branch: *Update item* `Status = Avslagen` + `DecisionDate`, then
email the applicant the reason from the approval.

### The permit number

Auto running number, reset per year, zero-padded. After a *Get items* on the
register filtered to the current year and `Status eq 'Beviljad'` (name it
`Get_items_this_year`), compose:

```
concat(
  'SL-STB-',
  formatDateTime(convertTimeZone(utcNow(),'UTC','W. Europe Standard Time'),'yyyy'),
  '-',
  formatNumber(add(length(body('Get_items_this_year')?['value']), 1), '0000')
)
```

`convertTimeZone` keeps the year correct across the New Year boundary. Step ④
counts *before* step ⑤ marks this application `Beviljad`, so it is not in the
count yet and the first grant of the year is `0001`.

Concurrency note: counting approved rows assumes approvals happen one at a time,
which for an office game they do. If two were ever approved in the same second,
use the SharePoint item `ID` (always unique, never reused) instead — the one
step ② *Create item* returned, not the trigger's (the email trigger has none):
`SL-STB-<year>-` padded with `formatNumber(outputs('Create_item')?['body/ID'], '0000')`.

### The match invites

Gustav's matches are ordinary **recurring Outlook/Teams calendar series** that
he organizes — one per weekday (e.g. "SHUT THE BOX x Fika", every Wednesday
14:00–14:15, organizer Gustav). The app's own schedule is Monday–Tuesday 12:45
and Wednesday–Friday 14:00 (Europe/Stockholm). Only the **organizer** can add an
attendee to a series, so this step must run under Gustav's connection.

Two ways to build it:

- **Low-code (recommended).** For each weekday series, *Get event (V4)* by event
  id → append the new colleague to the optional attendees → *Update event (V4)*.
  The update sends the meeting invite to the new attendee — that *is* the
  invitation going out. Capture the series' event ids once (they are fixed) and
  keep them in a small SharePoint "Match series" list the flow reads.
  **Ownership gotcha:** this step needs a connection Gustav has authorized —
  easiest if Gustav co-owns the flow. This is the same gotcha the README calls
  out for the Teams-webhook flow: a flow runs as whoever owns its connections,
  and dies with that person's account unless someone else co-owns it.

- **Graph (more robust).** An *HTTP* action to Microsoft Graph
  `POST /users/{gustav}/events/{id}/forward` forwards the whole series to the new
  colleague without rewriting Gustav's attendee list. Needs an Entra app
  registration with `Calendars.ReadWrite` application permission and admin
  consent. Cleaner semantics, more setup.

Because the matches are Teams meetings with a join link, step ⑧'s welcome can
also carry the join links directly, so the new player can join the first match
even before the calendar update has propagated.

## Setup checklist

1. SharePoint register list created with the columns above.
2. The game's Teams group id and the new-member action tested.
3. The weekday match-series event ids collected (low-code route), or the Entra
   app registered and consented (Graph route).
4. Gustav a co-owner of the flow (so the calendar and Teams steps keep working).
5. A test run end to end against a throwaway name: open the welcome link on a
   phone, add the player, then bench or delete that test player afterwards.
6. Premium variant only: `INTAKE_SECRET` is already on Vercel (Production, set
   2026-10-14); the flow owner needs its value for the HTTP step.

## Testing the endpoint directly (Premium variant)

With the local stack running (`npm run db:start`) and `INTAKE_SECRET` in
`.env.local`:

```bash
curl -sS -X POST http://localhost:3000/api/intake/player \
  -H "Authorization: Bearer $INTAKE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Testsson","emoji":"🧪","permit_no":"SL-STB-2026-9999"}'
```

Expect `201` with the new `id`. A second identical call returns `409`. A call
with a wrong or missing `Authorization` header returns `401`.
