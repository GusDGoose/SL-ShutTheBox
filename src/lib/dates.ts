// [concept: timezone-safe "today"] Servers (Vercel, Postgres) run on UTC, but
// the office lives in Europe/Stockholm. This is the ONLY way "today" may be
// computed in this app — the sv-SE locale conveniently formats as YYYY-MM-DD.
// The DB has the matching rule as the played_on column default.
export function stockholmToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Human-friendly date for headings, e.g. "Thursday 4 September".
// The UI is English throughout; only stockholmToday() uses sv-SE, and only
// because that locale happens to format as YYYY-MM-DD.
// Anchored at midday UTC so converting a bare date can't slip across a DST edge.
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * The ISO Monday of the week a `YYYY-MM-DD` date falls in.
 *
 * [concept: SQL twin] The rota is keyed by week, and the same answer has to
 * come out of `iso_monday()` in 0018 and out of here, or the page and the
 * cron would disagree about which week it is. Pure string arithmetic through
 * UTC — no local timezone can shift the day, which is the whole reason
 * stockholmToday returns a string in the first place.
 */
export function isoMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // getUTCDay: 0 = Sunday. ISO weeks start on Monday, so Sunday is 6 days in.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/** `days` after a `YYYY-MM-DD` date (negative goes back). */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
