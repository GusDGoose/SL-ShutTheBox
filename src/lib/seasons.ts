import { shiftDays } from "@/lib/dates";

/**
 * The office calendar: which seasonal board a given Stockholm day gets.
 *
 * [concept: traditions beat months] Every month has a base board, so the app
 * looks different at least twelve times a year. On top of that sit the Swedish
 * traditions the office actually keeps — Easter, Valborg, Midsommar, Lucia,
 * Christmas, New Year — and those win over the month they fall in. Several of
 * them move from year to year, so their dates are computed, not listed.
 *
 * Pure string arithmetic on `YYYY-MM-DD`, like the rest of src/lib/dates.ts:
 * no local timezone can shift the day.
 */
export const SEASONS = [
  "newyear",
  "frost",
  "valentine",
  "semla",
  "spring",
  "easter",
  "tulip",
  "valborg",
  "bloom",
  "nationalday",
  "midsommar",
  "summer",
  "kraftskiva",
  "harvest",
  "autumn",
  "halloween",
  "candlelight",
  "christmas",
  "lucia",
] as const;
export type Season = (typeof SEASONS)[number];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Easter Sunday for a Gregorian year (the anonymous computus). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Midsommarafton: the Friday between 19 and 25 June. */
export function midsummerEve(year: number): string {
  for (let day = 19; day <= 25; day++) {
    const date = `${year}-06-${pad(day)}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 5) return date;
  }
  // Unreachable: seven consecutive days always contain a Friday.
  throw new Error(`no Friday in 19–25 June ${year}`);
}

/** The seasonal board for a Stockholm day. Every day has exactly one. */
export function seasonFor(date: string): Season {
  const year = Number(date.slice(0, 4));
  const md = date.slice(5); // "MM-DD" compares correctly as a string

  // The fixed traditions around the turn of the year.
  if (md >= "12-27" || md <= "01-06") return "newyear";
  if (md === "12-13") return "lucia";
  if (md >= "11-22") return "christmas";
  if (md >= "10-24" && md <= "11-02") return "halloween";
  if (md >= "11-03") return "candlelight";

  // Påsk: Holy Week through Easter Monday.
  const easter = easterSunday(year);
  if (date >= shiftDays(easter, -6) && date <= shiftDays(easter, 1)) {
    return "easter";
  }
  if (md >= "04-24" && md <= "04-30") return "valborg";
  if (md === "06-06") return "nationalday";

  // Midsommar week, Monday to Sunday.
  const eve = midsummerEve(year);
  if (date >= shiftDays(eve, -4) && date <= shiftDays(eve, 2)) {
    return "midsommar";
  }

  // Otherwise, the month's own board.
  switch (date.slice(5, 7)) {
    case "01":
      return "frost";
    case "02":
      return md <= "02-14" ? "valentine" : "semla";
    case "03":
      return "spring";
    case "04":
      return "tulip";
    case "05":
      return "bloom";
    case "06":
    case "07":
      return "summer";
    case "08":
      return "kraftskiva";
    case "09":
      return "harvest";
    default:
      return "autumn"; // 1–23 October
  }
}
