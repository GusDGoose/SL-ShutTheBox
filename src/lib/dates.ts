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

// Human-friendly date for headings, e.g. "tisdag 11 augusti".
export function stockholmDayLabel(date: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}
