/**
 * Months as `YYYY-MM` strings — the unit the history is browsed in.
 *
 * Strings rather than Dates on purpose: a month has no timezone, and the one
 * time this app turned a bare date into a Date it slipped a day across a DST
 * edge. Everything here is arithmetic on the two numbers in the string.
 */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The month a `YYYY-MM-DD` date falls in. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Whether a route segment is a month at all — `2026-13` and `2026-9` are not. */
export function isMonth(s: string): boolean {
  return MONTH.test(s);
}

/** First and last day of the month, as `played_on` values to filter by. */
export function monthBounds(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number) as [number, number];
  // Day 0 of the following month is the last day of this one — the calendar
  // does the leap-year arithmetic so this file does not have to.
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** The month `by` steps away, crossing years as needed. */
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(year, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "September 2026" — a heading, in the app's English. */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00Z`));
}
