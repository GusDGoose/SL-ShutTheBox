# Deltagartillstånd — the new-player intake flow

How a new colleague joins the daily game. A paper application ("blankett") is
filled in by hand, scanned, approved by the game master, and given a permit
number ("deltagartillstånd"). On approval a Power Automate flow puts them on the
roster, adds them to the Teams group, gets them onto the daily match invites and
sends a welcome with the PIN.

This runbook is the design and the build guide. It has two halves that meet at
one point:

- **The process** lives in Power Automate / SharePoint (the cloud). It owns the
  register of applications, the approval, the permit number and the onboarding.
- **The integration point** — putting the approved colleague on the roster —
  lives in this repo, because the app has no other way in. Everything else the
  flow does with Microsoft 365 tools it already has.

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
                      ├─ ⑧ HTTP POST → the app: create the player  ← this repo
                      └─ ⑨ Welcome email/Teams: number + PIN + /whoami link
```

Once the player row exists, the fika rota, the stats views and the season pick
them up automatically — there is no further step for any of that.

## The integration point — `POST /api/intake/player`

The one thing the flow cannot do with an off-the-shelf connector is add a row to
the `players` table. The app exposes a single machine endpoint for it, reached
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
| AppUserId | Single line | The `id` the endpoint returns, stored for traceability |

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
| ⑧ | *HTTP* (premium) → `POST /api/intake/player` | Body `{ name, emoji, permit_no }`. Put the `Authorization` header value under **Settings → Secure inputs** so the secret never shows in run history. Store the returned `id` back into the register (`AppUserId`). |
| ⑨ | *Send an email (V2)* or Teams *Post message in a chat* | Permit number + the team PIN + a link to `<app-url>/whoami` so they can pick who they are. Optionally include the match join links as a fallback. |

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

Because the matches are Teams meetings with a join link, step ⑨'s welcome can
also carry the join links directly, so the new player can join the first match
even before the calendar update has propagated.

## Setup checklist

1. `INTAKE_SECRET` set on Vercel (Production), app redeployed.
2. SharePoint register list created with the columns above.
3. The game's Teams group id and the new-member action tested.
4. The weekday match-series event ids collected (low-code route), or the Entra
   app registered and consented (Graph route).
5. Gustav a co-owner of the flow (so the calendar and Teams steps keep working).
6. A test run end to end against a throwaway name, then that test player benched
   or deleted from the app afterwards.

## Testing the endpoint directly

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
