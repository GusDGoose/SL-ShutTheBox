# One counted game per day, enforced by the database

On 2026-10-01 and 2026-10-05 a shut box on the second turn ended the game under the old
instant-win rule. The players who never got a turn then played a second game the same day, and
that game counted as a separate win, Elo update and Teams card. So from 2026-10-05 a shut box no
longer ends the game, and at most one game counts per Stockholm day. A counted game is one that is
finished and not deleted. Abandoned games and team play are unaffected.

The rule lives in Postgres, not in the app:

- A partial unique index, `games_one_counted_per_day`, does the enforcing.
- `assert_day_free` runs in every write that can make a game count and raises STB13 (the day
  already has its game) or STB14 (a game is being played that day). The id of the game holding
  the day goes in DETAIL.

Every derived number (wins, Elo, streaks, fika) is computed from `games`. A rule that only the UI
knew about would be bypassed by a race between two phones, an after-the-fact entry, a restore or
an undo, and each of those would quietly count twice.

## Considered options

- **Convention only:** remove "Start another game" and change the copy. Rejected, because the
  stats would drift as soon as anything got around the UI.
- **Counting only the day's first game in the views:** rejected, because it would rewrite every
  view and still leave uncounted games around to confuse the history.

## Consequences

- There is no "play again". A mistaken game is deleted, and the day is then free for the real one.
- Of two games live on the same day, the second to finish is refused and stays in progress until
  someone abandons it.
- The three days in production that already held two games (2026-09-09, 2026-10-01 and
  2026-10-05) were merged by `scripts/fixes/2026-10-05-merge-split-days.sql` before the index
  could exist. In each, the first game is kept: its boxed-out rows take their scores from the
  later game, and players who were only in the later game are added as late joiners.
